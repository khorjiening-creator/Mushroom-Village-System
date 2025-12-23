
import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, setDoc, updateDoc, query, orderBy, limit, increment, addDoc, where, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { VillageType, Customer, Sale, Product, CartItem, FinancialRecord, UserRole, InventoryItem, ProcessingLog } from '../../types';
import { MUSHROOM_VARIETIES } from './SharedComponents';
import { MUSHROOM_PRICES } from '../../constants';

interface SalesTabProps {
    villageId: VillageType;
    userEmail: string;
    staffId: string;
    userRole: UserRole;
    isAdmin: boolean;
    theme: any;
    onSuccess: (msg: string) => void;
    onError?: (msg: string) => void;
    financialRecords: FinancialRecord[];
}

export const SalesTab: React.FC<SalesTabProps> = ({ 
    villageId, 
    userEmail, 
    staffId, 
    userRole, 
    isAdmin, 
    theme, 
    onSuccess, 
    onError, 
    financialRecords 
}) => {
    const [viewMode, setViewMode] = useState<'POS' | 'INVENTORY' | 'CRM' | 'HISTORY'>('POS');
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [sales, setSales] = useState<Sale[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [channelFilter, setChannelFilter] = useState<'ALL' | 'LOCAL_MARKET' | 'WHOLESALER' | 'ONLINE'>('ALL');
    
    // Live Stock Dependencies
    const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
    const [activeProcessing, setActiveProcessing] = useState<ProcessingLog[]>([]);

    // POS Cart State
    const [cart, setCart] = useState<CartItem[]>([]);
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'E-Wallet' | 'Online Banking' | 'Cheque'>('Cash');
    const [saleChannel, setSaleChannel] = useState<'LOCAL_MARKET' | 'WHOLESALER' | 'ONLINE'>('LOCAL_MARKET');
    const [isProcessing, setIsProcessing] = useState(false);

    // Modal states
    const [showCustomerModal, setShowCustomerModal] = useState(false);
    const [isSubmittingCustomer, setIsSubmittingCustomer] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
    const [showAdjModal, setShowAdjModal] = useState(false);
    const [isSubmittingAdj, setIsSubmittingAdj] = useState(false);

    // Adjustment fields
    const [adjProductId, setAdjProductId] = useState('');
    const [adjNewQty, setAdjNewQty] = useState('');
    const [adjReason, setAdjReason] = useState('Stock Count Correction');

    // Customer fields
    const [custName, setCustName] = useState('');
    const [custEmail, setCustEmail] = useState('');
    const [custPhone, setCustPhone] = useState('');
    const [custType, setCustType] = useState<'WHOLESALE' | 'RETAIL' | 'LOCAL'>('RETAIL');

    useEffect(() => {
        const unsubCust = onSnapshot(collection(db, 'customers'), (snap) => {
            setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
        });

        const collectionSuffix = villageId.replace(/\s/g, '');
        const unsubProd = onSnapshot(collection(db, `products_${collectionSuffix}`), (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
            // Check if we need to seed new products (simple check: if list is empty or doesn't contain a key type)
            const hasOyster = list.some(p => p.name.includes('Oyster'));
            if (list.length === 0 || !hasOyster) seedInitialProducts(list);
            else setProducts(list);
        });

        const qInv = query(collection(db, "inventory_items"), where("villageId", "==", villageId));
        const unsubInv = onSnapshot(qInv, (snap) => {
            setInventoryItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryItem)));
        });

        const qProc = query(collection(db, "processing_logs"), where("villageId", "==", villageId), where("status", "==", "IN_PROGRESS"));
        const unsubProc = onSnapshot(qProc, (snap) => {
            setActiveProcessing(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProcessingLog)));
        });

        const unsubSales = onSnapshot(query(collection(db, `sales_${collectionSuffix}`), orderBy('timestamp', 'desc'), limit(150)), (snap) => {
            setSales(snap.docs.map(d => ({ id: d.id, ...d.data() } as Sale)));
        });

        return () => { unsubCust(); unsubProd(); unsubInv(); unsubProc(); unsubSales(); };
    }, [villageId]);

    // DERIVED: Map Sale records to their actual status based on Financial Records
    const salesWithSyncedStatus = useMemo(() => {
        return sales.map(sale => {
            // Find the matching financial record by orderNumber
            const finRec = financialRecords.find(f => f.orderNumber === sale.id || f.transactionId === `TXN-S-${sale.id}`);
            const actualStatus = finRec?.status || sale.status || 'PENDING';
            return { ...sale, status: actualStatus as any };
        });
    }, [sales, financialRecords]);

    const productsWithLiveStock = useMemo(() => {
        return products.map(p => {
            // Determine relevant inventory items based on Product Name matching Mushroom Variety + Grade
            const matchingItems = inventoryItems.filter(item => 
                p.name.includes(item.mushroomType) && 
                (p.grade ? (item.grade === p.grade || p.name.includes(`Grade ${item.grade}`)) : true)
            );

            // Sum up Inventory KG
            const totalKgInStock = matchingItems.reduce((acc, curr) => acc + curr.currentStock, 0);

            // Convert to Product Units
            let finalStock = 0;
            if (p.unit === 'pack' || p.unit === 'pkt') {
                // Assuming 200g packs
                finalStock = Math.floor(totalKgInStock / 0.2);
            } else if (p.unit === 'kg') {
                finalStock = totalKgInStock;
            } else {
                finalStock = totalKgInStock; // Default fallback
            }

            // Calculate In-Process Stock (WIP) from Processing Logs
            const inProcessKg = activeProcessing
                .filter(log => p.name.includes(log.mushroomType))
                .reduce((acc, curr) => {
                    if (curr.currentStep >= 3 && curr.grades) {
                        const gradeKey = `grade${p.grade || 'A'}` as keyof typeof curr.grades;
                        return acc + (curr.grades[gradeKey] || 0);
                    }
                    return acc + curr.actualWeight;
                }, 0);
            
            // Convert WIP to Product Units
            let inProcessStock = 0;
            if (p.unit === 'pack' || p.unit === 'pkt') {
                inProcessStock = Math.floor(inProcessKg / 0.2);
            } else {
                inProcessStock = inProcessKg;
            }

            return { 
                ...p, 
                packagedStock: finalStock, 
                inProcessStock,
                stock: finalStock 
            };
        });
    }, [products, inventoryItems, activeProcessing]);

    const seedInitialProducts = async (currentList: Product[] = []) => {
        const defaults: Product[] = [];
        
        MUSHROOM_VARIETIES.forEach(variety => {
            // Check if already exists to avoid overwriting or duplicates
            const hasPack = currentList.some(p => p.name.includes(variety) && p.unit === 'pack');
            const hasBulk = currentList.some(p => p.name.includes(variety) && p.unit === 'kg');
            
            const pricePerKg = MUSHROOM_PRICES[variety] || 15;
            const packPrice = (pricePerKg * 0.2) + 0.50; // Base + Packaging Premium
            
            if (!hasPack) {
                defaults.push({
                    id: `P-${variety.substring(0,3).toUpperCase()}-PKT-A`,
                    name: `${variety} (200g Pack) - Grade A`,
                    category: 'FRESH',
                    grade: 'A',
                    unitPrice: Number(packPrice.toFixed(2)),
                    stock: 0,
                    unit: 'pack',
                    villageId
                });
            }
            
            if (!hasBulk) {
                defaults.push({
                    id: `P-${variety.substring(0,3).toUpperCase()}-BLK-A`,
                    name: `${variety} Bulk - Grade A`,
                    category: 'WHOLESALE',
                    grade: 'A',
                    unitPrice: pricePerKg,
                    stock: 0,
                    unit: 'kg',
                    villageId
                });
            }
        });

        // Add special items if missing
        if (!currentList.some(p => p.category === 'DRIED')) {
            defaults.push({ id: 'P-DRI-S', name: 'Dried Shiitake - Premium', category: 'DRIED', grade: 'A', unitPrice: 45.00, stock: 0, unit: 'kg', villageId });
        }

        const colSuffix = villageId.replace(/\s/g, '');
        for (const p of defaults) { 
            await setDoc(doc(db, `products_${colSuffix}`, p.id), p); 
        }
    };

    const handlePrintReceipt = (sale: Sale) => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        // Use derived status for document decision
        const finRec = financialRecords.find(f => f.orderNumber === sale.id || f.transactionId === `TXN-S-${sale.id}`);
        const actualStatus = finRec?.status || sale.status || 'PENDING';
        const isPending = actualStatus === 'PENDING';
        const docType = isPending ? 'CUSTOMER ORDER' : 'SALES RECEIPT';
        
        const itemsHtml = sale.items.map(item => `
            <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #eee;">
                    <div style="font-weight: bold; font-size: 14px;">${item.name}</div>
                    <div style="font-size: 10px; color: #666;">QTY: ${item.quantity} x RM${item.unitPrice.toFixed(2)}</div>
                </td>
                <td style="padding: 10px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: bold; vertical-align: top;">
                    RM${(item.quantity * item.unitPrice).toFixed(2)}
                </td>
            </tr>
        `).join('');

        printWindow.document.write(`
            <html>
                <head>
                    <title>${docType} - ${sale.id}</title>
                    <style>
                        body { font-family: 'Courier New', Courier, monospace; width: 350px; margin: 0 auto; padding: 20px; color: #000; line-height: 1.3; font-size: 12px; }
                        .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 15px; margin-bottom: 15px; }
                        .doc-type { font-size: 18px; font-weight: bold; text-transform: uppercase; margin-top: 10px; border: 1px solid #000; display: inline-block; padding: 2px 10px; }
                        .village-name { font-size: 22px; font-weight: 800; margin: 0; }
                        .info { margin-bottom: 15px; }
                        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
                        .totals { border-top: 2px solid #000; padding-top: 10px; margin-top: 10px; }
                        .footer { text-align: center; margin-top: 30px; font-size: 10px; border-top: 1px dashed #ccc; padding-top: 15px; color: #666; }
                        @media print { body { width: 100%; padding: 0; } }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <p class="village-name">VILLAGE C</p>
                        <p>Processing & Logistics Center</p>
                        <div class="doc-type">${docType}</div>
                    </div>
                    
                    <div class="info">
                        <div style="display: flex; justify-content: space-between;"><span>REF ID:</span> <b>${sale.id}</b></div>
                        <div style="display: flex; justify-content: space-between;"><span>DATE:</span> <span>${new Date(sale.timestamp).toLocaleString()}</span></div>
                        <div style="display: flex; justify-content: space-between;"><span>CLERK:</span> <span>${sale.recordedBy.split('@')[0].toUpperCase()}</span></div>
                        <div style="display: flex; justify-content: space-between; margin-top: 5px;"><span>CLIENT:</span> <b>${sale.customerName}</b></div>
                    </div>

                    <table>
                        <thead>
                            <tr style="border-bottom: 1px solid #000; text-align: left; font-size: 10px;">
                                <th>DESCRIPTION</th>
                                <th style="text-align: right;">TOTAL</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml}
                        </tbody>
                    </table>

                    <div class="totals">
                        <div style="display: flex; justify-content: space-between; font-size: 18px; font-weight: 900;">
                            <span>GRAND TOTAL:</span>
                            <span>RM${sale.totalAmount.toFixed(2)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 8px;">
                            <span>PAYMENT MODE:</span>
                            <span>${(finRec?.paymentMethod || sale.paymentMethod).toUpperCase()}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 11px;">
                            <span>SALES STATUS:</span>
                            <span style="color: ${isPending ? '#e67e22' : '#27ae60'}; font-weight: bold;">${actualStatus.toUpperCase()}</span>
                        </div>
                    </div>

                    <div class="footer">
                        ${isPending ? 'PLEASE COMPLETE PAYMENT TO RECEIVE OFFICIAL RECEIPT.' : 'THANK YOU FOR YOUR BUSINESS!'}
                        <br>Generated by AAIS System v2.5.0
                    </div>
                    <script>window.onload = () => { window.print(); window.close(); }</script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    const handleExportHistory = () => {
        const headers = ["Sale ID", "Date", "Customer", "Items", "Total (RM)", "Method", "Channel", "Status", "Staff"];
        const rows = filteredSales.map(s => [s.id, new Date(s.timestamp).toLocaleDateString(), s.customerName, s.items.map(i => `${i.name}(${i.quantity})`).join('; '), s.totalAmount.toFixed(2), s.paymentMethod, s.channel, s.status, s.recordedBy]);
        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `sales_history_${villageId.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const addToCart = (product: any) => {
        if (product.stock <= 0) return;
        setCart(prev => {
            const existing = prev.find(i => i.productId === product.id);
            if (existing) {
                if (existing.quantity >= product.stock) return prev;
                return prev.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i);
            }
            return [...prev, { 
                productId: product.id, 
                name: product.name, 
                quantity: 1, 
                unitPrice: product.unitPrice,
                landedCost: product.lastLandedCost || 0
            }];
        });
    };

    const updateCartQty = (productId: string, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.productId === productId) {
                const product = productsWithLiveStock.find(p => p.id === productId);
                const newQty = Math.max(1, item.quantity + delta);
                if (product && newQty > product.stock) return item;
                return { ...item, quantity: newQty };
            }
            return item;
        }));
    };

    const removeFromCart = (productId: string) => {
        setCart(prev => prev.filter(i => i.productId !== productId));
    };

    const cartTotal = useMemo(() => cart.reduce((acc, i) => acc + (i.quantity * i.unitPrice), 0), [cart]);

    const handleConfirmSale = async () => {
        if (!selectedCustomerId || cart.length === 0) return;
        setIsProcessing(true);
        try {
            const customer = customers.find(c => c.id === selectedCustomerId)!;
            // Updated prefix to SALE to match user preference/screenshot
            const saleId = `SALE-${Date.now().toString().slice(-6)}`;
            const timestamp = new Date().toISOString();
            const collectionSuffix = villageId.replace(/\s/g, '');

            for (const item of cart) {
                const product = products.find(p => p.id === item.productId);
                if (!product) continue;
                
                // Determine deduction amount in KG
                let kgToDeduct = 0;
                if (product.unit === 'pack') {
                    kgToDeduct = item.quantity * 0.2; // 200g per pack
                } else {
                    kgToDeduct = item.quantity; // Assuming kg
                }

                // Match relevant inventory batches (FIFO)
                const matchingInventory = inventoryItems
                    .filter(i => product.name.includes(i.mushroomType) && (product.grade ? (i.grade === product.grade || product.name.includes(`Grade ${product.grade}`)) : true))
                    .sort((a, b) => a.harvestDate.localeCompare(b.harvestDate)); // FIFO

                let remainingToDeduct = kgToDeduct;
                for (const invBatch of matchingInventory) {
                    if (remainingToDeduct <= 0.001) break;
                    
                    const availableInBatch = invBatch.currentStock;
                    const deductAmount = Math.min(availableInBatch, remainingToDeduct);
                    
                    await updateDoc(doc(db, "inventory_items", invBatch.id), {
                        currentStock: increment(-deductAmount),
                        lastUpdated: timestamp
                    });
                    remainingToDeduct -= deductAmount;
                }
            }

            const totalLandedCost = cart.reduce((acc, item) => acc + ((item.landedCost || 0) * item.quantity), 0);
            const saleData: Sale = {
                id: saleId, customerId: selectedCustomerId, customerName: customer.name,
                items: cart, totalAmount: cartTotal, totalLandedCost,
                paymentMethod, status: 'PENDING', channel: saleChannel,
                recordedBy: userEmail, timestamp, villageId
            };

            await setDoc(doc(db, `sales_${collectionSuffix}`, saleId), saleData);
            await updateDoc(doc(db, 'customers', selectedCustomerId), {
                totalSpent: increment(cartTotal),
                lastPurchaseDate: timestamp,
                loyaltyPoints: increment(Math.floor(cartTotal / 10)) 
            });

            // DEFINE COLLECTIONS FOR DUAL WRITE
            let suffix = 'C';
            if (villageId === VillageType.A) suffix = 'A';
            if (villageId === VillageType.B) suffix = 'B';
            
            const finCol = `financialRecords_${suffix}`;
            const incomeCol = `income_${suffix}`;
            
            const txnId = `TXN-S-${saleId}`;
            const txnData = {
                transactionId: txnId, type: 'INCOME', category: 'Sales',
                amount: cartTotal, date: timestamp.split('T')[0],
                description: `Sale to ${customer.name} via ${saleChannel}`,
                recordedBy: userEmail, villageId, status: 'PENDING', paymentMethod,
                orderNumber: saleId 
            };

            // DUAL WRITE: Main Collection AND Specific Income Collection
            await setDoc(doc(db, finCol, txnId), txnData);
            await setDoc(doc(db, incomeCol, txnId), txnData);

            onSuccess("Sale Logged: Transaction added to ledger as PENDING.");
            setCart([]); setSelectedCustomerId('');
        } catch (err: any) {
            console.error("Sale Error:", err);
            if (onError) onError("Transaction failed.");
        } finally { setIsProcessing(false); }
    };

    const handleSaveCustomer = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmittingCustomer(true);
        try {
            const data: any = { name: custName.trim(), email: custEmail.trim().toLowerCase(), phone: custPhone.trim(), type: custType };
            if (editingCustomer) {
                await updateDoc(doc(db, 'customers', editingCustomer.id), data);
            } else {
                const custId = `CUST-${Date.now().toString().slice(-6)}`;
                await setDoc(doc(db, 'customers', custId), { ...data, id: custId, loyaltyPoints: 0, totalSpent: 0 });
            }
            setShowCustomerModal(false);
            setEditingCustomer(null);
        } catch (err: any) { 
            console.error(err);
        } finally { setIsSubmittingCustomer(false); }
    };

    const handleSaveAdjustment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!adjProductId || adjNewQty === '') return;
        setIsSubmittingAdj(true);
        try {
            const product = products.find(p => p.id === adjProductId);
            if (product) {
                const matchingInventory = inventoryItems.filter(i => product.name.includes(i.mushroomType) && (product.grade ? product.name.includes(`Grade ${product.grade}`) : true));
                if (matchingInventory.length > 0) {
                    const latestBatch = matchingInventory.sort((a,b) => b.lastUpdated.localeCompare(a.lastUpdated))[0];
                    
                    // Logic: Difference in units converted to KG if necessary, but here stock correction is usually direct KG in inventory items
                    // For simplicity, assuming user inputs KG adjustment directly if looking at Inventory Tab, 
                    // but if this modal is "Product Stock", we should probably adjust based on product unit logic or direct kg.
                    // Given previous impl adjusted inventory item directly, let's assume input is in inventory unit (KG).
                    const diff = parseFloat(adjNewQty) - (product.stock * (product.unit === 'pack' ? 0.2 : 1)); // Back to kg estimate for diff
                    
                    await updateDoc(doc(db, "inventory_items", latestBatch.id), { currentStock: increment(diff), lastUpdated: new Date().toISOString() });
                }
            }
            setShowAdjModal(false); setAdjProductId(''); setAdjNewQty('');
        } catch (err: any) { console.error(err); } finally { setIsSubmittingAdj(false); }
    };

    const openEditCustomer = (c: Customer) => {
        setEditingCustomer(c); setCustName(c.name); setCustEmail(c.email); setCustPhone(c.phone); setCustType(c.type); setShowCustomerModal(true);
    };

    const openNewCustomerModal = () => {
        setEditingCustomer(null); setCustName(''); setCustEmail(''); setCustPhone(''); setCustType('RETAIL'); setShowCustomerModal(true);
    };

    const filteredProducts = productsWithLiveStock.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
    const filteredSales = useMemo(() => {
        const list = channelFilter === 'ALL' ? salesWithSyncedStatus : salesWithSyncedStatus.filter(s => s.channel === channelFilter);
        return list;
    }, [salesWithSyncedStatus, channelFilter]);

    return (
        <div className="space-y-6 animate-fade-in-up relative">
            <div className="flex justify-center">
                <div className="bg-slate-100 p-1.5 rounded-2xl flex flex-wrap justify-center gap-1 shadow-inner border border-slate-200">
                    <button onClick={() => setViewMode('POS')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'POS' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}>New Sale</button>
                    <button onClick={() => setViewMode('HISTORY')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'HISTORY' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}>Sales Records</button>
                    <button onClick={() => setViewMode('INVENTORY')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'INVENTORY' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}>Stock Check</button>
                    <button onClick={() => setViewMode('CRM')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'CRM' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}>Customers</button>
                </div>
            </div>

            {viewMode === 'POS' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                        <div className="relative group">
                            <input type="text" placeholder="Search products..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-12 pr-4 py-4 rounded-3xl bg-white border-2 border-slate-100 focus:border-indigo-500 focus:outline-none text-sm font-bold shadow-sm transition-all" />
                            <svg className="absolute left-4 top-4.5 h-5 w-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {filteredProducts.map(p => (
                                <button key={p.id} onClick={() => addToCart(p)} disabled={p.stock <= 0} className={`bg-white p-6 rounded-[2.5rem] border-2 transition-all text-left flex justify-between items-center group shadow-sm ${p.stock <= 0 ? 'opacity-50 grayscale border-slate-100' : 'border-slate-100 hover:border-indigo-400 hover:shadow-xl active:scale-95'}`}>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-base font-black text-slate-900 group-hover:text-indigo-600 transition-colors truncate">{p.name}</p>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">RM{p.unitPrice.toFixed(2)} / {p.unit}</p>
                                        <div className="mt-3 flex items-center gap-2">
                                            <span className={`h-2 w-2 rounded-full ${p.stock > 10 ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                                            <span className="text-[10px] font-black text-slate-500 uppercase">
                                                {p.stock} Available {p.unit === 'pack' ? 'Packets' : p.unit}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-all ml-4">
                                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="bg-slate-900 text-white rounded-[3rem] shadow-2xl p-8 flex flex-col h-fit sticky top-24">
                        <div className="flex justify-between items-center mb-8"><h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Order Summary</h3>{cart.length > 0 && <button onClick={() => setCart([])} className="text-[10px] font-black text-rose-400 uppercase hover:underline">Clear</button>}</div>
                        <div className="space-y-4 mb-8 max-h-[350px] overflow-y-auto scrollbar-hide">
                            {cart.length === 0 ? (
                                <div className="text-center py-12 text-slate-500"><svg className="w-12 h-12 mx-auto mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg><p className="text-[10px] font-bold uppercase tracking-widest">Cart is empty</p></div>
                            ) : (
                                cart.map(item => (
                                    <div key={item.productId} className="bg-white/5 p-4 rounded-2xl flex justify-between items-center border border-white/10">
                                        <div className="flex-1 overflow-hidden"><p className="text-sm font-black truncate">{item.name}</p><p className="text-[10px] text-slate-400 font-bold">RM{item.unitPrice.toFixed(2)} ea</p></div>
                                        <div className="flex items-center gap-3 bg-white/10 rounded-xl px-2 py-1 ml-2">
                                            <button onClick={() => updateCartQty(item.productId, -1)} className="p-1 hover:text-indigo-400"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M20 12H4" /></svg></button>
                                            <span className="text-sm font-black min-w-[20px] text-center">{item.quantity}</span>
                                            <button onClick={() => updateCartQty(item.productId, 1)} className="p-1 hover:text-indigo-400"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg></button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="mt-auto space-y-6 pt-6 border-t border-white/10">
                            <div className="grid grid-cols-1 gap-3">
                                <select value={selectedCustomerId} onChange={e => setSelectedCustomerId(e.target.value)} className="w-full bg-white/10 border-none rounded-2xl px-5 py-4 text-sm font-bold focus:ring-2 focus:ring-emerald-500">
                                    <option value="" className="text-slate-900">-- Choose Member --</option>
                                    {customers.map(c => <option key={c.id} value={c.id} className="text-slate-900">{c.name} ({c.type})</option>)}
                                </select>
                                <div className="grid grid-cols-2 gap-2">
                                    <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as any)} className="bg-white/10 border-none rounded-2xl px-4 py-3 text-xs font-bold">
                                        <option value="Cash" className="text-slate-900">Cash</option>
                                        <option value="E-Wallet" className="text-slate-900">E-Wallet</option>
                                        <option value="Online Banking" className="text-slate-900">Online Banking</option>
                                        <option value="Cheque" className="text-slate-900">Cheque</option>
                                    </select>
                                    <select value={saleChannel} onChange={e => setSaleChannel(e.target.value as any)} className="bg-white/10 border-none rounded-2xl px-4 py-3 text-xs font-bold"><option value="LOCAL_MARKET" className="text-slate-900">Local</option><option value="WHOLESALER" className="text-slate-900">Wholesale</option><option value="ONLINE" className="text-slate-900">Online</option></select>
                                </div>
                            </div>
                            <div className="flex justify-between items-end">
                                <div className="flex flex-col"><span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Total Due</span><span className="text-4xl font-black text-emerald-400 tracking-tighter">RM{cartTotal.toFixed(2)}</span></div>
                                <div className="text-right"><span className="text-[10px] font-black uppercase text-slate-500">{cart.length} unique SKU(s)</span></div>
                            </div>
                            <button onClick={handleConfirmSale} disabled={isProcessing || cart.length === 0 || !selectedCustomerId} className="w-full py-5 bg-emerald-500 text-white rounded-3xl font-black uppercase tracking-widest text-sm shadow-2xl active:scale-95 transition-all disabled:opacity-30 disabled:grayscale">{isProcessing ? 'Finalizing...' : 'Confirm Sales'}</button>
                        </div>
                    </div>
                </div>
            )}

            {viewMode === 'HISTORY' && (
                <div className="bg-white rounded-[3rem] shadow-sm border border-slate-200 overflow-hidden animate-fade-in">
                    <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50/30">
                        <div><h3 className="text-xl font-black text-slate-900 tracking-tight">Supply Records</h3><p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Village C Customer Registry</p></div>
                        <div className="flex items-center gap-3">
                            <button onClick={handleExportHistory} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 shadow-sm transition-all flex items-center gap-2"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>Export History</button>
                            <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value as any)} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"><option value="ALL">All Segments</option><option value="LOCAL_MARKET">Local Market</option><option value="WHOLESALER">Wholesale</option><option value="ONLINE">Online Portals</option></select>
                        </div>
                    </div>
                    <div className="overflow-x-auto"><table className="min-w-full"><thead className="bg-slate-50"><tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest"><th className="px-8 py-6 text-left">Date & Index</th><th className="px-8 py-6 text-left">Customer Entity</th><th className="px-8 py-6 text-left">Segment</th><th className="px-8 py-6 text-right">Net Value</th><th className="px-8 py-6 text-center">Receipt/Order</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredSales.map(sale => (<tr key={sale.id} className="hover:bg-slate-50 transition-colors"><td className="px-8 py-6"><p className="text-xs font-black text-slate-900">{new Date(sale.timestamp).toLocaleDateString()}</p><p className="text-[10px] text-slate-400 font-mono font-bold uppercase">{sale.id}</p></td><td className="px-8 py-6"><p className="text-sm font-black text-slate-900">{sale.customerName}</p><p className="text-[10px] text-slate-400 font-bold uppercase">{sale.recordedBy.split('@')[0]}</p></td><td className="px-8 py-6"><span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-indigo-50 text-indigo-700 border border-indigo-100">{sale.channel.replace('_', ' ')}</span></td><td className="px-8 py-6 text-right"><p className="text-sm font-black text-slate-900">RM{sale.totalAmount.toFixed(2)}</p></td><td className="px-8 py-6 text-center"><button onClick={() => handlePrintReceipt(sale)} className={`p-2 rounded-xl transition-all ${sale.status === 'PENDING' ? 'text-orange-600 hover:bg-orange-50' : 'text-indigo-600 hover:bg-indigo-50'}`} title={sale.status === 'PENDING' ? "Print Customer Order" : "Print Sales Receipt"}><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg></button></td></tr>))}</tbody></table></div>
                </div>
            )}

            {viewMode === 'INVENTORY' && (
                <div className="bg-white rounded-[3rem] shadow-sm border border-slate-200 overflow-hidden animate-fade-in">
                    <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
                        <div>
                            <h3 className="text-xl font-black text-slate-900 tracking-tight">Global Stock Ledger</h3>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Auto-Synced with Processing & Inbound (A/B)</p>
                        </div>
                        <button onClick={() => setShowAdjModal(true)} className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg hover:bg-slate-800 transition-all">Manual Correction</button>
                    </div>
                    <table className="min-w-full">
                        <thead className="bg-slate-50">
                            <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                <th className="px-8 py-6 text-left">Mushroom SKU</th>
                                <th className="px-8 py-6 text-left">Sub-Category</th>
                                <th className="px-8 py-6 text-right">Available (Packaged)</th>
                                <th className="px-8 py-6 text-right">In-Process (WIP)</th>
                                <th className="px-8 py-6 text-right">Total Hub Asset</th>
                                <th className="px-8 py-6 text-center">Lifecycle</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {productsWithLiveStock.map(p => (
                                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-8 py-6"><p className="text-sm font-black text-slate-900">{p.name}</p><p className="text-[10px] text-slate-400 font-bold font-mono uppercase">{p.id}</p></td>
                                    <td className="px-8 py-6"><span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-slate-100 text-slate-600 border border-slate-200">{p.category}</span></td>
                                    <td className="px-8 py-6 text-right font-black text-emerald-600">{p.packagedStock?.toFixed(1)} {p.unit}</td>
                                    <td className="px-8 py-6 text-right font-black text-orange-500">+{p.inProcessStock?.toFixed(1)} {p.unit}</td>
                                    <td className="px-8 py-6 text-right">
                                        <p className="text-sm font-black text-slate-900">{(p.packagedStock + p.inProcessStock).toFixed(1)} {p.unit}</p>
                                        <div className="mt-1 w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                                            <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, ((p.packagedStock + p.inProcessStock) / 300) * 100)}%` }}></div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 text-center">
                                        {p.packagedStock > 0 ? (
                                            <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-emerald-100 text-emerald-700">Stocked</span>
                                        ) : p.inProcessStock > 0 ? (
                                            <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-orange-100 text-orange-700">WIP</span>
                                        ) : (
                                            <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-rose-100 text-rose-700">Empty</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {viewMode === 'CRM' && (
                <div className="bg-white rounded-[3rem] shadow-sm border border-slate-200 overflow-hidden animate-fade-in">
                    <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <div><h3 className="text-xl font-black text-slate-900 tracking-tight">Customer Relationship Matrix</h3><p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mt-1">Village C Customer Registry</p></div>
                        <button onClick={openNewCustomerModal} className="px-6 py-3 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl hover:bg-slate-800 transition-all flex items-center gap-2"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>Enroll New Customer</button>
                    </div>
                    <table className="min-w-full"><thead className="bg-slate-50"><tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest"><th className="px-8 py-6 text-left">Identity Profile</th><th className="px-8 py-6 text-left">Category</th><th className="px-8 py-6 text-right">LTV (Spent)</th><th className="px-8 py-6 text-center">Points</th><th className="px-8 py-6 text-center">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{customers.map(c => (<tr key={c.id} className="hover:bg-slate-50 transition-colors"><td className="px-8 py-6"><p className="text-sm font-black text-slate-900">{c.name}</p><p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">{c.email}</p></td><td className="px-8 py-6"><span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-slate-100 text-slate-500 border border-slate-200">{c.type}</span></td><td className="px-8 py-6 text-right"><p className="text-sm font-black text-emerald-600 font-mono">RM{(c.totalSpent || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</p></td><td className="px-8 py-6 text-center"><span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-800">{c.loyaltyPoints || 0}</span></td><td className="px-8 py-6 text-center"><div className="flex justify-center gap-3"><button onClick={() => openEditCustomer(c)} className="text-indigo-600 font-black text-[10px] uppercase tracking-widest hover:underline">Edit</button></div></td></tr>))}</tbody></table>
                </div>
            )}

            {/* Adjustment Modal */}
            {showAdjModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-md p-10 animate-scale-in">
                        <div className="flex justify-between items-center mb-8"><div><h3 className="text-2xl font-black text-slate-900 tracking-tight">Stock Correction</h3><p className="text-xs text-slate-400 uppercase font-black tracking-widest mt-1">Manual Inventory Override</p></div><button onClick={() => setShowAdjModal(false)} className="p-2 hover:bg-slate-100 rounded-full"><svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg></button></div>
                        <form onSubmit={handleSaveAdjustment} className="space-y-6">
                            <select required value={adjProductId} onChange={e => setAdjProductId(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold"><option value="">-- Choose Item --</option>{productsWithLiveStock.map(p => <option key={p.id} value={p.id}>{p.name} (Ready: {p.stock})</option>)}</select>
                            <input type="number" required value={adjNewQty} onChange={e => setAdjNewQty(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold" placeholder="New Quantity (Kg)" />
                            <select value={adjReason} onChange={e => setAdjReason(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold"><option value="Stock Count Correction">Audit Check</option><option value="Damaged/Spoiled">Spoilage/Damage</option><option value="Other">Miscellaneous</option></select>
                            <button type="submit" disabled={isSubmittingAdj} className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black uppercase tracking-widest text-sm shadow-xl active:scale-95 disabled:opacity-30">{isSubmittingAdj ? 'Syncing...' : 'Commit Change'}</button>
                        </form>
                    </div>
                </div>
            )}

            {/* Enrollment / Edit Customer Modal */}
            {showCustomerModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-lg p-10 animate-scale-in max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-8"><h3 className="text-2xl font-black text-slate-900 tracking-tight">{editingCustomer ? 'Edit Profile' : 'Enroll Client'}</h3><button onClick={() => setShowCustomerModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg></button></div>
                        <form onSubmit={handleSaveCustomer} className="space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Legal Identity / Name</label><input type="text" required value={custName} onChange={e => setCustName(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold" placeholder="e.g. John Trading Co." /></div><div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Segment Type</label><select value={custType} onChange={e => setCustType(e.target.value as any)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold"><option value="RETAIL">Retail Consumer</option><option value="WHOLESALE">Wholesale Distributor</option><option value="LOCAL">Local Vendor</option></select></div></div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Email Address</label><input type="email" value={custEmail} onChange={e => setCustEmail(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold" placeholder="client@email.com" /></div><div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Contact Number</label><input type="tel" value={custPhone} onChange={e => setCustPhone(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold" placeholder="+60..." /></div></div>
                            {editingCustomer && (<div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2"><div className="p-4 bg-slate-50 rounded-2xl border border-slate-100"><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Accumulated Points</label><div className="text-lg font-black text-amber-600">{editingCustomer.loyaltyPoints || 0} pts</div></div><div className="p-4 bg-slate-50 rounded-2xl border border-slate-100"><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Lifetime Value (Spent)</label><div className="text-lg font-black text-emerald-600">RM {(editingCustomer.totalSpent || 0).toLocaleString()}</div></div></div>)}
                            <button type="submit" disabled={isSubmittingCustomer} className="w-full py-5 bg-indigo-600 text-white rounded-3xl font-black uppercase tracking-widest text-sm shadow-xl active:scale-95 disabled:opacity-30 mt-4">{isSubmittingCustomer ? 'Syncing...' : editingCustomer ? 'Update Profile' : 'Enroll Customer'}</button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
