
import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, query, orderBy, limit, increment, addDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { VillageType, Customer, Sale, Product, CartItem, FinancialRecord, UserRole } from '../../types';
import { SalesReceipt } from './SalesReceipt';

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
    
    // POS Cart State
    const [cart, setCart] = useState<CartItem[]>([]);
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'E_WALLET' | 'CREDIT'>('CASH');
    const [saleChannel, setSaleChannel] = useState<'LOCAL_MARKET' | 'WHOLESALER' | 'ONLINE'>('LOCAL_MARKET');
    const [isProcessing, setIsProcessing] = useState(false);
    const [lastSaleSuccess, setLastSaleSuccess] = useState<{id: string, total: number, data: Sale} | null>(null);

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
    const [custPoints, setCustPoints] = useState('0');
    const [custSpent, setCustSpent] = useState('0');

    useEffect(() => {
        const unsubCust = onSnapshot(collection(db, 'customers'), (snap) => {
            setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
        }, (err) => {
            console.error("Customer Feed Error:", err);
            if (onError) onError("Failed to load customers from database.");
        });

        const collectionSuffix = villageId.replace(/\s/g, '');
        const unsubProd = onSnapshot(collection(db, `products_${collectionSuffix}`), (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
            if (list.length === 0) seedInitialProducts();
            else setProducts(list);
        }, (err) => {
            console.error("Product Feed Error:", err);
            if (onError) onError("Failed to load products.");
        });

        const unsubSales = onSnapshot(query(collection(db, `sales_${collectionSuffix}`), orderBy('timestamp', 'desc'), limit(100)), (snap) => {
            setSales(snap.docs.map(d => ({ id: d.id, ...d.data() } as Sale)));
        }, (err) => {
            console.error("Sales Feed Error:", err);
            if (onError) onError("Failed to load transaction history.");
        });

        return () => { unsubCust(); unsubProd(); unsubSales(); };
    }, [villageId]);

    const seedInitialProducts = async () => {
        try {
            const defaults: Product[] = [
                { id: 'P-FRE-A', name: 'Fresh Oyster - Grade A', category: 'FRESH', grade: 'A', unitPrice: 12.50, stock: 150, unit: 'kg', villageId },
                { id: 'P-DRI-P', name: 'Dried Shiitake - Premium', category: 'DRIED', grade: 'PREMIUM', unitPrice: 45.00, stock: 40, unit: 'kg', villageId },
                { id: 'P-POW-O', name: 'Mushroom Powder - 250g', category: 'POWDER', grade: 'A', unitPrice: 35.00, stock: 100, unit: 'units', villageId }
            ];
            for (const p of defaults) { await setDoc(doc(db, `products_${villageId.replace(/\s/g, '')}`, p.id), p); }
        } catch (err) {
            console.error("Seeding failed:", err);
        }
    };

    const handlePrintReceipt = (sale: Sale) => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const itemsHtml = sale.items.map(item => `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;">
                    <div style="font-weight: bold; font-size: 14px;">${item.name}</div>
                    <div style="font-size: 10px; color: #666;">QTY: ${item.quantity} x RM${item.unitPrice.toFixed(2)}</div>
                </td>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: bold; vertical-align: top;">
                    RM${(item.quantity * item.unitPrice).toFixed(2)}
                </td>
            </tr>
        `).join('');

        printWindow.document.write(`
            <html>
                <head>
                    <title>Sales Receipt - ${sale.id}</title>
                    <style>
                        body { font-family: 'Courier New', Courier, monospace; width: 300px; margin: 0 auto; padding: 20px; color: #000; line-height: 1.2; font-size: 12px; }
                        .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
                        .village-name { font-size: 18px; font-weight: 800; margin: 0; }
                        .info { margin-bottom: 10px; }
                        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
                        .totals { border-top: 1px dashed #000; padding-top: 5px; margin-top: 5px; }
                        .footer { text-align: center; margin-top: 20px; font-size: 10px; border-top: 1px dashed #000; padding-top: 10px; }
                        @media print { body { width: 100%; padding: 0; } }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <p class="village-name">${villageId.toUpperCase()}</p>
                        <p>Central Processing Facility</p>
                        <p>Mushroom Supply Chain</p>
                    </div>
                    <div class="info">
                        <div>TXN ID: ${sale.id}</div>
                        <div>DATE  : ${new Date(sale.timestamp).toLocaleString()}</div>
                        <div>CLERK : ${sale.recordedBy.split('@')[0]}</div>
                        <div>CLIENT: ${sale.customerName}</div>
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
                        <div style="display: flex; justify-content: space-between; font-size: 16px; font-weight: 900; margin-top: 5px;">
                            <span>GRAND TOTAL:</span>
                            <span>RM${sale.totalAmount.toFixed(2)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 10px; margin-top: 5px;">
                            <span>PAYMENT MODE:</span>
                            <span>${sale.paymentMethod}</span>
                        </div>
                    </div>
                    <div class="footer">
                        THANK YOU FOR YOUR BUSINESS!<br>
                        Visit: mushroom-village.com<br>
                        Generated by System v2.5.0
                    </div>
                    <script>window.onload = () => { window.print(); window.close(); }</script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    const handleExportHistory = () => {
        const headers = ["Sale ID", "Date", "Customer", "Items", "Total (RM)", "Method", "Channel", "Staff"];
        const rows = filteredSales.map(s => [
            s.id,
            new Date(s.timestamp).toLocaleDateString(),
            s.customerName,
            s.items.map(i => `${i.name}(${i.quantity})`).join('; '),
            s.totalAmount.toFixed(2),
            s.paymentMethod,
            s.channel,
            s.recordedBy
        ]);

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `sales_history_${villageId.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const addToCart = (product: Product) => {
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
                const product = products.find(p => p.id === productId);
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
            const saleId = `SALE-${Date.now().toString().slice(-6)}`;
            const timestamp = new Date().toISOString();
            const collectionSuffix = villageId.replace(/\s/g, '');

            const totalLandedCost = cart.reduce((acc, item) => acc + ((item.landedCost || 0) * item.quantity), 0);

            const saleData: Sale = {
                id: saleId,
                customerId: selectedCustomerId,
                customerName: customer.name,
                items: cart,
                totalAmount: cartTotal,
                totalLandedCost: totalLandedCost,
                paymentMethod,
                status: 'COMPLETED',
                channel: saleChannel,
                recordedBy: userEmail,
                timestamp,
                villageId
            };

            await setDoc(doc(db, `sales_${collectionSuffix}`, saleId), saleData);

            for (const item of cart) {
                await updateDoc(doc(db, `products_${collectionSuffix}`, item.productId), {
                    stock: increment(-item.quantity)
                });
            }

            await updateDoc(doc(db, 'customers', selectedCustomerId), {
                totalSpent: increment(cartTotal),
                lastPurchaseDate: timestamp,
                loyaltyPoints: increment(Math.floor(cartTotal / 10)) 
            });

            const finCol = villageId === VillageType.C ? 'financialRecords_C' : 'financialRecords';
            const txnId = `TXN-S-${saleId}`;
            await setDoc(doc(db, finCol, txnId), {
                transactionId: txnId,
                type: 'INCOME',
                category: 'Sales',
                amount: cartTotal,
                date: timestamp.split('T')[0],
                description: `Sale to ${customer.name} via ${saleChannel}`,
                recordedBy: userEmail,
                villageId,
                status: 'COMPLETED',
                paymentMethod
            });

            setLastSaleSuccess({ id: saleId, total: cartTotal, data: saleData });
            onSuccess("Transaction Verified: Supply Chain Synchronized.");
            setCart([]);
            setSelectedCustomerId('');
        } catch (err: any) {
            console.error("Sale Confirmation Error:", err);
            if (onError) onError("Transaction failed: " + (err.message || "Network Error"));
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSaveCustomer = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmittingCustomer(true);
        try {
            const data: any = { 
                name: custName.trim(), 
                email: custEmail.trim().toLowerCase(), 
                phone: custPhone.trim(), 
                type: custType, 
                loyaltyPoints: parseInt(custPoints) || 0, 
                totalSpent: parseFloat(custSpent) || 0 
            };

            if (!data.name) throw new Error("Legal Identity/Name is required.");

            if (editingCustomer) {
                await updateDoc(doc(db, 'customers', editingCustomer.id), data);
                onSuccess(`Customer "${custName}" profile updated.`);
            } else {
                const custId = `CUST-${Date.now().toString().slice(-6)}`;
                await setDoc(doc(db, 'customers', custId), { ...data, id: custId });
                onSuccess(`Customer "${custName}" successfully enrolled.`);
            }
            closeCustomerModal();
        } catch (err: any) { 
            console.error("Customer Save Error:", err);
            if (onError) {
                const msg = err.code === 'permission-denied' 
                    ? "Security Error: You do not have permission to modify customer records." 
                    : (err.message || "Failed to save customer record.");
                onError(msg);
            }
        } finally { 
            setIsSubmittingCustomer(false); 
        }
    };

    const handleDeleteCustomer = async (custId: string) => {
        if (!custId) return;
        
        const isConfirmed = window.confirm("Are you sure you want to delete this customer record? This action cannot be reversed.");
        if (!isConfirmed) return;

        try { 
            await deleteDoc(doc(db, 'customers', custId)); 
            onSuccess("Customer record purged from database."); 
        } catch (err: any) { 
            console.error("Delete Error for ID:", custId, err);
            if (onError) {
                const msg = err.code === 'permission-denied'
                    ? "Access Denied: Only administrators can purge customer records."
                    : (err.message || "System error: Could not delete customer.");
                onError(msg);
            }
        }
    };

    const handleSaveAdjustment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!adjProductId || adjNewQty === '') return;
        setIsSubmittingAdj(true);
        try {
            const collectionSuffix = villageId.replace(/\s/g, '');
            const prodRef = doc(db, `products_${collectionSuffix}`, adjProductId);
            const product = products.find(p => p.id === adjProductId);
            await updateDoc(prodRef, { stock: parseFloat(adjNewQty) });
            await addDoc(collection(db, "activity_logs"), { action: 'STOCK_ADJUSTMENT', details: `Adjusted ${product?.name} to ${adjNewQty}. Reason: ${adjReason}`, userEmail, villageId, timestamp: new Date().toISOString() });
            onSuccess(`Stock updated for ${product?.name}.`);
            setShowAdjModal(false);
            setAdjProductId(''); setAdjNewQty('');
        } catch (err: any) { 
            console.error(err); 
            if (onError) onError("Adjustment failed: " + (err.message || "Security restriction."));
        } finally { 
            setIsSubmittingAdj(false); 
        }
    };

    const openEditCustomer = (c: Customer) => {
        setEditingCustomer(c); 
        setCustName(c.name); 
        setCustEmail(c.email); 
        setCustPhone(c.phone); 
        setCustType(c.type); 
        setCustPoints((c.loyaltyPoints || 0).toString()); 
        setCustSpent((c.totalSpent || 0).toString());
        setShowCustomerModal(true);
    };

    const openNewCustomerModal = () => {
        setEditingCustomer(null);
        setCustName('');
        setCustEmail('');
        setCustPhone('');
        setCustType('RETAIL');
        setCustPoints('0');
        setCustSpent('0');
        setShowCustomerModal(true);
    };

    const closeCustomerModal = () => { 
        setShowCustomerModal(false); 
        setEditingCustomer(null); 
    };

    const filteredProducts = products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
    const filteredSales = useMemo(() => channelFilter === 'ALL' ? sales : sales.filter(s => s.channel === channelFilter), [sales, channelFilter]);

    return (
        <div className="space-y-6 animate-fade-in-up relative">
            {/* Sale Success Overlay */}
            {lastSaleSuccess && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in overflow-y-auto">
                    <div className="bg-white rounded-[3rem] shadow-2xl p-10 text-center max-w-xl w-full animate-scale-in my-8">
                        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 mb-2">Transaction Finalized</h3>
                        <p className="text-sm text-slate-500 mb-8 font-medium">Your sale record has been encrypted and synced with the ledger.</p>
                        
                        <div className="mb-8 scale-90 sm:scale-100">
                             <SalesReceipt sale={lastSaleSuccess.data} />
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <button onClick={() => handlePrintReceipt(lastSaleSuccess.data)} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                                Print Physical Copy
                            </button>
                            <button onClick={() => setLastSaleSuccess(null)} className="w-full py-4 bg-slate-100 text-slate-900 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-all">Dismiss / New Sale</button>
                        </div>
                    </div>
                </div>
            )}

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
                            <input 
                                type="text" 
                                placeholder="Search products..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-12 pr-4 py-4 rounded-3xl bg-white border-2 border-slate-100 focus:border-indigo-500 focus:outline-none text-sm font-bold shadow-sm transition-all"
                            />
                            <svg className="absolute left-4 top-4.5 h-5 w-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {filteredProducts.map(p => (
                                <button 
                                    key={p.id} 
                                    onClick={() => addToCart(p)}
                                    disabled={p.stock <= 0}
                                    className={`bg-white p-6 rounded-[2.5rem] border-2 transition-all text-left flex justify-between items-center group shadow-sm ${p.stock <= 0 ? 'opacity-50 grayscale border-slate-100' : 'border-slate-100 hover:border-indigo-400 hover:shadow-xl active:scale-95'}`}
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="text-base font-black text-slate-900 group-hover:text-indigo-600 transition-colors truncate">{p.name}</p>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">RM{p.unitPrice.toFixed(2)} / {p.unit}</p>
                                        <div className="mt-3 flex items-center gap-2">
                                            <span className={`h-2 w-2 rounded-full ${p.stock > 10 ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                                            <span className="text-[10px] font-black text-slate-500 uppercase">{p.stock} Available</span>
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
                        <div className="flex justify-between items-center mb-8">
                            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Order Summary</h3>
                            {cart.length > 0 && <button onClick={() => setCart([])} className="text-[10px] font-black text-rose-400 uppercase hover:underline">Clear</button>}
                        </div>

                        <div className="space-y-4 mb-8 max-h-[350px] overflow-y-auto scrollbar-hide">
                            {cart.length === 0 ? (
                                <div className="text-center py-12 text-slate-500">
                                    <svg className="w-12 h-12 mx-auto mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                    <p className="text-[10px] font-bold uppercase tracking-widest">Cart is empty</p>
                                </div>
                            ) : (
                                cart.map(item => (
                                    <div key={item.productId} className="bg-white/5 p-4 rounded-2xl flex justify-between items-center border border-white/10">
                                        <div className="flex-1 overflow-hidden">
                                            <p className="text-sm font-black truncate">{item.name}</p>
                                            <p className="text-[10px] text-slate-400 font-bold">RM{item.unitPrice.toFixed(2)} ea</p>
                                        </div>
                                        <div className="flex items-center gap-3 bg-white/10 rounded-xl px-2 py-1 ml-2">
                                            <button onClick={() => updateCartQty(item.productId, -1)} className="p-1 hover:text-indigo-400">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M20 12H4" /></svg>
                                            </button>
                                            <span className="text-sm font-black min-w-[20px] text-center">{item.quantity}</span>
                                            <button onClick={() => updateCartQty(item.productId, 1)} className="p-1 hover:text-indigo-400">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                            </button>
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
                                        <option value="CASH" className="text-slate-900">Cash</option>
                                        <option value="BANK_TRANSFER" className="text-slate-900">Transfer</option>
                                        <option value="E_WALLET" className="text-slate-900">E-Wallet</option>
                                        <option value="CREDIT" className="text-slate-900">Credit</option>
                                    </select>
                                    <select value={saleChannel} onChange={e => setSaleChannel(e.target.value as any)} className="bg-white/10 border-none rounded-2xl px-4 py-3 text-xs font-bold">
                                        <option value="LOCAL_MARKET" className="text-slate-900">Local</option>
                                        <option value="WHOLESALER" className="text-slate-900">Wholesale</option>
                                        <option value="ONLINE" className="text-slate-900">Online</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex justify-between items-end">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Total Due</span>
                                    <span className="text-4xl font-black text-emerald-400 tracking-tighter">RM{cartTotal.toFixed(2)}</span>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] font-black uppercase text-slate-500">{cart.length} unique SKU(s)</span>
                                </div>
                            </div>

                            <button 
                                onClick={handleConfirmSale} 
                                disabled={isProcessing || cart.length === 0 || !selectedCustomerId} 
                                className="w-full py-5 bg-emerald-500 text-white rounded-3xl font-black uppercase tracking-widest text-sm shadow-2xl active:scale-95 transition-all disabled:opacity-30 disabled:grayscale"
                            >
                                {isProcessing ? 'Syncing Network...' : 'Confirm Transaction'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {viewMode === 'HISTORY' && (
                <div className="bg-white rounded-[3rem] shadow-sm border border-slate-200 overflow-hidden animate-fade-in">
                    <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50/30">
                        <div>
                            <h3 className="text-xl font-black text-slate-900 tracking-tight">Supply Records</h3>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Historical Sale Invoices</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <button onClick={handleExportHistory} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 shadow-sm transition-all flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                Export History
                            </button>
                            <select 
                                value={channelFilter} 
                                onChange={(e) => setChannelFilter(e.target.value as any)}
                                className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            >
                                <option value="ALL">All Segments</option>
                                <option value="LOCAL_MARKET">Local Market</option>
                                <option value="WHOLESALER">Wholesale</option>
                                <option value="ONLINE">Online Portals</option>
                            </select>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full">
                            <thead className="bg-slate-50">
                                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    <th className="px-8 py-6 text-left">Date & Index</th>
                                    <th className="px-8 py-6 text-left">Customer Entity</th>
                                    <th className="px-8 py-6 text-left">Segment</th>
                                    <th className="px-8 py-6 text-right">Net Value</th>
                                    <th className="px-8 py-6 text-center">Receipt</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredSales.map(sale => (
                                    <tr key={sale.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-8 py-6">
                                            <p className="text-xs font-black text-slate-900">{new Date(sale.timestamp).toLocaleDateString()}</p>
                                            <p className="text-[10px] text-slate-400 font-mono font-bold uppercase">{sale.id}</p>
                                        </td>
                                        <td className="px-8 py-6">
                                            <p className="text-sm font-black text-slate-900">{sale.customerName}</p>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase">{sale.recordedBy.split('@')[0]}</p>
                                        </td>
                                        <td className="px-8 py-6">
                                            <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-indigo-50 text-indigo-700 border border-indigo-100">
                                                {sale.channel.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            <p className="text-sm font-black text-slate-900">RM{sale.totalAmount.toFixed(2)}</p>
                                        </td>
                                        <td className="px-8 py-6 text-center">
                                            <button onClick={() => handlePrintReceipt(sale)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all" title="Print Receipt">
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {viewMode === 'INVENTORY' && (
                <div className="bg-white rounded-[3rem] shadow-sm border border-slate-200 overflow-hidden animate-fade-in">
                    <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
                        <div>
                            <h3 className="text-xl font-black text-slate-900 tracking-tight">Global Stock Ledger</h3>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Village C Asset Tracking</p>
                        </div>
                        <button onClick={() => setShowAdjModal(true)} className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg hover:bg-slate-800 transition-all">Manual Correction</button>
                    </div>
                    <table className="min-w-full">
                        <thead className="bg-slate-50">
                            <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                <th className="px-8 py-6 text-left">Mushroom SKU</th>
                                <th className="px-8 py-6 text-left">Sub-Category</th>
                                <th className="px-8 py-6 text-right">Current Balance</th>
                                <th className="px-8 py-6 text-right">Unit Pricing</th>
                                <th className="px-8 py-6 text-center">Lifecycle</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {products.map(p => (
                                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-8 py-6">
                                        <p className="text-sm font-black text-slate-900">{p.name}</p>
                                        <p className="text-[10px] text-slate-400 font-bold font-mono uppercase">{p.id}</p>
                                    </td>
                                    <td className="px-8 py-6">
                                        <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-slate-100 text-slate-600 border border-slate-200">{p.category}</span>
                                    </td>
                                    <td className="px-8 py-6 text-right">
                                        <p className={`text-sm font-black ${p.stock < 10 ? 'text-rose-600' : 'text-slate-900'}`}>{p.stock} {p.unit}</p>
                                        <div className="mt-1 w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                                            <div className={`h-full ${p.stock < 10 ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, (p.stock / 150) * 100)}%` }}></div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 text-right">
                                        <p className="text-sm font-black text-indigo-600 font-mono">RM{p.unitPrice.toFixed(2)}</p>
                                    </td>
                                    <td className="px-8 py-6 text-center">
                                        {p.stock > 0 ? (
                                            <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-emerald-100 text-emerald-700">Active Stock</span>
                                        ) : (
                                            <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-rose-100 text-rose-700">Depleted</span>
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
                        <div>
                            <h3 className="text-xl font-black text-slate-900 tracking-tight">Customer Relationship Matrix</h3>
                            <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mt-1">Village C Customer Registry</p>
                        </div>
                        <button onClick={openNewCustomerModal} className="px-6 py-3 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl hover:bg-slate-800 transition-all flex items-center gap-2">
                             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                             Enroll New Customer
                        </button>
                    </div>
                    <table className="min-w-full">
                        <thead className="bg-slate-50">
                            <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                <th className="px-8 py-6 text-left">Identity Profile</th>
                                <th className="px-8 py-6 text-left">Category</th>
                                <th className="px-8 py-6 text-right">LTV (Spent)</th>
                                <th className="px-8 py-6 text-center">Points</th>
                                <th className="px-8 py-6 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {customers.map(c => (
                                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-8 py-6">
                                        <p className="text-sm font-black text-slate-900">{c.name}</p>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">{c.email}</p>
                                    </td>
                                    <td className="px-8 py-6">
                                        <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-slate-100 text-slate-500 border border-slate-200">{c.type}</span>
                                    </td>
                                    <td className="px-8 py-6 text-right">
                                        <p className="text-sm font-black text-emerald-600 font-mono">RM{(c.totalSpent || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                                    </td>
                                    <td className="px-8 py-6 text-center">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-800">
                                            {c.loyaltyPoints || 0}
                                        </span>
                                    </td>
                                    <td className="px-8 py-6 text-center">
                                        <div className="flex justify-center gap-3">
                                            <button onClick={() => openEditCustomer(c)} className="text-indigo-600 font-black text-[10px] uppercase tracking-widest hover:underline">Edit</button>
                                            {(isAdmin || userRole === 'sales' || userRole === 'admin') && (
                                                <button onClick={() => handleDeleteCustomer(c.id)} className="text-rose-600 font-black text-[10px] uppercase tracking-widest hover:underline">Delete</button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Adjustment Modal */}
            {showAdjModal && (
                <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog">
                    <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowAdjModal(false)}></div>
                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
                        <div className="inline-block align-bottom bg-white rounded-[3rem] shadow-2xl w-full max-w-md p-10 animate-scale-in">
                            <div className="flex justify-between items-center mb-8">
                                <div>
                                    <h3 className="text-2xl font-black text-slate-900 tracking-tight">Stock Correction</h3>
                                    <p className="text-xs text-slate-400 uppercase font-black tracking-widest mt-1">Manual Inventory Override</p>
                                </div>
                                <button onClick={() => setShowAdjModal(false)} className="p-2 hover:bg-slate-100 rounded-full">
                                    <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                            <form onSubmit={handleSaveAdjustment} className="space-y-6">
                                <select required value={adjProductId} onChange={e => setAdjProductId(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold">
                                    <option value="">-- Choose Item --</option>
                                    {products.map(p => <option key={p.id} value={p.id}>{p.name} (Current: {p.stock})</option>)}
                                </select>
                                <input type="number" required value={adjNewQty} onChange={e => setAdjNewQty(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold" placeholder="New Quantity" />
                                <select value={adjReason} onChange={e => setAdjReason(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold">
                                    <option value="Stock Count Correction">Audit Check</option>
                                    <option value="Damaged/Spoiled">Spoilage/Damage</option>
                                    <option value="Other">Miscellaneous</option>
                                </select>
                                <button type="submit" disabled={isSubmittingAdj} className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black uppercase tracking-widest text-sm shadow-xl active:scale-95 disabled:opacity-30">
                                    {isSubmittingAdj ? 'Syncing...' : 'Commit Change'}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Enrollment / Edit Customer Modal */}
            {showCustomerModal && (
                <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog">
                    <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm animate-fade-in" onClick={closeCustomerModal}></div>
                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
                        <div className="inline-block align-bottom bg-white rounded-[3rem] shadow-2xl w-full max-w-lg p-10 animate-scale-in">
                            <div className="flex justify-between items-center mb-8">
                                <h3 className="text-2xl font-black text-slate-900 tracking-tight">{editingCustomer ? 'Update Customer Profile' : 'Enroll New Customer'}</h3>
                                <button onClick={closeCustomerModal} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg></button>
                            </div>
                            <form onSubmit={handleSaveCustomer} className="space-y-5">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Legal Identity / Name</label>
                                        <input type="text" required value={custName} onChange={e => setCustName(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold" placeholder="e.g. John Trading Co." />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Segment Type</label>
                                        <select value={custType} onChange={e => setCustType(e.target.value as any)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold">
                                            <option value="RETAIL">Retail Consumer</option>
                                            <option value="WHOLESALE">Wholesale Distributor</option>
                                            <option value="LOCAL">Local Vendor</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Email Address</label>
                                        <input type="email" value={custEmail} onChange={e => setCustEmail(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold" placeholder="client@email.com" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Contact Number</label>
                                        <input type="tel" value={custPhone} onChange={e => setCustPhone(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold" placeholder="+60..." />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Loyalty Points</label>
                                        <input type="number" value={custPoints} onChange={e => setCustPoints(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Total LTV (Spent)</label>
                                        <input type="number" step="0.01" value={custSpent} onChange={e => setCustSpent(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold" />
                                    </div>
                                </div>
                                <button type="submit" disabled={isSubmittingCustomer} className="w-full py-5 bg-indigo-600 text-white rounded-3xl font-black uppercase tracking-widest text-sm shadow-xl active:scale-95 disabled:opacity-30 mt-4">
                                    {isSubmittingCustomer ? 'Syncing...' : editingCustomer ? 'Update Profile' : 'Enroll Customer'}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
