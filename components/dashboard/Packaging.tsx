
import React, { useState, useMemo, useEffect } from 'react';
import { collection, setDoc, doc, updateDoc, getDocs, query, where, limit, addDoc, increment } from '@firebase/firestore';
import { db } from '../../services/firebase';
import { ProcessingLog, VillageType, PackagingLogData, InventoryItem, UserRole } from '../../types';
import { 
  MUSHROOM_VARIETIES, 
  SUPERVISOR_LIST, 
  StaffMultiSelect,
  STORAGE_LOCATIONS
} from './SharedComponents';

interface Props {
    villageId: VillageType;
    userRole: UserRole;
    userEmail: string;
    theme: any;
    processingLogs: ProcessingLog[];
    packagingHistory: PackagingLogData[];
    onRefresh: () => void;
    onSuccess: (msg: string) => void;
    onError?: (msg: string) => void;
}

export const Packaging: React.FC<Props> = ({ 
    villageId, userRole, userEmail, theme, processingLogs, packagingHistory, onRefresh, onSuccess, onError 
}) => {
    const [mainTab, setMainTab] = useState<'Overview' | 'History' | string>('Overview');
    const [gradeTab, setGradeTab] = useState<'A' | 'B' | 'C'>('A');
    const [selectedPackBatches, setSelectedPackBatches] = useState<ProcessingLog[]>([]);

    const isAdmin = userRole === 'admin';

    // Form States
    const [packDate, setPackDate] = useState(new Date().toISOString().split('T')[0]);
    const [packUnits, setPackUnits] = useState('');
    const [packExpiry, setPackExpiry] = useState(new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]);
    const [packLabelCheck, setPackLabelCheck] = useState(false);
    const [packWarehouseTime, setPackWarehouseTime] = useState('');
    const [packOperator, setPackOperator] = useState<string[]>(["Alice Worker"]);
    const [packSupervisor, setPackSupervisor] = useState(SUPERVISOR_LIST[0]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const now = new Date();
        setPackWarehouseTime(now.toTimeString().slice(0, 5));
    }, [selectedPackBatches, mainTab, gradeTab]);

    const stats = useMemo(() => {
        const counts: any = { A: 0, B: 0, C: 0 };
        processingLogs.forEach(l => {
            if (l.currentStep === 6) {
                if (l.packagingStatus?.gradeA === 'PENDING') counts.A += (l.grades?.gradeA || 0);
                if (l.packagingStatus?.gradeB === 'PENDING') counts.B += (l.grades?.gradeB || 0);
                if (l.packagingStatus?.gradeC === 'PENDING') counts.C += (l.grades?.gradeC || 0);
            }
        });
        return counts;
    }, [processingLogs]);

    const getPackTotals = () => {
        return selectedPackBatches.reduce((acc, b) => acc + (b.grades?.[`grade${gradeTab}` as keyof typeof b.grades] || 0), 0);
    };

    const totalAvailableMass = getPackTotals();
    const sizeKg = 0.2; 
    const autoUnitsToPack = Math.floor(totalAvailableMass / sizeKg);
    const weightUsedForPacks = autoUnitsToPack * sizeKg;
    const remainderMass = totalAvailableMass - weightUsedForPacks;

    useEffect(() => {
        if (selectedPackBatches.length > 0) {
            setPackUnits(autoUnitsToPack.toString());
        } else {
            setPackUnits('');
        }
    }, [selectedPackBatches, gradeTab, autoUnitsToPack]);

    const handleExportPackaging = () => {
        if (!isAdmin) return;
        const headers = ["Batch ID", "Variety", "Grade", "Weight (kg)", "Units (200g)", "Operator", "Supervisor", "Packaging Date"];
        const rows = packagingHistory.map(l => [
            l.batchId,
            l.mushroomType,
            l.grade,
            l.weight.toFixed(2),
            l.units,
            l.operator,
            l.supervisor,
            l.packagingDate
        ]);
        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `packaging_history_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const navigateToManage = (log: ProcessingLog, grade: 'A' | 'B' | 'C') => {
        setMainTab(log.mushroomType);
        setGradeTab(grade);
        setSelectedPackBatches([log]); 
    };

    const navigateToGradeSummary = (grade: 'A' | 'B' | 'C') => {
        const firstVarietyWithPending = MUSHROOM_VARIETIES.find(v => 
            processingLogs.some(l => l.currentStep === 6 && l.mushroomType === v && l.packagingStatus?.[`grade${grade}` as any] === 'PENDING')
        );
        setMainTab(firstVarietyWithPending || MUSHROOM_VARIETIES[0]);
        setGradeTab(grade);
        setSelectedPackBatches([]);
    };

    const updateInventoryStock = async (variety: string, grade: string, weightAdded: number) => {
        let targetId = `INV-${variety}-${grade}-${villageId}`;
        try {
            const q = query(
                collection(db, "inventory_items"), 
                where("villageId", "==", villageId),
                where("mushroomType", "==", variety),
                where("grade", "==", grade),
                limit(1)
            );
            const snap = await getDocs(q);
            
            if (!snap.empty) {
                const itemDoc = snap.docs[0];
                targetId = itemDoc.id; // Use existing ID if found via query
                const currentData = itemDoc.data() as InventoryItem;
                await updateDoc(doc(db, "inventory_items", itemDoc.id), {
                    currentStock: currentData.currentStock + weightAdded,
                    lastUpdated: new Date().toISOString()
                });
            } else {
                const newItem: Omit<InventoryItem, 'id'> = {
                    batchNumber: `BAT-${Date.now().toString().slice(-4)}`,
                    mushroomType: variety,
                    grade,
                    unit: 'kg',
                    currentStock: weightAdded,
                    minThreshold: 20,
                    maxThreshold: 500,
                    harvestDate: new Date().toISOString(),
                    expiryDate: packExpiry, // Initial expiry for the inventory record
                    warehouseLocation: STORAGE_LOCATIONS[0],
                    storageTemperature: "2-4°C",
                    villageId,
                    lastUpdated: new Date().toISOString()
                };
                await setDoc(doc(db, "inventory_items", targetId), newItem);
            }
        } catch (err) {
            console.error("Inventory update failed:", err);
        }
        return targetId;
    };

    const handlePackagingSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedPackBatches.length === 0 || !packUnits || !packLabelCheck) return alert("Complete all fields and label check.");
        
        const unitsToProduce = parseInt(packUnits);
        const massNeeded = unitsToProduce * sizeKg;
        
        if (massNeeded > totalAvailableMass + 0.001) return alert("Insufficient mass selected.");

        setIsSubmitting(true);
        try {
            const sorted = [...selectedPackBatches].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            let weightToDeduct = massNeeded;

            const targetInventoryId = await updateInventoryStock(mainTab, gradeTab, massNeeded);

            // Update Product Stock in products_VillageC (Sync with Sales Hub)
            const productId = `VC-PROD-${mainTab.replace(/\s/g, '')}-${gradeTab}`;
            try {
                // Update stock directly. Assuming document exists (created by SalesTab seeding).
                await updateDoc(doc(db, "products_VillageC", productId), {
                    stock: increment(unitsToProduce)
                });
            } catch (err) {
                console.warn(`Could not update sales product stock for ${productId} (might not exist yet):`, err);
            }

            // Record STOCK IN movement
            await addDoc(collection(db, "stock_movements"), {
                batchId: selectedPackBatches.length === 1 ? selectedPackBatches[0].batchId : `CONSOL-${gradeTab}`,
                type: 'IN',
                quantity: massNeeded,
                date: new Date().toISOString(),
                referenceId: `PKG-${Date.now()}`,
                performedBy: userEmail,
                villageId,
                mushroomType: mainTab,
                grade: gradeTab
            } as any);

            for (const batch of sorted) {
                if (weightToDeduct <= 0) break;

                const batchAvail = batch.grades?.[`grade${gradeTab}` as keyof typeof batch.grades] || 0;
                const deduct = Math.min(batchAvail, weightToDeduct);
                const leftInBatch = batchAvail - deduct;
                weightToDeduct -= deduct;

                if (deduct > 0) {
                    const batchPortionUnits = Math.round((deduct / massNeeded) * unitsToProduce);
                    const newLog: Omit<PackagingLogData, 'id'> = {
                        batchId: batch.batchId, 
                        mushroomType: batch.mushroomType, 
                        packagingDate: packDate, 
                        grade: gradeTab,
                        weight: deduct, 
                        units: batchPortionUnits, 
                        packSize: '200g', 
                        remainingWeight: leftInBatch,
                        expiryDate: packExpiry, 
                        labelChecked: true, 
                        movedToWarehouseAt: packWarehouseTime,
                        operator: packOperator.join(', '), 
                        supervisor: packSupervisor, 
                        timestamp: new Date().toISOString()
                    };
                    
                    const docId = `${batch.batchId}-${gradeTab}`;
                    await setDoc(doc(db, "Packaging_logs", docId), { ...newLog, villageId, recordedBy: userEmail });

                    // Link packaging log to inventory collection with expiry date
                    await setDoc(doc(db, "inventory_items", targetInventoryId, "packaging_history", docId), {
                        packagingLogId: docId,
                        batchId: batch.batchId,
                        units: batchPortionUnits,
                        weightUsed: deduct,
                        timestamp: new Date().toISOString(),
                        operator: packOperator.join(', '),
                        expiryDate: packExpiry
                    });
                }

                const updatedStatus: any = { ...batch.packagingStatus, [`grade${gradeTab}`]: leftInBatch <= 0.001 ? 'COMPLETED' : 'PENDING' };
                const allStepsDone = Object.values(updatedStatus).every(s => s === 'COMPLETED' || s === 'SKIPPED');

                if (leftInBatch <= 0.001) {
                    await updateDoc(doc(db, "processing_logs", batch.id), { 
                        grades: { ...batch.grades, [`grade${gradeTab}`]: 0 },
                        packagingStatus: updatedStatus, 
                        ...(allStepsDone ? { currentStep: 7, status: 'COMPLETED' } : {}) 
                    });
                } else {
                    await updateDoc(doc(db, "processing_logs", batch.id), { 
                        grades: { ...batch.grades, [`grade${gradeTab}`]: 0 },
                        packagingStatus: { ...updatedStatus, [`grade${gradeTab}`]: 'COMPLETED' }, 
                        currentStep: 7, status: 'COMPLETED' 
                    });
                    
                    const remData = { 
                        ...batch, 
                        batchId: `${batch.batchId}-REM`, 
                        status: 'READY_FOR_PACKAGING', 
                        currentStep: 6, 
                        packagingStatus: { ...updatedStatus, [`grade${gradeTab}`]: 'PENDING' }, 
                        grades: { ...batch.grades, [`grade${gradeTab}`]: leftInBatch }, 
                        timestamp: new Date().toISOString() 
                    };
                    delete (remData as any).id;
                    await setDoc(doc(db, "processing_logs", `${batch.batchId}-REM`), remData);
                }
            }

            onSuccess(`Packaging completed for ${mainTab} Grade ${gradeTab}. ${packUnits} units added to inventory.`);
            onRefresh(); setSelectedPackBatches([]); setPackUnits(''); setPackLabelCheck(false);
        } catch (err: any) { 
            console.error(err);
            if (onError) onError(err.message || "Failed to execute packaging.");
        } finally { setIsSubmitting(false); }
    };

    const handleToggleBatch = (batch: ProcessingLog) => {
        setSelectedPackBatches(prev => prev.some(b => b.id === batch.id) ? prev.filter(b => b.id !== batch.id) : [...prev, batch]);
    };

    const getGradePendingCount = (variety: string, grade: string) => processingLogs.filter(l => l.currentStep === 6 && l.mushroomType === variety && l.packagingStatus?.[`grade${grade}` as any] === 'PENDING').length;
    const getVarietyPendingCount = (v: string) => processingLogs.filter(l => l.currentStep === 6 && l.mushroomType === v).length;

    const sortedPackagingQueue = useMemo(() => {
        return [...processingLogs]
            .filter(l => l.currentStep === 6)
            .sort((a, b) => new Date(a.packagingDueTime).getTime() - new Date(b.packagingDueTime).getTime());
    }, [processingLogs]);

    return (
        <div className="space-y-6">
            <div className="flex border-b border-gray-200 mb-6 overflow-x-auto scrollbar-hide">
                {['Overview', 'History', ...MUSHROOM_VARIETIES]
                    .filter(tab => tab !== 'History' || isAdmin)
                    .map(tab => {
                    const count = (tab !== 'Overview' && tab !== 'History') ? getVarietyPendingCount(tab) : 0;
                    return (
                        <button key={tab} onClick={() => { setMainTab(tab); setSelectedPackBatches([]); }} className={`px-6 py-3 text-sm font-bold uppercase border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${mainTab === tab ? `border-blue-500 text-blue-600` : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                            {tab} {count > 0 && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-[10px]">{count}</span>}
                        </button>
                    );
                })}
            </div>

            {mainTab === 'Overview' ? (
                <div className="space-y-8 animate-fade-in-up">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {['A', 'B', 'C'].map(g => (
                            <button 
                                key={g} 
                                onClick={() => navigateToGradeSummary(g as any)}
                                className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm text-center hover:border-blue-400 hover:shadow-md transition-all group"
                            >
                                <div className="text-gray-400 text-[10px] font-bold uppercase mb-2 tracking-widest group-hover:text-blue-500">Grade {g} Total Pending</div>
                                <div className="text-4xl font-black text-blue-600">{stats[g].toFixed(2)}kg</div>
                            </button>
                        ))}
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
                            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-tight">Active Packaging Queue</h3>
                        </div>
                        <div className="max-h-[500px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200">
                            <table className="min-w-full divide-y divide-gray-200 text-xs">
                                <thead className="bg-gray-50 text-gray-400 font-bold uppercase sticky top-0 bg-white z-10">
                                    <tr>
                                        <th className="px-6 py-4 text-left">Batch ID</th>
                                        <th className="px-6 py-4 text-left">Variety</th>
                                        <th className="px-6 py-4 text-center">Grade A (kg)</th>
                                        <th className="px-6 py-4 text-center">Grade B (kg)</th>
                                        <th className="px-6 py-4 text-center">Grade C (kg)</th>
                                        <th className="px-6 py-4 text-center">Due Date & Time</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {sortedPackagingQueue.map(log => (
                                        <tr key={log.id} className="hover:bg-blue-50/30 transition-colors">
                                            <td className="px-6 py-4">
                                                <button onClick={() => navigateToManage(log, 'A')} className="font-mono font-bold text-blue-600 hover:underline hover:text-blue-800">
                                                    {log.batchId}
                                                </button>
                                            </td>
                                            <td className="px-6 py-4 font-bold text-gray-700">{log.mushroomType}</td>
                                            {['A', 'B', 'C'].map(g => {
                                                const status = log.packagingStatus?.[`grade${g}` as any];
                                                const weight = log.grades?.[`grade${g}` as any] || 0;
                                                return (
                                                    <td key={g} className="px-6 py-4 text-center">
                                                        {status === 'PENDING' ? (
                                                            <button 
                                                                onClick={() => navigateToManage(log, g as any)} 
                                                                className="text-blue-700 font-black hover:underline"
                                                                title={`Manage Grade ${g}`}
                                                            >
                                                                {weight.toFixed(2)}
                                                            </button>
                                                        ) : <span className="text-gray-300 italic text-[10px] uppercase">{status === 'SKIPPED' ? 'Deleted' : 'Done'}</span>}
                                                    </td>
                                                );
                                            })}
                                            <td className="px-6 py-4 text-center">
                                                <span className={`px-2 py-1 rounded font-black whitespace-nowrap ${new Date(log.packagingDueTime) < new Date() ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-700'}`}>
                                                    {new Date(log.packagingDueTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' })}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {sortedPackagingQueue.length === 0 && (
                                        <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-300 italic">No batches waiting in the packaging queue.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ) : (mainTab === 'History' && isAdmin) ? (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-fade-in">
                    <div className="p-6 border-b flex justify-between items-center bg-gray-50/50">
                        <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">Finished Goods Packaging Ledger</h3>
                        <button 
                            onClick={handleExportPackaging}
                            className="bg-white border border-slate-200 px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-slate-50 transition-all flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            Export to Excel
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm text-left">
                            <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                <tr>
                                    <th className="px-6 py-4">Batch Ref</th>
                                    <th className="px-6 py-4">Product Variety</th>
                                    <th className="px-6 py-4 text-center">Grade</th>
                                    <th className="px-6 py-4 text-right">Mass Used</th>
                                    <th className="px-6 py-4 text-right">Units Output</th>
                                    <th className="px-6 py-4">Operator</th>
                                    <th className="px-6 py-4">Supervisor</th>
                                    <th className="px-6 py-4">Pack Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {packagingHistory.map(l => (
                                    <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4"><span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded font-mono text-[10px] font-bold">{l.batchId}</span></td>
                                        <td className="px-6 py-4 font-bold text-gray-700">{l.mushroomType}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="bg-slate-900 text-white px-2 py-0.5 rounded text-[10px] font-black">Grade {l.grade}</span>
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono font-bold text-gray-500">{l.weight.toFixed(2)} kg</td>
                                        <td className="px-6 py-4 text-right font-black text-indigo-600">{l.units} <span className="text-[10px] text-slate-400 font-normal">Packs</span></td>
                                        <td className="px-6 py-4 text-gray-500 text-[11px] font-medium">{l.operator}</td>
                                        <td className="px-6 py-4 text-gray-500 text-[11px] font-medium">{l.supervisor}</td>
                                        <td className="px-6 py-4 font-mono text-[11px] text-gray-400">{l.packagingDate}</td>
                                    </tr>
                                ))}
                                {packagingHistory.length === 0 && (
                                    <tr><td colSpan={8} className="px-6 py-20 text-center text-gray-300 italic">No packaging records available.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="grid md:grid-cols-3 gap-8 animate-fade-in-up">
                    <div className="col-span-1 border-r pr-6 space-y-4">
                        <div className="flex bg-gray-100 p-1 rounded-lg shadow-inner">
                            {['A','B','C'].map(g => {
                                const count = getGradePendingCount(mainTab, g);
                                return (
                                    <button key={g} onClick={()=>{setGradeTab(g as any); setSelectedPackBatches([]);}} className={`flex-1 py-1.5 rounded text-xs font-bold transition-all ${gradeTab===g?'bg-white text-blue-600 shadow-sm':'text-gray-400 hover:text-gray-600'}`}>
                                        Grade {g} {count > 0 ? `(${count})` : ''}
                                    </button>
                                );
                            })}
                        </div>
                        
                        <div className="flex justify-between items-center px-1">
                            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Select Batches to Pack</h3>
                            <button onClick={() => setSelectedPackBatches(processingLogs.filter(l => l.currentStep === 6 && l.mushroomType === mainTab && l.packagingStatus?.[`grade${gradeTab}` as keyof typeof l.packagingStatus] === 'PENDING'))} className="text-[10px] font-bold text-blue-600 hover:underline">Select All</button>
                        </div>

                        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-200">
                            {processingLogs.filter(l => l.currentStep === 6 && l.mushroomType === mainTab && l.packagingStatus?.[`grade${gradeTab}` as keyof typeof l.packagingStatus] === 'PENDING')
                                .sort((a, b) => new Date(a.packagingDueTime).getTime() - new Date(b.packagingDueTime).getTime())
                                .map(l => (
                                <div key={l.id} onClick={()=>handleToggleBatch(l)} className={`p-4 rounded-xl border cursor-pointer transition-all relative overflow-hidden ${selectedPackBatches.some(b=>b.id===l.id) ? 'bg-blue-50 border-blue-500 shadow-md ring-2 ring-blue-100' : 'bg-white border-gray-100 hover:border-blue-200'}`}>
                                    {selectedPackBatches.some(b=>b.id===l.id) && <div className="absolute top-0 right-0 bg-blue-500 text-white text-[8px] px-2 py-0.5 rounded-bl-lg font-black uppercase">Selected</div>}
                                    <div className="font-bold text-sm text-gray-800">{l.batchId}</div>
                                    <div className="flex justify-between items-center mt-1">
                                        <div className="text-[10px] text-gray-500 font-bold uppercase">Mass</div>
                                        <div className="text-xs font-black text-blue-600">{(l.grades?.[`grade${gradeTab}` as keyof typeof l.grades] || 0).toFixed(2)}kg</div>
                                    </div>
                                    <div className={`text-[9px] font-bold mt-1 ${new Date(l.packagingDueTime) < new Date() ? 'text-red-500' : 'text-gray-400'}`}>
                                        Due: {new Date(l.packagingDueTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="col-span-2">
                        {selectedPackBatches.length > 0 ? (
                            <form onSubmit={handlePackagingSubmit} className="bg-white p-8 rounded-2xl border shadow-xl space-y-8 relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-400 to-blue-600"></div>
                                
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="text-2xl font-black uppercase text-gray-800 tracking-tight">{mainTab} Consolidation</h3>
                                        <p className="text-xs text-gray-400 font-bold uppercase">Grade {gradeTab} Output • <span className="text-blue-600">200g Fixed Weight</span></p>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-4xl font-black text-blue-600">{totalAvailableMass.toFixed(2)}kg</div>
                                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Pooled Mass</div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100 text-center">
                                        <div className="text-[10px] font-bold text-blue-400 uppercase mb-2 tracking-widest">Total Units Packaged</div>
                                        <input type="number" value={packUnits} onChange={e=>setPackUnits(e.target.value)} className="w-full text-5xl font-black text-blue-700 bg-transparent text-center focus:outline-none" required />
                                        <div className="text-[10px] text-blue-400 mt-1 font-bold italic">Consuming {weightUsedForPacks.toFixed(2)}kg of mass</div>
                                    </div>
                                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 text-center">
                                        <div className="text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-widest">Total Remaining Unit Mass</div>
                                        <div className="text-5xl font-black text-slate-700">{remainderMass.toFixed(2)}<span className="text-lg">kg</span></div>
                                        <div className="text-[10px] text-slate-400 mt-1 font-bold italic">Returning to queue as REM batch</div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Packaging Date</label>
                                        <input type="date" value={packDate} onChange={e=>setPackDate(e.target.value)} className="w-full p-2.5 border rounded-xl bg-gray-50 font-medium" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Expiry Date</label>
                                        <input type="date" value={packExpiry} onChange={e=>setPackExpiry(e.target.value)} className="w-full p-2.5 border rounded-xl bg-gray-50 font-medium" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 leading-tight">Time Shipped to Warehouse</label>
                                        <input type="time" value={packWarehouseTime} onChange={e=>setPackWarehouseTime(e.target.value)} className="w-full p-2.5 border rounded-xl bg-gray-50 font-mono" />
                                    </div>
                                </div>

                                <div className="p-5 bg-yellow-50 rounded-2xl border border-yellow-100">
                                    <label className="flex items-center gap-4 cursor-pointer">
                                        <input type="checkbox" checked={packLabelCheck} onChange={e=>setPackLabelCheck(e.target.checked)} className="w-6 h-6 rounded text-yellow-600 border-yellow-300 focus:ring-yellow-500" />
                                        <span className="font-bold text-sm text-gray-700 leading-tight italic">I verify all labels, barcodes, and weights (200g) are correct for Grade {gradeTab}.</span>
                                    </label>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <StaffMultiSelect selected={packOperator} onChange={setPackOperator} label="Operators Authorized" />
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">On-Site Supervisor</label>
                                        <select value={packSupervisor} onChange={e=>setPackSupervisor(e.target.value)} className="w-full p-2.5 border rounded-xl bg-white font-bold text-gray-700">
                                            {SUPERVISOR_LIST.map(s=><option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <button type="submit" disabled={isSubmitting} className={`w-full py-5 rounded-2xl font-black uppercase text-white shadow-xl transform transition hover:-translate-y-0.5 active:scale-95 flex items-center justify-center gap-3 ${theme.button} ${isSubmitting ? 'opacity-50' : ''}`}>
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                    Execute Packaging Output ({packUnits} packs)
                                </button>
                            </form>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-gray-300 border-2 border-dashed border-gray-100 rounded-3xl py-24 text-center">
                                <svg className="w-16 h-16 mb-4 opacity-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                                <p className="italic text-sm font-medium">Select batches from the left or click an Overview Grade card to begin consolidation.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
