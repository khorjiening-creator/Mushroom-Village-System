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

  const isVillageC = villageId === VillageType.C;

  useEffect(() => {
    if (initialData) {
      setTransType(initialData.type);
      setTransAmount(initialData.amount.toString());
      setTransWeight(initialData.weightKg?.toString() || '');
      setTransCategory(initialData.category);
      setTransDate(initialData.date);
      setTransDesc(initialData.description || '');
      setTransPaymentMethod(initialData.paymentMethod || 'Cash');
      setTransIsPending(initialData.status === 'PENDING');
      setAttachmentName(initialData.attachmentName || null);
      setTransBatchId(initialData.batchId || '');
      setTransOrderNumber(initialData.orderNumber || '');
    } else {
      // Defaults
      if (!initialData) {
          // Defaults handled by state initialization
      }
    }
    setError(null);
  }, [initialData, isOpen]);

  // Reset defaults when type changes if creating new
  useEffect(() => {
      if (!initialData) {
          if (transType === 'INCOME') setTransCategory('Sales');
          else setTransCategory('Supplies');
      }
  }, [transType, initialData]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          if (file.size > 10 * 1024 * 1024) {
              setError("File is too large (max 10MB)");
              return;
          }
          setAttachmentName(file.name);
          setError(null);
      }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transAmount || parseFloat(transAmount) <= 0) {
        setError("Please enter a valid amount");
        return;
    }

    onSave({
      type: transType,
      amount: parseFloat(transAmount),
      weightKg: transWeight ? parseFloat(transWeight) : null,
      category: transCategory,
      date: transDate,
      description: transDesc,
      paymentMethod: transPaymentMethod,
      status: transIsPending ? 'PENDING' : 'COMPLETED',
      attachmentName: attachmentName || null,
      batchId: transBatchId || null,
      orderNumber: transOrderNumber || null,
      villageId
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
        <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose}></div>

            <div className="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-xl sm:w-full">
                <div className="bg-white px-6 py-6">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">
                            {initialData ? 'Edit Record' : 'New Financial Record'}
                        </h3>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                     <form onSubmit={handleSubmit} className="space-y-4">
                         {error && (
                             <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg text-sm font-bold">
                                 {error}
                             </div>
                         )}

                         <div className="flex p-1 bg-gray-100 rounded-xl">
                             <button type="button" onClick={() => { setTransType('EXPENSE'); }} className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${transType === 'EXPENSE' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>EXPENSE</button>
                             <button type="button" onClick={() => { setTransType('INCOME'); }} className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${transType === 'INCOME' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>INCOME</button>
                         </div>

                         <div className="grid grid-cols-2 gap-4">
                             <div>
                                 <label className="block text-sm font-medium text-gray-700 mb-1">Amount (RM)</label>
                                 <input type="number" required step="0.01" value={transAmount} onChange={e => setTransAmount(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500" placeholder="0.00" />
                             </div>
                             <div>
                                 <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                                 <input type="date" required value={transDate} onChange={e => setTransDate(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500" />
                             </div>
                         </div>

                         <div className="grid grid-cols-2 gap-4">
                             <div>
                                 <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                                 <select value={transCategory} onChange={e => setTransCategory(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500">
                                     {transType === 'EXPENSE' ? (
                                         <>
                                             <option value="Supplies">Supplies & Materials</option>
                                             <option value="Equipment">Equipment</option>
                                             <option value="Labor">Labor/Payroll</option>
                                             <option value="Utilities">Utilities</option>
                                             <option value="Maintenance">Maintenance</option>
                                             <option value="Logistics">Logistics/Transport</option>
                                             <option value="Others">Others</option>
                                         </>
                                     ) : (
                                         <>
                                             <option value="Sales">Sales</option>
                                             <option value="Investment">Investment</option>
                                             <option value="Others">Others</option>
                                         </>
                                     )}
                                 </select>
                             </div>
                             <div>
                                 <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                                 <select value={transPaymentMethod} onChange={e => setTransPaymentMethod(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500">
                                     <option value="Cash">Cash</option>
                                     <option value="Online Banking">Online Banking</option>
                                     <option value="E-Wallet">E-Wallet</option>
                                     <option value="Cheque">Cheque</option>
                                 </select>
                             </div>
                         </div>

                         {/* Only show Order/Batch if Village C or Expense logic dictates, logic remains same but simplified conditional check */}
                         {(isVillageC) ? (
                            <div className="grid grid-cols-2 gap-4 p-3 bg-blue-50 rounded-xl border border-blue-100">
                                <div>
                                    <label className="block text-[10px] font-black text-blue-800 uppercase mb-1">Order #</label>
                                    <input type="text" value={transOrderNumber} onChange={e => setTransOrderNumber(e.target.value)} className="w-full border border-blue-200 rounded-lg p-2 text-sm" placeholder="SO-001" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-blue-800 uppercase mb-1">Batch ID</label>
                                    <input type="text" value={transBatchId} onChange={e => setTransBatchId(e.target.value)} className="w-full border border-blue-200 rounded-lg p-2 text-sm" placeholder="B-24-001" />
                                </div>
                            </div>
                         ) : (
                             // Only show Batch ID for A/B, no Order Number per original requirement, but simplified to just Batch ID if needed for A/B Expense tracking
                             <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                                 <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Batch Link (Optional)</label>
                                 <input type="text" value={transBatchId} onChange={e => setTransBatchId(e.target.value)} className="w-full border border-gray-200 rounded-lg p-2 text-sm" placeholder="B-24-001" />
                             </div>
                         )}

                         <div>
                             <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                             <textarea required value={transDesc} onChange={e => setTransDesc(e.target.value)} rows={2} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500" placeholder="Details of the transaction..." />
                         </div>

                         <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                             <input type="checkbox" id="isPending" checked={transIsPending} onChange={e => setTransIsPending(e.target.checked)} className="h-4 w-4 text-blue-600 rounded" />
                             <label htmlFor="isPending" className="text-sm font-bold text-gray-700">
                                 Mark as <span className="text-orange-600">PENDING</span> (Account Receivable/Payable)
                             </label>
                         </div>

                         {/* Only show attachment for Village C */}
                         {isVillageC && (
                             <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Document/Receipt Attachment</label>
                                <div onClick={() => fileInputRef.current?.click()} className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer hover:border-blue-400 transition-colors">
                                    <div className="space-y-1 text-center">
                                        <svg className="mx-auto h-10 w-10 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                                            <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                        <div className="text-sm text-gray-600">
                                            <span className="text-blue-600 font-bold">Click to upload</span>
                                        </div>
                                        {attachmentName ? (
                                            <p className="text-xs text-green-600 font-bold">{attachmentName}</p>
                                        ) : (
                                            <span className="text-[10px] text-gray-400 italic">Supporting PDF/JPG/PNG.</span>
                                        )}
                                    </div>
                                </div>
                                <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} accept="image/*,.pdf" />
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