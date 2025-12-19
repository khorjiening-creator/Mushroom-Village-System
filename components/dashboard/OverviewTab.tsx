
import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { VillageType, VillageRole, FinancialRecord, ActivityLog } from '../../types';
import { VILLAGES } from '../../constants';

interface OverviewTabProps {
  villageId: VillageType;
  userName: string;
  theme: any;
  financeOverviewData?: any; 
  isFinance: boolean;
  setActiveTab: (tab: any) => void;
  openEditTransModal: (rec: FinancialRecord) => void;
  chartFilter?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  setChartFilter?: (filter: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY') => void;
}

// Minimal profile for checking harvest readiness
const SPECIES_CYCLES: Record<string, number> = {
    'Oyster': 21,
    'Shiitake': 90,
    'Button': 35,
    "Lion's Mane": 35,
    'Unknown': 30
};

export const OverviewTab: React.FC<OverviewTabProps> = ({ 
    villageId, userName, theme, financeOverviewData, isFinance, setActiveTab, openEditTransModal, chartFilter, setChartFilter
}) => {
    const village = VILLAGES[villageId];
    const [harvestReadyCount, setHarvestReadyCount] = useState(0);

    const isOverdue = (date: string) => {
        const recordDate = new Date(date);
        const diffTime = Math.abs(new Date().getTime() - recordDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays > 7;
    };

    // Fetch harvest ready status for Users
    useEffect(() => {
        const checkHarvestReadiness = async () => {
            if (isFinance) return;
            if (village.role !== VillageRole.FARMING) return;

            const colName = villageId === VillageType.A ? 'dailyfarming_logA' : 'dailyfarming_logB';
            
            try {
                // Fetch recent batches
                const q = query(collection(db, colName), orderBy('timestamp', 'desc'), limit(100));
                const snapshot = await getDocs(q);
                
                let readyCount = 0;
                const now = new Date().getTime();

                snapshot.forEach(doc => {
                    const data = doc.data() as ActivityLog;
                    // Correcting 'BED_PREP' to 'SUBSTRATE_PREP' to match type definition
                    if (data.type === 'SUBSTRATE_PREP' && data.batchStatus !== 'COMPLETED') {
                        const planted = new Date(data.timestamp).getTime();
                        const daysElapsed = (now - planted) / (1000 * 60 * 60 * 24);
                        const cycle = SPECIES_CYCLES[data.mushroomStrain || 'Unknown'] || 30;
                        
                        // Simple check: If days elapsed > cycle days
                        if (daysElapsed >= cycle) {
                            readyCount++;
                        }
                    }
                });
                setHarvestReadyCount(readyCount);
            } catch (e) {
                console.warn("Error checking harvest readiness in overview", e);
            }
        };

        checkHarvestReadiness();
    }, [villageId, isFinance, village.role]);

    return (
        <div className="animate-fade-in-up">
            {/* Harvest Ready Banner (For Users) */}
            {!isFinance && harvestReadyCount > 0 && (
                <div className="bg-green-100 border-l-4 border-green-500 text-green-800 p-4 rounded-md shadow-sm mb-6 flex items-center justify-between">
                    <div className="flex items-center">
                        <svg className="h-6 w-6 text-green-600 mr-3 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <div>
                            <p className="font-bold text-lg">Harvest Action Required</p>
                            <p className="text-sm">You have {harvestReadyCount} batch{harvestReadyCount > 1 ? 'es' : ''} ready for harvest based on their growth cycle.</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => setActiveTab('environment')}
                        className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded shadow transition-colors text-sm whitespace-nowrap"
                    >
                        Go to Environment
                    </button>
                </div>
            )}

            {isFinance && financeOverviewData ? (
             <div className="space-y-6">
                 <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div>
                           <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">Financial Overview</h1>
                           <p className="text-sm text-gray-500">Cash flow performance and outstanding tracking for {village.name}.</p>
                        </div>
                        <div className={`px-4 py-2 rounded-full ${theme.bgSoft} ${theme.textMain} font-medium text-xs sm:text-sm border ${theme.borderSoft} whitespace-nowrap`}>
                           Role: Financial Clerk
                        </div>
                    </div>
                 </div>

                 {/* Top Cards */}
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                     <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
                        <div className="relative z-10">
                            <h3 className="text-sm font-medium text-gray-500 mb-1">Net Cash Position</h3>
                            <div className="text-3xl font-bold text-gray-900">
                                {financeOverviewData.netCashFlow < 0 ? '-' : ''}RM{Math.abs(financeOverviewData.netCashFlow).toLocaleString(undefined, {minimumFractionDigits: 2})}
                            </div>
                            <div className="mt-2 text-xs flex gap-3">
                                <span className="text-green-600 font-medium">In: RM{financeOverviewData.totalRevenue.toLocaleString()}</span>
                                <span className="text-red-600 font-medium">Out: RM{financeOverviewData.totalExpenses.toLocaleString()}</span>
                            </div>
                        </div>
                        <div className="absolute right-0 top-0 h-full w-2 bg-indigo-500"></div>
                     </div>

                     <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
                         <div className="relative z-10">
                             <div className="flex justify-between items-start">
                                 <h3 className="text-sm font-medium text-gray-500 mb-1">Receivables</h3>
                                 <span className="bg-orange-100 text-orange-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Pending In</span>
                             </div>
                             <div className="text-3xl font-bold text-orange-600">
                                 RM{financeOverviewData.totalReceivables.toLocaleString(undefined, {minimumFractionDigits: 2})}
                             </div>
                             <p className="mt-2 text-xs text-gray-400">{financeOverviewData.receivables.length} outstanding invoice(s)</p>
                         </div>
                     </div>

                     <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
                         <div className="relative z-10">
                             <div className="flex justify-between items-start">
                                 <h3 className="text-sm font-medium text-gray-500 mb-1">Payables</h3>
                                 <span className="bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Pending Out</span>
                             </div>
                             <div className="text-3xl font-bold text-red-600">
                                 RM{financeOverviewData.totalPayables.toLocaleString(undefined, {minimumFractionDigits: 2})}
                             </div>
                             <p className="mt-2 text-xs text-gray-400">{financeOverviewData.payables.length} unpaid bill(s)</p>
                         </div>
                     </div>
                 </div>

                 {/* Charts Section */}
                 <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-6">
                     <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                         <h3 className="text-lg font-bold text-gray-900">Cash Flow Trends</h3>
                         {setChartFilter && (
                             <div className="flex bg-gray-100 p-1 rounded-lg">
                                 {(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const).map(filter => (
                                     <button 
                                        key={filter}
                                        onClick={() => setChartFilter(filter)}
                                        className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${chartFilter === filter ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                     >
                                        {filter.charAt(0) + filter.slice(1).toLowerCase()}
                                     </button>
                                 ))}
                             </div>
                         )}
                     </div>
                     <div className="h-64 w-full flex items-end justify-between gap-2 sm:gap-4 px-2 overflow-x-auto pb-4">
                         {financeOverviewData.chartData.length === 0 ? (
                             <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">No data available for this period</div>
                         ) : (
                            financeOverviewData.chartData.map((d: any) => (
                                <div key={d.label} className="flex flex-col items-center flex-1 group min-w-[40px]">
                                    <div className="relative w-full h-full flex items-end justify-center gap-1 sm:gap-2">
                                        <div 
                                            className="w-2 sm:w-5 bg-emerald-500 rounded-t-sm transition-all duration-500 group-hover:bg-emerald-400 relative"
                                            style={{ height: `${Math.max((d.income / financeOverviewData.maxChartValue) * 100, 1)}%` }}
                                        >
                                            <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 shadow-lg">
                                                +RM{d.income.toLocaleString()}
                                            </div>
                                        </div>
                                        <div 
                                            className="w-2 sm:w-5 bg-red-400 rounded-t-sm transition-all duration-500 group-hover:bg-red-300 relative"
                                            style={{ height: `${Math.max((d.expense / financeOverviewData.maxChartValue) * 100, 1)}%` }}
                                        >
                                            <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 shadow-lg">
                                                -RM{d.expense.toLocaleString()}
                                            </div>
                                        </div>
                                    </div>
                                    <span className="text-[10px] text-gray-500 mt-2 font-medium truncate w-full text-center">{d.label}</span>
                                </div>
                            ))
                         )}
                     </div>
                     <div className="flex justify-center items-center gap-6 mt-2 border-t border-gray-100 pt-4">
                         <div className="flex items-center text-xs text-gray-600">
                             <div className="w-3 h-3 bg-emerald-500 rounded-sm mr-2"></div> Income
                         </div>
                         <div className="flex items-center text-xs text-gray-600">
                             <div className="w-3 h-3 bg-red-400 rounded-sm mr-2"></div> Expense
                         </div>
                     </div>
                 </div>

                 {/* Outstanding Tracker */}
                 <div className="space-y-6">
                     <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                         <div className="px-6 py-4 border-b border-gray-100 bg-orange-50 flex justify-between items-center">
                             <h3 className="font-bold text-orange-800 flex items-center">
                                 Outstanding Receivables
                             </h3>
                         </div>
                         <div className="overflow-x-auto">
                             <table className="min-w-full divide-y divide-gray-200 table-fixed">
                                 <thead className="bg-gray-50">
                                     <tr>
                                         <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[15%]">Date</th>
                                         <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[55%]">Customer Order Number</th>
                                         <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-[15%]">Amount</th>
                                         <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-[15%]">Action</th>
                                     </tr>
                                 </thead>
                                 <tbody className="bg-white divide-y divide-gray-200">
                                     {financeOverviewData.receivables.length === 0 ? (
                                         <tr><td colSpan={4} className="px-6 py-8 text-center text-sm text-gray-400">No pending receivables.</td></tr>
                                     ) : (
                                        financeOverviewData.receivables.map((rec: FinancialRecord) => {
                                             const delayed = isOverdue(rec.date);
                                             return (
                                                 <tr key={rec.id} className={`hover:bg-gray-50 ${delayed ? 'bg-orange-50/50' : ''}`}>
                                                     <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">{new Date(rec.date).toLocaleDateString()}</td>
                                                     <td className="px-6 py-4 text-xs font-medium text-gray-900">
                                                         <div className="flex items-center gap-2">
                                                            {rec.orderNumber ? (
                                                                <span className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded border border-gray-200">{rec.orderNumber}</span>
                                                            ) : (
                                                                <span className="text-gray-400 italic">--</span>
                                                            )}
                                                            {delayed && (
                                                                <span className="bg-red-100 text-red-600 text-[9px] font-bold px-1.5 py-0.5 rounded animate-pulse">7D+ Delayed</span>
                                                            )}
                                                         </div>
                                                         <div className="text-[10px] text-gray-400 mt-0.5 truncate">{rec.category}</div>
                                                     </td>
                                                     <td className="px-6 py-4 whitespace-nowrap text-xs font-bold text-orange-600 text-right">RM{rec.amount.toFixed(2)}</td>
                                                     <td className="px-6 py-4 text-center">
                                                         <button 
                                                            onClick={() => { setActiveTab('financial'); openEditTransModal(rec); }}
                                                            className="text-indigo-600 hover:text-indigo-900 text-xs underline"
                                                         >
                                                             Review
                                                         </button>
                                                     </td>
                                                 </tr>
                                             );
                                         })
                                     )}
                                 </tbody>
                             </table>
                         </div>
                     </div>

                     <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                         <div className="px-6 py-4 border-b border-gray-100 bg-red-50 flex justify-between items-center">
                             <h3 className="font-bold text-red-800 flex items-center">
                                 Outstanding Payables
                             </h3>
                         </div>
                         <div className="overflow-x-auto">
                             <table className="min-w-full divide-y divide-gray-200 table-fixed">
                                 <thead className="bg-gray-50">
                                     <tr>
                                         <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[15%]">Date</th>
                                         <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[55%]">Invoice Number</th>
                                         <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-[15%]">Amount</th>
                                         <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-[15%]">Action</th>
                                     </tr>
                                 </thead>
                                 <tbody className="bg-white divide-y divide-gray-200">
                                     {financeOverviewData.payables.length === 0 ? (
                                         <tr><td colSpan={4} className="px-6 py-8 text-center text-sm text-gray-400">No pending payables.</td></tr>
                                     ) : (
                                        financeOverviewData.payables.map((rec: FinancialRecord) => {
                                             const delayed = isOverdue(rec.date);
                                             return (
                                                 <tr key={rec.id} className={`hover:bg-gray-50 ${delayed ? 'bg-red-50/50' : ''}`}>
                                                     <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">{new Date(rec.date).toLocaleDateString()}</td>
                                                     <td className="px-6 py-4 text-xs font-medium text-gray-900">
                                                         <div className="flex items-center gap-2">
                                                            {rec.orderNumber ? (
                                                                <span className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded border border-gray-200">{rec.orderNumber}</span>
                                                            ) : (
                                                                <span className="text-gray-400 italic">--</span>
                                                            )}
                                                            {delayed && (
                                                                <span className="bg-red-100 text-red-600 text-[9px] font-bold px-1.5 py-0.5 rounded animate-pulse">7D+ Delayed</span>
                                                            )}
                                                         </div>
                                                         <div className="text-[10px] text-gray-400 mt-0.5 truncate">{rec.category}</div>
                                                     </td>
                                                     <td className="px-6 py-4 whitespace-nowrap text-xs font-bold text-red-600 text-right">RM{rec.amount.toFixed(2)}</td>
                                                     <td className="px-6 py-4 text-center">
                                                         <button 
                                                            onClick={() => { setActiveTab('financial'); openEditTransModal(rec); }}
                                                            className="text-indigo-600 hover:text-indigo-900 text-xs underline"
                                                         >
                                                             Review
                                                         </button>
                                                     </td>
                                                 </tr>
                                             );
                                         })
                                     )}
                                 </tbody>
                             </table>
                         </div>
                     </div>
                 </div>
             </div>
            ) : (
                <>
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8 mb-6 sm:mb-8">
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                            <div>
                            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Welcome back to {village.name}, {userName || 'User'}</h1>
                            </div>
                            <div className={`px-4 py-2 rounded-full ${theme.bgSoft} ${theme.textMain} font-medium text-xs sm:text-sm border ${theme.borderSoft} whitespace-nowrap`}>
                            Current Status: Active
                            </div>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-gray-500">
                            {village.role === VillageRole.FARMING ? 'Daily Harvest' : 'Units Processed'}
                        </h3>
                        <span className={`${theme.textIcon} ${theme.bgSoft} p-1 rounded`}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                            </svg>
                        </span>
                        </div>
                        <div className="text-2xl font-bold text-gray-900">
                        {village.role === VillageRole.FARMING ? '2,450 kg' : '8,920 units'}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">+12% from yesterday</p>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-gray-500">Active Workers</h3>
                        <span className={`${theme.textIcon} ${theme.bgSoft} p-1 rounded`}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                        </span>
                        </div>
                        <div className="text-2xl font-bold text-gray-900">
                        {village.id === 'Village A' ? '124' : village.id === 'Village B' ? '86' : '210'}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Shift 1 in progress</p>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-gray-500">Supply Chain Status</h3>
                        <span className={`${theme.textIcon} ${theme.bgSoft} p-1 rounded`}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </span>
                        </div>
                        <div className="text-2xl font-bold text-gray-900">Normal</div>
                        <p className="text-xs text-gray-500 mt-1">Next truck: 14:00 PM</p>
                    </div>
                    </div>
                </>
            )}
        </div>
    );
};
