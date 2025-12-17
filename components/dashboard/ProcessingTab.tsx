import React from 'react';
import { HarvestLog } from '../../types';

interface ProcessingTabProps {
    harvestLogs: HarvestLog[];
}

export const ProcessingTab: React.FC<ProcessingTabProps> = ({ harvestLogs }) => {
    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 animate-fade-in-up">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Processing Line</h2>
            <p className="text-gray-500">Production data and batch tracking would go here.</p>
            <div className="mt-4 border-t border-gray-200 pt-4">
                <h3 className="text-sm font-medium text-gray-900">Recent Harvests (Input)</h3>
                <ul className="mt-2 divide-y divide-gray-200">
                   {harvestLogs.map((log) => (
                        <li key={log.id} className="py-2 flex justify-between text-sm">
                            <span>{log.strain} - Batch {log.batchId}</span>
                            <span className="text-gray-500">
                                {log.weightKg ? log.weightKg.toFixed(1) : (log.totalYield || 0).toFixed(1)} kg
                            </span>
                        </li>
                   ))}
                </ul>
            </div>
        </div>
    );
};