
import React, { useState, useMemo } from 'react';
import { FinancialRecord, UserRole, VillageType } from '../../types';

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
    villageId?: VillageType;
}

export const FinancialsTab: React.FC<FinancialsTabProps> = ({ 
    records, onAddRecord, onEditRecord, onDeleteRecord, onSettleRecord, onPrintRecord, userRole, theme, 
    financeOverviewData, chartFilter, setChartFilter, onFilterChange, villageId
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

    const performanceData = useMemo(() => {
        const incomeRecords = records.filter(r => r.type === 'INCOME');
        const expenseRecords = records.filter(r => r.type === 'EXPENSE');

        const salesIncome = incomeRecords.filter(r => r.category === 'Sales').reduce((acc, curr) => acc + curr.amount, 0);
        const materialCosts = expenseRecords.filter(r => r.category === 'Supplies').reduce((acc, curr) => acc + curr.amount, 0);
        const otherExpenses = expenseRecords.filter(r => r.category !== 'Supplies').reduce((acc, curr) => acc + curr.amount, 0);
        const otherIncome = incomeRecords.filter(r => r.category !== 'Sales').reduce((acc, curr) => acc + curr.amount, 0);

        return {
            salesIncome,
            materialCosts,
            otherExpenses,
            otherIncome,
            totalIncome: salesIncome + otherIncome,
            totalExpense: materialCosts + otherExpenses,
            grossMargin: salesIncome - materialCosts,
            netProfit: (salesIncome + otherIncome) - (materialCosts + otherExpenses)
        };
    }, [records]);

    const handlePrintPerformance = (type: 'MONTHLY' | 'YEARLY') => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const dateStr = new Date().toLocaleDateString();
        const p = performanceData;
        const reportTitle = `${type === 'MONTHLY' ? 'Monthly' : 'Yearly'} Financial Performance Report`;

        printWindow.document.write(`
            <html>
                <head>
                    <title>${reportTitle}</title>
                    <style>
                        body { font-family: 'Inter', sans-serif; padding: 40px; color: #333; line-height: 1.6; }
                        .header { border-bottom: 3px solid #1e40af; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-end; }
                        .title { font-size: 28px; font-weight: 800; color: #1e3a8a; margin: 0; text-transform: uppercase; letter-spacing: -0.5px; }
                        .subtitle { font-size: 14px; color: #64748b; margin: 5px 0 0 0; font-weight: 600; }
                        .section-title { font-size: 16px; font-weight: 800; color: #1e40af; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin: 30px 0 15px 0; }
                        .metrics-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
                        .metric-card { background: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px; }
                        .metric-label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
                        .metric-value { font-size: 24px; font-weight: 800; color: #1e293b; }
                        .metric-value.positive { color: #15803d; }
                        .metric-value.negative { color: #b91c1c; }
                        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                        th { text-align: left; background: #f1f5f9; padding: 12px 10px; font-size: 11px; text-transform: uppercase; font-weight: 700; color: #475569; }
                        td { padding: 10px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
                        .total-row { background: #f8fafc; font-weight: 800; }
                        .footer { margin-top: 50px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 20px; }
                        @media print { .no-print { display: none; } body { padding: 20px; } }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div>
                            <h1 class="title">${reportTitle}</h1>
                            <p class="subtitle">${villageId || 'Mushroom Supply Chain'}</p>
                        </div>
                        <div style="text-align: right; font-size: 12px; color: #64748b;">
                            Period: ${type === 'MONTHLY' ? 'Current Month' : 'Current Year'}<br>
                            Generated: ${dateStr}
                        </div>
                    </div>

                    <div class="section-title">Executive Summary</div>
                    <div class="metrics-grid">
                        <div class="metric-card">
                            <div class="metric-label">Sales Revenue (In Flow)</div>
                            <div class="metric-value positive">RM ${p.salesIncome.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-label">Input Costs (Out Flow)</div>
                            <div class="metric-value negative">RM ${p.materialCosts.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-label">Total Cash Inflow</div>
                            <div class="metric-value positive">RM ${p.totalIncome.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-label">Total Cash Outflow</div>
                            <div class="metric-value negative">RM ${p.totalExpense.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                        </div>
                    </div>

                    <div class="section-title">Net Balance</div>
                    <div class="metric-card" style="background: #eff6ff; border-color: #bfdbfe;">
                        <div class="metric-label" style="color: #1e40af;">Operating Surplus/Deficit</div>
                        <div class="metric-value ${p.netProfit >= 0 ? 'positive' : 'negative'}">RM ${p.netProfit.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                    </div>

                    <div class="footer">
                        This document is a certified financial snapshot generated by the Mushroom Village ERP.
                    </div>
                    <script>window.onload = () => { window.print(); window.close(); }</script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    const canDelete = userRole === 'admin' || userRole === 'finance';
    const canEdit = userRole === 'admin' || userRole === 'finance';

    return (
        <div className="space-y-6 animate-fade-in-up">
            {/* Performance Summary Cards (For A and B specifically) */}
            {(villageId === VillageType.A || villageId === VillageType.B) && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Total In Flow</span>
                        <div className="text-2xl font-black text-emerald-600">RM{performanceData.totalIncome.toLocaleString()}</div>
                        <p className="text-[9px] text-gray-400 mt-1 font-bold">Sales & Investments</p>
                    </div>
                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Total Out Flow</span>
                        <div className="text-2xl font-black text-rose-500">RM{performanceData.totalExpense.toLocaleString()}</div>
                        <p className="text-[9px] text-gray-400 mt-1 font-bold italic">Procurement & Ops</p>
                    </div>
                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Net Flow</span>
                        <div className={`text-2xl font-black ${performanceData.netProfit >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
                            RM{performanceData.netProfit.toLocaleString()}
                        </div>
                    </div>
                    <div className="bg-gray-900 p-5 rounded-xl border border-gray-800 shadow-xl flex flex-col justify-between">
                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1">Print Performance</span>
                        <div className="flex gap-2 mt-2">
                            <button 
                                onClick={() => handlePrintPerformance('MONTHLY')}
                                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-[9px] font-black uppercase py-2 rounded transition-all"
                            >
                                Monthly
                            </button>
                            <button 
                                onClick={() => handlePrintPerformance('YEARLY')}
                                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[9px] font-black uppercase py-2 rounded transition-all"
                            >
                                Yearly
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Finance Dashboard Section */}
            {isFinanceOrAdmin && financeOverviewData && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Cash Flow Trends</h2>
                            <p className="text-xs text-gray-500">In flow vs Out flow analysis</p>
                        </div>
                        <div className="flex items-center gap-4">
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
                            <button 
                                onClick={() => setShowOverview(!showOverview)}
                                className="text-indigo-600 text-xs font-bold hover:text-indigo-800 transition-colors uppercase tracking-widest"
                            >
                                {showOverview ? 'Hide Summary' : 'Show Summary'}
                            </button>
                        </div>
                    </div>

                    {showOverview && (
                        <div className="p-6 space-y-6 animate-fade-in">
                            <div className="h-48 w-full flex items-end justify-between gap-2 overflow-x-auto pb-4">
                                {financeOverviewData.chartData.length === 0 ? (
                                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm italic">No data recorded for this view</div>
                                ) : (
                                    financeOverviewData.chartData.map((d: any) => (
                                        <div key={d.label} className="flex flex-col items-center flex-1 group min-w-[40px]">
                                            <div className="relative w-full h-full flex items-end justify-center gap-1">
                                                <div 
                                                    className="w-full bg-emerald-500 rounded-t-sm transition-all duration-300 group-hover:bg-emerald-400 relative"
                                                    style={{ height: `${Math.max((d.income / (financeOverviewData.maxChartValue || 100)) * 100, 2)}%` }}
                                                >
                                                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] font-bold text-emerald-600 opacity-0 group-hover:opacity-100">+{d.income}</span>
                                                </div>
                                                <div 
                                                    className="w-full bg-rose-400 rounded-t-sm transition-all duration-300 group-hover:bg-rose-300 relative"
                                                    style={{ height: `${Math.max((d.expense / (financeOverviewData.maxChartValue || 100)) * 100, 2)}%` }}
                                                >
                                                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] font-bold text-rose-600 opacity-0 group-hover:opacity-100">-{d.expense}</span>
                                                </div>
                                            </div>
                                            <span className="text-[8px] text-gray-400 mt-2 font-bold uppercase truncate w-full text-center">{d.label}</span>
                                        </div>
                                    ))
                                )}
                            </div>
                            <div className="flex justify-center gap-4 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                <span className="flex items-center gap-1.5"><div className="w-2 h-2 bg-emerald-500 rounded-sm"></div> In Flow</span>
                                <span className="flex items-center gap-1.5"><div className="w-2 h-2 bg-rose-400 rounded-sm"></div> Out Flow</span>
                            </div>
                        </div>
                    )}
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
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Transaction ID</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Batch Link</th>
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
                                        <td className="px-6 py-4 whitespace-nowrap text-xs font-mono font-bold text-gray-900" onClick={() => onEditRecord(record)}>{record.transactionId}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" onClick={() => onEditRecord(record)}>{new Date(record.date).toLocaleDateString()}</td>
                                        <td className="px-6 py-4 whitespace-nowrap" onClick={() => onEditRecord(record)}>
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${record.type === 'INCOME' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                {record.type}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" onClick={() => onEditRecord(record)}>{record.category}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" onClick={() => onEditRecord(record)}>
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-1">
                                                    <span className="font-mono text-xs font-bold text-gray-800">{record.batchId || '-'}</span>
                                                    {record.attachmentName && (
                                                        <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" title={`Attached: ${record.attachmentName}`}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                                        </svg>
                                                    )}
                                                </div>
                                                {record.category === 'Sales' && record.weightKg && <span className="text-[10px] font-bold text-indigo-600">{record.weightKg} kg sold</span>}
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
                                                            {record.type === 'EXPENSE' ? 'Pay' : 'Receive'}
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