
import React, { useState, useMemo } from 'react';
import { FinancialRecord, UserRole, VillageType } from '../../types';
import { MUSHROOM_PRICES } from '../../constants';

interface FinancialsTabProps {
    records: FinancialRecord[];
    onAddRecord: () => void;
    onEditRecord: (rec: FinancialRecord) => void;
    onDeleteRecord: (id: string) => void;
    onSettleRecord?: (rec: FinancialRecord) => void;
    onPrintRecord?: (rec: FinancialRecord) => void;
    onInjectCapital?: () => void;
    userRole: UserRole;
    theme: any;
    financeOverviewData?: any;
    chartFilter?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
    setChartFilter?: (f: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY') => void;
    onFilterChange: (period: string, category: string, status: string) => void;
    villageId?: VillageType;
}

export const FinancialsTab: React.FC<FinancialsTabProps> = ({ 
    records, onAddRecord, onEditRecord, onDeleteRecord, onSettleRecord, onPrintRecord, onInjectCapital, userRole, theme, 
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

    const filteredRecords = useMemo(() => {
        return records.filter(rec => {
            // Period Filter
            const date = new Date(rec.date);
            const now = new Date();
            if (financialPeriod === 'TODAY') {
                if (date.toDateString() !== now.toDateString()) return false;
            } else if (financialPeriod === 'MONTH') {
                if (date.getMonth() !== now.getMonth() || date.getFullYear() !== now.getFullYear()) return false;
            }

            // Category Filter
            if (filterCategory !== 'ALL' && rec.category !== filterCategory) return false;

            // Status Filter
            if (filterStatus !== 'ALL') {
                const status = rec.status || 'COMPLETED'; // Default to COMPLETED if undefined
                if (status !== filterStatus) return false;
            }

            return true;
        });
    }, [records, financialPeriod, filterCategory, filterStatus]);

    const performanceData = useMemo(() => {
        const incomeRecords = records.filter(r => r.type === 'INCOME');
        const expenseRecords = records.filter(r => r.type === 'EXPENSE');

        const salesIncome = incomeRecords.filter(r => r.category === 'Sales').reduce((acc, curr) => acc + curr.amount, 0);
        const materialCosts = expenseRecords.filter(r => r.category === 'Supplies').reduce((acc, curr) => acc + curr.amount, 0);
        const otherExpenses = expenseRecords.filter(r => r.category !== 'Supplies').reduce((acc, curr) => acc + curr.amount, 0);
        const otherIncome = incomeRecords.filter(r => r.category !== 'Sales').reduce((acc, curr) => acc + curr.amount, 0);

        // Capital Available Calculation (Completed transactions only)
        const completedIncome = records.filter(r => r.type === 'INCOME' && (r.status === 'COMPLETED' || !r.status)).reduce((acc, curr) => acc + curr.amount, 0);
        const completedExpense = records.filter(r => r.type === 'EXPENSE' && (r.status === 'COMPLETED' || !r.status)).reduce((acc, curr) => acc + curr.amount, 0);
        const capitalAvailable = completedIncome - completedExpense;

        return {
            salesIncome,
            materialCosts,
            otherExpenses,
            otherIncome,
            totalIncome: salesIncome + otherIncome,
            totalExpense: materialCosts + otherExpenses,
            grossMargin: salesIncome - materialCosts,
            netProfit: (salesIncome + otherIncome) - (materialCosts + otherExpenses),
            capitalAvailable
        };
    }, [records]);

    const handlePrintPerformance = (type: 'MONTHLY' | 'YEARLY') => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const dateStr = new Date().toLocaleDateString();
        const p = performanceData;
        const reportTitle = `${type === 'MONTHLY' ? 'Monthly' : 'Yearly'} Financial Statement`;

        printWindow.document.write(`
            <html>
                <head>
                    <title>Financial Statement - ${villageId}</title>
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=Times+New+Roman&display=swap');
                        body { font-family: 'Times New Roman', serif; padding: 40px; color: #000; line-height: 1.4; max-width: 800px; margin: 0 auto; }
                        .letterhead { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #000; padding-bottom: 20px; }
                        .company-name { font-size: 24px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; }
                        .report-title { font-size: 18px; font-weight: bold; margin-top: 20px; text-decoration: underline; }
                        .meta-info { display: flex; justify-content: space-between; margin-bottom: 30px; font-size: 12px; }
                        .section-header { background-color: #f0f0f0; font-weight: bold; padding: 5px 10px; border-top: 1px solid #000; border-bottom: 1px solid #000; margin-top: 20px; font-size: 14px; }
                        .line-item { display: flex; justify-content: space-between; padding: 8px 10px; border-bottom: 1px dotted #ccc; font-size: 13px; }
                        .total-line { display: flex; justify-content: space-between; padding: 10px; font-weight: bold; font-size: 14px; border-top: 1px solid #000; margin-top: 5px; }
                        .grand-total { border-top: 2px double #000; border-bottom: 2px double #000; font-size: 16px; margin-top: 20px; background-color: #f9f9f9; }
                        .footer { margin-top: 60px; text-align: center; font-size: 10px; font-style: italic; }
                        .signatures { display: flex; justify-content: space-between; margin-top: 80px; }
                        .sig-block { border-top: 1px solid #000; width: 200px; text-align: center; padding-top: 5px; font-size: 12px; }
                        @media print { body { padding: 0; } }
                    </style>
                </head>
                <body>
                    <div class="letterhead">
                        <div class="company-name">Mushroom Village Supply Chain</div>
                        <div>${villageId || 'Central Operations'}</div>
                        <div class="report-title">${reportTitle.toUpperCase()}</div>
                    </div>

                    <div class="meta-info">
                        <div>Report Generated: ${dateStr}</div>
                        <div>Period: ${type}</div>
                        <div>Currency: MYR (RM)</div>
                    </div>

                    <div class="section-header">REVENUE</div>
                    <div class="line-item">
                        <span>Sales Revenue</span>
                        <span>${p.salesIncome.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                    </div>
                    <div class="line-item">
                        <span>Other Income / Investments</span>
                        <span>${p.otherIncome.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                    </div>
                    <div class="total-line">
                        <span>TOTAL REVENUE</span>
                        <span>${p.totalIncome.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                    </div>

                    <div class="section-header">OPERATING EXPENSES</div>
                    <div class="line-item">
                        <span>Cost of Goods Sold (Supplies)</span>
                        <span>(${p.materialCosts.toLocaleString(undefined, {minimumFractionDigits: 2})})</span>
                    </div>
                    <div class="line-item">
                        <span>Operational Expenses (Labor, Utilities, etc.)</span>
                        <span>(${p.otherExpenses.toLocaleString(undefined, {minimumFractionDigits: 2})})</span>
                    </div>
                    <div class="total-line">
                        <span>TOTAL EXPENSES</span>
                        <span>(${p.totalExpense.toLocaleString(undefined, {minimumFractionDigits: 2})})</span>
                    </div>

                    <div class="grand-total total-line">
                        <span>NET PROFIT / (LOSS)</span>
                        <span>${p.netProfit.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                    </div>

                    <div class="signatures">
                        <div class="sig-block">Prepared By</div>
                        <div class="sig-block">Approved By</div>
                    </div>

                    <div class="footer">
                        This is a computer-generated document. No signature is required unless for official auditing purposes.
                    </div>
                    <script>window.onload = () => { window.print(); window.close(); }</script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    const handlePrintMushroomProfitability = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        // 1. Filter Logic
        const sales = records.filter(r => r.type === 'INCOME' && r.category === 'Sales');
        const suppliesCost = records.filter(r => r.type === 'EXPENSE' && r.category === 'Supplies').reduce((acc, curr) => acc + curr.amount, 0);
        
        // 2. Group by Mushroom Strain
        const strains = ['Button', 'Oyster', 'Shiitake', "Lion's Mane"];
        const strainStats: Record<string, { weight: number, revenue: number }> = {};
        let totalSalesWeight = 0;

        strains.forEach(s => strainStats[s] = { weight: 0, revenue: 0 });

        sales.forEach(rec => {
            const desc = (rec.description || "").toLowerCase();
            let matched = false;
            
            for (const s of strains) {
                if (desc.includes(s.toLowerCase())) {
                    strainStats[s].weight += (rec.weightKg || 0);
                    strainStats[s].revenue += rec.amount;
                    totalSalesWeight += (rec.weightKg || 0);
                    matched = true;
                    break;
                }
            }
            // Fallback for unclassified sales
            if (!matched && rec.weightKg) {
                totalSalesWeight += rec.weightKg;
            }
        });

        // 3. Generate Table Rows
        const rows = strains.map(s => {
            const weight = strainStats[s].weight;
            const revenue = strainStats[s].revenue;
            const pricePerKg = MUSHROOM_PRICES[s] || MUSHROOM_PRICES[`${s} Mushroom`];
            
            // Allocated Cost: (Strain Weight / Total Weight) * Total Supply Cost
            const allocatedCost = totalSalesWeight > 0 ? (weight / totalSalesWeight) * suppliesCost : 0;
            const profit = revenue - allocatedCost;
            const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

            return `
                <tr>
                    <td style="font-weight: bold;">${s}</td>
                    <td style="text-align: right;">RM ${pricePerKg.toFixed(2)}</td>
                    <td style="text-align: right;">${weight.toFixed(2)}</td>
                    <td style="text-align: right;">RM ${revenue.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                    <td style="text-align: right;">(RM ${allocatedCost.toLocaleString(undefined, {minimumFractionDigits: 2})})</td>
                    <td style="text-align: right; font-weight: bold;">RM ${profit.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                    <td style="text-align: right;">${margin.toFixed(1)}%</td>
                </tr>
            `;
        }).join('');

        const totalRevenue = Object.values(strainStats).reduce((a, b) => a + b.revenue, 0);
        const totalProfit = totalRevenue - suppliesCost;

        printWindow.document.write(`
            <html>
                <head>
                    <title>Product Profitability Report</title>
                    <style>
                        body { font-family: 'Times New Roman', serif; padding: 40px; color: #000; }
                        h1 { font-size: 20px; text-transform: uppercase; text-align: center; margin-bottom: 5px; text-decoration: underline; }
                        .subtitle { text-align: center; font-size: 12px; margin-bottom: 40px; }
                        table { width: 100%; border-collapse: collapse; border: 1px solid #000; }
                        th { background: #eee; text-align: right; padding: 8px; font-size: 12px; text-transform: uppercase; border-bottom: 1px solid #000; border-right: 1px solid #ccc; }
                        th:first-child { text-align: left; }
                        td { padding: 8px; border-bottom: 1px solid #ccc; font-size: 13px; border-right: 1px solid #ccc; }
                        .totals { background: #f9f9f9; font-weight: bold; border-top: 2px solid #000; }
                        .note { margin-top: 20px; font-size: 11px; font-style: italic; }
                    </style>
                </head>
                <body>
                    <h1>Product Profitability Analysis</h1>
                    <div class="subtitle">Generated for ${villageId || 'All Villages'} on ${new Date().toLocaleDateString()}</div>

                    <table>
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>Ref Price/kg</th>
                                <th>Sold (kg)</th>
                                <th>Revenue</th>
                                <th>Allocated Cost</th>
                                <th>Net Profit</th>
                                <th>Margin</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                            <tr class="totals">
                                <td>TOTALS</td>
                                <td>-</td>
                                <td style="text-align: right;">${totalSalesWeight.toFixed(2)}</td>
                                <td style="text-align: right;">RM ${totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                <td style="text-align: right;">(RM ${suppliesCost.toLocaleString(undefined, {minimumFractionDigits: 2})})</td>
                                <td style="text-align: right;">RM ${totalProfit.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                <td>-</td>
                            </tr>
                        </tbody>
                    </table>

                    <div class="note">
                        * Cost Allocation Method: Total Supply Expenses are prorated across product lines based on sales volume (weight).
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
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Capital Available</span>
                        <div className={`text-2xl font-black ${performanceData.capitalAvailable >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                            RM{performanceData.capitalAvailable.toLocaleString()}
                        </div>
                        <p className="text-[9px] text-gray-400 mt-1 font-bold">Current Liquidity</p>
                    </div>
                    <div className="bg-gray-900 p-5 rounded-xl border border-gray-800 shadow-xl flex flex-col justify-between">
                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1">Print Reports</span>
                        <div className="flex flex-col gap-2 mt-1">
                            <button 
                                onClick={handlePrintMushroomProfitability}
                                className="w-full bg-green-600 hover:bg-green-700 text-white text-[9px] font-black uppercase py-2 rounded transition-all flex items-center justify-center gap-2"
                            >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Mushroom Profit Report
                            </button>
                            <div className="flex gap-2">
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
                    <div className="flex gap-2">
                        {(isFinanceOrAdmin && (villageId === VillageType.A || villageId === VillageType.B) && onInjectCapital) && (
                            <button
                                onClick={onInjectCapital}
                                className="px-4 py-2 rounded-md text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 flex items-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                Inject Capital
                            </button>
                        )}
                        <button
                            onClick={onAddRecord}
                            className={`px-4 py-2 rounded-md text-sm font-medium text-white ${theme.button}`}
                        >
                            Add Record
                        </button>
                    </div>
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
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Batch Link</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                {(canDelete || canEdit) && <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredRecords.map((record) => {
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
                                        <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate" title={record.description} onClick={() => onEditRecord(record)}>{record.description || '-'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" onClick={() => onEditRecord(record)}>
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-1">
                                                    <span className="font-mono text-xs font-bold text-gray-800">{record.batchId || '-'}</span>
                                                    {record.attachmentName && (
                                                        <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <title>Attached: {record.attachmentName}</title>
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
