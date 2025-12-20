
import React, { useState, useEffect, useRef } from 'react';
import { FinancialRecord, VillageType } from '../types';

interface BatchYieldInfo {
    id: string;
    remaining: number;
}

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (record: Partial<FinancialRecord>) => Promise<void>;
  onDelete?: () => void;
  initialData: FinancialRecord | null;
  villageId: VillageType;
  userEmail: string;
  isSubmitting: boolean;
  availableBatches?: BatchYieldInfo[];
}

export const TransactionModal: React.FC<TransactionModalProps> = ({ 
  isOpen, onClose, onSave, onDelete, initialData, villageId, userEmail, isSubmitting, availableBatches = []
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [transType, setTransType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [transAmount, setTransAmount] = useState('');
  const [transWeight, setTransWeight] = useState(''); 
  const [transCategory, setTransCategory] = useState('Supplies');
  const [transDate, setTransDate] = useState(new Date().toISOString().split('T')[0]);
  const [transDesc, setTransDesc] = useState('');
  const [transPaymentMethod, setTransPaymentMethod] = useState('Cash');
  const [transIsPending, setTransIsPending] = useState(false);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isFarmingVillage = villageId === VillageType.A || villageId === VillageType.B;

  useEffect(() => {
    setError(null);
    if (initialData) {
      setTransType(initialData.type);
      setTransAmount((initialData.amount ?? 0).toString());
      setTransWeight(initialData.weightKg ? (initialData.weightKg ?? 0).toString() : '');
      setTransCategory(initialData.category);
      setTransDate(initialData.date);
      setTransDesc(initialData.description || '');
      setTransPaymentMethod(initialData.paymentMethod || 'Cash');
      setTransIsPending(initialData.status === 'PENDING');
      setAttachmentName(initialData.attachmentName || null);
    } else {
      setTransType('EXPENSE');
      setTransAmount('');
      setTransWeight('');
      setTransCategory('Supplies');
      setTransDate(new Date().toISOString().split('T')[0]);
      setTransDesc('');
      setTransPaymentMethod('Cash');
      setTransIsPending(false);
      setAttachmentName(null);
    }
  }, [initialData, isOpen]);

  const handleTransTypeChange = (newType: 'INCOME' | 'EXPENSE') => {
      setTransType(newType);
      setError(null);
      if (newType === 'INCOME') {
          // Manual income is never Sales (Sales are auto-generated)
          setTransCategory('Others');
      } else {
          setTransCategory('Supplies');
      }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          setAttachmentName(file.name);
      }
  };

  const isIncome = transType === 'INCOME';

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      let finalSettledDate: string | null = null;
      if (!transIsPending) {
          finalSettledDate = initialData?.settledDate || transDate;
      }
      
      onSave({
          type: transType,
          category: transCategory,
          amount: parseFloat(transAmount) || 0,
          weightKg: null,
          date: transDate,
          batchId: initialData?.batchId || null, // Preserve if editing an auto-generated one, but otherwise null
          orderNumber: initialData?.orderNumber || null,
          description: transDesc,
          recordedBy: initialData?.recordedBy || userEmail,
          villageId: initialData?.villageId || villageId,
          paymentMethod: transPaymentMethod,
          status: transIsPending ? 'PENDING' : 'COMPLETED',
          settledDate: finalSettledDate,
          attachmentName: attachmentName
      });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
        <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={onClose}></div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6 animate-fade-in-up">
                <div>
                     <h3 className="text-lg font-bold text-gray-900 mb-4">{initialData ? 'Edit Transaction' : 'New Transaction'}</h3>
                     
                     {error && (
                         <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg flex items-center gap-2 text-red-700 text-sm font-medium animate-shake">
                             <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                             {error}
                         </div>
                     )}

                     <form onSubmit={handleSubmit} className="space-y-4">
                         <div className="flex space-x-4 mb-2">
                             <label className="inline-flex items-center cursor-pointer">
                                 <input type="radio" className="form-radio h-4 w-4 text-green-600" checked={transType === 'INCOME'} onChange={() => handleTransTypeChange('INCOME')} />
                                 <span className={`ml-2 text-sm font-medium ${transType === 'INCOME' ? 'text-green-600 font-bold' : 'text-gray-500'}`}>Income</span>
                             </label>
                             <label className="inline-flex items-center cursor-pointer">
                                 <input type="radio" className="form-radio h-4 w-4 text-red-600" checked={transType === 'EXPENSE'} onChange={() => handleTransTypeChange('EXPENSE')} />
                                 <span className={`ml-2 text-sm font-medium ${transType === 'EXPENSE' ? 'text-red-600 font-bold' : 'text-gray-500'}`}>Expense</span>
                             </label>
                         </div>
                         
                         <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (RM)</label>
                            <input type="number" step="0.01" required value={transAmount} onChange={e => setTransAmount(e.target.value)} className="w-full border border-gray-600 rounded-lg p-2.5 bg-gray-700 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors placeholder-gray-400" placeholder="0.00" />
                         </div>

                         <div>
                             <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                             <select value={transCategory} onChange={e => { setTransCategory(e.target.value); setError(null); }} className="w-full border border-gray-600 rounded-lg p-2.5 bg-gray-700 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors">
                                 {transType === 'INCOME' ? (
                                     <>
                                         <option value="Investment">Investment</option>
                                         <option value="Others">Others</option>
                                     </>
                                 ) : (
                                     <>
                                         <option value="Supplies">Supplies</option>
                                         <option value="Logistic">Logistic</option>
                                         <option value="Labor">Labor</option>
                                         <option value="Utilities">Utilities</option>
                                         <option value="Maintenance">Maintenance</option>
                                         <option value="Others">Others</option>
                                     </>
                                 )}
                             </select>
                             {isFarmingVillage && isIncome && !initialData && (
                                 <p className="mt-1 text-[10px] text-indigo-600 font-medium italic">Note: "Sales" transactions are auto-generated from farming harvests.</p>
                             )}
                         </div>

                         <div>
                             <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                             <input type="date" required value={transDate} onChange={e => setTransDate(e.target.value)} className="w-full border border-gray-600 rounded-lg p-2.5 bg-gray-700 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" />
                         </div>

                         <div>
                             <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                             <textarea value={transDesc} onChange={e => setTransDesc(e.target.value)} rows={2} className="w-full border border-gray-600 rounded-lg p-2.5 bg-gray-700 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors placeholder-gray-400" placeholder="Optional details..." />
                         </div>

                         <div className="flex items-center pt-2">
                             <input
                                 id="pending_status"
                                 type="checkbox"
                                 checked={transIsPending}
                                 onChange={(e) => { setTransIsPending(e.target.checked); setError(null); }}
                                 className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                             />
                             <label htmlFor="pending_status" className="ml-2 block text-sm text-gray-900 cursor-pointer select-none font-medium">
                                 Mark as Pending ({transType === 'INCOME' ? 'Uncollected' : 'Unpaid'})
                             </label>
                         </div>

                         {!initialData && (
                            <div className="pt-4 border-t border-gray-100">
                                <label className="block text-sm font-bold text-gray-800 mb-2 flex items-center gap-2">
                                    <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                    </svg>
                                    Document Attachment
                                </label>
                                <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200 shadow-inner">
                                    <button 
                                        type="button" 
                                        onClick={() => fileInputRef.current?.click()}
                                        className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-300 transition-all flex items-center gap-2 shadow-sm"
                                    >
                                        {attachmentName ? 'Change Document' : 'Upload File'}
                                    </button>
                                    <input 
                                        type="file" 
                                        ref={fileInputRef} 
                                        className="hidden" 
                                        onChange={handleFileChange}
                                        accept=".pdf,.jpg,.jpeg,.png"
                                    />
                                    <div className="flex-1 min-w-0">
                                        {attachmentName ? (
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-indigo-600 font-bold truncate pr-2">{attachmentName}</span>
                                                <button 
                                                    type="button" 
                                                    onClick={() => setAttachmentName(null)}
                                                    className="p-1 text-red-500 hover:bg-red-50 rounded-full flex-shrink-0"
                                                    title="Remove"
                                                >
                                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                                </button>
                                            </div>
                                        ) : (
                                            <span className="text-[10px] text-gray-400 italic">No document attached.</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                         )}

                         <div className="flex gap-3 mt-6">
                            {initialData && onDelete ? (
                                <button type="button" onClick={onDelete} className="bg-red-50 border border-red-200 text-red-600 font-bold py-2.5 px-4 rounded-lg hover:bg-red-100 transition-colors text-sm">
                                    Delete
                                </button>
                            ) : null}
                            <button type="button" onClick={onClose} className="flex-1 bg-white border border-gray-300 text-gray-700 font-bold py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                                Cancel
                            </button>
                            <button type="submit" disabled={isSubmitting} className="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-lg hover:bg-blue-700 transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed">
                                {isSubmitting ? 'Saving...' : 'Save Record'}
                            </button>
                         </div>
                     </form>
                </div>
            </div>
        </div>
    </div>
  );
};
