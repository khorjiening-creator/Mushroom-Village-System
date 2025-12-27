import React, { useState, useEffect, useMemo } from 'react';
import { collection, addDoc, onSnapshot, query, where, updateDoc, doc, getDocs, limit } from '@firebase/firestore';
import { db } from '../../services/firebase';
import { VillageType, InventoryItem, DeliveryRecord, StockMovement, UserRole, Customer } from '../../types';
import { 
  MUSHROOM_VARIETIES, 
  DRIVER_LIST, 
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
    userRole: UserRole;
    userEmail: string;
    onRefresh: () => void;
    initialFilter?: 'ALL' | 'PENDING_SCHEDULE' | 'SCHEDULED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED';
    onSuccess: (msg: string) => void;
    onError?: (msg: string) => void;
}

export const InventoryDelivery: React.FC<Props> = ({ 
    villageId, userRole, userEmail, onRefresh, initialFilter = 'ALL', onSuccess, onError 
}) => {
    const [subTab, setSubTab] = useState<'warehouse' | 'delivery' | 'movement' | 'history'>('warehouse');
    const [logisticsFilter, setLogisticsFilter] = useState<'ALL' | 'PENDING_SCHEDULE' | 'SCHEDULED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED'>(initialFilter);
    const [movementFilter, setMovementFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
    const [loading, setLoading] = useState(false);
    
    const isAdmin = userRole === 'admin';
    const canViewMovements = isAdmin || (villageId === VillageType.C && userRole === 'user');
    const canViewHistory = isAdmin || (villageId === VillageType.C && userRole === 'user');

    // States
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
    const [movements, setMovements] = useState<StockMovement[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);

    // Modal/Action States
    const [isProofModalOpen, setIsProofModalOpen] = useState(false);
    const [isProofViewerOpen, setIsProofViewerOpen] = useState(false);
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    const [activeDelivery, setActiveDelivery] = useState<DeliveryRecord | null>(null);
    const [proofImage, setProofImage] = useState<string | null>(null);
    const [outcomeType, setOutcomeType] = useState<'DELIVERED' | 'FAILED'>('DELIVERED');
    const [selectedFailureReason, setSelectedFailureReason] = useState(FAILURE_REASONS[0]);
    const [otherReason, setOtherReason] = useState("");

    // Scheduling States
    const [scheduleDate, setScheduleDate] = useState(new Date().toISOString().split('T')[0]);
    const [scheduleTime, setScheduleTime] = useState("09:00");
    const [scheduleDriver, setScheduleDriver] = useState(DRIVER_LIST[0]);
    const [scheduleVehicle, setScheduleVehicle] = useState(VEHICLE_LIST[0]);
    const [schedulePIC, setSchedulePIC] = useState('');
    const [scheduleAddress, setScheduleAddress] = useState('');
    
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
        const unsubCust = onSnapshot(collection(db, 'customers'), (snap) => {
            setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
        });

        return () => { unsubInv(); unsubDel(); unsubMov(); unsubCust(); };
    }, [villageId]);

    // Handle modal population & PIC linkage with CRM
    useEffect(() => {
        if (activeDelivery && isScheduleModalOpen) {
            const linkedCust = customers.find(c => c.name === activeDelivery.customerName);
            setSchedulePIC(activeDelivery.pic || linkedCust?.pic || '');
            setScheduleAddress(activeDelivery.destinationAddress || linkedCust?.address || '');
            setScheduleDate(activeDelivery.deliveryDate || new Date().toISOString().split('T')[0]);
            setScheduleTime(activeDelivery.deliveryTime || "09:00");
            
            if (activeDelivery.driverId) {
                const drv = DRIVER_LIST.find(d => d.id === activeDelivery.driverId);
                if (drv) setScheduleDriver(drv);
            }
            if (activeDelivery.vehicleId) {
                const vhc = VEHICLE_LIST.find(v => v.id === activeDelivery.vehicleId);
                if (vhc) setScheduleVehicle(vhc);
            }
        }
    }, [activeDelivery, isScheduleModalOpen, customers]);

    const handleConfirmSchedule = async () => {
        if (!activeDelivery) return;
        setLoading(true);
        try {
            await updateDoc(doc(db, "delivery_records", activeDelivery.id), {
                status: 'SCHEDULED',
                deliveryDate: scheduleDate,
                deliveryTime: scheduleTime,
                driverId: scheduleDriver.id,
                driverName: scheduleDriver.name,
                vehicleId: scheduleVehicle.id,
                vehicleType: scheduleVehicle.type,
                pic: schedulePIC,
                destinationAddress: scheduleAddress,
                route: '', 
                zone: '',
                failureReason: "" 
            });
            onSuccess(`Delivery scheduled for ${activeDelivery.customerName} on ${scheduleDate}.`);
            setIsScheduleModalOpen(false);
            setActiveDelivery(null);
        } catch (err: any) { 
            console.error(err);
            if (onError) onError(err.message || "Failed to schedule delivery.");
        } finally { setLoading(false); }
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
                villageId,
                mushroomType: variety,
                grade: grade
            } as any);
        } catch (err) { console.error("Stock out failed:", err); }
    };

    const handleDepart = async (del: DeliveryRecord) => {
        setLoading(true);
        try {
            let items: any[] = [];
            
            if (del.orderSummary) {
                items = del.orderSummary.split(', ').map(s => {
                    const match = s.match(/(\d+)x (.*)/);
                    if (match) {
                        const qty = parseInt(match[1]);
                        const name = match[2];
                        const variety = MUSHROOM_VARIETIES.find(v => name.includes(v)) || 'Mixed';
                        const gradeMatch = name.match(/Grade ([ABC])/);
                        const grade = gradeMatch ? gradeMatch[1] : 'A';
                        const weight = qty * 0.2; 
                        return { variety, grade, qty, weight };
                    }
                    return null;
                }).filter(Boolean);
            }

            if (items.length > 0) {
                for (const item of items) {
                    await addDoc(collection(db, "stock_movements"), {
                        batchId: `DSP-${del.id.slice(-6).toUpperCase()}`,
                        type: 'OUT',
                        quantity: item.weight,
                        date: new Date().toISOString(),
                        referenceId: del.id,
                        performedBy: userEmail,
                        villageId,
                        mushroomType: item.variety,
                        grade: item.grade,
                        details: `Dispatch: ${item.qty} units`
                    });
                }
            } else {
                const qty = parseFloat(dispatchQty) || 20;
                await handleStockOut(dispatchVariety, dispatchGrade, qty, del.id);
            }

            await updateDoc(doc(db, "delivery_records", del.id), { status: 'OUT_FOR_DELIVERY' });
            onSuccess(`Batch DO-${del.id.slice(-6).toUpperCase()} departed. Logistics tracked.`);
        } catch (err: any) { 
            console.error(err);
            if (onError) onError(err.message || "Failed to log departure.");
        } finally { setLoading(false); }
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
            onSuccess(`Outcome logged: ${outcomeType} for DO-${activeDelivery.id.slice(-6).toUpperCase()}`);
            setIsProofModalOpen(false); setProofImage(null); setOtherReason(""); setActiveDelivery(null);
        } catch (err: any) { 
            console.error(err);
            if (onError) onError(err.message || "Failed to log delivery outcome.");
        } finally { setLoading(false); }
    };

    const printDeliveryOrder = (del: DeliveryRecord) => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        
        let itemsHtml = '';
        if (del.orderSummary) {
            const items = del.orderSummary.split(', ').map(s => {
                const match = s.match(/(\d+)x (.*)/);
                if (match) {
                    const qty = parseInt(match[1]);
                    const weight = qty * 0.2; 
                    return `
                        <tr>
                            <td style="padding: 12px; border-bottom: 1px solid #eee; font-size: 13px;">${match[2]}</td>
                            <td style="padding: 12px; border-bottom: 1px solid #eee; font-size: 13px;">${qty} units (${weight.toFixed(1)} kg)</td>
                        </tr>
                    `;
                }
                return '';
            }).join('');
            
            if (itemsHtml) {
                itemsHtml = `<table class="item-table"><thead><tr><th>Item Description</th><th>Quantity / Weight</th></tr></thead><tbody>${itemsHtml}</tbody></table>`;
            }
        }

        if (!itemsHtml) {
            itemsHtml = `<table class="item-table"><thead><tr><th>Item Description</th><th>Quantity / Weight</th></tr></thead><tbody><tr><td>${del.orderSummary || 'Fresh Organic Mushrooms (Assorted Variety)'}</td><td>${dispatchQty} kg (Approx)</td></tr></tbody></table>`;
        }
        
        printWindow.document.write(`<html><head><title>Delivery Order - ${del.id}</title><style>body { font-family: 'Inter', sans-serif; padding: 40px; color: #333; } .header { border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; } .title { font-size: 24px; font-weight: bold; text-transform: uppercase; } .info-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 20px; margin-bottom: 40px; } .label { font-size: 10px; color: #666; font-weight: bold; text-transform: uppercase; margin-bottom: 4px; } .value { font-size: 14px; font-weight: 600; } .item-table { width: 100%; border-collapse: collapse; margin-bottom: 40px; } .item-table th { background: #f4f4f4; text-align: left; padding: 12px; font-size: 12px; } .footer { margin-top: 60px; font-size: 12px; display: flex; justify-content: space-between; } .sig-box { border-top: 1px solid #333; width: 200px; padding-top: 10px; text-align: center; } </style></head><body><div class="header"><div><div class="title">Delivery Order</div><div style="font-size: 12px; color: #888;">#DO-${del.id.slice(-6).toUpperCase()}</div></div><div style="text-align: right;"><div style="font-weight: bold;">Mushroom Village Supply Chain</div><div style="font-size: 11px;">Central Logistics Hub - Village C</div></div></div><div class="info-grid"><div><div class="label">Delivery To</div><div class="value">${del.customerName || 'N/A'}</div><div class="value">${del.destinationAddress}</div><div class="label" style="margin-top: 10px;">Contact (PIC)</div><div class="value">${del.pic || 'N/A'}</div><div class="label" style="margin-top: 10px;">Contact Information</div><div class="value">${del.customerEmail}</div><div class="value">${del.customerPhone || 'N/A'}</div></div><div><div class="label">Dispatch Details</div><div class="value">Date: ${del.deliveryDate || 'TBD'}</div><div class="value">Time: ${del.deliveryTime || 'TBD'}</div></div></div>${itemsHtml}<div class="footer"><div class="sig-box">Issued By (Driver: ${del.driverName || 'Unassigned'})</div><div class="sig-box">Received By (Customer)</div></div><script>window.onload = function() { window.print(); window.close(); }</script></body></html>`);
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
        const activeDeliveries = deliveries.filter(d => d.status !== 'DELIVERED');
        if (logisticsFilter === 'ALL') return activeDeliveries;
        return activeDeliveries.filter(d => d.status === logisticsFilter);
    }, [deliveries, logisticsFilter]);

    const unscheduledItems = useMemo(() => deliveries.filter(d => d.status === 'PENDING_SCHEDULE'), [deliveries]);

    const filteredMovements = useMemo(() => {
        if (movementFilter === 'ALL') return movements;
        return movements.filter(m => m.type === movementFilter);
    }, [movements, movementFilter]);

    const handleExportMovementsCSV = () => {
        if (!canViewMovements) return;
        const headers = ["Timestamp", "Action", "Reference ID", "Details", "Net Units (Packs)", "Performed By"];
        const rows = filteredMovements.sort((a, b) => b.date.localeCompare(a.date)).map(mov => [
            new Date(mov.date).toLocaleString(),
            `Stock ${mov.type}`,
            mov.referenceId,
            (mov as any).mushroomType ? `${(mov as any).mushroomType} Grade ${(mov as any).grade}` : (mov as any).details || `Batch #${mov.batchId}`,
            `${mov.type === 'IN' ? '+' : '-'}${Math.round(mov.quantity / 0.2)}`,
            mov.performedBy.split('@')[0]
        ]);
        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `stock_movements_${villageId.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handlePrintMovementsPDF = () => {
        if (!canViewMovements) return;
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        let rowsHtml = filteredMovements.sort((a, b) => b.date.localeCompare(a.date)).map(mov => `<tr><td style="padding: 10px; border-bottom: 1px solid #eee; font-family: monospace; font-size: 11px;">${new Date(mov.date).toLocaleString()}</td><td style="padding: 10px; border-bottom: 1px solid #eee;"><span style="font-weight: bold; color: ${mov.type === 'IN' ? '#059669' : mov.type === 'OUT' ? '#dc2626' : '#d97706'}">Stock ${mov.type}</span></td><td style="padding: 10px; border-bottom: 1px solid #eee;"><div style="font-weight: bold;">${mov.referenceId}</div><div style="font-size: 10px; color: #666; text-transform: uppercase;">${(mov as any).mushroomType ? `${(mov as any).mushroomType} Grade ${(mov as any).grade}` : (mov as any).details || `Batch #${mov.batchId}`}</div></td><td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">${mov.type === 'IN' ? '+' : '-'}${Math.round(mov.quantity / 0.2)} Packs</td><td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; font-size: 11px;">${mov.performedBy.split('@')[0]}</td></tr>`).join('');
        printWindow.document.write(`<html><head><title>Stock Movement Report - ${villageId}</title><style>body { font-family: 'Inter', 'Helvetica', sans-serif; padding: 40px; color: #333; } .header { border-bottom: 3px solid #1e40af; padding-bottom: 20px; margin-bottom: 30px; } .title { font-size: 24px; font-weight: 900; text-transform: uppercase; color: #1e40af; } table { width: 100%; border-collapse: collapse; margin-top: 20px; } th { background: #f8fafc; text-align: left; padding: 12px; font-size: 11px; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #e2e8f0; } </style></head><body><div class="header"><div class="title">Stock Movement Ledger</div><div style="font-size: 12px; color: #64748b; font-weight: bold; margin-top: 5px;">${villageId} &bull; Generated: ${new Date().toLocaleString()}</div></div><table><thead><tr><th>Timestamp</th><th>Action</th><th>Reference & Details</th><th style="text-align: right;">Net Units (Packs)</th><th style="text-align: right;">User</th></tr></thead><tbody>${rowsHtml}</tbody></table><script>window.onload=()=>{window.print();window.close();}</script></body></html>`);
        printWindow.document.close();
    };

    const handleExportDeliveryHistoryCSV = () => {
        if (!canViewHistory) return;
        const headers = ["DO ID", "Date", "Customer", "PIC", "Address", "Driver", "Vehicle", "Status", "Reason", "Delivered At"];
        const rows = deliveries.sort((a, b) => (b.deliveryDate || '').localeCompare(a.deliveryDate || '')).map(del => [`DO-${del.id.slice(-6).toUpperCase()}`, del.deliveryDate, del.customerName || 'N/A', del.pic || 'N/A', del.destinationAddress.replace(/,/g, ';'), del.driverName, del.vehicleType, del.status, (del.failureReason || '').replace(/,/g, ';'), del.deliveredAt || '']);
        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `delivery_history_${villageId.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handlePrintDeliveryHistoryPDF = () => {
        if (!canViewHistory) return;
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        let rowsHtml = deliveries.sort((a, b) => (b.deliveryDate || '').localeCompare(a.deliveryDate || '')).map(del => `<tr><td style="padding: 10px; border-bottom: 1px solid #eee; font-family: monospace;">DO-${del.id.slice(-6).toUpperCase()}</td><td style="padding: 10px; border-bottom: 1px solid #eee;">${del.deliveryDate || 'TBD'}</td><td style="padding: 10px; border-bottom: 1px solid #eee;"><div style="font-weight: bold;">${del.customerName || 'N/A'}</div><div style="font-size: 9px; color: #666;">${del.destinationAddress}</div><div style="font-size: 9px; font-weight: bold;">PIC: ${del.pic || 'N/A'}</div></td><td style="padding: 10px; border-bottom: 1px solid #eee;">${del.driverName}</td><td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;"><span style="padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; background: ${del.status === 'DELIVERED' ? '#dcfce7' : del.status === 'FAILED' ? '#fee2e2' : '#fef9c3'}; color: ${del.status === 'DELIVERED' ? '#166534' : del.status === 'FAILED' ? '#991b1b' : '#854d0e'};">${del.status}</span></td><td style="padding: 10px; border-bottom: 1px solid #eee; font-size: 10px;">${del.deliveredAt ? new Date(del.deliveredAt).toLocaleTimeString() : '-'}</td></tr>`).join('');
        printWindow.document.write(`<html><head><title>Delivery Fulfillment Report - ${villageId}</title><style>body { font-family: 'Inter', sans-serif; padding: 40px; color: #333; } .header { border-bottom: 3px solid #1e40af; padding-bottom: 20px; margin-bottom: 30px; } .title { font-size: 24px; font-weight: 900; text-transform: uppercase; color: #1e40af; } table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; } th { background: #f8fafc; text-align: left; padding: 12px; font-size: 11px; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #e2e8f0; } </style></head><body><div class="header"><div class="title">Logistics Fulfillment Registry</div><div style="font-size: 12px; color: #64748b; font-weight: bold; margin-top: 5px;">${villageId} Hub &bull; Audited: ${new Date().toLocaleString()}</div></div><table><thead><tr><th>DO #</th><th>Planned Date</th><th>Consignee</th><th>Courier</th><th style="text-align: center;">Result</th><th>Completion</th></tr></thead><tbody>${rowsHtml}</tbody></table><script>window.onload=()=>{window.print();window.close();}</script></body></html>`);
        printWindow.document.close();
    };

    const activeCounts = useMemo(() => {
        return {
            ALL: deliveries.filter(d => d.status !== 'DELIVERED').length,
            PENDING_SCHEDULE: deliveries.filter(d => d.status === 'PENDING_SCHEDULE').length,
            SCHEDULED: deliveries.filter(d => d.status === 'SCHEDULED').length,
            OUT_FOR_DELIVERY: deliveries.filter(d => d.status === 'OUT_FOR_DELIVERY').length,
            FAILED: deliveries.filter(d => d.status === 'FAILED').length,
        };
    }, [deliveries]);

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="flex border-b border-gray-100 overflow-x-auto scrollbar-hide">
                {[
                    { id: 'warehouse', label: 'Warehouse Stock' },
                    { id: 'delivery', label: 'Logistics & Dispatch' },
                    { id: 'history', label: 'Delivery History' },
                    { id: 'movement', label: 'Stock Movements' }
                ].filter(tab => {
                    if (tab.id === 'history') return canViewHistory;
                    if (tab.id === 'movement') return canViewMovements;
                    return true;
                })
                .map(tab => (
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
                    <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                        <div className="flex gap-4">
                            <div className="p-2">
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Total Stock (kg)</div>
                                <div className="text-2xl font-black text-gray-800">{inventory.reduce((a,b)=>a+b.currentStock,0).toFixed(1)}</div>
                            </div>
                            <div className="w-px bg-gray-100 h-10 self-center"></div>
                            <div className="p-2">
                                <div className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">TOTAL UNITS (200G PER PACK)</div>
                                <div className="text-2xl font-black text-blue-600">{Math.floor(inventory.reduce((a,b)=>a+b.currentStock,0)/0.2)}</div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                <tr>
                                    <th className="px-6 py-4">Mushroom Variety</th>
                                    <th className="px-6 py-4 text-center">GRADE A (PER PACK)</th>
                                    <th className="px-6 py-4 text-center">GRADE B (PER PACK)</th>
                                    <th className="px-6 py-4 text-center">GRADE C (PER PACK)</th>
                                    <th className="px-6 py-4 text-right">TOTAL STOCK</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {MUSHROOM_VARIETIES.map(variety => {
                                    const grades = varietyStock[variety] || { A: 0, B: 0, C: 0 };
                                    const totalVarietyPacks = Math.floor((grades.A + grades.B + grades.C) / 0.2);
                                    return (
                                        <tr key={variety} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 font-bold text-gray-800 flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                                {variety}
                                            </td>
                                            <td className="px-6 py-4 text-center font-mono font-bold text-green-600">{Math.floor(grades.A / 0.2)}</td>
                                            <td className="px-6 py-4 text-center font-mono font-bold text-blue-600">{Math.floor(grades.B / 0.2)}</td>
                                            <td className="px-6 py-4 text-center font-mono font-bold text-orange-600">{Math.floor(grades.C / 0.2)}</td>
                                            <td className="px-6 py-4 text-right">
                                                <span className="bg-slate-100 px-3 py-1 rounded-full font-black text-slate-700 text-xs">
                                                    {totalVarietyPacks} Packs
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
                <div className="flex flex-col gap-8">
                    {/* Unscheduled Orders Tray */}
                    {unscheduledItems.length > 0 && (
                        <div className="bg-orange-50 border-2 border-orange-100 p-6 rounded-[2.5rem] shadow-sm animate-fade-in-down">
                            <div className="flex justify-between items-center mb-6 px-2">
                                <div>
                                    <h3 className="text-sm font-black text-orange-900 uppercase tracking-[0.2em] flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 bg-orange-500 rounded-full animate-pulse"></span>
                                        Unscheduled Orders Tray
                                    </h3>
                                    <p className="text-[10px] text-orange-700 font-bold uppercase mt-1">Pending driver assignment & delivery window</p>
                                </div>
                                <span className="bg-orange-200 text-orange-900 px-4 py-1.5 rounded-full text-xs font-black shadow-sm">
                                    {unscheduledItems.length} TASK(S)
                                </span>
                            </div>
                            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-orange-200">
                                {unscheduledItems.map(del => (
                                    <div key={del.id} className="min-w-[320px] bg-white p-6 rounded-3xl border border-orange-200 shadow-lg hover:shadow-xl transition-all group relative overflow-hidden">
                                        <div className="absolute top-0 right-0 p-3 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
                                            <svg className="w-24 h-24 text-orange-600" fill="currentColor" viewBox="0 0 24 24"><path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/></svg>
                                        </div>
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="text-[10px] font-mono font-black text-orange-400 uppercase">#DO-{del.id.slice(-6).toUpperCase()}</div>
                                            <button 
                                                onClick={() => { setActiveDelivery(del); setIsScheduleModalOpen(true); }}
                                                className="bg-orange-600 text-white text-[10px] font-black px-4 py-1.5 rounded-xl uppercase hover:bg-orange-700 shadow-md transform hover:-translate-y-0.5 active:scale-95 transition-all"
                                            >
                                                Assign & Schedule
                                            </button>
                                        </div>
                                        <h4 className="text-base font-black text-slate-900 mb-1 truncate">{del.customerName}</h4>
                                        <p className="text-[11px] text-slate-500 font-bold uppercase leading-relaxed line-clamp-2 min-h-[32px] mb-2 italic">"{del.orderSummary}"</p>
                                        <div className="text-[10px] text-slate-400 font-bold uppercase">PIC: {del.pic || 'TBD'}</div>
                                        <div className="flex items-center gap-3 pt-4 border-t border-slate-50">
                                            <div className="flex-1">
                                                <div className="text-[9px] font-black text-slate-400 uppercase mb-0.5">Sale Reference</div>
                                                <div className="text-xs font-black text-slate-700">{del.saleId}</div>
                                            </div>
                                            <button 
                                                onClick={() => printDeliveryOrder(del)}
                                                className="p-2.5 bg-slate-50 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-all"
                                                title="Preview Order"
                                            >
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="flex justify-between items-center bg-white/50 p-2 rounded-2xl border border-white shadow-sm flex-wrap gap-4">
                            <div className="flex gap-1 flex-wrap">
                                {[
                                    { id: 'ALL', label: `All Active (${activeCounts.ALL})` },
                                    { id: 'PENDING_SCHEDULE', label: `Unscheduled (${activeCounts.PENDING_SCHEDULE})` },
                                    { id: 'SCHEDULED', label: `Scheduled (${activeCounts.SCHEDULED})` },
                                    { id: 'OUT_FOR_DELIVERY', label: `In Transit (${activeCounts.OUT_FOR_DELIVERY})` },
                                    { id: 'FAILED', label: `Reschedule (${activeCounts.FAILED})` }
                                ].map(filter => (
                                    <button 
                                        key={filter.id} 
                                        onClick={() => setLogisticsFilter(filter.id as any)} 
                                        className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap ${logisticsFilter === filter.id ? 'bg-white text-blue-600 shadow-md ring-1 ring-blue-100' : 'text-gray-400 hover:text-gray-600'}`}
                                    >
                                        {filter.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-sm">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                                <thead className="bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                    <tr>
                                        <th className="px-8 py-6">Status & Identifier</th>
                                        <th className="px-8 py-6">Consignee & Destination</th>
                                        <th className="px-8 py-6 text-center">Schedule</th>
                                        <th className="px-8 py-6">Personnel</th>
                                        <th className="px-8 py-6 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredDeliveries.map(del => {
                                        const linkedCust = customers.find(c => c.name === del.customerName);
                                        const displayPIC = del.pic || linkedCust?.pic || 'N/A';
                                        
                                        return (
                                            <tr key={del.id} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="px-8 py-6">
                                                    <div className="flex flex-col gap-1.5">
                                                        <span className={`w-fit px-3 py-1 rounded-full text-[9px] font-black uppercase border ${
                                                            del.status === 'DELIVERED' ? 'bg-green-50 text-green-700 border-green-100' : 
                                                            del.status === 'OUT_FOR_DELIVERY' ? 'bg-blue-50 text-blue-700 border-blue-100' : 
                                                            del.status === 'FAILED' ? 'bg-red-50 text-red-700 border-red-100' : 
                                                            del.status === 'PENDING_SCHEDULE' ? 'bg-orange-50 text-orange-700 border-orange-100 animate-pulse' :
                                                            'bg-gray-50 text-gray-700 border-gray-100'
                                                        }`}>
                                                            {del.status.replace(/_/g, ' ')}
                                                        </span>
                                                        <div className="text-[11px] font-mono font-black text-slate-300 uppercase tracking-tighter">#DO-{del.id.slice(-6).toUpperCase()}</div>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <div className="font-black text-slate-900 truncate max-w-[200px] text-sm">
                                                        {del.customerName}
                                                    </div>
                                                    <div className="text-[10px] text-slate-400 font-bold truncate max-w-[200px] uppercase mt-0.5">{del.destinationAddress}</div>
                                                    <div className="flex items-center gap-1.5 mt-1">
                                                        <span className="text-[10px] text-indigo-500 font-black uppercase">PIC: {displayPIC}</span>
                                                        {linkedCust && <span className="text-[8px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-100 font-bold">CRM LINKED</span>}
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6 text-center">
                                                    {del.deliveryDate ? (
                                                        <>
                                                            <div className="text-sm font-black text-slate-700">{new Date(del.deliveryDate).toLocaleDateString()}</div>
                                                            <div className="text-[10px] text-slate-400 font-black tracking-widest">{del.deliveryTime}</div>
                                                        </>
                                                    ) : <span className="text-[10px] font-black text-slate-300 italic">WAITING SCHEDULE</span>}
                                                </td>
                                                <td className="px-8 py-6">
                                                    <div className="font-black text-slate-700 text-xs">{del.driverName}</div>
                                                    <div className="text-[10px] text-slate-400 font-bold uppercase">{del.vehicleType}</div>
                                                </td>
                                                <td className="px-8 py-6 text-right">
                                                    <div className="flex justify-end items-center gap-3">
                                                        <button title="Print Order" onClick={() => printDeliveryOrder(del)} className="p-2.5 bg-slate-50 rounded-2xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all">
                                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                                                        </button>
                                                        
                                                        {del.status === 'PENDING_SCHEDULE' && (
                                                            <button onClick={() => { setActiveDelivery(del); setIsScheduleModalOpen(true); }} className="px-4 py-2 bg-orange-600 text-white text-[10px] font-black rounded-xl uppercase hover:bg-orange-700 shadow-md">Schedule</button>
                                                        )}

                                                        {del.status === 'SCHEDULED' && (
                                                            <>
                                                                <button onClick={() => { setActiveDelivery(del); setIsScheduleModalOpen(true); }} className="px-3 py-1.5 bg-slate-100 text-slate-600 text-[10px] font-black rounded-xl uppercase hover:bg-slate-200">Edit</button>
                                                                <button onClick={() => handleDepart(del)} className="px-4 py-2 bg-blue-600 text-white text-[10px] font-black rounded-xl uppercase hover:bg-blue-700 shadow-md">Depart</button>
                                                            </>
                                                        )}
                                                        
                                                        {del.status === 'OUT_FOR_DELIVERY' && (
                                                            <div className="flex gap-2">
                                                                <button onClick={() => { setActiveDelivery(del); setOutcomeType('DELIVERED'); setIsProofModalOpen(true); }} className="px-3 py-1.5 bg-emerald-600 text-white text-[10px] font-black rounded-xl uppercase shadow-md">Deliver</button>
                                                                <button onClick={() => { setActiveDelivery(del); setOutcomeType('FAILED'); setIsProofModalOpen(true); }} className="px-3 py-1.5 bg-rose-600 text-white text-[10px] font-black rounded-xl uppercase shadow-md">Failed</button>
                                                            </div>
                                                        )}
                                                        
                                                        {del.status === 'FAILED' && (
                                                            <button onClick={() => { setActiveDelivery(del); setIsScheduleModalOpen(true); }} className="px-4 py-2 bg-blue-500 text-white text-[10px] font-black rounded-xl uppercase shadow-md">Reschedule</button>
                                                        )}

                                                        {(del.status === 'DELIVERED' || del.status === 'FAILED') && (
                                                            <button title="View Outcome" onClick={() => { setActiveDelivery(del); setProofImage(del.evidenceImage || null); setIsProofViewerOpen(true); }} className={`p-2.5 rounded-2xl transition-all border ${del.status === 'DELIVERED' ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268-2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {filteredDeliveries.length === 0 && (
                                        <tr><td colSpan={5} className="px-8 py-20 text-center text-slate-300 italic font-medium">No active delivery records found for this segment.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Restored Stock Movements Tab */}
            {subTab === 'movement' && canViewMovements && (
                <div className="space-y-6 animate-fade-in">
                    <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                        <div className="flex gap-2">
                            <button onClick={() => setMovementFilter('ALL')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase ${movementFilter === 'ALL' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}>All</button>
                            <button onClick={() => setMovementFilter('IN')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase ${movementFilter === 'IN' ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}>In</button>
                            <button onClick={() => setMovementFilter('OUT')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase ${movementFilter === 'OUT' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}>Out</button>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={handleExportMovementsCSV} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase hover:bg-slate-50 transition-all flex items-center gap-2">
                                Export CSV
                            </button>
                            <button onClick={handlePrintMovementsPDF} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg">
                                Print Report
                            </button>
                        </div>
                    </div>

                    <div className="bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-sm">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                <tr>
                                    <th className="px-8 py-6 text-left">Date & Time</th>
                                    <th className="px-8 py-6 text-left">Movement Type</th>
                                    <th className="px-8 py-6 text-left">Reference / Batch</th>
                                    <th className="px-8 py-6 text-right">Net Units (Packs)</th>
                                    <th className="px-8 py-6 text-right">Performed By</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredMovements.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(mov => (
                                    <tr key={mov.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-8 py-6">
                                            <div className="text-xs font-black text-slate-700">{new Date(mov.date).toLocaleDateString()}</div>
                                            <div className="text-[10px] text-slate-400 font-mono">{new Date(mov.date).toLocaleTimeString()}</div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase border ${mov.type === 'IN' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
                                                Stock {mov.type}
                                            </span>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="font-bold text-slate-700 text-xs">{(mov as any).mushroomType ? `${(mov as any).mushroomType} Grade ${(mov as any).grade}` : mov.batchId}</div>
                                            <div className="text-[10px] text-slate-400 font-mono uppercase">{mov.referenceId}</div>
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            <div className={`text-base font-black ${mov.type === 'IN' ? 'text-emerald-900' : 'text-slate-900'}`}>
                                                {mov.type === 'IN' ? '+' : '-'}{Math.round(Math.abs(mov.quantity) / 0.2)} Packs
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 text-right text-xs text-slate-500 font-medium">
                                            {mov.performedBy.split('@')[0]}
                                        </td>
                                    </tr>
                                ))}
                                {filteredMovements.length === 0 && (
                                    <tr><td colSpan={5} className="px-8 py-20 text-center text-slate-300 italic font-medium">No movement records found.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {(subTab === 'history' && canViewHistory) && (
                <div className="space-y-4 animate-fade-in">
                    <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                        <div>
                            <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">Delivery Fulfillment History</h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Audit log of all completed and attempted dispatches</p>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={handleExportDeliveryHistoryCSV} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase hover:bg-slate-50 transition-all flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                Export CSV
                            </button>
                            <button onClick={handlePrintDeliveryHistoryPDF} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                                Print Summary
                            </button>
                        </div>
                    </div>
                    <div className="bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-sm">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                <tr>
                                    <th className="px-8 py-6 text-left">Date & ID</th>
                                    <th className="px-8 py-6 text-left">Consignee Details</th>
                                    <th className="px-8 py-6 text-left">Fleet Personnel</th>
                                    <th className="px-8 py-6 text-center">Outcome</th>
                                    <th className="px-8 py-6 text-right">Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {deliveries.filter(d => d.status === 'DELIVERED' || d.status === 'FAILED')
                                    .sort((a,b) => (b.deliveryDate || '').localeCompare(a.deliveryDate || ''))
                                    .map(del => {
                                        const linkedCust = customers.find(c => c.name === del.customerName);
                                        const displayPIC = del.pic || linkedCust?.pic || 'N/A';
                                        
                                        return (
                                            <tr key={del.id} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="px-8 py-6">
                                                    <div className="text-xs font-black text-slate-700">{del.deliveryDate}</div>
                                                    <div className="text-[10px] font-mono text-slate-400 uppercase">#DO-{del.id.slice(-6).toUpperCase()}</div>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <div className="text-sm font-black text-slate-900">{del.customerName || 'N/A'}</div>
                                                    <div className="text-[10px] text-slate-400 font-bold uppercase truncate max-w-[200px]">{del.destinationAddress}</div>
                                                    <div className="text-[10px] text-indigo-500 font-bold">PIC: {displayPIC}</div>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <div className="text-xs font-black text-slate-700">{del.driverName}</div>
                                                    <div className="text-[10px] text-slate-400 font-bold uppercase">{del.vehicleType}</div>
                                                </td>
                                                <td className="px-8 py-6 text-center">
                                                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase border ${del.status === 'DELIVERED' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                                                        {del.status}
                                                    </span>
                                                    {del.failureReason && <div className="text-[8px] text-red-400 font-bold mt-1 uppercase italic">{del.failureReason}</div>}
                                                </td>
                                                <td className="px-8 py-6 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <button onClick={() => { setActiveDelivery(del); setProofImage(del.evidenceImage || null); setIsProofViewerOpen(true); }} className="p-2 bg-slate-50 rounded-xl text-slate-400 hover:text-indigo-600 transition-colors border border-slate-100">
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268-2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                                        </button>
                                                        <button onClick={() => printDeliveryOrder(del)} className="p-2 bg-slate-50 rounded-xl text-slate-400 hover:text-blue-600 transition-colors border border-slate-100">
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                {deliveries.filter(d => d.status === 'DELIVERED' || d.status === 'FAILED').length === 0 && (
                                    <tr><td colSpan={5} className="px-8 py-20 text-center text-slate-300 italic font-medium">No historical fulfillment records available.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            
            {isScheduleModalOpen && activeDelivery && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-scale-up">
                        <div className="p-8 bg-indigo-600 text-white flex justify-between items-center">
                            <h3 className="font-black uppercase tracking-[0.2em] text-xs">
                                {activeDelivery.status === 'PENDING_SCHEDULE' ? 'Fleet Assignment' : 'Reschedule Order'}
                            </h3>
                            <button onClick={() => setIsScheduleModalOpen(false)} className="text-white hover:text-white/80 font-bold text-3xl">×</button>
                        </div>
                        <div className="p-10 space-y-8">
                            <div className="p-5 bg-indigo-50 rounded-[1.5rem] border border-indigo-100 flex justify-between items-start">
                                <div>
                                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">Customer Order Information</p>
                                    <p className="text-slate-900 font-black text-lg mb-1 leading-tight">{activeDelivery.customerName}</p>
                                    <p className="text-indigo-700 font-bold italic text-xs leading-relaxed">"{activeDelivery.orderSummary || 'No items listed'}"</p>
                                </div>
                                {customers.some(c => c.name === activeDelivery.customerName) && (
                                    <span className="bg-emerald-100 text-emerald-700 text-[8px] font-black px-2 py-1 rounded-lg border border-emerald-200">CRM LINKED</span>
                                )}
                            </div>
                            
                            <div className="grid grid-cols-2 gap-5">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase ml-1 mb-1.5 tracking-widest">Delivery Date</label>
                                    <input type="date" value={scheduleDate} onChange={e=>setScheduleDate(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold shadow-inner" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase ml-1 mb-1.5 tracking-widest">Dispatch Time</label>
                                    <input type="time" value={scheduleTime} onChange={e=>setScheduleTime(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold shadow-inner font-mono" />
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-5">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase ml-1 mb-1.5 tracking-widest">Assigned Driver</label>
                                    <select 
                                        value={scheduleDriver.id} 
                                        onChange={e => {
                                            const d = DRIVER_LIST.find(x => x.id === e.target.value);
                                            if (d) setScheduleDriver(d);
                                        }} 
                                        className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold shadow-inner"
                                    >
                                        {DRIVER_LIST.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase ml-1 mb-1.5 tracking-widest">Vehicle Asset</label>
                                    <select 
                                        value={scheduleVehicle.id} 
                                        onChange={e => {
                                            const v = VEHICLE_LIST.find(x => x.id === e.target.value);
                                            if (v) setScheduleVehicle(v);
                                        }} 
                                        className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold shadow-inner"
                                    >
                                        {VEHICLE_LIST.map(v => <option key={v.id} value={v.id}>{v.type}</option>)}
                                    </select>
                                </div>
                            </div>
                            
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase ml-1 mb-1.5 tracking-widest">Person In Charge (PIC)</label>
                                    <input type="text" value={schedulePIC} onChange={e=>setSchedulePIC(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold shadow-inner" placeholder="Enter recipient name" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase ml-1 mb-1.5 tracking-widest">Full Delivery Address</label>
                                    <textarea value={scheduleAddress} onChange={e=>setScheduleAddress(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold shadow-inner h-24" placeholder="Enter full address" />
                                </div>
                            </div>
                            
                            <button 
                                onClick={handleConfirmSchedule} 
                                disabled={loading}
                                className="w-full py-5 rounded-3xl font-black uppercase text-sm bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl transition-all active:scale-95 disabled:opacity-30"
                            >
                                {loading ? 'Committing...' : 'Commit Assignment'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isProofModalOpen && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-scale-up">
                        <div className={`p-8 ${outcomeType === 'DELIVERED' ? 'bg-emerald-600' : 'bg-rose-600'} text-white flex justify-between items-center`}>
                            <h3 className="font-black uppercase tracking-[0.2em] text-xs">{outcomeType === 'DELIVERED' ? 'Confirm Delivery' : 'Log Delivery Failure'}</h3>
                            <button onClick={() => setIsProofModalOpen(false)} className="text-white hover:text-white/80 font-bold text-3xl">×</button>
                        </div>
                        <div className="p-10 space-y-8">
                            <div className="text-center">
                                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-2">Protocol Requirement</p>
                                <p className="text-sm text-slate-700 leading-relaxed italic font-medium">
                                    {outcomeType === 'DELIVERED' 
                                        ? '"Upload photographic evidence of arrival to notify client."' 
                                        : '"Select the primary reason for unsuccessful fulfillment below."'}
                                </p>
                            </div>

                            {outcomeType === 'FAILED' ? (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-500 uppercase ml-1 mb-1.5 tracking-widest">Reason for Interruption</label>
                                        <select 
                                            value={selectedFailureReason}
                                            onChange={e => setSelectedFailureReason(e.target.value)}
                                            className="w-full p-4 rounded-2xl border-none bg-slate-100 text-sm font-bold shadow-inner"
                                        >
                                            {FAILURE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                                        </select>
                                    </div>
                                    {selectedFailureReason === 'Other (please specify)' && (
                                        <div className="animate-fade-in-up">
                                            <label className="block text-[10px] font-black text-slate-500 uppercase ml-1 mb-1.5 tracking-widest">Detailed Memo</label>
                                            <textarea 
                                                value={otherReason}
                                                onChange={e => setOtherReason(e.target.value)}
                                                className="w-full p-4 rounded-2xl border-none bg-slate-100 text-sm font-medium shadow-inner min-h-[100px]"
                                                placeholder="Enter observations..."
                                            />
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="border-2 border-dashed border-slate-200 rounded-[2rem] p-4 text-center hover:border-blue-400 transition-colors bg-slate-50">
                                    {proofImage ? (
                                        <div className="relative">
                                            <img src={proofImage} className="w-full h-56 object-cover rounded-[1.5rem] shadow-inner border border-white" alt="Evidence" />
                                            <button onClick={() => setProofImage(null)} className="absolute top-2 right-2 bg-rose-500 text-white p-2 rounded-full hover:bg-rose-600 shadow-xl">
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12"/></svg>
                                            </button>
                                        </div>
                                    ) : (
                                        <label className="cursor-pointer flex flex-col items-center py-16">
                                            <div className="bg-white p-6 rounded-3xl mb-4 shadow-sm text-emerald-500">
                                                <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                                            </div>
                                            <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Capture Evidence</span>
                                            <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                                        </label>
                                    )}
                                </div>
                            )}

                            <button 
                                onClick={handleFinalizeOutcome} 
                                disabled={loading}
                                className={`w-full py-5 rounded-3xl font-black uppercase text-sm shadow-xl transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-30 disabled:grayscale ${loading ? 'opacity-50' : (outcomeType === 'DELIVERED' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-rose-600 hover:bg-rose-700 text-white')}`}
                            >
                                {loading ? 'Syncing...' : `Finalize & Log Result`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Proof Viewer Modal */}
            {isProofViewerOpen && activeDelivery && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[110] p-4 backdrop-blur-md">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-scale-up">
                        <div className="p-6 border-b flex justify-between items-center bg-green-50">
                            <div>
                                <h3 className="font-black uppercase tracking-widest text-xs text-green-800">Historical Proof of Delivery</h3>
                                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Ref: #DO-{activeDelivery.id.slice(-6).toUpperCase()} • Logged {activeDelivery.deliveredAt ? new Date(activeDelivery.deliveredAt).toLocaleString() : 'N/A'}</p>
                            </div>
                            <button onClick={() => setIsProofViewerOpen(false)} className="text-gray-400 hover:text-gray-600 font-bold text-2xl">×</button>
                        </div>
                        <div className="p-8 flex flex-col md:flex-row gap-8 items-start">
                            <div className="flex-1 space-y-4 w-full text-left">
                                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                    <h4 className="text-[9px] font-bold text-gray-400 uppercase mb-2 tracking-widest">Destination</h4>
                                    <div className="text-xs font-bold text-gray-700">{activeDelivery.destinationAddress}</div>
                                    <div className="text-[10px] text-blue-600 font-bold mt-1">Customer: {activeDelivery.customerEmail}</div>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                    <h4 className="text-[9px] font-bold text-gray-400 uppercase mb-2 tracking-widest">Audit Info</h4>
                                    <div className="text-xs font-bold text-gray-700">Driver: {activeDelivery.driverName}</div>
                                    <div className="text-[10px] text-gray-500 font-medium uppercase mt-1">Vehicle: {activeDelivery.vehicleType}</div>
                                </div>
                                <button 
                                    onClick={() => printDeliveryOrder(activeDelivery)}
                                    className="w-full py-3 bg-blue-600 text-white rounded-xl text-xs font-black uppercase hover:bg-blue-700 transition-all shadow-md flex items-center justify-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                                    Re-Print Delivery Order
                                </button>
                            </div>
                            <div className="flex-1 w-full text-center">
                                <h4 className="text-[9px] font-bold text-gray-400 uppercase mb-2 tracking-widest">Evidence Snapshot</h4>
                                {activeDelivery.evidenceImage ? (
                                    <img 
                                        src={activeDelivery.evidenceImage} 
                                        className="w-full h-auto rounded-2xl shadow-xl border border-gray-100 hover:scale-[1.02] transition-transform cursor-pointer" 
                                        alt="Evidence" 
                                        onClick={() => window.open(activeDelivery.evidenceImage, '_blank')} 
                                    />
                                ) : (
                                    <div className="h-48 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-300 italic text-xs">
                                        No image logged for this delivery
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