import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, getDocs, where, limit } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { VillageType, ActivityLog, EnvironmentLog } from '../../types';
import { MUSHROOM_PRICES } from '../../constants';

interface ProductionAnalysisTabProps {
    villageId: VillageType;
    userEmail: string;
}

interface BatchAnalysis {
    id: string;
    batchId: string;
    strain: string;
    startDate: string;
    status: string;
    predictedYield: number;
    actualYield: number;
    wastage: number;
    materialCost: number;
    costPerKg: number;
    efficiency: number;
    envStats: {
        avgTemp: number;
        avgHumid: number;
        readings: number;
    };
    breakdown: {
        material: string;
        qty: number;
        unit: string;
        activity: string;
        cost: number;
    }[];
}

export const ProductionAnalysisTab: React.FC<ProductionAnalysisTabProps> = ({ villageId }) => {
    const [batches, setBatches] = useState<BatchAnalysis[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedBatch, setExpandedBatch] = useState<string | null>(null);

    useEffect(() => {
        fetchData();
    }, [villageId]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const farmingCol = villageId === VillageType.A ? 'dailyfarming_logA' : 'dailyfarming_logB';
            const envCol = `environmentLogs_${villageId.replace(/\s/g, '')}`;

            // 1. Fetch Batches
            const batchQ = query(collection(db, farmingCol), orderBy('timestamp', 'desc'));
            const batchSnap = await getDocs(batchQ);
            const rawBatches: any[] = [];
            
            // Only fetch main batch entries (SUBSTRATE_PREP)
            batchSnap.forEach(doc => {
                const data = doc.data();
                if (data.type === 'SUBSTRATE_PREP') { 
                    rawBatches.push({ id: doc.id, ...data });
                }
            });

            // 2. Fetch Env Logs (last 500)
            const envQ = query(collection(db, envCol), orderBy('timestamp', 'desc'), limit(500));
            const envSnap = await getDocs(envQ);
            const envLogs: EnvironmentLog[] = envSnap.docs.map(d => ({ id: d.id, ...d.data() } as EnvironmentLog));

            // 3. Process Analysis with Cost Ledger Fetching
            const analyzedPromises = rawBatches.map(async (batch) => {
                const predicted = batch.predictedYield || 0;
                const actual = batch.totalYield || 0;
                const wastage = batch.totalWastage || 0;
                
                // Fetch Detailed Cost Ledger
                const costLedgerRef = collection(db, farmingCol, batch.id, "batch_costs");
                const costSnap = await getDocs(costLedgerRef);
                
                const breakdown: any[] = [];
                let totalCost = 0;

                costSnap.forEach(doc => {
                    const data = doc.data();
                    const costVal = data.totalCost || 0;
                    totalCost += costVal;
                    breakdown.push({
                        material: data.materialName || 'Unknown',
                        qty: data.quantity || 0,
                        unit: data.unit || '',
                        activity: data.activity || 'Misc',
                        cost: costVal
                    });
                });

                // Env Analysis
                const batchStart = new Date(batch.timestamp).getTime();
                const batchEnd = batch.batchStatus === 'COMPLETED' ? batchStart + (30 * 86400000) : new Date().getTime(); 
                
                const relevantEnv = envLogs.filter(l => {
                    const t = new Date(l.timestamp).getTime();
                    return t >= batchStart && t <= batchEnd;
                });

                const avgTemp = relevantEnv.length ? relevantEnv.reduce((a, b) => a + b.temperature, 0) / relevantEnv.length : 0;
                const avgHumid = relevantEnv.length ? relevantEnv.reduce((a, b) => a + b.humidity, 0) / relevantEnv.length : 0;

                const efficiency = predicted > 0 ? (actual / predicted) * 100 : 0;
                const costPerKg = actual > 0 ? totalCost / actual : (predicted > 0 ? totalCost / predicted : 0);

                return {
                    id: batch.id,
                    batchId: batch.batchId || batch.id,
                    strain: batch.mushroomStrain || 'Unknown',
                    startDate: batch.timestamp,
                    status: batch.batchStatus || (efficiency >= 100 ? 'Completed' : 'In Progress'),
                    predictedYield: predicted,
                    actualYield: actual,
                    wastage,
                    materialCost: totalCost,
                    costPerKg,
                    efficiency,
                    envStats: {
                        avgTemp,
                        avgHumid,
                        readings: relevantEnv.length
                    },
                    breakdown
                };
            });

            const results = await Promise.all(analyzedPromises);
            setBatches(results);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const overallStats = useMemo(() => {
        const totalCost = batches.reduce((a, b) => a + b.materialCost, 0);
        const totalYield = batches.reduce((a, b) => a + b.actualYield, 0);
        const avgEff = batches.length ? batches.reduce((a, b) => a + b.efficiency, 0) / batches.length : 0;
        return { totalCost, totalYield, avgEff };
    }, [batches]);

    if (loading) return <div className="p-10 text-center text-gray-400 animate-pulse">Analyzing production data...</div>;

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total Material Cost</h3>
                    <div className="text-3xl font-black text-gray-900 mt-2">RM{overallStats.totalCost.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                    <p className="text-xs text-gray-500 mt-1">Across {batches.length} batches</p>
                </div>
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Global Efficiency</h3>
                    <div className={`text-3xl font-black mt-2 ${overallStats.avgEff >= 90 ? 'text-green-600' : overallStats.avgEff >= 70 ? 'text-blue-600' : 'text-orange-600'}`}>
                        {overallStats.avgEff.toFixed(1)}%
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Actual vs Predicted Yield</p>
                </div>
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Avg Cost of Goods</h3>
                    <div className="text-3xl font-black text-indigo-600 mt-2">
                        RM{(overallStats.totalYield > 0 ? overallStats.totalCost / overallStats.totalYield : 0).toFixed(2)}<span className="text-lg text-gray-400">/kg</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Based on harvested output</p>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                    <h3 className="text-sm font-bold text-gray-800 uppercase">Batch Performance Ledger</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase">
                            <tr>
                                <th className="px-6 py-3 text-left">Batch ID</th>
                                <th className="px-6 py-3 text-left">Strain</th>
                                <th className="px-6 py-3 text-right">Input Cost</th>
                                <th className="px-6 py-3 text-right">Output (kg)</th>
                                <th className="px-6 py-3 text-right">Cost/kg</th>
                                <th className="px-6 py-3 text-center">Efficiency</th>
                                <th className="px-6 py-3 text-center">Env Link</th>
                                <th className="px-6 py-3 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                            {batches.map(batch => (
                                <React.Fragment key={batch.id}>
                                    <tr className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 font-mono font-bold text-gray-800">{batch.batchId}</td>
                                        <td className="px-6 py-4">{batch.strain}</td>
                                        <td className="px-6 py-4 text-right">RM{batch.materialCost.toFixed(2)}</td>
                                        <td className="px-6 py-4 text-right font-bold">
                                            {batch.actualYield.toFixed(1)} <span className="text-gray-400 font-normal">/ {batch.predictedYield}</span>
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono text-xs text-gray-600">RM{batch.costPerKg.toFixed(2)}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-2 py-1 rounded-full text-[10px] font-black ${batch.efficiency >= 90 ? 'bg-green-100 text-green-700' : batch.efficiency >= 50 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                                                {batch.efficiency.toFixed(0)}%
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center text-xs text-gray-500">
                                            {batch.envStats.readings > 0 ? (
                                                <div className="flex flex-col items-center">
                                                    <span title="Avg Temp">{batch.envStats.avgTemp.toFixed(1)}°C</span>
                                                    <span title="Avg Humid" className="text-blue-400">{batch.envStats.avgHumid.toFixed(0)}%</span>
                                                </div>
                                            ) : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <button 
                                                onClick={() => setExpandedBatch(expandedBatch === batch.id ? null : batch.id)}
                                                className="text-indigo-600 hover:text-indigo-900 text-xs font-bold uppercase"
                                            >
                                                {expandedBatch === batch.id ? 'Close' : 'Details'}
                                            </button>
                                        </td>
                                    </tr>
                                    {expandedBatch === batch.id && (
                                        <tr className="bg-indigo-50/50">
                                            <td colSpan={8} className="px-6 py-4">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <div>
                                                        <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-2">Material Cost Breakdown</h4>
                                                        <table className="w-full text-xs bg-white rounded border border-gray-200">
                                                            <thead>
                                                                <tr className="bg-gray-50 border-b">
                                                                    <th className="p-2 text-left">Activity</th>
                                                                    <th className="p-2 text-left">Material</th>
                                                                    <th className="p-2 text-right">Qty Used</th>
                                                                    <th className="p-2 text-right">Cost</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {batch.breakdown.length === 0 ? (
                                                                    <tr><td colSpan={4} className="p-4 text-center italic text-gray-400">No cost data logged.</td></tr>
                                                                ) : (
                                                                    batch.breakdown.map((item, i) => (
                                                                        <tr key={i} className="border-b last:border-0">
                                                                            <td className="p-2 text-gray-500">{item.activity}</td>
                                                                            <td className="p-2 font-medium">{item.material}</td>
                                                                            <td className="p-2 text-right">{item.qty.toFixed(2)} {item.unit}</td>
                                                                            <td className="p-2 text-right font-mono">RM{item.cost.toFixed(2)}</td>
                                                                        </tr>
                                                                    ))
                                                                )}
                                                                <tr className="font-bold bg-gray-50">
                                                                    <td className="p-2" colSpan={3}>Total</td>
                                                                    <td className="p-2 text-right">RM{batch.materialCost.toFixed(2)}</td>
                                                                </tr>
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                    <div>
                                                        <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-2">Profitability Estimate</h4>
                                                        <div className="bg-white p-4 rounded border border-gray-200 shadow-sm">
                                                            <div className="flex justify-between mb-2">
                                                                <span className="text-xs text-gray-500">Ref. Sales Price ({batch.strain})</span>
                                                                <span className="text-xs font-bold text-gray-900">RM{MUSHROOM_PRICES[batch.strain] || 10}/kg</span>
                                                            </div>
                                                            <div className="flex justify-between mb-2">
                                                                <span className="text-xs text-gray-500">Total Sales Value</span>
                                                                <span className="text-xs font-bold text-green-600">RM{(batch.actualYield * (MUSHROOM_PRICES[batch.strain] || 10)).toFixed(2)}</span>
                                                            </div>
                                                            <div className="flex justify-between border-t pt-2 mt-2">
                                                                <span className="text-xs font-bold text-gray-700">Gross Margin</span>
                                                                <span className="text-xs font-black text-indigo-600">RM{((batch.actualYield * (MUSHROOM_PRICES[batch.strain] || 10)) - batch.materialCost).toFixed(2)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};