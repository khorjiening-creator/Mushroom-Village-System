import React, { useState, useMemo } from 'react';
import { FinancialRecord, UserRole } from '../../types';

interface FinancialsTabProps {
    records: FinancialRecord[];
    onAddRecord: () => void;
    onEditRecord: (rec: FinancialRecord) => void;
    onDeleteRecord: (id: string) => void;
    onSettleRecord?: (rec: FinancialRecord) => void;
    onPrintRecord?: (rec: FinancialRecord) => void;
    userRole: UserRole;
    theme: any;
    financeOverviewData?: any;
    chartFilter?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
    setChartFilter?: (f: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY') => void;
    onFilterChange: (period: string, category: string, status: string) => void;
}

export const FinancialsTab: React.FC<FinancialsTabProps> = ({ 
    records, onAddRecord, onEditRecord, onDeleteRecord, onSettleRecord, onPrintRecord, userRole, theme, 
    financeOverviewData, chartFilter, setChartFilter, onFilterChange 
}) => {
    const [financialPeriod, setFinancialPeriod] = useState<'ALL' | 'MONTH' | 'TODAY'>('MONTH');
    const [filterCategory, setFilterCategory] = useState('ALL');
    const [filterStatus, setFilterStatus] = useState<'ALL' | 'COMPLETED' | 'PENDING'>('ALL');
    const [showOverview, setShowOverview] = useState(true);

    const isFinanceOrAdmin = userRole === 'finance' || userRole === 'admin';

    const handleFilterUpdate = (
        period: 'ALL' | 'MONTH' | 'TODAY', 
        category: string, 
        status: 'ALL' | 'COMPLETED' | 'PENDING'
    ) => {
        setFinancialPeriod(period);
        setFilterCategory(category);
        setFilterStatus(status);
        onFilterChange(period, category, status);
    };

    const isOverdue = (date: string) => {
        const recordDate = new Date(date);
        const diffTime = Math.abs(new Date().getTime() - recordDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays > 7;
    };

    const overdueCount = useMemo(() => {
        return records.filter(r => r.status === 'PENDING' && isOverdue(r.date)).length;
    }, [records]);

    const canDelete = userRole === 'admin' || userRole === 'finance';
    const canEdit = userRole === 'admin' || userRole === 'finance';

    return (
        <div className="space-y-6 animate-fade-in-up">
            {/* Finance Dashboard Section */}
            {isFinanceOrAdmin && financeOverviewData && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Financial Insights</h2>
                            <p className="text-xs text-gray-500">Global performance and trend analysis</p>
                        </div>
                        <button 
                            onClick={() => setShowOverview(!showOverview)}
                            className="text-indigo-600 text-xs font-bold hover:text-indigo-800 transition-colors uppercase tracking-widest"
                        >
                            {showOverview ? 'Hide Summary' : 'Show Summary'}
                        </button>
                    </div>

                    {showOverview && (
                        <div className="p-6 space-y-6 animate-fade-in">
                            {/* KPI Cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl">
                                    <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block mb-1">Total Revenue</span>
                                    <div className="text-2xl font-black text-emerald-800">RM{financeOverviewData.totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                                </div>
                                <div className="bg-rose-50 border border-rose-100 p-4 rounded-xl">
                                    <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider block mb-1">Total Expenses</span>
                                    <div className="text-2xl font-black text-rose-800">RM{financeOverviewData.totalExpenses.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                                </div>
                                <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl">
                                    <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block mb-1">Net Cashflow</span>
                                    <div className={`text-2xl font-black ${financeOverviewData.netCashFlow >= 0 ? 'text-indigo-800' : 'text-rose-600'}`}>
                                        {financeOverviewData.netCashFlow < 0 ? '-' : ''}RM{Math.abs(financeOverviewData.netCashFlow).toLocaleString(undefined, {minimumFractionDigits: 2})}
                                    </div>
                                </div>
                                <div className="bg-orange-50 border border-orange-100 p-4 rounded-xl">
                                    <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider block mb-1">Outstanding (Rec)</span>
                                    <div className="text-2xl font-black text-orange-800">RM{financeOverviewData.totalReceivables.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                                </div>
                            </div>

                            {/* Charts & Outstanding Lists */}
                            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                                {/* Trend Chart */}
                                <div className="xl:col-span-2 border border-gray-100 rounded-xl p-4">
                                    <div className="flex justify-between items-center mb-6">
                                        <h3 className="text-sm font-bold text-gray-700">Cash Flow Trends</h3>
                                        {setChartFilter && (
                                            <div className="flex bg-gray-100 p-1 rounded-lg">
                                                {(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const).map(filter => (
                                                    <button 
                                                        key={filter}
                                                        onClick={() => setChartFilter(filter)}
                                                        className={`px-3 py-1 text-[10px] font-bold rounded-md transition-colors ${chartFilter === filter ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                                    >
                                                        {filter.charAt(0) + filter.slice(1).toLowerCase()}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="h-48 w-full flex items-end justify-between gap-2 overflow-x-auto pb-4">
                                        {financeOverviewData.chartData.length === 0 ? (
                                            <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm italic">No data recorded for this view</div>
                                        ) : (
                                            financeOverviewData.chartData.map((d: any) => (
                                                <div key={d.label} className="flex flex-col items-center flex-1 group min-w-[30px]">
                                                    <div className="relative w-full h-full flex items-end justify-center gap-1">
                                                        <div 
                                                            className="w-full bg-emerald-500 rounded-t-sm transition-all duration-300 group-hover:bg-emerald-400 relative"
                                                            style={{ height: `${Math.max((d.income / financeOverviewData.maxChartValue) * 100, 2)}%` }}
                                                        />
                                                        <div 
                                                            className="w-full bg-rose-400 rounded-t-sm transition-all duration-300 group-hover:bg-rose-300 relative"
                                                            style={{ height: `${Math.max((d.expense / financeOverviewData.maxChartValue) * 100, 2)}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-[8px] text-gray-400 mt-2 font-bold uppercase truncate w-full text-center">{d.label}</span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Order Tracking Summary */}
                                <div className="border border-gray-100 rounded-xl p-4 flex flex-col">
                                    <h3 className="text-sm font-bold text-gray-700 mb-4">Urgent Outstanding Items</h3>
                                    <div className="flex-1 overflow-y-auto max-h-[180px] space-y-2 pr-1">
                                        {financeOverviewData.receivables.concat(financeOverviewData.payables).slice(0, 8).map((rec: FinancialRecord) => {
                                            const delayed = isOverdue(rec.date);
                                            return (
                                                <div key={rec.id} className={`flex items-center justify-between p-2 rounded-lg border text-xs ${delayed ? 'bg-rose-50 border-rose-200' : 'bg-gray-50 border-gray-100'}`}>
                                                    <div className="flex flex-col overflow-hidden">
                                                        <span className="font-mono text-[10px] text-gray-500 font-bold">{rec.orderNumber || rec.transactionId}</span>
                                                        <span className="truncate text-gray-400">{rec.category}</span>
                                                    </div>
                                                    <div className="text-right ml-2">
                                                        <div className={`font-black ${rec.type === 'INCOME' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                            RM{rec.amount.toFixed(0)}
                                                        </div>
                                                        {delayed && <span className="text-[8px] font-bold text-rose-500 uppercase tracking-tighter">Overdue</span>}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {financeOverviewData.receivables.length + financeOverviewData.payables.length === 0 && (
                                            <div className="h-full flex items-center justify-center text-xs text-gray-400 italic">All accounts settled.</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Overdue Reminder Banner */}
            {overdueCount > 0 && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md shadow-sm flex items-start animate-pulse">
                    <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <div className="ml-3">
                        <h3 className="text-sm font-bold text-red-800">Unsettled Transaction Reminder</h3>
                        <div className="mt-1 text-sm text-red-700">
                            <p>There are {overdueCount} transactions (Receivables/Payables) pending for more than 7 days. Please review customer orders and supplier invoices.</p>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-bold text-gray-900">Financial Ledger</h2>
                    <button
                        onClick={onAddRecord}
                        className={`px-4 py-2 rounded-md text-sm font-medium text-white ${theme.button}`}
                    >
                        Add Record
                    </button>
                </div>
                
                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                     <select 
                        value={financialPeriod} 
                        onChange={(e) => handleFilterUpdate(e.target.value as any, filterCategory, filterStatus)}
                        className="block w-full sm:w-auto pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md border bg-gray-700 text-white"
                     >
                         <option value="ALL">All Time</option>
                         <option value="MONTH">This Month</option>
                         <option value="TODAY">Today</option>
                     </select>
                     <select
                        value={filterCategory}
                        onChange={(e) => handleFilterUpdate(financialPeriod, e.target.value, filterStatus)}
                        className="block w-full sm:w-auto pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md border bg-gray-700 text-white"
                     >
                         <option value="ALL">All Categories</option>
                         <optgroup label="Revenue">
                             <option value="Sales">Sales</option>
                             <option value="Investment">Investment</option>
                             <option value="Others">Others (Income)</option>
                         </optgroup>
                         <optgroup label="Expenses">
                             <option value="Supplies">Supplies</option>
                             <option value="Logistic">Logistic</option>
                             <option value="Labor">Labor</option>
                             <option value="Utilities">Utilities</option>
                             <option value="Maintenance">Maintenance</option>
                             <option value="Others">Others (Expense)</option>
                         </optgroup>
                     </select>
                     <select
                        value={filterStatus}
                        onChange={(e) => handleFilterUpdate(financialPeriod, filterCategory, e.target.value as any)}
                        className="block w-full sm:w-auto pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md border bg-gray-700 text-white"
                     >
                         <option value="ALL">All Status</option>
                         <option value="COMPLETED">Completed</option>
                         <option value="PENDING">Pending</option>
                     </select>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Settled</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order/Ref</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                {(canDelete || canEdit) && <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {records.map((record) => {
                                const delayed = record.status === 'PENDING' && isOverdue(record.date);
                                const isCompleted = record.status === 'COMPLETED' || !record.status;
                                return (
                                    <tr key={record.id} className={`hover:bg-gray-50 ${delayed ? 'bg-red-50/30' : ''}`}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" onClick={() => onEditRecord(record)}>{new Date(record.date).toLocaleDateString()}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" onClick={() => onEditRecord(record)}>
                                            {record.settledDate ? new Date(record.settledDate).toLocaleDateString() : <span className="text-gray-300 italic">--</span>}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap" onClick={() => onEditRecord(record)}>
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${record.type === 'INCOME' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                {record.type}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" onClick={() => onEditRecord(record)}>{record.category}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" onClick={() => onEditRecord(record)}>
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-1">
                                                    <span className="font-mono text-xs font-bold text-gray-800">{record.orderNumber || '-'}</span>
                                                    {record.attachmentName && (
                                                        <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" title={`Attached: ${record.attachmentName}`}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                                        </svg>
                                                    )}
                                                </div>
                                                <span className="text-[10px] text-gray-400 uppercase tracking-tighter">{record.transactionId}</span>
                                                {record.weightKg && <span className="text-[10px] font-bold text-indigo-600">{record.weightKg} kg sold</span>}
                                            </div>
                                        </td>
                                        <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold text-right ${record.type === 'INCOME' ? 'text-green-600' : 'text-red-600'}`} onClick={() => onEditRecord(record)}>
                                            RM{record.amount.toFixed(2)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center" onClick={() => onEditRecord(record)}>
                                            <div className="flex flex-col items-center">
                                                {record.status === 'PENDING' ? (
                                                    <>
                                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${delayed ? 'bg-red-100 text-red-800 animate-pulse border border-red-300' : 'bg-yellow-100 text-yellow-800'}`}>
                                                            Pending
                                                        </span>
                                                        {delayed && <span className="text-[10px] text-red-600 font-bold mt-1 uppercase tracking-tighter">Overdue</span>}
                                                    </>
                                                ) : (
                                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">Completed</span>
                                                )}
                                            </div>
                                        </td>
                                        {(canDelete || canEdit) && (
                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                <div className="flex justify-center space-x-2">
                                                    {record.status === 'PENDING' && onSettleRecord && (
                                                        <button 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onSettleRecord(record);
                                                            }}
                                                            className={`text-white text-xs font-bold py-1 px-2 rounded shadow-sm transition-colors ${record.type === 'EXPENSE' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-600 hover:bg-green-700'}`}
                                                            title={record.type === 'EXPENSE' ? "Mark as Paid" : "Mark as Received"}
                                                        >
                                                            {record.type === 'EXPENSE' ? 'Pay' : 'Rec'}
                                                        </button>
                                                    )}
                                                    {isCompleted && onPrintRecord && (
                                                        <button 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onPrintRecord(record);
                                                            }}
                                                            className="bg-indigo-600 text-white text-xs font-bold py-1 px-2 rounded shadow-sm hover:bg-indigo-700 transition-colors flex items-center gap-1"
                                                            title="Print Receipt"
                                                        >
                                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                                                            Print
                                                        </button>
                                                    )}
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onEditRecord(record);
                                                        }}
                                                        className="text-indigo-600 hover:text-indigo-900 text-xs font-medium border border-indigo-200 px-1.5 py-1 rounded"
                                                    >
                                                        Edit
                                                    </button>
                                                    {canDelete && (
                                                        <button 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onDeleteRecord(record.id);
                                                            }}
                                                            className="text-red-600 hover:text-red-900 text-xs font-medium border border-red-200 px-1.5 py-1 rounded"
                                                        >
                                                            Del
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
