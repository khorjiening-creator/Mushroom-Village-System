import React, { useState, useEffect, useRef } from 'react';
import { FinancialRecord } from '../types';

interface SettleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (amount: number, date: string, method: string, notes: string, attachmentName?: string) => Promise<void>;
  record: FinancialRecord | null;
  isSubmitting: boolean;
}

export const SettleModal: React.FC<SettleModalProps> = ({ 
  isOpen, onClose, onConfirm, record, isSubmitting 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [method, setMethod] = useState('Cash');
  const [notes, setNotes] = useState('');
  const [attachmentName, setAttachmentName] = useState<string | null>(null);

  useEffect(() => {
    if (record) {
      // Merged logic: Ensure amount defaults to 0 if undefined, and reset attachments
      setAmount((record.amount ?? 0).toString());
      setDate(new Date().toISOString().split('T')[0]);
      setMethod('Cash');
      setNotes('');
      setAttachmentName(null);
    }
  }, [record, isOpen]);

  if (!isOpen || !record) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          setAttachmentName(file.name);
      }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(parseFloat(amount), date, method, notes, attachmentName || undefined);
  };

  const isIncome = record.type === 'INCOME';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
        <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose}></div>

            <div className="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                <div className="bg-white px-6 py-6">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">
                            {isIncome ? 'Settle Receivable' : 'Settle Payable'}
                        </h3>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                     <form onSubmit={handleSubmit} className="space-y-4">
                         <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 mb-4">
                             <p className="text-xs font-bold text-gray-500 uppercase mb-1">Original Record</p>
                             <p className="text-sm font-black text-gray-900">{record.description}</p>
                             <p className="text-lg font-black text-indigo-600">RM{record.amount.toLocaleString()}</p>
                         </div>

                         <div className="grid grid-cols-2 gap-4">
                             <div>
                                 <label className="block text-sm font-medium text-gray-700 mb-1">Final Amount</label>
                                 <input 
                                    type="number" 
                                    required 
                                    value={amount} 
                                    onChange={e => setAmount(e.target.value)} 
                                    className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                                 />
                             </div>
                             <div>
                                 <label className="block text-sm font-medium text-gray-700 mb-1">Date Settled</label>
                                 <input 
                                    type="date" 
                                    required 
                                    value={date} 
                                    onChange={e => setDate(e.target.value)} 
                                    className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                                 />
                             </div>
                         </div>

                         <div>
                             <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                             <select 
                                value={method} 
                                onChange={e => setMethod(e.target.value)} 
                                className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                             >
                                 <option value="Cash">Cash</option>
                                 <option value="Online Banking">Online Banking</option>
                                 <option value="E-Wallet">E-Wallet</option>
                                 <option value="Cheque">Cheque</option>
                             </select>
                         </div>

                         {/* Integrated Attachment Section */}
                         <div>
                             <label className="block text-sm font-medium text-gray-700 mb-1">Proof of Payment / Receipt</label>
                             <div 
                                onClick={() => fileInputRef.current?.click()}
                                className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer hover:border-indigo-400 transition-colors"
                             >
                                 <div className="space-y-1 text-center">
                                     <svg className="mx-auto h-10 w-10 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                                         <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                     </svg>
                                     <div className="text-sm text-gray-600">
                                         <span className="text-indigo-600 font-bold">Upload a file</span>
                                     </div>
                                     <p className="text-xs text-gray-500">{attachmentName || 'PNG, JPG up to 10MB'}</p>
                                 </div>
                                 <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} accept="image/*,.pdf" />
                             </div>
                         </div>

                         <div>
                             <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                             <textarea 
                                value={notes} 
                                onChange={e => setNotes(e.target.value)} 
                                rows={2} 
                                className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                                placeholder="Reference ID, customer details, etc."
                             />
                         </div>

                         <div className="flex gap-3 mt-6">
                            <button type="button" onClick={onClose} className="flex-1 bg-white border border-gray-300 text-gray-700 font-bold py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                                Cancel
                            </button>
                            <button type="submit" disabled={isSubmitting} className={`flex-1 text-white font-bold py-2.5 rounded-lg shadow-md disabled:opacity-50 transition-colors ${isIncome ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-600 hover:bg-orange-700'}`}>
                                {isSubmitting ? 'Processing...' : isIncome ? 'Confirm Receipt' : 'Confirm Payment'}
                            </button>
                         </div>
                     </form>
                </div>
            </div>
        </div>
    </div>
  );
};