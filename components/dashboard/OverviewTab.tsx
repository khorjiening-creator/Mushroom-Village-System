
import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, orderBy, limit, where } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { VillageType, VillageRole, FinancialRecord, ActivityLog, UserRole, ResourceItem } from '../../types';
import { VILLAGES, MUSHROOM_ROOM_MAPPING } from '../../constants';

interface OverviewTabProps {
  villageId: VillageType;
  userName: string;
  theme: any;
  financeOverviewData?: any; 
  userRole: UserRole;
  isFinance: boolean;
  financialRecords?: FinancialRecord[];
  setActiveTab: (tab: any) => void;
  openEditTransModal: (rec: FinancialRecord) => void;
  chartFilter?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  setChartFilter?: (filter: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY') => void;
}

const SPECIES_CYCLES: Record<string, number> = {
    'Oyster': 21,
    'Shiitake': 90,
    'Button': 35,
    "Lion's Mane": 35,
    'Unknown': 30
};

// Simple ideal conditions reference for Overview alerts (matching EnvironmentTab)
const IDEAL_CONDITIONS: Record<string, { minT: number, maxT: number, minH: number, maxH: number }> = {
    'Oyster': { minT: 22, maxT: 30, minH: 80, maxH: 95 },
    'Button': { minT: 16, maxT: 22, minH: 85, maxH: 90 },
    'Shiitake': { minT: 18, maxT: 24, minH: 75, maxH: 85 },
    "Lion's Mane": { minT: 18, maxT: 24, minH: 85, maxH: 95 },
};

export const OverviewTab: React.FC<OverviewTabProps> = ({ 
    villageId, userName, theme, financeOverviewData, userRole, isFinance, financialRecords, setActiveTab, openEditTransModal, chartFilter, setChartFilter
}) => {
    const village = VILLAGES[villageId];
    const isFarming = village.role === VillageRole.FARMING;
    const [activeBatches, setActiveBatches] = useState<ActivityLog[]>([]);
    const [latestEnv, setLatestEnv] = useState<{temperature: number, humidity: number, moisture: number, timestamp: string} | null>(null);
    const [resources, setResources] = useState<ResourceItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Hardcoded simulation for Overview logic to match EnvironmentTab defaults, 
    // in a real app this would come from a shared context or weather API.
    const outsideTemp = 30; 
    const outsideHumidity = 65; 

    useEffect(() => {
        if (!isFarming) return;

        const fetchData = async () => {
            setIsLoading(true);
            try {
                // Farming Logs
                const farmingCol = villageId === VillageType.A ? 'dailyfarming_logA' : 'dailyfarming_logB';
                const batchQ = query(collection(db, farmingCol), orderBy('timestamp', 'desc'), limit(100));
                const batchSnap = await getDocs(batchQ);
                const batches: ActivityLog[] = [];
                batchSnap.forEach(doc => {
                    const data = doc.data() as ActivityLog;
                    if (data.type === 'SUBSTRATE_PREP' && data.batchStatus !== 'COMPLETED') {
                        // Filter out harvested batches: if total output >= predicted, consider it done/harvested
                        const predicted = data.predictedYield || 0;
                        const actual = data.totalYield || 0;
                        const wastage = data.totalWastage || 0;
                        
                        if (predicted === 0 || (actual + wastage) < predicted) {
                            batches.push({ id: doc.id, ...data });
                        }
                    }
                });
                setActiveBatches(batches);

                // Environment
                const envCol = `environmentLogs_${villageId.replace(/\s/g, '')}`;
                const envQ = query(collection(db, envCol), orderBy('timestamp', 'desc'), limit(1));
                const envSnap = await getDocs(envQ);
                if (!envSnap.empty) {
                    const d = envSnap.docs[0].data();
                    setLatestEnv({ temperature: d.temperature, humidity: d.humidity, moisture: d.moisture, timestamp: d.timestamp });
                }

                // Resources
                const resCol = villageId === VillageType.A ? 'resourcesA' : 'resourcesB';
                const resSnap = await getDocs(collection(db, resCol));
                const resList: ResourceItem[] = [];
                resSnap.forEach(doc => resList.push({ id: doc.id, ...doc.data() } as ResourceItem));
                setResources(resList);

            } catch (e) {
                console.error("Overview data fetch error", e);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [villageId, isFarming]);

    // Role-based Content Logic
    const isAdmin = userRole === 'admin';
    
    // --- Harvest Alerts Logic ---
    const harvestAlerts = useMemo(() => {
        const now = new Date().getTime();
        const alerts: {batchId: string, strain: string, days: number}[] = [];

        activeBatches.forEach(b => {
            const start = new Date(b.timestamp).getTime();
            const cycle = SPECIES_CYCLES[b.mushroomStrain || 'Oyster'] || 30;
            const daysElapsed = (now - start) / (86400000);
            const progress = daysElapsed / cycle;
            
            if (progress >= 0.85) { 
                const daysRemaining = Math.ceil(cycle - daysElapsed);
                if (daysRemaining <= 3) {
                    alerts.push({
                        batchId: b.batchId || b.id || 'Unknown',
                        strain: b.mushroomStrain || 'Unknown',
                        days: daysRemaining
                    });
                }
            }
        });
        return alerts.sort((a,b) => a.days - b.days);
    }, [activeBatches]);

    // --- Weather Action Logic (Based on active batch strain requirements) ---
    const weatherAlerts = useMemo(() => {
        const alerts: string[] = [];
        // Default to Oyster rules if no batches, otherwise check aggregate need
        // Simplification: Check rules for the most common strain active
        if (activeBatches.length > 0) {
            const strain = activeBatches[0].mushroomStrain || 'Oyster';
            const rules = IDEAL_CONDITIONS[strain];
            const buffer = 2;
            const humidBuffer = 5;

            if (outsideTemp > rules.maxT + buffer) alerts.push("Activate Air Cooler (High Outside Temp)");
            if (outsideTemp < rules.minT - buffer) alerts.push("Activate Heater (Low Outside Temp)");
            if (outsideHumidity > rules.maxH + humidBuffer) alerts.push("Activate Exhaust Fan (High Outside Humidity)");
            if (outsideHumidity < rules.minH - humidBuffer) alerts.push("Activate Humidifier (Low Outside Humidity)");
        }
        return alerts;
    }, [activeBatches, outsideTemp, outsideHumidity]);

    // --- Farming Stats ---
    const farmingStats = useMemo(() => {
        const now = new Date().getTime();
        let nearHarvest = 0;
        let estYield = 0;
        const stages: Record<string, number> = { 'Substrate Prep': 0, 'Incubation': 0, 'Fruiting': 0, 'Harvesting': 0 };

        activeBatches.forEach(b => {
            const start = new Date(b.timestamp).getTime();
            const cycle = SPECIES_CYCLES[b.mushroomStrain || 'Oyster'] || 30;
            const daysElapsed = (now - start) / (86400000);
            const progress = daysElapsed / cycle;
            
            if (progress < 0.2) stages['Substrate Prep']++;
            else if (progress < 0.6) stages['Incubation']++;
            else if (progress < 0.9) stages['Fruiting']++;
            else {
                stages['Harvesting']++;
                nearHarvest++;
            }

            if (daysElapsed >= cycle - 3) nearHarvest++;
            estYield += (b.predictedYield || 0);
        });

        return { nearHarvest, estYield, stages };
    }, [activeBatches]);

    // --- Alerts ---
    const activeAlerts = useMemo(() => {
        const alerts: string[] = [];
        if (latestEnv) {
            if (latestEnv.temperature > 30) alerts.push("High Temperature Warning");
            if (latestEnv.humidity < 70) alerts.push("Low Humidity Warning");
        }
        resources.forEach(r => {
            const threshold = (r as any).lowStockThreshold || 0;
            if (r.quantity <= threshold) alerts.push(`${r.name} Low Stock`);
        });
        return alerts;
    }, [latestEnv, resources]);

    // --- Admin/Finance Costs ---
    const costStats = useMemo(() => {
        if (!financialRecords) return { avgCostPerKg: 0, highCostMat: '-', totalCost: 0, costPerBatch: 0, grossMargin: 0, avgSellingPrice: 0 };
        
        const expenses = financialRecords.filter(r => r.type === 'EXPENSE').reduce((a, b) => a + b.amount, 0);
        const income = financialRecords.filter(r => r.type === 'INCOME' && r.category === 'Sales').reduce((a, b) => a + b.amount, 0);
        const totalYieldSold = financialRecords.filter(r => r.type === 'INCOME' && r.category === 'Sales').reduce((a, b) => a + (b.weightKg || 0), 0);
        
        const avgCostPerKg = totalYieldSold > 0 ? expenses / totalYieldSold : 0;
        const avgSellingPrice = totalYieldSold > 0 ? income / totalYieldSold : 0;
        const costPerBatch = activeBatches.length > 0 ? expenses / activeBatches.length : 0; // Simplified
        const grossMargin = income > 0 ? ((income - expenses) / income) * 100 : 0;

        return { avgCostPerKg, highCostMat: 'Spawn', totalCost: expenses, costPerBatch, grossMargin, avgSellingPrice };
    }, [financialRecords, activeBatches]);

    // --- Finance Outstanding Stats ---
    const outstandingStats = useMemo(() => {
        if (!financialRecords) return { payables: 0, receivables: 0, overdueCount: 0, transactions: [], alerts: [] };
        
        const today = new Date();
        today.setHours(0,0,0,0);
        const pending = financialRecords.filter(r => r.status === 'PENDING');
        
        let payables = 0;
        let receivables = 0;
        let overdueCount = 0;
        const alerts: string[] = [];

        const transactions = pending.map(r => {
            const dueDate = new Date(r.date);
            const isOverdue = dueDate < today;
            const diffTime = today.getTime() - dueDate.getTime();
            const diffDays = Math.ceil(diffTime / (86400000));

            if (r.type === 'EXPENSE') {
                payables += r.amount;
                if (isOverdue) {
                    overdueCount++;
                    alerts.push(`🔴 Payment overdue: ${r.description?.split(':')[0] || 'Supplier'} (RM ${r.amount.toFixed(0)})`);
                }
            } else {
                receivables += r.amount;
                if (diffDays > 10) {
                    alerts.push(`🟡 Receivable pending > 10 days (${r.description?.split(':')[0] || 'Client'})`);
                }
            }

            return {
                id: r.id,
                type: r.type === 'INCOME' ? 'Receivable' : 'Payable',
                party: r.description?.split(':')[0] || (r.type === 'INCOME' ? 'Client' : 'Supplier'),
                amount: r.amount,
                dueDate: r.date,
                status: isOverdue ? 'Overdue' : 'Pending',
                rawRecord: r
            };
        }).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()); // Oldest first

        if ((payables + receivables) > 20000) alerts.push("⚠ High outstanding balance this month");

        return { payables, receivables, overdueCount, transactions, alerts };
    }, [financialRecords]);

    const financialHealth = useMemo(() => {
        if (!financialRecords) return { cashFlow: 'Stable', receivableCycle: 'Healthy', payableCycle: 'Healthy' };
        
        const netFlow = financeOverviewData?.netCashFlow || 0;
        const cashFlowStatus = netFlow < 0 ? '⚠ Tight' : '✅ Healthy';
        
        // Simple logic: if more than 30% of income is pending -> Slow
        const totalIncome = financeOverviewData?.totalRevenue + outstandingStats.receivables;
        const receivableCycle = (outstandingStats.receivables > totalIncome * 0.3) ? '❌ Slow' : '✅ Healthy';
        
        const payableCycle = outstandingStats.overdueCount > 2 ? '❌ Critical' : outstandingStats.payables > 5000 ? '⚠ Watch' : '✅ Healthy';

        return { cashFlowStatus, receivableCycle, payableCycle };
    }, [financeOverviewData, outstandingStats]);

    if (!isFarming) {
        return <div className="p-8 text-center text-gray-500">Processing Village Overview is managed in separate tabs.</div>;
    }

    // --- USER ROLE VIEW ---
    if (!isAdmin && !isFinance) {
        return (
            <div className="space-y-6 animate-fade-in-up">
                
                {/* Weather Action Banner */}
                {weatherAlerts.length > 0 && (
                    <div className="bg-red-500 border-l-8 border-red-800 text-white p-4 rounded-r-xl shadow-lg animate-pulse">
                        <div className="flex items-center gap-3">
                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            <div>
                                <h3 className="font-bold uppercase text-sm tracking-widest">Environment Action Required</h3>
                                {weatherAlerts.map((msg, i) => (
                                    <p key={i} className="text-xs font-medium mt-1">{msg}</p>
                                ))}
                                <button onClick={() => setActiveTab('environment')} className="mt-2 text-[10px] bg-white text-red-600 font-bold uppercase px-3 py-1 rounded shadow-sm hover:bg-red-50">Go to Environment Tab</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Harvest Alert Banner */}
                {harvestAlerts.length > 0 && (
                    <div className="bg-gradient-to-r from-orange-50 to-orange-100 border-l-4 border-orange-500 p-4 rounded-r-xl shadow-sm animate-fade-in-down">
                        <div className="flex items-start">
                            <div className="flex-shrink-0">
                                <svg className="h-5 w-5 text-orange-600 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <div className="ml-3 w-full">
                                <h3 className="text-sm font-bold text-orange-800 uppercase tracking-wide">Harvest Action Required</h3>
                                <div className="mt-2 space-y-2">
                                    {harvestAlerts.map(alert => (
                                        <div key={alert.batchId} className="flex justify-between items-center bg-white/60 p-2 rounded-lg border border-orange-200">
                                            <span className="text-xs text-orange-900 font-medium">
                                                Batch <strong>{alert.batchId}</strong> ({alert.strain}): {alert.days <= 0 ? "Ready Now" : `Ready in ${alert.days} days`}
                                            </span>
                                            <button onClick={() => setActiveTab('farming')} className="text-[10px] bg-orange-600 text-white px-2 py-1 rounded hover:bg-orange-700 transition-colors uppercase font-bold shadow-sm">
                                                Log Harvest
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Section 1: Header */}
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">{village.name} – Operational Overview</h1>
                        <p className="text-sm text-gray-500">{new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </div>
                    <span className="px-4 py-1 bg-green-100 text-green-800 rounded-full text-xs font-bold uppercase tracking-wider">Shift 1 (Active)</span>
                </div>

                {/* Section 2: Farming Snapshot */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm text-center">
                        <div className="text-[10px] uppercase font-bold text-gray-400">Active Batches</div>
                        <div className="text-3xl font-black text-green-600">{activeBatches.length}</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm text-center">
                        <div className="text-[10px] uppercase font-bold text-gray-400">Harvest Ready (≤3d)</div>
                        <div className={`text-3xl font-black ${farmingStats.nearHarvest > 0 ? 'text-orange-500' : 'text-gray-700'}`}>{farmingStats.nearHarvest}</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm text-center">
                        <div className="text-[10px] uppercase font-bold text-gray-400">Est. Yield (7d)</div>
                        <div className="text-3xl font-black text-blue-600">~{farmingStats.estYield.toFixed(0)} <span className="text-sm text-gray-400">kg</span></div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm text-center">
                        <div className="text-[10px] uppercase font-bold text-gray-400">Active Alerts</div>
                        <div className={`text-3xl font-black ${activeAlerts.length > 0 ? 'text-red-500 animate-pulse' : 'text-green-500'}`}>{activeAlerts.length}</div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Section 3: Workflow */}
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm cursor-pointer hover:border-green-400 transition-all" onClick={() => setActiveTab('farming')}>
                        <h3 className="text-sm font-bold text-gray-900 uppercase mb-4 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500"></span> Workflow Status
                        </h3>
                        <div className="space-y-3">
                            {Object.entries(farmingStats.stages).map(([stage, count]) => (
                                <div key={stage} className="flex justify-between items-center text-sm">
                                    <span className="text-gray-600">{stage}</span>
                                    <span className="font-bold bg-gray-100 px-2 py-0.5 rounded text-gray-800">{count}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Section 4: Environment Health */}
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm cursor-pointer hover:border-blue-400 transition-all" onClick={() => setActiveTab('environment')}>
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-sm font-bold text-gray-900 uppercase flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-blue-500"></span> Environment
                            </h3>
                            <span className="text-[10px] text-gray-400">Updated: {latestEnv ? new Date(latestEnv.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--:--'}</span>
                        </div>
                        {latestEnv ? (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600">Temperature</span>
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold">{latestEnv.temperature}°C</span>
                                        <span className={`text-xs ${latestEnv.temperature > 28 ? 'text-red-500' : 'text-green-500'}`}>{latestEnv.temperature > 28 ? '⚠' : '✅'}</span>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600">Humidity</span>
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold">{latestEnv.humidity}%</span>
                                        <span className={`text-xs ${latestEnv.humidity < 75 ? 'text-orange-500' : 'text-green-500'}`}>{latestEnv.humidity < 75 ? '⚠' : '✅'}</span>
                                    </div>
                                </div>
                                <div className="mt-4 p-2 bg-blue-50 text-blue-700 text-xs rounded border border-blue-100 font-medium">
                                    Hint: Check misters if humidity drops below 75%.
                                </div>
                            </div>
                        ) : <div className="text-sm text-gray-400 italic">No sensor data.</div>}
                    </div>

                    {/* Section 5: Resource Availability */}
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm cursor-pointer hover:border-indigo-400 transition-all" onClick={() => setActiveTab('resources')}>
                        <h3 className="text-sm font-bold text-gray-900 uppercase mb-4 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-indigo-500"></span> Stock Levels
                        </h3>
                        <div className="space-y-3 max-h-[200px] overflow-y-auto">
                            {resources.slice(0, 5).map(r => (
                                <div key={r.id} className="flex justify-between items-center text-sm">
                                    <span className="text-gray-600 truncate max-w-[120px]">{r.name}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold">{r.quantity} {r.unit}</span>
                                        <span className={`w-2 h-2 rounded-full ${r.quantity <= (r as any).lowStockThreshold ? 'bg-red-500' : 'bg-green-500'}`}></span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Section 6: Alerts & Tasks */}
                {activeAlerts.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                        <h3 className="text-red-800 font-bold uppercase text-sm mb-4">Action Required</h3>
                        <ul className="space-y-2">
                            {activeAlerts.map((alert, i) => (
                                <li key={i} className="flex items-center gap-2 text-sm text-red-700 font-medium">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                    {alert} – Notify admin or take action.
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        );
    }

    // --- ADMIN ROLE VIEW ---
    if (isAdmin) {
        return (
            <div className="space-y-6 animate-fade-in-up">
                {/* Section 1: Header */}
                <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-lg flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold">{village.name} – System Control</h1>
                        <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">Administrator Dashboard</p>
                    </div>
                    <div className="text-right">
                        <span className="px-3 py-1 bg-indigo-500 rounded text-[10px] font-bold uppercase">Admin Access</span>
                        <div className="text-[10px] text-slate-400 mt-1">Last Sync: {new Date().toLocaleTimeString()}</div>
                    </div>
                </div>

                {/* Section 2: Full KPI */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                        <div className="text-[10px] font-bold text-gray-400 uppercase">Active Batches</div>
                        <div className="text-2xl font-black text-slate-800">{activeBatches.length}</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                        <div className="text-[10px] font-bold text-gray-400 uppercase">Total Est. Yield</div>
                        <div className="text-2xl font-black text-green-600">{farmingStats.estYield.toFixed(0)}kg</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                        <div className="text-[10px] font-bold text-gray-400 uppercase">Asset Value</div>
                        <div className="text-2xl font-black text-indigo-600">RM{resources.reduce((a, b) => a + ((b.quantity/ (b.unit==='L'?10:1)) * ((b as any).unitCost||0)), 0).toFixed(0)}</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                        <div className="text-[10px] font-bold text-gray-400 uppercase">Cost/Batch</div>
                        <div className="text-2xl font-black text-orange-600">RM{costStats.costPerBatch.toFixed(0)}</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                        <div className="text-[10px] font-bold text-gray-400 uppercase">System Alerts</div>
                        <div className="text-2xl font-black text-red-600">{activeAlerts.length}</div>
                    </div>
                </div>

                {/* Section 3 & 4: Cross-Module & Cost */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
                        <h3 className="text-sm font-bold text-gray-900 uppercase border-b pb-2">Module Summaries</h3>
                        
                        <div className="flex justify-between items-center text-sm cursor-pointer hover:bg-gray-50 p-2 rounded" onClick={() => setActiveTab('farming')}>
                            <span className="font-bold text-gray-600">Farming Stage Dist.</span>
                            <div className="flex gap-1">
                                {Object.entries(farmingStats.stages).map(([s, c]) => c > 0 && (
                                    <span key={s} className="bg-gray-100 text-[10px] px-2 py-1 rounded text-gray-600">{s.split(' ')[0]}: {c}</span>
                                ))}
                            </div>
                        </div>

                        <div className="flex justify-between items-center text-sm cursor-pointer hover:bg-gray-50 p-2 rounded" onClick={() => setActiveTab('environment')}>
                            <span className="font-bold text-gray-600">Env Status</span>
                            <span className={`font-bold ${latestEnv && latestEnv.temperature < 30 ? 'text-green-600' : 'text-red-600'}`}>
                                {latestEnv ? `${latestEnv.temperature}°C / ${latestEnv.humidity}%` : 'Offline'}
                            </span>
                        </div>

                        <div className="flex justify-between items-center text-sm cursor-pointer hover:bg-gray-50 p-2 rounded" onClick={() => setActiveTab('resources')}>
                            <span className="font-bold text-gray-600">Low Stock Items</span>
                            <span className="font-bold text-orange-600">{activeAlerts.filter(a => a.includes('Stock')).length} Items</span>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setActiveTab('analysis')}>
                        <div className="flex justify-between items-center border-b pb-2 mb-4">
                            <h3 className="text-sm font-bold text-gray-900 uppercase">Cost Awareness</h3>
                            <span className="text-[10px] text-blue-600 font-bold uppercase">View Analysis &rarr;</span>
                        </div>
                        <div className="space-y-4">
                            <div className="flex justify-between">
                                <span className="text-sm text-gray-500">Avg Cost per kg</span>
                                <span className="font-bold text-gray-800">RM {costStats.avgCostPerKg.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-sm text-gray-500">Highest Cost Material</span>
                                <span className="font-bold text-gray-800">{costStats.highCostMat}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-sm text-gray-500">Inventory Value</span>
                                <span className="font-bold text-gray-800">RM {resources.reduce((a, b) => a + ((b.quantity/ (b.unit==='L'?10:1)) * ((b as any).unitCost||0)), 0).toFixed(0)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Section 5: System Alerts */}
                {activeAlerts.length > 0 && (
                    <div className="bg-red-50 p-6 rounded-xl border border-red-200">
                        <h3 className="text-sm font-bold text-red-900 uppercase mb-3">System Exceptions</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {activeAlerts.map((a, i) => (
                                <div key={i} className="flex items-center gap-2 text-sm text-red-700 bg-white p-2 rounded border border-red-100">
                                    <span className="w-2 h-2 rounded-full bg-red-500"></span> {a}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // --- FINANCE ROLE VIEW ---
    return (
        <div className="space-y-6 animate-fade-in-up">
            {/* Section 1: Header */}
            <div className="bg-gradient-to-r from-emerald-800 to-teal-900 text-white p-6 rounded-2xl shadow-lg flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold">{village.name} – Financial Overview</h1>
                    <p className="text-xs text-emerald-200 uppercase tracking-widest mt-1">Cost & Profitability Center</p>
                </div>
                <button onClick={() => setActiveTab('analysis')} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold uppercase transition-colors">
                    Detailed Report
                </button>
            </div>

            {/* Section 2: Financial KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    <div className="text-[10px] font-bold text-gray-400 uppercase">Total Prod. Cost</div>
                    <div className="text-xl font-black text-gray-800">RM{costStats.totalCost.toLocaleString(undefined, {minimumFractionDigits:0})}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    <div className="text-[10px] font-bold text-gray-400 uppercase">Cost / Batch</div>
                    <div className="text-xl font-black text-gray-800">RM{costStats.costPerBatch.toFixed(0)}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    <div className="text-[10px] font-bold text-gray-400 uppercase">Cost / kg</div>
                    <div className="text-xl font-black text-orange-600">RM{costStats.avgCostPerKg.toFixed(2)}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    <div className="text-[10px] font-bold text-gray-400 uppercase">Avg Sell Price</div>
                    <div className="text-xl font-black text-green-600">RM{costStats.avgSellingPrice.toFixed(2)}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    <div className="text-[10px] font-bold text-gray-400 uppercase">Gross Margin</div>
                    <div className="text-xl font-black text-blue-600">{costStats.grossMargin.toFixed(1)}%</div>
                </div>
            </div>

            {/* Section 3: Outstanding Payments (New) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Cards */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm cursor-pointer hover:border-indigo-400 transition-colors" onClick={() => setActiveTab('financial')}>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Payables (Unpaid)</div>
                    <div className={`text-2xl font-black ${outstandingStats.payables > 5000 ? 'text-red-500' : 'text-gray-800'}`}>RM {outstandingStats.payables.toLocaleString()}</div>
                </div>
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm cursor-pointer hover:border-indigo-400 transition-colors" onClick={() => setActiveTab('financial')}>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Receivables (Uncollected)</div>
                    <div className="text-2xl font-black text-green-600">RM {outstandingStats.receivables.toLocaleString()}</div>
                </div>
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm cursor-pointer hover:border-indigo-400 transition-colors" onClick={() => setActiveTab('financial')}>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Overdue Transactions</div>
                    <div className={`text-2xl font-black ${outstandingStats.overdueCount > 0 ? 'text-red-600 animate-pulse' : 'text-gray-400'}`}>{outstandingStats.overdueCount}</div>
                </div>
                
                {/* Table */}
                <div className="md:col-span-3 bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                        <h3 className="text-sm font-bold text-gray-800 uppercase">Outstanding Transactions</h3>
                        <button onClick={() => setActiveTab('financial')} className="text-xs font-bold text-blue-600 uppercase hover:underline">View All &rarr;</button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-xs">
                            <thead className="bg-gray-50 text-gray-500 uppercase font-bold">
                                <tr>
                                    <th className="px-6 py-3 text-left">Type</th>
                                    <th className="px-6 py-3 text-left">Party</th>
                                    <th className="px-6 py-3 text-right">Amount (RM)</th>
                                    <th className="px-6 py-3 text-left">Due Date</th>
                                    <th className="px-6 py-3 text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {outstandingStats.transactions.length === 0 ? (
                                    <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400 italic">No outstanding payments.</td></tr>
                                ) : (
                                    outstandingStats.transactions.slice(0, 5).map(tx => (
                                        <tr key={tx.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openEditTransModal(tx.rawRecord)}>
                                            <td className="px-6 py-3 font-bold">{tx.type}</td>
                                            <td className="px-6 py-3 text-gray-600 truncate max-w-[150px]">{tx.party}</td>
                                            <td className="px-6 py-3 text-right font-mono">{tx.amount.toLocaleString()}</td>
                                            <td className="px-6 py-3">{new Date(tx.dueDate).toLocaleDateString()}</td>
                                            <td className="px-6 py-3 text-center">
                                                <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${tx.status === 'Overdue' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-700'}`}>
                                                    {tx.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Section 4: Notifications (New) */}
            {outstandingStats.alerts.length > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-6">
                    <h3 className="text-orange-900 font-bold uppercase text-sm mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                        Financial Alerts
                    </h3>
                    <ul className="space-y-2">
                        {outstandingStats.alerts.map((alert, i) => (
                            <li key={i} className="text-xs font-bold text-orange-800">{alert}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Section 5: Highlights */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-emerald-50 p-6 rounded-xl border border-emerald-100 shadow-sm cursor-pointer hover:bg-emerald-100 transition-colors" onClick={() => setActiveTab('analysis')}>
                    <h3 className="text-sm font-bold text-emerald-900 uppercase mb-3">Cost Analysis Highlights</h3>
                    <ul className="space-y-2 text-xs text-emerald-800 font-medium list-disc pl-4">
                        <li>Margin is healthy at {costStats.grossMargin.toFixed(1)}%.</li>
                        <li>Spawn costs remain the highest impact factor.</li>
                        <li>Oyster strains showing better efficiency than Lion's Mane.</li>
                        {outstandingStats.overdueCount > 0 && <li className="text-red-700 font-bold">Action required on overdue payments.</li>}
                    </ul>
                    <div className="mt-4 text-[10px] text-emerald-600 font-bold uppercase text-right">Click for details &rarr;</div>
                </div>

                {/* Section 6: Financial Health (Optional/New) */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <h3 className="text-sm font-bold text-gray-900 uppercase mb-4">Financial Health Indicators</h3>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-gray-500">Cash Flow</span>
                            <span className={`font-bold ${financialHealth.cashFlowStatus.includes('Tight') ? 'text-orange-600' : 'text-green-600'}`}>{financialHealth.cashFlowStatus}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-gray-500">Receivable Cycle</span>
                            <span className={`font-bold ${financialHealth.receivableCycle.includes('Slow') ? 'text-red-600' : 'text-green-600'}`}>{financialHealth.receivableCycle}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-gray-500">Payable Cycle</span>
                            <span className={`font-bold ${financialHealth.payableCycle.includes('Critical') ? 'text-red-600' : 'text-green-600'}`}>{financialHealth.payableCycle}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
