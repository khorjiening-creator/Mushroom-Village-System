import React, { useState } from 'react';
import { FinancialRecord, UserRole } from '../../types';

interface FinancialsTabProps {
    records: FinancialRecord[];
    onAddRecord: () => void;
    onEditRecord: (rec: FinancialRecord) => void;
    onDeleteRecord: (id: string) => void;
    onSettleRecord?: (rec: FinancialRecord) => void;
    userRole: UserRole;
    theme: any;
    onFilterChange: (period: string, category: string, status: string) => void;
}

export const FinancialsTab: React.FC<FinancialsTabProps> = ({ 
    records, onAddRecord, onEditRecord, onDeleteRecord, onSettleRecord, userRole, theme, onFilterChange 
}) => {
    const [financialPeriod, setFinancialPeriod] = useState<'ALL' | 'MONTH' | 'TODAY'>('MONTH');
    const [filterCategory, setFilterCategory] = useState('ALL');
    const [filterStatus, setFilterStatus] = useState<'ALL' | 'COMPLETED' | 'PENDING'>('ALL');

    const handleFilterUpdate = (
        period: 'ALL' | 'MONTH' | 'TODAY', 
        category: string, 
        status: 'ALL' | 'COMPLETED' | 'PENDING'
    ) => {
        setFinancialPeriod(period);
        setFilterCategory(category);
        setFilterStatus(status);
        onFilterChange(period, category, status);
    };

    const canDelete = userRole === 'admin' || userRole === 'finance';
    const canEdit = userRole === 'admin' || userRole === 'finance';

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-bold text-gray-900">Financial Records</h2>
                    <button
                        onClick={onAddRecord}
                        className={`px-4 py-2 rounded-md text-sm font-medium text-white ${theme.button}`}
                    >
                        Add Record
                    </button>
                </div>
                
                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                     <select 
                        value={financialPeriod} 
                        onChange={(e) => handleFilterUpdate(e.target.value as any, filterCategory, filterStatus)}
                        className="block w-full sm:w-auto pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md border bg-gray-700 text-white"
                     >
                         <option value="ALL">All Time</option>
                         <option value="MONTH">This Month</option>
                         <option value="TODAY">Today</option>
                     </select>
                     <select
                        value={filterCategory}
                        onChange={(e) => handleFilterUpdate(financialPeriod, e.target.value, filterStatus)}
                        className="block w-full sm:w-auto pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md border bg-gray-700 text-white"
                     >
                         <option value="ALL">All Categories</option>
                         <optgroup label="Revenue">
                             <option value="Sales">Sales</option>
                             <option value="Investment">Investment</option>
                             <option value="Others">Others (Income)</option>
                         </optgroup>
                         <optgroup label="Expenses">
                             <option value="Supplies">Supplies</option>
                             <option value="Logistic">Logistic</option>
                             <option value="Labor">Labor</option>
                             <option value="Utilities">Utilities</option>
                             <option value="Maintenance">Maintenance</option>
                             <option value="Others">Others (Expense)</option>
                         </optgroup>
                     </select>
                     <select
                        value={filterStatus}
                        onChange={(e) => handleFilterUpdate(financialPeriod, filterCategory, e.target.value as any)}
                        className="block w-full sm:w-auto pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md border bg-gray-700 text-white"
                     >
                         <option value="ALL">All Status</option>
                         <option value="COMPLETED">Completed</option>
                         <option value="PENDING">Pending</option>
                     </select>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Txn ID</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Batch ID</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                {(canDelete || canEdit) && <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {records.map((record) => (
                                <tr key={record.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" onClick={() => onEditRecord(record)}>{new Date(record.date).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-xs font-mono text-gray-500" onClick={() => onEditRecord(record)}>{record.transactionId || '-'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap" onClick={() => onEditRecord(record)}>
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${record.type === 'INCOME' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                            {record.type}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" onClick={() => onEditRecord(record)}>{record.category}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" onClick={() => onEditRecord(record)}>{record.batchId || '-'}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate" onClick={() => onEditRecord(record)}>{record.description || '-'}</td>
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold text-right ${record.type === 'INCOME' ? 'text-green-600' : 'text-red-600'}`} onClick={() => onEditRecord(record)}>
                                        RM{record.amount.toFixed(2)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center" onClick={() => onEditRecord(record)}>
                                        {record.status === 'PENDING' ? (
                                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800 animate-pulse">Pending</span>
                                        ) : (
                                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">Completed</span>
                                        )}
                                    </td>
                                    {(canDelete || canEdit) && (
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            <div className="flex justify-center space-x-2">
                                                {record.status === 'PENDING' && onSettleRecord && (
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onSettleRecord(record);
                                                        }}
                                                        className="text-white bg-green-500 hover:bg-green-600 text-xs font-bold py-1 px-2 rounded shadow-sm"
                                                        title="Mark as Paid"
                                                    >
                                                        Pay
                                                    </button>
                                                )}
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onEditRecord(record);
                                                    }}
                                                    className="text-indigo-600 hover:text-indigo-900 text-xs font-medium border border-indigo-200 px-2 py-1 rounded"
                                                >
                                                    Edit
                                                </button>
                                                {canDelete && (
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onDeleteRecord(record.id);
                                                        }}
                                                        className="text-red-600 hover:text-red-900 text-xs font-medium border border-red-200 px-2 py-1 rounded"
                                                    >
                                                        Delete
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};