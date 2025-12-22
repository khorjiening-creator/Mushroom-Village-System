import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, limit, onSnapshot, getDocs, where } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { VillageType, Product } from '../../types';
// Fixed: Use relative path instead of alias
import { costingService } from '../../services/costingService';

interface CostingTabProps {
  villageId: VillageType;
  userEmail: string;
  theme: any;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export const CostingTab: React.FC<CostingTabProps> = ({ villageId, userEmail, theme, onSuccess, onError }) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoadingBatches, setIsLoadingBatches] = useState(true);
  const [availableBatches, setAvailableBatches] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [analysis, setAnalysis] = useState<any>(null);
  
  // Input State for analysis
  const [targetBatch, setTargetBatch] = useState('');
  const [laborHours, setLaborHours] = useState('12');
  const [laborRate, setLaborRate] = useState('15');
  const [pkgUnitCost, setPkgUnitCost] = useState('0.85');

  useEffect(() => {
    // 1. Subscribe to products
    const unsubProds = onSnapshot(collection(db, 'products_VillageC'), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    });

    // 2. Fetch available batches from A & B based on SALES records
    const fetchBatches = async () => {
        setIsLoadingBatches(true);
        try {
            // Query for income records where category is Sales (and implied type is INCOME)
            // We'll fetch from income_A and income_B to find batches that have been sold
            const qA = query(collection(db, "income_A"), where("category", "==", "Sales"));
            const qB = query(collection(db, "income_B"), where("category", "==", "Sales"));

            const [snapA, snapB] = await Promise.all([
                getDocs(qA),
                getDocs(qB)
            ]);
            
            const ids = new Set<string>();
            
            snapA.forEach(doc => {
                const data = doc.data();
                if (data.batchId) ids.add(data.batchId);
            });
            snapB.forEach(doc => {
                const data = doc.data();
                if (data.batchId) ids.add(data.batchId);
            });
            
            const sortedIds = Array.from(ids).sort((a, b) => b.localeCompare(a));
            setAvailableBatches(sortedIds);
        } catch (e) {
            console.error("Batch fetch failed", e);
            onError("Could not sync batch list from network.");
        } finally {
            setIsLoadingBatches(false);
        }
    };

    fetchBatches();
    return () => unsubProds();
  }, []);

  // AUTOMATIC ANALYSIS TRIGGER
  // Triggers whenever targetBatch or any cost parameter changes
  useEffect(() => {
    if (!targetBatch) {
      setAnalysis(null);
      return;
    }

    const runAnalysis = async () => {
      setIsSyncing(true);
      try {
        // Find output qty from processing/packaging logs for this batch
        // We look at Packaging_logs to find total units/weight produced for this batch ID
        let outputQty = 0;
        
        // Check Packaging Logs first (most accurate finished goods)
        const qPack = query(collection(db, "Packaging_logs"), where("batchId", "==", targetBatch));
        const snapPack = await getDocs(qPack);
        if (!snapPack.empty) {
             snapPack.forEach(doc => outputQty += (doc.data().weight || 0));
        } else {
             // Fallback: Check Harvest Yield (raw)
             const docA = await getDocs(query(collection(db, "harvestYield_A"), where("batchId", "==", targetBatch)));
             if(!docA.empty) outputQty = docA.docs[0].data().totalYield || 0;
             else {
                 const docB = await getDocs(query(collection(db, "harvestYield_B"), where("batchId", "==", targetBatch)));
                 if(!docB.empty) outputQty = docB.docs[0].data().totalYield || 0;
             }
        }

        const month = new Date().toISOString().slice(0, 7); // YYYY-MM
        
        const result = await costingService.calculateFullBatchAnalysis({
          batchId: targetBatch,
          laborHours: parseFloat(laborHours) || 0,
          laborRate: parseFloat(laborRate) || 0,
          packagingCostPerUnit: parseFloat(pkgUnitCost) || 0,
          outputQty: outputQty || 100, // Fallback for simulation if 0
          month
        });

        setAnalysis({ ...result, outputQty: outputQty || 100 });
      } catch (e) {
        console.error("Analysis failed", e);
        onError("Sync failed. Check connection.");
      } finally {
        setIsSyncing(false);
      }
    };

    const timer = setTimeout(() => {
        runAnalysis();
    }, 500); // Debounce

    return () => clearTimeout(timer);
  }, [targetBatch, laborHours, laborRate, pkgUnitCost]);

  const breakdownData = useMemo(() => {
    if (!analysis) return [];
    const total = analysis.totalBatchCost;
    return [
      { name: 'Raw Material', value: analysis.rawMaterialCost, color: 'bg-emerald-500' },
      { name: 'Direct Labor', value: analysis.directLabor, color: 'bg-blue-500' },
      { name: 'Packaging', value: analysis.packagingTotal, color: 'bg-indigo-500' },
      { name: 'Overhead', value: analysis.allocatedOverhead, color: 'bg-slate-400' }
    ].map(item => ({ ...item, percent: total > 0 ? (item.value / total) * 100 : 0 }));
  }, [analysis]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white rounded-[2.5rem] p-10 border border-slate-200 shadow-xl overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full -mr-32 -mt-32 blur-3xl"></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
          <div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Costing Analysis Module</h2>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">AAIS Automated Processing Ledger &bull; Village C</p>
          </div>
          <div className="flex items-center gap-3">
             {isSyncing && (
                 <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-full border border-indigo-100 animate-pulse">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <span className="text-[10px] font-black uppercase tracking-widest">Recalculating...</span>
                 </div>
             )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Inputs Section */}
          <div className="space-y-6">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Calculation Parameters</h4>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase ml-1 mb-1.5">Batch to Analysis</label>
                <div className="relative">
                    <select 
                        value={targetBatch} 
                        onChange={e => setTargetBatch(e.target.value)} 
                        disabled={isLoadingBatches}
                        className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold shadow-inner focus:ring-2 focus:ring-indigo-500 appearance-none disabled:opacity-50"
                    >
                        <option value="">{isLoadingBatches ? 'Syncing Network...' : '-- Choose Sold Batch --'}</option>
                        {availableBatches.map(id => (
                            <option key={id} value={id}>{id}</option>
                        ))}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase ml-1 mb-1.5">Labor Hours</label>
                  <input type="number" value={laborHours} onChange={e => setLaborHours(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold shadow-inner focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase ml-1 mb-1.5">Labor RM/Hr</label>
                  <input type="number" value={laborRate} onChange={e => setLaborRate(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold shadow-inner focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase ml-1 mb-1.5">Pkg Cost / Unit</label>
                <input type="number" step="0.01" value={pkgUnitCost} onChange={e => setPkgUnitCost(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold shadow-inner focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>

            {analysis && (
              <div className="p-8 bg-slate-900 rounded-3xl text-white shadow-2xl animate-fade-in-up mt-8">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Consolidated Analysis</p>
                <div className="space-y-6">
                  <div>
                    <div className="text-[10px] text-emerald-400 font-black uppercase">Total Batch Cost</div>
                    <div className="text-4xl font-black tracking-tight">RM{analysis.totalBatchCost.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-indigo-400 font-black uppercase">Weighted Unit Cost</div>
                    <div className="text-2xl font-black">RM{analysis.weightedUnitCost.toFixed(2)} <span className="text-xs font-bold text-slate-500">/ kg</span></div>
                  </div>
                  <div className="pt-4 border-t border-white/10">
                     <p className="text-[10px] text-slate-500 font-black uppercase mb-2">Margin Check (vs RM35 Retail)</p>
                     <div className="flex items-center gap-2">
                        <div className="flex-1 bg-white/5 h-2 rounded-full overflow-hidden">
                           <div className="bg-emerald-500 h-full" style={{ width: `${Math.min(100, ((35 - analysis.weightedUnitCost)/35) * 100)}%` }}></div>
                        </div>
                        <span className="text-xs font-black text-emerald-400">{analysis.weightedUnitCost < 35 ? 'Healthy' : 'Deficit'}</span>
                     </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Breakdown / Pie Chart Placeholder */}
          <div className="lg:col-span-2 flex flex-col h-full">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Cost Breakdown (Visual Distribution)</h4>
            {!analysis ? (
              <div className="flex-1 border-2 border-dashed border-slate-200 rounded-[3rem] flex flex-col items-center justify-center text-slate-300 gap-4">
                <div className="p-6 bg-slate-50 rounded-full">
                    <svg className="w-12 h-12 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                </div>
                <p className="font-bold text-sm italic">Select a harvest batch to begin costing calculation</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10 flex-1">
                <div className="flex flex-col justify-center items-center p-6 bg-slate-50 rounded-[3rem]">
                   <div className="relative w-48 h-48 mb-8">
                      {/* Simple SVG Pie representation */}
                      <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                        <circle cx="18" cy="18" r="16" fill="transparent" stroke="#f1f5f9" strokeWidth="4"></circle>
                        {/* Values accumulated */}
                        <circle cx="18" cy="18" r="16" fill="transparent" stroke="#10b981" strokeWidth="4" strokeDasharray={`${breakdownData[0].percent} 100`} strokeDashoffset="0"></circle>
                        <circle cx="18" cy="18" r="16" fill="transparent" stroke="#3b82f6" strokeWidth="4" strokeDasharray={`${breakdownData[1].percent} 100`} strokeDashoffset={`-${breakdownData[0].percent}`}></circle>
                        <circle cx="18" cy="18" r="16" fill="transparent" stroke="#6366f1" strokeWidth="4" strokeDasharray={`${breakdownData[2].percent} 100`} strokeDashoffset={`-${breakdownData[0].percent + breakdownData[1].percent}`}></circle>
                        <circle cx="18" cy="18" r="16" fill="transparent" stroke="#94a3b8" strokeWidth="4" strokeDasharray={`${breakdownData[3].percent} 100`} strokeDashoffset={`-${breakdownData[0].percent + breakdownData[1].percent + breakdownData[2].percent}`}></circle>
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center flex-col">
                        <span className="text-[10px] font-black text-slate-400 uppercase">Input Qty</span>
                        <span className="text-lg font-black text-slate-900">{analysis.outputQty.toFixed(1)}kg</span>
                      </div>
                   </div>
                   <div className="grid grid-cols-2 gap-4 w-full">
                      {breakdownData.map(item => (
                        <div key={item.name} className="flex items-center gap-2">
                           <div className={`w-3 h-3 rounded-sm ${item.color}`}></div>
                           <div className="flex flex-col">
                              <span className="text-[9px] font-black text-slate-400 uppercase">{item.name}</span>
                              <span className="text-xs font-bold text-slate-700">{item.percent.toFixed(1)}%</span>
                           </div>
                        </div>
                      ))}
                   </div>
                </div>

                <div className="space-y-6 flex flex-col justify-center">
                   {breakdownData.map(item => (
                     <div key={item.name} className="space-y-2">
                        <div className="flex justify-between items-end">
                           <span className="text-xs font-black text-slate-900 uppercase">{item.name}</span>
                           <span className="text-xs font-bold text-slate-500">RM {item.value.toFixed(2)}</span>
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                           <div className={`${item.color} h-full`} style={{ width: `${item.percent}%` }}></div>
                        </div>
                     </div>
                   ))}
                   
                   <div className="mt-6 p-6 bg-indigo-50 border border-indigo-100 rounded-3xl">
                      <h5 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-3">Profitability Scenario</h5>
                      <div className="space-y-3">
                         <div className="flex justify-between text-xs font-bold">
                            <span className="text-slate-500">Est. Selling Price (kg)</span>
                            <span className="text-slate-900">RM 35.00</span>
                         </div>
                         <div className="flex justify-between text-xs font-bold">
                            <span className="text-slate-500">Net Profit / kg</span>
                            <span className={`font-black ${analysis.weightedUnitCost < 35 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                RM {(35 - analysis.weightedUnitCost).toFixed(2)}
                            </span>
                         </div>
                         <div className="flex justify-between text-xs font-bold pt-2 border-t border-indigo-200">
                            <span className="text-indigo-900 uppercase">Gross Margin %</span>
                            <span className="text-indigo-900 font-black">{((35 - analysis.weightedUnitCost)/35 * 100).toFixed(1)}%</span>
                         </div>
                      </div>
                   </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};