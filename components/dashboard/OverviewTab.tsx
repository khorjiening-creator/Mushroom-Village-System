import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, orderBy, limit, where } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { VillageType, VillageRole, FinancialRecord, ActivityLog, ResourceItem } from '../../types';
import { VILLAGES } from '../../constants';
// Specific Views
import { FarmingFinanceView, FarmingUserView, FarmingAdminView } from './overview/FarmingOverview';
import { ProcessingFinanceView, ProcessingUserView, ProcessingAdminView } from './overview/ProcessingOverview';

interface OverviewTabProps {
  villageId: VillageType;
  userName: string;
  theme: any;
  financeOverviewData?: any; 
  userRole: string;
  isFinance: boolean;
  financialRecords?: FinancialRecord[];
  setActiveTab: (tab: any) => void;
  openEditTransModal: (rec: FinancialRecord) => void;
  chartFilter?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  setChartFilter?: (filter: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY') => void;
  setFinancialFilterOverride?: (filter: {status?: 'ALL'|'PENDING'|'COMPLETED', category?: string} | null) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ 
    villageId, userName, theme, financeOverviewData, userRole, isFinance, financialRecords = [], setActiveTab, openEditTransModal, chartFilter, setChartFilter, setFinancialFilterOverride
}) => {
    const village = VILLAGES[villageId];
    const isFarming = village.role === VillageRole.FARMING;
    const isProcessing = village.role === VillageRole.PROCESSING;
    const isAdmin = userRole === 'admin';
    
    // --- Data Fetching State ---
    const [activeBatches, setActiveBatches] = useState<ActivityLog[]>([]);
    const [resources, setResources] = useState<ResourceItem[]>([]);
    const [processingStats, setProcessingStats] = useState({ intake: 0, qc: 0, packing: 0, ready: 0 });
    const [logisticsStats, setLogisticsStats] = useState({ scheduled: 0, delivering: 0, failed: 0 });
    const [latestEnvLog, setLatestEnvLog] = useState<any>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // 1. Resources (Common)
                const resCol = villageId === VillageType.A ? 'resourcesA' : villageId === VillageType.B ? 'resourcesB' : 'resourcesC';
                const resSnap = await getDocs(collection(db, resCol));
                const resList: ResourceItem[] = [];
                resSnap.forEach(doc => resList.push({ id: doc.id, ...doc.data() } as ResourceItem));
                setResources(resList);

                // 2. Farming Specific
                if (isFarming) {
                    const farmingCol = villageId === VillageType.A ? 'dailyfarming_logA' : 'dailyfarming_logB';
                    const batchQ = query(collection(db, farmingCol), orderBy('timestamp', 'desc'), limit(100));
                    const batchSnap = await getDocs(batchQ);
                    const batches: ActivityLog[] = [];
                    batchSnap.forEach(doc => {
                        const data = doc.data() as ActivityLog;
                        if (data.type === 'SUBSTRATE_PREP' && data.batchStatus !== 'COMPLETED') {
                            const predicted = data.predictedYield || 0;
                            const actual = data.totalYield || 0;
                            const wastage = data.totalWastage || 0;
                            if (predicted === 0 || (actual + wastage) < predicted) {
                                batches.push({ id: doc.id, ...data });
                            }
                        }
                    });
                    setActiveBatches(batches);

                    // Fetch Latest Env Log for Alerts
                    const envCol = villageId === VillageType.A ? 'environmentLogs_VillageA' : 'environmentLogs_VillageB';
                    const envQ = query(collection(db, envCol), orderBy('timestamp', 'desc'), limit(1));
                    const envSnap = await getDocs(envQ);
                    if (!envSnap.empty) {
                        setLatestEnvLog(envSnap.docs[0].data());
                    }
                } 
                
                // 3. Processing Specific
                if (isProcessing) {
                    const procQ = query(collection(db, "processing_logs"), where("status", "==", "IN_PROGRESS"));
                    const procSnap = await getDocs(procQ);
                    const stats = { intake: 0, qc: 0, packing: 0, ready: 0 };
                    
                    procSnap.forEach(doc => {
                        const d = doc.data();
                        if (d.currentStep === 2) stats.qc++;
                        else if (d.currentStep >= 3 && d.currentStep <= 5) stats.intake++;
                        else if (d.currentStep === 6) stats.packing++;
                    });
                    setProcessingStats(stats);

                    const delQ = query(collection(db, "delivery_records"), where("status", "in", ["SCHEDULED", "OUT_FOR_DELIVERY", "FAILED"]));
                    const delSnap = await getDocs(delQ);
                    const logStats = { scheduled: 0, delivering: 0, failed: 0 };
                    delSnap.forEach(doc => {
                        const s = doc.data().status;
                        if (s === 'SCHEDULED') logStats.scheduled++;
                        if (s === 'OUT_FOR_DELIVERY') logStats.delivering++;
                        if (s === 'FAILED') logStats.failed++;
                    });
                    setLogisticsStats(logStats);
                }
            } catch (e) {
                console.error("Overview data fetch error", e);
            }
        };
        fetchData();
    }, [villageId, isFarming, isProcessing]);

    const goToPendingFinancials = () => {
        if (setFinancialFilterOverride) {
            setFinancialFilterOverride({ status: 'PENDING' });
        }
        setActiveTab('financial');
    };

    // --- Helpers for Farming Finance ---
    const activeBatchEfficiency = useMemo(() => {
        return activeBatches.map(b => {
            const predicted = b.predictedYield || 0;
            const actual = b.totalYield || 0;
            const efficiency = predicted > 0 ? (actual / predicted) * 100 : 0;
            return { ...b, efficiency };
        }).sort((a,b) => a.efficiency - b.efficiency);
    }, [activeBatches]);

    const globalActiveEfficiency = useMemo(() => {
        if (!activeBatchEfficiency.length) return 0;
        const total = activeBatchEfficiency.reduce((a,b) => a + b.efficiency, 0);
        return total / activeBatchEfficiency.length;
    }, [activeBatchEfficiency]);

    const costStats = useMemo(() => {
        const expenses = financialRecords.filter(r => r.type === 'EXPENSE').reduce((a, b) => a + b.amount, 0);
        const income = financialRecords.filter(r => r.type === 'INCOME' && r.category === 'Sales').reduce((a, b) => a + b.amount, 0);
        const costPerBatch = activeBatches.length > 0 ? expenses / Math.max(activeBatches.length, 1) : 0; 
        const grossMargin = income > 0 ? ((income - expenses) / income) * 100 : 0;
        const estimatedTotalYield = activeBatches.length * 5; 
        const avgCostPerKg = estimatedTotalYield > 0 ? expenses / estimatedTotalYield : 0;
        return { avgCostPerKg, costPerBatch, grossMargin };
    }, [financialRecords, activeBatches]);

    const outstandingStats = useMemo(() => {
        const pending = financialRecords.filter(r => r.status === 'PENDING');
        const transactions = pending.map(r => {
            const isOverdue = (new Date().getTime() - new Date(r.date).getTime()) / (1000 * 3600 * 24) > 7;
            return {
                id: r.id,
                type: r.type === 'INCOME' ? 'Receivable' : 'Payable',
                status: isOverdue ? 'Overdue' : 'Pending',
                party: r.description || r.category,
                amount: r.amount,
                dueDate: r.date,
                rawRecord: r
            };
        }).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
        return { transactions };
    }, [financialRecords]);

    // ==========================================
    // RENDER LOGIC
    // ==========================================

    // --- VILLAGE C (Processing) ---
    if (isProcessing) {
        if (isAdmin) {
            return <ProcessingAdminView 
                financeOverviewData={financeOverviewData} 
                financialRecords={financialRecords} 
                setActiveTab={setActiveTab} 
                processingStats={processingStats} 
                logisticsStats={logisticsStats} 
            />;
        } else if (isFinance) {
            return <ProcessingFinanceView 
                financeOverviewData={financeOverviewData} 
                financialRecords={financialRecords} 
                setActiveTab={setActiveTab}
                processingStats={processingStats} 
                logisticsStats={logisticsStats}
            />;
        } else {
            // User Role
            return <ProcessingUserView 
                financeOverviewData={financeOverviewData} 
                financialRecords={financialRecords} 
                setActiveTab={setActiveTab}
                processingStats={processingStats} 
                logisticsStats={logisticsStats}
            />;
        }
    }

    // --- VILLAGE A & B (Farming) ---
    if (isFarming) {
        if (isAdmin) {
            return <FarmingAdminView 
                villageName={village.name}
                financeOverviewData={financeOverviewData}
                activeBatches={activeBatches}
                resources={resources}
                financialRecords={financialRecords}
                setActiveTab={setActiveTab}
                openEditTransModal={openEditTransModal}
                goToPendingFinancials={goToPendingFinancials}
                costStats={costStats}
                outstandingStats={outstandingStats}
                activeBatchEfficiency={activeBatchEfficiency}
                globalActiveEfficiency={globalActiveEfficiency}
            />;
        } else if (isFinance) {
            return <FarmingFinanceView 
                villageName={village.name}
                financeOverviewData={financeOverviewData}
                activeBatches={activeBatches}
                resources={resources}
                financialRecords={financialRecords}
                setActiveTab={setActiveTab}
                openEditTransModal={openEditTransModal}
                goToPendingFinancials={goToPendingFinancials}
                costStats={costStats}
                outstandingStats={outstandingStats}
                activeBatchEfficiency={activeBatchEfficiency}
                globalActiveEfficiency={globalActiveEfficiency}
            />;
        } else {
            // User Role
            return <FarmingUserView 
                villageName={village.name}
                financeOverviewData={financeOverviewData}
                activeBatches={activeBatches}
                resources={resources}
                financialRecords={financialRecords}
                setActiveTab={setActiveTab}
                openEditTransModal={openEditTransModal}
                goToPendingFinancials={goToPendingFinancials}
                costStats={costStats}
                outstandingStats={outstandingStats}
                activeBatchEfficiency={activeBatchEfficiency}
                globalActiveEfficiency={globalActiveEfficiency}
                latestEnvLog={latestEnvLog}
            />;
        }
    }

    return (
        <div className="p-10 text-center text-gray-400">
            <p>Dashboard Loading...</p>
        </div>
    );
};