
import React, { useState, useEffect, useMemo } from 'react';
import { addDoc, collection, query, orderBy, limit, getDocs, where, setDoc, doc, updateDoc, increment, getDoc, deleteDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { ActivityLog, VillageType, FinancialRecord, ProcessingLog } from '../../types';
import { MUSHROOM_PRICES } from '../../constants';

interface ExtendedActivityLog extends ActivityLog {
    totalWastage?: number;
    stepsCompleted?: string[];
}

interface FarmingTabProps {
  villageId: VillageType;
  userEmail: string;
  theme: any;
  farmingLogs: ActivityLog[]; // Props from dashboard (recent logs)
  onActivityLogged?: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

/**
 * AUTOMATED DEDUCTION RECIPES (Per 1kg of Predicted Mushroom Yield)
 * Values represent requirements for ONE kg of output.
 */
const ACTIVITY_RECIPES: Record<string, { id: string, name: string, perKgAmount: number }[]> = {
    'SUBSTRATE_PREP': [
        { id: "MAT-573260995", name: "Straw", perKgAmount: 20 },
        { id: "MAT-545594408", name: "Water", perKgAmount: 50 },
    ],
    'SUBSTRATE_MIXING': [
        { id: "MAT-406637503", name: "Bran", perKgAmount: 0.5 },
        { id: "MAT-446059102", name: "Gypsum", perKgAmount: 0.2 },
    ],
    'SPAWNING': [
        { id: "MAT-282015830", name: "Spawn", perKgAmount: 1 },
    ],
    'HUMIDITY_CONTROL': [
        { id: "MAT-545594408", name: "Water", perKgAmount: 5 },
    ],
    'FLUSH_REHYDRATION': [
        { id: "MAT-545594408", name: "Water", perKgAmount: 20 },
    ]
};

export const FarmingTab: React.FC<FarmingTabProps> = ({ 
    villageId, userEmail, theme, farmingLogs: recentLogs, onActivityLogged, onSuccess, onError 
}) => {
  // --- Helpers ---
  const getCollectionName = (vid: VillageType) => {
    if (vid === VillageType.A) return "dailyfarming_logA";
    if (vid === VillageType.B) return "dailyfarming_logB";
    return "farmingActivities"; 
  };
  
  const getResourceColName = (vid: VillageType) => {
    if (vid === VillageType.A) return "resourcesA";
    if (vid === VillageType.B) return "resourcesB";
    return "resourcesA";
  };

  const collectionName = getCollectionName(villageId);

  // --- View State ---
  const [viewMode, setViewMode] = useState<'REGISTRY' | 'PRODUCTIVITY'>('REGISTRY');
  const [reportType, setReportType] = useState<'BATCH' | 'MONTHLY' | 'PREDICTION'>('BATCH');
  const [productionPeriod, setProductionPeriod] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY'>('DAILY');

  // --- State for Activity Form ---
  const [activityType, setActivityType] = useState<string>('SUBSTRATE_PREP');
  const [activityBatchId, setActivityBatchId] = useState('');
  const [activityNotes, setActivityNotes] = useState('');
  const [batchStrain, setBatchStrain] = useState('Oyster'); 
  const [predictedYield, setPredictedYield] = useState(''); 
  const [isSubmittingActivity, setIsSubmittingActivity] = useState(false);
  const [availableBatches, setAvailableBatches] = useState<string[]>([]);

  // --- State for Harvest Form ---
  const [harvestBatch, setHarvestBatch] = useState('');
  const [harvestWeight, setHarvestWeight] = useState('');
  const [harvestStrain, setHarvestStrain] = useState('Oyster');
  const [isSubmittingHarvest, setIsSubmittingHarvest] = useState(false);

  // --- State for Wastage Form ---
  const [wastageBatchId, setWastageBatchId] = useState('');
  const [wastageWeight, setWastageWeight] = useState('');
  const [wastageReason, setWastageReason] = useState('Contamination');
  const [isSubmittingWastage, setIsSubmittingWastage] = useState(false);
  const [recordedWastageList, setRecordedWastageList] = useState<any[]>([]);
  const [editingWastageId, setEditingWastageId] = useState<string | null>(null);
  const [originalWastageWeight, setOriginalWastageWeight] = useState<number | null>(null);

  // --- State for History Table (Batches) ---
  const [batchList, setBatchList] = useState<ExtendedActivityLog[]>([]);
  const [isLoadingBatches, setIsLoadingBatches] = useState(false);
  const [filterStartDate, setFilterStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30); 
    return d.toISOString().split('T')[0];
  });
  const [filterEndDate, setFilterEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  
  // New Filter States
  const [filterStrain, setFilterStrain] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');

  // --- State for Batch Details ---
  const [selectedBatch, setSelectedBatch] = useState<ExtendedActivityLog | null>(null);
  const [batchActivities, setBatchActivities] = useState<ActivityLog[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isEditingBatch, setIsEditingBatch] = useState(false);
  const [editBatchStrain, setEditBatchStrain] = useState('');
  const [editBatchDetails, setEditBatchDetails] = useState('');
  const [editBatchYield, setEditBatchYield] = useState(''); 
  const [editBatchPredictedYield, setEditBatchPredictedYield] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // --- State for Productivity ---
  const [dailyProductionData, setDailyProductionData] = useState<{date: string, weight: number}[]>([]);
  const [isLoadingProductivity, setIsLoadingProductivity] = useState(false);

  useEffect(() => {
      const fetchBatchOptions = async () => {
          try {
              const q = query(
                  collection(db, collectionName), 
                  orderBy("timestamp", "desc"),
                  limit(150) 
              );
              const snapshot = await getDocs(q);
              const batches = new Set<string>();
              
              snapshot.forEach(doc => {
                  const data = doc.data();
                  const predicted = data.predictedYield || 0;
                  const actual = data.totalYield || 0;
                  const wastage = data.totalWastage || 0;
                  const totalOutput = actual + wastage;
                  
                  // Requirement: Must complete Spawning before weigh-in
                  const steps = data.stepsCompleted || [];
                  const isSpawningDone = steps.includes('SPAWNING');

                  if (isSpawningDone && (predicted === 0 || totalOutput < predicted)) {
                      batches.add(doc.id);
                  }
              });
              setAvailableBatches(Array.from(batches));
          } catch (e) {
              console.warn("Could not fetch batch options:", e);
          }
      };
      
      if (collectionName) fetchBatchOptions();
  }, [collectionName, isSubmittingActivity, isSubmittingHarvest, isSubmittingWastage, villageId]);

  useEffect(() => {
      if (activityType === 'SUBSTRATE_PREP') {
          const today = new Date();
          const dateStr = today.toISOString().slice(2, 10).replace(/-/g, '');
          const random = Math.floor(1000 + Math.random() * 9000);
          setActivityBatchId(`B${dateStr}-${random}`);
      } else {
          setActivityBatchId('');
      }
  }, [activityType]);

  useEffect(() => {
      const populateStrain = async () => {
          if (!harvestBatch) return;
          const localBatch = batchList.find(b => b.id === harvestBatch || b.batchId === harvestBatch);
          if (localBatch?.mushroomStrain) {
              setHarvestStrain(localBatch.mushroomStrain);
              return;
          }
          try {
              const docRef = doc(db, collectionName, harvestBatch);
              const docSnap = await getDoc(docRef);
              if (docSnap.exists()) {
                   const data = docSnap.data();
                   if (data.mushroomStrain) setHarvestStrain(data.mushroomStrain);
              }
          } catch (e) {
              console.warn("Could not auto-fetch strain details", e);
          }
      };
      populateStrain();
  }, [harvestBatch, collectionName, batchList]);

  useEffect(() => {
    fetchBatches();
    fetchRecordedWastage();
  }, [villageId, filterStartDate, filterEndDate, collectionName]);

  const fetchBatches = async () => {
    setIsLoadingBatches(true);
    try {
        const start = new Date(filterStartDate);
        const end = new Date(filterEndDate);
        end.setHours(23, 59, 59, 999);
        const q = query(collection(db, collectionName), where("timestamp", ">=", start.toISOString()), where("timestamp", "<=", end.toISOString()), orderBy("timestamp", "desc"), limit(100));
        const snapshot = await getDocs(q);
        const logs: ExtendedActivityLog[] = [];
        snapshot.forEach(doc => { logs.push({ id: doc.id, ...doc.data() as ExtendedActivityLog }); });
        setBatchList(logs);
    } catch (error) {
        console.error("Error fetching batches:", error);
    } finally {
        setIsLoadingBatches(false);
    }
  };

  // --- Filtering Logic for Registry ---
  const filteredRegistryList = useMemo(() => {
    return batchList.filter(batch => {
        // Strain Filter
        if (filterStrain !== 'All' && batch.mushroomStrain !== filterStrain) return false;
        
        // Status Filter
        if (filterStatus !== 'All') {
            const predicted = batch.predictedYield || 0;
            const actual = batch.totalYield || 0;
            const wastage = batch.totalWastage || 0;
            const totalOutput = actual + wastage;
            
            let status = 'In Progress';
            if (predicted > 0 && totalOutput >= predicted) {
                status = 'Completed';
            }
            
            if (filterStatus !== status) return false;
        }
        
        return true;
    });
  }, [batchList, filterStrain, filterStatus]);

  const fetchRecordedWastage = async () => {
      try {
        const colName = villageId === VillageType.A ? "farmingwastage_A" : villageId === VillageType.B ? "farmingwastage_B" : null;
        if (!colName) return;
        const start = new Date(filterStartDate);
        const end = new Date(filterEndDate);
        end.setHours(23, 59, 59, 999);
        const q = query(collection(db, colName), where("timestamp", ">=", start.toISOString()), where("timestamp", "<=", end.toISOString()), orderBy("timestamp", "desc"));
        const snap = await getDocs(q);
        const logs = snap.docs.map(doc => ({id: doc.id, ...doc.data()}));
        setRecordedWastageList(logs);
      } catch(e) {
          console.error("Error fetching wastage logs", e);
      }
  };

  const fetchProductivityData = async () => {
      if (batchList.length === 0) return;
      setIsLoadingProductivity(true);
      try {
          const dailyMap = new Map<string, number>();
          const promises = batchList.map(async (batch) => {
             if (!batch.id) return;
             const subColRef = collection(db, collectionName, batch.id, "activity_logs");
             const q = query(subColRef, where('type', '==', 'HARVEST'));
             const snap = await getDocs(q);
             snap.forEach(doc => {
                 const data = doc.data();
                 if (data.timestamp && data.totalYield) { 
                     const dateKey = new Date(data.timestamp).toISOString().split('T')[0];
                     const current = dailyMap.get(dateKey) || 0;
                     dailyMap.set(dateKey, current + (data.totalYield || 0));
                 }
             });
          });
          await Promise.all(promises);
          const sortedData = Array.from(dailyMap.entries()).map(([date, weight]) => ({ date, weight })).sort((a, b) => a.date.localeCompare(b.date));
          setDailyProductionData(sortedData);
      } catch (e) {
          console.error("Error calculating productivity", e);
          onError("Failed to load detailed productivity logs.");
      } finally {
          setIsLoadingProductivity(false);
      }
  };

  useEffect(() => {
      if (viewMode === 'PRODUCTIVITY') fetchProductivityData();
  }, [viewMode, batchList]);

  // --- Automatic Resource Deduction Helper ---
  const performAutoDeduction = async (materialId: string, amount: number, activityName: string, batchId: string) => {
      const resCol = getResourceColName(villageId);
      const resRef = doc(db, resCol, materialId);
      try {
          const docSnap = await getDoc(resRef);
          if (!docSnap.exists()) {
              console.warn(`Auto-deduction skipped: ${materialId} not found in ${resCol}`);
              return;
          }
          await updateDoc(resRef, {
              quantity: increment(-amount),
              updatedAt: new Date().toISOString()
          });
          await addDoc(collection(db, resCol, materialId, "stock_history"), {
              type: 'OUT', 
              quantity: amount,
              reason: `Auto-Deduction: ${activityName} (Batch ${batchId})`,
              user: 'System/Automation',
              timestamp: new Date().toISOString()
          });
      } catch (e) {
          console.error(`Auto-deduction failed for ${materialId}`, e);
      }
  };

  const handleLogActivity = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSubmittingActivity(true);
      try {
          const finalBatchId = activityBatchId.trim();
          const newLog: any = {
              type: activityType as any,
              details: activityNotes,
              userEmail: userEmail,
              timestamp: new Date().toISOString(),
              villageId: villageId,
              batchId: finalBatchId,
          };
          
          let yieldMultiplier = 0;

          if (activityType === 'SUBSTRATE_PREP') {
              if (!predictedYield || parseFloat(predictedYield) <= 0) {
                  throw new Error("Predicted yield is required for Substrate Prep.");
              }
              newLog.mushroomStrain = batchStrain;
              yieldMultiplier = parseFloat(predictedYield) || 0;
              newLog.predictedYield = yieldMultiplier;
              newLog.stepsCompleted = ['SUBSTRATE_PREP']; // Initialize steps tracking
              
              if (!finalBatchId) throw new Error("Batch ID is required for Substrate Prep");
              await setDoc(doc(db, collectionName, finalBatchId), newLog);
              
              const recipe = ACTIVITY_RECIPES[activityType] || [];
              for (const item of recipe) {
                  const totalDeduct = item.perKgAmount * yieldMultiplier;
                  if (totalDeduct > 0) {
                    await performAutoDeduction(item.id, totalDeduct, "Substrate Prep", finalBatchId);
                  }
              }
              onSuccess(`Batch created. ${yieldMultiplier}kg capacity materials deducted.`);
          } else {
              if (!finalBatchId) {
                  onError("Please select a Batch ID to log this activity.");
                  setIsSubmittingActivity(false);
                  return;
              }

              // --- Sequential Workflow Logic ---
              const batchRef = doc(db, collectionName, finalBatchId);
              const batchSnap = await getDoc(batchRef);
              if (!batchSnap.exists()) throw new Error("Batch record not found.");
              const batchData = batchSnap.data();
              const completedSteps = batchData.stepsCompleted || [];

              if (activityType === 'SUBSTRATE_MIXING') {
                  if (!completedSteps.includes('SUBSTRATE_PREP')) {
                      throw new Error("Must complete Substrate Prep before Substrate Mixing.");
                  }
                  await updateDoc(batchRef, { stepsCompleted: arrayUnion('SUBSTRATE_MIXING') });
              } else if (activityType === 'SPAWNING') {
                  if (!completedSteps.includes('SUBSTRATE_MIXING')) {
                      throw new Error("Must complete Substrate Mixing before Spawning.");
                  }
                  await updateDoc(batchRef, { stepsCompleted: arrayUnion('SPAWNING') });
              }

              // Fetch the batch's predicted yield for the multiplier
              yieldMultiplier = batchData.predictedYield || 0;

              await addDoc(collection(db, collectionName, finalBatchId, "activity_logs"), newLog);
              
              const recipe = ACTIVITY_RECIPES[activityType] || [];
              if (recipe.length > 0) {
                  for (const item of recipe) {
                      const totalDeduct = item.perKgAmount * yieldMultiplier;
                      if (totalDeduct > 0) {
                        await performAutoDeduction(item.id, totalDeduct, activityType.replace('_', ' '), finalBatchId);
                      }
                  }
                  onSuccess(`${activityType.replace('_', ' ')} logged. Materials deducted for ${yieldMultiplier}kg capacity.`);
              } else {
                  onSuccess("Activity logged successfully.");
              }
          }
          
          setActivityNotes('');
          setPredictedYield(''); 
          
          if (activityType === 'SUBSTRATE_PREP') {
              const today = new Date();
              const dateStr = today.toISOString().slice(2, 10).replace(/-/g, '');
              const random = Math.floor(1000 + Math.random() * 9000);
              setActivityBatchId(`B${dateStr}-${random}`);
          } else {
              setActivityBatchId('');
          }

          fetchBatches();
          if (onActivityLogged) onActivityLogged();
      } catch (error: any) {
          console.error("Error logging activity", error);
          onError(error.message);
      } finally {
          setIsSubmittingActivity(false);
      }
  };

  const handleLogHarvest = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSubmittingHarvest(true);
      try {
          const weight = parseFloat(harvestWeight);
          const harvestCollection = villageId === VillageType.A ? "harvestYield_A" : villageId === VillageType.B ? "harvestYield_B" : null;
          if (!harvestCollection) throw new Error("Invalid village for harvest logging");
          
          const timestamp = new Date().toISOString();
          const harvestDocRef = doc(db, harvestCollection, harvestBatch);
          
          // 1. Log Harvest Yield
          await setDoc(harvestDocRef, { batchId: harvestBatch, strain: harvestStrain, totalYield: increment(weight), lastRecordedBy: userEmail, timestamp, villageId }, { merge: true });
          
          if (harvestBatch) {
              await updateDoc(doc(db, collectionName, harvestBatch), { totalYield: increment(weight) });
              await addDoc(collection(db, collectionName, harvestBatch, "activity_logs"), { type: 'HARVEST', details: `Harvested ${weight}kg of ${harvestStrain}`, userEmail, timestamp, villageId, batchId: harvestBatch, totalYield: weight });
          }

          // 2. AUTOGENERATE FINANCIAL SALES TRANSACTION (for A and B)
          const pricePerKg = MUSHROOM_PRICES[harvestStrain] || 10;
          const totalSaleAmount = weight * pricePerKg;
          const finColName = villageId === VillageType.A ? "financialRecords_A" : "financialRecords_B";
          const transactionId = "TXN-SALE-" + Date.now().toString().slice(-6);
          
          const saleRecord: Partial<FinancialRecord> = {
            transactionId,
            type: 'INCOME',
            category: 'Sales',
            amount: totalSaleAmount,
            weightKg: weight,
            date: new Date().toISOString().split('T')[0],
            batchId: harvestBatch,
            description: `Auto-generated sale from harvest: ${weight}kg of ${harvestStrain} @ RM${pricePerKg}/kg`,
            recordedBy: 'System/Automation',
            villageId: villageId,
            status: 'PENDING', // Initialized as pending to allow manual payment receipt confirmation
            createdAt: timestamp
          };
          await setDoc(doc(db, finColName, transactionId), saleRecord);

          // 3. VILLAGE C LINKAGE: Create processing intake log automatically
          const intakeBatchId = `C-INT-${harvestBatch}-${Date.now().toString().slice(-4)}`;
          const packagingDueTime = new Date(new Date().getTime() + 2 * 3600000).toISOString();
          
          const processingIntake: Omit<ProcessingLog, 'id'> = {
              batchId: harvestBatch, // Use the actual farm batch ID for tracking
              harvestId: harvestBatch,
              sourceVillage: villageId,
              mushroomType: harvestStrain,
              statedWeight: weight,
              actualWeight: weight, // Auto-synced for now
              variance: 0,
              receivedBy: 'Village Hub Automation',
              intakeTimestamp: timestamp,
              packagingDueTime,
              status: 'IN_PROGRESS',
              currentStep: 2, // Moves directly to QC
              villageId: VillageType.C,
              timestamp: timestamp,
              hasImageEvidence: false
          };
          
          await addDoc(collection(db, "processing_logs"), processingIntake);

          setHarvestBatch('');
          setHarvestWeight('');
          onSuccess(`Harvest recorded. RM${totalSaleAmount.toFixed(2)} sale generated & synced to Village C Hub.`);
          fetchBatches(); 
          if (onActivityLogged) onActivityLogged();
      } catch (error: any) {
          console.error("Error logging harvest", error);
          onError("Failed to record harvest: " + error.message);
      } finally {
          setIsSubmittingHarvest(false);
      }
  };

  const handleLogWastage = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSubmittingWastage(true);
      const colName = villageId === VillageType.A ? "farmingwastage_A" : villageId === VillageType.B ? "farmingwastage_B" : null;
      if (!colName) { onError("Wastage logging not supported for this village."); setIsSubmittingWastage(false); return; }
      try {
          const weight = parseFloat(wastageWeight);
          if (editingWastageId) {
              await updateDoc(doc(db, colName, editingWastageId), { batchId: wastageBatchId, weightKg: weight, reason: wastageReason, updatedBy: userEmail, updatedAt: new Date().toISOString() });
              if (originalWastageWeight !== null && wastageBatchId) {
                  const diff = weight - originalWastageWeight;
                  if (diff !== 0) await updateDoc(doc(db, collectionName, wastageBatchId), { totalWastage: increment(diff) });
              }
              onSuccess("Wastage record updated successfully.");
              setEditingWastageId(null);
              setOriginalWastageWeight(null);
          } else {
              await addDoc(collection(db, colName), { batchId: wastageBatchId, weightKg: weight, reason: wastageReason, recordedBy: userEmail, timestamp: new Date().toISOString(), villageId });
              if (wastageBatchId) {
                   await updateDoc(doc(db, collectionName, wastageBatchId), { totalWastage: increment(weight) });
                   await addDoc(collection(db, collectionName, wastageBatchId, "activity_logs"), { type: 'OTHER', details: `Wastage Recorded: ${wastageWeight}kg due to ${wastageReason}`, userEmail, timestamp: new Date().toISOString(), villageId, batchId: wastageBatchId });
              }
              onSuccess("Wastage recorded successfully.");
          }
          setWastageBatchId(''); setWastageWeight(''); setWastageReason('Contamination');
          fetchRecordedWastage(); fetchBatches(); 
      } catch(e: any) {
          onError("Failed to record wastage: " + e.message);
      } finally {
          setIsSubmittingWastage(false);
      }
  };
  
  const handleEditWastage = (log: any) => {
      setEditingWastageId(log.id);
      setWastageBatchId(log.batchId);
      setWastageWeight((log.weightKg ?? 0).toString());
      setWastageReason(log.reason);
      setOriginalWastageWeight(log.weightKg);
  };
  
  const handleCancelWastageEdit = () => {
      setEditingWastageId(null); setOriginalWastageWeight(null); setWastageBatchId(''); setWastageWeight(''); setWastageReason('Contamination');
  };

  const handlePrintWastageReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const totalWeight = recordedWastageList.reduce((acc, curr) => acc + curr.weightKg, 0);
    const reasonSummary: Record<string, number> = {};
    recordedWastageList.forEach(log => {
      reasonSummary[log.reason] = (reasonSummary[log.reason] || 0) + log.weightKg;
    });

    const rowsHtml = recordedWastageList.map(log => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${new Date(log.timestamp).toLocaleDateString()}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">${log.batchId}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${log.reason}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${(log.weightKg || 0).toFixed(2)} kg</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; font-size: 10px;">${log.recordedBy}</td>
      </tr>
    `).join('');

    const summaryHtml = Object.entries(reasonSummary).map(([reason, weight]) => `
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 12px;">
        <span>${reason}:</span>
        <span style="font-weight: bold;">${weight.toFixed(2)} kg</span>
      </div>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Wastage Report - ${villageId}</title>
          <style>
            body { font-family: 'Inter', sans-serif; padding: 40px; color: #333; line-height: 1.6; }
            .header { border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-end; }
            .title { font-size: 24px; font-weight: bold; text-transform: uppercase; margin: 0; }
            .subtitle { font-size: 14px; color: #666; margin: 5px 0 0 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { text-align: left; background: #f9f9f9; padding: 10px 8px; border-bottom: 2px solid #ddd; font-size: 12px; text-transform: uppercase; }
            .summary-box { background: #f4f4f4; padding: 20px; border-radius: 8px; margin: 30px 0; border: 1px solid #ddd; display: grid; grid-template-cols: 1fr 1fr; gap: 40px; }
            .total-val { font-size: 28px; font-weight: 800; color: #b91c1c; }
            .footer { margin-top: 50px; text-align: center; font-size: 10px; color: #999; border-top: 1px solid #eee; padding-top: 20px; }
            @media print { .no-print { display: none; } body { padding: 20px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1 class="title">Wastage Summary Report</h1>
              <p class="subtitle">${villageId} Mushroom Farming</p>
            </div>
            <div style="text-align: right; font-size: 12px; color: #666;">
              Period: ${new Date(filterStartDate).toLocaleDateString()} - ${new Date(filterEndDate).toLocaleDateString()}<br>
              Generated: ${new Date().toLocaleString()}
            </div>
          </div>

          <div class="summary-box">
            <div>
              <span style="font-size: 12px; color: #666; text-transform: uppercase; font-weight: bold;">Reason Breakdown</span>
              <div style="margin-top: 10px;">${summaryHtml}</div>
            </div>
            <div style="text-align: right;">
              <span style="font-size: 12px; color: #666; text-transform: uppercase; font-weight: bold;">Grand Total Loss</span>
              <div class="total-val" style="margin-top: 5px;">${totalWeight.toFixed(2)} kg</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Batch ID</th>
                <th>Reason</th>
                <th style="text-align: right;">Weight</th>
                <th>Recorded By</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="footer">
            This is an official system-generated production report for ${villageId}.
          </div>
          <script>window.onload = () => { window.print(); window.close(); }</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleSendToVillageC = () => onSuccess("Production forecast sent to Village C Sales Team.");

  const fetchBatchDetails = async (batch: ExtendedActivityLog) => {
      setSelectedBatch(batch);
      setIsEditingBatch(false);
      setIsLoadingDetails(true);
      setBatchActivities([]);
      try {
          if (!batch.id) throw new Error("Invalid Batch ID");
          const snapshot = await getDocs(query(collection(db, collectionName, batch.id, "activity_logs"), orderBy("timestamp", "desc")));
          const details: ActivityLog[] = [];
          snapshot.forEach(doc => details.push({ id: doc.id, ...doc.data() } as ActivityLog));
          setBatchActivities(details);
      } catch (err) {
          console.error("Error fetching subcollection:", err);
      } finally {
          setIsLoadingDetails(false);
      }
  };

  const openEditModal = (batch: ExtendedActivityLog) => {
      setSelectedBatch(batch);
      setEditBatchStrain(batch.mushroomStrain || 'Oyster');
      setEditBatchDetails(batch.details || '');
      setEditBatchYield((batch.totalYield ?? 0).toString());
      setEditBatchPredictedYield((batch.predictedYield ?? 0).toString());
      setIsEditingBatch(true);
  };

  const handleUpdateBatch = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedBatch?.id) return;
      setIsSavingEdit(true);
      try {
          await updateDoc(doc(db, collectionName, selectedBatch.id), { 
              mushroomStrain: editBatchStrain, 
              details: editBatchDetails, 
              totalYield: parseFloat(editBatchYield) || 0,
              predictedYield: parseFloat(editBatchPredictedYield) || 0
          });
          onSuccess("Batch updated successfully.");
          fetchBatches(); setSelectedBatch(null); setIsEditingBatch(false);
      } catch (error: any) {
          console.error("Error updating batch:", error);
          onError("Failed to update batch.");
      } finally {
          setIsSavingEdit(false);
      }
  };

  // Fix: Added missing handleExportCSV function to resolve the 'Cannot find name handleExportCSV' error
  const handleExportCSV = () => {
    if (batchList.length === 0) {
        onError("No data to export.");
        return;
    }

    const headers = ["Date", "Batch ID", "Strain", "Status", "Actual Yield (kg)", "Predicted Yield (kg)", "Wastage (kg)"];
    const rows = batchList.map(log => {
        const predicted = log.predictedYield || 0;
        const actual = log.totalYield || 0;
        const wastage = log.totalWastage || 0;
        const totalOutput = actual + wastage;
        
        let statusText = 'In Progress';
        if (predicted > 0 && totalOutput >= predicted) {
            statusText = 'Completed';
        }

        return [
            new Date(log.timestamp).toLocaleDateString(),
            log.batchId || log.id,
            log.mushroomStrain || '-',
            statusText,
            actual.toFixed(2),
            predicted.toFixed(2),
            wastage.toFixed(2)
        ];
    });

    const csvContent = [
        headers.join(","),
        ...rows.map(row => row.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `production_report_${villageId}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onSuccess("Report exported to CSV.");
  };

  const wastageCandidates = useMemo(() => {
    return batchList.filter(b => {
        // Requirement: Must complete Spawning before wastage logging
        const steps = (b as any).stepsCompleted || [];
        const isSpawningDone = steps.includes('SPAWNING');
        
        const pred = b.predictedYield || 0;
        const act = b.totalYield || 0;
        const waste = b.totalWastage || 0;
        return isSpawningDone && pred > 0 && (act + waste) < pred;
    });
  }, [batchList]);

  const productivityStats = useMemo(() => {
      const totalYield = batchList.reduce((acc, curr) => acc + (curr.totalYield || 0), 0);
      const totalPredicted = batchList.reduce((acc, curr) => acc + (curr.predictedYield || 0), 0);
      const avgYield = batchList.length > 0 ? totalYield / batchList.length : 0;
      let bestStrain = '-'; let maxYield = 0; const strainGroups: Record<string, number> = {};
      batchList.forEach(b => { if (b.mushroomStrain) { const current = strainGroups[b.mushroomStrain] || 0; strainGroups[b.mushroomStrain] = current + (b.totalYield || 0); } });
      Object.entries(strainGroups).forEach(([strain, yieldVal]) => { if (yieldVal > maxYield) { maxYield = yieldVal; bestStrain = strain; } });
      return { totalYield, avgYield, bestStrain, totalPredicted };
  }, [batchList]);

  const chartData = useMemo(() => {
      if (productionPeriod === 'DAILY') return dailyProductionData;
      const groupedMap = new Map<string, number>();
      dailyProductionData.forEach(item => {
          const date = new Date(item.date); let key = item.date;
          if (productionPeriod === 'WEEKLY') { const day = date.getDay(); const diff = date.getDate() - day + (day === 0 ? -6 : 1); const monday = new Date(date.setDate(diff)); key = `Wk ${monday.getDate()}/${monday.getMonth()+1}`; }
          else if (productionPeriod === 'MONTHLY') key = date.toLocaleString('default', { month: 'short', year: '2-digit' });
          groupedMap.set(key, (groupedMap.get(key) || 0) + item.weight);
      });
      return Array.from(groupedMap.entries()).map(([date, weight]) => ({ date, weight }));
  }, [dailyProductionData, productionPeriod]);

  const monthlyStats = useMemo(() => {
      const stats: Record<string, number> = {};
      dailyProductionData.forEach(d => { const monthKey = d.date.substring(0, 7); stats[monthKey] = (stats[monthKey] || 0) + d.weight; });
      return Object.entries(stats).map(([month, total]) => ({ month, total })).sort((a, b) => b.month.localeCompare(a.month));
  }, [dailyProductionData]);

  const predictionStats = useMemo(() => {
    const stats: Record<string, { strain: string, activeBatches: number, predicted: number, actual: number, recordedWastage: number }> = {};
    batchList.forEach(b => { if (b.predictedYield && b.predictedYield > 0 && b.mushroomStrain) { if (!stats[b.mushroomStrain]) { stats[b.mushroomStrain] = { strain: b.mushroomStrain, activeBatches: 0, predicted: 0, actual: 0, recordedWastage: 0 }; } const bWastage = b.totalWastage || 0; stats[b.mushroomStrain].activeBatches += 1; stats[b.mushroomStrain].predicted += b.predictedYield; stats[b.mushroomStrain].actual += (b.totalYield || 0); stats[b.mushroomStrain].recordedWastage += bWastage; } });
    return Object.values(stats).sort((a, b) => b.predicted - a.predicted);
  }, [batchList]);

  const trendStats = useMemo(() => {
      if (dailyProductionData.length < 4) return { trend: 'stable', change: 0, label: 'Stable' };
      const mid = Math.floor(dailyProductionData.length / 2); const firstHalf = dailyProductionData.slice(0, mid); const secondHalf = dailyProductionData.slice(mid);
      const avgFirst = firstHalf.reduce((a, b) => a + b.weight, 0) / (firstHalf.length || 1); const avgSecond = secondHalf.reduce((a, b) => a + b.weight, 0) / (secondHalf.length || 1);
      const change = avgSecond - avgFirst; const percentChange = avgFirst > 0 ? (change / avgFirst) * 100 : 0;
      return { trend: change > 0.5 ? 'up' : change < -0.5 ? 'down' : 'stable', change: Math.abs(percentChange).toFixed(1), label: change > 0.5 ? 'Improving' : change < -0.5 ? 'Declining' : 'Stable' };
  }, [dailyProductionData]);

  const wastageStats = useMemo(() => {
      let totalPredicted = 0; let totalActual = 0; let totalRecordedWastage = 0; let totalEfficiencyLoss = 0;
      batchList.forEach(b => { const p = b.predictedYield || 0; const a = b.totalYield || 0; const w = b.totalWastage || 0; if (p > 0) { totalPredicted += p; totalActual += a; totalRecordedWastage += w; const unaccounted = p - (a + w); if (unaccounted > 0) totalEfficiencyLoss += unaccounted; } });
      return { totalEfficiencyLoss, wastageRate: totalPredicted > 0 ? (totalEfficiencyLoss / totalPredicted) * 100 : 0, totalRecordedWastage };
  }, [batchList]);

  return (
    <div className="space-y-6 animate-fade-in-up">
        {/* View Switcher */}
        <div className="flex justify-center mb-6">
            <div className="bg-gray-100 p-1 rounded-lg flex space-x-1">
                <button onClick={() => setViewMode('REGISTRY')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${viewMode === 'REGISTRY' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Registry & Actions</button>
                <button onClick={() => setViewMode('PRODUCTIVITY')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${viewMode === 'PRODUCTIVITY' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Productivity Reports</button>
            </div>
        </div>

        {viewMode === 'REGISTRY' ? (
            <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Activity Form */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col h-full">
                        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <svg className={`w-5 h-5 ${theme.textIcon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                            Daily Farming Log ({villageId === VillageType.A ? 'A' : villageId === VillageType.B ? 'B' : 'Gen'})
                        </h2>
                        <form onSubmit={handleLogActivity} className="space-y-4 flex-1">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Activity Type</label>
                                    <select value={activityType} onChange={(e) => setActivityType(e.target.value)} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm border p-2">
                                        <option value="SUBSTRATE_PREP">Substrate Prep</option>
                                        <option value="SUBSTRATE_MIXING">Substrate Mixing</option>
                                        <option value="SPAWNING">Spawning</option>
                                        <option value="HUMIDITY_CONTROL">Humidity Control</option>
                                        <option value="FLUSH_REHYDRATION">Flush Rehydration</option>
                                        <option value="OTHER">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Batch ID</label>
                                    {activityType === 'SUBSTRATE_PREP' ? (
                                        <input type="text" value={activityBatchId} readOnly className="block w-full rounded-md border-gray-300 bg-gray-100 shadow-sm sm:text-sm border p-2 text-gray-500 cursor-not-allowed" />
                                    ) : (
                                        <div className="relative">
                                            <input type="text" list="batchOptions" value={activityBatchId} onChange={(e) => setActivityBatchId(e.target.value)} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm border p-2" placeholder="Select active batch..." />
                                            <datalist id="batchOptions">
                                                {batchList.filter(b => b.batchStatus !== 'COMPLETED').map(b => <option key={b.id} value={b.batchId || b.id} />)}
                                            </datalist>
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            {activityType === 'SUBSTRATE_PREP' && (
                                <div className="grid grid-cols-2 gap-4 animate-fade-in-up">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Mushroom Type</label>
                                        <select value={batchStrain} onChange={(e) => setBatchStrain(e.target.value)} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm border p-2">
                                            <option value="Oyster">Oyster</option>
                                            <option value="Shiitake">Shiitake</option>
                                            <option value="Button">Button</option>
                                            <option value="Lion's Mane">Lion's Mane</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Predicted Yield (kg) <span className="text-red-500">*</span></label>
                                        <input type="number" step="0.1" required value={predictedYield} onChange={(e) => setPredictedYield(e.target.value)} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm border p-2" placeholder="e.g. 150" />
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                                <textarea value={activityNotes} onChange={(e) => setActivityNotes(e.target.value)} rows={3} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm border p-2" />
                            </div>
                            <div className="pt-2">
                                <button type="submit" disabled={isSubmittingActivity} className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${theme.button} focus:outline-none focus:ring-2 focus:ring-offset-2 ${theme.ring} disabled:opacity-50`}>
                                    {isSubmittingActivity ? 'Saving...' : 'Save Activity'}
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Harvest Form */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col h-full">
                        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <svg className={`w-5 h-5 ${theme.textIcon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>
                            Production Weigh-In
                        </h2>
                        <form onSubmit={handleLogHarvest} className="space-y-4 flex-1">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Batch ID</label>
                                    <input type="text" list="harvestBatchOptions" required value={harvestBatch} onChange={(e) => setHarvestBatch(e.target.value)} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm border p-2" placeholder="Select active batch..." />
                                    <datalist id="harvestBatchOptions">
                                        {availableBatches.map(b => <option key={b} value={b} />)}
                                    </datalist>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Weight (kg)</label>
                                    <input type="number" step="0.1" required value={harvestWeight} onChange={(e) => setHarvestWeight(e.target.value)} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm border p-2" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Strain</label>
                                <select value={harvestStrain} onChange={(e) => setHarvestStrain(e.target.value)} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm border p-2">
                                    <option value="Oyster">Oyster</option>
                                    <option value="Shiitake">Shiitake</option>
                                    <option value="Button">Button</option>
                                    <option value="Lion's Mane">Lion's Mane</option>
                                </select>
                            </div>
                            <div className="pt-2 mt-auto">
                                <button type="submit" disabled={isSubmittingHarvest} className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${theme.button} focus:outline-none focus:ring-2 focus:ring-offset-2 ${theme.ring} disabled:opacity-50`}>
                                    {isSubmittingHarvest ? 'Processing...' : 'Submit Harvest Weight'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                {/* Wastage Form */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mt-6 border-l-4 border-l-red-500">
                     <div className="flex justify-between items-start mb-4">
                         <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            {editingWastageId ? 'Edit Wastage Record' : 'Record Wastage'}
                         </h2>
                         {editingWastageId && <button onClick={handleCancelWastageEdit} className="text-sm text-gray-500 hover:text-gray-700 underline">Cancel Edit</button>}
                     </div>
                     <form onSubmit={handleLogWastage} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                         <div className="md:col-span-1">
                             <label className="block text-sm font-medium text-gray-700 mb-1">Batch ID</label>
                             {editingWastageId ? (
                                <input type="text" value={wastageBatchId} readOnly className="block w-full rounded-md border-gray-300 bg-gray-100 shadow-sm sm:text-sm border p-2 text-gray-500" />
                             ) : (
                                <>
                                    <input type="text" list="wastageBatchOptions" required value={wastageBatchId} onChange={(e) => setWastageBatchId(e.target.value)} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 sm:text-sm border p-2" placeholder="Select batch with deficit..." />
                                    <datalist id="wastageBatchOptions">
                                        {wastageCandidates.map(b => { const pred = b.predictedYield || 0; const act = b.totalYield || 0; const waste = b.totalWastage || 0; const deficit = pred - (act + waste); return (<option key={b.id} value={b.batchId || b.id}>{b.mushroomStrain} (Deficit: {deficit.toFixed(1)}kg)</option>); })}
                                    </datalist>
                                </>
                             )}
                         </div>
                         <div className="md:col-span-1">
                             <label className="block text-sm font-medium text-gray-700 mb-1">Weight (kg)</label>
                             <input type="number" step="0.1" required value={wastageWeight} onChange={(e) => setWastageWeight(e.target.value)} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 sm:text-sm border p-2" />
                         </div>
                         <div className="md:col-span-1">
                             <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                             <select value={wastageReason} onChange={(e) => setWastageReason(e.target.value)} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 sm:text-sm border p-2">
                                 <option value="Contamination">Contamination</option><option value="Spoilage">Spoilage</option><option value="Physical Damage">Physical Damage</option><option value="Pest">Pest</option><option value="Other">Other</option>
                             </select>
                         </div>
                         <div className="md:col-span-1">
                             <button type="submit" disabled={isSubmittingWastage} className={`w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${editingWastageId ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-red-600 hover:bg-red-700'} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50`}>
                                {isSubmittingWastage ? 'Saving...' : editingWastageId ? 'Update Record' : 'Log Wastage'}
                             </button>
                         </div>
                     </form>
                </div>

                {/* Wastage History Table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mt-6">
                  <div className="px-6 py-4 border-b border-gray-200 bg-red-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold text-red-900">Wastage History</h3>
                      <p className="text-xs text-red-700">Individual logs of production loss for the current period.</p>
                    </div>
                    <button 
                      onClick={handlePrintWastageReport}
                      disabled={recordedWastageList.length === 0}
                      className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded shadow-sm hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                      Print Wastage Report
                    </button>
                  </div>
                  <div className="overflow-x-auto max-h-[300px]">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch ID</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Weight</th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {recordedWastageList.length === 0 ? (
                          <tr><td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-500">No wastage records found for this period.</td></tr>
                        ) : (
                          recordedWastageList.map((log) => (
                            <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(log.timestamp).toLocaleDateString()}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">{log.batchId}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${log.reason === 'Contamination' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                                  {log.reason}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-red-700 text-right">{(log.weightKg || 0).toFixed(2)} kg</td>
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                <button onClick={() => handleEditWastage(log)} className="text-indigo-600 hover:text-indigo-900 text-xs font-medium border border-indigo-200 px-2 py-1 rounded">Edit</button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Batch Registry Table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mt-6">
                    <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                            <h3 className="text-lg font-bold text-gray-900">Batch Registry</h3>
                            
                            {/* Registry Filters */}
                            <div className="flex flex-wrap items-center gap-2">
                                <select 
                                    value={filterStrain} 
                                    onChange={(e) => setFilterStrain(e.target.value)}
                                    className="text-xs border border-gray-300 rounded-md py-1.5 pl-2 pr-8 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-600"
                                >
                                    <option value="All">All Strains</option>
                                    <option value="Oyster">Oyster</option>
                                    <option value="Shiitake">Shiitake</option>
                                    <option value="Button">Button</option>
                                    <option value="Lion's Mane">Lion's Mane</option>
                                </select>
                                
                                <select 
                                    value={filterStatus} 
                                    onChange={(e) => setFilterStatus(e.target.value)}
                                    className="text-xs border border-gray-300 rounded-md py-1.5 pl-2 pr-8 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-600"
                                >
                                    <option value="All">All Status</option>
                                    <option value="In Progress">In Progress</option>
                                    <option value="Completed">Completed</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="flex items-center bg-white border border-gray-300 rounded-md shadow-sm">
                                <input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} className="text-xs border-none focus:ring-0 rounded-l-md py-1.5 pl-2 text-gray-600" />
                                <span className="text-gray-400 text-xs px-1">to</span>
                                <input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} className="text-xs border-none focus:ring-0 rounded-r-md py-1.5 pr-2 text-gray-600" />
                            </div>
                            <button onClick={() => { fetchBatches(); fetchRecordedWastage(); }} disabled={isLoadingBatches} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md">
                                <svg className={`w-5 h-5 ${isLoadingBatches ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            </button>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date Created</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch ID</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Strain</th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Yield (kg)</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Est. Yield (kg)</th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {isLoadingBatches ? (
                                    <tr><td colSpan={7} className="px-6 py-10 text-center text-sm text-gray-500">Loading...</td></tr>
                                ) : filteredRegistryList.length === 0 ? (
                                    <tr><td colSpan={7} className="px-6 py-10 text-center text-sm text-gray-500">No batches matching criteria.</td></tr>
                                ) : (
                                    filteredRegistryList.map((log) => {
                                        const predicted = log.predictedYield || 0;
                                        const actual = log.totalYield || 0;
                                        const wastage = log.totalWastage || 0;
                                        const totalOutput = actual + wastage;
                                        
                                        let statusText = 'In Progress';
                                        let statusColor = 'bg-yellow-100 text-yellow-800';
                                        
                                        if (predicted > 0 && totalOutput >= predicted) {
                                            statusText = 'Completed';
                                            statusColor = 'bg-green-100 text-green-800';
                                        }

                                        return (
                                            <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(log.timestamp).toLocaleDateString()}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">{log.batchId || log.id}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{log.mushroomStrain || '-'}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusColor}`}>
                                                        {statusText}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-700 text-right">{log.totalYield ? `${log.totalYield.toFixed(1)}` : '-'}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-indigo-700 text-right">{log.predictedYield ? `${log.predictedYield.toFixed(1)}` : '-'}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                                    <div className="flex justify-center space-x-2">
                                                        <button onClick={() => fetchBatchDetails(log)} className="text-indigo-600 hover:text-indigo-900 text-xs font-medium border border-indigo-200 px-2 py-1 rounded">View</button>
                                                        <button onClick={() => openEditModal(log)} className="text-gray-500 hover:text-gray-800 text-xs font-medium border border-gray-200 px-2 py-1 rounded">Edit</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </>
        ) : (
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                        <h3 className="text-xs font-medium text-gray-500 uppercase">Actual Yield</h3>
                        <div className="mt-1 flex items-baseline"><span className="text-2xl font-bold text-gray-900">{productivityStats.totalYield.toFixed(1)}</span><span className="ml-1 text-xs text-gray-500">kg</span></div>
                    </div>
                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                        <h3 className="text-xs font-medium text-gray-500 uppercase">Predicted</h3>
                        <div className="mt-1 flex items-baseline"><span className="text-2xl font-bold text-gray-900">{productivityStats.totalPredicted.toFixed(1)}</span><span className="ml-1 text-xs text-gray-500">kg</span></div>
                    </div>
                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                        <h3 className="text-xs font-medium text-gray-500 uppercase">Top Strain</h3>
                        <div className="mt-1 flex items-baseline"><span className="text-xl font-bold text-indigo-600 truncate">{productivityStats.bestStrain}</span></div>
                    </div>
                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                        <h3 className="text-xs font-medium text-gray-500 uppercase">Trend</h3>
                        <div className="mt-1 flex items-center"><span className={`text-xl font-bold ${trendStats.trend === 'up' ? 'text-green-600' : trendStats.trend === 'down' ? 'text-red-600' : 'text-gray-600'}`}>{trendStats.label}</span>{trendStats.trend !== 'stable' && <span className="ml-2 text-xs font-medium bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{trendStats.change}%</span>}</div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm h-80 flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-sm font-bold text-gray-900">Production Trend</h3>
                            <div className="flex bg-gray-100 p-0.5 rounded-lg">
                                <button onClick={() => setProductionPeriod('DAILY')} className={`text-[10px] px-2 py-1 rounded-md font-medium transition-all ${productionPeriod === 'DAILY' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>Daily</button>
                                <button onClick={() => setProductionPeriod('WEEKLY')} className={`text-[10px] px-2 py-1 rounded-md font-medium transition-all ${productionPeriod === 'WEEKLY' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>Weekly</button>
                                <button onClick={() => setProductionPeriod('MONTHLY')} className={`text-[10px] px-2 py-1 rounded-md font-medium transition-all ${productionPeriod === 'MONTHLY' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>Monthly</button>
                            </div>
                        </div>
                        <div className="flex-1 flex items-end justify-between gap-1 overflow-x-auto pb-2 min-h-0">
                            {isLoadingProductivity ? <div className="w-full h-full flex items-center justify-center text-gray-400">Loading...</div> : chartData.length === 0 ? <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">No data for selected period</div> : chartData.map((d) => { const maxVal = Math.max(...chartData.map(i => i.weight), 10); const height = (d.weight / maxVal) * 100; return (<div key={d.date} className="flex flex-col items-center flex-1 min-w-[30px] group h-full justify-end"><div className="relative w-full flex items-end justify-center h-full"><div className="w-full mx-1 bg-green-500 rounded-t-sm hover:bg-green-400 transition-all relative" style={{ height: `${height < 5 ? 5 : height}%` }}><div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[9px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10 whitespace-nowrap">{d.weight.toFixed(1)}kg</div></div></div><span className="text-[9px] text-gray-400 mt-1 truncate max-w-full">{d.date.split(' ')[0]}</span></div>); })}
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm h-80 flex flex-col">
                        <h3 className="text-sm font-bold text-gray-900 mb-2">Wastage Monitor</h3>
                        <p className="text-xs text-gray-500 mb-6">Efficiency and reported spoilage tracking.</p>
                        <div className="flex-1 flex flex-col justify-center">
                            <div className="mb-6 grid grid-cols-2 gap-4">
                                <div className="bg-red-50 p-3 rounded-lg border border-red-100"><span className="text-xs font-medium text-red-600 block mb-1">Recorded Waste (Logs)</span><span className="text-2xl font-bold text-red-700">{wastageStats.totalRecordedWastage.toFixed(1)} kg</span></div>
                                <div className="bg-orange-50 p-3 rounded-lg border border-orange-100"><span className="text-xs font-medium text-orange-600 block mb-1">Efficiency Loss (Gap)</span><span className="text-2xl font-bold text-orange-700">{wastageStats.totalEfficiencyLoss.toFixed(1)} kg</span></div>
                            </div>
                            <div className="mb-2"><div className="flex justify-between text-xs text-gray-500 mb-1"><span>Efficiency Rate</span><span>{wastageStats.wastageRate.toFixed(1)}% Gap</span></div><div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden"><div className="h-full bg-orange-400 rounded-full" style={{ width: `${Math.min(wastageStats.wastageRate * 2, 100)}%` }}></div></div></div>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                        <div className="flex space-x-4">
                            <button onClick={() => setReportType('BATCH')} className={`text-sm font-bold ${reportType === 'BATCH' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'}`}>Batch Report</button>
                            <button onClick={() => setReportType('MONTHLY')} className={`text-sm font-bold ${reportType === 'MONTHLY' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'}`}>Monthly Report</button>
                            <button onClick={() => setReportType('PREDICTION')} className={`text-sm font-bold ${reportType === 'PREDICTION' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'}`}>Prediction Report</button>
                        </div>
                        <div className="flex items-center space-x-2">
                             <div className="flex items-center bg-white border border-gray-300 rounded-md shadow-sm">
                                <input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} className="text-xs border-none focus:ring-0 rounded-l-md py-1.5 pl-2 text-gray-600 w-24" />
                                <span className="text-gray-400 text-xs px-1">-</span>
                                <input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} className="text-xs border-none focus:ring-0 rounded-r-md py-1.5 pr-2 text-gray-600 w-24" />
                            </div>
                            <button onClick={handleExportCSV} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded shadow-sm hover:bg-indigo-700">Export</button>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        {reportType === 'BATCH' ? (
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50"><tr><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Strain</th><th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actual</th><th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Predicted</th><th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Wastage (Rec)</th><th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Harvest Yet Done</th><th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Yield Eff. %</th><th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th></tr></thead>
                                <tbody className="bg-white divide-y divide-gray-200">{batchList.map((batch) => { const predicted = batch.predictedYield || 0; const actual = batch.totalYield || 0; const wastage = batch.totalWastage || 0; const remaining = Math.max(0, predicted - (actual + wastage)); const totalOutput = actual + wastage; const efficiencyVal = predicted > 0 ? (actual / predicted) * 100 : 0; let statusColor = "bg-gray-100 text-gray-800"; let statusText = "N/A"; if (predicted > 0) { if (totalOutput >= predicted) { statusColor = "bg-green-100 text-green-800"; statusText = "Completed"; } else { statusColor = "bg-yellow-100 text-yellow-800"; statusText = "In Progress"; } } return (<tr key={batch.id} className="hover:bg-gray-50"><td className="px-6 py-4 text-sm font-bold text-gray-900">{batch.batchId || batch.id}</td><td className="px-6 py-4 text-sm text-gray-500">{batch.mushroomStrain}</td><td className="px-6 py-4 text-sm font-bold text-right text-gray-900">{(actual || 0).toFixed(1)}</td><td className="px-6 py-4 text-sm text-right text-gray-500">{predicted > 0 ? predicted.toFixed(1) : '-'}</td><td className="px-6 py-4 text-sm text-right text-red-500">{wastage > 0 ? wastage.toFixed(1) : '-'}</td><td className="px-6 py-4 text-sm text-right font-medium text-indigo-600">{remaining > 0 ? remaining.toFixed(1) : '-'}</td><td className="px-6 py-4 text-center"><span className="text-xs font-bold">{efficiencyVal.toFixed(0)}%</span></td><td className="px-6 py-4 text-center"><span className={`px-2 py-1 text-xs font-bold rounded-full ${statusColor}`}>{statusText}</span></td></tr>); })}</tbody>
                            </table>
                        ) : reportType === 'PREDICTION' ? (
                            <>
                                <div className="p-4 bg-indigo-50 border-b border-indigo-100 flex justify-between items-center"><div><h3 className="text-sm font-bold text-indigo-900">Production Forecast</h3><p className="text-xs text-indigo-700 mt-1">Estimated remaining supply based on active batch predictions.</p></div><button onClick={handleSendToVillageC} className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded shadow-sm hover:bg-indigo-700 flex items-center gap-2"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>Send to Village C (Sales)</button></div>
                                <table className="min-w-full divide-y divide-gray-200"><thead className="bg-gray-50"><tr><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Strain</th><th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Active Batches</th><th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Predicted Total</th><th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Harvested So Far</th><th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Recorded Wastage</th><th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Remaining Forecast</th></tr></thead><tbody className="bg-white divide-y divide-gray-200">{predictionStats.map((stat, idx) => { const remaining = Math.max(0, stat.predicted - stat.actual - stat.recordedWastage); return (<tr key={idx} className="hover:bg-gray-50"><td className="px-6 py-4 text-sm font-bold text-gray-900">{stat.strain}</td><td className="px-6 py-4 text-sm text-center text-gray-500">{stat.activeBatches}</td><td className="px-6 py-4 text-sm text-right text-gray-500">{(stat.predicted || 0).toFixed(2)} kg</td><td className="px-6 py-4 text-sm text-right text-gray-500">{(stat.actual || 0).toFixed(2)} kg</td><td className="px-6 py-4 text-sm text-right text-red-500">{(stat.recordedWastage || 0).toFixed(2)} kg</td><td className="px-6 py-4 text-sm font-bold text-right text-indigo-600">{remaining.toFixed(2)} kg</td></tr>); })}</tbody></table>
                            </>
                        ) : (
                            <table className="min-w-full divide-y divide-gray-200"><thead className="bg-gray-50"><tr><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th><th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Yield (kg)</th><th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg Daily (kg)</th><th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Trend</th></tr></thead><tbody className="bg-white divide-y divide-gray-200">{monthlyStats.map((m, idx) => { const prev = monthlyStats[idx + 1]; const trend = prev ? (m.total - prev.total) : 0; return (<tr key={m.month} className="hover:bg-gray-50"><td className="px-6 py-4 text-sm font-bold text-gray-900">{m.month}</td><td className="px-6 py-4 text-sm font-bold text-right text-green-700">{(m.total || 0).toFixed(2)}</td><td className="px-6 py-4 text-sm text-right text-gray-500">{(m.total / 30).toFixed(1)}</td><td className="px-6 py-4 text-center">{prev ? (<span className={`text-xs font-bold ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>{trend >= 0 ? '+' : ''}{trend.toFixed(1)} kg</span>) : <span className="text-xs text-gray-400">-</span>}</td></tr>); })}</tbody></table>
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* Batch Details Modal */}
        {selectedBatch && (
            <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setSelectedBatch(null)}></div>
                    <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                    <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full sm:p-6 animate-fade-in-up">
                        <div className="flex justify-between items-start mb-4">
                            <div><h3 className="text-lg font-bold text-gray-900">{isEditingBatch ? 'Edit Batch Details' : `Batch ${selectedBatch.batchId} History`}</h3><p className="text-sm text-gray-500">Started: {new Date(selectedBatch.timestamp).toLocaleString()}</p></div>
                            <button onClick={() => setSelectedBatch(null)} className="text-gray-400 hover:text-gray-500"><svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                        </div>
                        {isEditingBatch ? (
                            <form onSubmit={handleUpdateBatch} className="space-y-4">
                                <div><label className="block text-sm font-medium text-gray-700 mb-1">Mushroom Strain</label><select value={editBatchStrain} onChange={(e) => setEditBatchStrain(e.target.value)} className="block w-full rounded-md border-gray-600 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm p-2.5 bg-gray-700 text-white"><option value="Oyster">Oyster</option><option value="Shiitake">Shiitake</option><option value="Button">Button</option><option value="Lion's Mane">Lion's Mane</option></select></div>
                                <div><label className="block text-sm font-medium text-gray-700 mb-1">Initial Notes</label><textarea value={editBatchDetails} onChange={(e) => setEditBatchDetails(e.target.value)} rows={4} className="block w-full rounded-md border-gray-600 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm p-2.5 bg-gray-700 text-white" /></div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="pt-2"><label className="block text-sm font-medium text-gray-700 mb-1">Estimated Yield (kg)</label><input type="number" step="0.1" value={editBatchPredictedYield} onChange={(e) => setEditBatchPredictedYield(e.target.value)} className="block w-full rounded-md border-gray-600 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm p-2.5 bg-gray-700 text-white" /></div>
                                    <div className="pt-2"><label className="block text-sm font-medium text-gray-700 mb-1">Actual Production Weight (kg)</label><input type="number" step="0.1" value={editBatchYield} onChange={(e) => setEditBatchYield(e.target.value)} className="block w-full rounded-md border-gray-600 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm p-2.5 bg-gray-700 text-white" /><p className="text-xs text-amber-600 mt-1 font-medium">Warning: Resets calculated harvest sums.</p></div>
                                </div>
                                <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100"><button type="button" onClick={() => setIsEditingBatch(false)} className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button><button type="submit" disabled={isSavingEdit} className={`px-4 py-2 rounded-md text-sm font-medium text-white ${theme.button}`}>{isSavingEdit ? 'Saving...' : 'Save Changes'}</button></div>
                            </form>
                        ) : (
                            <>
                                <div className="grid grid-cols-2 gap-4 mb-4"><div className="bg-gray-50 rounded-lg p-3 border border-gray-200"><div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Initial Bed Prep</div><p className="text-sm text-gray-800">{selectedBatch.details}</p>{selectedBatch.mushroomStrain && <p className="text-xs text-indigo-600 mt-1 font-medium">Strain: {selectedBatch.mushroomStrain}</p>}{selectedBatch.predictedYield && <p className="text-xs text-gray-500 mt-1">Predicted: {selectedBatch.predictedYield} kg</p>}</div><div className="bg-green-50 rounded-lg p-3 border border-green-200 flex flex-col justify-center items-center"><div className="text-xs font-bold text-green-700 uppercase tracking-wide mb-1">Total Yield</div><p className="text-2xl font-bold text-green-800">{selectedBatch.totalYield ? selectedBatch.totalYield.toFixed(2) : '0.00'} <span className="text-sm font-normal">kg</span></p></div></div>
                                <div className="mt-4 max-h-[300px] overflow-y-auto">{isLoadingDetails ? (<div className="text-center py-8 text-sm text-gray-500">Loading details...</div>) : batchActivities.length === 0 ? (<div className="text-center py-8 text-sm text-gray-400 italic">No additional activities recorded.</div>) : (<ul className="space-y-4">{batchActivities.map((act) => (<li key={act.id} className="relative pl-6 border-l-2 border-gray-200 hover:border-gray-400 transition-colors"><div className="flex items-center justify-between mb-1"><span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${act.type === 'HARVEST' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>{act.type}</span><span className="text-xs text-gray-400">{new Date(act.timestamp).toLocaleString()}</span></div><p className="text-sm text-gray-800 mb-1">{act.details}</p><p className="text-xs text-gray-400 italic">By {act.userEmail}</p></li>))}</ul>)}</div>
                                <div className="mt-5 sm:mt-6"><button type="button" className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 ${theme.button} text-base font-medium text-white sm:text-sm`} onClick={() => setSelectedBatch(null)}>Close</button></div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
