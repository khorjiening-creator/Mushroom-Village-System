
import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, doc, updateDoc, addDoc, setDoc, deleteDoc, query, orderBy, limit, where } from 'firebase/firestore';
// Fix: Import signOut as a named export
import { signOut } from 'firebase/auth';
import { VillageType, UserRole, FinancialRecord, ActivityLog, HarvestLog, ResourceItem } from '../types';
import { VILLAGES, COLOR_THEMES } from '../constants';
import { auth, db } from '../services/firebase';

// Sub-components
import { OverviewTab } from './dashboard/OverviewTab';
import { FarmingTab } from './dashboard/FarmingTab';
import { EnvironmentTab } from './dashboard/EnvironmentTab';
import { ResourcesTab } from './dashboard/ResourcesTab';
import { ProcessingTab } from './dashboard/ProcessingTab';
import { FinancialsTab } from './dashboard/FinancialsTab';
import { RegistryTab } from './dashboard/RegistryTab';
import { TransactionModal } from './TransactionModal';
import { SettleModal } from './SettleModal';

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
        <button type="button" onClick={onClose} className={`ml-auto -mx-1.5 -my-1.5 rounded-lg focus:ring-2 p-1.5 inline-flex h-8 w-8 ${type === 'success' ? 'bg-green-100 text-green-500 hover:bg-green-200' : 'bg-red-100 text-red-500 hover:bg-red-200'}`}>
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
  const [activeTab, setActiveTab] = useState<'overview' | 'farming' | 'environment' | 'resources' | 'financial' | 'processing' | 'registry'>('overview');
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  // Shared Data States
  const [financialRecords, setFinancialRecords] = useState<FinancialRecord[]>([]);
  const [farmingLogs, setFarmingLogs] = useState<ActivityLog[]>([]);
  const [harvestLogs, setHarvestLogs] = useState<HarvestLog[]>([]);
  
  // Transaction Modal State
  const [showTransModal, setShowTransModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<FinancialRecord | null>(null);
  const [isSubmittingTrans, setIsSubmittingTrans] = useState(false);

  // Settle Modal State
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settleTransaction, setSettleTransaction] = useState<FinancialRecord | null>(null);
  const [isSettling, setIsSettling] = useState(false);

  // Financial Filters (Lifted State)
  const [financialPeriod, setFinancialPeriod] = useState<'ALL' | 'MONTH' | 'TODAY'>('MONTH');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'COMPLETED' | 'PENDING'>('ALL');
  const [chartFilter, setChartFilter] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'>('MONTHLY');

  const isFinance = userRole === 'finance';
  const isUser = userRole === 'user';

  // Helper to determine collection name based on village
  const getFarmingCollectionName = (vid: VillageType) => {
    if (vid === VillageType.A) return "dailyfarming_logA";
    if (vid === VillageType.B) return "dailyfarming_logB";
    return "farmingActivities"; 
  };

  const getHarvestCollectionName = (vid: VillageType) => {
    if (vid === VillageType.A) return "harvestYield_A";
    if (vid === VillageType.B) return "harvestYield_B";
    return "harvestYield_A"; 
  };
  
  const getFinancialCollectionName = (vid: VillageType) => {
    if (vid === VillageType.A) return "financialRecords_A";
    if (vid === VillageType.B) return "financialRecords_B";
    if (vid === VillageType.C) return "financialRecords_C";
    return "financialRecords"; 
  };

  const showNotification = (message: string, type: 'success' | 'error') => {
      setNotification({ message, type });
      setTimeout(() => setNotification(null), 3000);
  };

  // --- Data Fetching ---
  useEffect(() => {
    if (['farming', 'overview', 'processing', 'financial', 'resources'].includes(activeTab)) {
        fetchProductionData();
    }
    // Always fetch financials if we are on resources tab to calculate remaining stock correctly
    if (['financial', 'resources', 'overview'].includes(activeTab)) {
        fetchFinancialRecords();
    }
  }, [isAdmin, activeTab, villageId, isFinance]);

  const fetchFinancialRecords = async () => {
      try {
        const colName = getFinancialCollectionName(villageId);
        const q = query(collection(db, colName), where('villageId', '==', villageId), limit(300));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()} as FinancialRecord));
        data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setFinancialRecords(data);
      } catch (error) {
         console.error("Financial fetch error:", error);
      }
  };

  const fetchProductionData = async () => {
     try {
         const collectionName = getFarmingCollectionName(villageId);
         let harvestCollection = villageId === VillageType.A ? "harvestYield_A" : 
                                  villageId === VillageType.B ? "harvestYield_B" : "";
         
         const activitiesQuery = query(collection(db, collectionName), orderBy("timestamp", "desc"), limit(5));
         const acts: ActivityLog[] = [];
         
         const actSnap = await getDocs(activitiesQuery);
         actSnap.forEach(doc => acts.push({ id: doc.id, ...doc.data() } as ActivityLog));
         setFarmingLogs(acts);

         const harvs: HarvestLog[] = [];
         if (harvestCollection) {
             const harvestQuery = query(collection(db, harvestCollection), orderBy("timestamp", "desc"), limit(50));
             const harvSnap = await getDocs(harvestQuery);
             harvSnap.forEach(doc => harvs.push({ id: doc.id, ...doc.data() } as HarvestLog));
         }
         setHarvestLogs(harvs);
     } catch (e) {
         console.log("Production data not yet initialized", e);
     }
  };

  // --- Financial Logic ---
  const filteredFinancials = useMemo(() => {
      return financialRecords.filter(rec => {
          if (filterCategory !== 'ALL' && rec.category !== filterCategory) return false;
          if (filterStatus !== 'ALL') {
              const recordStatus = rec.status || 'COMPLETED';
              if (filterStatus !== recordStatus) return false;
          }
          const recDate = new Date(rec.date);
          const now = new Date();
          if (financialPeriod === 'TODAY') return recDate.toISOString().split('T')[0] === now.toISOString().split('T')[0];
          if (financialPeriod === 'MONTH') return recDate.getMonth() === now.getMonth() && recDate.getFullYear() === now.getFullYear();
          return true;
      });
  }, [financialRecords, filterCategory, financialPeriod, filterStatus]);

  const financeOverviewData = useMemo(() => {
      const completed = financialRecords.filter(r => r.status === 'COMPLETED' || !r.status);
      const pending = financialRecords.filter(r => r.status === 'PENDING');
      const totalRevenue = completed.filter(r => r.type === 'INCOME').reduce((acc, c) => acc + c.amount, 0);
      const totalExpenses = completed.filter(r => r.type === 'EXPENSE').reduce((acc, c) => acc + c.amount, 0);
      const netCashFlow = totalRevenue - totalExpenses;
      const receivables = pending.filter(r => r.type === 'INCOME');
      const payables = pending.filter(r => r.type === 'EXPENSE');

      const now = new Date();
      let groups: Record<string, { income: number, expense: number, date: Date }> = {};
      
      completed.forEach(rec => {
        const d = new Date(rec.date);
        let key = '';

        if (chartFilter === 'DAILY') {
            const diffTime = Math.abs(now.getTime() - d.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays > 30) return; 
            key = d.toISOString().split('T')[0];
        } else if (chartFilter === 'WEEKLY') {
            const diffTime = Math.abs(now.getTime() - d.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays > 90) return; 
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            const monday = new Date(d);
            monday.setDate(diff);
            key = monday.toISOString().split('T')[0];
        } else if (chartFilter === 'MONTHLY') {
            const monthDiff = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
            if (monthDiff > 12) return; 
            key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        } else if (chartFilter === 'YEARLY') {
            key = `${d.getFullYear()}`;
        }

        if (key) {
            if (!groups[key]) groups[key] = { income: 0, expense: 0, date: d };
            if (rec.type === 'INCOME') groups[key].income += rec.amount;
            else groups[key].expense += rec.amount;
        }
      });

      const chartData = Object.entries(groups).map(([key, val]) => {
          let label = key;
          if (chartFilter === 'DAILY') label = val.date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
          if (chartFilter === 'WEEKLY') label = `Wk ${val.date.getDate()}/${val.date.getMonth()+1}`;
          if (chartFilter === 'MONTHLY') label = val.date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
          return { key, label, income: val.income, expense: val.expense };
      }).sort((a, b) => a.key.localeCompare(b.key));

      const maxChartValue = Math.max(...chartData.map(d => Math.max(d.income, d.expense)), 100);

      return { 
          totalRevenue, totalExpenses, netCashFlow, 
          totalReceivables: receivables.reduce((acc, c) => acc + c.amount, 0), 
          totalPayables: payables.reduce((acc, c) => acc + c.amount, 0), 
          receivables, payables, chartData, maxChartValue
      };
  }, [financialRecords, chartFilter]);

  const handleSaveTransaction = async (data: Partial<FinancialRecord>) => {
      setIsSubmittingTrans(true);
      const colName = getFinancialCollectionName(villageId);
      try {
          if (editingTransaction && editingTransaction.id) {
              await updateDoc(doc(db, colName, editingTransaction.id), { ...data });
              showNotification("Transaction updated successfully", "success");
          } else {
              const transactionId = "TXN-" + Date.now().toString().slice(-6) + Math.floor(100 + Math.random() * 900);
              await setDoc(doc(db, colName, transactionId), { ...data, transactionId });
              showNotification("Transaction added successfully", "success");
          }
          setShowTransModal(false);
          setEditingTransaction(null);
          fetchFinancialRecords();
      } catch (error) {
          console.error("Error saving transaction", error);
          showNotification("Failed to save transaction", "error");
      } finally {
          setIsSubmittingTrans(false);
      }
  };

  const handleSettleTransaction = async (amount: number, date: string, method: string, notes: string) => {
      if (!settleTransaction || !settleTransaction.id) return;
      setIsSettling(true);
      const colName = getFinancialCollectionName(villageId);
      try {
          const txnRef = doc(db, colName, settleTransaction.id);
          const paymentsCol = collection(txnRef, 'payments');
          await addDoc(paymentsCol, {
              amountPaid: amount, date: date, method: method, notes: notes, recordedBy: userEmail, timestamp: new Date().toISOString()
          });
          await updateDoc(txnRef, { status: 'COMPLETED', paymentMethod: method, settledDate: date });
          showNotification(`Transaction ${settleTransaction.transactionId} settled.`, "success");
          setShowSettleModal(false);
          setSettleTransaction(null);
          fetchFinancialRecords();
      } catch (error) {
          console.error("Error settling transaction", error);
          showNotification("Failed to settle transaction", "error");
      } finally {
          setIsSettling(false);
      }
  };

  const handleDeleteTransaction = async (id?: string) => {
      const targetId = id || editingTransaction?.id;
      if (!targetId) return;
      const colName = getFinancialCollectionName(villageId);
      try {
          await deleteDoc(doc(db, colName, targetId));
          showNotification("Transaction deleted", "success");
          setShowTransModal(false);
          setEditingTransaction(null);
          fetchFinancialRecords();
      } catch (error) {
          console.error("Error deleting transaction", error);
          showNotification("Failed to delete transaction", "error");
      }
  };

  const handlePrintReceipt = (record: FinancialRecord) => {
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      const isIncome = record.type === 'INCOME';
      const title = isIncome ? 'Official Receipt' : 'Payment Voucher';
      const fromToLabel = isIncome ? 'Received From' : 'Paid To';
      
      printWindow.document.write(`
        <html>
          <head>
            <title>${title} - ${record.transactionId}</title>
            <style>
              body { font-family: 'Inter', sans-serif; padding: 40px; color: #333; line-height: 1.6; }
              .header { border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; }
              .village-name { font-size: 24px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
              .doc-type { font-size: 18px; font-weight: 600; color: #666; }
              .grid { display: grid; grid-template-cols: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
              .label { font-size: 12px; color: #666; text-transform: uppercase; font-weight: bold; display: block; margin-bottom: 4px; }
              .value { font-size: 16px; font-weight: 500; }
              .amount-box { background: #f4f4f4; padding: 20px; border-radius: 8px; margin: 30px 0; display: flex; justify-content: space-between; align-items: center; border: 1px solid #ddd; }
              .amount-val { font-size: 28px; font-weight: 800; }
              .footer { margin-top: 80px; display: flex; justify-content: space-between; }
              .sig-line { border-top: 1px solid #333; width: 200px; padding-top: 8px; text-align: center; font-size: 12px; font-weight: bold; }
              @media print { .no-print { display: none; } body { padding: 20px; } }
            </style>
          </head>
          <body>
            <div class="header">
              <div>
                <div class="village-name">${village.name} Mushroom Village</div>
                <div class="doc-type">${title}</div>
              </div>
              <div style="text-align: right">
                <div class="label">Reference No.</div>
                <div class="value" style="font-family: monospace;">${record.transactionId}</div>
              </div>
            </div>

            <div class="grid">
              <div>
                <span class="label">Date</span>
                <div class="value">${new Date(record.date).toLocaleDateString()}</div>
              </div>
              <div>
                <span class="label">Settled On</span>
                <div class="value">${record.settledDate ? new Date(record.settledDate).toLocaleDateString() : 'N/A'}</div>
              </div>
              <div>
                <span class="label">Category</span>
                <div class="value">${record.category}</div>
              </div>
              <div>
                <span class="label">Payment Method</span>
                <div class="value">${record.paymentMethod || 'Manual'}</div>
              </div>
            </div>

            <div style="margin-bottom: 30px;">
              <span class="label">Description</span>
              <div class="value">${record.description || 'Professional Mushroom Supply Services'}</div>
              ${record.orderNumber ? `<div class="value" style="margin-top: 8px; color: #666;">Ref: ${record.orderNumber}</div>` : ''}
              ${record.batchId ? `<div class="value" style="color: #666;">Batch: ${record.batchId}</div>` : ''}
            </div>

            <div class="amount-box">
              <span class="label" style="font-size: 16px;">Total Amount</span>
              <span class="amount-val">RM ${record.amount.toFixed(2)}</span>
            </div>

            <div class="footer">
              <div>
                <div class="sig-line">Prepared By</div>
                <div style="text-align: center; font-size: 10px; margin-top: 4px;">${record.recordedBy}</div>
              </div>
              <div>
                <div class="sig-line">Authorized Signatory</div>
              </div>
            </div>

            <div style="margin-top: 50px; text-align: center; font-size: 10px; color: #999;">
              This is a computer generated document. No signature required.
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      setTimeout(() => {
          printWindow.print();
      }, 500);
  };

  const openEditTransModal = (rec: FinancialRecord) => {
      setEditingTransaction(rec);
      setShowTransModal(true);
  };

  const openSettleTransModal = (rec: FinancialRecord) => {
      setSettleTransaction(rec);
      setShowSettleModal(true);
  };

  const activeBatchesWithYield = useMemo(() => {
    const batchYieldMap: Record<string, number> = {};
    harvestLogs.forEach(log => {
        const y = log.totalYield || log.weightKg || 0;
        if (y > 0) batchYieldMap[log.batchId] = (batchYieldMap[log.batchId] || 0) + y;
    });
    financialRecords.forEach(rec => {
        if (rec.category === 'Sales' && rec.batchId && rec.weightKg) {
            if (editingTransaction?.id !== rec.id) {
                if (batchYieldMap[rec.batchId]) batchYieldMap[rec.batchId] -= rec.weightKg;
            }
        }
    });
    return Object.entries(batchYieldMap).filter(([id, remaining]) => remaining > 0).map(([id, remaining]) => ({ id, remaining }));
  }, [harvestLogs, financialRecords, editingTransaction]);

  return (
    <div className={`min-h-screen ${theme.bgSoft} flex flex-col transition-colors duration-500 relative`}>
      {notification && <Toast message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}

      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2 sm:space-x-3">
             <div className={`px-4 py-2 rounded-lg ${theme.bgLight} ${theme.textMain} border ${theme.borderSoft} shadow-sm`}>
                <span className="font-bold text-lg sm:text-xl tracking-tight">Dashboard</span>
             </div>
             {isAdmin && <span className="ml-2 px-2 py-0.5 rounded text-[10px] sm:text-xs font-bold bg-red-100 text-red-800 border border-red-200 uppercase tracking-wide">Admin</span>}
          </div>
          <div className="flex items-center space-x-2 sm:space-x-4">
            <div className="hidden md:flex flex-col items-end">
                <span className="text-sm font-semibold text-gray-900">{userName || 'Unknown User'}</span>
                <span className="text-xs text-gray-500">{userEmail}</span>
            </div>
            <button onClick={() => signOut(auth)} className="text-xs sm:text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 px-2 sm:px-3 py-1.5 sm:py-2 rounded-md transition-colors">Sign Out</button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 relative">
        <div className="border-b border-gray-200 mb-6 overflow-x-auto">
            <nav className="-mb-px flex space-x-6 sm:space-x-8" aria-label="Tabs">
                <button onClick={() => setActiveTab('overview')} className={`${activeTab === 'overview' ? `border-${village.color}-500 text-${village.color}-600` : 'border-transparent text-gray-500 hover:text-gray-700'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}>Overview</button>
                {village.role === 'FARMING' && (isUser || isAdmin) && (
                    <>
                        <button onClick={() => setActiveTab('farming')} className={`${activeTab === 'farming' ? `border-${village.color}-500 text-${village.color}-600` : 'border-transparent text-gray-500 hover:text-gray-700'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}>Farming</button>
                        <button onClick={() => setActiveTab('environment')} className={`${activeTab === 'environment' ? `border-${village.color}-500 text-${village.color}-600` : 'border-transparent text-gray-500 hover:text-gray-700'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}>Environment</button>
                        <button onClick={() => setActiveTab('resources')} className={`${activeTab === 'resources' ? `border-${village.color}-500 text-${village.color}-600` : 'border-transparent text-gray-500 hover:text-gray-700'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}>Resources</button>
                    </>
                )}
                {(isFinance || isAdmin) && (
                    <button onClick={() => setActiveTab('financial')} className={`${activeTab === 'financial' ? `border-${village.color}-500 text-${village.color}-600` : 'border-transparent text-gray-500 hover:text-gray-700'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}>Financials</button>
                )}
                {village.role === 'PROCESSING' && (isUser || isAdmin) && (
                    <button onClick={() => setActiveTab('processing')} className={`${activeTab === 'processing' ? `border-${village.color}-500 text-${village.color}-600` : 'border-transparent text-gray-500 hover:text-gray-700'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}>Production</button>
                )}
                {isAdmin && (
                    <button onClick={() => setActiveTab('registry')} className={`${activeTab === 'registry' ? `border-${village.color}-500 text-${village.color}-600` : 'border-transparent text-gray-500 hover:text-gray-700'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}>User Registry</button>
                )}
            </nav>
        </div>

        {activeTab === 'overview' && (
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
        )}
        
        {activeTab === 'farming' && <FarmingTab villageId={villageId} userEmail={userEmail} theme={theme} farmingLogs={farmingLogs} onActivityLogged={fetchProductionData} onSuccess={(msg) => showNotification(msg, 'success')} onError={(msg) => showNotification(msg, 'error')} />}
        {activeTab === 'environment' && <EnvironmentTab villageId={villageId} userEmail={userEmail} theme={theme} onSuccess={(msg) => showNotification(msg, 'success')} onError={(msg) => showNotification(msg, 'error')} />}
        {activeTab === 'resources' && <ResourcesTab villageId={villageId} userEmail={userEmail} theme={theme} onSuccess={(msg) => showNotification(msg, 'success')} financialRecords={financialRecords} />}
        {activeTab === 'processing' && <ProcessingTab harvestLogs={harvestLogs} />}
        
        {activeTab === 'financial' && (
            <FinancialsTab 
                records={filteredFinancials}
                onAddRecord={() => { setEditingTransaction(null); setShowTransModal(true); }}
                onEditRecord={openEditTransModal}
                onDeleteRecord={handleDeleteTransaction}
                onSettleRecord={openSettleTransModal}
                userRole={userRole}
                theme={theme}
                onPrintRecord={handlePrintReceipt}
                financeOverviewData={financeOverviewData}
                chartFilter={chartFilter}
                setChartFilter={setChartFilter}
                onFilterChange={(p, c, s) => { 
                    setFinancialPeriod(p as any); setFilterCategory(c); setFilterStatus(s as any); 
                }}
            />
        )}
        
        {activeTab === 'registry' && isAdmin && <RegistryTab adminEmail={userEmail} />}
      </main>

      <TransactionModal 
          isOpen={showTransModal}
          onClose={() => { setShowTransModal(false); setEditingTransaction(null); }}
          onSave={handleSaveTransaction}
          onDelete={(isFinance || isAdmin) ? async () => { await handleDeleteTransaction(editingTransaction?.id); } : undefined}
          initialData={editingTransaction}
          villageId={villageId}
          userEmail={userEmail}
          isSubmitting={isSubmittingTrans}
          availableBatches={activeBatchesWithYield}
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
