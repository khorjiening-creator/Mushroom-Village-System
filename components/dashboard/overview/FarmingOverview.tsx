import React, { useMemo } from 'react';
import { FinancialRecord, ActivityLog } from '../../../types';

// --- Shared Props ---
interface FarmingViewProps {
    villageName: string;
    financeOverviewData: any;
    activeBatches: ActivityLog[];
    resources: any[];
    financialRecords: FinancialRecord[];
    setActiveTab: (tab: any) => void;
    openEditTransModal: (rec: FinancialRecord) => void;
    goToPendingFinancials: () => void;
    costStats: any;
    outstandingStats: any;
    activeBatchEfficiency: any[];
    globalActiveEfficiency: number;
    latestEnvLog?: any; // Added for environment alerts
}

const SPECIES_CYCLES: Record<string, number> = {
    'Oyster': 21,
    'Shiitake': 90,
    'Button': 35,
    "Lion's Mane": 35,
    'Unknown': 30
};

const IDEAL_CONDITIONS: Record<string, { minT: number, maxT: number, minH: number, maxH: number }> = {
    'Oyster': { minT: 22, maxT: 30, minH: 80, maxH: 95 },
    'Button': { minT: 16, maxT: 22, minH: 85, maxH: 90 },
    'Shiitake': { minT: 18, maxT: 24, minH: 75, maxH: 85 },
    "Lion's Mane": { minT: 18, maxT: 24, minH: 85, maxH: 95 },
};

// 1. FINANCE ROLE (Existing Design)
export const FarmingFinanceView: React.FC<FarmingViewProps> = ({
    villageName, financeOverviewData, costStats, activeBatchEfficiency, 
    globalActiveEfficiency, outstandingStats, setActiveTab, openEditTransModal, goToPendingFinancials
}) => {
    return (
        <div className="space-y-6 animate-fade-in-up">
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-800 to-teal-900 text-white p-6 rounded-3xl shadow-lg flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-black tracking-tight">{villageName} – Financial Overview</h1>
                    <p className="text-xs text-emerald-200 uppercase tracking-widest mt-1 font-bold">Cost & Profitability Center</p>
                </div>
                <button onClick={() => setActiveTab('analysis')} className="px-5 py-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-black uppercase transition-all backdrop-blur-sm border border-white/10">
                    Detailed Report
                </button>
            </div>

            {/* Financial Pulse */}
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Financial Pulse</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 cursor-pointer" onClick={() => setActiveTab('financial')}>
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3 group-hover:text-emerald-600 transition-colors">Total Revenue</span>
                    <div className="text-3xl font-black text-emerald-600">RM{(financeOverviewData?.totalRevenue || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                    <div className="w-full bg-gray-100 h-1 mt-4 rounded-full overflow-hidden"><div className="bg-emerald-500 h-full w-full"></div></div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3 group-hover:text-rose-600 transition-colors">Total Expenses</span>
                    <div className="text-3xl font-black text-rose-600">RM{(financeOverviewData?.totalExpenses || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                    <div className="w-full bg-gray-100 h-1 mt-4 rounded-full overflow-hidden"><div className="bg-rose-500 h-full w-3/4"></div></div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3 group-hover:text-blue-600 transition-colors">Net Cash Flow</span>
                    <div className={`text-3xl font-black ${financeOverviewData?.netCashFlow >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                        {financeOverviewData?.netCashFlow >= 0 ? '+' : ''}RM{Math.abs(financeOverviewData?.netCashFlow || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
                    </div>
                    <div className="w-full bg-gray-100 h-1 mt-4 rounded-full overflow-hidden"><div className={`h-full ${financeOverviewData?.netCashFlow >= 0 ? 'bg-blue-500' : 'bg-orange-500'} w-1/2`}></div></div>
                </div>
            </div>

            {/* Production Economics */}
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] ml-1 mt-4">Production Economics</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 cursor-pointer" onClick={() => setActiveTab('analysis')}>
                <div className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100/50 hover:bg-emerald-50 transition-all group">
                    <div className="text-[9px] font-black text-emerald-800/60 uppercase tracking-wide group-hover:text-emerald-800">Avg Cost / Batch</div>
                    <div className="text-xl font-black text-emerald-900 mt-1">RM{costStats.costPerBatch.toFixed(0)}</div>
                </div>
                <div className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100/50 hover:bg-emerald-50 transition-all group">
                    <div className="text-[9px] font-black text-emerald-800/60 uppercase tracking-wide group-hover:text-emerald-800">Unit Cost (Est. kg)</div>
                    <div className="text-xl font-black text-emerald-900 mt-1">RM{costStats.avgCostPerKg.toFixed(2)}</div>
                </div>
                <div className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100/50 hover:bg-emerald-50 transition-all group">
                    <div className="text-[9px] font-black text-emerald-800/60 uppercase tracking-wide group-hover:text-emerald-800">Active Yield Eff.</div>
                    <div className={`text-xl font-black mt-1 ${activeBatchEfficiency.length > 0 && globalActiveEfficiency < 75 ? 'text-orange-600' : 'text-emerald-900'}`}>
                        {activeBatchEfficiency.length > 0 ? globalActiveEfficiency.toFixed(1) : '0.0'}%
                    </div>
                </div>
                <div className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100/50 hover:bg-emerald-50 transition-all group">
                    <div className="text-[9px] font-black text-emerald-800/60 uppercase tracking-wide group-hover:text-emerald-800">Gross Margin</div>
                    <div className="text-xl font-black text-emerald-900 mt-1">{costStats.grossMargin.toFixed(1)}%</div>
                </div>
            </div>

            {/* Split View */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                {/* Financial Alerts */}
                <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-sm flex flex-col h-full">
                    <div className="px-6 py-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                        <h3 className="text-xs font-black text-gray-800 uppercase tracking-widest">Financial Alerts</h3>
                        <button onClick={goToPendingFinancials} className="text-[10px] font-bold text-blue-600 uppercase hover:underline bg-blue-50 px-3 py-1 rounded-full">
                            {outstandingStats.transactions.length} Pending
                        </button>
                    </div>
                    <div className="p-2 space-y-2 flex-1">
                        {outstandingStats.transactions.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-300 py-10">
                                <p className="text-[10px] font-bold uppercase italic">All clear.</p>
                            </div>
                        ) : (
                            outstandingStats.transactions.slice(0, 5).map((tx: any) => (
                                <div key={tx.id} onClick={() => openEditTransModal(tx.rawRecord)} className={`flex justify-between items-center p-3 rounded-2xl border cursor-pointer transition-colors group ${tx.status === 'Overdue' ? 'bg-rose-50/50 hover:bg-rose-50 border-rose-100' : 'bg-gray-50 hover:bg-gray-100 border-gray-100'}`}>
                                    <div>
                                        <div className={`text-[10px] font-black uppercase ${tx.status === 'Overdue' ? 'text-rose-800' : 'text-gray-600'}`}>{tx.type} <span className={tx.status === 'Overdue' ? 'text-rose-600' : 'text-orange-500'}>{tx.status}</span></div>
                                        <div className="text-xs font-bold text-gray-700 truncate max-w-[150px]">{tx.party}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className={`text-sm font-black ${tx.type === 'Receivable' ? 'text-emerald-600' : 'text-rose-600'}`}>RM{tx.amount.toLocaleString()}</div>
                                        <div className="text-[9px] font-bold text-gray-400">Due {new Date(tx.dueDate).toLocaleDateString()}</div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Efficiency Watchlist */}
                <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-sm flex flex-col h-full">
                    <div className="px-6 py-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                        <h3 className="text-xs font-black text-gray-800 uppercase tracking-widest">Efficiency Watchlist</h3>
                        <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-3 py-1 rounded-full">Yield &lt; 75%</span>
                    </div>
                    <div className="p-2 space-y-2 flex-1">
                        {activeBatchEfficiency.filter((b: any) => b.efficiency < 75 && b.efficiency > 0).length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-300 py-10">
                                <p className="text-[10px] font-bold uppercase italic">Production is optimal.</p>
                            </div>
                        ) : (
                            activeBatchEfficiency.filter((b: any) => b.efficiency < 75 && b.efficiency > 0).slice(0, 4).map((batch: any) => (
                                <div key={batch.id} onClick={() => setActiveTab('analysis')} className="flex justify-between items-center p-3 bg-orange-50/50 hover:bg-orange-50 rounded-2xl border border-orange-100 cursor-pointer transition-colors">
                                    <div>
                                        <div className="text-[10px] font-black text-orange-800 uppercase">Batch {batch.batchId}</div>
                                        <div className="text-xs font-bold text-gray-700">{batch.mushroomStrain}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-black text-orange-600">{batch.efficiency.toFixed(1)}% Eff.</div>
                                        <div className="text-[9px] font-bold text-orange-400">Target: {batch.predictedYield}kg</div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// 2. USER ROLE (Operational / Previous design)
export const FarmingUserView: React.FC<FarmingViewProps> = ({
    villageName, activeBatches, setActiveTab, latestEnvLog, financialRecords
}) => {
    // Logic for Alerts
    const alerts = useMemo(() => {
        const list: {type: 'HARVEST'|'ENV'|'RESOURCE', msg: string, urgent: boolean}[] = [];
        
        // 1. Harvest Alerts
        activeBatches.forEach(batch => {
            // Fix: Cast to string to avoid implicit unknown type error
            const strainKey = (batch.mushroomStrain || 'Oyster') as string;
            const cycleDays = SPECIES_CYCLES[strainKey] || 30;
            const daysElapsed = (new Date().getTime() - new Date(batch.timestamp).getTime()) / (1000 * 60 * 60 * 24);
            const daysRemaining = Math.ceil(cycleDays - daysElapsed);
            
            if (daysRemaining <= 3 && daysRemaining > 0) {
                list.push({ type: 'HARVEST', msg: `Batch ${batch.batchId} (${batch.mushroomStrain}) harvest due in ${daysRemaining} days.`, urgent: daysRemaining === 1 });
            } else if (daysRemaining <= 0) {
                list.push({ type: 'HARVEST', msg: `HARVEST NOW: Batch ${batch.batchId} is ready.`, urgent: true });
            }
        });

        // 2. Environment Alerts (Mirrors Environment Tab Risk Logic)
        if (latestEnvLog) {
            // Find what strains are active to check against
            const activeStrains = Array.from(new Set(activeBatches.map(b => b.mushroomStrain || 'Oyster')));
            if (activeStrains.length > 0) {
                const strain = activeStrains[0] as string; 
                const rules = IDEAL_CONDITIONS[strain] || IDEAL_CONDITIONS['Oyster'];
                
                // Temp Checks
                if (latestEnvLog.temperature > rules.maxT + 1) {
                    list.push({ type: 'ENV', msg: `ENVIRONMENTAL RISK DETECTED: High Temp (${latestEnvLog.temperature}°C). Check Air Cooler.`, urgent: true });
                } else if (latestEnvLog.temperature < rules.minT - 1) {
                    list.push({ type: 'ENV', msg: `ENVIRONMENTAL RISK DETECTED: Low Temp (${latestEnvLog.temperature}°C). Check Heater.`, urgent: true });
                }

                // Humidity Checks
                if (latestEnvLog.humidity < rules.minH - 5) {
                    list.push({ type: 'ENV', msg: `ENVIRONMENTAL RISK DETECTED: Low Humidity (${latestEnvLog.humidity}%). Open Humidifier?`, urgent: true });
                } else if (latestEnvLog.humidity > rules.maxH + 5) {
                    list.push({ type: 'ENV', msg: `ENVIRONMENTAL RISK DETECTED: High Humidity (${latestEnvLog.humidity}%). Open Fan?`, urgent: true });
                }
            }
        }

        // 3. Resource Alerts (Pending Receipts)
        if (financialRecords) {
            const pendingReceiptsCount = financialRecords.filter(rec => 
                rec.category === 'Supplies' && 
                rec.type === 'EXPENSE' && 
                rec.status === 'COMPLETED' && 
                rec.receivedInStock === false &&
                rec.materialId
            ).length;

            if (pendingReceiptsCount > 0) {
                list.push({ 
                    type: 'RESOURCE', 
                    msg: `ACTION REQUIRED: ${pendingReceiptsCount} SUPPLY RECEIPTS PENDING CONFIRMATION.`, 
                    urgent: true 
                });
            }
        }

        return list;
    }, [activeBatches, latestEnvLog, financialRecords]);

    const urgentAlerts = alerts.filter(a => a.urgent);

    return (
        <div className="space-y-6 animate-fade-in-up">
            {/* ALERT BANNER */}
            {alerts.length > 0 && (
                <div className={`rounded-xl overflow-hidden shadow-lg border-l-8 ${urgentAlerts.length > 0 ? 'bg-red-500 border-red-800' : 'bg-orange-100 border-orange-500'}`}>
                    <div className="p-4">
                        <div className="flex items-center justify-between text-white mb-2">
                            <h3 className={`text-sm font-black uppercase tracking-widest flex items-center gap-2 ${urgentAlerts.length > 0 ? 'text-white' : 'text-orange-900'}`}>
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                {urgentAlerts.length > 0 ? 'Action Required' : 'Operational Notices'}
                            </h3>
                            <span className={`text-[10px] font-bold px-2 py-1 rounded ${urgentAlerts.length > 0 ? 'bg-red-700' : 'bg-orange-200 text-orange-800'}`}>{alerts.length} Alert(s)</span>
                        </div>
                        <div className="space-y-2">
                            {alerts.map((alert, idx) => (
                                <div key={idx} className={`flex justify-between items-center p-2 rounded-lg ${urgentAlerts.length > 0 ? 'bg-red-600/50' : 'bg-white/50'}`}>
                                    <span className={`text-xs font-bold ${urgentAlerts.length > 0 ? 'text-white' : 'text-orange-900'}`}>{alert.msg}</span>
                                    {alert.type === 'HARVEST' ? (
                                        <button onClick={() => setActiveTab('farming')} className="text-[9px] bg-white border border-gray-200 px-3 py-1 rounded hover:bg-gray-100 uppercase text-blue-600 font-black">Go to Log</button>
                                    ) : alert.type === 'ENV' ? (
                                        <button onClick={() => setActiveTab('environment')} className="text-[9px] bg-white border border-gray-200 px-3 py-1 rounded hover:bg-gray-100 uppercase text-blue-600 font-black">Fix Env</button>
                                    ) : (
                                        <button onClick={() => setActiveTab('resources')} className="text-[9px] bg-white border border-gray-200 px-3 py-1 rounded hover:bg-gray-100 uppercase text-blue-600 font-black">Confirm Stock</button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Operator Header */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-gray-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Farming Operations</h1>
                    <p className="text-sm text-gray-500 font-bold uppercase tracking-widest">{villageName} • Field Dashboard</p>
                </div>
                <div className="flex gap-4">
                    <div className="text-center px-4">
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Active Batches</p>
                        <p className="text-3xl font-black text-green-600">{activeBatches.length}</p>
                    </div>
                    <div className="w-px bg-gray-200 h-10"></div>
                    <div className="text-center px-4">
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Tasks Pending</p>
                        <p className={`text-3xl font-black ${alerts.length > 0 ? 'text-orange-500' : 'text-gray-600'}`}>{alerts.length}</p>
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-4">
                <button onClick={() => setActiveTab('farming')} className="bg-green-50 hover:bg-green-100 p-6 rounded-3xl border border-green-100 text-left transition-all group">
                    <div className="bg-white w-12 h-12 rounded-2xl flex items-center justify-center text-green-600 mb-4 shadow-sm group-hover:scale-110 transition-transform">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                    </div>
                    <h3 className="text-lg font-black text-green-900">Log Activity</h3>
                    <p className="text-xs text-green-700 mt-1 font-medium">Record daily farming tasks</p>
                </button>
                <button onClick={() => setActiveTab('environment')} className="bg-blue-50 hover:bg-blue-100 p-6 rounded-3xl border border-blue-100 text-left transition-all group">
                    <div className="bg-white w-12 h-12 rounded-2xl flex items-center justify-center text-blue-600 mb-4 shadow-sm group-hover:scale-110 transition-transform">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    </div>
                    <h3 className="text-lg font-black text-blue-900">Check Environment</h3>
                    <p className="text-xs text-blue-700 mt-1 font-medium">Monitor Temperature & Humidity</p>
                </button>
            </div>

            {/* Active Batches List */}
            <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                    <h3 className="text-sm font-black text-gray-700 uppercase">Current Production Batches</h3>
                </div>
                <div className="p-2 space-y-2">
                    {activeBatches.length === 0 ? (
                        <div className="p-8 text-center text-gray-400 italic text-sm">No active batches. Start a new one in the Farming tab.</div>
                    ) : (
                        activeBatches.slice(0, 5).map(batch => (
                            <div key={batch.id} className="flex justify-between items-center p-4 hover:bg-gray-50 rounded-2xl transition-colors border border-transparent hover:border-gray-200">
                                <div>
                                    <div className="text-sm font-black text-gray-900">{batch.batchId}</div>
                                    <div className="text-xs text-gray-500 font-medium">{batch.mushroomStrain}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] font-bold uppercase bg-green-100 text-green-700 px-2 py-1 rounded">Active</div>
                                    <div className="text-[10px] text-gray-400 mt-1">{new Date(batch.timestamp).toLocaleDateString()}</div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
                <button onClick={() => setActiveTab('farming')} className="w-full py-3 text-xs font-black uppercase text-gray-400 hover:text-indigo-600 transition-colors border-t border-gray-100">
                    View All Batches
                </button>
            </div>
        </div>
    );
};

// 3. ADMIN ROLE (Redesigned with ALL tabs)
export const FarmingAdminView: React.FC<FarmingViewProps> = ({
    villageName, financeOverviewData, activeBatches, setActiveTab
}) => {
    return (
        <div className="space-y-8 animate-fade-in-up">
            <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] shadow-xl relative overflow-hidden">
                <div className="relative z-10 flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-black tracking-tight mb-1">Executive Command</h1>
                        <p className="text-sm text-slate-400 font-bold uppercase tracking-widest">{villageName} • Admin Control</p>
                    </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-8">
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
                        <p className="text-[10px] text-emerald-400 font-black uppercase tracking-widest mb-1">Net Revenue</p>
                        <p className="text-2xl font-black">RM{(financeOverviewData?.totalRevenue || 0).toLocaleString()}</p>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
                        <p className="text-[10px] text-blue-400 font-black uppercase tracking-widest mb-1">Net Cashflow</p>
                        <p className="text-2xl font-black">RM{(financeOverviewData?.netCashFlow || 0).toLocaleString()}</p>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
                        <p className="text-[10px] text-orange-400 font-black uppercase tracking-widest mb-1">Active Batches</p>
                        <p className="text-2xl font-black">{activeBatches.length}</p>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
                        <p className="text-[10px] text-purple-400 font-black uppercase tracking-widest mb-1">System Health</p>
                        <p className="text-2xl font-black text-green-400">OK</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <button onClick={() => setActiveTab('farming')} className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm hover:shadow-md hover:border-green-300 transition-all text-left group">
                    <div className="text-green-600 mb-3 group-hover:scale-110 transition-transform"><svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg></div>
                    <h3 className="font-black text-slate-800">Farming</h3>
                    <p className="text-[10px] text-slate-400 uppercase font-bold mt-1">Logs & Harvests</p>
                </button>
                <button onClick={() => setActiveTab('environment')} className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all text-left group">
                    <div className="text-blue-600 mb-3 group-hover:scale-110 transition-transform"><svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" /></svg></div>
                    <h3 className="font-black text-slate-800">Environment</h3>
                    <p className="text-[10px] text-slate-400 uppercase font-bold mt-1">Sensors & IoT</p>
                </button>
                <button onClick={() => setActiveTab('resources')} className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm hover:shadow-md hover:border-orange-300 transition-all text-left group">
                    <div className="text-orange-600 mb-3 group-hover:scale-110 transition-transform"><svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg></div>
                    <h3 className="font-black text-slate-800">Resources</h3>
                    <p className="text-[10px] text-slate-400 uppercase font-bold mt-1">Stock & Equip</p>
                </button>
                <button onClick={() => setActiveTab('financial')} className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all text-left group">
                    <div className="text-emerald-600 mb-3 group-hover:scale-110 transition-transform"><svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
                    <h3 className="font-black text-slate-800">Financials</h3>
                    <p className="text-[10px] text-slate-400 uppercase font-bold mt-1">P&L Ledgers</p>
                </button>
                <button onClick={() => setActiveTab('analysis')} className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm hover:shadow-md hover:border-purple-300 transition-all text-left group">
                    <div className="text-purple-600 mb-3 group-hover:scale-110 transition-transform"><svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg></div>
                    <h3 className="font-black text-slate-800">Analysis</h3>
                    <p className="text-[10px] text-slate-400 uppercase font-bold mt-1">Yield & Eff.</p>
                </button>
            </div>
        </div>
    );
};