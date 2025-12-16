import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, doc, updateDoc, setDoc, addDoc, query, orderBy, limit, where } from 'firebase/firestore';
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { VillageType, UserProfile, VillageRole, UserRole, FinancialRecord } from '../types';
import { VILLAGES } from '../constants';
import { auth, db, firebaseConfig } from '../services/firebase';

interface DashboardProps {
  villageId: VillageType;
  userEmail: string;
  userName?: string;
  userRole: UserRole;
  isAdmin: boolean;
}

interface ActivityLog {
  id?: string;
  type: 'BED_PREP' | 'WATERING' | 'INSPECTION' | 'HARVEST' | 'OTHER';
  details: string;
  userEmail: string;
  timestamp: string;
  villageId: VillageType;
}

interface HarvestLog {
  id?: string;
  batchId: string;
  weightKg: number;
  strain: string;
  recordedBy: string;
  timestamp: string;
  villageId: VillageType;
}

interface ResourceItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  status: 'OK' | 'LOW' | 'CRITICAL';
}

interface SystemLog {
  id: string;
  action?: string;
  details?: string;
  userEmail?: string;
  timestamp?: string;
  [key: string]: any;
}

const JOB_ROLES = [
  "Farmer",
  "Farm Manager",
  "Processing Staff",
  "Warehouse Coordinator",
  "Financial Clerk",
  "Packaging Worker",
  "Sales Coordinator"
];

const USER_ROLES: UserRole[] = ['admin', 'user', 'finance'];

const COLOR_THEMES = {
    green: {
        bgLight: "bg-green-200",
        textMain: "text-green-800",
        bgSoft: "bg-green-100",
        textIcon: "text-green-700",
        borderSoft: "border-green-200",
        badgeBg: "bg-green-200",
        badgeText: "text-green-900",
        button: "bg-green-600 hover:bg-green-700 text-white",
        ring: "focus:ring-green-500",
        progress: "bg-green-500"
    },
    blue: {
        bgLight: "bg-blue-200",
        textMain: "text-blue-800",
        bgSoft: "bg-blue-100",
        textIcon: "text-blue-700",
        borderSoft: "border-blue-200",
        badgeBg: "bg-blue-200",
        badgeText: "text-blue-900",
        button: "bg-blue-600 hover:bg-blue-700 text-white",
        ring: "focus:ring-blue-500",
        progress: "bg-blue-500"
    },
    slate: {
        bgLight: "bg-slate-200",
        textMain: "text-slate-800",
        bgSoft: "bg-slate-100",
        textIcon: "text-slate-700",
        borderSoft: "border-slate-200",
        badgeBg: "bg-slate-200",
        badgeText: "text-slate-900",
        button: "bg-slate-700 hover:bg-slate-800 text-white",
        ring: "focus:ring-slate-500",
        progress: "bg-slate-500"
    }
};

export const Dashboard: React.FC<DashboardProps> = ({ villageId, userEmail, userName, userRole, isAdmin }) => {
  const village = VILLAGES[villageId];
  const theme = COLOR_THEMES[village.color as keyof typeof COLOR_THEMES] || COLOR_THEMES.slate;

  // View State
  const [activeTab, setActiveTab] = useState<'overview' | 'farming' | 'environment' | 'resources' | 'financial' | 'processing' | 'registry'>('overview');

  // User Management State
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Admin Add User State
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('user');
  const [newUserVillage, setNewUserVillage] = useState<VillageType>(VillageType.A);
  const [newUserJobTitle, setNewUserJobTitle] = useState<string>(JOB_ROLES[0]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isAddingUser, setIsAddingUser] = useState(false);

  // Admin Edit User State
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('user');
  const [editVillage, setEditVillage] = useState<VillageType>(VillageType.A);
  const [editJobTitle, setEditJobTitle] = useState<string>(JOB_ROLES[0]);
  const [editPassword, setEditPassword] = useState('');
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);

  // Registry Logs State
  const [registryLogs, setRegistryLogs] = useState<SystemLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Production Management State
  const [farmingLogs, setFarmingLogs] = useState<ActivityLog[]>([]);
  const [harvestLogs, setHarvestLogs] = useState<HarvestLog[]>([]);
  
  // Financial Management State
  const [financialRecords, setFinancialRecords] = useState<FinancialRecord[]>([]);
  const [financialError, setFinancialError] = useState<string | null>(null);
  const [showTransModal, setShowTransModal] = useState(false);
  const [isSubmittingTrans, setIsSubmittingTrans] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<FinancialRecord | null>(null);
  
  // Financial Form
  const [transType, setTransType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [transAmount, setTransAmount] = useState('');
  const [transCategory, setTransCategory] = useState('Supplies');
  const [transDate, setTransDate] = useState(new Date().toISOString().split('T')[0]);
  const [transBatchId, setTransBatchId] = useState('');
  const [transOrderNumber, setTransOrderNumber] = useState('');
  const [transDesc, setTransDesc] = useState('');
  const [transPaymentMethod, setTransPaymentMethod] = useState('Cash');
  const [transIsPending, setTransIsPending] = useState(false);

  // Financial Filter
  const [financialPeriod, setFinancialPeriod] = useState<'ALL' | 'MONTH' | 'TODAY'>('MONTH');
  const [filterBatch, setFilterBatch] = useState('');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'COMPLETED' | 'PENDING'>('ALL');
  
  // Cash Flow Chart Filter
  const [chartFilter, setChartFilter] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'>('MONTHLY');

  // Feature States (Mock Data)
  const [resources, setResources] = useState<ResourceItem[]>([
      { id: '1', name: 'Mushroom Spawn', quantity: 120, unit: 'kg', status: 'OK' },
      { id: '2', name: 'Straw Substrate', quantity: 45, unit: 'bales', status: 'LOW' },
      { id: '3', name: 'Organic Fertilizer', quantity: 200, unit: 'L', status: 'OK' },
      { id: '4', name: 'Harvested Mushrooms', quantity: 350, unit: 'kg', status: 'OK' },
  ]);
  
  const [envData] = useState({ temp: 24.5, humidity: 88, moisture: 62 });

  // New Activity Form State
  const [activityType, setActivityType] = useState<string>('BED_PREP');
  const [activityNotes, setActivityNotes] = useState('');
  const [isSubmittingActivity, setIsSubmittingActivity] = useState(false);

  // New Harvest Form State
  const [harvestBatch, setHarvestBatch] = useState('');
  const [harvestWeight, setHarvestWeight] = useState('');
  const [harvestStrain, setHarvestStrain] = useState('Oyster');
  const [isSubmittingHarvest, setIsSubmittingHarvest] = useState(false);

  const isFinance = userRole === 'finance';
  const isUser = userRole === 'user';
  // Admin already passed as prop, but let's ensure consistency
  // isAdmin is true if userRole is admin.

  useEffect(() => {
    // 1. Fetch Users (Admin Only)
    if (isAdmin) {
      fetchUsers();
    }
    // 2. Fetch Logs (If related tab is active)
    if (['farming', 'overview', 'processing'].includes(activeTab)) {
        fetchProductionData();
    }
    // 3. Fetch Registry Logs
    if (activeTab === 'registry' && isAdmin) {
        fetchRegistryLogs();
    }
    // 4. Financial Fetch (Load if financial tab OR if user is finance on overview)
    if (activeTab === 'financial' || (activeTab === 'overview' && isFinance)) {
        fetchFinancialRecords();
    }
  }, [isAdmin, activeTab, villageId, isFinance]);

  // Derived Financial Data for General Dashboard
  const filteredFinancials = useMemo(() => {
      return financialRecords.filter(rec => {
          // Batch Filter
          if (filterBatch && !rec.batchId?.toLowerCase().includes(filterBatch.toLowerCase())) {
              return false;
          }
          
          // Category Filter
          if (filterCategory !== 'ALL' && rec.category !== filterCategory) {
              return false;
          }

          // Status Filter
          if (filterStatus !== 'ALL') {
              const recordStatus = rec.status || 'COMPLETED';
              if (filterStatus !== recordStatus) return false;
          }
          
          // Date Filter
          const recDate = new Date(rec.date);
          const now = new Date();
          
          if (financialPeriod === 'TODAY') {
              return recDate.toISOString().split('T')[0] === now.toISOString().split('T')[0];
          }
          if (financialPeriod === 'MONTH') {
              return recDate.getMonth() === now.getMonth() && recDate.getFullYear() === now.getFullYear();
          }
          return true; // ALL
      });
  }, [financialRecords, filterBatch, filterCategory, financialPeriod, filterStatus]);

  const financialSummary = useMemo(() => {
      const income = filteredFinancials
        .filter(r => r.type === 'INCOME')
        .reduce((sum, r) => sum + r.amount, 0);
      const expense = filteredFinancials
        .filter(r => r.type === 'EXPENSE')
        .reduce((sum, r) => sum + r.amount, 0);
      return {
          income,
          expense,
          profit: income - expense
      };
  }, [filteredFinancials]);

  // Derived Financial Data for Finance Overview
  const financeOverviewData = useMemo(() => {
      if (!isFinance) return null;

      const completed = financialRecords.filter(r => r.status === 'COMPLETED' || !r.status);
      const pending = financialRecords.filter(r => r.status === 'PENDING');

      // Cash Flow (Actual - All Time for cards)
      const totalRevenue = completed.filter(r => r.type === 'INCOME').reduce((acc, c) => acc + c.amount, 0);
      const totalExpenses = completed.filter(r => r.type === 'EXPENSE').reduce((acc, c) => acc + c.amount, 0);
      const netCashFlow = totalRevenue - totalExpenses;

      // Outstanding
      const receivables = pending.filter(r => r.type === 'INCOME');
      const payables = pending.filter(r => r.type === 'EXPENSE');

      const totalReceivables = receivables.reduce((acc, c) => acc + c.amount, 0);
      const totalPayables = payables.reduce((acc, c) => acc + c.amount, 0);

      // --- Chart Data Logic ---
      let chartLabels: { key: string, label: string, start?: Date, end?: Date }[] = [];
      const today = new Date();

      if (chartFilter === 'DAILY') {
          // Last 7 days
          for (let i=6; i>=0; i--) {
              const d = new Date(today);
              d.setDate(today.getDate() - i);
              const key = d.toISOString().split('T')[0];
              chartLabels.push({ key, label: d.toLocaleDateString('default', {weekday: 'short'}) });
          }
      } else if (chartFilter === 'WEEKLY') {
          // Last 4 weeks
          const startOfWeek = new Date(today);
          startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday
          for (let i=3; i>=0; i--) {
              const s = new Date(startOfWeek);
              s.setDate(s.getDate() - (i * 7));
              const e = new Date(s);
              e.setDate(e.getDate() + 6);
              const key = `W${i}`;
              chartLabels.push({ key, label: `${s.getDate()}/${s.getMonth()+1}`, start: s, end: e });
          }
      } else if (chartFilter === 'MONTHLY') {
          // Last 6 months
          for(let i=5; i>=0; i--) {
              const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
              const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
              chartLabels.push({ key, label: d.toLocaleString('default', { month: 'short' }) });
          }
      } else if (chartFilter === 'YEARLY') {
          // Last 3 years
          const currentYear = today.getFullYear();
          for(let i=2; i>=0; i--) {
              const y = currentYear - i;
              chartLabels.push({ key: y.toString(), label: y.toString() });
          }
      }

      const chartData = chartLabels.map(m => {
          let monthRecs: FinancialRecord[] = [];
          
          if (chartFilter === 'DAILY') {
              monthRecs = completed.filter(r => r.date === m.key);
          } else if (chartFilter === 'WEEKLY') {
              monthRecs = completed.filter(r => {
                  const rd = new Date(r.date);
                  return m.start && m.end && rd >= m.start && rd <= m.end;
              });
          } else if (chartFilter === 'MONTHLY') {
              monthRecs = completed.filter(r => r.date.startsWith(m.key));
          } else if (chartFilter === 'YEARLY') {
              monthRecs = completed.filter(r => r.date.startsWith(m.key));
          }

          const income = monthRecs.filter(r => r.type === 'INCOME').reduce((sum, r) => sum + r.amount, 0);
          const expense = monthRecs.filter(r => r.type === 'EXPENSE').reduce((sum, r) => sum + r.amount, 0);
          return {
              label: m.label,
              income,
              expense
          };
      });

      // Max value for chart scaling
      const maxChartValue = Math.max(
          ...chartData.map(d => Math.max(d.income, d.expense)),
          100
      );

      return { 
          totalRevenue, 
          totalExpenses, 
          netCashFlow, 
          totalReceivables, 
          totalPayables, 
          receivables, 
          payables, 
          chartData,
          maxChartValue
      };
  }, [financialRecords, isFinance, chartFilter]);

  const handleTransTypeChange = (newType: 'INCOME' | 'EXPENSE') => {
      setTransType(newType);
      // Reset category to default valid option for the new type
      if (newType === 'INCOME') {
          setTransCategory('Sales');
      } else {
          setTransCategory('Supplies');
      }
  };

  const handleSaveTransaction = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSubmittingTrans(true);
      
      const isSales = transCategory.toLowerCase() === 'sales';

      const recordData = {
          type: transType,
          category: transCategory,
          amount: parseFloat(transAmount),
          date: transDate,
          // Only include batchId if Sales category and not empty.
          batchId: (isSales && transBatchId.trim()) ? transBatchId.trim() : null,
          // Only include orderNumber if Pending.
          orderNumber: (transIsPending && transOrderNumber.trim()) ? transOrderNumber.trim() : null,
          description: transDesc,
          recordedBy: userEmail,
          villageId: villageId,
          paymentMethod: transPaymentMethod,
          status: transIsPending ? 'PENDING' : 'COMPLETED' as const
      };

      try {
          if (editingTransaction && editingTransaction.id) {
              // Update existing
              await updateDoc(doc(db, "financialRecords", editingTransaction.id), {
                  ...recordData,
                  updatedAt: new Date().toISOString()
              });
              setSuccessMessage("Transaction updated successfully.");
          } else {
              // Create new
              await addDoc(collection(db, "financialRecords"), {
                  ...recordData,
                  createdAt: new Date().toISOString()
              });
              setSuccessMessage("Transaction recorded successfully.");
          }
          
          handleCloseTransModal();
          setTimeout(() => setSuccessMessage(null), 3000);
          
          // Refresh data
          fetchFinancialRecords();
      } catch (error: any) {
          console.error("Error saving transaction", error);
          if (error.code === 'permission-denied') {
             setActionError("Permission Denied: You cannot add/update transactions.");
          } else {
             setActionError("Failed to save transaction: " + error.message);
          }
      } finally {
          setIsSubmittingTrans(false);
      }
  };

  const openEditTransModal = (record: FinancialRecord) => {
      setEditingTransaction(record);
      setTransType(record.type);
      setTransAmount(record.amount.toString());
      setTransCategory(record.category);
      setTransDate(record.date);
      setTransBatchId(record.batchId || '');
      setTransOrderNumber(record.orderNumber || '');
      setTransDesc(record.description || '');
      setTransPaymentMethod(record.paymentMethod || 'Cash');
      setTransIsPending(record.status === 'PENDING');
      setShowTransModal(true);
  };

  const handleCloseTransModal = () => {
      setShowTransModal(false);
      setEditingTransaction(null);
      // Reset form
      setTransAmount('');
      setTransDesc('');
      setTransBatchId('');
      setTransOrderNumber('');
      setTransCategory('Supplies');
      setTransPaymentMethod('Cash');
      setTransIsPending(false);
      setTransDate(new Date().toISOString().split('T')[0]);
  };

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const querySnapshot = await getDocs(collection(db, "users"));
      const usersList: UserProfile[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        usersList.push({
            uid: doc.id, 
            ...data
        } as UserProfile);
      });
      setUsers(usersList);
      setActionError(null);
    } catch (error: any) {
      if (error.code === 'permission-denied') {
          console.warn("User directory access denied. Hiding registry data.");
          setActionError("Access Denied: Unable to view user registry.");
      } else {
          console.error("Error fetching users:", error);
          setActionError("Failed to load user list.");
      }
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchRegistryLogs = async () => {
      setLoadingLogs(true);
      try {
          const q = query(collection(db, "activity_logs"), orderBy("timestamp", "desc"), limit(50));
          const snap = await getDocs(q);
          const logs: SystemLog[] = snap.docs.map(d => ({id: d.id, ...d.data() } as SystemLog));
          setRegistryLogs(logs);
      } catch (error: any) {
          if (error.code === 'permission-denied') {
             console.warn("Activity logs access denied.");
          } else {
             console.warn("Failed to fetch registry logs:", error);
          }
      } finally {
          setLoadingLogs(false);
      }
  };

  const fetchFinancialRecords = async () => {
      try {
        // Fix: Removed 'orderBy' to avoid needing a composite index. Sorting is now client-side.
        const q = query(
            collection(db, 'financialRecords'),
            where('villageId', '==', villageId),
            limit(300) // Increased limit for better chart data
        );
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()} as FinancialRecord));
        
        // Client-side sort by date descending
        data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        setFinancialRecords(data);
        setFinancialError(null);
      } catch (error: any) {
         console.error("Financial fetch error:", error);
         if (error.code === 'permission-denied') {
            setFinancialError("Access Denied: You do not have permission to view financial records.");
         } else if (error.code === 'failed-precondition') {
            setFinancialError("System Error: Missing database index.");
         } else {
            setFinancialError("Failed to load financial records: " + error.message);
         }
         setFinancialRecords([]); // Clear records on error
      }
  };

  const fetchProductionData = async () => {
     try {
         const activitiesQuery = query(collection(db, "farming_activities"), orderBy("timestamp", "desc"), limit(5));
         const harvestQuery = query(collection(db, "harvest_logs"), orderBy("timestamp", "desc"), limit(5));
         
         const [actSnap, harvSnap] = await Promise.all([getDocs(activitiesQuery), getDocs(harvestQuery)]);
         
         const acts: ActivityLog[] = [];
         actSnap.forEach(doc => acts.push({ id: doc.id, ...doc.data() } as ActivityLog));
         setFarmingLogs(acts);

         const harvs: HarvestLog[] = [];
         harvSnap.forEach(doc => harvs.push({ id: doc.id, ...doc.data() } as HarvestLog));
         setHarvestLogs(harvs);

     } catch (e) {
         console.log("Production data not yet initialized in DB or permission denied", e);
     }
  };

  const handleLogActivity = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSubmittingActivity(true);
      try {
          const newLog: ActivityLog = {
              type: activityType as any,
              details: activityNotes,
              userEmail: userEmail,
              timestamp: new Date().toISOString(),
              villageId: villageId
          };
          
          await addDoc(collection(db, "farming_activities"), newLog);
          setFarmingLogs([newLog, ...farmingLogs]); 
          setActivityNotes('');
          setSuccessMessage("Activity logged successfully.");
          setTimeout(() => setSuccessMessage(null), 3000);
      } catch (error) {
          console.error("Error logging activity", error);
          setActionError("Failed to log activity.");
      } finally {
          setIsSubmittingActivity(false);
      }
  };

  const handleLogHarvest = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSubmittingHarvest(true);
      try {
          const newHarvest: HarvestLog = {
              batchId: harvestBatch,
              weightKg: parseFloat(harvestWeight),
              strain: harvestStrain,
              recordedBy: userEmail,
              timestamp: new Date().toISOString(),
              villageId: villageId
          };

          await addDoc(collection(db, "harvest_logs"), newHarvest);
          setHarvestLogs([newHarvest, ...harvestLogs]);
          setHarvestBatch('');
          setHarvestWeight('');
          setSuccessMessage("Harvest recorded & synced to Village C.");
          setTimeout(() => setSuccessMessage(null), 3000);
      } catch (error) {
          console.error("Error logging harvest", error);
          setActionError("Failed to record harvest.");
      } finally {
          setIsSubmittingHarvest(false);
      }
  };

  const recordActivity = async (action: string, details: string) => {
    if (!auth.currentUser) return;

    const newLog = {
      action,
      details,
      uid: auth.currentUser.uid, 
      userId: auth.currentUser.uid,
      userEmail: userEmail,
      adminEmail: userEmail,
      villageId: villageId,
      timestamp: new Date().toISOString()
    };

    try {
      await addDoc(collection(db, "activity_logs"), newLog);
      if (activeTab === 'registry') {
          fetchRegistryLogs();
      }
    } catch (error) {
      console.warn("Failed to persist system log (likely permissions):", error);
    }
  };

  const openEditModal = (user: UserProfile) => {
      setEditingUser(user);
      setEditName(user.name || '');
      setEditRole(user.role);
      setEditVillage(user.villageId);
      setEditJobTitle(user.jobTitle || JOB_ROLES[0]);
      setEditPassword('');
  };

  const closeEditModal = () => {
      setEditingUser(null);
      setActionError(null);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingUser || !isAdmin) return;
      setIsUpdatingUser(true);
      setActionError(null);
      try {
          const updates: any = { 
            name: editName,
            role: editRole, 
            villageId: editVillage, 
            jobTitle: editJobTitle 
          };
          
          let passwordChanged = false;
          if (editPassword && editPassword.trim() !== '') {
             if (editPassword.length < 6 || !/\d/.test(editPassword)) throw new Error("Password must be at least 6 characters and contain a number.");
             updates.password = editPassword;
             passwordChanged = true;
          }
          await updateDoc(doc(db, "users", editingUser.uid), updates);
          const logDetails = `Updated profile for ${editingUser.email}. Role: ${editRole}. Village: ${editVillage}.${passwordChanged ? ' Password updated.' : ''}`;
          await recordActivity('USER_UPDATED', logDetails);
          setUsers(users.map(u => u.uid === editingUser.uid ? { ...u, ...updates } : u));
          setSuccessMessage(`User profile updated successfully.`);
          setTimeout(() => setSuccessMessage(null), 4000);
          closeEditModal();
      } catch (error: any) {
          if (error.code === 'permission-denied') setActionError("Permission Denied: You do not have rights to update users.");
          else setActionError("Failed to update user: " + error.message);
      } finally {
          setIsUpdatingUser(false);
      }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setActionError(null);
    setSuccessMessage(null);
    setIsAddingUser(true);
    
    if (!newUserName.trim()) {
        setActionError("User name is required.");
        setIsAddingUser(false);
        return;
    }
    if (!newUserEmail.endsWith('@gmail.com')) {
        setActionError("Only @gmail.com addresses are allowed.");
        setIsAddingUser(false);
        return;
    }
    if (newUserPassword.length < 6 || !/\d/.test(newUserPassword)) {
        setActionError("Password must be at least 6 characters and contain a number.");
        setIsAddingUser(false);
        return;
    }
    
    let secondaryApp: FirebaseApp | undefined;
    try {
      secondaryApp = initializeApp(firebaseConfig, `SecondaryApp-${Date.now()}`);
      const secondaryAuth = getAuth(secondaryApp);
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newUserEmail, newUserPassword);
      const newUid = userCredential.user.uid;
      await signOut(secondaryAuth);
      
      const newUserRef = doc(db, "users", newUid);
      const newUser: UserProfile = {
        uid: newUid,
        name: newUserName,
        email: newUserEmail,
        villageId: newUserVillage,
        role: newUserRole,
        jobTitle: newUserJobTitle,
        createdAt: new Date().toISOString(),
        password: newUserPassword
      };
      
      await setDoc(newUserRef, newUser);
      await recordActivity('USER_CREATED', `Created new user ${newUserEmail} in ${newUserVillage} as ${newUserJobTitle}`);
      setUsers([...users, newUser]);
      setShowAddForm(false);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserJobTitle(JOB_ROLES[0]);
      setSuccessMessage(`User ${newUserName} (${newUserEmail}) added to system.`);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (error: any) {
      if (error.code === 'permission-denied') setActionError("Permission Denied: You do not have rights to add users.");
      else if (error.code === 'auth/email-already-in-use') setActionError("Error: This email is already registered.");
      else setActionError("Error creating user: " + error.message);
    } finally {
        if (secondaryApp) try { await deleteApp(secondaryApp); } catch (e) { console.error(e); }
        setIsAddingUser(false);
    }
  };

  const filteredUsers = users.filter(user => {
    const lowerQuery = searchQuery.toLowerCase();
    const villageName = VILLAGES[user.villageId]?.name || '';
    return (
        (user.email || '').toLowerCase().includes(lowerQuery) ||
        (user.name || '').toLowerCase().includes(lowerQuery) ||
        (user.role || '').toLowerCase().includes(lowerQuery) ||
        (user.jobTitle || '').toLowerCase().includes(lowerQuery) ||
        (user.villageId || '').toLowerCase().includes(lowerQuery) ||
        villageName.toLowerCase().includes(lowerQuery)
    );
  });

  return (
    <div className={`min-h-screen ${theme.bgSoft} flex flex-col transition-colors duration-500`}>
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2 sm:space-x-3">
             <div className={`px-4 py-2 rounded-lg ${theme.bgLight} ${theme.textMain} border ${theme.borderSoft} shadow-sm`}>
                <span className="font-bold text-lg sm:text-xl tracking-tight">Dashboard</span>
             </div>
             {isAdmin && (
                <span className="ml-2 px-2 py-0.5 rounded text-[10px] sm:text-xs font-bold bg-red-100 text-red-800 border border-red-200 uppercase tracking-wide">
                  Admin
                </span>
             )}
          </div>
          <div className="flex items-center space-x-2 sm:space-x-4">
            <div className="hidden md:flex flex-col items-end">
                <span className="text-sm font-semibold text-gray-900">{userName || 'Unknown User'}</span>
                <span className="text-xs text-gray-500">{userEmail}</span>
            </div>
            <button
              onClick={() => signOut(auth)}
              className="text-xs sm:text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 px-2 sm:px-3 py-1.5 sm:py-2 rounded-md transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 relative">
        
        {/* Top Notification Messages */}
        {actionError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center text-red-700 animate-fade-in-up">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span className="text-sm font-medium">{actionError}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center text-green-700 animate-fade-in-up">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM6.707 9.293a1 1 0 00-1.414 1.414L3 3a1 1 0 001.414 0l7-7a1 1 0 00-1.414-1.414L10 10.586 6.707 9.293z" clipRule="evenodd" />
             </svg>
             <span className="text-sm font-medium">{successMessage}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 mb-6 overflow-x-auto">
            <nav className="-mb-px flex space-x-6 sm:space-x-8" aria-label="Tabs">
                <button
                    onClick={() => setActiveTab('overview')}
                    className={`${activeTab === 'overview' ? `border-${village.color}-500 text-${village.color}-600` : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
                >
                    Overview
                </button>

                {/* Farming Villages Specific Tabs: Only for User and Admin (not Finance) */}
                {village.role === VillageRole.FARMING && (isUser || isAdmin) && (
                    <>
                        <button
                            onClick={() => setActiveTab('farming')}
                            className={`${activeTab === 'farming' ? `border-${village.color}-500 text-${village.color}-600` : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
                        >
                            Farming
                        </button>
                        <button
                            onClick={() => setActiveTab('environment')}
                            className={`${activeTab === 'environment' ? `border-${village.color}-500 text-${village.color}-600` : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
                        >
                            Environment
                        </button>
                        <button
                            onClick={() => setActiveTab('resources')}
                            className={`${activeTab === 'resources' ? `border-${village.color}-500 text-${village.color}-600` : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
                        >
                            Resources
                        </button>
                    </>
                )}
                
                {/* Financials: Only for Finance Role or Admin */}
                {(isFinance || isAdmin) && (
                    <button
                        onClick={() => setActiveTab('financial')}
                        className={`${activeTab === 'financial' ? `border-${village.color}-500 text-${village.color}-600` : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
                    >
                        Financials
                    </button>
                )}

                {/* Processing Village Specific Tabs: Only for User and Admin */}
                {village.role === VillageRole.PROCESSING && (isUser || isAdmin) && (
                    <button
                        onClick={() => setActiveTab('processing')}
                        className={`${activeTab === 'processing' ? `border-${village.color}-500 text-${village.color}-600` : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
                    >
                        Production
                    </button>
                )}

                {isAdmin && (
                    <button
                        onClick={() => setActiveTab('registry')}
                        className={`${activeTab === 'registry' ? `border-${village.color}-500 text-${village.color}-600` : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
                    >
                        User Registry
                    </button>
                )}
            </nav>
        </div>

        {/* --- VIEW: FINANCE OVERVIEW (Role: FINANCE) --- */}
        {activeTab === 'overview' && isFinance && financeOverviewData ? (
             <div className="space-y-6 animate-fade-in-up">
                 <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div>
                           <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">Financial Overview</h1>
                           <p className="text-sm text-gray-500">Cash flow performance and outstanding tracking for {village.name}.</p>
                        </div>
                        <div className={`px-4 py-2 rounded-full ${theme.bgSoft} ${theme.textMain} font-medium text-xs sm:text-sm border ${theme.borderSoft} whitespace-nowrap`}>
                           Role: Financial Clerk
                        </div>
                    </div>
                 </div>

                 {/* Top Cards: Actual Cash, Receivables, Payables */}
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                     <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
                        <div className="relative z-10">
                            <h3 className="text-sm font-medium text-gray-500 mb-1">Net Cash Position</h3>
                            <div className="text-3xl font-bold text-gray-900">
                                {financeOverviewData.netCashFlow < 0 ? '-' : ''}RM{Math.abs(financeOverviewData.netCashFlow).toLocaleString(undefined, {minimumFractionDigits: 2})}
                            </div>
                            <div className="mt-2 text-xs flex gap-3">
                                <span className="text-green-600 font-medium">In: RM{financeOverviewData.totalRevenue.toLocaleString()}</span>
                                <span className="text-red-600 font-medium">Out: RM{financeOverviewData.totalExpenses.toLocaleString()}</span>
                            </div>
                        </div>
                        <div className="absolute right-0 top-0 h-full w-2 bg-indigo-500"></div>
                     </div>

                     <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
                         <div className="relative z-10">
                             <div className="flex justify-between items-start">
                                 <h3 className="text-sm font-medium text-gray-500 mb-1">Receivables</h3>
                                 <span className="bg-orange-100 text-orange-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Pending In</span>
                             </div>
                             <div className="text-3xl font-bold text-orange-600">
                                 RM{financeOverviewData.totalReceivables.toLocaleString(undefined, {minimumFractionDigits: 2})}
                             </div>
                             <p className="mt-2 text-xs text-gray-400">{financeOverviewData.receivables.length} outstanding invoice(s)</p>
                         </div>
                     </div>

                     <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
                         <div className="relative z-10">
                             <div className="flex justify-between items-start">
                                 <h3 className="text-sm font-medium text-gray-500 mb-1">Payables</h3>
                                 <span className="bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Pending Out</span>
                             </div>
                             <div className="text-3xl font-bold text-red-600">
                                 RM{financeOverviewData.totalPayables.toLocaleString(undefined, {minimumFractionDigits: 2})}
                             </div>
                             <p className="mt-2 text-xs text-gray-400">{financeOverviewData.payables.length} unpaid bill(s)</p>
                         </div>
                     </div>
                 </div>

                 {/* Charts Section - Full Width */}
                 <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-6">
                     <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                         <h3 className="text-lg font-bold text-gray-900">Cash Flow Trends</h3>
                         <div className="flex bg-gray-100 p-1 rounded-lg">
                             {['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].map((filter) => (
                                 <button
                                     key={filter}
                                     onClick={() => setChartFilter(filter as any)}
                                     className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${chartFilter === filter ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                 >
                                     {filter.charAt(0) + filter.slice(1).toLowerCase()}
                                 </button>
                             ))}
                         </div>
                     </div>
                     <div className="h-64 w-full flex items-end justify-between gap-2 sm:gap-4 px-2">
                         {financeOverviewData.chartData.map((d) => (
                             <div key={d.label} className="flex flex-col items-center flex-1 group">
                                 <div className="relative w-full h-full flex items-end justify-center gap-1 sm:gap-2">
                                     {/* Income Bar */}
                                     <div 
                                        className="w-3 sm:w-6 bg-emerald-500 rounded-t-sm transition-all duration-500 group-hover:bg-emerald-400 relative"
                                        style={{ height: `${Math.max((d.income / financeOverviewData.maxChartValue) * 100, 2)}%` }}
                                     >
                                         <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                                             +RM{d.income.toLocaleString()}
                                         </div>
                                     </div>
                                     {/* Expense Bar */}
                                     <div 
                                        className="w-3 sm:w-6 bg-red-400 rounded-t-sm transition-all duration-500 group-hover:bg-red-300 relative"
                                        style={{ height: `${Math.max((d.expense / financeOverviewData.maxChartValue) * 100, 2)}%` }}
                                     >
                                          <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                                             -RM{d.expense.toLocaleString()}
                                          </div>
                                     </div>
                                 </div>
                                 <span className="text-[10px] sm:text-xs text-gray-500 mt-3 font-medium truncate w-full text-center">{d.label}</span>
                             </div>
                         ))}
                     </div>
                     <div className="flex justify-center items-center gap-6 mt-6">
                         <div className="flex items-center text-xs text-gray-600">
                             <div className="w-3 h-3 bg-emerald-500 rounded-sm mr-2"></div> Income
                         </div>
                         <div className="flex items-center text-xs text-gray-600">
                             <div className="w-3 h-3 bg-red-400 rounded-sm mr-2"></div> Expense
                         </div>
                     </div>
                 </div>

                 {/* Outstanding Tracker */}
                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                     {/* Receivables List */}
                     <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                         <div className="px-6 py-4 border-b border-gray-100 bg-orange-50 flex justify-between items-center">
                             <h3 className="font-bold text-orange-800 flex items-center">
                                 <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                 Outstanding Receivables
                             </h3>
                         </div>
                         <div className="overflow-x-auto max-h-80">
                             <table className="min-w-full divide-y divide-gray-200">
                                 <thead className="bg-gray-50 sticky top-0">
                                     <tr>
                                         <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                         <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer Order Number</th>
                                         <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                                         <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Action</th>
                                     </tr>
                                 </thead>
                                 <tbody className="bg-white divide-y divide-gray-200">
                                     {financeOverviewData.receivables.length === 0 ? (
                                         <tr><td colSpan={4} className="px-6 py-8 text-center text-sm text-gray-400">No pending receivables.</td></tr>
                                     ) : (
                                        financeOverviewData.receivables.map(rec => (
                                             <tr key={rec.id} className="hover:bg-gray-50">
                                                 <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">{new Date(rec.date).toLocaleDateString()}</td>
                                                 <td className="px-4 py-3 text-xs font-medium text-gray-900">
                                                     {rec.orderNumber ? (
                                                         <span className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded border border-gray-200">{rec.orderNumber}</span>
                                                     ) : (
                                                         <span className="text-gray-400 italic">--</span>
                                                     )}
                                                     <div className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[120px]">{rec.category}</div>
                                                 </td>
                                                 <td className="px-4 py-3 whitespace-nowrap text-xs font-bold text-orange-600 text-right">RM{rec.amount.toFixed(2)}</td>
                                                 <td className="px-4 py-3 text-center">
                                                     <button 
                                                        onClick={() => { setActiveTab('financial'); openEditTransModal(rec); }}
                                                        className="text-indigo-600 hover:text-indigo-900 text-xs underline"
                                                     >
                                                         Review
                                                     </button>
                                                 </td>
                                             </tr>
                                         ))
                                     )}
                                 </tbody>
                             </table>
                         </div>
                     </div>

                     {/* Payables List */}
                     <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                         <div className="px-6 py-4 border-b border-gray-100 bg-red-50 flex justify-between items-center">
                             <h3 className="font-bold text-red-800 flex items-center">
                                 <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                 Outstanding Payables
                             </h3>
                         </div>
                         <div className="overflow-x-auto max-h-80">
                             <table className="min-w-full divide-y divide-gray-200">
                                 <thead className="bg-gray-50 sticky top-0">
                                     <tr>
                                         <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                         <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice Number</th>
                                         <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                                         <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Action</th>
                                     </tr>
                                 </thead>
                                 <tbody className="bg-white divide-y divide-gray-200">
                                     {financeOverviewData.payables.length === 0 ? (
                                         <tr><td colSpan={4} className="px-6 py-8 text-center text-sm text-gray-400">No pending payables.</td></tr>
                                     ) : (
                                        financeOverviewData.payables.map(rec => (
                                             <tr key={rec.id} className="hover:bg-gray-50">
                                                 <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">{new Date(rec.date).toLocaleDateString()}</td>
                                                 <td className="px-4 py-3 text-xs font-medium text-gray-900">
                                                     {rec.orderNumber ? (
                                                         <span className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded border border-gray-200">{rec.orderNumber}</span>
                                                     ) : (
                                                         <span className="text-gray-400 italic">--</span>
                                                     )}
                                                     <div className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[120px]">{rec.category}</div>
                                                 </td>
                                                 <td className="px-4 py-3 whitespace-nowrap text-xs font-bold text-red-600 text-right">RM{rec.amount.toFixed(2)}</td>
                                                 <td className="px-4 py-3 text-center">
                                                     <button 
                                                        onClick={() => { setActiveTab('financial'); openEditTransModal(rec); }}
                                                        className="text-indigo-600 hover:text-indigo-900 text-xs underline"
                                                     >
                                                         Review
                                                     </button>
                                                 </td>
                                             </tr>
                                         ))
                                     )}
                                 </tbody>
                             </table>
                         </div>
                     </div>
                 </div>
             </div>
        ) : activeTab === 'overview' && (
            // ... (Farming/Processing overview code remains same as before) ...
            <>
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8 mb-6 sm:mb-8">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Welcome back to {village.name}, {userName || 'User'}</h1>
                        </div>
                        <div className={`px-4 py-2 rounded-full ${theme.bgSoft} ${theme.textMain} font-medium text-xs sm:text-sm border ${theme.borderSoft} whitespace-nowrap`}>
                        Current Status: Active
                        </div>
                    </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-gray-500">
                        {village.role === VillageRole.FARMING ? 'Daily Harvest' : 'Units Processed'}
                    </h3>
                    <span className={`${theme.textIcon} ${theme.bgSoft} p-1 rounded`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                    </span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900">
                    {village.role === VillageRole.FARMING ? '2,450 kg' : '8,920 units'}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">+12% from yesterday</p>
                </div>

                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-gray-500">Active Workers</h3>
                    <span className={`${theme.textIcon} ${theme.bgSoft} p-1 rounded`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                    </span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900">
                    {village.id === 'Village A' ? '124' : village.id === 'Village B' ? '86' : '210'}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Shift 1 in progress</p>
                </div>

                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-gray-500">Supply Chain Status</h3>
                    <span className={`${theme.textIcon} ${theme.bgSoft} p-1 rounded`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900">Normal</div>
                    <p className="text-xs text-gray-500 mt-1">Next truck: 14:00 PM</p>
                </div>
                </div>
            </>
        )}

        {/* ... (Farming Tab, Environment Tab, Resources Tab, Processing Tab remain same) ... */}
        {activeTab === 'farming' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h2 className="text-lg font-bold text-gray-900 mb-4">Log Activity</h2>
                    <form onSubmit={handleLogActivity} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Activity Type</label>
                            <select 
                                value={activityType}
                                onChange={(e) => setActivityType(e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm border p-2"
                            >
                                <option value="BED_PREP">Bed Preparation</option>
                                <option value="WATERING">Watering</option>
                                <option value="INSPECTION">Inspection</option>
                                <option value="HARVEST">Harvest</option>
                                <option value="OTHER">Other</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Notes</label>
                            <textarea
                                value={activityNotes}
                                onChange={(e) => setActivityNotes(e.target.value)}
                                rows={3}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm border p-2"
                                placeholder="Details about the activity..."
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={isSubmittingActivity}
                            className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${theme.button} focus:outline-none focus:ring-2 focus:ring-offset-2 ${theme.ring}`}
                        >
                            {isSubmittingActivity ? 'Logging...' : 'Log Activity'}
                        </button>
                    </form>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h2 className="text-lg font-bold text-gray-900 mb-4">Record Harvest</h2>
                     <form onSubmit={handleLogHarvest} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Batch ID</label>
                            <input
                                type="text"
                                value={harvestBatch}
                                onChange={(e) => setHarvestBatch(e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm border p-2"
                                placeholder="e.g. B-2023-001"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Weight (kg)</label>
                            <input
                                type="number"
                                step="0.1"
                                value={harvestWeight}
                                onChange={(e) => setHarvestWeight(e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm border p-2"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Strain</label>
                            <select 
                                value={harvestStrain}
                                onChange={(e) => setHarvestStrain(e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm border p-2"
                            >
                                <option value="Oyster">Oyster</option>
                                <option value="Shiitake">Shiitake</option>
                                <option value="Button">Button</option>
                                <option value="Lion's Mane">Lion's Mane</option>
                            </select>
                        </div>
                        <button
                            type="submit"
                            disabled={isSubmittingHarvest}
                            className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${theme.button} focus:outline-none focus:ring-2 focus:ring-offset-2 ${theme.ring}`}
                        >
                            {isSubmittingHarvest ? 'Saving...' : 'Record Harvest'}
                        </button>
                    </form>
                </div>

                <div className="md:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="text-sm font-medium text-gray-500 mb-4">Recent Activities</h3>
                     <div className="flow-root">
                        <ul className="-my-5 divide-y divide-gray-200">
                            {farmingLogs.map((log) => (
                                <li key={log.id} className="py-4">
                                    <div className="flex items-center space-x-4">
                                        <div className="flex-shrink-0">
                                            <span className={`inline-block h-8 w-8 rounded-full ${theme.bgSoft} flex items-center justify-center`}>
                                                <svg className={`h-5 w-5 ${theme.textIcon}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                                     <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                                </svg>
                                            </span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">{log.type}</p>
                                            <p className="text-sm text-gray-500 truncate">{log.details}</p>
                                        </div>
                                        <div>
                                            <span className="inline-flex items-center shadow-sm px-2.5 py-0.5 border border-gray-300 text-sm leading-5 font-medium rounded-full text-gray-700 bg-white hover:bg-gray-50">
                                                {new Date(log.timestamp).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        )}

        {/* Environment Tab */}
        {activeTab === 'environment' && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                <div className="bg-white overflow-hidden shadow rounded-lg">
                    <div className="px-4 py-5 sm:p-6">
                        <dt className="text-sm font-medium text-gray-500 truncate">Temperature</dt>
                        <dd className="mt-1 text-3xl font-semibold text-gray-900">{envData.temp}°C</dd>
                    </div>
                </div>
                <div className="bg-white overflow-hidden shadow rounded-lg">
                    <div className="px-4 py-5 sm:p-6">
                        <dt className="text-sm font-medium text-gray-500 truncate">Humidity</dt>
                        <dd className="mt-1 text-3xl font-semibold text-gray-900">{envData.humidity}%</dd>
                    </div>
                </div>
                <div className="bg-white overflow-hidden shadow rounded-lg">
                    <div className="px-4 py-5 sm:p-6">
                        <dt className="text-sm font-medium text-gray-500 truncate">Soil Moisture</dt>
                        <dd className="mt-1 text-3xl font-semibold text-gray-900">{envData.moisture}%</dd>
                    </div>
                </div>
            </div>
        )}

        {/* Resources Tab */}
        {activeTab === 'resources' && (
            <div className="bg-white shadow overflow-hidden sm:rounded-md">
                <ul className="divide-y divide-gray-200">
                    {resources.map((item) => (
                        <li key={item.id}>
                            <div className="px-4 py-4 sm:px-6">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-medium text-indigo-600 truncate">{item.name}</p>
                                    <div className="ml-2 flex-shrink-0 flex">
                                        <p className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${item.status === 'OK' ? 'bg-green-100 text-green-800' : item.status === 'LOW' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                                            {item.status}
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-2 sm:flex sm:justify-between">
                                    <div className="sm:flex">
                                        <p className="flex items-center text-sm text-gray-500">
                                            Quantity: {item.quantity} {item.unit}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        )}
        
        {/* Processing Tab */}
        {activeTab === 'processing' && (
             <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                 <h2 className="text-lg font-bold text-gray-900 mb-4">Processing Line</h2>
                 <p className="text-gray-500">Production data and batch tracking would go here.</p>
                 <div className="mt-4 border-t border-gray-200 pt-4">
                     <h3 className="text-sm font-medium text-gray-900">Recent Harvests (Input)</h3>
                     <ul className="mt-2 divide-y divide-gray-200">
                        {harvestLogs.map((log) => (
                             <li key={log.id} className="py-2 flex justify-between text-sm">
                                 <span>{log.strain} - Batch {log.batchId}</span>
                                 <span className="text-gray-500">{log.weightKg} kg</span>
                             </li>
                        ))}
                     </ul>
                 </div>
             </div>
        )}

        {/* Financial Tab */}
        {activeTab === 'financial' && (
            <div className="space-y-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-lg font-bold text-gray-900">Financial Records</h2>
                        <button
                            onClick={() => { setShowTransModal(true); handleTransTypeChange('EXPENSE'); }}
                            className={`px-4 py-2 rounded-md text-sm font-medium text-white ${theme.button}`}
                        >
                            Add Record
                        </button>
                    </div>
                    
                    {/* Filters */}
                    <div className="flex flex-col sm:flex-row gap-4 mb-6">
                         <select 
                            value={financialPeriod} 
                            onChange={(e) => setFinancialPeriod(e.target.value as any)}
                            className="block w-full sm:w-auto pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md border bg-gray-700 text-white"
                         >
                             <option value="ALL">All Time</option>
                             <option value="MONTH">This Month</option>
                             <option value="TODAY">Today</option>
                         </select>
                         <select
                            value={filterCategory}
                            onChange={(e) => setFilterCategory(e.target.value)}
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
                            onChange={(e) => setFilterStatus(e.target.value as any)}
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
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Batch ID</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredFinancials.map((record) => (
                                    <tr key={record.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openEditTransModal(record)}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(record.date).toLocaleDateString()}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${record.type === 'INCOME' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                {record.type}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{record.category}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{record.batchId || '-'}</td>
                                        <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">{record.description || '-'}</td>
                                        <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold text-right ${record.type === 'INCOME' ? 'text-green-600' : 'text-red-600'}`}>
                                            RM{record.amount.toFixed(2)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            {record.status === 'PENDING' ? (
                                                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">Pending</span>
                                            ) : (
                                                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">Completed</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}

        {/* ... (Registry Tab remains same) ... */}
        {activeTab === 'registry' && isAdmin && (
            <div className="space-y-6">
                <div className="bg-white shadow sm:rounded-lg">
                    {/* ... */}
                    {/* User Registry Code Omitted for Brevity (unchanged) */}
                    <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
                        <h3 className="text-lg leading-6 font-medium text-gray-900">User Registry</h3>
                        <button
                            onClick={() => setShowAddForm(!showAddForm)}
                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                            {showAddForm ? 'Cancel' : 'Add User'}
                        </button>
                    </div>
                    
                    {showAddForm && (
                        <div className="px-4 py-5 sm:px-6 bg-gray-50 border-t border-gray-200">
                             <form onSubmit={handleAddUser} className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                                 <div className="sm:col-span-3">
                                     <label className="block text-sm font-medium text-gray-700">Name</label>
                                     <input type="text" required value={newUserName} onChange={e => setNewUserName(e.target.value)} className="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 border" />
                                 </div>
                                 <div className="sm:col-span-3">
                                     <label className="block text-sm font-medium text-gray-700">Email (Gmail only)</label>
                                     <input type="email" required value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} className="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 border" />
                                 </div>
                                 <div className="sm:col-span-3">
                                     <label className="block text-sm font-medium text-gray-700">Password</label>
                                     <input type="password" required value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} className="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 border" />
                                 </div>
                                 <div className="sm:col-span-3">
                                     <label className="block text-sm font-medium text-gray-700">Role</label>
                                     <select value={newUserRole} onChange={e => setNewUserRole(e.target.value as UserRole)} className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                                         {USER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                     </select>
                                 </div>
                                 <div className="sm:col-span-3">
                                     <label className="block text-sm font-medium text-gray-700">Village</label>
                                     <select value={newUserVillage} onChange={e => setNewUserVillage(e.target.value as VillageType)} className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                                         {Object.values(VILLAGES).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                     </select>
                                 </div>
                                  <div className="sm:col-span-3">
                                     <label className="block text-sm font-medium text-gray-700">Job Title</label>
                                     <select value={newUserJobTitle} onChange={e => setNewUserJobTitle(e.target.value)} className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                                         {JOB_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                     </select>
                                 </div>
                                 <div className="sm:col-span-6">
                                     <button type="submit" disabled={isAddingUser} className="w-full inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                                         {isAddingUser ? 'Creating...' : 'Create User'}
                                     </button>
                                 </div>
                             </form>
                        </div>
                    )}
                    
                    <div className="border-t border-gray-200">
                         <div className="px-4 py-3 bg-gray-50">
                             <input type="text" placeholder="Search users..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border" />
                         </div>
                         <ul className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                             {filteredUsers.map((user) => (
                                 <li key={user.uid} className="px-4 py-4 sm:px-6 hover:bg-gray-50 cursor-pointer" onClick={() => openEditModal(user)}>
                                     <div className="flex items-center justify-between">
                                         <p className="text-sm font-medium text-indigo-600 truncate">{user.name}</p>
                                         <div className="ml-2 flex-shrink-0 flex">
                                             <p className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.role === 'admin' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                                                 {user.role}
                                             </p>
                                         </div>
                                     </div>
                                     <div className="mt-2 sm:flex sm:justify-between">
                                         <div className="sm:flex">
                                             <p className="flex items-center text-sm text-gray-500">
                                                 <span className="truncate">{user.email}</span>
                                             </p>
                                         </div>
                                         <div className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0">
                                             <p>{VILLAGES[user.villageId]?.name}</p>
                                         </div>
                                     </div>
                                 </li>
                             ))}
                         </ul>
                    </div>
                </div>

                {/* System Logs */}
                <div className="bg-white shadow sm:rounded-lg">
                    <div className="px-4 py-5 sm:px-6">
                        <h3 className="text-lg leading-6 font-medium text-gray-900">System Activity Logs</h3>
                    </div>
                    <div className="border-t border-gray-200">
                        <ul className="divide-y divide-gray-200 max-h-60 overflow-y-auto">
                            {registryLogs.map((log) => (
                                <li key={log.id} className="px-4 py-4 sm:px-6">
                                    <div className="flex items-center justify-between">
                                        <div className="text-sm text-gray-900">{log.details || log.action}</div>
                                        <div className="text-xs text-gray-500">{log.timestamp ? new Date(log.timestamp).toLocaleString() : ''}</div>
                                    </div>
                                    <div className="text-xs text-gray-400 mt-1">{log.userEmail}</div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        )}

      </main>

      {/* ... (Edit User Modal unchanged) ... */}
      {editingUser && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={closeEditModal}></div>
                <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
                    <div>
                        <div className="mt-3 text-center sm:mt-5">
                            <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">Edit User: {editingUser.email}</h3>
                            <div className="mt-2">
                                <form onSubmit={handleUpdateUser} className="space-y-4 text-left">
                                     <div>
                                         <label className="block text-sm font-medium text-gray-700">Name</label>
                                         <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                                     </div>
                                     <div>
                                         <label className="block text-sm font-medium text-gray-700">Role</label>
                                         <select value={editRole} onChange={e => setEditRole(e.target.value as UserRole)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2">
                                              {USER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                         </select>
                                     </div>
                                     <div>
                                         <label className="block text-sm font-medium text-gray-700">Village</label>
                                         <select value={editVillage} onChange={e => setEditVillage(e.target.value as VillageType)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2">
                                              {Object.values(VILLAGES).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                         </select>
                                     </div>
                                     <div>
                                         <label className="block text-sm font-medium text-gray-700">Job Title</label>
                                         <select value={editJobTitle} onChange={e => setEditJobTitle(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2">
                                              {JOB_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                         </select>
                                     </div>
                                     <div>
                                         <label className="block text-sm font-medium text-gray-700">New Password (Optional)</label>
                                         <input type="password" value={editPassword} onChange={e => setEditPassword(e.target.value)} placeholder="Leave blank to keep current" className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                                     </div>
                                     <div className="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
                                        <button type="submit" disabled={isUpdatingUser} className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:col-start-2 sm:text-sm">
                                            {isUpdatingUser ? 'Saving...' : 'Save Changes'}
                                        </button>
                                        <button type="button" onClick={closeEditModal} className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:col-start-1 sm:text-sm">
                                            Cancel
                                        </button>
                                     </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Transaction Modal */}
      {showTransModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={handleCloseTransModal}></div>
                <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
                    <div>
                         <h3 className="text-lg font-bold text-gray-900 mb-4">{editingTransaction ? 'Edit Transaction' : 'New Transaction'}</h3>
                         <form onSubmit={handleSaveTransaction} className="space-y-4">
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

                             {/* Conditional Batch ID */}
                             {transCategory === 'Sales' && (
                                 <div className="animate-fade-in-up">
                                     <label className="block text-sm font-medium text-gray-700 mb-1">Batch ID</label>
                                     <input type="text" value={transBatchId} onChange={e => setTransBatchId(e.target.value)} className="w-full border border-gray-600 rounded-lg p-2.5 bg-gray-700 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors placeholder-gray-400" placeholder="e.g. B-2023-001" />
                                 </div>
                             )}

                             {/* Conditional Customer Order # / Invoice Number */}
                             {transIsPending && (
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
                                <button type="button" onClick={handleCloseTransModal} className="flex-1 bg-white border border-gray-300 text-gray-700 font-bold py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                                    Cancel
                                </button>
                                <button type="submit" disabled={isSubmittingTrans} className="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-lg hover:bg-blue-700 transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed">
                                    {isSubmittingTrans ? 'Saving...' : 'Save Record'}
                                </button>
                             </div>
                         </form>
                    </div>
                </div>
            </div>
        )}

    </div>
  );
};
