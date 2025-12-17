import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, limit, onSnapshot, addDoc, where, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { VillageType, EnvironmentLog, ActivityLog } from '../../types';

interface EnvironmentTabProps {
    villageId: VillageType;
    userEmail: string;
    theme?: any;
}

// --- Knowledge Base: Optimal Conditions per Species ---
const SPECIES_PROFILES: Record<string, { minT: number, maxT: number, minH: number, cycleDays: number }> = {
    'Oyster': { minT: 20, maxT: 28, minH: 80, cycleDays: 21 }, // Fast grower
    'Shiitake': { minT: 12, maxT: 25, minH: 80, cycleDays: 90 }, // Slow grower
    'Button': { minT: 18, maxT: 24, minH: 85, cycleDays: 35 },
    "Lion's Mane": { minT: 18, maxT: 24, minH: 85, cycleDays: 35 },
    // Default fallback
    'Unknown': { minT: 20, maxT: 25, minH: 80, cycleDays: 30 }
};

interface BatchPrediction {
    batchId: string;
    villageId: VillageType;
    strain: string;
    plantingDate: Date;
    daysElapsed: number;
    baseDaysRemaining: number;
    adjustedDaysRemaining: number;
    predictedDate: Date;
    status: 'On Track' | 'Delayed (Heat)' | 'Delayed (Cold)' | 'Delayed (Dry)' | 'Harvest Ready' | 'Critical';
    stressFactor: number; // Days added due to stress
    isTemperatureBad: boolean;
    isHumidityBad: boolean;
}

export const EnvironmentTab: React.FC<EnvironmentTabProps> = ({ villageId, userEmail, theme }) => {
    const [logs, setLogs] = useState<EnvironmentLog[]>([]);
    const [activeBatches, setActiveBatches] = useState<ActivityLog[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Input State
    const [tempInput, setTempInput] = useState('');
    const [humidityInput, setHumidityInput] = useState('');
    const [moistureInput, setMoistureInput] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // --- Data Fetching ---
    useEffect(() => {
        const envColName = `environmentLogs_${villageId.replace(/\s/g, '')}`;

        // 1. Fetch Environment Logs (Realtime)
        const qEnv = query(collection(db, envColName), orderBy('timestamp', 'desc'), limit(50));
        const unsubEnv = onSnapshot(qEnv, (snapshot) => {
            const data: EnvironmentLog[] = [];
            snapshot.forEach(doc => {
                data.push({ id: doc.id, ...doc.data() } as EnvironmentLog);
            });
            setLogs(data);
        });

        // 2. Fetch Active Batches (BED_PREP logs) from both A and B collections
        const fetchBatches = async () => {
            try {
                // Query Optimization: Removed where('type', '==', 'BED_PREP') to avoid composite index requirement.
                // We fetch a larger subset of recent logs and filter client-side.
                const [snapA, snapB] = await Promise.all([
                    getDocs(query(
                        collection(db, 'dailyfarming_logA'), 
                        orderBy('timestamp', 'desc'),
                        limit(150)
                    )),
                    getDocs(query(
                        collection(db, 'dailyfarming_logB'), 
                        orderBy('timestamp', 'desc'),
                        limit(150)
                    ))
                ]);

                const batches: ActivityLog[] = [];
                
                snapA.forEach(doc => {
                    const data = doc.data() as ActivityLog;
                    if (data.type === 'BED_PREP') {
                        batches.push({ id: doc.id, ...data });
                    }
                });

                snapB.forEach(doc => {
                    const data = doc.data() as ActivityLog;
                    if (data.type === 'BED_PREP') {
                        batches.push({ id: doc.id, ...data });
                    }
                });

                // Sort merged list by newest first
                batches.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                
                setActiveBatches(batches);
            } catch (e) {
                console.warn("Error fetching active batches for prediction:", e);
            }
        };

        fetchBatches();
        setLoading(false);

        return () => unsubEnv();
    }, [villageId]);

    // --- Core Logic: Prediction Engine ---
    const latest = logs[0] || { temperature: 0, humidity: 0, moisture: 0 };
    
    const predictions: BatchPrediction[] = useMemo(() => {
        if (!latest.timestamp) return []; // No sensor data yet

        return activeBatches.map(batch => {
            const profile = SPECIES_PROFILES[batch.mushroomStrain || 'Unknown'] || SPECIES_PROFILES['Unknown'];
            const planted = new Date(batch.timestamp);
            const now = new Date();
            
            // Time Calc
            const diffTime = Math.abs(now.getTime() - planted.getTime());
            const daysElapsed = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            const baseRemaining = Math.max(0, profile.cycleDays - daysElapsed);

            // Environmental Impact Analysis
            const t = latest.temperature;
            const h = latest.humidity;
            
            let stressDelay = 0;
            let status: BatchPrediction['status'] = 'On Track';
            let isTemperatureBad = false;
            let isHumidityBad = false;

            // 1. Temperature Check
            if (t > profile.maxT) {
                stressDelay += 3; // Significant delay due to heat stress
                status = 'Delayed (Heat)';
                isTemperatureBad = true;
            } else if (t < profile.minT) {
                stressDelay += 2; // Metabolic slowdown
                status = 'Delayed (Cold)';
                isTemperatureBad = true;
            }

            // 2. Humidity Check
            if (h < profile.minH) {
                stressDelay += 2; // Drying out
                status = isTemperatureBad ? 'Critical' : 'Delayed (Dry)'; // Compound issue if temp is also bad
                isHumidityBad = true;
            }

            // Calculate Final Dates
            const totalRemaining = baseRemaining + stressDelay;
            const predictDate = new Date();
            predictDate.setDate(predictDate.getDate() + totalRemaining);

            // Override if cycle completed
            if (baseRemaining <= 0 && !isTemperatureBad && !isHumidityBad) {
                status = 'Harvest Ready';
            }

            return {
                batchId: batch.batchId || '???',
                villageId: batch.villageId,
                strain: batch.mushroomStrain || 'Unknown',
                plantingDate: planted,
                daysElapsed,
                baseDaysRemaining: baseRemaining,
                adjustedDaysRemaining: totalRemaining,
                predictedDate: predictDate,
                status,
                stressFactor: stressDelay,
                isTemperatureBad,
                isHumidityBad
            };
        }).sort((a, b) => a.adjustedDaysRemaining - b.adjustedDaysRemaining); // Show soonest harvest first
    }, [activeBatches, logs]);

    // --- Actions ---
    const handleAddReading = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!tempInput || !humidityInput) return;
        
        setIsSubmitting(true);
        try {
            const colName = `environmentLogs_${villageId.replace(/\s/g, '')}`;
            await addDoc(collection(db, colName), {
                temperature: parseFloat(tempInput),
                humidity: parseFloat(humidityInput),
                moisture: parseFloat(moistureInput) || 0,
                timestamp: new Date().toISOString(),
                recordedBy: userEmail,
                villageId
            });
            setTempInput('');
            setHumidityInput('');
            setMoistureInput('');
        } catch (err) {
            console.error(err);
            alert("Failed to save reading");
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- Chart Data ---
    const chartData = useMemo(() => {
        return [...logs].reverse().slice(-20);
    }, [logs]);

    const maxTemp = 40; 
    const maxHumid = 100;

    return (
        <div className="space-y-6 animate-fade-in-up">
            
            {/* 1a. Harvest Ready Alert Banner */}
            {predictions.some(p => p.status === 'Harvest Ready') && (
                <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-md shadow-sm flex items-start">
                    <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                           <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <div className="ml-3">
                        <h3 className="text-sm font-medium text-green-800">Harvest Ready</h3>
                        <div className="mt-2 text-sm text-green-700">
                             <p>
                                {predictions.filter(p => p.status === 'Harvest Ready').length} batch(es) have completed their growth cycle and are ready for harvesting.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* 1b. Global Alert Banner (If Critical) */}
            {predictions.some(p => p.status === 'Critical' || p.status.includes('Delayed')) && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md shadow-sm flex items-start">
                    <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <div className="ml-3">
                        <h3 className="text-sm font-medium text-red-800">Environmental Stress Detected</h3>
                        <div className="mt-2 text-sm text-red-700">
                            <p>Current conditions are outside optimal ranges for active batches. Harvest dates have been automatically delayed to account for slow growth.</p>
                        </div>
                    </div>
                </div>
            )}

            {/* 2. Current Readings (Global) */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                <div className={`bg-white overflow-hidden shadow rounded-lg border-l-4 ${latest.temperature > 28 ? 'border-red-500' : 'border-green-500'}`}>
                    <div className="px-4 py-5 sm:p-6">
                        <dt className="text-xs font-medium text-gray-500 uppercase truncate">Temperature</dt>
                        <dd className="mt-1 text-3xl font-semibold text-gray-900 flex items-baseline">
                            {latest.temperature}°C
                            {latest.temperature > 28 && <span className="ml-2 text-[10px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full animate-pulse">HOT</span>}
                        </dd>
                    </div>
                </div>
                <div className={`bg-white overflow-hidden shadow rounded-lg border-l-4 ${latest.humidity < 75 ? 'border-orange-500' : 'border-blue-500'}`}>
                    <div className="px-4 py-5 sm:p-6">
                        <dt className="text-xs font-medium text-gray-500 uppercase truncate">Humidity</dt>
                        <dd className="mt-1 text-3xl font-semibold text-gray-900 flex items-baseline">
                            {latest.humidity}%
                            {latest.humidity < 75 && <span className="ml-2 text-[10px] font-bold bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">DRY</span>}
                        </dd>
                    </div>
                </div>
                <div className="bg-white overflow-hidden shadow rounded-lg border-l-4 border-gray-400">
                    <div className="px-4 py-5 sm:p-6">
                        <dt className="text-xs font-medium text-gray-500 uppercase truncate">Substrate Moisture</dt>
                        <dd className="mt-1 text-3xl font-semibold text-gray-900">{latest.moisture}%</dd>
                    </div>
                </div>
            </div>

            {/* 3. Harvest Forecast & Countdowns */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">Active Batch Harvest Forecast</h3>
                        <p className="text-xs text-gray-500">Real-time predictions based on species & environment</p>
                    </div>
                    {/* Legend */}
                    <div className="hidden sm:flex gap-2 text-[10px] font-medium uppercase text-gray-400">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span> On Track</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> Delayed</span>
                    </div>
                </div>
                
                {predictions.length === 0 ? (
                    <div className="p-10 text-center text-gray-400">
                        <p>No active batches or sensor data available to generate predictions.</p>
                        <p className="text-xs mt-2">Ensure "Bed Prep" has been logged in Farming tab and sensors are active.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6 bg-gray-50/50">
                        {predictions.map((p) => {
                            const isDelayed = p.stressFactor > 0;
                            const isReady = p.status === 'Harvest Ready';
                            
                            // Visual Styles based on status
                            let cardBorder = "border-gray-200";
                            let statusBadge = "bg-gray-100 text-gray-600";
                            
                            if (isReady) {
                                cardBorder = "border-green-400 ring-2 ring-green-100";
                                statusBadge = "bg-green-100 text-green-800";
                            } else if (p.status.includes('Heat')) {
                                cardBorder = "border-red-300";
                                statusBadge = "bg-red-100 text-red-800";
                            } else if (p.status.includes('Dry')) {
                                cardBorder = "border-orange-300";
                                statusBadge = "bg-orange-100 text-orange-800";
                            } else if (p.status.includes('Cold')) {
                                cardBorder = "border-blue-300";
                                statusBadge = "bg-blue-100 text-blue-800";
                            } else {
                                cardBorder = "border-l-4 border-l-green-500";
                                statusBadge = "bg-green-50 text-green-700";
                            }

                            return (
                                <div key={p.batchId} className={`bg-white rounded-lg shadow-sm border p-4 relative ${cardBorder} transition-all duration-300 hover:shadow-md`}>
                                    {/* Header */}
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <h4 className="font-bold text-gray-900 flex items-center gap-2">
                                                {p.batchId}
                                                <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded border border-gray-200">
                                                    {p.villageId}
                                                </span>
                                            </h4>
                                            <div className="text-xs text-gray-500">{p.strain} • Planted {p.plantingDate.toLocaleDateString()}</div>
                                        </div>
                                        <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${statusBadge}`}>
                                            {p.status}
                                        </span>
                                    </div>

                                    {/* Countdown */}
                                    <div className="my-4 text-center">
                                        {isReady ? (
                                            <div className="text-green-600 font-bold text-xl animate-bounce">
                                                Ready Now
                                            </div>
                                        ) : (
                                            <div className="flex justify-center items-baseline gap-1">
                                                <span className={`text-4xl font-extrabold tracking-tight ${isDelayed ? 'text-gray-500' : 'text-indigo-600'}`}>
                                                    {p.adjustedDaysRemaining}
                                                </span>
                                                <span className="text-sm text-gray-500 font-medium">days left</span>
                                            </div>
                                        )}
                                        <div className="text-xs text-gray-400 mt-1">
                                            Est: {p.predictedDate.toLocaleDateString(undefined, {month:'short', day:'numeric'})}
                                        </div>
                                    </div>

                                    {/* Environment Check for this Batch */}
                                    <div className="border-t border-gray-100 pt-3 flex justify-between items-center text-xs">
                                        <div className="flex items-center gap-2">
                                            <span className={`flex items-center gap-1 ${p.isTemperatureBad ? 'text-red-500 font-bold' : 'text-green-600'}`}>
                                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" /></svg>
                                                Temp
                                            </span>
                                            <span className={`flex items-center gap-1 ${p.isHumidityBad ? 'text-orange-500 font-bold' : 'text-blue-600'}`}>
                                                 <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                                Humid
                                            </span>
                                        </div>
                                        
                                        {isDelayed && (
                                            <span className="text-red-500 font-bold">
                                                +{p.stressFactor} day delay
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* 4. Charts & Input Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Data Entry Form */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 h-full">
                    <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                         <h3 className="text-lg font-bold text-gray-900">Log Sensor Readings</h3>
                         <p className="text-xs text-gray-500">Manual entry (Simulates IoT device)</p>
                    </div>
                    <form onSubmit={handleAddReading} className="p-6 space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-700">Temperature (°C)</label>
                            <input 
                                type="number" step="0.1" required 
                                value={tempInput} onChange={e => setTempInput(e.target.value)}
                                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                placeholder="Optimal: 20-25"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700">Humidity (%)</label>
                            <input 
                                type="number" step="0.1" required 
                                value={humidityInput} onChange={e => setHumidityInput(e.target.value)}
                                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                placeholder="Optimal: >80"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700">Soil Moisture (%)</label>
                            <input 
                                type="number" step="0.1" 
                                value={moistureInput} onChange={e => setMoistureInput(e.target.value)}
                                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            />
                        </div>
                        <button 
                            type="submit" 
                            disabled={isSubmitting}
                            className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${theme?.button || 'bg-indigo-600'} hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2`}
                        >
                            {isSubmitting ? 'Saving...' : 'Update Sensors'}
                        </button>
                    </form>
                </div>

                {/* Charts Section */}
                <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col justify-between">
                    <h3 className="text-lg font-bold text-gray-900 mb-6">Historical Trends</h3>
                    
                    {loading ? (
                        <div className="h-64 flex items-center justify-center text-gray-400">Loading charts...</div>
                    ) : logs.length === 0 ? (
                        <div className="h-64 flex items-center justify-center text-gray-400">No data available. Add a reading to start.</div>
                    ) : (
                        <div className="space-y-8 flex-1">
                            {/* Temperature Chart */}
                            <div>
                                <div className="flex justify-between text-xs text-gray-500 mb-2">
                                    <span>Temperature Trend (°C)</span>
                                    <span>Target: 20-26°C</span>
                                </div>
                                <div className="h-32 w-full bg-gray-50 rounded-lg border border-gray-100 flex items-end px-2 pt-4 pb-0 space-x-1 sm:space-x-2 relative">
                                    {/* Safe Zone Indicator */}
                                    <div className="absolute left-0 right-0 bottom-[50%] h-[15%] bg-green-500/10 pointer-events-none border-y border-green-500/20 z-0"></div>

                                    {chartData.map((d, i) => (
                                        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full z-10 group">
                                            <div 
                                                className={`w-full max-w-[20px] rounded-t-sm transition-all duration-500 relative ${d.temperature > 28 ? 'bg-red-400' : d.temperature < 20 ? 'bg-blue-300' : 'bg-green-400'}`}
                                                style={{ height: `${(d.temperature / maxTemp) * 100}%` }}
                                            >
                                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20">
                                                    {d.temperature}°C<br/>{new Date(d.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Humidity Chart */}
                            <div>
                                <div className="flex justify-between text-xs text-gray-500 mb-2">
                                    <span>Humidity Trend (%)</span>
                                    <span>Target: &gt;80%</span>
                                </div>
                                <div className="h-32 w-full bg-gray-50 rounded-lg border border-gray-100 flex items-end px-2 pt-4 pb-0 space-x-1 sm:space-x-2 relative">
                                    <div className="absolute left-0 right-0 top-0 h-[20%] bg-blue-500/5 pointer-events-none border-b border-blue-500/20 z-0"></div>

                                    {chartData.map((d, i) => (
                                        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full z-10 group">
                                            <div 
                                                className={`w-full max-w-[20px] rounded-t-sm transition-all duration-500 relative ${d.humidity < 70 ? 'bg-orange-300' : 'bg-blue-400'}`}
                                                style={{ height: `${(d.humidity / maxHumid) * 100}%` }}
                                            >
                                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20">
                                                    {d.humidity}%<br/>{new Date(d.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};