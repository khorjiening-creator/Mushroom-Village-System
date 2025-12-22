import React, { useState, useEffect } from 'react';
import { collection, addDoc, doc, updateDoc, onSnapshot, query, where } from '@firebase/firestore';
import { db } from '../../services/firebase';
import { ProcessingLog, VillageType, DisposalEntry } from '../../types';
import { 
  MUSHROOM_VARIETIES, 
  SUPERVISOR_LIST, 
  DISPOSAL_METHODS, 
  StaffMultiSelect 
} from './SharedComponents';

interface Props {
    villageId: VillageType;
    userEmail: string;
    theme: any;
    processingLogs: ProcessingLog[];
    onRefresh: () => void;
    handleDeleteLog: (coll: string, id: string, e?: any) => void;
    handleClearQueue: () => void;
}

const STEP_LABELS: Record<number, string> = {
    2: "QC",
    3: "Grading",
    4: "Reject",
    5: "Clean",
    6: "Ready"
};

export const ProcessingFloor: React.FC<Props> = ({ 
    villageId, userEmail, theme, processingLogs, onRefresh, handleDeleteLog, handleClearQueue 
}) => {
    const [subTab, setSubTab] = useState<'intake' | 'qc' | 'grading' | 'rejection' | 'cleaning'>('intake');
    const [selectedBatch, setSelectedBatch] = useState<ProcessingLog | null>(null);

    // Pending Shipments Logic
    const [pendingShipments, setPendingShipments] = useState<any[]>([]);
    const [selectedShipmentId, setSelectedShipmentId] = useState<string | null>(null);

    // Intake States
    const [intakeDate, setIntakeDate] = useState(new Date().toISOString().split('T')[0]);
    const [intakeTime, setIntakeTime] = useState(new Date().toTimeString().slice(0, 5));
    const [intakeSource, setIntakeSource] = useState('Village A');
    const [intakeVariety, setIntakeVariety] = useState(MUSHROOM_VARIETIES[0]);
    const [intakeStatedQty, setIntakeStatedQty] = useState('');
    const [intakeActualQty, setIntakeActualQty] = useState('');
    const [intakeStaff, setIntakeStaff] = useState<string[]>(["Alice Worker"]);
    const [isIntakeSubmitting, setIsIntakeSubmitting] = useState(false);

    // QC States
    const [qcCriteria, setQcCriteria] = useState({ colour: true, texture: true, odour: true, sizeUniformity: true, noMould: true, moisture: true });
    const [qcVisual, setQcVisual] = useState('');
    const [rejectedQty, setRejectedQty] = useState('0');
    const [qcStaff, setQcStaff] = useState<string[]>(["Alice Worker"]);

    // Grading States
    const [gradeA, setGradeA] = useState('0');
    const [gradeB, setGradeB] = useState('0');
    const [gradeC, setGradeC] = useState('0');
    const [gradingStaff, setGradingStaff] = useState<string[]>(["Alice Worker"]);

    // Rejection States
    const [disposalEntries, setDisposalEntries] = useState<DisposalEntry[]>([]);
    const [currentDisposalMethod, setCurrentDisposalMethod] = useState(DISPOSAL_METHODS[0]);
    const [currentDisposalWeight, setCurrentDisposalWeight] = useState('');
    const [rejectionStaff, setRejectionStaff] = useState<string[]>(["Alice Worker"]);
    const [rejectionSupervisor, setRejectionSupervisor] = useState(SUPERVISOR_LIST[0]);

    // Cleaning States
    const [cleaningStaff, setCleaningStaff] = useState<string[]>(["Alice Worker"]);
    const [isCleaningComplete, setIsCleaningComplete] = useState(false);

    // Fetch Pending Shipments
    useEffect(() => {
        if (villageId === VillageType.C) {
            const q = query(collection(db, "pending_shipments"), where("status", "==", "PENDING"));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const shipments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setPendingShipments(shipments);
            });
            return () => unsubscribe();
        }
    }, [villageId]);

    const getTaskCount = (tab: string) => {
        switch(tab) {
            case 'qc': return processingLogs.filter(l => l.currentStep === 2).length;
            case 'grading': return processingLogs.filter(l => l.currentStep === 3).length;
            case 'rejection': return processingLogs.filter(l => l.currentStep === 4).length;
            case 'cleaning': return processingLogs.filter(l => l.currentStep === 5).length;
            default: return 0;
        }
    };

    const handleSelectShipment = (shipment: any) => {
        setSelectedShipmentId(shipment.id);
        setIntakeSource(shipment.sourceVillage);
        setIntakeVariety(shipment.strain);
        setIntakeStatedQty(shipment.weight.toString());
        setIntakeActualQty(shipment.weight.toString()); // Auto-fill actual with stated initially
        
        // Auto set time if available
        if (shipment.timestamp) {
            const d = new Date(shipment.timestamp);
            setIntakeDate(d.toISOString().split('T')[0]);
            setIntakeTime(d.toTimeString().slice(0, 5));
        }
    };

    const handleIntakeSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsIntakeSubmitting(true);
        try {
            const timestamp = `${intakeDate}T${intakeTime}:00.000`;
            const intakeDateObj = new Date(timestamp);
            
            // Use batch ID from shipment if linked, else generate
            let batchId = `B${villageId === VillageType.A ? 'A' : villageId === VillageType.B ? 'B' : 'C'}-${Date.now().toString().slice(-6)}`;
            
            if (selectedShipmentId) {
                const shipment = pendingShipments.find(s => s.id === selectedShipmentId);
                if (shipment && shipment.batchId) batchId = shipment.batchId;
                
                // Mark shipment as received
                await updateDoc(doc(db, "pending_shipments", selectedShipmentId), {
                    status: 'RECEIVED',
                    receivedAt: new Date().toISOString(),
                    receivedBy: userEmail
                });
            }

            const stated = parseFloat(intakeStatedQty);
            const actual = parseFloat(intakeActualQty);
            
            const packagingDueTime = new Date(intakeDateObj.getTime() + 2 * 3600000).toISOString();

            const newLog: Omit<ProcessingLog, 'id'> = {
                batchId, harvestId: selectedShipmentId || 'MANUAL_ENTRY', sourceVillage: intakeSource, mushroomType: intakeVariety,
                statedWeight: stated, actualWeight: actual, variance: stated - actual,
                receivedBy: intakeStaff.join(', '), intakeTimestamp: intakeDateObj.toISOString(),
                packagingDueTime,
                status: 'IN_PROGRESS', currentStep: 2, villageId, timestamp: intakeDateObj.toISOString(),
                hasImageEvidence: false
            };
            await addDoc(collection(db, "processing_logs"), newLog);
            await addDoc(collection(db, "Intake_logs"), { ...newLog, recordedBy: userEmail });
            
            onRefresh(); 
            setIntakeStatedQty(''); 
            setIntakeActualQty('');
            setSelectedShipmentId(null); // Reset selection
        } catch (err) { console.error(err); } finally { setIsIntakeSubmitting(false); }
    };

    const handleQCSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedBatch) return;
        const total = selectedBatch.actualWeight;
        const rejected = parseFloat(rejectedQty) || 0;
        const accepted = total - rejected;

        try {
            const mainUpdates: Partial<ProcessingLog> = {
                qcVisualNotes: qcVisual, qcCriteria, rejectedWeight: rejected, acceptedWeight: accepted,
                qcStaff: qcStaff.join(', '), qcTimestamp: new Date().toISOString()
            };

            if (accepted <= 0) {
                mainUpdates.currentStep = 4;
            } else if (rejected > 0) {
                mainUpdates.currentStep = 3;
                const rejBatchData = { ...selectedBatch, batchId: `${selectedBatch.batchId}-REJ`, currentStep: 4, status: 'IN_PROGRESS', actualWeight: rejected, statedWeight: rejected, rejectedWeight: 0, acceptedWeight: 0, timestamp: new Date().toISOString() };
                delete (rejBatchData as any).id;
                await addDoc(collection(db, "processing_logs"), rejBatchData);
            } else {
                mainUpdates.currentStep = 3;
            }

            await updateDoc(doc(db, "processing_logs", selectedBatch.id), mainUpdates as any);
            await addDoc(collection(db, "QC_logs"), { batchId: selectedBatch.batchId, mushroomType: selectedBatch.mushroomType, totalInputWeight: total, acceptedWeight: accepted, rejectedWeight: rejected, inspector: qcStaff.join(', '), recordedBy: userEmail, qcTimestamp: new Date().toISOString(), villageId });
            
            onRefresh(); setSelectedBatch(null); setRejectedQty('0'); setQcVisual('');
            if (accepted > 0) setSubTab('grading'); else setSubTab('rejection');
        } catch (err) { console.error(err); }
    };

    const handleRejectAllBatch = async () => {
        if (!selectedBatch) return;
        try {
            const mainUpdates: Partial<ProcessingLog> = {
                qcVisualNotes: qcVisual || "BATCH REJECTED IN FULL", qcCriteria, rejectedWeight: selectedBatch.actualWeight, acceptedWeight: 0,
                qcStaff: qcStaff.join(', '), qcTimestamp: new Date().toISOString(), currentStep: 4, status: 'IN_PROGRESS'
            };
            await updateDoc(doc(db, "processing_logs", selectedBatch.id), mainUpdates as any);
            await addDoc(collection(db, "QC_logs"), { batchId: selectedBatch.batchId, mushroomType: selectedBatch.mushroomType, totalInputWeight: selectedBatch.actualWeight, acceptedWeight: 0, rejectedWeight: selectedBatch.actualWeight, outcome: 'REJECTED', recordedBy: userEmail, villageId, qcTimestamp: new Date().toISOString() });
            onRefresh(); setSelectedBatch(null); setRejectedQty('0'); setSubTab('rejection');
        } catch (err) { console.error(err); }
    };

    const handleReturnToQC = async () => {
        if (!selectedBatch) return;
        try {
            await updateDoc(doc(db, "processing_logs", selectedBatch.id), {
                currentStep: 2,
                rejectedWeight: 0,
                acceptedWeight: 0,
                status: 'IN_PROGRESS'
            });
            onRefresh();
            setSelectedBatch(null);
            setSubTab('qc');
            alert("Batch returned to QC inspection step.");
        } catch (err) { console.error(err); }
    };

    const handleStep3Submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedBatch) return;
        const gA = parseFloat(gradeA), gB = parseFloat(gradeB), gC = parseFloat(gradeC);
        if (Math.abs((gA + gB + gC) - (selectedBatch.acceptedWeight || 0)) > 0.05) return alert("Total graded weight must match accepted weight.");
        
        try {
            const updates: Partial<ProcessingLog> = {
                currentStep: 5, grades: { gradeA: gA, gradeB: gB, gradeC: gC },
                gradingStaff: gradingStaff.join(', '), gradingTimestamp: new Date().toISOString()
            };
            await updateDoc(doc(db, "processing_logs", selectedBatch.id), updates as any);
            await addDoc(collection(db, "Grading_logs"), { batchId: selectedBatch.batchId, mushroomType: selectedBatch.mushroomType, grades: updates.grades, villageId, recordedBy: userEmail, timestamp: new Date().toISOString() });
            onRefresh(); setSelectedBatch(null); setGradeA('0'); setGradeB('0'); setGradeC('0'); setSubTab('cleaning');
        } catch (err) { console.error(err); }
    };

    const handleStep4Submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedBatch) return;
        const totalDisp = disposalEntries.reduce((a, b) => a + b.weight, 0);
        if (Math.abs(totalDisp - selectedBatch.actualWeight) > 0.05) return alert("Total disposal must match waste weight.");
        
        try {
            const updates: Partial<ProcessingLog> = {
                currentStep: 7, status: 'DISPOSED', disposalEntries,
                rejectionStaff: rejectionStaff.join(', '), rejectionSupervisor, rejectionTimestamp: new Date().toISOString()
            };
            await updateDoc(doc(db, "processing_logs", selectedBatch.id), updates as any);
            await addDoc(collection(db, "Rejection_logs"), { batchId: selectedBatch.batchId, disposalEntries, villageId, recordedBy: userEmail, timestamp: new Date().toISOString() });
            onRefresh(); setSelectedBatch(null); setDisposalEntries([]); setSubTab('intake');
        } catch (err) { console.error(err); }
    };

    const handleStep5Submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedBatch || !isCleaningComplete) return alert("Please confirm cleaning completion.");
        try {
            const grades = selectedBatch.grades || { gradeA: 0, gradeB: 0, gradeC: 0 };
            const packagingStatus = {
                gradeA: grades.gradeA > 0 ? 'PENDING' : 'SKIPPED',
                gradeB: grades.gradeB > 0 ? 'PENDING' : 'SKIPPED',
                gradeC: grades.gradeC > 0 ? 'PENDING' : 'SKIPPED',
            };
            
            const currentDueTimeMs = new Date(selectedBatch.packagingDueTime).getTime();
            const newPackagingDueTime = new Date(currentDueTimeMs + 1 * 3600000).toISOString();

            const updates: Partial<ProcessingLog> = {
                currentStep: 6, status: 'READY_FOR_PACKAGING', packagingStatus: packagingStatus as any,
                cleaningStaff: cleaningStaff.join(', '), cleaningTimestamp: new Date().toISOString(),
                packagingDueTime: newPackagingDueTime
            };
            await updateDoc(doc(db, "processing_logs", selectedBatch.id), updates as any);
            await addDoc(collection(db, "Cleaning_logs"), { batchId: selectedBatch.batchId, villageId, recordedBy: userEmail, cleanedTimestamp: new Date().toISOString() });
            onRefresh(); setSelectedBatch(null); setIsCleaningComplete(false); setSubTab('intake');
        } catch (err) { console.error(err); }
    };

    // Derived values for validation
    const currentGradedTotal = parseFloat(gradeA) + parseFloat(gradeB) + parseFloat(gradeC);
    const gradingMismatch = selectedBatch ? Math.abs(currentGradedTotal - (selectedBatch.acceptedWeight || 0)) > 0.05 : false;

    const currentDisposalTotal = disposalEntries.reduce((a, b) => a + b.weight, 0);
    const rejectionMismatch = selectedBatch ? Math.abs(currentDisposalTotal - selectedBatch.actualWeight) > 0.05 : false;

    const qcRejectionRate = selectedBatch && selectedBatch.actualWeight > 0 
        ? (parseFloat(rejectedQty) / selectedBatch.actualWeight) * 100 
        : 0;

    // Filter out READY_FOR_PACKAGING because that is shown in Packaging Tab
    const sortedTrackerLogs = [...processingLogs]
        .filter(l => l.status === 'IN_PROGRESS')
        .sort((a, b) => new Date(a.packagingDueTime).getTime() - new Date(b.packagingDueTime).getTime());

    return (
        <div className="space-y-6">
            <div className="mb-6">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                        Live Processing Tracker (Urgent First)
                    </h3>
                </div>
                <div className="flex overflow-x-auto gap-3 pb-2 scrollbar-thin scrollbar-thumb-gray-200">
                    {sortedTrackerLogs.map(batch => (
                        <div key={batch.id} onClick={() => { setSelectedBatch(batch); setSubTab(batch.currentStep === 2 ? 'qc' : batch.currentStep === 3 ? 'grading' : batch.currentStep === 4 ? 'rejection' : 'cleaning'); }} className="min-w-[180px] bg-white p-3 rounded-xl border border-gray-200 shadow-sm cursor-pointer hover:border-blue-400 relative group transition-all">
                             <div className="flex justify-between text-[9px] font-bold text-gray-400 mb-1">
                                <span>{batch.batchId}</span>
                                <span className="bg-blue-50 text-blue-600 px-1 rounded uppercase">{STEP_LABELS[batch.currentStep] || batch.currentStep}</span>
                             </div>
                             <div className="font-bold text-[11px] truncate mb-1">{batch.mushroomType}</div>
                             <div className="space-y-1 mt-1">
                                <div className="text-[10px] text-blue-600 font-bold">{batch.actualWeight.toFixed(2)}kg</div>
                                <div className={`text-[8px] font-bold px-1 py-0.5 rounded border inline-block ${new Date(batch.packagingDueTime) < new Date() ? 'bg-red-50 text-red-600 border-red-100' : 'bg-gray-50 text-gray-400 border-gray-100'}`}>
                                    Due: {new Date(batch.packagingDueTime).toLocaleString([], {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'})}
                                </div>
                             </div>
                             
                             <button 
                                onClick={(e) => handleDeleteLog("processing_logs", batch.id, e)}
                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Delete Batch"
                             >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                             </button>
                        </div>
                    ))}
                    {sortedTrackerLogs.length === 0 && (
                        <div className="text-[10px] text-gray-400 italic py-4">No active processing tasks</div>
                    )}
                </div>
            </div>

            <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
                {['intake', 'qc', 'grading', 'rejection', 'cleaning'].map(tab => (
                    <button key={tab} onClick={() => { setSubTab(tab as any); setSelectedBatch(null); }} className={`px-5 py-3 text-sm font-bold uppercase border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${subTab === tab ? `border-blue-500 text-blue-600` : 'border-transparent text-gray-400'}`}>
                        {tab} {getTaskCount(tab) > 0 && <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full text-[10px]">{getTaskCount(tab)}</span>}
                    </button>
                ))}
            </div>

            {subTab === 'intake' ? (
                <div className="grid md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                        {/* Pending Shipments Slicer */}
                        {pendingShipments.length > 0 && (
                            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                                <h3 className="text-xs font-bold text-blue-800 uppercase mb-3 tracking-widest flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                                    Pending Inbound Shipments
                                </h3>
                                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-blue-200">
                                    {pendingShipments.map(s => (
                                        <button 
                                            key={s.id} 
                                            onClick={() => handleSelectShipment(s)}
                                            className={`min-w-[140px] p-3 rounded-lg border text-left transition-all ${selectedShipmentId === s.id ? 'bg-white border-blue-500 shadow-md ring-2 ring-blue-200' : 'bg-white border-blue-100 hover:border-blue-300'}`}
                                        >
                                            <div className="text-[10px] font-bold text-gray-500 uppercase">{s.sourceVillage}</div>
                                            <div className="font-black text-sm text-gray-800 mb-1">{s.batchId}</div>
                                            <div className="text-xs font-bold text-blue-600">{s.weight}kg <span className="text-gray-400 font-normal">({s.strain})</span></div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <form onSubmit={handleIntakeSubmit} className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-[10px] font-bold text-gray-400 uppercase">Date</label><input type="date" value={intakeDate} onChange={e=>setIntakeDate(e.target.value)} className="w-full p-2 border rounded" required /></div>
                                <div><label className="block text-[10px] font-bold text-gray-400 uppercase">Time</label><input type="time" value={intakeTime} onChange={e=>setIntakeTime(e.target.value)} className="w-full p-2 border rounded" required /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-[10px] font-bold text-gray-400 uppercase">Source</label><select value={intakeSource} onChange={e=>setIntakeSource(e.target.value)} className="w-full p-2 border rounded bg-white"><option value="Village A">Village A</option><option value="Village B">Village B</option></select></div>
                                <div><label className="block text-[10px] font-bold text-gray-400 uppercase">Variety</label><select value={intakeVariety} onChange={e=>setIntakeVariety(e.target.value)} className="w-full p-2 border rounded bg-white">{MUSHROOM_VARIETIES.map(v=><option key={v} value={v}>{v}</option>)}</select></div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-[10px] font-bold text-gray-400 uppercase">Stated (kg)</label><input type="number" step="0.01" value={intakeStatedQty} onChange={e=>setIntakeStatedQty(e.target.value)} className="w-full p-2 border rounded" required /></div>
                                <div><label className="block text-[10px] font-bold text-gray-400 uppercase">Actual (kg)</label><input type="number" step="0.01" value={intakeActualQty} onChange={e=>setIntakeActualQty(e.target.value)} className="w-full p-2 border rounded" required /></div>
                            </div>
                            <div className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
                                <div className={`text-xs font-bold ${parseFloat(intakeActualQty)-parseFloat(intakeStatedQty) !== 0 ? 'text-orange-600' : 'text-green-600'}`}>
                                    Variance: {(parseFloat(intakeStatedQty)-parseFloat(intakeActualQty)).toFixed(2)} kg
                                </div>
                                <div className="text-[10px] font-bold text-gray-400 uppercase">
                                    Due: {new Date(new Date(`${intakeDate}T${intakeTime}`).getTime() + 2 * 3600000).toLocaleString([], {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'})}
                                </div>
                            </div>
                            <StaffMultiSelect selected={intakeStaff} onChange={setIntakeStaff} label="Receiving Team" />
                            <button type="submit" disabled={isIntakeSubmitting} className={`w-full py-3 rounded-lg font-bold ${theme.button}`}>
                                {selectedShipmentId ? 'Receive & Log Shipment' : 'Log Manual Intake'}
                            </button>
                        </form>
                    </div>
                    <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                        <h3 className="text-xs font-bold text-gray-400 uppercase mb-4 tracking-widest">Recent Activities</h3>
                        <div className="space-y-2">
                            {processingLogs.slice(0, 8).map(l => (
                                <div key={l.id} className="bg-white p-3 rounded border border-gray-200 flex justify-between items-center text-sm shadow-sm hover:border-blue-300">
                                    <div><div className="font-bold text-gray-700">{l.batchId}</div><div className="text-[10px] text-gray-400">{l.mushroomType} • {STEP_LABELS[l.currentStep] || l.currentStep}</div></div>
                                    <div className="text-right">
                                        <div className="font-mono font-bold text-blue-600">{l.actualWeight}kg</div>
                                        <div className="text-[9px] text-gray-400">Due: {new Date(l.packagingDueTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid md:grid-cols-3 gap-8">
                    <div className="col-span-1 border-r pr-6 space-y-3">
                         <h3 className="text-[10px] font-bold text-gray-400 uppercase">Pending Tasks (Urgent First)</h3>
                         {[...processingLogs]
                            .filter(l => l.currentStep === (subTab === 'qc' ? 2 : subTab === 'grading' ? 3 : subTab === 'rejection' ? 4 : 5))
                            .sort((a, b) => new Date(a.packagingDueTime).getTime() - new Date(b.packagingDueTime).getTime())
                            .map(l => (
                             <div key={l.id} onClick={() => setSelectedBatch(l)} className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedBatch?.id === l.id ? 'bg-blue-50 border-blue-400 shadow-md ring-2 ring-blue-100' : 'bg-white border-gray-100 hover:border-blue-200'}`}>
                                <div className="font-bold text-sm">{l.batchId}</div>
                                <div className="text-[10px] text-gray-400 font-bold uppercase">{l.mushroomType} • {l.actualWeight}kg</div>
                                <div className={`text-[9px] mt-1 font-bold ${new Date(l.packagingDueTime) < new Date() ? 'text-red-500' : 'text-gray-400 italic'}`}>
                                    Due: {new Date(l.packagingDueTime).toLocaleString([], {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'})}
                                </div>
                             </div>
                         ))}
                    </div>
                    <div className="col-span-2">
                        {selectedBatch ? (
                            <div className="animate-fade-in-up">
                                {subTab === 'qc' && (
                                    <form onSubmit={handleQCSubmit} className="space-y-6 bg-white p-6 rounded-xl border shadow-sm">
                                        <h3 className="font-bold text-lg border-b pb-4">QC: {selectedBatch.batchId} ({selectedBatch.actualWeight}kg)</h3>
                                        <div className="grid grid-cols-2 gap-3">
                                            {Object.entries(qcCriteria).map(([k,v])=>(
                                                <label key={k} className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-gray-50"><input type="checkbox" checked={v} onChange={e=>setQcCriteria({...qcCriteria, [k]: e.target.checked})} className="w-4 h-4 rounded text-blue-600" /><span className="text-xs capitalize">{k.replace(/([A-Z])/g, ' $1')}</span></label>
                                            ))}
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-[10px] font-bold text-gray-400 uppercase">Rejected Weight (kg)</label>
                                                <input type="number" step="0.01" value={rejectedQty} onChange={e=>setRejectedQty(e.target.value)} className="w-full p-2 border rounded font-bold text-red-600" />
                                                <div className="mt-1 flex justify-between items-center px-1">
                                                    <div className={`text-[10px] font-black uppercase ${qcRejectionRate > 20 ? 'text-red-600 animate-pulse' : 'text-gray-400'}`}>
                                                        {qcRejectionRate > 20 ? '⚠️ High ' : ''}Rejection Rate: {qcRejectionRate.toFixed(1)}%
                                                    </div>
                                                </div>
                                            </div>
                                            <div><label className="block text-[10px] font-bold text-gray-400 uppercase">Visual Notes</label><input type="text" value={qcVisual} onChange={e=>setQcVisual(e.target.value)} className="w-full p-2 border rounded" placeholder="e.g. bruising" /></div>
                                        </div>
                                        <StaffMultiSelect selected={qcStaff} onChange={setQcStaff} label="Inspector" />
                                        <div className="grid grid-cols-2 gap-4">
                                            <button type="button" onClick={handleRejectAllBatch} className="py-3 rounded-lg font-bold bg-red-50 text-red-700 border border-red-200">Reject Full Batch</button>
                                            <button type="submit" className={`py-3 rounded-lg font-bold ${theme.button}`}>Complete QC</button>
                                        </div>
                                    </form>
                                )}
                                {subTab === 'grading' && (
                                    <form onSubmit={handleStep3Submit} className="space-y-6 bg-white p-6 rounded-xl border shadow-sm">
                                        <div className="flex justify-between items-center border-b pb-4">
                                            <h3 className="font-bold text-lg">Grading: {selectedBatch.batchId}</h3>
                                            <div className="text-sm font-black bg-green-50 text-green-700 px-3 py-1 rounded-full border border-green-100">
                                                Mushroom Accepted: {selectedBatch.acceptedWeight?.toFixed(2)}kg
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 gap-4">
                                            {['A','B','C'].map(g=>(
                                                <div key={g}><label className="block text-[10px] font-bold text-gray-400 uppercase">Grade {g} (kg)</label><input type="number" step="0.01" value={g==='A'?gradeA:g==='B'?gradeB:gradeC} onChange={e=>g==='A'?setGradeA(e.target.value):g==='B'?setGradeB(e.target.value):setGradeC(e.target.value)} className="w-full p-2 border rounded font-bold" /></div>
                                            ))}
                                        </div>
                                        
                                        {gradingMismatch ? (
                                            <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-[11px] font-bold flex items-center gap-2 animate-bounce">
                                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                                                Weight Mismatch: {currentGradedTotal.toFixed(2)}kg graded vs {selectedBatch.acceptedWeight?.toFixed(2)}kg accepted
                                            </div>
                                        ) : (
                                            <div className="p-3 rounded-lg bg-green-50 border border-green-100 text-green-600 text-[11px] font-bold flex items-center gap-2">
                                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                                                Weights match accepted total ({currentGradedTotal.toFixed(2)}kg)
                                            </div>
                                        )}

                                        <StaffMultiSelect selected={gradingStaff} onChange={setGradingStaff} label="Grading Team" />
                                        <button type="submit" className={`w-full py-3 rounded-lg font-bold ${theme.button}`}>Finish Grading</button>
                                    </form>
                                )}
                                {subTab === 'rejection' && (
                                    <form onSubmit={handleStep4Submit} className="space-y-6 bg-white p-6 rounded-xl border shadow-sm">
                                        <div className="flex justify-between items-center border-b pb-4">
                                            <h3 className="font-bold text-lg text-red-700">Disposal Run: {selectedBatch.batchId}</h3>
                                            <button type="button" onClick={handleReturnToQC} className="text-[10px] font-bold text-blue-600 hover:underline uppercase flex items-center gap-1">
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                                                Return back to QC
                                            </button>
                                        </div>
                                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                            <div className="flex gap-4 items-end mb-4">
                                                <div className="flex-1"><label className="block text-[10px] font-bold text-gray-400 uppercase">Method</label><select value={currentDisposalMethod} onChange={e=>setCurrentDisposalMethod(e.target.value)} className="w-full p-2 border rounded bg-white text-sm font-bold">{DISPOSAL_METHODS.map(m=><option key={m} value={m}>{m}</option>)}</select></div>
                                                <div className="w-24"><label className="block text-[10px] font-bold text-gray-400 uppercase">Weight</label><input type="number" value={currentDisposalWeight} onChange={e=>setCurrentDisposalWeight(e.target.value)} className="w-full p-2 border rounded" placeholder="kg" /></div>
                                                <button type="button" onClick={() => { if(parseFloat(currentDisposalWeight)>0) { setDisposalEntries([...disposalEntries, {method: currentDisposalMethod, weight: parseFloat(currentDisposalWeight)}]); setCurrentDisposalWeight(''); } }} className="bg-slate-800 text-white px-4 py-2 rounded text-xs font-bold shadow">ADD</button>
                                            </div>

                                            {rejectionMismatch ? (
                                                <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-[11px] font-bold flex items-center gap-2 animate-bounce">
                                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                                                    Waste Mismatch: {currentDisposalTotal.toFixed(2)}kg entries vs {selectedBatch.actualWeight.toFixed(2)}kg waste total
                                                </div>
                                            ) : (
                                                <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-100 text-green-600 text-[11px] font-bold flex items-center gap-2">
                                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                                                    Weights match waste total ({currentDisposalTotal.toFixed(2)}kg)
                                                </div>
                                            )}

                                            <div className="space-y-1">
                                                {disposalEntries.map((e,i) => (
                                                    <div key={i} className="flex justify-between items-center text-xs bg-white p-2 rounded border shadow-sm">
                                                        <span>{e.method}</span><span className="font-bold text-red-600">{e.weight}kg</span>
                                                        <button type="button" onClick={()=>setDisposalEntries(disposalEntries.filter((_,idx)=>idx!==i))} className="text-red-500 font-bold px-1">×</button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <StaffMultiSelect selected={rejectionStaff} onChange={setRejectionStaff} label="Staff Authorized" />
                                        <StaffMultiSelect selected={[rejectionSupervisor]} onChange={(s) => setRejectionSupervisor(s[0] || SUPERVISOR_LIST[0])} label="Supervisor" />
                                        <button type="submit" className="w-full py-3 rounded-lg font-bold bg-red-600 text-white hover:bg-red-700 shadow-lg">Confirm Disposal Run</button>
                                    </form>
                                )}
                                {subTab === 'cleaning' && (
                                    <form onSubmit={handleStep5Submit} className="space-y-6 bg-white p-6 rounded-xl border shadow-sm">
                                        <div className="flex justify-between items-center border-b pb-4">
                                            <h3 className="font-bold text-lg">Cleaning: {selectedBatch.batchId}</h3>
                                            <div className="text-sm font-black bg-green-50 text-green-700 px-3 py-1 rounded-full border border-green-100">
                                                Mushroom Accepted: {selectedBatch.acceptedWeight?.toFixed(2)}kg
                                            </div>
                                        </div>
                                        
                                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                            <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-3 tracking-widest">Grading Results Breakdown</h4>
                                            <div className="grid grid-cols-3 gap-3">
                                                <div className="bg-white p-3 rounded-lg border border-gray-100 text-center shadow-sm">
                                                    <div className="text-[9px] font-bold text-gray-400 uppercase">Grade A</div>
                                                    <div className="text-sm font-black text-green-600">{(selectedBatch.grades?.gradeA || 0).toFixed(2)}kg</div>
                                                </div>
                                                <div className="bg-white p-3 rounded-lg border border-gray-100 text-center shadow-sm">
                                                    <div className="text-[9px] font-bold text-gray-400 uppercase">Grade B</div>
                                                    <div className="text-sm font-black text-blue-600">{(selectedBatch.grades?.gradeB || 0).toFixed(2)}kg</div>
                                                </div>
                                                <div className="bg-white p-3 rounded-lg border border-gray-100 text-center shadow-sm">
                                                    <div className="text-[9px] font-bold text-gray-400 uppercase">Grade C</div>
                                                    <div className="text-sm font-black text-orange-600">{(selectedBatch.grades?.gradeC || 0).toFixed(2)}kg</div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-4 bg-blue-50/50 border rounded-xl">
                                            <label className="flex items-center gap-3 cursor-pointer">
                                                <input type="checkbox" checked={isCleaningComplete} onChange={e=>setIsCleaningComplete(e.target.checked)} className="w-6 h-6 rounded text-blue-600" />
                                                <span className="font-bold text-sm text-gray-700">Confirm batch cleaning complete and ready for packaging queue</span>
                                            </label>
                                        </div>
                                        <StaffMultiSelect selected={cleaningStaff} onChange={setCleaningStaff} label="Cleaning Crew" />
                                        <button type="submit" disabled={!isCleaningComplete} className={`w-full py-3 rounded-lg font-bold ${theme.button} disabled:opacity-50`}>Distribute to Packaging Floor</button>
                                    </form>
                                )}
                            </div>
                        ) : <div className="text-center py-24 text-gray-300 italic">Select a task from the tracker to proceed</div>}
                    </div>
                </div>
            )}
        </div>
    );
};