
import React from 'react';
import { Sale } from '../../types';

interface SalesReceiptProps {
  sale: Sale;
}

export const SalesReceipt: React.FC<SalesReceiptProps> = ({ sale }) => {
  const formattedDate = new Date(sale.timestamp).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className="bg-white p-8 max-w-sm mx-auto shadow-sm border border-slate-200 font-mono text-slate-800 text-xs leading-relaxed overflow-hidden">
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-lg font-black uppercase tracking-tighter text-slate-900">Village C</h2>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Processing & Distribution</p>
        <div className="my-3 border-t border-dashed border-slate-300"></div>
        <p className="font-bold">OFFICIAL SALES RECEIPT</p>
      </div>

      {/* Metadata */}
      <div className="space-y-1 mb-4">
        <div className="flex justify-between">
          <span className="text-slate-400 uppercase">Ref ID:</span>
          <span className="font-black text-slate-900">{sale.id}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400 uppercase">Date:</span>
          <span>{formattedDate}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400 uppercase">Clerk:</span>
          <span className="capitalize">{sale.recordedBy.split('@')[0]}</span>
        </div>
      </div>

      {/* Customer */}
      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 mb-6">
        <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Customer Details</p>
        <p className="font-black text-slate-900 uppercase">{sale.customerName}</p>
        <p className="text-[9px] text-slate-500">Member ID: {sale.customerId}</p>
      </div>

      {/* Items List */}
      <div className="mb-6">
        <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase border-b border-dashed border-slate-300 pb-2 mb-3">
          <span>Description</span>
          <span>Amount</span>
        </div>
        <div className="space-y-4">
          {sale.items.map((item, idx) => (
            <div key={idx} className="flex flex-col">
              <div className="flex justify-between items-start">
                <span className="font-black text-slate-900 uppercase pr-4">{item.name}</span>
                <span className="font-bold">RM{(item.quantity * item.unitPrice).toFixed(2)}</span>
              </div>
              <div className="text-[10px] text-slate-500">
                {item.quantity} {item.quantity > 1 ? 'units' : 'unit'} @ RM{item.unitPrice.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div className="border-t border-dashed border-slate-300 pt-4 space-y-2">
        <div className="flex justify-between items-center text-sm">
          <span className="font-black uppercase tracking-tighter">Grand Total</span>
          <span className="text-lg font-black text-indigo-600">RM{sale.totalAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-slate-400 uppercase">Payment Method</span>
          <span className="text-[10px] font-black bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
            {sale.paymentMethod.replace('_', ' ')}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-slate-400 uppercase">Channel</span>
          <span className="text-[10px] font-bold italic text-slate-500">{sale.channel.replace('_', ' ')}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-10 text-center">
        <div className="border-t border-dashed border-slate-300 mb-4"></div>
        <p className="text-[9px] text-slate-400 uppercase font-black">Thank you for supporting</p>
        <p className="text-[9px] text-slate-400 uppercase font-black">Mushroom Village Economy</p>
        <div className="mt-4 flex justify-center gap-1">
          <div className="h-4 w-1 bg-slate-200"></div>
          <div className="h-4 w-2 bg-slate-300"></div>
          <div className="h-4 w-1 bg-slate-200"></div>
          <div className="h-4 w-4 bg-slate-300"></div>
          <div className="h-4 w-2 bg-slate-200"></div>
          <div className="h-4 w-1 bg-slate-300"></div>
        </div>
      </div>
    </div>
  );
};
