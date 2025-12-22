
import React, { useState, useEffect, useMemo } from 'react';
import { addDoc, collection, query, orderBy, limit, getDocs, setDoc, doc, updateDoc, increment, getDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { ActivityLog, VillageType, FinancialRecord, ProcessingLog } from '../../types';
import { MUSHROOM_PRICES, MUSHROOM_ROOM_MAPPING } from '../../constants';

// Shared interfaces locally defined to match original file
interface ExtendedActivityLog extends ActivityLog {
    totalWastage?: number;
    stepsCompleted?: string[];
}

interface FarmingRegistryProps {
    villageId: VillageType;
    userEmail: string;
    theme: any;
    batchList: ExtendedActivityLog[];
    recordedWastageList: any[];
    onRefresh: () => void;
    onSuccess: (msg: string) => void;
    onError: (msg: string) => void;
    setActiveTab?: (tab: any) => void;
    triggerEnvPrompt?: (data: {batchId: string, room: string}) => void;
}

const AVAILABLE_ROOMS = Object.values(MUSHROOM_ROOM_MAPPING).flat().sort();

const ACTIVITY_RECIPES: Record<string, { id: string, name: string, amount: number }[]> = {
    'SUBSTRATE_PREP': [
        { id: "MAT-573260995", name: "Straw", amount: 20 },
        { id: "MAT-545594408", name: "Water", amount: 50 },
    ],
    'SUBSTRATE_MIXING': [
        { id: "MAT-406637503", name: "Bran", amount: 0.5 },
        { id: "MAT-446059102", name: "Gypsum", amount: 0.2 },
    ],
    'SPAWNING': [
        { id: "MAT-282015830", name: "Spawn", amount: 1 },
    ],
    'HUMIDITY_CONTROL': [
        { id: "MAT-545594408", name: "Water", amount: 5 },
    ],
    'FLUSH_REHYDRATION': [
        { id: "MAT-545594408", name: "Water", amount: 20 },
    ]
};

const STRAIN_YIELD_PREDICTIONS: Record<string, number> = {
    'Oyster': 6.5,
    'Button': 5.5,
    'Shiitake': 5.0,
    "Lion's Mane": 5.8,
    'King Oyster': 6.0
};

export const FarmingRegistry: React.FC<FarmingRegistryProps> = ({
    villageId, userEmail, theme, batchList, recordedWastageList, onRefresh, onSuccess, onError, setActiveTab, triggerEnvPrompt
}) => {
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

    const getIncomeCollection = (vid: VillageType) => vid === VillageType.A ? 'income_A' : vid === VillageType.B ? 'income_B' : 'income_C';

    const collectionName = getCollectionName(villageId);

    // Activity State
    const [activityType, setActivityType] = useState<string>('SUBSTRATE_PREP');
    const [activityBatchId, setActivityBatchId] = useState('');
    const [activityRoomId, setActivityRoomId] = useState('A1');
    const [activityNotes, setActivityNotes] = useState('');
    const [batchStrain, setBatchStrain] = useState('Oyster'); 
    const [predictedYield, setPredictedYield] = useState(STRAIN_YIELD_PREDICTIONS['Oyster'].toString()); 
    const [isSubmittingActivity, setIsSubmittingActivity] = useState(false);
    const [availableBatches, setAvailableBatches] = useState<{id: string, strain: string}[]>([]);

    // Harvest State
    const [harvestBatch, setHarvestBatch] = useState('');
    const [harvestWeight, setHarvestWeight] = useState('');
    const [harvestStrain, setHarvestStrain] = useState('Oyster');
    const [isSubmittingHarvest, setIsSubmittingHarvest] = useState(false);

    // Wastage State
    const [wastageBatchId, setWastageBatchId] = useState('');
    const [wastageWeight, setWastageWeight] = useState('');
    const [wastageReason, setWastageReason] = useState('Contamination');
    const [isSubmittingWastage, setIsSubmittingWastage] = useState(false);
    const [editingWastageId, setEditingWastageId] = useState<string | null>(null);
    const [originalWastageWeight, setOriginalWastageWeight] = useState<number | null>(null);

    // Filtering & Edit Modal State
    const [filterStartDate, setFilterStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 30); 
        return d.toISOString().split('T')[0];
    });
    const [filterEndDate, setFilterEndDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [filterStrain, setFilterStrain] = useState('All');
    const [filterStatus, setFilterStatus] = useState('All');

    const [selectedBatch, setSelectedBatch] = useState<ExtendedActivityLog | null>(null);
    const [batchActivities, setBatchActivities] = useState<ActivityLog[]>([]);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);
    const [isEditingBatch, setIsEditingBatch] = useState(false);
    const [editBatchStrain, setEditBatchStrain] = useState('');
    const [editBatchDetails, setEditBatchDetails] = useState('');
    const [editBatchYield, setEditBatchYield] = useState(''); 
    const [editBatchPredictedYield, setEditBatchPredictedYield] = useState('');
    const [isSavingEdit, setIsSavingEdit] = useState(false);

    // Helper: Auto Deduction
    const performAutoDeduction = async (materialId: string, amount: number, activityName: string, batchId: string) => {
        const resCol = getResourceColName(villageId);
        const resRef = doc(db, resCol, materialId);
        try {
            const docSnap = await getDoc(resRef);
            if (!docSnap.exists()) return;
            
            const resourceData = docSnap.data();
            const unitCost = resourceData.unitCost || 0;
            let costForAmount = 0;
            if (resourceData.unit === 'L') {
                costForAmount = (amount / 10) * unitCost;
            } else {
                costForAmount = amount * unitCost;
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

            if (batchId) {
                const batchCostRef = collection(db, collectionName, batchId, "batch_costs");
                await addDoc(batchCostRef, {
                    activity: activityName,
                    materialName: resourceData.name,
                    materialId: materialId,
                    quantity: amount,
                    unit: resourceData.unit,
                    unitCostSnapshot: unitCost,
                    totalCost: costForAmount,
                    timestamp: new Date().toISOString()
                });
            }

        } catch (e) {
            console.error(`Auto-deduction failed for ${materialId}`, e);
        }
    };

    // Effect: Fetch active batch options for dropdowns (General purpose, mostly for Harvest)
    useEffect(() => {
        const fetchBatchOptions = async () => {
            try {
                const q = query(
                    collection(db, collectionName), 
                    orderBy("timestamp", "desc"),
                    limit(150) 
                );
                const snapshot = await getDocs(q);
                const batches: {id: string, strain: string}[] = [];
                
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const predicted = data.predictedYield || 0;
                    const actual = data.totalYield || 0;
                    const wastage = data.totalWastage || 0;
                    const totalOutput = actual + wastage;
                    
                    const steps = data.stepsCompleted || [];
                    const isSpawningDone = steps.includes('SPAWNING');

                    if (isSpawningDone && (predicted === 0 || totalOutput < predicted)) {
                        batches.push({ id: doc.id, strain: data.mushroomStrain || 'Oyster' });
                    }
                });
                setAvailableBatches(batches);
            } catch (e) {
                console.warn("Could not fetch batch options:", e);
            }
        };
        
        if (collectionName) fetchBatchOptions();
    }, [collectionName, isSubmittingActivity, isSubmittingHarvest, isSubmittingWastage, villageId]);

    // Effect: Generate Batch ID
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

    // Effect: Populate Harvest Strain
    useEffect(() => {
        const populateStrain = async () => {
            if (!harvestBatch) return;
            const activeBatch = availableBatches.find(b => b.id === harvestBatch);
            if (activeBatch) {
                setHarvestStrain(activeBatch.strain);
                return;
            }
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
    }, [harvestBatch, collectionName, batchList, availableBatches]);

    // Effect: Set Defaults for Substrate Prep
    useEffect(() => {
        if (activityType === 'SUBSTRATE_PREP') {
            const compatibleRooms = MUSHROOM_ROOM_MAPPING[batchStrain] || [];
            if (compatibleRooms.length > 0) {
                setActivityRoomId(compatibleRooms[0]);
            }
            const aiPrediction = STRAIN_YIELD_PREDICTIONS[batchStrain] || 6.5;
            setPredictedYield(aiPrediction.toString());
        }
    }, [batchStrain, activityType]);

    // Derived: Filtered List
    const filteredRegistryList = useMemo(() => {
        return batchList.filter(batch => {
            if (filterStrain !== 'All' && batch.mushroomStrain !== filterStrain) return false;
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

    // Derived: Filtered Batches for specific Activity Type Dropdown
    const eligibleBatchesForActivity = useMemo(() => {
        return batchList.filter(b => {
            // Filter out fully completed/archived batches
            if (b.batchStatus === 'COMPLETED') return false;
            
            const steps = b.stepsCompleted || [];
            
            // Logic: Only show batches that need this specific step
            if (activityType === 'SUBSTRATE_MIXING') {
                // Must have done Prep, but NOT Mixing yet
                return steps.includes('SUBSTRATE_PREP') && !steps.includes('SUBSTRATE_MIXING');
            }
            if (activityType === 'SPAWNING') {
                // Must have done Mixing, but NOT Spawning yet
                return steps.includes('SUBSTRATE_MIXING') && !steps.includes('SPAWNING');
            }
            // For Maintenance activities, usually need Spawning done
            if (['HUMIDITY_CONTROL', 'FLUSH_REHYDRATION', 'OTHER'].includes(activityType)) {
                return steps.includes('SPAWNING');
            }
            
            return true;
        });
    }, [batchList, activityType]);

    const getBatchGrade = (weight: number) => {
        if (weight >= 8) return { label: 'Excellent', color: 'bg-purple-100 text-purple-700 border-purple-200' };
        if (weight >= 6) return { label: 'Good', color: 'bg-green-100 text-green-700 border-green-200' };
        if (weight >= 4) return { label: 'Viable', color: 'bg-blue-50 text-blue-700 border-blue-100' };
        return { label: 'Low', color: 'bg-red-50 text-red-600 border-red-100' };
    };

    const wastageCandidates = useMemo(() => {
        return batchList.filter(b => {
            const steps = (b as any).stepsCompleted || [];
            const isSpawningDone = steps.includes('SPAWNING');
            const pred = b.predictedYield || 0;
            const act = b.totalYield || 0;
            const waste = b.totalWastage || 0;
            return isSpawningDone && pred > 0 && (act + waste) < pred;
        });
    }, [batchList]);

    // Handlers
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
            
            if (activityType === 'SUBSTRATE_PREP') {
                if (!predictedYield || parseFloat(predictedYield) <= 0) {
                    throw new Error("Predicted yield is required for Substrate Prep.");
                }
                newLog.mushroomStrain = batchStrain;
                newLog.predictedYield = parseFloat(predictedYield) || 0;
                newLog.stepsCompleted = ['SUBSTRATE_PREP']; 
                newLog.roomId = activityRoomId;
                
                if (!finalBatchId) throw new Error("Batch ID is required for Substrate Prep");
                
                await setDoc(doc(db, collectionName, finalBatchId), newLog);
                await addDoc(collection(db, collectionName, finalBatchId, "activity_logs"), {
                    ...newLog,
                    action: "BATCH_INITIATED"
                });
                
                await addDoc(collection(db, "system_notifications"), {
                    villageId,
                    type: 'URGENT_LOG',
                    message: `New Batch ${finalBatchId} in Room ${activityRoomId}: Please log initial environment readings immediately.`,
                    read: false,
                    timestamp: new Date().toISOString()
                });
                
                const recipe = ACTIVITY_RECIPES[activityType] || [];
                for (const item of recipe) {
                    const totalDeduct = item.amount;
                    if (totalDeduct > 0) {
                      await performAutoDeduction(item.id, totalDeduct, "Substrate Prep", finalBatchId);
                    }
                }
                
                // Trigger global prompt instead of local state
                if (triggerEnvPrompt) {
                    triggerEnvPrompt({ batchId: finalBatchId, room: activityRoomId });
                }
                onSuccess(`Batch created. Material deducted.`);

            } else {
                if (!finalBatchId) {
                    onError("Please select a Batch ID to log this activity.");
                    setIsSubmittingActivity(false);
                    return;
                }
  
                const batchRef = doc(db, collectionName, finalBatchId);
                const batchSnap = await getDoc(batchRef);
                if (!batchSnap.exists()) throw new Error("Batch record not found.");
                const batchData = batchSnap.data();
                const completedSteps = batchData.stepsCompleted || [];
                
                let isStepAlreadyDone = false;
  
                if (activityType === 'SUBSTRATE_MIXING') {
                    if (!completedSteps.includes('SUBSTRATE_PREP')) throw new Error("Must complete Substrate Prep before Substrate Mixing.");
                    isStepAlreadyDone = completedSteps.includes('SUBSTRATE_MIXING');
                    if (!isStepAlreadyDone) {
                        await updateDoc(batchRef, { stepsCompleted: arrayUnion('SUBSTRATE_MIXING') });
                    }
                } else if (activityType === 'SPAWNING') {
                    if (!completedSteps.includes('SUBSTRATE_MIXING')) throw new Error("Must complete Substrate Mixing before Spawning.");
                    isStepAlreadyDone = completedSteps.includes('SPAWNING');
                    if (!isStepAlreadyDone) {
                        await updateDoc(batchRef, { stepsCompleted: arrayUnion('SPAWNING') });
                    }
                }
  
                await addDoc(collection(db, collectionName, finalBatchId, "activity_logs"), newLog);
                
                const recipe = ACTIVITY_RECIPES[activityType] || [];
                if (recipe.length > 0) {
                    if (!isStepAlreadyDone) {
                        for (const item of recipe) {
                            const totalDeduct = item.amount;
                            if (totalDeduct > 0) {
                              await performAutoDeduction(item.id, totalDeduct, activityType.replace('_', ' '), finalBatchId);
                            }
                        }
                        onSuccess(`${activityType.replace('_', ' ')} logged. Materials deducted.`);
                    } else {
                        onSuccess(`${activityType.replace('_', ' ')} log updated. Cost deduction skipped (already recorded).`);
                    }
                } else {
                    onSuccess("Activity logged successfully.");
                }
            }
            
            setActivityNotes('');
            setPredictedYield(STRAIN_YIELD_PREDICTIONS['Oyster'].toString());
            
            if (activityType === 'SUBSTRATE_PREP') {
                const today = new Date();
                const dateStr = today.toISOString().slice(2, 10).replace(/-/g, '');
                const random = Math.floor(1000 + Math.random() * 9000);
                setActivityBatchId(`B${dateStr}-${random}`);
            } else {
                setActivityBatchId('');
            }
  
            onRefresh();
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
            
            await setDoc(harvestDocRef, { batchId: harvestBatch, strain: harvestStrain, totalYield: increment(weight), lastRecordedBy: userEmail, timestamp, villageId }, { merge: true });
            
            if (harvestBatch) {
                await updateDoc(doc(db, collectionName, harvestBatch), { totalYield: increment(weight) });
                await addDoc(collection(db, collectionName, harvestBatch, "activity_logs"), { type: 'HARVEST', details: `Harvested ${weight}kg of ${harvestStrain}`, userEmail, timestamp, villageId, batchId: harvestBatch, totalYield: weight });
            }
  
            const pricePerKg = MUSHROOM_PRICES[harvestStrain] || 10;
            const totalSaleAmount = weight * pricePerKg;
            const finColName = getIncomeCollection(villageId);
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
              status: 'PENDING', 
              createdAt: timestamp
            };
            await setDoc(doc(db, finColName, transactionId), saleRecord);
  
            const packagingDueTime = new Date(new Date().getTime() + 2 * 3600000).toISOString();
            
            const processingIntake: Omit<ProcessingLog, 'id'> = {
                batchId: harvestBatch, 
                harvestId: harvestBatch,
                sourceVillage: villageId,
                mushroomType: harvestStrain,
                statedWeight: weight,
                actualWeight: weight, 
                variance: 0,
                receivedBy: 'Village Hub Automation',
                intakeTimestamp: timestamp,
                packagingDueTime,
                status: 'IN_PROGRESS',
                currentStep: 2, 
                villageId: VillageType.C,
                timestamp: timestamp,
                hasImageEvidence: false
            };
            
            await addDoc(collection(db, "processing_logs"), processingIntake);
  
            setHarvestBatch('');
            setHarvestWeight('');
            onSuccess(`Harvest recorded. RM${totalSaleAmount.toFixed(2)} sale generated & synced to Village C Hub.`);
            onRefresh();
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
            onRefresh();
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
        const rowsHtml = recordedWastageList.map(log => `<tr><td style="padding: 8px; border-bottom: 1px solid #eee;">${new Date(log.timestamp).toLocaleDateString()}</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">${log.batchId}</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${log.reason}</td><td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${(log.weightKg || 0).toFixed(2)} kg</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-size: 10px;">${log.recordedBy}</td></tr>`).join('');
        const summaryHtml = Object.entries(reasonSummary).map(([reason, weight]) => `<div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 12px;"><span>${reason}:</span><span style="font-weight: bold;">${weight.toFixed(2)} kg</span></div>`).join('');
        printWindow.document.write(`<html><head><title>Wastage Report</title><style>body{font-family:'Inter',sans-serif;padding:40px;color:#333;}.summary-box{background:#f4f4f4;padding:20px;margin:30px 0;border:1px solid #ddd;display:grid;grid-template-cols:1fr 1fr;gap:40px;}table{width:100%;border-collapse:collapse;}th{text-align:left;background:#f9f9f9;padding:10px;}@media print{.no-print{display:none;}}</style></head><body><h1>Wastage Summary</h1><div class="summary-box"><div>${summaryHtml}</div><div style="text-align:right;"><strong>Total:</strong> ${totalWeight.toFixed(2)} kg</div></div><table><thead><tr><th>Date</th><th>Batch</th><th>Reason</th><th>Weight</th><th>User</th></tr></thead><tbody>${rowsHtml}</tbody></table><script>window.onload=()=>{window.print();window.close();}</script></body></html>`);
        printWindow.document.close();
    };

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
            onRefresh(); setSelectedBatch(null); setIsEditingBatch(false);
        } catch (error: any) {
            console.error("Error updating batch:", error);
            onError("Failed to update batch.");
        } finally {
            setIsSavingEdit(false);
        }
    };

    return (
        <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col h-full">
                    <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <svg className={`w-5 h-5 ${theme.textIcon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
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
                                        <input type="text" list="batchOptions" value={activityBatchId} onChange={(e) => setActivityBatchId(e.target.value)} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm border p-2" placeholder="Select batch..." />
                                        <datalist id="batchOptions">
                                            {eligibleBatchesForActivity.map(b => (
                                                <option key={b.id} value={b.batchId || b.id}>{b.mushroomStrain || 'Oyster'}</option>
                                            ))}
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
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Target Room ID</label>
                                    <select value={activityRoomId} onChange={(e) => setActivityRoomId(e.target.value)} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm border p-2">
                                        {(MUSHROOM_ROOM_MAPPING[batchStrain] || AVAILABLE_ROOMS).map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Yield (AI Prediction: <span className="font-bold">{STRAIN_YIELD_PREDICTIONS[batchStrain] || 6.5}kg</span>) <span className="text-red-500">*</span></label>
                                    <input type="number" step="0.1" required value={predictedYield} onChange={(e) => setPredictedYield(e.target.value)} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm border p-2" placeholder="e.g. 6.5" />
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
                                    {availableBatches.map(b => <option key={b.id} value={b.id}>{b.strain}</option>)}
                                </datalist>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Weight (kg)</label>
                                <input type="number" step="0.1" required value={harvestWeight} onChange={(e) => setHarvestWeight(e.target.value)} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm border p-2" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Strain</label>
                            <select 
                                value={harvestStrain} 
                                onChange={(e) => setHarvestStrain(e.target.value)} 
                                disabled={!!availableBatches.find(b => b.id === harvestBatch) || !!batchList.find(b => b.id === harvestBatch || b.batchId === harvestBatch)}
                                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm border p-2 disabled:bg-gray-100 disabled:text-gray-500"
                            >
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

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mt-6">
                <div className="px-6 py-4 border-b border-gray-200 bg-red-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h3 className="text-lg font-bold text-red-900">Wastage History</h3>
                    <p className="text-xs text-red-700">Individual logs of production loss for the current period.</p>
                </div>
                <button onClick={handlePrintWastageReport} disabled={recordedWastageList.length === 0} className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded shadow-sm hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                    Print Wastage Report
                </button>
                </div>
                <div className="overflow-x-auto max-h-[300px]">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                    <tr><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch ID</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th><th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Weight</th><th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th></tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                    {recordedWastageList.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(log.timestamp).toLocaleDateString()}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">{log.batchId}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${log.reason === 'Contamination' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>{log.reason}</span></td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-red-700 text-right">{(log.weightKg || 0).toFixed(2)} kg</td>
                            <td className="px-6 py-4 whitespace-nowrap text-center"><button onClick={() => handleEditWastage(log)} className="text-indigo-600 hover:text-indigo-900 text-xs font-medium border border-indigo-200 px-2 py-1 rounded">Edit</button></td>
                        </tr>
                    ))}
                    </tbody>
                </table>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mt-6">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <h3 className="text-lg font-bold text-gray-900">Batch Registry</h3>
                        <div className="flex flex-wrap items-center gap-2">
                            <select value={filterStrain} onChange={(e) => setFilterStrain(e.target.value)} className="text-xs border border-gray-300 rounded-md py-1.5 pl-2 pr-8 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-600"><option value="All">All Strains</option><option value="Oyster">Oyster</option><option value="Shiitake">Shiitake</option><option value="Button">Button</option><option value="Lion's Mane">Lion's Mane</option></select>
                            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="text-xs border border-gray-300 rounded-md py-1.5 pl-2 pr-8 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-600"><option value="All">All Status</option><option value="In Progress">In Progress</option><option value="Completed">Completed</option></select>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center bg-white border border-gray-300 rounded-md shadow-sm"><input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} className="text-xs border-none focus:ring-0 rounded-l-md py-1.5 pl-2 text-gray-600" /><span className="text-gray-400 text-xs px-1">to</span><input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} className="text-xs border-none focus:ring-0 rounded-r-md py-1.5 pr-2 text-gray-600" /></div>
                        <button onClick={onRefresh} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></button>
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
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Efficiency</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredRegistryList.length === 0 ? (<tr><td colSpan={7} className="px-6 py-10 text-center text-sm text-gray-500">No batches matching criteria.</td></tr>) : (
                                filteredRegistryList.map((log) => {
                                    const predicted = log.predictedYield || 0;
                                    const actual = log.totalYield || 0;
                                    const wastage = log.totalWastage || 0;
                                    const totalOutput = actual + wastage;
                                    let statusText = 'In Progress';
                                    let statusColor = 'bg-yellow-100 text-yellow-800';
                                    if (predicted > 0 && totalOutput >= predicted) { statusText = 'Completed'; statusColor = 'bg-green-100 text-green-800'; }
                                    
                                    const efficiency = predicted > 0 ? (actual / predicted) * 100 : 0;
                                    const grade = getBatchGrade(actual);

                                    return (
                                        <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(log.timestamp).toLocaleDateString()}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">{log.batchId || log.id}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{log.mushroomStrain || '-'}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-center"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusColor}`}>{statusText}</span></td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-700 text-right">{log.totalYield ? `${log.totalYield.toFixed(1)}` : '-'}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                <div className="flex flex-col items-center">
                                                    <span className={`px-2 py-1 rounded text-xs font-bold ${efficiency >= 90 ? 'bg-green-100 text-green-700' : efficiency >= 70 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                                        {efficiency.toFixed(1)}%
                                                    </span>
                                                    {actual > 0 && <span className={`text-[9px] px-1.5 py-0.5 rounded border mt-1 ${grade.color}`}>{grade.label}</span>}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-center"><div className="flex justify-center space-x-2"><button onClick={() => fetchBatchDetails(log)} className="text-indigo-600 hover:text-indigo-900 text-xs font-medium border border-indigo-200 px-2 py-1 rounded">View</button><button onClick={() => openEditModal(log)} className="text-gray-500 hover:text-gray-800 text-xs font-medium border border-gray-200 px-2 py-1 rounded">Edit</button></div></td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {selectedBatch && (
                <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                    <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setSelectedBatch(null)}></div>
                        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full sm:p-6 animate-fade-in-up">
                            <div className="flex justify-between items-start mb-4">
                                <div><h3 className="text-lg font-bold text-gray-900">{isEditingBatch ? 'Edit Batch Details' : `Batch ${selectedBatch.batchId} History`}</h3><p className="text-sm text-gray-500">Started: {new Date(selectedBatch.timestamp).toLocaleString()}</p></div>
                                <button onClick={() => setSelectedBatch(null)} className="text-gray-400 hover:text-gray-500">×</button>
                            </div>
                            {isEditingBatch ? (
                                <form onSubmit={handleUpdateBatch} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Mushroom Strain</label>
                                        <select value={editBatchStrain} onChange={(e) => setEditBatchStrain(e.target.value)} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm border p-2">
                                            <option value="Oyster">Oyster</option>
                                            <option value="Shiitake">Shiitake</option>
                                            <option value="Button">Button</option>
                                            <option value="Lion's Mane">Lion's Mane</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Initial Details</label>
                                        <textarea value={editBatchDetails} onChange={(e) => setEditBatchDetails(e.target.value)} rows={3} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm border p-2" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Total Yield (kg)</label>
                                            <input type="number" step="0.1" value={editBatchYield} onChange={(e) => setEditBatchYield(e.target.value)} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm border p-2" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Predicted Yield (kg)</label>
                                            <input type="number" step="0.1" value={editBatchPredictedYield} onChange={(e) => setEditBatchPredictedYield(e.target.value)} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm border p-2" />
                                        </div>
                                    </div>
                                    <div className="flex justify-end pt-4">
                                        <button type="submit" disabled={isSavingEdit} className={`px-4 py-2 rounded-md text-sm font-medium text-white ${theme.button}`}>{isSavingEdit ? 'Saving...' : 'Save Changes'}</button>
                                    </div>
                                </form>
                            ) : (
                                <>
                                    <div className="grid grid-cols-2 gap-4 mb-4"><div className="bg-gray-50 rounded-lg p-3 border border-gray-200"><div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Initial Bed Prep</div><p className="text-sm text-gray-800">{selectedBatch.details}</p>{selectedBatch.mushroomStrain && <p className="text-xs text-indigo-600 mt-1 font-medium">Strain: {selectedBatch.mushroomStrain}</p>}{selectedBatch.roomId && <p className="text-xs text-indigo-600 mt-1 font-medium">Room: {selectedBatch.roomId}</p>}</div><div className="bg-green-50 rounded-lg p-3 border border-green-200 flex flex-col justify-center items-center"><div className="text-xs font-bold text-green-700 uppercase tracking-wide mb-1">Total Yield</div><p className="text-2xl font-bold text-green-800">{selectedBatch.totalYield ? selectedBatch.totalYield.toFixed(2) : '0.00'} <span className="text-sm font-normal">kg</span></p><p className="text-xs text-green-600 mt-1 font-medium">Goal: {selectedBatch.predictedYield || 0} kg</p></div></div>
                                    <div className="mt-4 max-h-[300px] overflow-y-auto"><ul className="space-y-4">{batchActivities.map((act) => (<li key={act.id} className="relative pl-6 border-l-2 border-gray-200 hover:border-gray-400 transition-colors"><div className="flex items-center justify-between mb-1"><span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${act.type === 'HARVEST' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>{act.type}</span><span className="text-xs text-gray-400">{new Date(act.timestamp).toLocaleString()}</span></div><p className="text-sm text-gray-800 mb-1">{act.details}</p><p className="text-xs text-gray-400 italic">By {act.userEmail}</p></li>))}</ul></div>
                                    <div className="mt-5 sm:mt-6"><button type="button" className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 ${theme.button} text-base font-medium text-white sm:text-sm`} onClick={() => setSelectedBatch(null)}>Close</button></div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
