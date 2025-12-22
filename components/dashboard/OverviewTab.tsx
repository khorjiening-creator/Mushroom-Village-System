import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, orderBy, limit, where } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { VillageType, VillageRole, FinancialRecord, ActivityLog, ResourceItem } from '../../types';
import { VILLAGES } from '../../constants';

interface OverviewTabProps {
  villageId: VillageType;
  userName: string;
  theme: any;
  financeOverviewData?: any; 
  userRole: string;
  isFinance: boolean;
  financialRecords?: FinancialRecord[];
  setActiveTab: (tab: any) => void;
  openEditTransModal: (rec: FinancialRecord) => void;
  chartFilter?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  setChartFilter?: (filter: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY') => void;
  setFinancialFilterOverride?: (filter: {status?: 'ALL'|'PENDING'|'COMPLETED', category?: string} | null) => void;
}

const SPECIES_CYCLES: Record<string, number> = {
    'Oyster': 21,
    'Shiitake': 90,
    'Button': 35,
    "Lion's Mane": 35,
    'Unknown': 30
};

export const OverviewTab: React.FC<OverviewTabProps> = ({ 
    villageId, userName, theme, financeOverviewData, userRole, isFinance, financialRecords = [], setActiveTab, openEditTransModal, chartFilter, setChartFilter, setFinancialFilterOverride
}) => {
    const village = VILLAGES[villageId];
    const isFarming = village.role === VillageRole.FARMING;
    const isProcessing = village.role === VillageRole.PROCESSING;
    
    const [activeBatches, setActiveBatches] = useState<ActivityLog[]>([]);
    const [resources, setResources] = useState<ResourceItem[]>([]);
    const [processingStats, setProcessingStats] = useState({ intake: 0, qc: 0, packing: 0, ready: 0 });
    const [logisticsStats, setLogisticsStats] = useState({ scheduled: 0, delivering: 0, failed: 0 });
    const [inventoryAlerts, setInventoryAlerts] = useState<string[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // 1. Resources Fetch (Common)
                const resCol = villageId === VillageType.A ? 'resourcesA' : villageId === VillageType.B ? 'resourcesB' : 'resourcesC';
                const resSnap = await getDocs(collection(db, resCol));
                const resList: ResourceItem[] = [];
                resSnap.forEach(doc => resList.push({ id: doc.id, ...doc.data() } as ResourceItem));
                setResources(resList);

                // 2. Village Specific
                if (isFarming) {
                    const farmingCol = villageId === VillageType.A ? 'dailyfarming_logA' : 'dailyfarming_logB';
                    const batchQ = query(collection(db, farmingCol), orderBy('timestamp', 'desc'), limit(100));
                    const batchSnap = await getDocs(batchQ);
                    const batches: ActivityLog[] = [];
                    batchSnap.forEach(doc => {
                        const data = doc.data() as ActivityLog;
                        if (data.type === 'SUBSTRATE_PREP' && data.batchStatus !== 'COMPLETED') {
                            const predicted = data.predictedYield || 0;
                            const actual = data.totalYield || 0;
                            const wastage = data.totalWastage || 0;
                            if (predicted === 0 || (actual + wastage) < predicted) {
                                batches.push({ id: doc.id, ...data });
                            }
                        }
                    });
                    setActiveBatches(batches);
                } else if (isProcessing) {
                    // Processing Stats
                    const procQ = query(collection(db, "processing_logs"), where("status", "==", "IN_PROGRESS"));
                    const procSnap = await getDocs(procQ);
                    const stats = { intake: 0, qc: 0, packing: 0, ready: 0 };
                    
                    procSnap.forEach(doc => {
                        const d = doc.data();
                        if (d.currentStep === 2) stats.qc++;
                        else if (d.currentStep >= 3 && d.currentStep <= 5) stats.intake++;
                        else if (d.currentStep === 6) stats.packing++;
                    });
                    setProcessingStats(stats);

                    // Logistics Stats
                    const delQ = query(collection(db, "delivery_records"), where("status", "in", ["SCHEDULED", "OUT_FOR_DELIVERY", "FAILED"]));
                    const delSnap = await getDocs(delQ);
                    const logStats = { scheduled: 0, delivering: 0, failed: 0 };
                    delSnap.forEach(doc => {
                        const s = doc.data().status;
                        if (s === 'SCHEDULED') logStats.scheduled++;
                        if (s === 'OUT_FOR_DELIVERY') logStats.delivering++;
                        if (s === 'FAILED') logStats.failed++;
                    });
                    setLogisticsStats(logStats);
                }
            } catch (e) {
                console.error("Overview data fetch error", e);
            }
        };
        fetchData();
    }, [villageId, isFarming, isProcessing]);

    const goToPendingFinancials = () => {
        if (setFinancialFilterOverride) {
            setFinancialFilterOverride({ status: 'PENDING' });
        }
        setActiveTab('financial');
    };

    // --- Helpers ---
    const activeBatchEfficiency = useMemo(() => {
        return activeBatches.map(b => {
            const predicted = b.predictedYield || 0;
            const actual = b.totalYield || 0;
            const efficiency = predicted > 0 ? (actual / predicted) * 100 : 0;
            return { ...b, efficiency };
        }).sort((a,b) => a.efficiency - b.efficiency);
    }, [activeBatches]);

    const globalActiveEfficiency = useMemo(() => {
        if (!activeBatchEfficiency.length) return 0;
        const total = activeBatchEfficiency.reduce((a,b) => a + b.efficiency, 0);
        return total / activeBatchEfficiency.length;
    }, [activeBatchEfficiency]);

    const costStats = useMemo(() => {
        const expenses = financialRecords.filter(r => r.type === 'EXPENSE').reduce((a, b) => a + b.amount, 0);
        const income = financialRecords.filter(r => r.type === 'INCOME' && r.category === 'Sales').reduce((a, b) => a + b.amount, 0);
        
        // Rough estimation
        const costPerBatch = activeBatches.length > 0 ? expenses / Math.max(activeBatches.length, 1) : 0; 
        const grossMargin = income > 0 ? ((income - expenses) / income) * 100 : 0;
        // Simple unit cost estimation if total yield unavailable globally here, use avg batch yield assumption of 5kg
        const estimatedTotalYield = activeBatches.length * 5; 
        const avgCostPerKg = estimatedTotalYield > 0 ? expenses / estimatedTotalYield : 0;

        return { avgCostPerKg, costPerBatch, grossMargin };
    }, [financialRecords, activeBatches]);

    const outstandingStats = useMemo(() => {
        const pending = financialRecords.filter(r => r.status === 'PENDING');
        const transactions = pending.map(r => {
            const isOverdue = (new Date().getTime() - new Date(r.date).getTime()) / (1000 * 3600 * 24) > 7;
            return {
                id: r.id,
                type: r.type === 'INCOME' ? 'Receivable' : 'Payable',
                status: isOverdue ? 'Overdue' : 'Pending',
                party: r.description || r.category,
                amount: r.amount,
                dueDate: r.date,
                rawRecord: r
            };
        }).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()); // Oldest first

        return { transactions };
    }, [financialRecords]);

    // --- RENDER: VILLAGE C ---
    if (isProcessing) {
        return (
            <div className="space-y-6 animate-fade-in-up">
                {/* Simplified Processing Overview for brevity, keeping aligned with existing style */}
                <div className="bg-slate-900 text-white p-8 rounded-[2rem] shadow-xl relative overflow-hidden">
                    <div className="relative z-10 flex justify-between items-center">
                        <div>
                            <h1 className="text-3xl font-black tracking-tight mb-1">Central Command</h1>
                            <p className="text-sm text-slate-400 font-bold uppercase tracking-widest">Village C • Processing & Distribution</p>
                        </div>
                        <div className="text-right">
                            <div className="text-4xl font-black text-emerald-400">RM{(financeOverviewData?.totalRevenue || 0).toLocaleString()}</div>
                            <p className="text-[10px] text-slate-500 font-bold uppercase">Revenue YTD</p>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm cursor-pointer hover:border-blue-400" onClick={()=>setActiveTab('processing')}>
                        <div className="text-3xl font-black text-blue-600">{processingStats.qc + processingStats.intake}</div>
                        <div className="text-xs font-bold text-gray-400 uppercase">Active Batches</div>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm cursor-pointer hover:border-purple-400" onClick={()=>setActiveTab('packaging')}>
                        <div className="text-3xl font-black text-purple-600">{processingStats.packing}</div>
                        <div className="text-xs font-bold text-gray-400 uppercase">Ready to Pack</div>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm cursor-pointer hover:border-orange-400" onClick={()=>setActiveTab('inventory')}>
                        <div className="text-3xl font-black text-orange-600">{logisticsStats.delivering}</div>
                        <div className="text-xs font-bold text-gray-400 uppercase">Active Deliveries</div>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm cursor-pointer hover:border-emerald-400" onClick={()=>setActiveTab('financial')}>
                        <div className="text-3xl font-black text-emerald-600">RM{(financeOverviewData?.netCashFlow || 0).toLocaleString()}</div>
                        <div className="text-xs font-bold text-gray-400 uppercase">Net Cash Flow</div>
                    </div>
                </div>
            </div>
        );
    }

    // --- RENDER: VILLAGE A/B FINANCE & ADMIN ---
    if (isFarming && (isFinance || userRole === 'admin')) {
        return (
            <div className="space-y-6 animate-fade-in-up">
                {/* Section 1: Header */}
                <div className="bg-gradient-to-r from-emerald-800 to-teal-900 text-white p-6 rounded-3xl shadow-lg flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-black tracking-tight">{village.name} – Financial Overview</h1>
                        <p className="text-xs text-emerald-200 uppercase tracking-widest mt-1 font-bold">Cost & Profitability Center</p>
                    </div>
                    <button onClick={() => setActiveTab('analysis')} className="px-5 py-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-black uppercase transition-all backdrop-blur-sm border border-white/10">
                        Detailed Report
                    </button>
                </div>

                {/* Section 2: Financial Pulse */}
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Financial Pulse</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 cursor-pointer" onClick={() => setActiveTab('financial')}>
                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3 group-hover:text-emerald-600 transition-colors">Total Revenue</span>
                        <div className="text-3xl font-black text-emerald-600">RM{(financeOverviewData?.totalRevenue || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                        <div className="w-full bg-gray-100 h-1 mt-4 rounded-full overflow-hidden">
                            <div className="bg-emerald-500 h-full w-full"></div>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3 group-hover:text-rose-600 transition-colors">Total Expenses</span>
                        <div className="text-3xl font-black text-rose-600">RM{(financeOverviewData?.totalExpenses || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                        <div className="w-full bg-gray-100 h-1 mt-4 rounded-full overflow-hidden">
                            <div className="bg-rose-500 h-full w-3/4"></div>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3 group-hover:text-blue-600 transition-colors">Net Cash Flow</span>
                        <div className={`text-3xl font-black ${financeOverviewData?.netCashFlow >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                            {financeOverviewData?.netCashFlow >= 0 ? '+' : ''}RM{Math.abs(financeOverviewData?.netCashFlow || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
                        </div>
                        <div className="w-full bg-gray-100 h-1 mt-4 rounded-full overflow-hidden">
                            <div className={`h-full ${financeOverviewData?.netCashFlow >= 0 ? 'bg-blue-500' : 'bg-orange-500'} w-1/2`}></div>
                        </div>
                    </div>
                </div>

                {/* Section 3: Production Economics */}
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

                {/* Section 4: Split View - Financial Alerts & Production Alerts (Replaces Quick Shortcuts) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                    
                    {/* Left: Financial Alerts */}
                    <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-sm flex flex-col h-full">
                        <div className="px-6 py-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                            <h3 className="text-xs font-black text-gray-800 uppercase tracking-widest">Financial Alerts</h3>
                            <button onClick={() => goToPendingFinancials()} className="text-[10px] font-bold text-blue-600 uppercase hover:underline bg-blue-50 px-3 py-1 rounded-full">
                                {outstandingStats.transactions.length} Pending
                            </button>
                        </div>
                        <div className="p-2 space-y-2 flex-1">
                            {outstandingStats.transactions.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-gray-300 py-10">
                                    <svg className="w-10 h-10 mb-2 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    <p className="text-[10px] font-bold uppercase italic">All clear. No pending items.</p>
                                </div>
                            ) : (
                                outstandingStats.transactions.slice(0, 5).map(tx => (
                                    <div key={tx.id} onClick={() => openEditTransModal(tx.rawRecord)} className={`flex justify-between items-center p-3 rounded-2xl border cursor-pointer transition-colors group ${tx.status === 'Overdue' ? 'bg-rose-50/50 hover:bg-rose-50 border-rose-100' : 'bg-gray-50 hover:bg-gray-100 border-gray-100'}`}>
                                        <div>
                                            <div className={`text-[10px] font-black uppercase ${tx.status === 'Overdue' ? 'text-rose-800' : 'text-gray-600'}`}>
                                                {tx.type} <span className={tx.status === 'Overdue' ? 'text-rose-600' : 'text-orange-500'}>{tx.status}</span>
                                            </div>
                                            <div className="text-xs font-bold text-gray-700 truncate max-w-[150px]">{tx.party}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className={`text-sm font-black ${tx.type === 'Receivable' ? 'text-emerald-600' : 'text-rose-600'}`}>RM{tx.amount.toLocaleString()}</div>
                                            <div className={`text-[9px] font-bold ${tx.status === 'Overdue' ? 'text-rose-400 group-hover:text-rose-500' : 'text-gray-400 group-hover:text-gray-500'}`}>Due {new Date(tx.dueDate).toLocaleDateString()}</div>
                                        </div>
                                    </div>
                                ))
                            )}
                            {outstandingStats.transactions.length > 5 && (
                                <button onClick={() => goToPendingFinancials()} className="w-full py-3 mt-auto text-[10px] font-black uppercase text-gray-400 hover:text-indigo-600 transition-colors border-t border-dashed border-gray-100">
                                    View All Outstanding ({outstandingStats.transactions.length})
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Right: Production Efficiency Watchlist (Restored from previous design) */}
                    <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-sm flex flex-col h-full">
                        <div className="px-6 py-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                            <h3 className="text-xs font-black text-gray-800 uppercase tracking-widest">Efficiency Watchlist</h3>
                            <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-3 py-1 rounded-full">
                                Yield &lt; 75%
                            </span>
                        </div>
                        <div className="p-2 space-y-2 flex-1">
                            {activeBatchEfficiency.filter(b => b.efficiency < 75 && b.efficiency > 0).length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-gray-300 py-10">
                                    <svg className="w-10 h-10 mb-2 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                    <p className="text-[10px] font-bold uppercase italic">Production is optimal.</p>
                                </div>
                            ) : (
                                activeBatchEfficiency.filter(b => b.efficiency < 75 && b.efficiency > 0).slice(0, 4).map(batch => (
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
                            <button onClick={() => setActiveTab('analysis')} className="w-full py-3 mt-auto text-[10px] font-black uppercase text-gray-400 hover:text-indigo-600 transition-colors border-t border-dashed border-gray-100">
                                Analyze All Batches
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // --- FALLBACK (Standard Ops View) ---
    return (
        <div className="p-10 text-center text-gray-400">
            <p>Operational Dashboard Loaded.</p>
        </div>
    );
};