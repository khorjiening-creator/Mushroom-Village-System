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
  const [transBatchId, setTransBatchId] = useState('');
  const [transOrderNumber, setTransOrderNumber] = useState('');
  const [transDesc, setTransDesc] = useState('');
  const [transPaymentMethod, setTransPaymentMethod] = useState('Cash');
  const [transIsPending, setTransIsPending] = useState(false);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    if (initialData) {
      setTransType(initialData.type);
      setTransAmount(initialData.amount.toString());
      setTransWeight(initialData.weightKg ? initialData.weightKg.toString() : '');
      setTransCategory(initialData.category);
      setTransDate(initialData.date);
      setTransBatchId(initialData.batchId || '');
      setTransOrderNumber(initialData.orderNumber || '');
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
      setTransBatchId('');
      setTransOrderNumber('');
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
          setTransCategory('Sales');
      } else {
          setTransCategory('Supplies');
          setTransBatchId(''); 
      }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          setAttachmentName(file.name);
      }
  };

  const isOrderNumberRequired = transIsPending && (
      (transType === 'INCOME' && transCategory === 'Sales') || 
      (transType === 'EXPENSE' && transCategory === 'Supplies')
  );

  const isIncome = transType === 'INCOME';
  const isSales = isIncome && transCategory === 'Sales';

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (isOrderNumberRequired && !transOrderNumber.trim()) {
          setError(transType === 'INCOME' ? "Customer Order Number is mandatory for pending sales." : "Invoice Number is mandatory for pending supplies.");
          return;
      }

      if (isSales && transBatchId) {
          const weight = parseFloat(transWeight);
          if (isNaN(weight) || weight <= 0) {
              setError("Please enter a valid weight for sales.");
              return;
          }
          const selectedBatch = availableBatches.find(b => b.id === transBatchId);
          if (selectedBatch && weight > selectedBatch.remaining) {
              setError(`Selling amount (${weight}kg) exceeds available yield for this batch (${selectedBatch.remaining.toFixed(1)}kg).`);
              return;
          }
      }

      let finalSettledDate: string | null = null;
      if (!transIsPending) {
          finalSettledDate = initialData?.settledDate || transDate;
      }
      
      onSave({
          type: transType,
          category: transCategory,
          amount: parseFloat(transAmount) || 0,
          weightKg: isSales ? (parseFloat(transWeight) || null) : null,
          date: transDate,
          batchId: (isIncome && transBatchId.trim()) ? transBatchId.trim() : null,
          orderNumber: transOrderNumber.trim() || null,
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
                         
                         <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (RM)</label>
                                <input type="number" step="0.01" required value={transAmount} onChange={e => setTransAmount(e.target.value)} className="w-full border border-gray-600 rounded-lg p-2.5 bg-gray-700 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors placeholder-gray-400" placeholder="0.00" />
                            </div>
                            {isSales && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Weight (kg)</label>
                                    <input type="number" step="0.1" required={isSales} value={transWeight} onChange={e => setTransWeight(e.target.value)} className="w-full border border-gray-600 rounded-lg p-2.5 bg-gray-700 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors placeholder-gray-400" placeholder="0.0" />
                                </div>
                            )}
                         </div>

                         <div>
                             <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                             <select value={transCategory} onChange={e => { setTransCategory(e.target.value); setError(null); }} className="w-full border border-gray-600 rounded-lg p-2.5 bg-gray-700 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors">
                                 {transType === 'INCOME' ? (
                                     <>
                                         <option value="Sales">Sales</option>
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
                         </div>

                         <div>
                             <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                             <input type="date" required value={transDate} onChange={e => setTransDate(e.target.value)} className="w-full border border-gray-600 rounded-lg p-2.5 bg-gray-700 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" />
                         </div>

                         {isIncome && (
                            <div className="animate-fade-in-up">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Batch ID {isSales && <span className="text-indigo-600 font-bold ml-1">(Must select batch with yield)</span>}</label>
                                <select 
                                    value={transBatchId} 
                                    onChange={e => setTransBatchId(e.target.value)} 
                                    required={isSales}
                                    className="w-full border border-gray-600 rounded-lg p-2.5 bg-gray-700 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                >
                                    <option value="">{isSales ? '-- Select Batch with Yield --' : '-- Optional Batch ID --'}</option>
                                    {availableBatches.map(b => (
                                        <option key={b.id} value={b.id}>
                                            {b.id} {isSales ? `(Avail: ${b.remaining.toFixed(1)}kg)` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                         )}

                         {(transIsPending || initialData?.orderNumber) && (
                            <div className="animate-fade-in-up">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                {transType === 'INCOME' ? 'Customer Order #' : 'Invoice Number'}
                                {isOrderNumberRequired && <span className="text-red-500 ml-1 font-bold">*</span>}
                                </label>
                                <input 
                                type="text" 
                                required={isOrderNumberRequired}
                                value={transOrderNumber} 
                                onChange={e => { setTransOrderNumber(e.target.value); if(e.target.value.trim()) setError(null); }} 
                                className={`w-full border rounded-lg p-2.5 text-white focus:ring-2 transition-colors placeholder-gray-400 ${isOrderNumberRequired && !transOrderNumber.trim() ? 'border-red-400 bg-red-900/20' : 'border-gray-600 bg-gray-700 focus:ring-blue-500'}`} 
                                placeholder={transType === 'INCOME' ? "e.g. ORD-123" : "e.g. INV-987"} 
                                />
                            </div>
                         )}

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

                         {/* Attachment Row moved to the bottom part */}
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
                                    {attachmentName ? 'Change Document' : 'Upload Invoice/Order'}
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
                                        <span className="text-[10px] text-gray-400 italic">No document attached. Supporting PDF/JPG/PNG.</span>
                                    )}
                                </div>
                            </div>
                         </div>

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