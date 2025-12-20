
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
  const [activeTab, setActiveTab] = useState<'overview' | 'farming' | 'environment' | 'resources' | 'financial' | 'processing' | 'packaging' | 'inventory' | 'reports' | 'registry'>('overview');
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
      const colName = villageId === VillageType.A ? "financialRecords_A" : villageId === VillageType.B ? "financialRecords_B" : "financialRecords_C";
      const q = query(collection(db, colName), limit(300));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()} as FinancialRecord));
      data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setFinancialRecords(data);
    } catch (error) { console.error("Financial fetch error:", error); }
  };

  const fetchProductionData = async () => {
     try {
         const colName = villageId === VillageType.A ? "dailyfarming_logA" : "dailyfarming_logB";
         let harvestCollection = villageId === VillageType.A ? "harvestYield_A" : "harvestYield_B";
         if (villageId === VillageType.C) return;

         const actSnap = await getDocs(query(collection(db, colName), orderBy("timestamp", "desc"), limit(5)));
         setFarmingLogs(actSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog)));

         const harvSnap = await getDocs(query(collection(db, harvestCollection), orderBy("timestamp", "desc"), limit(50)));
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
    const chartData: any[] = []; // Simplified for merge
    return { 
        totalRevenue, totalExpenses, netCashFlow: totalRevenue - totalExpenses, 
        totalReceivables: pending.filter(r => r.type === 'INCOME').reduce((acc, c) => acc + c.amount, 0), 
        totalPayables: pending.filter(r => r.type === 'EXPENSE').reduce((acc, c) => acc + c.amount, 0), 
        receivables: pending.filter(r => r.type === 'INCOME'), payables: pending.filter(r => r.type === 'EXPENSE'), 
        chartData, maxChartValue: 100
    };
  }, [financialRecords]);

  const navigateToLogistics = (filter: 'SCHEDULED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED') => {
    setLogisticsSubFilter(filter);
    setActiveTab('inventory');
  };

  const handleDeleteLog = async (collectionName: string, logId: string, e?: any) => {
    if (!window.confirm("Are you sure?")) return;
    try {
        await deleteDoc(doc(db, collectionName, logId));
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
      const colName = villageId === VillageType.A ? "financialRecords_A" : villageId === VillageType.B ? "financialRecords_B" : "financialRecords_C";
      try {
          if (editingTransaction?.id) {
              await updateDoc(doc(db, colName, editingTransaction.id), { ...data });
              showNotification("Transaction updated", "success");
          } else {
              const transactionId = "TXN-" + Date.now().toString().slice(-6);
              await setDoc(doc(db, colName, transactionId), { ...data, transactionId });
              showNotification("Transaction added", "success");
          }
          setShowTransModal(false);
          fetchFinancialRecords();
      } catch (error) { showNotification("Failed to save", "error"); } finally { setIsSubmittingTrans(false); }
  };

  const handleSettleTransaction = async (amount: number, date: string, method: string, notes: string, attachmentName?: string) => {
      if (!settleTransaction?.id) return;
      setIsSettling(true);
      const colName = villageId === VillageType.A ? "financialRecords_A" : villageId === VillageType.B ? "financialRecords_B" : "financialRecords_C";
      try {
          // Track received status for supply goods specifically when payment is finalized
          const isSupplies = settleTransaction.category === 'Supplies' && settleTransaction.type === 'EXPENSE';
          
          await updateDoc(doc(db, colName, settleTransaction.id), { 
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

  const openEditTransModal = (rec: FinancialRecord) => { setEditingTransaction(rec); setShowTransModal(true); };
  const openSettleTransModal = (rec: FinancialRecord) => { setSettleTransaction(rec); setShowSettleModal(true); };

  return (
    <div className={`min-h-screen ${theme.bgSoft} flex flex-col transition-colors duration-500 relative`}>
      {notification && <Toast message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
      
      {showGlobalLowStockAlert && lowStockItems.length > 0 && (
          <GlobalLowStockAlert 
            items={lowStockItems} 
            onClose={() => setShowGlobalLowStockAlert(false)} 
            onAction={() => { setActiveTab('resources'); setShowGlobalLowStockAlert(false); }}
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
                        <button onClick={() => setActiveTab('farming')} className={`${activeTab === 'farming' ? `border-green-500 text-green-600` : 'border-transparent text-gray-500'} whitespace-nowrap py-4 px-1 border-b-2 font-bold text-sm transition-colors`}>Farming</button>
                        <button onClick={() => setActiveTab('environment')} className={`${activeTab === 'environment' ? `border-green-500 text-green-600` : 'border-transparent text-gray-500'} whitespace-nowrap py-4 px-1 border-b-2 font-bold text-sm transition-colors`}>Environment</button>
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

                <button onClick={() => setActiveTab('resources')} className={`${activeTab === 'resources' ? `border-indigo-500 text-indigo-600` : 'border-transparent text-gray-500'} whitespace-nowrap py-4 px-1 border-b-2 font-bold text-sm transition-colors relative`}>
                    Resources
                    {lowStockItems.length > 0 && <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full ring-2 ring-white">!</span>}
                </button>
                
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
                        isFinance={isFinance}
                        financeOverviewData={financeOverviewData}
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
            {activeTab === 'environment' && <EnvironmentTab villageId={villageId} userEmail={userEmail} theme={theme} onSuccess={(msg) => showNotification(msg, 'success')} onError={(msg) => showNotification(msg, 'error')} />}
            {activeTab === 'resources' && <ResourcesTab villageId={villageId} userEmail={userEmail} theme={theme} onSuccess={(msg) => showNotification(msg, 'success')} financialRecords={financialRecords} />}
            
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
                                    <tr><th className="px-6 py-3 text-left text-[10px] font-bold uppercase text-gray-500">Time</th><th className="px-6 py-3 text-left text-[10px] font-bold uppercase text-gray-500">Action</th><th className="px-6 py-3 text-left text-[10px] font-bold uppercase text-gray-500">User</th></tr>
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
              const col = villageId === VillageType.C ? "financialRecords_C" : villageId === VillageType.A ? "financialRecords_A" : "financialRecords_B";
              await handleDeleteLog(col, editingTransaction!.id); 
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
