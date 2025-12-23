
import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs, where } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { ActivityLog, VillageType } from '../../types';
import { FarmingRegistry } from './FarmingRegistry';
import { FarmingReports } from './FarmingReports';

interface ExtendedActivityLog extends ActivityLog {
    totalWastage?: number;
    stepsCompleted?: string[];
}

interface FarmingTabProps {
  villageId: VillageType;
  userEmail: string;
  theme: any;
  farmingLogs: ActivityLog[]; // Props from dashboard (recent logs)
  onActivityLogged?: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
  setActiveTab?: (tab: any) => void;
}

export const FarmingTab: React.FC<FarmingTabProps> = ({ 
    villageId, userEmail, theme, onActivityLogged, onSuccess, onError, setActiveTab 
}) => {
  const getCollectionName = (vid: VillageType) => {
    if (vid === VillageType.A) return "dailyfarming_logA";
    if (vid === VillageType.B) return "dailyfarming_logB";
    return "farmingActivities"; 
  };
  
  const collectionName = getCollectionName(villageId);

  const [viewMode, setViewMode] = useState<'REGISTRY' | 'PRODUCTIVITY'>('REGISTRY');
  const [batchList, setBatchList] = useState<ExtendedActivityLog[]>([]);
  const [recordedWastageList, setRecordedWastageList] = useState<any[]>([]);
  const [isLoadingBatches, setIsLoadingBatches] = useState(false);
  const [envPrompt, setEnvPrompt] = useState<{batchId: string, room: string} | null>(null);
  
  // Lifted State: Date Filters
  const [filterStartDate, setFilterStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30); 
    return d.toISOString().split('T')[0];
  });
  const [filterEndDate, setFilterEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  const fetchBatches = async () => {
    setIsLoadingBatches(true);
    try {
        const start = new Date(filterStartDate);
        const end = new Date(filterEndDate);
        end.setHours(23, 59, 59, 999);
        
        // Ensure valid dates
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            throw new Error("Invalid date range");
        }

        const q = query(collection(db, collectionName), where("timestamp", ">=", start.toISOString()), where("timestamp", "<=", end.toISOString()), orderBy("timestamp", "desc"), limit(100));
        const snapshot = await getDocs(q);
        const logs: ExtendedActivityLog[] = [];
        snapshot.forEach(doc => { logs.push({ id: doc.id, ...doc.data() as ExtendedActivityLog }); });
        setBatchList(logs);
    } catch (error) {
        console.error("Error fetching batches:", error);
    } finally {
        setIsLoadingBatches(false);
    }
  };

  const fetchRecordedWastage = async () => {
      try {
        const colName = villageId === VillageType.A ? "farmingwastage_A" : villageId === VillageType.B ? "farmingwastage_B" : null;
        if (!colName) return;
        const start = new Date(filterStartDate);
        const end = new Date(filterEndDate);
        end.setHours(23, 59, 59, 999);
        const q = query(collection(db, colName), where("timestamp", ">=", start.toISOString()), where("timestamp", "<=", end.toISOString()), orderBy("timestamp", "desc"));
        const snap = await getDocs(q);
        const logs = snap.docs.map(doc => ({id: doc.id, ...doc.data()}));
        setRecordedWastageList(logs);
      } catch(e) {
          console.error("Error fetching wastage logs", e);
      }
  };

  // Trigger fetch when village or dates change
  useEffect(() => {
    fetchBatches();
    fetchRecordedWastage();
  }, [villageId, collectionName, filterStartDate, filterEndDate]);

  const handleRefresh = () => {
      fetchBatches();
      fetchRecordedWastage();
      if (onActivityLogged) onActivityLogged();
  };

  if (isLoadingBatches && batchList.length === 0) {
      return <div className="p-10 text-center text-gray-400 animate-pulse">Loading farming data...</div>;
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
        {envPrompt && (
            <div className="p-4 bg-indigo-50 border-l-4 border-indigo-500 rounded-r-lg shadow-sm flex items-center justify-between animate-fade-in-down mb-4">
                <div className="flex items-center gap-3">
                    <span className="bg-indigo-100 p-2 rounded-full text-indigo-600">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </span>
                    <div>
                        <h4 className="text-sm font-bold text-indigo-900">New Batch Started: {envPrompt.batchId}</h4>
                        <p className="text-xs text-indigo-700">Go to Environment Tab to log initial conditions for Room {envPrompt.room}.</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setEnvPrompt(null)} 
                        className="px-3 py-1 text-xs font-bold text-indigo-600 hover:bg-indigo-100 rounded"
                    >
                        Dismiss
                    </button>
                    {setActiveTab && (
                        <button 
                            onClick={() => { setActiveTab('environment'); setEnvPrompt(null); }} 
                            className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded shadow hover:bg-indigo-700 transition-colors uppercase"
                        >
                            Go to Environment
                        </button>
                    )}
                </div>
            </div>
        )}

        <div className="flex justify-center mb-6">
            <div className="bg-gray-100 p-1 rounded-lg flex space-x-1">
                <button onClick={() => setViewMode('REGISTRY')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${viewMode === 'REGISTRY' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Registry & Actions</button>
                <button onClick={() => setViewMode('PRODUCTIVITY')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${viewMode === 'PRODUCTIVITY' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Productivity Reports</button>
            </div>
        </div>

        {viewMode === 'REGISTRY' ? (
            <FarmingRegistry 
                villageId={villageId}
                userEmail={userEmail}
                theme={theme}
                batchList={batchList}
                recordedWastageList={recordedWastageList}
                onRefresh={handleRefresh}
                onSuccess={onSuccess}
                onError={onError}
                setActiveTab={setActiveTab}
                triggerEnvPrompt={setEnvPrompt}
                // Pass state control props
                filterStartDate={filterStartDate}
                setFilterStartDate={setFilterStartDate}
                filterEndDate={filterEndDate}
                setFilterEndDate={setFilterEndDate}
            />
        ) : (
            <FarmingReports 
                villageId={villageId}
                batchList={batchList}
                recordedWastageList={recordedWastageList}
                onSuccess={onSuccess}
                onError={onError}
            />
        )}
    </div>
  );
};
