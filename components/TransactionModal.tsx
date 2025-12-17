import React, { useState, useEffect } from 'react';
import { FinancialRecord, VillageType } from '../types';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (record: Partial<FinancialRecord>) => Promise<void>;
  onDelete?: () => void;
  initialData: FinancialRecord | null;
  villageId: VillageType;
  userEmail: string;
  isSubmitting: boolean;
  availableBatches?: string[];
}

export const TransactionModal: React.FC<TransactionModalProps> = ({ 
  isOpen, onClose, onSave, onDelete, initialData, villageId, userEmail, isSubmitting, availableBatches = []
}) => {
  const [transType, setTransType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [transAmount, setTransAmount] = useState('');
  const [transCategory, setTransCategory] = useState('Supplies');
  const [transDate, setTransDate] = useState(new Date().toISOString().split('T')[0]);
  const [transBatchId, setTransBatchId] = useState('');
  const [transOrderNumber, setTransOrderNumber] = useState('');
  const [transDesc, setTransDesc] = useState('');
  const [transPaymentMethod, setTransPaymentMethod] = useState('Cash');
  const [transIsPending, setTransIsPending] = useState(false);

  useEffect(() => {
    if (initialData) {
      setTransType(initialData.type);
      setTransAmount(initialData.amount.toString());
      setTransCategory(initialData.category);
      setTransDate(initialData.date);
      setTransBatchId(initialData.batchId || '');
      setTransOrderNumber(initialData.orderNumber || '');
      setTransDesc(initialData.description || '');
      setTransPaymentMethod(initialData.paymentMethod || 'Cash');
      setTransIsPending(initialData.status === 'PENDING');
    } else {
      // Reset form for new entry
      setTransType('EXPENSE');
      setTransAmount('');
      setTransCategory('Supplies');
      setTransDate(new Date().toISOString().split('T')[0]);
      setTransBatchId('');
      setTransOrderNumber('');
      setTransDesc('');
      setTransPaymentMethod('Cash');
      setTransIsPending(false);
    }
  }, [initialData, isOpen]);

  const handleTransTypeChange = (newType: 'INCOME' | 'EXPENSE') => {
      setTransType(newType);
      if (newType === 'INCOME') {
          setTransCategory('Sales');
      } else {
          setTransCategory('Supplies');
      }
  };

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      
      onSave({
          type: transType,
          category: transCategory,
          amount: parseFloat(transAmount),
          date: transDate,
          batchId: (transBatchId.trim()) ? transBatchId.trim() : null,
          orderNumber: (transIsPending && transOrderNumber.trim()) ? transOrderNumber.trim() : null,
          description: transDesc,
          recordedBy: initialData?.recordedBy || userEmail,
          villageId: initialData?.villageId || villageId,
          paymentMethod: transPaymentMethod,
          status: transIsPending ? 'PENDING' : 'COMPLETED'
      });
  };

  const handleDelete = () => {
      // Directly call delete without confirmation as requested
      if (onDelete) {
          onDelete();
      }
  };

  if (!isOpen) return null;

  // Logic to determine if we show the Invoice/Order # field
  const showOrderNumberInput = transIsPending && (
      transType === 'INCOME' || 
      (transType === 'EXPENSE' && transCategory === 'Supplies')
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
        <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={onClose}></div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6 animate-fade-in-up">
                <div>
                     <h3 className="text-lg font-bold text-gray-900 mb-4">{initialData ? 'Edit Transaction' : 'New Transaction'}</h3>
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
                             <select value={transCategory} onChange={e => setTransCategory(e.target.value)} className="w-full border border-gray-600 rounded-lg p-2.5 bg-gray-700 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors">
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

                         <div className="animate-fade-in-up">
                             <label className="block text-sm font-medium text-gray-700 mb-1">Batch ID {transType === 'INCOME' && '(Linked to Harvest)'}</label>
                             <input 
                                type="text" 
                                list="batchOptions" 
                                value={transBatchId} 
                                onChange={e => setTransBatchId(e.target.value)} 
                                className="w-full border border-gray-600 rounded-lg p-2.5 bg-gray-700 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors placeholder-gray-400" 
                                placeholder={transType === 'INCOME' ? "Select harvested batch..." : "Optional"} 
                             />
                             <datalist id="batchOptions">
                                {availableBatches.map(b => (
                                    <option key={b} value={b} />
                                ))}
                             </datalist>
                         </div>

                         {showOrderNumberInput && (
                             <div className="animate-fade-in-up">
                                 <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {transType === 'INCOME' ? 'Customer Order #' : 'Invoice Number'}
                                 </label>
                                 <input type="text" value={transOrderNumber} onChange={e => setTransOrderNumber(e.target.value)} className="w-full border border-gray-600 rounded-lg p-2.5 bg-gray-700 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors placeholder-gray-400" placeholder={transType === 'INCOME' ? "e.g. ORD-123" : "e.g. INV-987"} />
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
                                 onChange={(e) => setTransIsPending(e.target.checked)}
                                 className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                             />
                             <label htmlFor="pending_status" className="ml-2 block text-sm text-gray-900 cursor-pointer select-none">
                                 Mark as Pending (Unpaid)
                             </label>
                         </div>

                         <div className="flex gap-3 mt-6">
                            {initialData && onDelete ? (
                                <button type="button" onClick={handleDelete} className="bg-red-50 border border-red-200 text-red-600 font-bold py-2.5 px-4 rounded-lg hover:bg-red-100 transition-colors">
                                    Delete Record
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