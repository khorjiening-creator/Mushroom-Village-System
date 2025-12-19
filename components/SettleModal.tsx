import React, { useState, useEffect } from 'react';
import { FinancialRecord } from '../types';

interface SettleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (amount: number, date: string, method: string, notes: string) => Promise<void>;
  record: FinancialRecord | null;
  isSubmitting: boolean;
}

export const SettleModal: React.FC<SettleModalProps> = ({ 
  isOpen, onClose, onConfirm, record, isSubmitting 
}) => {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [method, setMethod] = useState('Cash');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (record) {
      setAmount(record.amount.toString());
      setDate(new Date().toISOString().split('T')[0]);
      setMethod('Cash');
      setNotes('');
    }
  }, [record, isOpen]);

  if (!isOpen || !record) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(parseFloat(amount), date, method, notes);
  };

  const isIncome = record.type === 'INCOME';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
        <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={onClose}></div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-md sm:w-full sm:p-6 animate-fade-in-up">
                <div>
                     <div className={`mx-auto flex items-center justify-center h-12 w-12 rounded-full mb-4 ${isIncome ? 'bg-green-100' : 'bg-orange-100'}`}>
                        {isIncome ? (
                            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                        ) : (
                            <svg className="h-6 w-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        )}
                     </div>
                     <h3 className="text-lg leading-6 font-bold text-gray-900 text-center">
                         {isIncome ? 'Confirm Receipt' : 'Settle Payment'}
                     </h3>
                     <p className="text-sm text-gray-500 text-center mt-1">
                         Mark <span className="font-mono font-medium">{record.transactionId}</span> as {isIncome ? 'received' : 'paid'}.
                     </p>

                     <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                         <div>
                             <label className="block text-sm font-medium text-gray-700 mb-1">
                                 {isIncome ? 'Amount Received (RM)' : 'Payment Amount (RM)'}
                             </label>
                             <input 
                                type="number" 
                                step="0.01" 
                                required 
                                value={amount} 
                                onChange={e => setAmount(e.target.value)} 
                                className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                             />
                         </div>
                         <div>
                             <label className="block text-sm font-medium text-gray-700 mb-1">
                                 {isIncome ? 'Date Received' : 'Payment Date'}
                             </label>
                             <input 
                                type="date" 
                                required 
                                value={date} 
                                onChange={e => setDate(e.target.value)} 
                                className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                             />
                         </div>
                         <div>
                             <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                             <select 
                                value={method} 
                                onChange={e => setMethod(e.target.value)} 
                                className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                             >
                                 <option value="Cash">Cash</option>
                                 <option value="Bank Transfer">Bank Transfer</option>
                                 <option value="Cheque">Cheque</option>
                                 <option value="E-Wallet">E-Wallet</option>
                             </select>
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