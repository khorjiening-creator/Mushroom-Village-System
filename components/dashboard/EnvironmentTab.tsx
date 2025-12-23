
import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, limit, onSnapshot, addDoc, getDocs, where, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { ActivityLog, VillageType } from '../../types';
import { MUSHROOM_ROOM_MAPPING } from '../../constants';

interface EnvironmentTabProps {
    villageId: VillageType;
    userEmail: string;
    theme?: any;
    onSuccess?: (msg: string) => void;
    onError?: (msg: string) => void;
    setActiveTab?: (tab: any) => void;
}

interface ExtendedEnvLog {
    id: string;
    roomId?: string;
    temperature: number;
    humidity: number;
    moisture: number;
    timestamp: string;
    recordedBy: string;
}

// 3️⃣ Ideal Conditions Reference (By Mushroom Type)
const IDEAL_CONDITIONS: Record<string, { minT: number, maxT: number, minH: number, maxH: number, minM: number, maxM: number }> = {
    'Oyster': { minT: 22, maxT: 30, minH: 80, maxH: 95, minM: 60, maxM: 70 },
    'Button': { minT: 16, maxT: 22, minH: 85, maxH: 90, minM: 65, maxM: 75 },
    'Shiitake': { minT: 18, maxT: 24, minH: 75, maxH: 85, minM: 60, maxM: 70 },
    "Lion's Mane": { minT: 18, maxT: 24, minH: 85, maxH: 95, minM: 65, maxM: 75 },
};

const SPECIES_CYCLES: Record<string, number> = {
    'Oyster': 21,
    'Shiitake': 90,
    'Button': 35,
    "Lion's Mane": 35,
    'Unknown': 30
};

const EQUIPMENT_TYPES = ['Exhaust Fan', 'Humidifier', 'Air Cooler', 'Heater'] as const;

export const EnvironmentTab: React.FC<EnvironmentTabProps> = ({ villageId, userEmail, theme, onSuccess, onError, setActiveTab }) => {
    const [logs, setLogs] = useState<ExtendedEnvLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeRoom, setActiveRoom] = useState('A1');
    const [activeBatches, setActiveBatches] = useState<ActivityLog[]>([]);
    const [activeRooms, setActiveRooms] = useState<string[]>(['A1']); // Derived from active batches
    const [selectedTypeFilter, setSelectedTypeFilter] = useState('All');
    
    // External Weather Simulation State
    const [outsideTemp, setOutsideTemp] = useState(30);
    const [outsideHumidity, setOutsideHumidity] = useState(65);

    // Manual Input State
    const [inputTemp, setInputTemp] = useState('');
    const [inputHumid, setInputHumid] = useState('');
    const [inputMoist, setInputMoist] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Notifications & Equipment State
    const [notifications, setNotifications] = useState<{type: 'HARVEST'|'RISK'|'WEATHER'|'SYSTEM', msg: string, action?: string, urgency?: 'Normal'|'High'|'Critical'}[]>([]);
    const [equipmentState, setEquipmentState] = useState<Record<string, boolean>>({});

    // Fetch Equipment Status for Active Room
    useEffect(() => {
        if (villageId === VillageType.C) return;
        const resColName = villageId === VillageType.A ? 'resourcesA' : 'resourcesB';
        const q = query(collection(db, resColName), where("category", "==", "Equipment"));
        
        const unsub = onSnapshot(q, (snap) => {
            const status: Record<string, boolean> = {};
            snap.forEach(doc => {
                const data = doc.data();
                const locs = data.location ? data.location.split(',').map((s: string) => s.trim()) : [];
                if (locs.includes(activeRoom)) {
                    status[data.name] = true;
                }
            });
            setEquipmentState(status);
        });
        return () => unsub();
    }, [villageId, activeRoom]);

    // Fetch Env Logs
    useEffect(() => {
        const envColName = `environmentLogs_${villageId.replace(/\s/g, '')}`;
        const qEnv = query(collection(db, envColName), orderBy('timestamp', 'desc'), limit(100));
        const unsub = onSnapshot(qEnv, (snapshot) => {
            const data: ExtendedEnvLog[] = [];
            snapshot.forEach(doc => { const d = doc.data() as ExtendedEnvLog; data.push({ id: doc.id, ...d }); });
            setLogs(data);
            setLoading(false);
        });
        return () => unsub();
    }, [villageId]);

    // Fetch Active Batches & Derive Rooms
    useEffect(() => {
        const fetchBatches = async () => {
            if (villageId === VillageType.C) return;
            const farmingCol = villageId === VillageType.A ? 'dailyfarming_logA' : 'dailyfarming_logB';
            try {
                const q = query(collection(db, farmingCol), orderBy('timestamp', 'desc'), limit(50));
                const snap = await getDocs(q);
                const batches: ActivityLog[] = [];
                const roomSet = new Set<string>();

                snap.forEach(doc => {
                    const data = doc.data() as ActivityLog;
                    if (data.type === 'SUBSTRATE_PREP' && data.batchStatus !== 'COMPLETED') {
                        const predicted = data.predictedYield || 0;
                        const actual = data.totalYield || 0;
                        const wastage = data.totalWastage || 0;
                        const totalOutput = actual + wastage;

                        // Logic: Remove batch if Output >= Predicted
                        // Show batch if Output < Predicted
                        if (predicted > 0 && totalOutput < predicted) {
                            batches.push({ id: doc.id, ...data });
                            if (data.roomId) roomSet.add(data.roomId);
                        }
                    }
                });
                
                setActiveBatches(batches);
                const rooms = Array.from(roomSet).sort();
                if (rooms.length > 0) {
                    setActiveRooms(rooms);
                } else {
                    const allRooms = Object.values(MUSHROOM_ROOM_MAPPING).flat().sort();
                    setActiveRooms(allRooms);
                }
            } catch (e) { console.error("Error fetching batches", e); }
        };
        fetchBatches();
    }, [villageId]);

    const handleAddReading = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const envColName = `environmentLogs_${villageId.replace(/\s/g, '')}`;
            await addDoc(collection(db, envColName), {
                roomId: activeRoom,
                temperature: parseFloat(inputTemp),
                humidity: parseFloat(inputHumid),
                moisture: parseFloat(inputMoist),
                timestamp: new Date().toISOString(),
                recordedBy: userEmail,
                villageId
            });
            if (onSuccess) onSuccess(`Sensor reading logged for ${activeRoom}.`);
            const qNotif = query(collection(db, "system_notifications"), where("villageId", "==", villageId), where("read", "==", false));
            const notifSnap = await getDocs(qNotif);
            notifSnap.forEach(async (d) => {
                const msg = d.data().message;
                if (msg && typeof msg === 'string' && msg.includes(activeRoom)) {
                    await updateDoc(doc(db, "system_notifications", d.id), { read: true });
                }
            });
        } catch (err) { console.error(err); if (onError) onError("Failed to save reading."); } finally { setIsSubmitting(false); }
    };

    const handleContinueMonitoring = async (docId: string, batchId: string) => {
        try {
            const farmingCol = villageId === VillageType.A ? 'dailyfarming_logA' : 'dailyfarming_logB';
            await updateDoc(doc(db, farmingCol, docId), {
                batchStatus: 'PENDING'
            });
            
            // Update local state immediately for UI response
            setActiveBatches(prev => prev.map(b => 
                b.id === docId ? { ...b, batchStatus: 'PENDING' } : b
            ));

            if (onSuccess) onSuccess(`Monitoring continued for Batch ${batchId}. Status updated to Pending.`);
        } catch (e) {
            console.error("Error continuing monitoring", e);
            if (onError) onError("Failed to update status.");
        }
    };

    const toggleEquipmentLocation = async (type: string, action: string) => {
        try {
            const resColName = villageId === VillageType.A ? 'resourcesA' : 'resourcesB';
            const q = query(collection(db, resColName), where("category", "==", "Equipment"));
            const snap = await getDocs(q);
            
            let targetDoc = snap.docs.find(d => d.data().name === type);
            
            if (targetDoc) {
                const data = targetDoc.data();
                let currentLocations = data.location ? data.location.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
                
                let actionTaken = "";
                if (currentLocations.includes(activeRoom)) {
                    currentLocations = currentLocations.filter((l: string) => l !== activeRoom);
                    actionTaken = "Deactivated";
                } else {
                    currentLocations.push(activeRoom);
                    actionTaken = "Activated";
                }
                
                const newLocationStr = currentLocations.join(', ');
                
                await updateDoc(doc(db, resColName, targetDoc.id), {
                    location: newLocationStr,
                    operationStatus: currentLocations.length > 0 ? 'Active' : 'Idle',
                    updatedAt: new Date().toISOString()
                });
                if (onSuccess) onSuccess(`${actionTaken} ${type} for ${activeRoom}.`);
            } else {
                if (onError) onError(`No ${type} found in Resources.`);
            }
        } catch (e) {
            console.error("Equipment toggle failed", e);
            if (onError) onError("Failed to update equipment status.");
        }
    };

    // Filter Logic
    const filteredRooms = useMemo(() => {
        if (selectedTypeFilter === 'All') return activeRooms;
        const allowedRooms = MUSHROOM_ROOM_MAPPING[selectedTypeFilter] || [];
        return activeRooms.filter(r => allowedRooms.includes(r));
    }, [activeRooms, selectedTypeFilter]);

    useEffect(() => {
        if (filteredRooms.length > 0 && !filteredRooms.includes(activeRoom)) {
            setActiveRoom(filteredRooms[0]);
        }
    }, [filteredRooms, activeRoom]);

    const batchesInRoom = activeBatches.filter(b => b.roomId === activeRoom);
    const roomLogs = logs.filter(l => l.roomId === activeRoom);
    
    // Logic: If NO active batches in the room, reset readings to 0
    const latest = (batchesInRoom.length > 0 && roomLogs[0])
        ? roomLogs[0]
        : { temperature: 0, humidity: 0, moisture: 0, roomId: activeRoom, timestamp: new Date().toISOString() };
        
    const previous = roomLogs[1] || { temperature: latest.temperature, humidity: latest.humidity, moisture: latest.moisture };
    
    let assignedStrain = batchesInRoom.length > 0 ? batchesInRoom[0].mushroomStrain || 'Oyster' : 'Oyster';
    
    if (batchesInRoom.length === 0) {
        for (const [strain, rooms] of Object.entries(MUSHROOM_ROOM_MAPPING)) {
            if (rooms.includes(activeRoom)) {
                assignedStrain = strain;
                break;
            }
        }
    }

    const rules = IDEAL_CONDITIONS[assignedStrain] || IDEAL_CONDITIONS['Oyster'];

    // Updated Effect: Set Defaults to Latest Log Conditions
    useEffect(() => {
        // 1. Set Manual Input Defaults
        if (roomLogs.length > 0) {
            const last = roomLogs[0];
            setInputTemp(last.temperature.toString());
            setInputHumid(last.humidity.toString());
            setInputMoist(last.moisture.toString());
            
            // 2. Set External Weather Simulation Defaults
            setOutsideTemp(last.temperature);
            setOutsideHumidity(last.humidity);
        } else if (rules) {
            // Fallback to Ideal Mid-points
            const targetTemp = (rules.minT + rules.maxT) / 2;
            const targetHumid = (rules.minH + rules.maxH) / 2;
            const targetMoist = (rules.minM + rules.maxM) / 2;
            setInputTemp(targetTemp.toFixed(1));
            setInputHumid(targetHumid.toFixed(1));
            setInputMoist(targetMoist.toFixed(1));
            
            // Fallback defaults for simulation
            setOutsideTemp(targetTemp);
            setOutsideHumidity(targetHumid);
        }
    }, [activeRoom, assignedStrain, logs.length]); // Updated dependency to logs.length to trigger when data loads

    // Notification Logic (Alerts Only, No Automated Suggestion Buttons)
    useEffect(() => {
        if (batchesInRoom.length === 0) {
            setNotifications([]);
            return;
        }

        const newNotifs: typeof notifications = [];
        const buffer = 2; // Temp buffer
        const humidBuffer = 5; // Humidity buffer

        // Rule 1: Outside Temp TOO HIGH -> Air Cooler
        if (outsideTemp > (rules.maxT + buffer)) {
            if (!equipmentState['Air Cooler']) {
                newNotifs.push({ 
                    type: 'WEATHER', 
                    msg: `High Outside Temp (${outsideTemp}°C). Open Air Cooler?`, 
                    action: "Use Air Cooler",
                    urgency: 'High'
                });
            }
        } 
        
        // Rule 2: Outside Temp TOO LOW -> Heater
        if (outsideTemp < (rules.minT - buffer)) {
            if (!equipmentState['Heater']) {
                newNotifs.push({ 
                    type: 'WEATHER', 
                    msg: `Low Outside Temp (${outsideTemp}°C). Open Heater?`, 
                    action: "Use Heater",
                    urgency: 'High'
                });
            }
        }

        // Rule 3: Outside Humidity TOO HIGH -> Exhaust Fan
        if (outsideHumidity > (rules.maxH + humidBuffer)) {
             if (!equipmentState['Exhaust Fan']) {
                 newNotifs.push({
                     type: 'WEATHER',
                     msg: `High Humidity (${outsideHumidity}%). Open Fan?`,
                     action: "Use Exhaust Fan",
                     urgency: 'Normal'
                 });
             }
        }

        // Rule 4: Outside Humidity TOO LOW -> Humidifier
        if (outsideHumidity < (rules.minH - humidBuffer)) {
             if (!equipmentState['Humidifier']) {
                 newNotifs.push({
                     type: 'WEATHER',
                     msg: `Low Humidity (${outsideHumidity}%). Open Humidifier?`,
                     action: "Use Humidifier",
                     urgency: 'High'
                 });
             }
        }

        // Harvest Notification Logic
        batchesInRoom.forEach(batch => {
            const cycleDays = SPECIES_CYCLES[batch.mushroomStrain || 'Oyster'] || 30;
            const daysElapsed = (new Date().getTime() - new Date(batch.timestamp).getTime()) / (1000 * 60 * 60 * 24);
            const progress = daysElapsed / cycleDays; 
            
            if (progress >= 0.9) {
                const daysRemaining = Math.max(0, Math.ceil(cycleDays - daysElapsed));
                if (daysRemaining <= 3) {
                    let urgency: 'Normal' | 'High' | 'Critical' = 'Normal';
                    let msg = `Batch ${batch.batchId} (${batch.mushroomStrain}) ready in ${daysRemaining} days.`;
                    
                    if (daysRemaining === 1) {
                        urgency = 'High';
                        msg = `URGENT: Batch ${batch.batchId} harvest due TOMORROW.`;
                    } else if (daysRemaining <= 0) {
                        urgency = 'Critical';
                        msg = `CRITICAL: HARVEST TODAY - Batch ${batch.batchId}.`;
                    }

                    newNotifs.push({
                        type: 'HARVEST',
                        msg,
                        action: "Prepare Labor & Baskets",
                        urgency
                    });
                }
            }
        });

        setNotifications(newNotifs);
    }, [outsideTemp, outsideHumidity, activeRoom, batchesInRoom, rules, equipmentState]);

    const aiAnalysis = useMemo(() => {
        let riskScore = 0;
        
        // If room is inactive (no batches), return safe values
        if (batchesInRoom.length === 0) {
            return {
                tempTrend: 'Inactive',
                humidTrend: 'Inactive',
                moistTrend: 'Inactive',
                harvestDays: 0,
                confidence: 100,
                risk: 'None'
            };
        }

        if (latest.temperature > rules.maxT || latest.temperature < rules.minT) riskScore += 20;
        if (latest.humidity < rules.minH) riskScore += 15;
        if (outsideTemp > 35) riskScore += 10;
        if (outsideHumidity > 90) riskScore += 5;
        
        const confidence = Math.max(50, 98 - riskScore);
        const cycle = SPECIES_CYCLES[assignedStrain] || 30;
        const oldestBatch = batchesInRoom[batchesInRoom.length - 1]; 
        let daysToHarvest = cycle;
        
        if (oldestBatch) {
             const elapsed = (new Date().getTime() - new Date(oldestBatch.timestamp).getTime()) / (1000 * 60 * 60 * 24);
             daysToHarvest = Math.max(0, Math.ceil(cycle - elapsed));
        }
        
        const adjustedDays = riskScore > 20 ? daysToHarvest + 2 : daysToHarvest;

        return {
            tempTrend: Math.abs(latest.temperature - previous.temperature) < 0.5 ? 'Stable ↔' : latest.temperature > previous.temperature ? 'Increasing ↑' : 'Decreasing ↓',
            humidTrend: Math.abs(latest.humidity - previous.humidity) < 0.5 ? 'Stable ↔' : latest.humidity > previous.humidity ? 'Increasing ↑' : 'Decreasing ↓',
            moistTrend: Math.abs(latest.moisture - previous.moisture) < 0.5 ? 'Stable ↔' : latest.moisture > previous.moisture ? 'Increasing ↑' : 'Decreasing ↓',
            harvestDays: adjustedDays,
            confidence,
            risk: riskScore > 30 ? 'High' : riskScore > 10 ? 'Medium' : 'Low'
        };
    }, [latest, previous, rules, assignedStrain, batchesInRoom, outsideTemp, outsideHumidity]);

    const getStatus = (val: number, min: number, max: number) => {
        if (batchesInRoom.length === 0) return 'green'; // Idle state is safe
        if (val >= min && val <= max) return 'green';
        if (val < min * 0.9 || val > max * 1.1) return 'red';
        return 'yellow';
    };

    const metrics = [
        { label: 'Temperature', unit: '°C', val: latest.temperature, min: rules.minT, max: rules.maxT, status: getStatus(latest.temperature, rules.minT, rules.maxT) },
        { label: 'Humidity', unit: '%', val: latest.humidity, min: rules.minH, max: rules.maxH, status: getStatus(latest.humidity, rules.minH, rules.maxH) },
        { label: 'Substrate Moisture', unit: '%', val: latest.moisture, min: rules.minM, max: rules.maxM, status: getStatus(latest.moisture, rules.minM, rules.maxM) },
    ];

    const harvestNotifications = notifications.filter(n => n.type === 'HARVEST');
    const urgentWeatherNotifications = notifications.filter(n => n.type === 'WEATHER' && n.urgency === 'High');

    // Missing Logs Check
    const showMissingLogsBanner = batchesInRoom.length > 0 && (roomLogs.length === 0 || (new Date().getTime() - new Date(latest.timestamp).getTime()) > 24 * 60 * 60 * 1000);

    if (loading) return <div className="p-10 text-center animate-pulse">Loading environmental data...</div>;

    return (
        <div className="space-y-8 animate-fade-in-up">
            
            {/* Missing Data Reminder Banner */}
            {showMissingLogsBanner && (
                <div className="bg-yellow-50 border-l-8 border-yellow-400 p-4 rounded-r-xl shadow-md animate-fade-in-down mb-2">
                    <div className="flex items-center gap-3">
                        <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        <div>
                            <h3 className="font-bold text-yellow-800 uppercase text-sm tracking-widest">Environment Check Pending</h3>
                            <p className="text-xs text-yellow-700 font-medium">Room {activeRoom} has active batches but no recent sensor data. Please log readings below.</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Urgent Weather Action Banner */}
            {urgentWeatherNotifications.length > 0 && (
                <div className="bg-red-500 border-l-8 border-red-800 text-white p-4 rounded-r-xl shadow-lg animate-pulse mb-2">
                    <div className="flex items-center gap-3">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        <div>
                            <h3 className="font-bold uppercase text-sm tracking-widest">Environmental Risk Detected</h3>
                            {urgentWeatherNotifications.map((n, i) => (
                                <p key={i} className="text-xs font-medium">{n.msg}</p>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Harvest Alert Banner */}
            {harvestNotifications.length > 0 && (
                <div className="bg-gradient-to-r from-orange-50 to-orange-100 border-l-4 border-orange-500 p-4 rounded-r-xl shadow-sm animate-fade-in-down">
                    <div className="flex items-start">
                        <div className="flex-shrink-0">
                            <svg className="h-5 w-5 text-orange-600 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <div className="ml-3 w-full">
                            <h3 className="text-sm font-bold text-orange-800 uppercase tracking-wide">Harvest Action Required</h3>
                            <div className="mt-2 space-y-2">
                                {harvestNotifications.map((alert, i) => (
                                    <div key={i} className="flex justify-between items-center bg-white/60 p-2 rounded-lg border border-orange-200">
                                        <span className="text-xs text-orange-900 font-medium">
                                            {alert.msg}
                                        </span>
                                        {setActiveTab && (
                                            <button onClick={() => setActiveTab('farming')} className="text-[10px] bg-orange-600 text-white px-2 py-1 rounded hover:bg-orange-700 transition-colors uppercase font-bold shadow-sm">
                                                Log Harvest
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Room Selector Header */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="bg-indigo-100 p-2 rounded-lg">
                        <svg className="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Room Monitor</h2>
                        <div className="flex items-center gap-2">
                            {batchesInRoom.length > 0 ? (
                                <>
                                    <span className="text-xs text-gray-500">Active Crop:</span>
                                    <span className="text-xs font-black bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100 uppercase">{assignedStrain}</span>
                                </>
                            ) : (
                                <span className="text-xs font-black bg-gray-100 text-gray-500 px-2 py-0.5 rounded border border-gray-200 uppercase">Idle / No Batch</span>
                            )}
                        </div>
                    </div>
                </div>
                
                <div className="flex flex-col sm:flex-row items-center gap-3">
                    <select 
                        value={selectedTypeFilter} 
                        onChange={(e) => setSelectedTypeFilter(e.target.value)}
                        className="text-xs font-bold border border-gray-300 rounded-md py-1.5 pl-2 pr-8 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-700 h-9"
                    >
                        <option value="All">All Crops</option>
                        {Object.keys(MUSHROOM_ROOM_MAPPING).map(type => (
                            <option key={type} value={type}>{type}</option>
                        ))}
                    </select>

                    <div className="flex gap-2 bg-gray-100 p-1 rounded-lg overflow-x-auto max-w-xs sm:max-w-md">
                        {filteredRooms.length > 0 ? filteredRooms.map(room => (
                            <button 
                                key={room} 
                                onClick={() => setActiveRoom(room)}
                                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all whitespace-nowrap ${activeRoom === room ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                {room}
                            </button>
                        )) : <span className="text-xs text-gray-400 px-4 py-2">No rooms found</span>}
                    </div>
                </div>
            </div>

            {/* 1️⃣ Overview Panel */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <div><h2 className="text-sm font-black text-gray-500 uppercase tracking-widest">Real-time Conditions</h2></div>
                    <div className="text-right"><div className="text-[10px] font-bold text-gray-400 uppercase">Last Updated</div><div className="text-xs font-mono text-gray-800">{new Date(latest.timestamp).toLocaleTimeString()}</div></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100">
                    {metrics.map((m) => (
                        <div key={m.label} className="p-6 text-center group hover:bg-gray-50 transition-colors">
                            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">{m.label}</div>
                            <div className="text-3xl font-black text-gray-800 mb-1">{m.val} <span className="text-sm text-gray-400 font-medium">{m.unit}</span></div>
                            <div className="flex justify-center items-center gap-2 mb-2">
                                <div className={`h-2 w-2 rounded-full ${m.status === 'green' ? 'bg-green-500' : m.status === 'yellow' ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
                                <span className={`text-[10px] font-bold uppercase ${m.status === 'green' ? 'text-green-600' : m.status === 'yellow' ? 'text-yellow-600' : 'text-red-600'}`}>{m.status === 'green' ? 'Normal' : m.status === 'yellow' ? 'Warning' : 'Action Req'}</span>
                            </div>
                            <div className="text-[10px] text-gray-400 bg-gray-100 rounded px-2 py-1 inline-block">Ideal: {m.min} - {m.max}</div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Left Column: Alerts & AI */}
                <div className="space-y-8">
                    
                    {/* C. External Weather (Linked + Sim) */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                        <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                            <span className="text-xl">🌦️</span> External Weather
                        </h3>
                        
                        {/* Simulation Controls for Logic Testing */}
                        <div className="bg-gray-50 p-3 rounded-lg mb-3 border border-gray-100">
                            <div className="text-[9px] font-bold text-gray-400 uppercase mb-2">Simulation Controls (For Alert Testing)</div>
                            <div className="grid grid-cols-2 gap-2 mb-2">
                                <div className="flex items-center gap-2">
                                    <label className="text-[10px] text-gray-500 font-bold">Temp:</label>
                                    <input type="number" value={outsideTemp} onChange={e=>setOutsideTemp(parseFloat(e.target.value))} className="w-full p-1 text-sm border rounded text-center font-bold" />
                                    <span className="text-xs font-bold text-gray-400">°C</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <label className="text-[10px] text-gray-500 font-bold">Humid:</label>
                                    <input type="number" value={outsideHumidity} onChange={e=>setOutsideHumidity(parseFloat(e.target.value))} className="w-full p-1 text-sm border rounded text-center font-bold" />
                                    <span className="text-xs font-bold text-gray-400">%</span>
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex flex-col items-center justify-center py-2 space-y-3">
                            <a 
                                href="https://www.accuweather.com/en/my/malaysia-weather" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold py-2 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors text-xs uppercase tracking-wide"
                            >
                                <span>Check Real Weather</span>
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                            </a>
                        </div>
                    </div>

                    {/* A, B, C: Integrated Notifications */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden h-fit">
                        <div className="px-6 py-4 border-b border-gray-100 bg-red-50 flex justify-between items-center">
                            <h3 className="font-bold text-red-800 flex items-center gap-2 text-sm uppercase tracking-wide">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                                Live Notifications
                            </h3>
                            <span className="bg-red-200 text-red-800 text-[10px] font-black px-2 py-0.5 rounded-full">{notifications.length}</span>
                        </div>
                        <div className="p-0">
                            {notifications.length === 0 ? (
                                <div className="p-8 text-center text-green-600 font-medium text-xs flex flex-col items-center">
                                    <svg className="w-8 h-8 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    System Nominal.
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-100">
                                    {notifications.map((note, idx) => (
                                        <div key={idx} className={`p-4 ${note.urgency === 'Critical' ? 'bg-red-100' : note.type === 'HARVEST' ? 'bg-green-50' : note.type === 'WEATHER' ? 'bg-blue-50' : note.type === 'SYSTEM' ? 'bg-purple-50' : 'bg-orange-50'}`}>
                                            <div className="flex justify-between items-start mb-1">
                                                <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${
                                                    note.urgency === 'Critical' ? 'bg-red-600 text-white' : 
                                                    note.urgency === 'High' ? 'bg-orange-500 text-white' : 
                                                    'bg-gray-200 text-gray-700'
                                                }`}>
                                                    {note.urgency || 'Normal'}
                                                </span>
                                                <span className="text-[9px] font-bold text-gray-400">{note.type}</span>
                                            </div>
                                            <p className={`text-xs font-bold mb-1 ${note.urgency === 'Critical' ? 'text-red-900' : 'text-gray-800'}`}>{note.msg}</p>
                                            {note.action && (
                                                <div className="text-[10px] bg-white border border-gray-200 px-2 py-1 rounded inline-block text-gray-600 font-medium shadow-sm">
                                                    Action: {note.action}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Automation Panel - Modified to be Manual Controls */}
                    <div className="bg-slate-800 rounded-xl shadow-lg p-5 text-white">
                        <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-widest flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                            Facility Controls
                        </h3>
                        
                        <div className="space-y-4">
                            {/* Manual Controls for ALL Equipment */}
                            <div>
                                <p className="text-[10px] text-slate-500 mb-2 font-bold uppercase">Equipment Control Panel</p>
                                <ul className="space-y-2">
                                    {EQUIPMENT_TYPES.map(name => {
                                        const isActive = equipmentState[name];
                                        return (
                                            <li key={name} className={`flex items-center justify-between p-2 rounded border ${isActive ? 'bg-green-900/30 border-green-700/50' : 'bg-slate-700/30 border-slate-600/50'}`}>
                                                <span className={`text-[10px] font-mono flex items-center gap-2 ${isActive ? 'text-green-100' : 'text-slate-400'}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-slate-500'}`}></span>
                                                    {name}
                                                </span>
                                                <button 
                                                    onClick={() => toggleEquipmentLocation(name, isActive ? `Turn Off ${name}` : `Turn On ${name}`)} 
                                                    className={`text-white text-[9px] font-bold px-3 py-1 rounded uppercase transition-colors ${isActive ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
                                                >
                                                    {isActive ? 'Turn Off' : 'Turn On'}
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* 6️⃣ AI Prediction Panel */}
                    <div className="bg-indigo-900 rounded-xl shadow-xl overflow-hidden text-white relative">
                        <div className="absolute top-0 right-0 p-3 opacity-10">
                            <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                        </div>
                        <div className="p-6 relative z-10">
                            <h3 className="text-sm font-bold text-indigo-300 uppercase tracking-widest mb-4">AI Growth Forecast</h3>
                            <div className="grid grid-cols-3 gap-2 mb-6 text-center">
                                <div className="bg-indigo-800/50 rounded-lg p-2"><div className="text-[9px] uppercase text-indigo-300">Temp Trend</div><div className="font-bold text-xs">{aiAnalysis.tempTrend}</div></div>
                                <div className="bg-indigo-800/50 rounded-lg p-2"><div className="text-[9px] uppercase text-indigo-300">Humidity</div><div className="font-bold text-xs">{aiAnalysis.humidTrend}</div></div>
                                <div className="bg-indigo-800/50 rounded-lg p-2"><div className="text-[9px] uppercase text-indigo-300">Moisture</div><div className="font-bold text-xs">{aiAnalysis.moistTrend}</div></div>
                            </div>
                            <div className="flex justify-between items-end border-t border-indigo-700 pt-4">
                                <div><div className="text-xs text-indigo-300">Predicted Harvest</div><div className="text-2xl font-black text-white">{aiAnalysis.harvestDays} Days</div></div>
                                <div className="text-right"><div className="text-xs text-indigo-300">Confidence</div><div className="text-xl font-bold text-green-400">{aiAnalysis.confidence}%</div></div>
                            </div>
                            <div className="mt-2 text-[10px] bg-indigo-950/50 py-1 px-2 rounded inline-block text-indigo-200">Risk Level: <span className={aiAnalysis.risk === 'Low' ? 'text-green-400' : 'text-orange-400'}>{aiAnalysis.risk}</span></div>
                        </div>
                    </div>

                </div>

                {/* Right Column: Data Tables & Entry */}
                <div className="lg:col-span-2 space-y-8">
                    
                    {/* Active Batches for this Room */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="bg-gray-50 px-6 py-3 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="text-xs font-bold text-gray-500 uppercase">Active Batches in {activeRoom}</h3>
                            <span className="text-[10px] text-gray-400 font-bold uppercase">{batchesInRoom.length} Batch(es)</span>
                        </div>
                        {batchesInRoom.length === 0 ? (
                            <div className="p-6 text-center text-sm text-gray-400 italic">No active batches for {assignedStrain} found in this room.</div>
                        ) : (
                            <table className="w-full text-xs text-left">
                                <thead className="text-gray-400 font-bold uppercase bg-white border-b">
                                    <tr>
                                        <th className="px-6 py-3">Batch ID</th>
                                        <th className="px-6 py-3">Plant Date</th>
                                        <th className="px-6 py-3">Strain</th>
                                        <th className="px-6 py-3">Est. Harvest Date</th>
                                        <th className="px-6 py-3 text-center">Status</th>
                                        <th className="px-6 py-3 text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {batchesInRoom.map(batch => {
                                        const cycleDays = SPECIES_CYCLES[batch.mushroomStrain || 'Oyster'] || 30;
                                        const startDate = new Date(batch.timestamp);
                                        const harvestDate = new Date(startDate.getTime() + cycleDays * 24 * 60 * 60 * 1000);
                                        const today = new Date();
                                        const diffTime = harvestDate.getTime() - today.getTime();
                                        const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                        
                                        const predicted = batch.predictedYield || 0;
                                        const actual = batch.totalYield || 0;
                                        const wastage = batch.totalWastage || 0;
                                        const totalOutput = actual + wastage;
                                        
                                        const isPending = batch.batchStatus === 'PENDING';

                                        // "Continue Monitoring" condition:
                                        // 1. Time is ripe (daysRemaining <= 0)
                                        // 2. Output is LESS than predicted (meaning not finished yet)
                                        const showContinueMonitoring = daysRemaining <= 0 && totalOutput < predicted;

                                        let statusColor = "bg-green-100 text-green-700";
                                        let statusText = `${daysRemaining} Days Left`;
                                        
                                        if (isPending) {
                                            statusColor = "bg-yellow-100 text-yellow-800 border border-yellow-200";
                                            statusText = "PENDING";
                                        } else if (daysRemaining <= 0) {
                                            statusColor = "bg-red-100 text-red-700 animate-pulse border border-red-200";
                                            statusText = "HARVEST NOW";
                                        } else if (daysRemaining <= 3) {
                                            statusColor = "bg-orange-100 text-orange-700 border border-orange-200";
                                            statusText = "Prepare (Soon)";
                                        }

                                        return (
                                            <tr key={batch.id} className="hover:bg-gray-50 text-gray-700">
                                                <td className="px-6 py-3 font-bold">{batch.batchId}</td>
                                                <td className="px-6 py-3">{startDate.toLocaleDateString()}</td>
                                                <td className="px-6 py-3">{batch.mushroomStrain}</td>
                                                <td className="px-6 py-3 font-mono font-medium">
                                                    {harvestDate.toLocaleDateString()}
                                                </td>
                                                <td className="px-6 py-3 text-center">
                                                    <span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${statusColor}`}>
                                                        {statusText}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-3 text-center">
                                                    {showContinueMonitoring && !isPending && (
                                                        <button 
                                                            onClick={() => batch.id && handleContinueMonitoring(batch.id, batch.batchId || '')}
                                                            className="text-[9px] bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 border border-blue-200 font-bold uppercase whitespace-nowrap"
                                                            title={`Yield deficit: ${(predicted - totalOutput).toFixed(1)}kg`}
                                                        >
                                                            Continue Monitoring
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* 7️⃣ Manual Entry Form */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                        <h3 className="text-sm font-bold text-gray-900 uppercase mb-4">Log Sensor Reading for {activeRoom}</h3>
                        <form onSubmit={handleAddReading} className="grid grid-cols-3 md:grid-cols-4 gap-4 items-end">
                            <div><label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Temp (°C)</label><input type="number" step="0.1" value={inputTemp} onChange={e=>setInputTemp(e.target.value)} className="w-full p-2 border rounded text-sm" placeholder="24.0" /></div>
                            <div><label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Humid (%)</label><input type="number" step="0.1" value={inputHumid} onChange={e=>setInputHumid(e.target.value)} className="w-full p-2 border rounded text-sm" placeholder="85.0" /></div>
                            <div><label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Moist (%)</label><input type="number" step="0.1" value={inputMoist} onChange={e=>setInputMoist(e.target.value)} className="w-full p-2 border rounded text-sm" placeholder="65.0" /></div>
                            <div className="md:col-span-1 col-span-3"><button disabled={isSubmitting} className="w-full bg-slate-900 text-white font-bold py-2 rounded uppercase text-xs hover:bg-black transition-colors">{isSubmitting ? '...' : 'Save'}</button></div>
                        </form>
                    </div>

                    {/* 3️⃣ Ideal Conditions Reference (Read-only context) */}
                    <div className="bg-indigo-50/50 rounded-xl border border-indigo-100 p-4 flex justify-between items-center text-xs">
                        <span className="font-bold text-indigo-900 uppercase">Target Conditions ({assignedStrain})</span>
                        <div className="flex gap-4 text-indigo-700">
                            <span>Temp: <b>{rules.minT}-{rules.maxT}°C</b></span>
                            <span>Humidity: <b>{rules.minH}-{rules.maxH}%</b></span>
                            <span>Moisture: <b>{rules.minM}-{rules.maxM}%</b></span>
                        </div>
                    </div>

                    {/* 2️⃣ Sensor Data Table */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                            <h3 className="text-sm font-bold text-gray-900 uppercase">Room {activeRoom} Data Log</h3>
                        </div>
                        <div className="overflow-x-auto max-h-[300px]">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0">
                                    <tr>
                                        <th className="px-6 py-3">Timestamp</th>
                                        <th className="px-6 py-3">Temp</th>
                                        <th className="px-6 py-3">Humid</th>
                                        <th className="px-6 py-3">Moist</th>
                                        <th className="px-6 py-3">Recorded By</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {roomLogs.length === 0 ? (
                                        <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400 italic">No sensor data logged for this room yet.</td></tr>
                                    ) : (
                                        roomLogs.map((log) => (
                                            <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-3 font-mono text-xs text-gray-500">{new Date(log.timestamp).toLocaleString()}</td>
                                                <td className="px-6 py-3 font-bold">{log.temperature}°C</td>
                                                <td className="px-6 py-3">{log.humidity}%</td>
                                                <td className="px-6 py-3">{log.moisture}%</td>
                                                <td className="px-6 py-3 text-xs text-gray-400 truncate max-w-[100px]">{log.recordedBy.split('@')[0]}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};
