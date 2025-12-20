import React, { useState } from 'react';
import { ProcessingLog, PackagingLogData, DeliveryLogData, DeliveryRecord } from '../../types';

interface Props {
    processingLogs: ProcessingLog[];
    packagingHistory: PackagingLogData[];
    deliveryLogs: DeliveryLogData[];
    allDeliveries: DeliveryRecord[];
}

export const Reports: React.FC<Props> = ({ processingLogs, packagingHistory, deliveryLogs, allDeliveries }) => {
    const [view, setView] = useState<'Production' | 'Audit' | 'Logistics'>('Production');
    const [activeRecord, setActiveRecord] = useState<DeliveryRecord | null>(null);
    const [isProofViewerOpen, setIsProofViewerOpen] = useState(false);

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
                            <div class="value">Status: ${del.status}</div>
                        </div>
                    </div>

                    <table class="item-table">
                        <thead>
                            <tr>
                                <th>Item Description</th>
                                <th>Grade</th>
                                <th>Qty (kg)</th>
                                <th>Status At Print</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Fresh Organic Mushrooms (Assorted Variety)</td>
                                <td>Mixed</td>
                                <td>-</td>
                                <td>${del.status}</td>
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

    return (
        <div className="space-y-8 animate-fade-in-up">
            <div className="flex bg-gray-100 p-1 rounded-xl w-fit">
                {[
                    { id: 'Production', label: 'Overview' },
                    { id: 'Audit', label: 'Processing History' },
                    { id: 'Logistics', label: 'Delivery History' }
                ].map(v => (
                    <button 
                        key={v.id} 
                        onClick={() => setView(v.id as any)} 
                        className={`px-6 py-2 rounded-lg text-sm font-black uppercase transition-all whitespace-nowrap ${view === v.id ? 'bg-white text-blue-600 shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        {v.label}
                    </button>
                ))}
            </div>

            {view === 'Production' ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm col-span-2">
                        <h4 className="text-xs font-black text-gray-400 uppercase mb-6 tracking-widest">System Throughput Performance</h4>
                        <div className="grid grid-cols-2 gap-6">
                            <div className="bg-slate-50 p-5 rounded-xl border border-slate-100">
                                <div className="text-[10px] font-bold text-gray-400 uppercase">Total Raw Intake</div>
                                <div className="text-3xl font-black text-slate-800">{processingLogs.reduce((a,b)=>a+b.actualWeight,0).toFixed(2)}kg</div>
                            </div>
                            <div className="bg-blue-50/50 p-5 rounded-xl border border-blue-100">
                                <div className="text-[10px] font-bold text-blue-400 uppercase">Total Units Packed</div>
                                <div className="text-3xl font-black text-blue-800">{packagingHistory.reduce((a,b)=>a+b.units,0)} Units</div>
                            </div>
                            <div className="bg-green-50 p-5 rounded-xl border border-green-100">
                                <div className="text-[10px] font-bold text-green-400 uppercase">Yield Percentage</div>
                                <div className="text-3xl font-black text-green-800">
                                    {processingLogs.length > 0 ? ((packagingHistory.reduce((a,b)=>a+b.weight,0) / (processingLogs.reduce((a,b)=>a+b.actualWeight,0) || 1)) * 100).toFixed(1) : '0'}%
                                </div>
                            </div>
                            <div className="bg-orange-50 p-5 rounded-xl border border-orange-100">
                                <div className="text-[10px] font-bold text-orange-400 uppercase">Active Dispatches</div>
                                <div className="text-3xl font-black text-orange-800">{allDeliveries.filter(d => d.status === 'OUT_FOR_DELIVERY').length}</div>
                            </div>
                        </div>
                    </div>
                    <div className="bg-gray-900 p-8 rounded-2xl shadow-xl text-white">
                        <h4 className="text-xs font-black text-gray-500 uppercase mb-6 tracking-widest">KPI Health Checks</h4>
                        <div className="space-y-6">
                            <div><div className="flex justify-between text-xs font-bold mb-2"><span>INTAKE TARGET</span><span>75%</span></div><div className="h-2 bg-gray-800 rounded-full"><div className="h-full bg-blue-500 w-3/4"></div></div></div>
                            <div><div className="flex justify-between text-xs font-bold mb-2"><span>PACKING QUALITY</span><span>98%</span></div><div className="h-2 bg-gray-800 rounded-full"><div className="h-full bg-green-500 w-[98%]"></div></div></div>
                            <div><div className="flex justify-between text-xs font-bold mb-2"><span>DISPATCH LOGISTICS</span><span>48%</span></div><div className="h-2 bg-gray-800 rounded-full"><div className="h-full bg-orange-500 w-[48%]"></div></div></div>
                        </div>
                    </div>
                </div>
            ) : view === 'Audit' ? (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm text-left">
                            <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                <tr><th className="px-6 py-4">Timestamp</th><th className="px-6 py-4">Transaction Event</th><th className="px-6 py-4">Reference ID</th><th className="px-6 py-4">Authorized User</th></tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {processingLogs.map(l => (
                                    <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 font-mono text-[11px] text-gray-400">{new Date(l.timestamp).toLocaleString()}</td>
                                        <td className="px-6 py-4 font-bold text-gray-700">Intake Processing Entry</td>
                                        <td className="px-6 py-4"><span className="bg-slate-100 px-2 py-1 rounded font-mono text-[10px] font-bold">{l.batchId}</span></td>
                                        <td className="px-6 py-4 text-gray-500 text-[11px] font-medium">{l.receivedBy}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 text-sm text-left">
                                <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                    <tr>
                                        <th className="px-6 py-4">Status</th>
                                        <th className="px-6 py-4">Destination</th>
                                        <th className="px-6 py-4">Date & Time</th>
                                        <th className="px-6 py-4">Driver</th>
                                        <th className="px-6 py-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {allDeliveries.filter(d => d.status === 'DELIVERED' || d.status === 'FAILED').map(del => (
                                        <tr key={del.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${
                                                    del.status === 'DELIVERED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                                }`}>
                                                    {del.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-gray-700 truncate max-w-[200px]">{del.destinationAddress}</div>
                                                <div className="text-[9px] font-mono text-gray-400">#DO-{del.id.slice(-6).toUpperCase()}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-xs font-bold">{new Date(del.deliveryDate).toLocaleDateString()}</div>
                                                <div className="text-[10px] text-gray-400">{del.deliveryTime}</div>
                                            </td>
                                            <td className="px-6 py-4 text-xs text-gray-600 font-medium">{del.driverName}</td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button 
                                                        onClick={() => printDeliveryOrder(del)}
                                                        className="p-1.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
                                                        title="Print PDF / Order"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                                        </svg>
                                                    </button>
                                                    {del.status === 'DELIVERED' && (
                                                        <button 
                                                            onClick={() => { setActiveRecord(del); setIsProofViewerOpen(true); }}
                                                            className="p-1.5 bg-green-50 text-green-600 rounded hover:bg-green-100 transition-colors"
                                                            title="View Proof of Delivery"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {allDeliveries.filter(d => d.status === 'DELIVERED' || d.status === 'FAILED').length === 0 && (
                                        <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400 italic">No delivery history records available.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Proof Viewer Modal */}
            {isProofViewerOpen && activeRecord && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[110] p-4 backdrop-blur-md">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-scale-up">
                        <div className="p-6 border-b flex justify-between items-center bg-green-50">
                            <div>
                                <h3 className="font-black uppercase tracking-widest text-xs text-green-800">Historical Proof of Delivery</h3>
                                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Ref: #DO-{activeRecord.id.slice(-6).toUpperCase()} • Logged {activeRecord.deliveredAt ? new Date(activeRecord.deliveredAt).toLocaleString() : 'N/A'}</p>
                            </div>
                            <button onClick={() => setIsProofViewerOpen(false)} className="text-gray-400 hover:text-gray-600 font-bold text-2xl">×</button>
                        </div>
                        <div className="p-8 flex flex-col md:flex-row gap-8 items-start">
                            <div className="flex-1 space-y-4 w-full text-left">
                                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                    <h4 className="text-[9px] font-bold text-gray-400 uppercase mb-2 tracking-widest">Destination</h4>
                                    <div className="text-xs font-bold text-gray-700">{activeRecord.destinationAddress}</div>
                                    <div className="text-[10px] text-blue-600 font-bold mt-1">Customer: {activeRecord.customerEmail}</div>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                    <h4 className="text-[9px] font-bold text-gray-400 uppercase mb-2 tracking-widest">Audit Info</h4>
                                    <div className="text-xs font-bold text-gray-700">Driver: {activeRecord.driverName}</div>
                                    <div className="text-[10px] text-gray-500 font-medium uppercase mt-1">Vehicle: {activeRecord.vehicleType}</div>
                                </div>
                                <button 
                                    onClick={() => printDeliveryOrder(activeRecord)}
                                    className="w-full py-3 bg-blue-600 text-white rounded-xl text-xs font-black uppercase hover:bg-blue-700 transition-all shadow-md flex items-center justify-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                                    Re-Print Delivery Order
                                </button>
                            </div>
                            <div className="flex-1 w-full text-center">
                                <h4 className="text-[9px] font-bold text-gray-400 uppercase mb-2 tracking-widest">Evidence Snapshot</h4>
                                {activeRecord.evidenceImage ? (
                                    <img 
                                        src={activeRecord.evidenceImage} 
                                        className="w-full h-auto rounded-2xl shadow-xl border border-gray-100 hover:scale-[1.02] transition-transform cursor-pointer" 
                                        alt="Evidence" 
                                        onClick={() => window.open(activeRecord.evidenceImage, '_blank')} 
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
