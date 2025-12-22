
import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { ActivityLog, VillageType } from '../../types';

interface ExtendedActivityLog extends ActivityLog {
    totalWastage?: number;
    stepsCompleted?: string[];
}

interface FarmingReportsProps {
    villageId: VillageType;
    batchList: ExtendedActivityLog[];
    recordedWastageList: any[];
    onSuccess: (msg: string) => void;
    onError: (msg: string) => void;
}

export const FarmingReports: React.FC<FarmingReportsProps> = ({
    villageId, batchList, recordedWastageList, onSuccess, onError
}) => {
    const [productionPeriod, setProductionPeriod] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY'>('DAILY');
    const [dailyProductionData, setDailyProductionData] = useState<{date: string, weight: number}[]>([]);
    
    // Derived Stats
    const productivityStats = useMemo(() => {
        const totalYield = batchList.reduce((acc, curr) => acc + (curr.totalYield || 0), 0);
        const totalPredicted = batchList.reduce((acc, curr) => acc + (curr.predictedYield || 0), 0);
        let bestStrain = '-'; let maxYield = 0; const strainGroups: Record<string, number> = {};
        batchList.forEach(b => { if (b.mushroomStrain) { strainGroups[b.mushroomStrain] = (strainGroups[b.mushroomStrain] || 0) + (b.totalYield || 0); } });
        Object.entries(strainGroups).forEach(([strain, yieldVal]) => { if (yieldVal > maxYield) { maxYield = yieldVal; bestStrain = strain; } });
        return { totalYield, avgYield: batchList.length > 0 ? totalYield / batchList.length : 0, bestStrain, totalPredicted };
    }, [batchList]);

    const wastageStats = useMemo(() => {
        let totalWastage = 0;
        let totalRecordedWastage = 0;
        batchList.forEach(b => {
            if (b.totalWastage) totalWastage += b.totalWastage;
        });
        recordedWastageList.forEach(w => {
            if (w.weightKg) totalRecordedWastage += w.weightKg;
        });
        const finalWastage = Math.max(totalWastage, totalRecordedWastage);
        const totalOutput = productivityStats.totalYield + finalWastage;
        const wastageRate = totalOutput > 0 ? (finalWastage / totalOutput) * 100 : 0;
        
        return { totalEfficiencyLoss: finalWastage, wastageRate, totalRecordedWastage: finalWastage };
    }, [batchList, recordedWastageList, productivityStats.totalYield]);

    // Data Fetching for Charts
    useEffect(() => {
        const fetchProductivityData = async () => {
            if (batchList.length === 0) return;
            try {
                const dailyMap = new Map<string, number>();
                const promises = batchList.map(async (batch) => {
                   if (!batch.id) return;
                   const collectionName = villageId === VillageType.A ? "dailyfarming_logA" : "dailyfarming_logB";
                   const subColRef = collection(db, collectionName, batch.id, "activity_logs");
                   const q = query(subColRef, where('type', '==', 'HARVEST'));
                   const snap = await getDocs(q);
                   snap.forEach(doc => {
                       const data = doc.data();
                       if (data.timestamp && data.totalYield) { 
                           const dateKey = new Date(data.timestamp).toISOString().split('T')[0];
                           const current = dailyMap.get(dateKey) || 0;
                           dailyMap.set(dateKey, current + (data.totalYield || 0));
                       }
                   });
                });
                await Promise.all(promises);
                const sortedData = Array.from(dailyMap.entries()).map(([date, weight]) => ({ date, weight })).sort((a, b) => a.date.localeCompare(b.date));
                setDailyProductionData(sortedData);
            } catch (e) {
                console.error("Error calculating productivity", e);
                onError("Failed to load detailed productivity logs.");
            }
        };
        fetchProductivityData();
    }, [batchList, villageId]);

    const monthlyStats = useMemo(() => {
        const stats: Record<string, number> = {};
        dailyProductionData.forEach(d => {
            const month = d.date.substring(0, 7); 
            stats[month] = (stats[month] || 0) + d.weight;
        });
        return Object.entries(stats).map(([month, weight]) => ({ month, weight })).sort((a, b) => a.month.localeCompare(b.month));
    }, [dailyProductionData]);
  
    const chartData = useMemo(() => {
        if (productionPeriod === 'MONTHLY') return monthlyStats.map(s => ({ date: s.month, weight: s.weight }));
        return dailyProductionData; 
    }, [dailyProductionData, productionPeriod, monthlyStats]);

    // Handlers
    const handleSendForecast = () => {
        onSuccess("Yield forecast sent to Village C Sales Team.");
    };

    const handlePrintProductionReport = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        
        const rows = batchList.map(b => {
            const predicted = b.predictedYield || 0;
            const actual = b.totalYield || 0;
            const wastage = b.totalWastage || 0;
            const totalOutput = actual + wastage;
            const efficiency = predicted > 0 ? ((actual / predicted) * 100).toFixed(1) : '0.0';
            const status = (predicted > 0 && totalOutput >= predicted) ? 'Completed' : 'In Progress';
            
            return `<tr>
                <td>${new Date(b.timestamp).toLocaleDateString()}</td>
                <td>${b.batchId || b.id}</td>
                <td>${b.mushroomStrain || '-'}</td>
                <td style="text-align:right">${predicted.toFixed(1)}</td>
                <td style="text-align:right">${actual.toFixed(1)}</td>
                <td style="text-align:right">${wastage > 0 ? wastage.toFixed(1) : '-'}</td>
                <td style="text-align:right">${efficiency}%</td>
                <td style="text-align:center">${status}</td>
            </tr>`;
        }).join('');
  
        printWindow.document.write(`
            <html><head><title>Production Report</title>
            <style>body{font-family:'Inter',sans-serif;padding:40px;color:#333;}table{width:100%;border-collapse:collapse;margin-top:20px;}th,td{border-bottom:1px solid #eee;padding:10px;text-align:left;font-size:12px;}th{background:#f9f9f9;font-weight:bold;text-transform:uppercase;}h1{font-size:24px;margin-bottom:5px;}p{font-size:12px;color:#666;}</style>
            </head><body>
            <h1>Production Report</h1><p>Generated: ${new Date().toLocaleString()} for ${villageId}</p>
            <table><thead><tr><th>Date</th><th>Batch ID</th><th>Strain</th><th style="text-align:right">Predicted (kg)</th><th style="text-align:right">Actual (kg)</th><th style="text-align:right">Wastage (kg)</th><th style="text-align:right">Efficiency</th><th style="text-align:center">Status</th></tr></thead><tbody>${rows}</tbody></table>
            <script>window.onload=()=>{window.print();window.close();}</script></body></html>
        `);
        printWindow.document.close();
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6">
                <div>
                    <h3 className="font-bold text-gray-800">Actions</h3>
                    <p className="text-xs text-gray-500">Manage external reporting</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={handleSendForecast} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold uppercase shadow-sm flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                        Send Forecast to Village C
                    </button>
                    <button onClick={handlePrintProductionReport} className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-bold uppercase shadow-sm flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                        Print Report
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total Yield (All Time)</h3>
                    <div className="text-3xl font-black text-green-600 mt-2">{productivityStats.totalYield.toFixed(1)} <span className="text-sm text-gray-400">kg</span></div>
                    <p className="text-[10px] text-gray-400 mt-1 font-bold">From {batchList.length} recorded batches</p>
                </div>
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Harvest Efficiency</h3>
                    <div className={`text-3xl font-black mt-2 ${productivityStats.totalPredicted > 0 && (productivityStats.totalYield / productivityStats.totalPredicted) > 0.8 ? 'text-blue-600' : 'text-orange-500'}`}>
                        {productivityStats.totalPredicted > 0 ? ((productivityStats.totalYield / productivityStats.totalPredicted) * 100).toFixed(1) : '0'}%
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1 font-bold">Actual vs Predicted Target</p>
                </div>
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Wastage Rate</h3>
                    <div className="text-3xl font-black text-red-500 mt-2">{wastageStats.wastageRate.toFixed(1)}%</div>
                    <p className="text-[10px] text-gray-400 mt-1 font-bold">{wastageStats.totalEfficiencyLoss.toFixed(1)}kg lost to defects</p>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Production Trends</h2>
                        <div className="text-xs text-gray-500">Yield output over time</div>
                    </div>
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        {(['DAILY', 'MONTHLY'] as const).map(mode => (
                            <button key={mode} onClick={() => setProductionPeriod(mode)} className={`px-3 py-1 text-xs font-bold rounded ${productionPeriod === mode ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>{mode}</button>
                        ))}
                    </div>
                </div>
                
                <div className="h-64 flex items-end space-x-2 w-full overflow-x-auto pb-2">
                    {chartData.length === 0 ? (
                        <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm italic">No production data available for this period.</div>
                    ) : (
                        chartData.map((d) => {
                            const maxWeight = Math.max(...chartData.map(c => c.weight), 10);
                            const heightPerc = Math.max((d.weight / maxWeight) * 100, 5);
                            return (
                                <div key={d.date} className="flex-1 min-w-[30px] flex flex-col items-center group relative h-full justify-end">
                                    <div className="w-full bg-green-500 rounded-t hover:bg-green-600 transition-all relative" style={{ height: `${heightPerc}%` }}>
                                        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
                                            {d.weight.toFixed(1)}kg
                                        </div>
                                    </div>
                                    <span className="text-[9px] text-gray-400 mt-2 rotate-45 origin-left translate-y-3 w-full text-center truncate">{d.date.slice(5)}</span>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Batch Performance Report with Wastage */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mt-6">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                    <h3 className="text-sm font-bold text-gray-800">Batch Performance Report</h3>
                </div>
                <div className="overflow-x-auto max-h-[400px]">
                    <table className="min-w-full divide-y divide-gray-200 text-sm text-left">
                        <thead className="bg-gray-50 text-xs text-gray-500 uppercase sticky top-0">
                            <tr>
                                <th className="px-6 py-3">Date</th>
                                <th className="px-6 py-3">Batch ID</th>
                                <th className="px-6 py-3">Strain</th>
                                <th className="px-6 py-3 text-right">Predicted (kg)</th>
                                <th className="px-6 py-3 text-right">Actual (kg)</th>
                                <th className="px-6 py-3 text-right">Wastage (kg)</th>
                                <th className="px-6 py-3 text-center">Efficiency</th>
                                <th className="px-6 py-3 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {batchList.map(batch => {
                                const predicted = batch.predictedYield || 0;
                                const actual = batch.totalYield || 0;
                                const wastage = batch.totalWastage || 0;
                                const efficiency = predicted > 0 ? (actual / predicted) * 100 : 0;
                                const totalOutput = actual + wastage;
                                const isCompleted = predicted > 0 && totalOutput >= predicted;

                                return (
                                    <tr key={batch.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-3 text-gray-500 text-xs">{new Date(batch.timestamp).toLocaleDateString()}</td>
                                        <td className="px-6 py-3 font-mono font-bold text-gray-700">{batch.batchId || batch.id}</td>
                                        <td className="px-6 py-3 font-medium">{batch.mushroomStrain || '-'}</td>
                                        <td className="px-6 py-3 text-right text-gray-500">{predicted.toFixed(1)}</td>
                                        <td className="px-6 py-3 text-right font-bold text-green-600">{actual.toFixed(1)}</td>
                                        <td className="px-6 py-3 text-right font-bold text-red-500">{wastage > 0 ? wastage.toFixed(1) : '-'}</td>
                                        <td className="px-6 py-3 text-center">
                                            <span className={`text-xs font-bold ${efficiency >= 90 ? 'text-green-600' : efficiency >= 70 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                {efficiency.toFixed(1)}%
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 text-center">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${isCompleted ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                {isCompleted ? 'Completed' : 'In Progress'}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                            {batchList.length === 0 && (
                                <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-400 italic">No batches found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                        <h3 className="text-sm font-bold text-gray-800">Best Performing Strains</h3>
                    </div>
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                            <tr>
                                <th className="px-6 py-3">Strain</th>
                                <th className="px-6 py-3 text-right">Total Yield</th>
                                <th className="px-6 py-3 text-right">Batch Count</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {Object.entries(batchList.reduce((acc, curr) => {
                                const s = curr.mushroomStrain || 'Unknown';
                                if (!acc[s]) acc[s] = { yield: 0, count: 0 };
                                acc[s].yield += (curr.totalYield || 0);
                                acc[s].count += 1;
                                return acc;
                            }, {} as Record<string, {yield: number, count: number}>))
                            .sort((a, b) => (b[1] as {yield: number}).yield - (a[1] as {yield: number}).yield)
                            .map(([strain, data]) => {
                                const d = data as {yield: number, count: number};
                                return (
                                <tr key={strain} className="hover:bg-gray-50">
                                    <td className="px-6 py-3 font-bold text-gray-800">{strain}</td>
                                    <td className="px-6 py-3 text-right font-mono text-green-600">{d.yield.toFixed(1)} kg</td>
                                    <td className="px-6 py-3 text-right text-gray-500">{d.count}</td>
                                </tr>
                            )})}
                        </tbody>
                    </table>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                        <h3 className="text-sm font-bold text-gray-800">Recent Wastage Events</h3>
                    </div>
                    <div className="max-h-[300px] overflow-y-auto">
                        {recordedWastageList.length === 0 ? (
                            <div className="p-6 text-center text-gray-400 text-sm italic">No wastage recorded recently.</div>
                        ) : (
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                                    <tr>
                                        <th className="px-6 py-3">Date</th>
                                        <th className="px-6 py-3">Reason</th>
                                        <th className="px-6 py-3 text-right">Loss</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {recordedWastageList.slice(0, 5).map(w => (
                                        <tr key={w.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-3 text-gray-500 text-xs">{new Date(w.timestamp).toLocaleDateString()}</td>
                                            <td className="px-6 py-3 font-medium text-gray-700">{w.reason}</td>
                                            <td className="px-6 py-3 text-right font-bold text-red-600">-{w.weightKg.toFixed(1)} kg</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
