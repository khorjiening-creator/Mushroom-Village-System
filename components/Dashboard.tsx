import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, doc, updateDoc, addDoc, setDoc, deleteDoc, query, orderBy, limit, where, onSnapshot } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { 
    VillageType, 
    UserRole, 
    FinancialRecord, 
    ActivityLog, 
    HarvestLog, 
    ProcessingLog, 
    PackagingLogData, 
    DeliveryLogData, 
    InventoryItem, 
    DeliveryRecord, 
    AuditLogEntry 
} from '../types';
import { VILLAGES, COLOR_THEMES } from '../constants';
import { auth, db } from '../services/firebase';

// Sub-components
import { OverviewTab } from './dashboard/OverviewTab';
import { FarmingTab } from './dashboard/FarmingTab';
import { EnvironmentTab } from './dashboard/EnvironmentTab';
import { ResourcesTab } from './dashboard/ResourcesTab';
import { ProcessingFloor } from './dashboard/ProcessingFloor';
import { Packaging } from './dashboard/Packaging';
import { InventoryDelivery } from './dashboard/InventoryDelivery';
import { Reports } from './dashboard/Reports';
import { ProductionAnalysisTab } from './dashboard/ProductionAnalysisTab';
import { FinancialsLedgerTab } from './dashboard/FinancialsLedgerTab';
import { RegistryTab } from './dashboard/RegistryTab';
import { SalesTab } from './dashboard/SalesTab';
import { CostingTab } from './dashboard/CostingTab';
import { TransactionModal } from './TransactionModal';
import { SettleModal } from './SettleModal';

// Global Notification Component for Low Materials
const GlobalLowStockAlert = ({ items, onClose, onAction }: { items: any[], onClose: () => void, onAction: () => void }) => (
    <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-[100] w-full max-w-sm px-4 animate-bounce-subtle">
        <div className="bg-white border-2 border-orange-500 shadow-2xl rounded-2xl p-4 flex items-center gap-4 backdrop-blur-md bg-white/90">
            <div className="h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 animate-pulse">
                <svg className="h-6 w-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <div className="flex-1">
                <h4 className="text-sm font-black text-gray-900 uppercase">Material Shortage!</h4>
                <p className="text-[10px] font-bold text-gray-500">{items.length} supplies are running low. Purchase required.</p>
            </div>
            <div className="flex flex-col gap-1">
                <button onClick={onAction} className="px-3 py-1 bg-orange-600 text-white text-[10px] font-black uppercase rounded-lg hover:bg-orange-700 transition-colors">Buy</button>
                <button onClick={onClose} className="px-3 py-1 text-gray-400 text-[10px] font-bold uppercase hover:text-gray-600 transition-colors">Hide</button>
            </div>
        </div>
    </div>
);

const Toast = ({ message, type, onClose }: { message: string, type: 'success' | 'error', onClose: () => void }) => (
    <div className={`fixed top-4 right-4 z-50 flex items-center p-4 mb-4 rounded-lg shadow-lg transform transition-all duration-300 ease-in-out translate-y-0 ${type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`} role="alert">
        <div className={`inline-flex items-center justify-center flex-shrink-0 w-8 h-8 rounded-lg ${type === 'success' ? 'bg-green-200 text-green-500' : 'bg-red-200 text-red-500'}`}>
            {type === 'success' ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path></svg>
            ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path></svg>
            )}
        </div>
        <div className="ml-3 text-sm font-medium">{message}</div>
        <button type="button" onClick={onClose} className={`ml-auto -mx-1.5 -my-1.5 rounded-lg focus:ring-2 p-1.5 inline-flex h-8 w-8 ${type === 'success' ? 'bg-green-100 text-green-500 hover:bg-green-200' : 'bg-red-100 text-red-800 hover:bg-red-200'}`}>
            <span className="sr-only">Close</span>
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path></svg>
        </button>
    </div>
);

interface DashboardProps {
  villageId: VillageType;
  userEmail: string;
  userName?: string;
  userRole: UserRole;
  isAdmin: boolean;
  staffId: string;
}

export const Dashboard: React.FC<DashboardProps> = ({ villageId, userEmail, userName, userRole, isAdmin, staffId }) => {
  const village = VILLAGES[villageId];
  const theme = COLOR_THEMES[village.color as keyof typeof COLOR_THEMES] || COLOR_THEMES.slate;

  // View State
  const [activeTab, setActiveTab] = useState<'overview' | 'farming' | 'environment' | 'resources' | 'financial' | 'processing' | 'packaging' | 'inventory' | 'reports' | 'registry' | 'analysis' | 'sales' | 'costing'>('overview');
  const [logisticsSubFilter, setLogisticsSubFilter] = useState<'ALL' | 'SCHEDULED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED'>('ALL');
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  // Real-time Data states
  const [financialRecords, setFinancialRecords] = useState<FinancialRecord[]>([]);
  const [farmingLogs, setFarmingLogs] = useState<ActivityLog[]>([]);
  const [harvestLogs, setHarvestLogs] = useState<HarvestLog[]>([]);
  const [processingLogs, setProcessingLogs] = useState<ProcessingLog[]>([]);
  const [packagingHistory, setPackagingHistory] = useState<PackagingLogData[]>([]);
  const [deliveryLogs, setDeliveryLogs] = useState<DeliveryLogData[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [allDeliveries, setAllDeliveries] = useState<DeliveryRecord[]>([]);
  
  // Notification & Alert states
  const [lowStockItems, setLowStockItems] = useState<any[]>([]);
  const [showGlobalLowStockAlert, setShowGlobalLowStockAlert] = useState(false);
  const [hasNotifiedThisSession, setHasNotifiedThisSession] = useState(false);
  
  // Auto-Purchase Trigger
  const [triggerPurchase, setTriggerPurchase] = useState<{ active: boolean, itemId?: string }>({ active: false });

  // Filter Override for Deep Linking (Overview -> Financials)
  const [financialFilterOverride, setFinancialFilterOverride] = useState<{status?: 'ALL' | 'COMPLETED' | 'PENDING', category?: string} | null>(null);

  // Modal State
  const [showTransModal, setShowTransModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<FinancialRecord | null>(null);
  const [isSubmittingTrans, setIsSubmittingTrans] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settleTransaction, setSettleTransaction] = useState<FinancialRecord | null>(null);
  const [isSettling, setIsSettling] = useState(false);

  // Financial Filters
  const [chartFilter, setChartFilter] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'>('MONTHLY');

  const isFinance = userRole === 'finance';
  const isAdminRole = userRole === 'admin';

  // --- Helpers for Financial Collections ---
  const getIncomeCollection = (vid: VillageType) => vid === VillageType.A ? 'income_A' : vid === VillageType.B ? 'income_B' : 'income_C';
  const getExpenseCollection = (vid: VillageType) => vid === VillageType.A ? 'expenses_A' : vid === VillageType.B ? 'expenses_B' : 'expenses_C';
  const getLegacyCollectionName = (vid: VillageType) => vid === VillageType.A ? "financialRecords_A" : vid === VillageType.B ? "financialRecords_B" : "financialRecords_C";

  // --- Real-time Listeners ---
  useEffect(() => {
    if (!villageId) return;

    const resColName = villageId === VillageType.A ? 'resourcesA' : villageId === VillageType.B ? 'resourcesB' : 'resourcesC';
    const unsubResources = onSnapshot(collection(db, resColName), (snapshot) => {
        const lowOnes: any[] = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.quantity <= (data.lowStockThreshold || 0)) {
                lowOnes.push({ id: doc.id, ...data });
            }
        });
        setLowStockItems(lowOnes);
        if (lowOnes.length > 0 && !hasNotifiedThisSession) {
            setShowGlobalLowStockAlert(true);
            setHasNotifiedThisSession(true);
        }
    });

    const qProc = query(collection(db, "processing_logs"), where("villageId", "==", VillageType.C));
    const qInv = query(collection(db, "inventory_items"), where("villageId", "==", villageId));
    const qDelRecords = query(collection(db, "delivery_records"), where("villageId", "==", villageId));

    const unsubProc = onSnapshot(qProc, (snap) => setProcessingLogs(snap.docs.map(d => ({id: d.id, ...d.data()} as ProcessingLog))));
    const unsubInv = onSnapshot(qInv, (snap) => setInventory(snap.docs.map(d => ({id: d.id, ...d.data()} as InventoryItem))));
    const unsubDelRecords = onSnapshot(qDelRecords, (snap) => setAllDeliveries(snap.docs.map(d => ({id: d.id, ...d.data()} as DeliveryRecord))));

    return () => {
        unsubResources();
        unsubProc();
        unsubInv();
        unsubDelRecords();
    };
  }, [villageId, hasNotifiedThisSession]);

  const fetchData = async () => {
    try {
        const qPack = query(collection(db, "Packaging_logs"), where("villageId", "==", villageId));
        const qDel = query(collection(db, "Delivery_logs"), where("villageId", "==", villageId));
        const qAudit = query(collection(db, "audit_logs"), where("villageId", "==", villageId));
        
        const [packS, delS, auditS] = await Promise.all([getDocs(qPack), getDocs(qDel), getDocs(qAudit)]);
        
        setPackagingHistory(packS.docs.map(d => ({id: d.id, ...d.data()} as PackagingLogData)).sort((a,b)=>b.timestamp.localeCompare(a.timestamp)));
        setDeliveryLogs(delS.docs.map(d => ({id: d.id, ...d.data()} as DeliveryLogData)).sort((a,b)=>b.timestamp.localeCompare(a.timestamp)));
        setAuditLogs(auditS.docs.map(d => ({id: d.id, ...d.data()} as AuditLogEntry)).sort((a,b)=>b.timestamp.localeCompare(a.timestamp)));
        
        fetchFinancialRecords();
        fetchProductionData();
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchData(); }, [villageId, activeTab]);

  const fetchFinancialRecords = async () => {
    try {
      const incomeCol = getIncomeCollection(villageId);
      const expenseCol = getExpenseCollection(villageId);
      const oldCol = getLegacyCollectionName(villageId);

      // Removed orderBy to prevent missing index errors. Client-side sort is sufficient.
      const [incSnap, expSnap, oldSnap] = await Promise.all([
          getDocs(query(collection(db, incomeCol), limit(500))),
          getDocs(query(collection(db, expenseCol), limit(500))),
          getDocs(query(collection(db, oldCol), limit(200))) 
      ]);

      const data: FinancialRecord[] = [];
      // Push General/Old collection first
      oldSnap.forEach(doc => data.push({id: doc.id, ...doc.data(), _path: oldCol} as any));
      // Push Specific collections (Income/Expense) second, so they overwrite general ones in the Map deduplication
      // This ensures `_path` points to the specific collection if it exists in both
      incSnap.forEach(doc => data.push({id: doc.id, ...doc.data(), _path: incomeCol} as any));
      expSnap.forEach(doc => data.push({id: doc.id, ...doc.data(), _path: expenseCol} as any));

      // Remove duplicates by ID, keeping the last one seen (which should be from specific collections)
      const uniqueData = Array.from(new Map(data.map(item => [item.id, item])).values());

      uniqueData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setFinancialRecords(uniqueData);
    } catch (error) { console.error("Financial fetch error:", error); }
  };

  const fetchProductionData = async () => {
     try {
         const colName = villageId === VillageType.A ? "dailyfarming_logA" : "dailyfarming_logB";
         let harvestCollection = villageId === VillageType.A ? "harvestYield_A" : "harvestYield_B";
         if (villageId === VillageType.C) return;

         const actSnap = await getDocs(query(collection(db, colName), orderBy("timestamp", "desc"), limit(10)));
         setFarmingLogs(actSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog)));

         const harvSnap = await getDocs(query(collection(db, harvestCollection), orderBy("timestamp", "desc"), limit(10)));
         setHarvestLogs(harvSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as HarvestLog)));
     } catch (e) { console.log("Production data fetch error", e); }
  };

  const financeOverviewData = useMemo(() => {
    const completed = financialRecords.filter(r => r.status === 'COMPLETED' || !r.status);
    const pending = financialRecords.filter(r => r.status === 'PENDING');
    const totalRevenue = completed.filter(r => r.type === 'INCOME').reduce((acc, c) => acc + c.amount, 0);
    const totalExpenses = completed.filter(r => r.type === 'EXPENSE').reduce((acc, c) => acc + c.amount, 0);
    
    const chartMap = new Map<string, { income: number, expense: number, label: string }>();
    const sortedForChart = [...financialRecords].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    sortedForChart.forEach(rec => {
        if (rec.status === 'PENDING') return;
        const date = new Date(rec.date);
        let key = '';
        let label = '';

        if (chartFilter === 'DAILY') {
            key = date.toISOString().split('T')[0];
            label = `${date.getDate()}/${date.getMonth() + 1}`;
        } else if (chartFilter === 'WEEKLY') {
            const firstDay = new Date(date.setDate(date.getDate() - date.getDay()));
            key = firstDay.toISOString().split('T')[0];
            label = `Wk ${firstDay.getDate()}/${firstDay.getMonth() + 1}`;
        } else if (chartFilter === 'MONTHLY') {
            key = `${date.getFullYear()}-${date.getMonth()}`;
            label = date.toLocaleDateString('default', { month: 'short', year: '2-digit' });
        } else {
            key = `${date.getFullYear()}`;
            label = `${date.getFullYear()}`;
        }

        if (!chartMap.has(key)) chartMap.set(key, { income: 0, expense: 0, label });
        const entry = chartMap.get(key)!;
        if (rec.type === 'INCOME') entry.income += rec.amount;
        else entry.expense += rec.amount;
    });

    const chartData = Array.from(chartMap.values());
    const maxChartValue = Math.max(...chartData.map(d => Math.max(d.income, d.expense)), 100);

    return { 
        totalRevenue, totalExpenses, netCashFlow: totalRevenue - totalExpenses, 
        totalReceivables: pending.filter(r => r.type === 'INCOME').reduce((acc, c) => acc + c.amount, 0), 
        totalPayables: pending.filter(r => r.type === 'EXPENSE').reduce((acc, c) => acc + c.amount, 0), 
        receivables: pending.filter(r => r.type === 'INCOME'), payables: pending.filter(r => r.type === 'EXPENSE'), 
        chartData, maxChartValue
    };
  }, [financialRecords, chartFilter]);

  const handleInjectCapital = () => {
      setEditingTransaction({
          id: '',
          type: 'INCOME',
          category: 'Investment',
          amount: 0,
          date: new Date().toISOString().split('T')[0],
          description: 'Capital Injection',
          recordedBy: userEmail,
          villageId,
          status: 'COMPLETED',
          paymentMethod: 'Online Banking'
      });
      setShowTransModal(true);
  };

  const handleSaveTransaction = async (data: Partial<FinancialRecord>) => {
      setIsSubmittingTrans(true);
      // Determine destination collections: Specific (based on type) and General (for aggregate)
      const specificCol = data.type === 'INCOME' ? getIncomeCollection(villageId) : getExpenseCollection(villageId);
      const generalCol = getLegacyCollectionName(villageId);

      try {
          // Sanitize data for Village A and B: remove orderNumber, weightKg, and attachmentName
          let cleanData = { ...data };
          if (villageId === VillageType.A || villageId === VillageType.B) {
              const { orderNumber, weightKg, attachmentName, ...rest } = cleanData;
              cleanData = rest;
          }

          if (editingTransaction?.id) {
              // EDIT MODE
              const oldPath = (editingTransaction as any)._path;
              const id = editingTransaction.id;
              const updateData = { ...cleanData, updatedAt: new Date().toISOString() };

              // 1. Update Specific Collections
              if (oldPath && oldPath !== specificCol) {
                  // If type changed (e.g., Income -> Expense), move documents
                  await deleteDoc(doc(db, oldPath, id));
                  await setDoc(doc(db, specificCol, id), updateData);
              } else {
                  // Standard update
                  await updateDoc(doc(db, specificCol || oldPath || generalCol, id), updateData);
              }

              // 2. Update General Collection (Dual Write)
              // Ensure we have the full object data to save to general collection
              const fullData = { ...editingTransaction, ...updateData };
              delete (fullData as any)._path; // Clean internal field
              
              // We use setDoc with merge to ensure it exists or updates
              await setDoc(doc(db, generalCol, id), fullData, { merge: true });

          } else {
              // CREATE MODE
              const transactionId = "TXN-" + Date.now().toString(); // Use full timestamp to avoid ID collision
              const newRecord = { 
                  ...cleanData, 
                  transactionId, 
                  recordedBy: userEmail, 
                  villageId 
              };

              // 1. Save to Specific Collection (income_X or expenses_X)
              await setDoc(doc(db, specificCol, transactionId), newRecord);
              
              // 2. Save to General Collection (financialRecords_X)
              await setDoc(doc(db, generalCol, transactionId), newRecord);
          }
          
          await fetchFinancialRecords(); // Ensure refresh happens after write is complete
          showNotification("Record saved successfully", "success");
          setShowTransModal(false);
      } catch (error) { 
          console.error("Save transaction error:", error);
          showNotification("Error saving transaction", "error"); 
      } finally { 
          setIsSubmittingTrans(false); 
      }
  };

  const handleSettleTransaction = async (amount: number, date: string, method: string, notes: string, attachmentName?: string) => {
      if (!settleTransaction?.id) return;
      setIsSettling(true);
      
      const specificCol = (settleTransaction as any)._path || (settleTransaction.type === 'INCOME' ? getIncomeCollection(villageId) : getExpenseCollection(villageId));
      const generalCol = getLegacyCollectionName(villageId);

      try {
          const isSupplies = settleTransaction.category === 'Supplies' && settleTransaction.type === 'EXPENSE';
          
          const updateData: any = { 
            status: 'COMPLETED', paymentMethod: method, settledDate: date,
            receivedInStock: isSupplies ? false : true,
            updatedAt: new Date().toISOString()
          };

          // Only add attachmentName if provided, and likely ignore if A/B based on prompt logic, 
          // but strictly speaking user only said 'transaction in financial tab' which covers add/edit. 
          // Settle is an update. For safety, if A/B, we don't save attachmentName even here.
          if (villageId !== VillageType.A && villageId !== VillageType.B) {
              updateData.attachmentName = attachmentName || settleTransaction.attachmentName || null;
          }

          // 1. Update Specific Collection
          await updateDoc(doc(db, specificCol, settleTransaction.id), updateData);

          // 2. Update General Collection
          await updateDoc(doc(db, generalCol, settleTransaction.id), updateData);

          await fetchFinancialRecords();
          showNotification(`Transaction settled.`, "success");
          setShowSettleModal(false);
      } catch (error) { 
          console.error("Settlement error:", error);
          showNotification("Failed to settle", "error"); 
      } finally { 
          setIsSettling(false); 
      }
  };

  const handleSignOut = async () => {
    try {
        await addDoc(collection(db, "activity_logs"), {
            action: 'USER_LOGOUT',
            details: `Member session terminated manually.`,
            userEmail: userEmail,
            villageId: villageId,
            timestamp: new Date().toISOString()
        });
        await signOut(auth);
    } catch (error) { await signOut(auth); }
  };

  const showNotification = (message: string, type: 'success' | 'error') => {
      setNotification({ message, type });
      setTimeout(() => setNotification(null), 3000);
  };

  const navItems = useMemo(() => {
    const baseItems = [
      { id: 'overview', label: 'Overview', icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' },
    ];

    if (villageId !== VillageType.C) {
      // Village A & B
      if (userRole === 'admin' || userRole === 'user') {
          baseItems.push(
            { id: 'farming', label: 'Farming', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
            { id: 'environment', label: 'Environment', icon: 'M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z' },
          );
      }
      // Production Analysis - A & B Finance/Admin
      if (userRole === 'admin' || userRole === 'finance') {
          baseItems.push({ id: 'analysis', label: 'Production Analysis', icon: 'M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z' });
      }
    } else {
      // Village C
      if (userRole === 'admin' || userRole === 'user') {
          baseItems.push(
            { id: 'processing', label: 'Processing Floor', icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z' },
            { id: 'packaging', label: 'Packaging', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
            { id: 'inventory', label: 'Logistics', icon: 'M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z' },
            { id: 'reports', label: 'Reports', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
          );
      }
      // Costing - C Finance/Admin
      if (userRole === 'admin' || userRole === 'finance') {
          baseItems.push({ id: 'costing', label: 'Costing', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' });
      }
      // Sales Hub - C Finance/Sales/Admin
      if (userRole === 'admin' || userRole === 'finance' || userRole === 'sales') {
          baseItems.push({ id: 'sales', label: 'Sales Hub', icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z' });
      }
    }

    // Resources - Common for Ops/Admin/Sales, excluded for Finance to strictly follow request unless Admin
    // Also excluded for Village C as requested
    if ((userRole === 'admin' || userRole === 'user' || userRole === 'sales') && villageId !== VillageType.C) {
         baseItems.push({ id: 'resources', label: 'Resources', icon: 'M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4' });
    }

    // Financials - Finance/Admin
    if (userRole === 'admin' || userRole === 'finance') {
      baseItems.push({ id: 'financial', label: 'Financials', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' });
    }

    if (userRole === 'admin') {
      baseItems.push({ id: 'registry', label: 'Registry', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' });
    }

    return baseItems;
  }, [villageId, userRole]);

  return (
    <div className={`min-h-screen ${theme.bgSoft} flex flex-col transition-colors duration-500`}>
      {notification && <Toast message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
      
      {showGlobalLowStockAlert && lowStockItems.length > 0 && (
          <GlobalLowStockAlert 
            items={lowStockItems} 
            onClose={() => setShowGlobalLowStockAlert(false)} 
            onAction={() => { setActiveTab('resources'); setShowGlobalLowStockAlert(false); setTriggerPurchase({ active: true, itemId: lowStockItems[0]?.id }); }}
          />
      )}

      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
             <div className={`px-4 py-2 rounded-xl ${theme.bgLight} ${theme.textMain} border font-black tracking-tight`}>{village.name}</div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
                <p className="text-sm font-bold text-gray-900">{userName || 'User'}</p>
                <div className="flex items-center justify-end gap-1.5">
                    <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-bold text-slate-500 border border-slate-200">{staffId}</span>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{userRole}</p>
                </div>
            </div>
            <button onClick={handleSignOut} className="text-xs font-black text-red-600 hover:bg-red-50 px-3 py-2 rounded-xl border border-red-100">Sign Out</button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="border-b border-gray-200 mb-8 overflow-x-auto">
            <nav className="-mb-px flex space-x-8">
                {navItems.map(item => (
                    <button 
                        key={item.id}
                        onClick={() => setActiveTab(item.id as any)} 
                        className={`${activeTab === item.id ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500'} whitespace-nowrap py-4 px-1 border-b-2 font-bold text-sm transition-all`}
                    >
                        {item.label}
                    </button>
                ))}
            </nav>
        </div>

        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 min-h-[600px] p-6 sm:p-8">
            {activeTab === 'overview' && (
                <OverviewTab 
                    villageId={villageId} userName={userName || 'User'} theme={theme} isFinance={isFinance || isAdminRole} 
                    financeOverviewData={financeOverviewData} setActiveTab={setActiveTab} 
                    openEditTransModal={(r) => {setEditingTransaction(r); setShowTransModal(true);}} 
                    chartFilter={chartFilter} setChartFilter={setChartFilter}
                    userRole={userRole}
                    setFinancialFilterOverride={setFinancialFilterOverride}
                    financialRecords={financialRecords}
                />
            )}
            {activeTab === 'farming' && <FarmingTab villageId={villageId} userEmail={userEmail} theme={theme} farmingLogs={farmingLogs} onActivityLogged={fetchProductionData} onSuccess={(msg) => showNotification(msg, 'success')} onError={(msg) => showNotification(msg, 'error')} setActiveTab={setActiveTab} />}
            {activeTab === 'environment' && <EnvironmentTab villageId={villageId} userEmail={userEmail} theme={theme} onSuccess={(msg) => showNotification(msg, 'success')} onError={(msg) => showNotification(msg, 'error')} setActiveTab={setActiveTab} />}
            {activeTab === 'resources' && <ResourcesTab villageId={villageId} userEmail={userEmail} theme={theme} onSuccess={(msg) => showNotification(msg, 'success')} financialRecords={financialRecords} initialPurchaseState={triggerPurchase} onResetPurchaseState={() => setTriggerPurchase({ active: false })} />}
            {activeTab === 'sales' && <SalesTab villageId={villageId} userEmail={userEmail} staffId={staffId} userRole={userRole} isAdmin={isAdmin} theme={theme} onSuccess={(msg) => showNotification(msg, 'success')} onError={(msg) => showNotification(msg, 'error')} financialRecords={financialRecords} />}
            {activeTab === 'costing' && <CostingTab villageId={villageId} userEmail={userEmail} theme={theme} onSuccess={(msg) => showNotification(msg, 'success')} onError={(msg) => showNotification(msg, 'error')} />}
            {activeTab === 'processing' && <ProcessingFloor villageId={villageId} userEmail={userEmail} theme={theme} processingLogs={processingLogs} onRefresh={fetchData} handleDeleteLog={async (col, id) => { if(confirm("Delete?")) { await deleteDoc(doc(db, col, id)); fetchData(); } }} handleClearQueue={fetchData} />}
            {activeTab === 'packaging' && <Packaging villageId={villageId} userEmail={userEmail} theme={theme} processingLogs={processingLogs} onRefresh={fetchData} />}
            {activeTab === 'inventory' && <InventoryDelivery villageId={villageId} userEmail={userEmail} onRefresh={fetchData} initialFilter={logisticsSubFilter} />}
            {activeTab === 'reports' && <Reports processingLogs={processingLogs} packagingHistory={packagingHistory} deliveryLogs={deliveryLogs} allDeliveries={allDeliveries} />}
            {activeTab === 'analysis' && <ProductionAnalysisTab villageId={villageId} userEmail={userEmail} />}
            
            {activeTab === 'financial' && (
                <FinancialsLedgerTab 
                    records={financialRecords} 
                    villageId={villageId}
                    onAddRecord={() => {setEditingTransaction(null); setShowTransModal(true);}} 
                    onEditRecord={(r) => {setEditingTransaction(r); setShowTransModal(true);}} 
                    onSettleRecord={(r) => {setSettleTransaction(r); setShowSettleModal(true);}}
                    onInjectCapital={handleInjectCapital}
                    onDeleteRecord={async (id) => {
                        if (confirm("Delete this record permanently?")) {
                            const recordToDelete = financialRecords.find(r => r.id === id);
                            if (!recordToDelete) return;

                            const generalPath = getLegacyCollectionName(villageId);
                            // Determine specific path based on type if _path is missing or generic
                            let specificPath = (recordToDelete as any)?._path;
                            
                            if (!specificPath || specificPath === generalPath) {
                                if (recordToDelete.type === 'INCOME') specificPath = getIncomeCollection(villageId);
                                else if (recordToDelete.type === 'EXPENSE') specificPath = getExpenseCollection(villageId);
                            }
                            
                            try {
                                const promises = [];
                                // Always delete from General to be safe
                                promises.push(deleteDoc(doc(db, generalPath, id)));
                                
                                // Delete from Specific if different and exists
                                if (specificPath && specificPath !== generalPath) {
                                    promises.push(deleteDoc(doc(db, specificPath, id)));
                                }
                                
                                await Promise.all(promises);
                                showNotification("Record deleted successfully", "success");
                                fetchFinancialRecords();
                            } catch (error) {
                                console.error("Delete failed", error);
                                showNotification("Failed to delete record", "error");
                            }
                        }
                    }} 
                    onPrintRecord={(rec) => { const win = window.open('', '_blank'); win?.document.write(`<pre>${JSON.stringify(rec, null, 2)}</pre>`); win?.document.close(); }}
                    userRole={userRole} theme={theme} financeOverviewData={financeOverviewData} 
                    onFilterChange={() => {}} chartFilter={chartFilter} setChartFilter={setChartFilter}
                    filterOverride={financialFilterOverride}
                    onFilterApplied={() => setFinancialFilterOverride(null)}
                />
            )}
            {activeTab === 'registry' && isAdminRole && <RegistryTab adminEmail={userEmail} />}
        </div>
      </main>

      <TransactionModal isOpen={showTransModal} onClose={() => setShowTransModal(false)} onSave={handleSaveTransaction} initialData={editingTransaction} villageId={villageId} userEmail={userEmail} isSubmitting={isSubmittingTrans} />
      <SettleModal isOpen={showSettleModal} onClose={() => setShowSettleModal(false)} onConfirm={handleSettleTransaction} record={settleTransaction} isSubmitting={isSettling} />
    </div>
  );
};