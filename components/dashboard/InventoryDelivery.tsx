import React, { useState, useEffect, useMemo } from 'react';
import { collection, addDoc, onSnapshot, query, where, updateDoc, doc, getDocs, limit } from '@firebase/firestore';
import { db } from '../../services/firebase';
import { VillageType, InventoryItem, DeliveryRecord, StockMovement } from '../../types';
import { 
  MUSHROOM_VARIETIES, 
  CUSTOMER_LIST, 
  DRIVER_LIST, 
  ROUTE_LIST,
  VEHICLE_LIST,
  STORAGE_LOCATIONS
} from './SharedComponents';

const FAILURE_REASONS = [
    "Customer not available",
    "Unable to contact customer",
    "Incorrect address",
    "Delivery time not accepted",
    "Location closed",
    "Other (please specify)"
];

interface Props {
    villageId: VillageType;
    userEmail: string;
    onRefresh: () => void;
    initialFilter?: 'ALL' | 'SCHEDULED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED';
}

export const InventoryDelivery: React.FC<Props> = ({ 
    villageId, userEmail, onRefresh, initialFilter = 'ALL' 
}) => {
    const [subTab, setSubTab] = useState<'warehouse' | 'delivery' | 'movement'>('warehouse');
    const [logisticsFilter, setLogisticsFilter] = useState<'ALL' | 'SCHEDULED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED'>(initialFilter);
    const [movementFilter, setMovementFilter] = useState<'ALL' | 'IN' | 'OUT' | 'ADJUSTMENT'>('ALL');
    const [loading, setLoading] = useState(false);
    
    // States
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
    const [movements, setMovements] = useState<StockMovement[]>([]);

    // Modal/Action States
    const [isProofModalOpen, setIsProofModalOpen] = useState(false);
    const [isProofViewerOpen, setIsProofViewerOpen] = useState(false);
    const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
    const [activeDelivery, setActiveDelivery] = useState<DeliveryRecord | null>(null);
    const [proofImage, setProofImage] = useState<string | null>(null);
    const [outcomeType, setOutcomeType] = useState<'DELIVERED' | 'FAILED'>('DELIVERED');
    const [selectedFailureReason, setSelectedFailureReason] = useState(FAILURE_REASONS[0]);
    const [otherReason, setOtherReason] = useState("");

    // Reschedule States
    const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
    const [newTime, setNewTime] = useState("09:00");
    const [newDriver, setNewDriver] = useState(DRIVER_LIST[0]);

    // Delivery Form States
    const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split('T')[0]);
    const [deliveryTime, setDeliveryTime] = useState("09:00");
    const [route, setRoute] = useState(ROUTE_LIST[0]);
    const [driver, setDriver] = useState(DRIVER_LIST[0]);
    const [vehicle, setVehicle] = useState(VEHICLE_LIST[0]);
    const [customer, setCustomer] = useState(CUSTOMER_LIST[0]);
    const [customerEmail, setCustomerEmail] = useState("");
    const [customerPhone, setCustomerPhone] = useState("");
    const [destination, setDestination] = useState("");
    
    // Simulation help for Stock Out
    const [dispatchVariety, setDispatchVariety] = useState(MUSHROOM_VARIETIES[0]);
    const [dispatchGrade, setDispatchGrade] = useState('A');
    const [dispatchQty, setDispatchQty] = useState('20');

    useEffect(() => {
        if (!villageId) return;
        const qInv = query(collection(db, "inventory_items"), where("villageId", "==", villageId));
        const qDel = query(collection(db, "delivery_records"), where("villageId", "==", villageId));
        const qMov = query(collection(db, "stock_movements"), where("villageId", "==", villageId));

        const unsubInv = onSnapshot(qInv, (snap) => {
            const data = snap.docs.map(d => ({id: d.id, ...d.data()} as InventoryItem));
            if (data.length === 0) {
               const mockInv: InventoryItem[] = [];
               MUSHROOM_VARIETIES.forEach((m, idx) => {
                   ['A', 'B', 'C'].forEach(g => {
                       mockInv.push({
                           id: `MOCK-${m}-${g}`,
                           batchNumber: `BAT-${1000 + idx}`,
                           mushroomType: m,
                           grade: g,
                           unit: 'kg',
                           currentStock: 100,
                           minThreshold: 20,
                           maxThreshold: 500,
                           harvestDate: new Date().toISOString(),
                           expiryDate: new Date(Date.now() + 604800000).toISOString(),
                           warehouseLocation: STORAGE_LOCATIONS[idx % STORAGE_LOCATIONS.length],
                           storageTemperature: "2-4°C",
                           villageId,
                           lastUpdated: new Date().toISOString()
                       });
                   });
               });
               setInventory(mockInv);
            } else {
               setInventory(data);
            }
        });

        const unsubDel = onSnapshot(qDel, (snap) => setDeliveries(snap.docs.map(d => ({id: d.id, ...d.data()} as DeliveryRecord))));
        const unsubMov = onSnapshot(qMov, (snap) => setMovements(snap.docs.map(d => ({id: d.id, ...d.data()} as StockMovement))));

        return () => { unsubInv(); unsubDel(); unsubMov(); };
    }, [villageId]);

    const handleScheduleDelivery = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const newDelivery: Omit<DeliveryRecord, 'id'> = {
                deliveryDate,
                deliveryTime,
                status: 'SCHEDULED',
                route,
                destinationAddress: destination,
                customerEmail: customerEmail || `${customer.toLowerCase().replace(/\s/g, '')}@example.com`,
                customerPhone: customerPhone || '012-3456789',
                zone: route,
                driverId: driver.id,
                driverName: driver.name,
                vehicleId: vehicle.id,
                vehicleType: vehicle.type,
                villageId
            };
            await addDoc(collection(db, "delivery_records"), newDelivery);
            setDestination("");
            setCustomerEmail("");
            setCustomerPhone("");
            alert("Delivery scheduled successfully.");
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    const handleStockOut = async (variety: string, grade: string, qty: number, refId: string) => {
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
                const currentData = itemDoc.data() as InventoryItem;
                const newStock = Math.max(0, currentData.currentStock - qty);
                await updateDoc(doc(db, "inventory_items", itemDoc.id), {
                    currentStock: newStock,
                    lastUpdated: new Date().toISOString()
                });
            }

            await addDoc(collection(db, "stock_movements"), {
                batchId: `DSP-${refId.slice(-6).toUpperCase()}`,
                type: 'OUT',
                quantity: qty,
                date: new Date().toISOString(),
                referenceId: refId,
                performedBy: userEmail,
                villageId
            });
        } catch (err) { console.error("Stock out failed:", err); }
    };

    const handleDepart = async (del: DeliveryRecord) => {
        setLoading(true);
        try {
            const qty = parseFloat(dispatchQty) || 20;
            await handleStockOut(dispatchVariety, dispatchGrade, qty, del.id);
            await updateDoc(doc(db, "delivery_records", del.id), { status: 'OUT_FOR_DELIVERY' });
            alert(`Batch departed. Warehouse stock updated (-OUT: ${qty}kg ${dispatchVariety} Grade ${dispatchGrade}).`);
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setProofImage(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleFinalizeOutcome = async () => {
        if (!activeDelivery) return;
        
        // Validation
        if (outcomeType === 'DELIVERED' && !proofImage) return alert("Please upload a photo as proof of delivery.");
        
        const finalReason = selectedFailureReason === 'Other (please specify)' ? otherReason : selectedFailureReason;
        if (outcomeType === 'FAILED' && !finalReason) return alert("Please specify the reason for the failed delivery attempt.");
        
        setLoading(true);
        try {
            const updateData: Partial<DeliveryRecord> = { 
                status: outcomeType,
                evidenceImage: outcomeType === 'DELIVERED' ? (proofImage || "") : "",
                deliveredAt: new Date().toISOString(),
                failureReason: outcomeType === 'FAILED' ? finalReason : ""
            };
            
            await updateDoc(doc(db, "delivery_records", activeDelivery.id), updateData);
            
            // SIMULATED EMAIL NOTIFICATION
            const doRef = `DO-${activeDelivery.id.slice(-6).toUpperCase()}`;
            const emailSubject = outcomeType === 'DELIVERED' ? `Delivery Successful: ${doRef}` : `Delivery Unsuccessful: ${doRef}`;
            const emailBody = outcomeType === 'DELIVERED' 
                ? `Dear Customer, your mushroom delivery to ${activeDelivery.destinationAddress} was successful. Thank you.`
                : `Dear Customer, we attempted to deliver your order but were unsuccessful. Reason: ${finalReason}. We will reach out to reschedule.`;
            
            alert(`Status Logged: ${outcomeType}\n\n[SIMULATED EMAIL SENT]\nTo: ${activeDelivery.customerEmail}\nSubject: ${emailSubject}\n\n${emailBody}`);
            
            setIsProofModalOpen(false);
            setProofImage(null);
            setOtherReason("");
            setActiveDelivery(null);
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    const handleEmailDOToCustomer = (del: DeliveryRecord) => {
        setLoading(true);
        setTimeout(() => {
            const doRef = `DO-${del.id.slice(-6).toUpperCase()}`;
            alert(`[SIMULATED EMAIL SENT]\nTo: ${del.customerEmail}\nSubject: Delivery Order ${doRef}\n\nDear Customer,\n\nPlease find your Delivery Order attached for your upcoming shipment. \n\nDriver: ${del.driverName}\nDate: ${del.deliveryDate}\n\nThank you for choosing Mushroom Village.`);
            setLoading(false);
        }, 1000);
    };

    const handleReschedule = async () => {
        if (!activeDelivery) return;
        setLoading(true);
        try {
            await updateDoc(doc(db, "delivery_records", activeDelivery.id), {
                status: 'SCHEDULED',
                deliveryDate: newDate,
                deliveryTime: newTime,
                driverId: newDriver.id,
                driverName: newDriver.name,
                failureReason: "" // Reset reason
            });
            alert(`Rescheduling successful.\n\nOrder #DO-${activeDelivery.id.slice(-6).toUpperCase()} assigned to ${newDriver.name} for ${newDate}.`);
            setIsRescheduleModalOpen(false);
            setActiveDelivery(null);
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    const printDeliveryOrder = (del: DeliveryRecord) => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        
        printWindow.document.write(`
            <html>
                <head>
                    <title>Delivery Order - ${del.id}</title>
                    <style>
                        body { font-family: 'Inter', sans-serif; padding: 40px; color: #333; }
                        .header { border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; }
                        .title { font-size: 24px; font-weight: bold; text-transform: uppercase; }
                        .info-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 20px; margin-bottom: 40px; }
                        .label { font-size: 10px; color: #666; font-weight: bold; text-transform: uppercase; margin-bottom: 4px; }
                        .value { font-size: 14px; font-weight: 600; }
                        .item-table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
                        .item-table th { background: #f4f4f4; text-align: left; padding: 12px; font-size: 12px; }
                        .item-table td { padding: 12px; border-bottom: 1px solid #eee; font-size: 13px; }
                        .footer { margin-top: 60px; font-size: 12px; display: flex; justify-content: space-between; }
                        .sig-box { border-top: 1px solid #333; width: 200px; padding-top: 10px; text-align: center; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div>
                            <div class="title">Delivery Order</div>
                            <div style="font-size: 12px; color: #888;">#DO-${del.id.slice(-6).toUpperCase()}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-weight: bold;">Mushroom Village Supply Chain</div>
                            <div style="font-size: 11px;">Central Logistics Hub - Village C</div>
                        </div>
                    </div>
                    
                    <div class="info-grid">
                        <div>
                            <div class="label">Delivery To</div>
                            <div class="value">${del.destinationAddress}</div>
                            <div class="label" style="margin-top: 10px;">Contact Information</div>
                            <div class="value">${del.customerEmail}</div>
                            <div class="value">${del.customerPhone || 'N/A'}</div>
                        </div>
                        <div>
                            <div class="label">Dispatch Details</div>
                            <div class="value">Date: ${del.deliveryDate}</div>
                            <div class="value">Time: ${del.deliveryTime}</div>
                            <div class="value">Route: ${del.route}</div>
                        </div>
                    </div>

                    <table class="item-table">
                        <thead>
                            <tr>
                                <th>Item Description</th>
                                <th>Grade</th>
                                <th>Qty (kg)</th>
                                <th>Units</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Fresh Organic Mushrooms (Assorted Variety)</td>
                                <td>Mixed</td>
                                <td>${dispatchQty}</td>
                                <td>${Math.round(parseFloat(dispatchQty)/0.2)} Packs</td>
                            </tr>
                        </tbody>
                    </table>

                    <div class="footer">
                        <div class="sig-box">Issued By (Driver: ${del.driverName})</div>
                        <div class="sig-box">Received By (Customer)</div>
                    </div>
                    
                    <script>
                        window.onload = function() { window.print(); window.close(); }
                    </script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    const varietyStock = useMemo(() => {
        const groups: Record<string, any> = {};
        inventory.forEach(item => {
            if (!groups[item.mushroomType]) groups[item.mushroomType] = { A: 0, B: 0, C: 0 };
            groups[item.mushroomType][item.grade] += item.currentStock;
        });
        return groups;
    }, [inventory]);

    const filteredDeliveries = useMemo(() => {
        if (logisticsFilter === 'ALL') return deliveries;
        return deliveries.filter(d => d.status === logisticsFilter);
    }, [deliveries, logisticsFilter]);

    const filteredMovements = useMemo(() => {
        if (movementFilter === 'ALL') return movements;
        return movements.filter(m => m.type === movementFilter);
    }, [movements, movementFilter]);

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="flex border-b border-gray-100 overflow-x-auto scrollbar-hide">
                {[
                    { id: 'warehouse', label: 'Warehouse Stock' },
                    { id: 'delivery', label: 'Logistics & Dispatch' },
                    { id: 'movement', label: 'Stock Movements' }
                ].map(tab => (
                    <button 
                        key={tab.id} 
                        onClick={() => setSubTab(tab.id as any)}
                        className={`px-6 py-3 text-sm font-bold uppercase transition-all whitespace-nowrap border-b-2 ${subTab === tab.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {subTab === 'warehouse' && (
                <div className="space-y-6">
                    <div className="grid md:grid-cols-4 gap-4">
                        <div className="p-4 bg-white rounded-xl border shadow-sm">
                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Total Stock (kg)</div>
                            <div className="text-2xl font-black text-gray-800">{inventory.reduce((a,b)=>a+b.currentStock,0).toFixed(1)}</div>
                        </div>
                        <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                            <div className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Total Units (200g)</div>
                            <div className="text-2xl font-black text-blue-600">{Math.floor(inventory.reduce((a,b)=>a+b.currentStock,0)/0.2)}</div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                <tr>
                                    <th className="px-6 py-4">Mushroom Variety</th>
                                    <th className="px-6 py-4 text-center">Grade A (kg)</th>
                                    <th className="px-6 py-4 text-center">Grade B (kg)</th>
                                    <th className="px-6 py-4 text-center">Grade C (kg)</th>
                                    <th className="px-6 py-4 text-right">Total Variety Stock</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {MUSHROOM_VARIETIES.map(variety => {
                                    const grades = varietyStock[variety] || { A: 0, B: 0, C: 0 };
                                    return (
                                        <tr key={variety} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 font-bold text-gray-800 flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                                {variety}
                                            </td>
                                            <td className="px-6 py-4 text-center font-mono font-bold text-green-600">{grades.A.toFixed(1)}</td>
                                            <td className="px-6 py-4 text-center font-mono font-bold text-blue-600">{grades.B.toFixed(1)}</td>
                                            <td className="px-6 py-4 text-center font-mono font-bold text-orange-600">{grades.C.toFixed(1)}</td>
                                            <td className="px-6 py-4 text-right">
                                                <span className="bg-slate-100 px-3 py-1 rounded-full font-black text-slate-700 text-xs">
                                                    {(grades.A + grades.B + grades.C).toFixed(1)} kg
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {subTab === 'delivery' && (
                <div className="grid md:grid-cols-4 gap-8">
                    <div className="col-span-1 space-y-4">
                        <form onSubmit={handleScheduleDelivery} className="bg-white p-6 rounded-2xl border shadow-sm space-y-4">
                            <h3 className="text-xs font-black text-gray-800 uppercase tracking-widest border-b pb-3 mb-4">New Dispatch</h3>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className="block text-[8px] font-bold text-gray-400 uppercase mb-1">Date</label><input type="date" value={deliveryDate} onChange={e=>setDeliveryDate(e.target.value)} className="w-full p-2 border rounded-lg text-xs" required /></div>
                                <div><label className="block text-[8px] font-bold text-gray-400 uppercase mb-1">Time</label><input type="time" value={deliveryTime} onChange={e=>setDeliveryTime(e.target.value)} className="w-full p-2 border rounded-lg text-xs" required /></div>
                            </div>
                            <div><label className="block text-[8px] font-bold text-gray-400 uppercase mb-1">Customer / Client</label><select value={customer} onChange={e=>setCustomer(e.target.value)} className="w-full p-2 border rounded-lg text-xs bg-white">{CUSTOMER_LIST.map(r=><option key={r} value={r}>{r}</option>)}</select></div>
                            <div><label className="block text-[8px] font-bold text-gray-400 uppercase mb-1">Contact Email</label><input type="email" value={customerEmail} onChange={e=>setCustomerEmail(e.target.value)} className="w-full p-2 border rounded-lg text-xs" placeholder="client@email.com" /></div>
                            <div><label className="block text-[8px] font-bold text-gray-400 uppercase mb-1">Contact Phone</label><input type="tel" value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)} className="w-full p-2 border rounded-lg text-xs" placeholder="012-3456789" /></div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className="block text-[8px] font-bold text-gray-400 uppercase mb-1">Route</label><select value={route} onChange={e=>setRoute(e.target.value)} className="w-full p-2 border rounded-lg text-xs bg-white">{ROUTE_LIST.map(r=><option key={r} value={r}>{r}</option>)}</select></div>
                                <div><label className="block text-[8px] font-bold text-gray-400 uppercase mb-1">Driver</label><select value={driver.id} onChange={e=>{const d=DRIVER_LIST.find(x=>x.id===e.target.value); if(d) setDriver(d);}} className="w-full p-2 border rounded-lg text-xs bg-white">{DRIVER_LIST.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
                            </div>
                            <div><label className="block text-[8px] font-bold text-gray-400 uppercase mb-1">Address</label><input type="text" value={destination} onChange={e=>setDestination(e.target.value)} className="w-full p-2 border rounded-lg text-xs" placeholder="Full address" required /></div>
                            <button type="submit" disabled={loading} className="w-full py-2.5 bg-gray-900 text-white rounded-xl font-bold uppercase text-[10px] hover:bg-black transition-all shadow-lg">Schedule</button>
                        </form>
                    </div>

                    <div className="col-span-3 space-y-4">
                        <div className="flex bg-gray-100 p-1 rounded-xl w-fit">
                            {[
                                { id: 'ALL', label: 'All Status' },
                                { id: 'SCHEDULED', label: 'Scheduled' },
                                { id: 'OUT_FOR_DELIVERY', label: 'In Transit' },
                                { id: 'DELIVERED', label: 'Delivered' },
                                { id: 'FAILED', label: 'Unsuccessful' }
                            ].map(filter => (
                                <button key={filter.id} onClick={() => setLogisticsFilter(filter.id as any)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all whitespace-nowrap ${logisticsFilter === filter.id ? 'bg-white text-blue-600 shadow-md' : 'text-gray-400 hover:text-gray-600'}`}>{filter.label}</button>
                            ))}
                        </div>

                        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                                <thead className="bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                    <tr>
                                        <th className="px-6 py-4">Status & DO</th>
                                        <th className="px-6 py-4">Client Contact</th>
                                        <th className="px-6 py-4">Driver</th>
                                        <th className="px-6 py-4">Schedule</th>
                                        <th className="px-6 py-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredDeliveries.map(del => (
                                        <tr key={del.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col gap-1">
                                                    <span className={`w-fit px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${
                                                        del.status === 'DELIVERED' ? 'bg-green-100 text-green-700' : 
                                                        del.status === 'OUT_FOR_DELIVERY' ? 'bg-blue-100 text-blue-700' : 
                                                        del.status === 'FAILED' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                                    }`}>
                                                        {del.status.replace(/_/g, ' ')}
                                                    </span>
                                                    <div className="text-[10px] font-mono font-bold text-gray-400 uppercase">#DO-{del.id.slice(-6).toUpperCase()}</div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-gray-700 truncate max-w-[120px]">{del.destinationAddress}</div>
                                                <div className="text-[10px] text-blue-500 italic font-medium">{del.customerPhone}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-gray-700 text-xs">{del.driverName}</div>
                                                <div className="text-[10px] text-gray-400 font-bold uppercase">{del.vehicleType}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-xs font-bold text-gray-600">{new Date(del.deliveryDate).toLocaleDateString()}</div>
                                                <div className="text-[10px] text-gray-400 font-bold">{del.deliveryTime}</div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end items-center gap-2">
                                                    <button title="Print Delivery Order" onClick={() => printDeliveryOrder(del)} className="p-1.5 bg-gray-50 rounded text-gray-500 hover:bg-gray-200 transition-colors">
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                                                    </button>
                                                    <button title="Email DO to Customer" onClick={() => handleEmailDOToCustomer(del)} className="p-1.5 bg-gray-50 rounded text-gray-500 hover:bg-gray-200 transition-colors">
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                                                    </button>
                                                    
                                                    {del.status === 'SCHEDULED' && (
                                                        <button onClick={() => handleDepart(del)} className="px-2 py-1 bg-blue-600 text-white text-[8px] font-black rounded uppercase hover:bg-blue-700">Depart</button>
                                                    )}
                                                    
                                                    {del.status === 'OUT_FOR_DELIVERY' && (
                                                        <div className="flex gap-1">
                                                            <button onClick={() => { setActiveDelivery(del); setOutcomeType('DELIVERED'); setIsProofModalOpen(true); }} className="px-2 py-1 bg-green-600 text-white text-[8px] font-black rounded uppercase">Deliver</button>
                                                            <button onClick={() => { setActiveDelivery(del); setOutcomeType('FAILED'); setIsProofModalOpen(true); }} className="px-2 py-1 bg-red-600 text-white text-[8px] font-black rounded uppercase">Failed</button>
                                                        </div>
                                                    )}
                                                    
                                                    {del.status === 'FAILED' && (
                                                        <button onClick={() => { setActiveDelivery(del); setIsRescheduleModalOpen(true); }} className="px-2 py-1 bg-blue-500 text-white text-[8px] font-black rounded uppercase">Reschedule</button>
                                                    )}

                                                    {(del.status === 'DELIVERED' || del.status === 'FAILED') && (
                                                        <button title="View Details" onClick={() => { setActiveDelivery(del); setProofImage(del.evidenceImage || null); setIsProofViewerOpen(true); }} className={`p-1.5 rounded transition-colors ${del.status === 'DELIVERED' ? 'bg-green-50 text-green-600 hover:bg-green-100 border-green-200' : 'bg-red-50 text-red-600 hover:bg-red-100 border-red-200'} border`}>
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredDeliveries.length === 0 && (
                                        <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-300 italic">No matching delivery logs.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {subTab === 'movement' && (
                <div className="space-y-4">
                    <div className="flex bg-gray-100 p-1 rounded-xl w-fit">
                        {[
                            { id: 'ALL', label: 'All Transactions' },
                            { id: 'IN', label: 'Stock In' },
                            { id: 'OUT', label: 'Stock Out' },
                            { id: 'ADJUSTMENT', label: 'Adjustments' }
                        ].map(f => (
                            <button 
                                key={f.id} 
                                onClick={() => setMovementFilter(f.id as any)} 
                                className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all whitespace-nowrap ${movementFilter === f.id ? 'bg-white text-blue-600 shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>

                    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                <tr>
                                    <th className="px-6 py-4">Timestamp</th>
                                    <th className="px-6 py-4">Action</th>
                                    <th className="px-6 py-4">Product Ref</th>
                                    <th className="px-6 py-4 text-center">Qty Change</th>
                                    <th className="px-6 py-4 text-right">Performed By</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredMovements.sort((a,b)=>b.date.localeCompare(a.date)).map(mov => (
                                    <tr key={mov.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 font-mono text-[10px] text-gray-400">{new Date(mov.date).toLocaleString()}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${
                                                mov.type === 'IN' ? 'bg-green-100 text-green-700' : 
                                                mov.type === 'OUT' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                            }`}>
                                                Stock {mov.type === 'IN' ? 'Added' : mov.type === 'OUT' ? 'Deducted' : 'Adjusted'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-gray-700 text-xs">{mov.referenceId}</div>
                                            <div className="text-[9px] text-gray-400 uppercase font-mono">#{mov.batchId}</div>
                                        </td>
                                        <td className="px-6 py-4 text-center font-black text-gray-800">
                                            {mov.type === 'IN' ? '+' : '-'}{mov.quantity.toFixed(1)} kg
                                        </td>
                                        <td className="px-6 py-4 text-right text-[10px] text-gray-500">{mov.performedBy}</td>
                                    </tr>
                                ))}
                                {filteredMovements.length === 0 && (
                                    <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-300 italic">No transactions found for the selected filter.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Finalize Outcome Modal */}
            {isProofModalOpen && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-up">
                        <div className={`p-6 ${outcomeType === 'DELIVERED' ? 'bg-green-600' : 'bg-red-600'} text-white flex justify-between items-center`}>
                            <h3 className="font-black uppercase tracking-widest text-xs">{outcomeType === 'DELIVERED' ? 'Confirm Delivery' : 'Log Delivery Failure'}</h3>
                            <button onClick={() => setIsProofModalOpen(false)} className="text-white hover:text-white/80 font-bold text-2xl">×</button>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="text-center">
                                <p className="text-[10px] text-gray-400 font-bold uppercase mb-2">Required Action</p>
                                <p className="text-sm text-gray-700 leading-relaxed italic">
                                    {outcomeType === 'DELIVERED' 
                                        ? '"Upload a clear photo of the delivered goods to notify client."' 
                                        : '"Select the reason for the unsuccessful delivery attempt below."'}
                                </p>
                            </div>

                            {outcomeType === 'FAILED' ? (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Reason for Failure</label>
                                        <select 
                                            value={selectedFailureReason}
                                            onChange={e => setSelectedFailureReason(e.target.value)}
                                            className="w-full p-2.5 border rounded-xl text-sm bg-gray-50 font-medium"
                                        >
                                            {FAILURE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                                        </select>
                                    </div>
                                    {selectedFailureReason === 'Other (please specify)' && (
                                        <div className="animate-fade-in-up">
                                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Please specify</label>
                                            <textarea 
                                                value={otherReason}
                                                onChange={e => setOtherReason(e.target.value)}
                                                className="w-full p-3 border rounded-xl text-sm min-h-[80px]"
                                                placeholder="Details of the unsuccessful attempt..."
                                            />
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="border-2 border-dashed border-gray-200 rounded-2xl p-4 text-center hover:border-blue-400 transition-colors bg-gray-50">
                                    {proofImage ? (
                                        <div className="relative">
                                            <img src={proofImage} className="w-full h-48 object-cover rounded-xl shadow-inner border border-white" alt="Evidence" />
                                            <button onClick={() => setProofImage(null)} className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full hover:bg-red-600 shadow-lg">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                                            </button>
                                        </div>
                                    ) : (
                                        <label className="cursor-pointer flex flex-col items-center py-12">
                                            <div className="bg-white p-4 rounded-full mb-3 shadow-sm text-green-500">
                                                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                                            </div>
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Select Proof Image</span>
                                            <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                                        </label>
                                    )}
                                </div>
                            )}

                            <button 
                                onClick={handleFinalizeOutcome} 
                                disabled={loading || (outcomeType === 'DELIVERED' && !proofImage) || (outcomeType === 'FAILED' && selectedFailureReason === 'Other (please specify)' && !otherReason)}
                                className={`w-full py-4 rounded-xl font-black uppercase text-xs shadow-xl transition-all flex items-center justify-center gap-2 ${loading ? 'opacity-50' : (outcomeType === 'DELIVERED' ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white')}`}
                            >
                                {loading ? 'Finalizing...' : `Log Result & Notify Client`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reschedule Modal */}
            {isRescheduleModalOpen && activeDelivery && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-up">
                        <div className="p-6 bg-blue-600 text-white flex justify-between items-center">
                            <h3 className="font-black uppercase tracking-widest text-xs">Reschedule Delivery</h3>
                            <button onClick={() => setIsRescheduleModalOpen(false)} className="text-white hover:text-white/80 font-bold text-2xl">×</button>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 text-xs">
                                <p className="font-bold text-blue-800 mb-1">Previous Failure Reason:</p>
                                <p className="text-blue-600 italic">"{activeDelivery.failureReason}"</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">New Date</label>
                                    <input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">New Time</label>
                                    <input type="time" value={newTime} onChange={e=>setNewTime(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Assign Driver</label>
                                <select 
                                    value={newDriver.id} 
                                    onChange={e => {
                                        const d = DRIVER_LIST.find(x => x.id === e.target.value);
                                        if (d) setNewDriver(d);
                                    }} 
                                    className="w-full p-2.5 border rounded-xl text-sm bg-gray-50"
                                >
                                    {DRIVER_LIST.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                            </div>
                            <button 
                                onClick={handleReschedule}
                                disabled={loading}
                                className="w-full py-4 rounded-xl font-black uppercase text-xs bg-blue-600 hover:bg-blue-700 text-white shadow-xl transition-all"
                            >
                                {loading ? 'Updating...' : 'Confirm Reschedule'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Outcome Viewer Modal */}
            {isProofViewerOpen && activeDelivery && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[110] p-4 backdrop-blur-md">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-scale-up">
                        <div className={`p-6 border-b flex justify-between items-center ${activeDelivery.status === 'DELIVERED' ? 'bg-green-50' : 'bg-red-50'}`}>
                            <div>
                                <h3 className={`font-black uppercase tracking-widest text-xs ${activeDelivery.status === 'DELIVERED' ? 'text-green-800' : 'text-red-800'}`}>
                                    {activeDelivery.status === 'DELIVERED' ? 'Delivery Success Report' : 'Unsuccessful Delivery Report'}
                                </h3>
                                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Ref: #DO-{activeDelivery.id.slice(-6).toUpperCase()} • Logged {activeDelivery.deliveredAt ? new Date(activeDelivery.deliveredAt).toLocaleString() : 'N/A'}</p>
                            </div>
                            <button onClick={() => setIsProofViewerOpen(false)} className="text-gray-400 hover:text-gray-600 font-bold text-2xl">×</button>
                        </div>
                        <div className="p-8 flex flex-col md:flex-row gap-8 items-start">
                            <div className="flex-1 space-y-4 w-full text-left">
                                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                    <h4 className="text-[9px] font-bold text-gray-400 uppercase mb-2">Recipient Info</h4>
                                    <div className="text-xs font-bold text-gray-700">{activeDelivery.destinationAddress}</div>
                                    <div className="text-[10px] text-blue-600 font-bold mt-1 uppercase">Email: {activeDelivery.customerEmail}</div>
                                    <div className="text-[10px] text-gray-600 font-medium">Phone: {activeDelivery.customerPhone}</div>
                                </div>
                                {activeDelivery.status === 'FAILED' && (
                                    <div className="p-4 bg-red-100/50 rounded-2xl border border-red-200">
                                        <h4 className="text-[9px] font-bold text-red-600 uppercase mb-2 tracking-widest">Failure Reason</h4>
                                        <div className="text-xs font-medium text-red-900 leading-relaxed italic">"{activeDelivery.failureReason || 'Not specified'}"</div>
                                    </div>
                                )}
                                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                    <h4 className="text-[9px] font-bold text-gray-400 uppercase mb-2 tracking-widest">Audit Trail</h4>
                                    <div className="text-xs font-bold text-gray-700">Driver: {activeDelivery.driverName}</div>
                                    <div className="text-[10px] text-gray-500 font-medium uppercase mt-1">Vehicle: {activeDelivery.vehicleType}</div>
                                </div>
                            </div>
                            <div className="flex-1 w-full text-center">
                                <h4 className="text-[9px] font-bold text-gray-400 uppercase mb-2 text-center md:text-left tracking-widest">Evidence Snapshot</h4>
                                {activeDelivery.evidenceImage ? (
                                    <img src={activeDelivery.evidenceImage} className="w-full h-auto rounded-2xl shadow-xl border border-gray-100 hover:scale-[1.02] transition-transform cursor-pointer" alt="Evidence" onClick={() => window.open(activeDelivery.evidenceImage, '_blank')} />
                                ) : (
                                    <div className="h-48 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-300 italic text-xs">
                                        {activeDelivery.status === 'FAILED' ? 'No photo required for failure' : 'No image logged'}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};