
import React from 'react';
import { FinancialRecord } from '../../../types';

// Fix: Changed property types from literal 0 to number to avoid assignability errors in OverviewTab
interface ProcessingViewProps {
    financeOverviewData: any;
    financialRecords: FinancialRecord[];
    setActiveTab: (tab: any) => void;
    processingStats: { intake: number; qc: number; packing: number; ready: number; };
    logisticsStats: { scheduled: number; delivering: number; failed: number; };
    predictedYield?: number;
}

// 1. FINANCE ROLE (The 3 Pillars + Pulse)
export const ProcessingFinanceView: React.FC<ProcessingViewProps> = ({
    financeOverviewData, financialRecords, setActiveTab
}) => {
    const salesRecords = financialRecords.filter(r => r.category === 'Sales' && r.type === 'INCOME');
    const recentSales = salesRecords.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);

    return (
        <div className="space-y-8 animate-fade-in-up">
            {/* Header */}
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">Financial Command</h1>
                    <p className="text-slate-500 font-medium">Village C • Processing & Distribution Center</p>
                </div>
                <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Current Balance</p>
                    <p className="text-2xl font-black text-emerald-600">RM{(financeOverviewData?.netCashFlow || 0).toLocaleString()}</p>
                </div>
            </div>

            {/* 3 Pillars */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div onClick={() => setActiveTab('costing')} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-lg hover:border-indigo-300 transition-all cursor-pointer group relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
                    <div className="relative z-10">
                        <div className="w-10 h-10 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 mb-4">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                        </div>
                        <h3 className="text-lg font-black text-slate-900">Costing Analysis</h3>
                        <p className="text-xs text-slate-500 mt-1 mb-4">Batch-level profitability & unit economics.</p>
                        <span className="text-[10px] font-bold uppercase bg-indigo-600 text-white px-3 py-1.5 rounded-full shadow-md group-hover:bg-indigo-700 transition-colors">Run Analysis</span>
                    </div>
                </div>

                <div onClick={() => setActiveTab('sales')} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-lg hover:border-blue-300 transition-all cursor-pointer group relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
                    <div className="relative z-10">
                        <div className="w-10 h-10 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 mb-4">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                        </div>
                        <h3 className="text-lg font-black text-slate-900">Sales Hub</h3>
                        <p className="text-xs text-slate-500 mt-1 mb-4">POS, CRM & Order Management.</p>
                        <span className="text-[10px] font-bold uppercase bg-blue-600 text-white px-3 py-1.5 rounded-full shadow-md group-hover:bg-blue-700 transition-colors">Manage Sales</span>
                    </div>
                </div>

                <div onClick={() => setActiveTab('financial')} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-lg hover:border-emerald-300 transition-all cursor-pointer group relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
                    <div className="relative z-10">
                        <div className="w-10 h-10 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600 mb-4">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <h3 className="text-lg font-black text-slate-900">Financial Ledger</h3>
                        <p className="text-xs text-slate-500 mt-1 mb-4">P&L, Cash Flow & Accounting.</p>
                        <span className="text-[10px] font-bold uppercase bg-emerald-600 text-white px-3 py-1.5 rounded-full shadow-md group-hover:bg-emerald-700 transition-colors">View Ledger</span>
                    </div>
                </div>
            </div>

            {/* Dashboard Widgets */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Recent Sales */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">Recent Sales Activity</h3>
                        <button onClick={() => setActiveTab('sales')} className="text-blue-600 text-xs font-bold hover:underline">View All</button>
                    </div>
                    <div className="space-y-3">
                        {recentSales.map(sale => (
                            <div key={sale.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                                <div>
                                    <p className="text-xs font-bold text-slate-900">{sale.description}</p>
                                    <p className="text-[10px] text-slate-400">{new Date(sale.date).toLocaleDateString()}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-black text-emerald-600">RM{sale.amount.toFixed(2)}</p>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">{sale.paymentMethod || 'Cash'}</p>
                                </div>
                            </div>
                        ))}
                        {recentSales.length === 0 && <p className="text-slate-400 text-xs italic text-center py-4">No recent sales recorded.</p>}
                    </div>
                </div>

                {/* Profitability Pulse */}
                <div className="bg-slate-900 text-white p-8 rounded-3xl shadow-xl flex flex-col justify-between">
                   <div>
                       <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">Profitability Pulse</h3>
                       <div className="space-y-6">
                            <div>
                                <div className="flex justify-between text-xs font-bold mb-2">
                                    <span>Total Revenue (YTD)</span>
                                    <span className="text-emerald-400">RM{(financeOverviewData?.totalRevenue || 0).toLocaleString()}</span>
                                </div>
                                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                                    <div className="bg-emerald-500 h-full" style={{ width: '70%' }}></div>
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between text-xs font-bold mb-2">
                                    <span>Total Expenses (YTD)</span>
                                    <span className="text-rose-400">RM{(financeOverviewData?.totalExpenses || 0).toLocaleString()}</span>
                                </div>
                                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                                    <div className="bg-rose-500 h-full" style={{ width: '45%' }}></div>
                                </div>
                            </div>
                       </div>
                   </div>
                   <div className="mt-8 pt-8 border-t border-slate-800 flex justify-between items-center">
                       <div className="text-xs text-slate-500">Net Profit Margin</div>
                       <div className="text-2xl font-black text-white">
                           {financeOverviewData?.totalRevenue > 0 
                            ? (((financeOverviewData.totalRevenue - financeOverviewData.totalExpenses) / financeOverviewData.totalRevenue) * 100).toFixed(1) 
                            : '0.0'}%
                       </div>
                   </div>
                </div>
            </div>
        </div>
    );
};

// 2. USER ROLE (Floor Operations - Reduced Tabs)
export const ProcessingUserView: React.FC<ProcessingViewProps> = ({
    processingStats, logisticsStats, setActiveTab, predictedYield
}) => {
    return (
        <div className="space-y-8 animate-fade-in-up">
            <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-slate-900 mb-1">Floor Operations</h1>
                    <p className="text-sm text-gray-500 font-bold uppercase tracking-widest">Village C • Workflow Dashboard</p>
                </div>
                <div className="flex gap-4">
                    <div className="text-center px-4">
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Batches Active</p>
                        <p className="text-2xl font-black text-blue-600">{processingStats.qc + processingStats.intake}</p>
                    </div>
                    <div className="w-px bg-slate-200 h-10"></div>
                    <div className="text-center px-4">
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Ready to Pack</p>
                        <p className="text-2xl font-black text-purple-600">{processingStats.packing}</p>
                    </div>
                    <div className="w-px bg-slate-200 h-10"></div>
                    <div className="text-center px-4">
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Scheduled Ships</p>
                        <p className="text-2xl font-black text-orange-600">{logisticsStats.scheduled}</p>
                    </div>
                    {/* New Card for Predicted Yield */}
                    <div className="w-px bg-slate-200 h-10"></div>
                    <div className="text-center px-4">
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Predicted Inbound</p>
                        <p className="text-2xl font-black text-green-600">{predictedYield ? predictedYield.toFixed(0) : '0'} kg</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <button onClick={() => setActiveTab('processing')} className="bg-blue-50 p-8 rounded-3xl border border-blue-100 hover:shadow-lg hover:bg-blue-100 transition-all text-left group">
                    <div className="bg-white w-14 h-14 rounded-2xl flex items-center justify-center text-blue-600 mb-6 shadow-sm group-hover:scale-110 transition-transform">
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                    </div>
                    <h3 className="text-xl font-black text-blue-900">Processing Floor</h3>
                    <p className="text-xs text-blue-700 font-medium mt-2">Intake, QC, Grading & Cleaning.</p>
                    <div className="mt-6 flex items-center gap-2 text-xs font-bold text-blue-600 uppercase tracking-widest group-hover:gap-3 transition-all">
                        Access Floor <span className="text-lg">→</span>
                    </div>
                </button>

                <button onClick={() => setActiveTab('packaging')} className="bg-purple-50 p-8 rounded-3xl border border-purple-100 hover:shadow-lg hover:bg-purple-100 transition-all text-left group">
                    <div className="bg-white w-14 h-14 rounded-2xl flex items-center justify-center text-purple-600 mb-6 shadow-sm group-hover:scale-110 transition-transform">
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                    </div>
                    <h3 className="text-xl font-black text-purple-900">Packaging Line</h3>
                    <p className="text-xs text-purple-700 font-medium mt-2">Pack consolidated batches.</p>
                    <div className="mt-6 flex items-center gap-2 text-xs font-bold text-purple-600 uppercase tracking-widest group-hover:gap-3 transition-all">
                        Start Packing <span className="text-lg">→</span>
                    </div>
                </button>

                <button onClick={() => setActiveTab('inventory')} className="bg-orange-50 p-8 rounded-3xl border border-orange-100 hover:shadow-lg hover:bg-orange-100 transition-all text-left group">
                    <div className="bg-white w-14 h-14 rounded-2xl flex items-center justify-center text-orange-600 mb-6 shadow-sm group-hover:scale-110 transition-transform">
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <h3 className="text-xl font-black text-orange-900">Logistics & Stock</h3>
                    <p className="text-xs text-orange-700 font-medium mt-2">Manage deliveries and warehouse.</p>
                    <div className="mt-6 flex items-center gap-2 text-xs font-bold text-orange-600 uppercase tracking-widest group-hover:gap-3 transition-all">
                        View Logistics <span className="text-lg">→</span>
                    </div>
                </button>

                {/* New shortcut for standard users to access Sales Hub */}
                <button onClick={() => setActiveTab('sales')} className="bg-emerald-50 p-8 rounded-3xl border border-emerald-100 hover:shadow-lg hover:bg-emerald-100 transition-all text-left group">
                    <div className="bg-white w-14 h-14 rounded-2xl flex items-center justify-center text-emerald-600 mb-6 shadow-sm group-hover:scale-110 transition-transform">
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    </div>
                    <h3 className="text-xl font-black text-emerald-900">Sales Hub</h3>
                    <p className="text-xs text-emerald-700 font-medium mt-2">POS Terminal & CRM.</p>
                    <div className="mt-6 flex items-center gap-2 text-xs font-bold text-emerald-600 uppercase tracking-widest group-hover:gap-3 transition-all">
                        Open Sales <span className="text-lg">→</span>
                    </div>
                </button>
            </div>
        </div>
    );
};

// 3. ADMIN ROLE (Executive View - All Tabs)
export const ProcessingAdminView: React.FC<ProcessingViewProps> = ({
    financeOverviewData, processingStats, logisticsStats, setActiveTab
}) => {
    return (
        <div className="space-y-8 animate-fade-in-up">
            <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] shadow-xl relative overflow-hidden">
                <div className="relative z-10 flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-black tracking-tight mb-1">Executive Command</h1>
                        <p className="text-sm text-slate-400 font-bold uppercase tracking-widest">Village C • Operations & Finance Hub</p>
                    </div>
                    <div className="text-right">
                        <button onClick={() => setActiveTab('registry')} className="bg-white/10 hover:bg-white/20 border border-white/20 text-white px-4 py-2 rounded-xl text-xs font-black uppercase transition-all backdrop-blur-sm">
                            System Registry
                        </button>
                    </div>
                </div>
                {/* Admin Stats Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-8">
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
                        <p className="text-[10px] text-emerald-400 font-black uppercase tracking-widest mb-1">Net Revenue</p>
                        <p className="text-2xl font-black">RM{(financeOverviewData?.totalRevenue || 0).toLocaleString()}</p>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
                        <p className="text-[10px] text-blue-400 font-black uppercase tracking-widest mb-1">Net Profit</p>
                        <p className="text-2xl font-black">RM{(financeOverviewData?.netCashFlow || 0).toLocaleString()}</p>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
                        <p className="text-[10px] text-orange-400 font-black uppercase tracking-widest mb-1">Active Batches</p>
                        <p className="text-2xl font-black">{processingStats.qc + processingStats.intake}</p>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
                        <p className="text-[10px] text-purple-400 font-black uppercase tracking-widest mb-1">Pending Delivery</p>
                        <p className="text-2xl font-black">{logisticsStats.scheduled}</p>
                    </div>
                </div>
            </div>

            {/* Admin Shortcuts Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <button onClick={() => setActiveTab('processing')} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all text-left group">
                    <div className="text-indigo-600 mb-3 group-hover:scale-110 transition-transform"><svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg></div>
                    <h3 className="font-black text-slate-800">Processing</h3>
                    <p className="text-[10px] text-slate-400 uppercase font-bold mt-1">Floor Ops</p>
                </button>
                <button onClick={() => setActiveTab('financial')} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all text-left group">
                    <div className="text-emerald-600 mb-3 group-hover:scale-110 transition-transform"><svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
                    <h3 className="font-black text-slate-800">Financials</h3>
                    <p className="text-[10px] text-slate-400 uppercase font-bold mt-1">Ledgers</p>
                </button>
                <button onClick={() => setActiveTab('sales')} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all text-left group">
                    <div className="text-blue-600 mb-3 group-hover:scale-110 transition-transform"><svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg></div>
                    <h3 className="font-black text-slate-800">Sales Hub</h3>
                    <p className="text-[10px] text-slate-400 uppercase font-bold mt-1">POS & CRM</p>
                </button>
                <button onClick={() => setActiveTab('costing')} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all text-left group">
                    <div className="text-indigo-600 mb-3 group-hover:scale-110 transition-transform"><svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg></div>
                    <h3 className="font-black text-slate-800">Costing</h3>
                    <p className="text-[10px] text-slate-400 uppercase font-bold mt-1">Analytics</p>
                </button>
                <button onClick={() => setActiveTab('packaging')} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md hover:border-purple-300 transition-all text-left group">
                    <div className="text-purple-600 mb-3 group-hover:scale-110 transition-transform"><svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg></div>
                    <h3 className="font-black text-slate-800">Packaging</h3>
                    <p className="text-[10px] text-slate-400 uppercase font-bold mt-1">Production</p>
                </button>
                <button onClick={() => setActiveTab('inventory')} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md hover:border-orange-300 transition-all text-left group">
                    <div className="text-orange-600 mb-3 group-hover:scale-110 transition-transform"><svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
                    <h3 className="font-black text-slate-800">Logistics</h3>
                    <p className="text-[10px] text-slate-400 uppercase font-bold mt-1">Stock & Ship</p>
                </button>
            </div>
        </div>
    );
};
