import React, { useState, useMemo, useEffect } from 'react';
import { FinancialRecord, UserRole, VillageType } from '../../types';
import { MUSHROOM_PRICES } from '../../constants';

interface FinancialsLedgerTabProps {
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
    villageId: VillageType;
    filterOverride?: {status?: 'ALL' | 'COMPLETED' | 'PENDING', category?: string} | null;
    onFilterApplied?: () => void;
}

export const FinancialsLedgerTab: React.FC<FinancialsLedgerTabProps> = ({ 
    records, onAddRecord, onEditRecord, onDeleteRecord, onSettleRecord, onPrintRecord, onInjectCapital, userRole, theme, 
    financeOverviewData, chartFilter, setChartFilter, onFilterChange, villageId, filterOverride, onFilterApplied
}) => {
    const [financialPeriod, setFinancialPeriod] = useState<'ALL' | 'MONTH' | 'TODAY'>('ALL');
    const [filterCategory, setFilterCategory] = useState('ALL');
    const [filterStatus, setFilterStatus] = useState<'ALL' | 'COMPLETED' | 'PENDING'>('ALL');
    const [showOverview, setShowOverview] = useState(true);

    const isFinanceOrAdmin = userRole === 'finance' || userRole === 'admin';
    const isStaffOrUser = userRole === 'user' || userRole === 'finance' || userRole === 'admin';
    const isVillageC = villageId === VillageType.C;

    // Apply Override Filters
    useEffect(() => {
        if (filterOverride) {
            if (filterOverride.status) setFilterStatus(filterOverride.status);
            if (filterOverride.category) setFilterCategory(filterOverride.category);
            setFinancialPeriod('ALL');
            if (onFilterApplied) onFilterApplied();
        }
    }, [filterOverride, onFilterApplied]);

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
            if (!rec) return false;
            const date = new Date(rec.date);
            const now = new Date();
            
            if (financialPeriod === 'TODAY') {
                if (date.toDateString() !== now.toDateString()) return false;
            } else if (financialPeriod === 'MONTH') {
                if (date.getMonth() !== now.getMonth() || date.getFullYear() !== now.getFullYear()) return false;
            }

            if (filterCategory !== 'ALL' && rec.category !== filterCategory) return false;
            if (filterStatus !== 'ALL') {
                const status = rec.status || 'COMPLETED';
                if (status !== filterStatus) return false;
            }
            return true;
        });
    }, [records, financialPeriod, filterCategory, filterStatus]);

    const handlePrintFinancialStatement = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        // Data Aggregation for Statement
        const completed = filteredRecords.filter(r => r.status === 'COMPLETED' || !r.status);
        
        // Identity & Structure mapping
        const isFarming = villageId === VillageType.A || villageId === VillageType.B;
        const villageTitle = villageId === VillageType.A ? "Village A Cultivation Center" : 
                             villageId === VillageType.B ? "Village B Spore Bank" : 
                             "Village C Processing Hub";

        // Revenue
        const grossSales = completed
            .filter(r => r.type === 'INCOME' && r.category === 'Sales')
            .reduce((a, b) => a + b.amount, 0);

        const otherIncome = completed
            .filter(r => r.type === 'INCOME' && r.category !== 'Sales')
            .reduce((a, b) => a + b.amount, 0);

        // COGS components
        const rawMaterials = completed
            .filter(r => r.type === 'EXPENSE' && r.category === 'Supplies' && !(r.description?.toLowerCase().includes('packaging')))
            .reduce((a, b) => a + b.amount, 0);
            
        const directLabor = completed
            .filter(r => r.type === 'EXPENSE' && r.category === 'Labor')
            .reduce((a, b) => a + b.amount, 0);

        const packaging = completed
            .filter(r => r.type === 'EXPENSE' && (r.description?.toLowerCase().includes('packaging') || r.description?.toLowerCase().includes('consumables')))
            .reduce((a, b) => a + b.amount, 0);

        const utilities = completed
            .filter(r => r.type === 'EXPENSE' && r.category === 'Utilities')
            .reduce((a, b) => a + b.amount, 0);

        const logistics = completed
            .filter(r => r.type === 'EXPENSE' && r.category === 'Logistics')
            .reduce((a, b) => a + b.amount, 0);

        // Calculate COGS
        const totalCOGS = rawMaterials + directLabor + (isFarming ? utilities : (packaging + logistics));
        const grossProfit = grossSales - totalCOGS;

        // Operating Expenses
        const adminExpenses = completed
            .filter(r => r.type === 'EXPENSE' && r.category === 'Others')
            .reduce((a, b) => a + b.amount, 0);
            
        const maintenance = completed
            .filter(r => r.type === 'EXPENSE' && r.category === 'Maintenance')
            .reduce((a, b) => a + b.amount, 0);

        const opExUtilities = !isFarming ? utilities : 0;

        const totalOpEx = adminExpenses + maintenance + opExUtilities;
        const netProfit = grossProfit + otherIncome - totalOpEx;

        const dateRange = financialPeriod === 'ALL' 
            ? 'All Time' 
            : financialPeriod === 'MONTH' 
                ? new Date().toLocaleDateString('default', { month: 'long', year: 'numeric' })
                : new Date().toLocaleDateString();

        const formatCurr = (val: number) => val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        printWindow.document.write(`
            <html>
                <head>
                    <title>${villageId} Financial Statement</title>
                    <style>
                        body { font-family: 'Times New Roman', serif; color: #000; line-height: 1.5; padding: 0; margin: 0; }
                        .container { max-width: 800px; margin: 40px auto; padding: 40px; border: 1px solid #eee; box-shadow: 0 0 10px rgba(0,0,0,0.05); }
                        .header { text-align: center; margin-bottom: 40px; }
                        .header h1 { font-size: 24px; margin: 0; text-transform: uppercase; letter-spacing: 2px; }
                        .header h2 { font-size: 18px; margin: 5px 0; font-weight: normal; }
                        .header p { font-size: 14px; margin: 5px 0; font-style: italic; }
                        
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        .section-title { font-weight: bold; text-transform: uppercase; border-bottom: 2px solid #000; padding-top: 20px; }
                        .row td { padding: 8px 0; font-size: 14px; }
                        .figure { text-align: right; font-family: 'Courier New', Courier, monospace; width: 150px; }
                        .indent { padding-left: 20px !important; }
                        
                        .subtotal-row { font-weight: bold; border-top: 1px solid #000; }
                        .gross-profit { font-weight: bold; background: #f9f9f9; }
                        .net-profit { font-weight: bold; font-size: 18px; }
                        .double-underline { border-bottom: 3px double #000; }
                        
                        .footer { margin-top: 60px; font-size: 10px; color: #666; display: flex; justify-content: space-between; border-top: 1px dashed #ccc; padding-top: 10px; }
                        
                        @media print {
                            body { margin: 0; padding: 0; }
                            .container { border: none; box-shadow: none; margin: 0; max-width: 100%; padding: 1in; }
                            .footer { position: fixed; bottom: 1in; width: calc(100% - 2in); }
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>${villageTitle}</h1>
                            <h2>Statement of Profit or Loss</h2>
                            <p>For the Period Ended ${dateRange}</p>
                        </div>

                        <table>
                            <tr class="section-title">
                                <td colspan="2">Revenue</td>
                            </tr>
                            <tr class="row">
                                <td>Gross Sales (${isFarming ? 'Raw Mushrooms' : 'Processed Goods'})</td>
                                <td class="figure">RM ${formatCurr(grossSales)}</td>
                            </tr>
                            ${otherIncome > 0 ? `
                            <tr class="row">
                                <td>Other Operating Income</td>
                                <td class="figure">RM ${formatCurr(otherIncome)}</td>
                            </tr>` : ''}

                            <tr class="section-title">
                                <td colspan="2">Cost of Goods Sold (COGS)</td>
                            </tr>
                            <tr class="row">
                                <td class="indent">${isFarming ? 'Cultivation Supplies (Substrate, Spores)' : 'Raw Material Costs (Internal Transfers)'}</td>
                                <td class="figure">(${formatCurr(rawMaterials)})</td>
                            </tr>
                            <tr class="row">
                                <td class="indent">Direct Labor</td>
                                <td class="figure">(${formatCurr(directLabor)})</td>
                            </tr>
                            ${!isFarming ? `
                            <tr class="row">
                                <td class="indent">Packaging & Consumables</td>
                                <td class="figure">(${formatCurr(packaging)})</td>
                            </tr>
                            <tr class="row">
                                <td class="indent">Logistics & Freight</td>
                                <td class="figure">(${formatCurr(logistics)})</td>
                            </tr>` : `
                            <tr class="row">
                                <td class="indent">Direct Utilities (Water/Electricity)</td>
                                <td class="figure">(${formatCurr(utilities)})</td>
                            </tr>`}
                            
                            <tr class="row subtotal-row">
                                <td>Total Cost of Goods Sold</td>
                                <td class="figure">RM (${formatCurr(totalCOGS)})</td>
                            </tr>

                            <tr class="row subtotal-row gross-profit">
                                <td style="padding: 12px 0;">GROSS PROFIT</td>
                                <td class="figure">RM ${formatCurr(grossProfit)}</td>
                            </tr>

                            <tr class="section-title">
                                <td colspan="2">Operating Expenses</td>
                            </tr>
                            <tr class="row">
                                <td class="indent">Administrative Expenses</td>
                                <td class="figure">(${formatCurr(adminExpenses)})</td>
                            </tr>
                            <tr class="row">
                                <td class="indent">Facility Maintenance</td>
                                <td class="figure">(${formatCurr(maintenance)})</td>
                            </tr>
                            ${!isFarming && utilities > 0 ? `
                            <tr class="row">
                                <td class="indent">General Utilities</td>
                                <td class="figure">(${formatCurr(utilities)})</td>
                            </tr>` : ''}
                            
                            <tr class="row subtotal-row net-profit">
                                <td style="padding: 15px 0;">NET PROFIT FOR THE PERIOD</td>
                                <td class="figure double-underline">RM ${formatCurr(netProfit)}</td>
                            </tr>
                        </table>

                        <div class="footer">
                            <span>Report Generated by AAIS System on ${new Date().toLocaleString()}</span>
                            <span>Page 1 of 1</span>
                        </div>
                    </div>
                    <script>
                        window.onload = () => { window.print(); window.close(); }
                    </script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    // Specialized Print Helper for Village C Ledger
    const handlePrintSpecializedDoc = (record: FinancialRecord, docType: 'SALES RECEIPT' | 'CUSTOMER ORDER' | 'PURCHASE INVOICE') => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const dateStr = new Date(record.date).toLocaleDateString();
        const amountStr = record.amount.toFixed(2);
        const refLabel = record.type === 'INCOME' ? 'Order #:' : 'Invoice #:';
        
        printWindow.document.write(`
            <html>
                <head>
                    <title>${docType} - ${record.transactionId || record.id}</title>
                    <style>
                        body { font-family: 'Courier New', Courier, monospace; padding: 40px; color: #000; line-height: 1.4; max-width: 400px; margin: 0 auto; border: 1px solid #eee; }
                        .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 20px; margin-bottom: 20px; }
                        .title { font-size: 18px; font-weight: bold; text-transform: uppercase; margin-top: 10px; }
                        .village { font-size: 22px; font-weight: 900; margin: 0; }
                        .row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; }
                        .label { color: #666; text-transform: uppercase; }
                        .value { font-weight: bold; }
                        .total-box { border-top: 2px solid #000; margin-top: 20px; padding-top: 10px; }
                        .grand-total { font-size: 20px; font-weight: 900; display: flex; justify-content: space-between; }
                        .footer { text-align: center; margin-top: 40px; font-size: 10px; border-top: 1px dashed #ccc; padding-top: 20px; color: #888; }
                        @media print { body { border: none; padding: 0; margin: 0; width: 100%; } }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <p class="village">${villageId.toUpperCase()}</p>
                        <p>${isVillageC ? 'Central Hub Operations' : 'Farming & Cultivation'}</p>
                        <div class="title">${docType}</div>
                    </div>
                    
                    <div class="row">
                        <span class="label">Date:</span>
                        <span class="value">${dateStr}</span>
                    </div>
                    <div class="row">
                        <span class="label">Ref ID:</span>
                        <span class="value">${record.transactionId || record.id}</span>
                    </div>
                    ${record.orderNumber ? `
                    <div class="row">
                        <span class="label">${refLabel}</span>
                        <span class="value">${record.orderNumber}</span>
                    </div>` : ''}
                    <div class="row">
                        <span class="label">Type:</span>
                        <span class="value">${record.category}</span>
                    </div>
                    <div class="row">
                        <span class="label">Clerk:</span>
                        <span class="value">${record.recordedBy.split('@')[0]}</span>
                    </div>

                    <div style="margin: 20px 0; min-height: 60px; padding: 10px; background: #f9f9f9; font-size: 12px; border: 1px solid #eee;">
                        <div class="label" style="margin-bottom: 5px;">Description:</div>
                        <div class="value">${record.description || 'General Transaction Record'}</div>
                    </div>

                    <div class="total-box">
                        <div class="grand-total">
                            <span>TOTAL:</span>
                            <span>RM${amountStr}</span>
                        </div>
                        <div class="row" style="margin-top: 10px;">
                            <span class="label">Payment Mode:</span>
                            <span class="value">${record.paymentMethod || 'TBD'}</span>
                        </div>
                        <div class="row">
                            <span class="label">Status:</span>
                            <span class="value">${record.status || 'COMPLETED'}</span>
                        </div>
                    </div>

                    <div class="footer">
                        Mushroom Village Supply Chain v2.5.0<br>
                        Digital Ledger Record System<br>
                        Thank you for your business.
                    </div>
                    <script>window.onload = () => { window.print(); window.close(); }</script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    const canEdit = userRole === 'admin' || userRole === 'finance';

    return (
        <div className="space-y-6 animate-fade-in-up">
            
            {/* Actions: Reports */}
            <div className="bg-gray-900 p-5 rounded-xl border border-gray-800 shadow-xl flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="text-white">
                    <h3 className="font-bold">Financial Reporting Hub</h3>
                    <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Independent Ledger for {villageId}</p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <button 
                        onClick={handlePrintFinancialStatement}
                        className="flex-1 sm:flex-none px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase rounded transition-all flex items-center justify-center gap-2"
                    >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        Print Financial Statement
                    </button>
                </div>
            </div>

            {/* Finance Dashboard Section */}
            {isFinanceOrAdmin && financeOverviewData && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Financial Insights</h2>
                            <p className="text-xs text-gray-500">Performance for {villageId}</p>
                        </div>
                        <button onClick={() => setShowOverview(!showOverview)} className="text-indigo-600 text-xs font-bold hover:text-indigo-800 transition-colors uppercase tracking-widest">
                            {showOverview ? 'Hide Summary' : 'Show Summary'}
                        </button>
                    </div>

                    {showOverview && (
                        <div className="p-6 space-y-6 animate-fade-in">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl">
                                    <span className="text-[10px] font-bold text-emerald-600 uppercase block mb-1">Total Revenue</span>
                                    <div className="text-2xl font-black text-emerald-800">RM{financeOverviewData.totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                                </div>
                                <div className="bg-rose-50 border border-rose-100 p-4 rounded-xl">
                                    <span className="text-[10px] font-bold text-rose-600 uppercase block mb-1">Total Expenses</span>
                                    <div className="text-2xl font-black text-rose-800">RM{financeOverviewData.totalExpenses.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                                </div>
                                <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl">
                                    <span className="text-[10px] font-bold text-indigo-600 uppercase block mb-1">Net Cashflow</span>
                                    <div className={`text-2xl font-black ${financeOverviewData.netCashFlow >= 0 ? 'text-indigo-800' : 'text-rose-600'}`}>RM{Math.abs(financeOverviewData.netCashFlow).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                                </div>
                                <div className="bg-orange-50 border border-orange-100 p-4 rounded-xl">
                                    <span className="text-[10px] font-bold text-orange-600 uppercase block mb-1">Pending Income</span>
                                    <div className="text-2xl font-black text-orange-800">RM{financeOverviewData.totalReceivables.toLocaleString()}</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-bold text-gray-900">Financial Ledger ({villageId})</h2>
                    <div className="flex gap-2">
                        {isFinanceOrAdmin && onInjectCapital && (
                            <button onClick={onInjectCapital} className="px-4 py-2 rounded-md text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                Inject Capital
                            </button>
                        )}
                        <button onClick={onAddRecord} className={`px-4 py-2 rounded-md text-sm font-medium text-white ${theme.button}`}>
                            Add Record
                        </button>
                    </div>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                     <select value={financialPeriod} onChange={(e) => handleFilterUpdate(e.target.value as any, filterCategory, filterStatus)} className="block w-full sm:w-auto pl-3 pr-10 py-2 text-base border-gray-300 rounded-md border bg-gray-700 text-white">
                         <option value="ALL">All Time</option><option value="MONTH">This Month</option><option value="TODAY">Today</option>
                     </select>
                     <select value={filterCategory} onChange={(e) => handleFilterUpdate(financialPeriod, e.target.value, filterStatus)} className="block w-full sm:w-auto pl-3 pr-10 py-2 text-base border-gray-300 rounded-md border bg-gray-700 text-white">
                         <option value="ALL">All Categories</option>
                         <optgroup label="Revenue"><option value="Sales">Sales</option><option value="Investment">Investment</option><option value="Others">Others</option></optgroup>
                         <optgroup label="Expenses"><option value="Supplies">Supplies</option><option value="Equipment">Equipment</option><option value="Logistic">Logistic</option><option value="Labor">Labor</option><option value="Utilities">Utilities</option><option value="Maintenance">Maintenance</option><option value="Others">Others</option></optgroup>
                     </select>
                     <select value={filterStatus} onChange={(e) => handleFilterUpdate(financialPeriod, filterCategory, e.target.value as any)} className="block w-full sm:w-auto pl-3 pr-10 py-2 text-base border-gray-300 rounded-md border bg-gray-700 text-white">
                         <option value="ALL">All Status</option><option value="COMPLETED">Completed</option><option value="PENDING">Pending</option>
                     </select>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {isVillageC ? 'Order/Inv #' : 'Batch Link'}
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredRecords.map((record) => {
                                const delayed = record.status === 'PENDING' && isOverdue(record.date);
                                const isCompleted = record.status === 'COMPLETED' || !record.status;
                                const isPending = record.status === 'PENDING';
                                const isSales = record.category === 'Sales' && record.type === 'INCOME';
                                const isExpense = record.type === 'EXPENSE';

                                return (
                                    <tr key={record.id} className={`hover:bg-gray-50 ${delayed ? 'bg-red-50/30' : ''}`}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(record.date).toLocaleDateString()}</td>
                                        <td className="px-6 py-4 whitespace-nowrap"><span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${record.type === 'INCOME' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{record.type}</span></td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{record.category}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" onClick={() => onEditRecord(record)}>
                                            {isVillageC ? (
                                                <span className="font-mono font-bold text-indigo-600">{record.orderNumber || record.transactionId?.slice(-6)}</span>
                                            ) : (
                                                (record.category === 'Sales' && record.type === 'INCOME') ? (
                                                    <span className="font-mono font-bold text-indigo-600">{record.batchId || '-'}</span>
                                                ) : (
                                                    '-'
                                                )
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 truncate max-w-xs">{record.description}</td>
                                        <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold text-right ${record.type === 'INCOME' ? 'text-green-600' : 'text-red-600'}`}>RM{record.amount.toFixed(2)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isCompleted ? 'bg-gray-100 text-gray-800' : 'bg-yellow-100 text-yellow-800'}`}>{isCompleted ? 'Completed' : 'Pending'}</span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            <div className="flex justify-center space-x-2">
                                                {/* PAYMENT SETTLEMENT LOGIC */}
                                                {isPending && onSettleRecord && isStaffOrUser && (
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); onSettleRecord(record); }}
                                                        className={`text-white text-[9px] font-black uppercase px-2 py-1 rounded shadow-sm transition-colors ${record.type === 'EXPENSE' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                                                        title={record.type === 'EXPENSE' ? "Mark as Paid" : "Mark as Received"}
                                                    >
                                                        {record.type === 'EXPENSE' ? 'Pay' : 'Done Payment'}
                                                    </button>
                                                )}

                                                {/* DOCUMENT PRINT LOGIC */}
                                                {isSales && isCompleted && (
                                                    <button onClick={() => handlePrintSpecializedDoc(record, 'SALES RECEIPT')} className="bg-indigo-600 text-white text-[9px] font-black uppercase px-2 py-1 rounded shadow-sm hover:bg-indigo-700">Receipt</button>
                                                )}
                                                {isSales && isPending && (
                                                    <button onClick={() => handlePrintSpecializedDoc(record, 'CUSTOMER ORDER')} className="bg-blue-500 text-white text-[9px] font-black uppercase px-2 py-1 rounded shadow-sm hover:bg-blue-600">Customer Order</button>
                                                )}
                                                {isExpense && isPending && (
                                                    <button onClick={() => handlePrintSpecializedDoc(record, 'PURCHASE INVOICE')} className="bg-orange-500 text-white text-[9px] font-black uppercase px-2 py-1 rounded shadow-sm hover:bg-orange-600">Invoice</button>
                                                )}
                                                
                                                {/* Edit Actions */}
                                                <button onClick={() => onEditRecord(record)} className="text-gray-400 hover:text-indigo-600 p-1"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                                            </div>
                                        </td>
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