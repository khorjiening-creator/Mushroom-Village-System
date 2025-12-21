
import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, doc, updateDoc, addDoc, setDoc, deleteDoc, query, orderBy, limit, where, onSnapshot } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { 
    VillageType, 
    UserRole, 
    FinancialRecord, 
    ActivityLog, 
    HarvestLog, 
    ResourceItem, 
    VillageRole,
    ProcessingLog,
    PackagingLogData,
    DeliveryLogData,
    InventoryItem,
    DeliveryRecord,
    AuditLogEntry
} from '../types';
import { VILLAGES, COLOR_THEMES } from '../constants';
import { auth, db } from '../services/firebase';

// Shared Layout Components
import { OverviewTab } from './dashboard/OverviewTab';
import { FarmingTab } from './dashboard/FarmingTab';
import { EnvironmentTab } from './dashboard/EnvironmentTab';
import { ResourcesTab } from './dashboard/ResourcesTab';
import { FinancialsTab } from './dashboard/FinancialsTab';
import { RegistryTab } from './dashboard/RegistryTab';
// Fix: Added missing imports for components used in Village C workflow
import { ProcessingFloor } from './dashboard/ProcessingFloor';
import { Packaging } from './dashboard/Packaging';
import { InventoryDelivery } from './dashboard/InventoryDelivery';
import { Reports } from './dashboard/Reports';
import { ProductionAnalysisTab } from './dashboard/ProductionAnalysisTab';
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

// Toast Notification Component
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
        <button type="button" onClick={onClose} className={`ml-auto -mx-1.5 -my-1.5 rounded-lg focus:ring-2 p-1.5 inline-flex h-8 w-8 ${type === 'success' ? 'bg-green-100 text-green-500 hover:bg-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
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
}

export const Dashboard: React.FC<DashboardProps> = ({ villageId, userEmail, userName, userRole, isAdmin }) => {
  const village = VILLAGES[villageId];
  const theme = COLOR_THEMES[village.color as keyof typeof COLOR_THEMES] || COLOR_THEMES.slate;

  // View State
  const [activeTab, setActiveTab] = useState<'overview' | 'farming' | 'environment' | 'resources' | 'financial' | 'processing' | 'packaging' | 'inventory' | 'reports' | 'registry' | 'analysis'>('overview');
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

  // --- Helpers for Financial Collections ---
  const getIncomeCollection = (vid: VillageType) => vid === VillageType.A ? 'income_A' : vid === VillageType.B ? 'income_B' : 'income_C';
  const getExpenseCollection = (vid: VillageType) => vid === VillageType.A ? 'expenses_A' : vid === VillageType.B ? 'expenses_B' : 'expenses_C';

  // --- Real-time Listeners (Unified) ---
  useEffect(() => {
    if (!villageId) return;

    // A & B Resource Monitoring
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

    // Village C Processing Monitoring
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
        
        // Fetch production/financial shared data
        fetchFinancialRecords();
        fetchProductionData();
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchData(); }, [villageId, activeTab]);

  const fetchFinancialRecords = async () => {
    try {
      const incomeCol = getIncomeCollection(villageId);
      const expenseCol = getExpenseCollection(villageId);
      const oldCol = villageId === VillageType.A ? "financialRecords_A" : villageId === VillageType.B ? "financialRecords_B" : "financialRecords_C";

      // Parallel Fetch
      const [incSnap, expSnap, oldSnap] = await Promise.all([
          getDocs(query(collection(db, incomeCol), limit(200))),
          getDocs(query(collection(db, expenseCol), limit(200))),
          getDocs(query(collection(db, oldCol), limit(100))) // Legacy support
      ]);

      const data: FinancialRecord[] = [];
      // Tag records with their source collection to handle legacy data correctly during updates
      incSnap.forEach(doc => data.push({id: doc.id, ...doc.data(), _path: incomeCol} as any));
      expSnap.forEach(doc => data.push({id: doc.id, ...doc.data(), _path: expenseCol} as any));
      oldSnap.forEach(doc => data.push({id: doc.id, ...doc.data(), _path: oldCol} as any));

      data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setFinancialRecords(data);

      // Automatic Capital Generation if Ledger is Empty (For Village A & B)
      if ((villageId === VillageType.A || villageId === VillageType.B) && data.length === 0) {
          const initialCapital = {
              transactionId: "TXN-INIT-CAP",
              type: 'INCOME' as const,
              category: 'Investment',
              amount: 50000,
              date: new Date().toISOString().split('T')[0],
              description: "Initial Operating Capital Injection",
              recordedBy: "System",
              villageId: villageId,
              status: 'COMPLETED' as const,
              createdAt: new Date().toISOString()
          };
          // Add directly to DB and State to avoid re-fetch cycle
          await addDoc(collection(db, incomeCol), initialCapital);
          setFinancialRecords([initialCapital as FinancialRecord]); // Set initial state
      }

    } catch (error) { console.error("Financial fetch error:", error); }
  };

  const fetchProductionData = async () => {
     try {
         const colName = villageId === VillageType.A ? "dailyfarming_logA" : "dailyfarming_logB";
         let harvestCollection = villageId === VillageType.A ? "harvestYield_A" : "harvestYield_B";
         if (villageId === VillageType.C) return;

         const actSnap = await getDocs(query(collection(db, colName), orderBy("timestamp", "desc"), limit(5)));
         setFarmingLogs(actSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog)));

         const harvSnap = await getDocs(query(collection(db, harvestCollection), orderBy("timestamp", "desc"), limit(5)));
         setHarvestLogs(harvSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as HarvestLog)));
     } catch (e) { console.log("Production data fetch error", e); }
  };

  const expiryWarnings = useMemo(() => {
    const today = new Date();
    const warnLimit = new Date();
    warnLimit.setDate(today.getDate() + 3);
    return inventory.filter(item => {
        const expDate = new Date(item.expiryDate);
        return expDate <= warnLimit && expDate >= today;
    });
  }, [inventory]);

  const financeOverviewData = useMemo(() => {
    const completed = financialRecords.filter(r => r.status === 'COMPLETED' || !r.status);
    const pending = financialRecords.filter(r => r.status === 'PENDING');
    const totalRevenue = completed.filter(r => r.type === 'INCOME').reduce((acc, c) => acc + c.amount, 0);
    const totalExpenses = completed.filter(r => r.type === 'EXPENSE').reduce((acc, c) => acc + c.amount, 0);
    
    // Aggregating Chart Data based on current filter
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

  // Track pending supply receipts (Paid but not marked as received)
  const pendingReceiptsCount = useMemo(() => {
    return financialRecords.filter(rec => 
        rec.category === 'Supplies' && 
        rec.type === 'EXPENSE' && 
        rec.status === 'COMPLETED' && 
        rec.receivedInStock === false && 
        rec.materialId // Only count items that are linked to resources
    ).length;
  }, [financialRecords]);

  const navigateToLogistics = (filter: 'SCHEDULED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED') => {
    setLogisticsSubFilter(filter);
    setActiveTab('inventory');
  };

  const handleDeleteLog = async (collectionName: string, logId: string, e?: any) => {
    if (!window.confirm("Are you sure?")) return;
    try {
        // Since we split collections, try deleting from both Income and Expense if strictly financial
        if (collectionName.includes('financialRecords')) {
             const incCol = getIncomeCollection(villageId);
             const expCol = getExpenseCollection(villageId);
             try { await deleteDoc(doc(db, incCol, logId)); } catch {}
             try { await deleteDoc(doc(db, expCol, logId)); } catch {}
             // Also try old collection just in case
             try { await deleteDoc(doc(db, collectionName, logId)); } catch {}
        } else {
             await deleteDoc(doc(db, collectionName, logId));
        }
        fetchData();
    } catch (error) { console.error("Deletion Failed:", error); }
  };

  const handleClearQueue = async () => {
    const step6Batches = processingLogs.filter(l => l.currentStep === 6);
    if (step6Batches.length === 0 || !window.confirm("Clear all items?")) return;
    await Promise.all(step6Batches.map(b => deleteDoc(doc(db, "processing_logs", b.id))));
    fetchData();
  };

  const showNotification = (message: string, type: 'success' | 'error') => {
      setNotification({ message, type });
      setTimeout(() => setNotification(null), 3000);
  };

  const handleSaveTransaction = async (data: Partial<FinancialRecord>) => {
      setIsSubmittingTrans(true);
      
      const targetCol = data.type === 'INCOME' ? getIncomeCollection(villageId) : getExpenseCollection(villageId);

      try {
          if (editingTransaction?.id) {
              const currentPath = (editingTransaction as any)._path;
              
              // Handle potential legacy migration or type change
              if (currentPath && currentPath !== targetCol) {
                  // Move record to correct new collection
                  await deleteDoc(doc(db, currentPath, editingTransaction.id));
                  const transactionId = editingTransaction.transactionId || "TXN-" + Date.now();
                  await setDoc(doc(db, targetCol, editingTransaction.id), { ...data, transactionId });
              } else {
                  await updateDoc(doc(db, targetCol, editingTransaction.id), { ...data });
              }
              showNotification("Transaction updated", "success");
          } else {
              const transactionId = "TXN-" + Date.now().toString().slice(-6);
              await addDoc(collection(db, targetCol), { ...data, transactionId });
              showNotification("Transaction added", "success");
          }
          setShowTransModal(false);
          fetchFinancialRecords();
      } catch (error) { showNotification("Failed to save", "error"); } finally { setIsSubmittingTrans(false); }
  };

  const handleSettleTransaction = async (amount: number, date: string, method: string, notes: string, attachmentName?: string) => {
      if (!settleTransaction?.id) return;
      setIsSettling(true);
      
      // Determine correct collection path: use _path if available (legacy support), otherwise infer from type
      const targetCol = (settleTransaction as any)._path || (settleTransaction.type === 'INCOME' ? getIncomeCollection(villageId) : getExpenseCollection(villageId));
      
      try {
          // Track received status for supply goods specifically when payment is finalized
          const isSupplies = settleTransaction.category === 'Supplies' && settleTransaction.type === 'EXPENSE';
          
          await updateDoc(doc(db, targetCol, settleTransaction.id), { 
            status: 'COMPLETED', 
            paymentMethod: method, 
            settledDate: date,
            attachmentName: attachmentName || settleTransaction.attachmentName || null,
            receivedInStock: isSupplies ? false : true // Initialize as false if it's a supply purchase to be confirmed in Resources
          });
          showNotification(`Transaction settled.`, "success");
          setShowSettleModal(false);
          fetchFinancialRecords();
      } catch (error) { showNotification("Failed to settle", "error"); } finally { setIsSettling(false); }
  };

  const handleInjectCapital = async () => {
      if (!confirm("Inject RM 10,000 capital? This will be recorded as Investment Income.")) return;
      
      const colId = getIncomeCollection(villageId);
      const amount = 10000;
      const newRecord = {
          transactionId: "TXN-INJ-" + Date.now().toString().slice(-6),
          type: 'INCOME' as const,
          category: 'Investment',
          amount: amount,
          date: new Date().toISOString().split('T')[0],
          description: "Emergency Capital Injection",
          recordedBy: userEmail,
          villageId: villageId,
          status: 'COMPLETED' as const,
          createdAt: new Date().toISOString()
      };
      
      try {
          await addDoc(collection(db, colId), newRecord);
          fetchFinancialRecords();
          showNotification(`Successfully injected RM${amount.toLocaleString()} capital.`, 'success');
      } catch (error) {
          console.error("Injection failed", error);
          showNotification("Failed to inject capital.", 'error');
      }
  };

  const openEditTransModal = (rec: FinancialRecord) => { setEditingTransaction(rec); setShowTransModal(true); };
  const openSettleTransModal = (rec: FinancialRecord) => { setSettleTransaction(rec); setShowSettleModal(true); };

  return (
    <div className={`min-h-screen ${theme.bgSoft} flex flex-col transition-colors duration-500 relative`}>
      {notification && <Toast message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
      
      {showGlobalLowStockAlert && lowStockItems.length > 0 && (
          <GlobalLowStockAlert 
            items={lowStockItems} 
            onClose={() => setShowGlobalLowStockAlert(false)} 
            onAction={() => { 
                setActiveTab('resources'); 
                setShowGlobalLowStockAlert(false);
                setTriggerPurchase({ active: true, itemId: lowStockItems[0]?.id });
            }}
          />
      )}

      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex flex-col">
            <h1 className={`text-2xl font-bold ${theme.textMain}`}>{village.name} Dashboard</h1>
            <div className="text-xs text-gray-500 flex items-center gap-2">
                <span className="font-semibold">{userName || userEmail}</span>
                <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                <span className="uppercase font-bold text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100">{userRole}</span>
            </div>
          </div>
          <div className="flex items-center space-x-4">
             {expiryWarnings.length > 0 && (
                 <div className="bg-red-100 text-red-700 px-3 py-1 rounded-lg text-xs font-black animate-pulse">
                     {expiryWarnings.length} EXPIRY ALERTS
                 </div>
             )}
             <button onClick={() => signOut(auth)} className="text-xs font-bold text-red-600 hover:bg-red-50 px-3 py-2 rounded-md transition-colors">Sign Out</button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="border-b border-gray-200 mb-6 overflow-x-auto no-print">
            <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                <button onClick={() => setActiveTab('overview')} className={`${activeTab === 'overview' ? `border-indigo-500 text-indigo-600` : 'border-transparent text-gray-500'} whitespace-nowrap py-4 px-1 border-b-2 font-bold text-sm transition-colors`}>Overview</button>
                
                {village.role === VillageRole.FARMING && (
                    <>
                        {userRole !== 'finance' && (
                            <>
                                <button onClick={() => setActiveTab('farming')} className={`${activeTab === 'farming' ? `border-green-500 text-green-600` : 'border-transparent text-gray-500'} whitespace-nowrap py-4 px-1 border-b-2 font-bold text-sm transition-colors`}>Farming</button>
                                <button onClick={() => setActiveTab('environment')} className={`${activeTab === 'environment' ? `border-green-500 text-green-600` : 'border-transparent text-gray-500'} whitespace-nowrap py-4 px-1 border-b-2 font-bold text-sm transition-colors`}>Environment</button>
                            </>
                        )}
                        {(userRole === 'admin' || userRole === 'finance') && (
                            <button onClick={() => setActiveTab('analysis')} className={`${activeTab === 'analysis' ? `border-green-500 text-green-600` : 'border-transparent text-gray-500'} whitespace-nowrap py-4 px-1 border-b-2 font-bold text-sm transition-colors`}>Analysis</button>
                        )}
                    </>
                )}

                {village.role === VillageRole.PROCESSING && (
                    <>
                        <button onClick={() => setActiveTab('processing')} className={`${activeTab === 'processing' ? `border-blue-500 text-blue-600` : 'border-transparent text-gray-500'} whitespace-nowrap py-4 px-1 border-b-2 font-bold text-sm transition-colors`}>Processing</button>
                        <button onClick={() => setActiveTab('packaging')} className={`${activeTab === 'packaging' ? `border-blue-500 text-blue-600` : 'border-transparent text-gray-500'} whitespace-nowrap py-4 px-1 border-b-2 font-bold text-sm transition-colors`}>Packaging</button>
                        <button onClick={() => setActiveTab('inventory')} className={`${activeTab === 'inventory' ? `border-blue-500 text-blue-600` : 'border-transparent text-gray-500'} whitespace-nowrap py-4 px-1 border-b-2 font-bold text-sm transition-colors`}>Inventory & Delivery</button>
                        <button onClick={() => setActiveTab('reports')} className={`${activeTab === 'reports' ? `border-blue-500 text-blue-600` : 'border-transparent text-gray-500'} whitespace-nowrap py-4 px-1 border-b-2 font-bold text-sm transition-colors`}>Reports</button>
                    </>
                )}

                {userRole !== 'finance' && (
                    <button onClick={() => setActiveTab('resources')} className={`${activeTab === 'resources' ? `border-indigo-500 text-indigo-600` : 'border-transparent text-gray-500'} whitespace-nowrap py-4 px-1 border-b-2 font-bold text-sm transition-colors relative`}>
                        Resources
                        {lowStockItems.length > 0 && <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full ring-2 ring-white">!</span>}
                        {pendingReceiptsCount > 0 && <span className="absolute -top-1 -right-8 bg-blue-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full ring-2 ring-white flex items-center shadow-sm" title="Items awaiting confirmation">+{pendingReceiptsCount}</span>}
                    </button>
                )}
                
                {(isFinance || isAdmin) && (
                    <button onClick={() => setActiveTab('financial')} className={`${activeTab === 'financial' ? `border-indigo-500 text-indigo-600` : 'border-transparent text-gray-500'} whitespace-nowrap py-4 px-1 border-b-2 font-bold text-sm transition-colors`}>Financials</button>
                )}
                {isAdmin && (
                    <button onClick={() => setActiveTab('registry')} className={`${activeTab === 'registry' ? `border-slate-500 text-slate-600` : 'border-transparent text-gray-500'} whitespace-nowrap py-4 px-1 border-b-2 font-bold text-sm transition-colors`}>User Registry</button>
                )}
            </nav>
        </div>

        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 min-h-[600px] p-6 sm:p-8">
            {activeTab === 'overview' && (
                <div className="space-y-10">
                    <OverviewTab 
                        villageId={villageId} 
                        userName={userName || 'User'} 
                        theme={theme} 
                        userRole={userRole}
                        isFinance={isFinance}
                        financeOverviewData={financeOverviewData}
                        financialRecords={financialRecords}
                        setActiveTab={setActiveTab}
                        openEditTransModal={openEditTransModal}
                        chartFilter={chartFilter}
                        setChartFilter={setChartFilter}
                    />
                    
                    {villageId === VillageType.C && (
                        <div className="space-y-6 pt-6 border-t">
                            <div className="flex justify-between items-center">
                                <h2 className="text-xl font-black text-gray-800 uppercase tracking-tight">Logistics Board</h2>
                                <button onClick={() => setActiveTab('inventory')} className="text-xs font-bold text-blue-600 hover:underline uppercase">Full Dashboard</button>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <button onClick={() => navigateToLogistics('SCHEDULED')} className="p-4 bg-yellow-50 rounded-xl border border-yellow-100 text-left">
                                    <div className="text-[10px] font-bold text-yellow-600 uppercase mb-1">Scheduled</div>
                                    <div className="text-2xl font-black text-gray-800">{allDeliveries.filter(d => d.status === 'SCHEDULED').length}</div>
                                </button>
                                <button onClick={() => navigateToLogistics('OUT_FOR_DELIVERY')} className="p-4 bg-blue-50 rounded-xl border border-blue-100 text-left">
                                    <div className="text-[10px] font-bold text-blue-600 uppercase mb-1">In Transit</div>
                                    <div className="text-2xl font-black text-gray-800">{allDeliveries.filter(d => d.status === 'OUT_FOR_DELIVERY').length}</div>
                                </button>
                                <button onClick={() => navigateToLogistics('DELIVERED')} className="p-4 bg-green-50 rounded-xl border border-green-100 text-left">
                                    <div className="text-[10px] font-bold text-green-600 uppercase mb-1">Delivered</div>
                                    <div className="text-2xl font-black text-gray-800">{allDeliveries.filter(d => d.status === 'DELIVERED').length}</div>
                                </button>
                                <button onClick={() => navigateToLogistics('FAILED')} className="p-4 bg-red-50 rounded-xl border border-red-100 text-left">
                                    <div className="text-[10px] font-bold text-red-600 uppercase mb-1">Failed</div>
                                    <div className="text-2xl font-black text-gray-800">{allDeliveries.filter(d => d.status === 'FAILED').length}</div>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
            
            {activeTab === 'farming' && <FarmingTab villageId={villageId} userEmail={userEmail} theme={theme} farmingLogs={farmingLogs} onActivityLogged={fetchProductionData} onSuccess={(msg) => showNotification(msg, 'success')} onError={(msg) => showNotification(msg, 'error')} />}
            {activeTab === 'environment' && <EnvironmentTab villageId={villageId} userEmail={userEmail} theme={theme} onSuccess={(msg) => showNotification(msg, 'success')} onError={(msg) => showNotification(msg, 'error')} setActiveTab={setActiveTab} />}
            {activeTab === 'analysis' && (userRole === 'admin' || userRole === 'finance') && <ProductionAnalysisTab villageId={villageId} userEmail={userEmail} />}
            {activeTab === 'resources' && (
                <ResourcesTab 
                    villageId={villageId} 
                    userEmail={userEmail} 
                    theme={theme} 
                    onSuccess={(msg) => showNotification(msg, 'success')} 
                    financialRecords={financialRecords}
                    initialPurchaseState={triggerPurchase}
                    onResetPurchaseState={() => setTriggerPurchase({ active: false })}
                />
            )}
            
            {activeTab === 'processing' && <ProcessingFloor villageId={villageId} userEmail={userEmail} theme={theme} processingLogs={processingLogs} onRefresh={fetchData} handleDeleteLog={handleDeleteLog} handleClearQueue={handleClearQueue} />}
            {activeTab === 'packaging' && <Packaging villageId={villageId} userEmail={userEmail} theme={theme} processingLogs={processingLogs} onRefresh={fetchData} />}
            {activeTab === 'inventory' && <InventoryDelivery villageId={villageId} userEmail={userEmail} onRefresh={fetchData} initialFilter={logisticsSubFilter} />}
            {activeTab === 'reports' && <Reports processingLogs={processingLogs} packagingHistory={packagingHistory} deliveryLogs={deliveryLogs} allDeliveries={allDeliveries} />}
            
            {activeTab === 'financial' && (
                <FinancialsTab 
                    records={financialRecords}
                    onAddRecord={() => { setEditingTransaction(null); setShowTransModal(true); }}
                    onEditRecord={openEditTransModal}
                    onDeleteRecord={(id) => handleDeleteLog(villageId === VillageType.C ? "financialRecords_C" : villageId === VillageType.A ? "financialRecords_A" : "financialRecords_B", id)}
                    onSettleRecord={openSettleTransModal}
                    onInjectCapital={handleInjectCapital}
                    userRole={userRole}
                    theme={theme}
                    financeOverviewData={financeOverviewData}
                    chartFilter={chartFilter}
                    setChartFilter={setChartFilter}
                    onFilterChange={() => {}}
                    villageId={villageId}
                />
            )}
            
            {activeTab === 'registry' && isAdmin && (
                <div className="space-y-10">
                    <RegistryTab adminEmail={userEmail} />
                    <div className="pt-10 border-t">
                        <h2 className="text-xl font-bold mb-6">System Audit Trail</h2>
                        <div className="bg-gray-50 rounded-2xl border overflow-hidden">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-100">
                                    <tr><th className="px-6 py-3 text-left text-[10px] font-bold uppercase text-gray-500">Time</th><th className="px-6 py-3 text-left text-xs font-bold uppercase text-gray-500">Action</th><th className="px-6 py-3 text-left text-[10px] font-bold uppercase text-gray-500">User</th></tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {auditLogs.slice(0, 10).map(log => (
                                        <tr key={log.id} className="text-xs">
                                            <td className="px-6 py-4 font-mono">{new Date(log.timestamp).toLocaleString()}</td>
                                            <td className="px-6 py-4 font-bold">{log.action}</td>
                                            <td className="px-6 py-4">{log.performedBy}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
      </main>

      <TransactionModal 
          isOpen={showTransModal}
          onClose={() => { setShowTransModal(false); setEditingTransaction(null); }}
          onSave={handleSaveTransaction}
          onDelete={(isFinance || isAdmin) ? async () => { 
              // Handle deletion via the main handler to respect collection splitting
              // Pass the specific collection name for legacy support in deletion logic
              const legacyCol = villageId === VillageType.C ? "financialRecords_C" : villageId === VillageType.A ? "financialRecords_A" : "financialRecords_B";
              handleDeleteLog(legacyCol, editingTransaction!.id);
              setShowTransModal(false);
          } : undefined}
          initialData={editingTransaction}
          villageId={villageId}
          userEmail={userEmail}
          isSubmitting={isSubmittingTrans}
      />

      <SettleModal 
          isOpen={showSettleModal}
          onClose={() => { setShowSettleModal(false); setSettleTransaction(null); }}
          onConfirm={handleSettleTransaction}
          record={settleTransaction}
          isSubmitting={isSettling}
      />
    </div>
  );
};
