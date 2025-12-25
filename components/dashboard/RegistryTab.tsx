import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, doc, updateDoc, setDoc, query, orderBy, limit, addDoc, onSnapshot } from 'firebase/firestore';
// Fix: Import from @firebase/app to resolve type errors as seen in services/firebase.ts
import { initializeApp, deleteApp } from '@firebase/app';
import type { FirebaseApp } from '@firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from '@firebase/auth';
import { db, firebaseConfig } from '../../services/firebase';
import { UserProfile, UserRole, VillageType, SystemLog } from '../../types';
import { VILLAGES, JOB_ROLES, COLOR_THEMES } from '../../constants';

interface RegistryTabProps {
  adminEmail: string;
}

export const RegistryTab: React.FC<RegistryTabProps> = ({ adminEmail }) => {
  const [activeSubTab, setActiveSubTab] = useState<'PERSONNEL' | 'LOGS'>('PERSONNEL');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [registryLogs, setRegistryLogs] = useState<SystemLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [logFilter, setLogFilter] = useState('ALL');

  const [showAddForm, setShowAddForm] = useState(false);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserStaffId, setNewUserStaffId] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('user');
  const [newUserVillage, setNewUserVillage] = useState<VillageType>(VillageType.C);
  const [newUserJobTitle, setNewUserJobTitle] = useState<string>(JOB_ROLES[0]);

  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editName, setEditName] = useState('');
  const [editStaffId, setEditStaffId] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('user');
  const [editVillage, setEditVillage] = useState<VillageType>(VillageType.A);
  const [editJobTitle, setEditJobTitle] = useState<string>(JOB_ROLES[0]);
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);

  // Helper to generate IDs like VA-1234
  const generateStaffId = (village: VillageType) => {
    const prefix = village === VillageType.A ? 'VA' : village === VillageType.B ? 'VB' : 'VC';
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${randomDigits}`;
  };

  useEffect(() => {
    fetchUsers();
    
    // Set up real-time listener for system activity logs
    const q = query(collection(db, "activity_logs"), orderBy("timestamp", "desc"), limit(100));
    const unsubscribeLogs = onSnapshot(q, (snapshot) => {
        const logs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as SystemLog));
        setRegistryLogs(logs);
    });

    return () => unsubscribeLogs();
  }, []);

  // Update Staff ID when opening form or changing village
  useEffect(() => {
    if (showAddForm) {
      setNewUserStaffId(generateStaffId(newUserVillage));
    }
  }, [showAddForm, newUserVillage]);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const querySnapshot = await getDocs(collection(db, "users"));
      const usersList: UserProfile[] = [];
      querySnapshot.forEach((doc) => {
        usersList.push({ uid: doc.id, ...doc.data() } as UserProfile);
      });
      setUsers(usersList);
    } catch (error) {
       console.error(error);
       setActionError("Load users failed.");
    } finally {
      setLoadingUsers(false);
    }
  };

  const recordActivity = async (action: string, details: string) => {
    try {
      await addDoc(collection(db, "activity_logs"), {
          action, 
          details, 
          userEmail: adminEmail, 
          timestamp: new Date().toISOString()
      });
    } catch (error) { console.warn(error); }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setIsAddingUser(true);
    
    let secondaryApp: FirebaseApp | undefined;
    try {
      secondaryApp = initializeApp(firebaseConfig, `App-${Date.now()}`);
      const secondaryAuth = getAuth(secondaryApp);
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newUserEmail, newUserPassword);
      const newUid = userCredential.user.uid;
      await signOut(secondaryAuth);
      
      const newUser: UserProfile = {
        uid: newUid, 
        name: newUserName, 
        email: newUserEmail,
        staffId: newUserStaffId,
        villageId: newUserVillage, 
        role: newUserRole, 
        jobTitle: newUserJobTitle,
        password: newUserPassword, // Store password in DB as requested
        createdAt: new Date().toISOString()
      };
      
      await setDoc(doc(db, "users", newUid), newUser);
      await recordActivity('USER_CREATED', `Authorized ${newUserEmail} (Staff ID: ${newUserStaffId}) as ${newUserJobTitle}`);
      
      setUsers([...users, newUser]);
      setShowAddForm(false);
      setNewUserName(''); setNewUserEmail(''); setNewUserStaffId(''); setNewUserPassword('');
      setSuccessMessage(`User enrollment successful: ${newUserName}`);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (error: any) {
      setActionError("Enrollment failed: " + error.message);
    } finally {
        if (secondaryApp) await deleteApp(secondaryApp);
        setIsAddingUser(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingUser) return;
      setIsUpdatingUser(true);
      try {
          const updates: any = { 
            name: editName, 
            staffId: editStaffId,
            role: editRole, 
            villageId: editVillage, 
            jobTitle: editJobTitle 
          };
          await updateDoc(doc(db, "users", editingUser.uid), updates);
          await recordActivity('USER_UPDATED', `Revised profile for ${editingUser.email} (Staff ID: ${editStaffId})`);
          
          setUsers(users.map(u => u.uid === editingUser.uid ? { ...u, ...updates } : u));
          setEditingUser(null);
          setSuccessMessage("Member profile synchronized.");
          setTimeout(() => setSuccessMessage(null), 3000);
      } catch (error: any) { setActionError(error.message); } finally { setIsUpdatingUser(false); }
  };

  const filteredUsers = useMemo(() => {
    return users.filter(u => 
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.staffId && u.staffId.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [users, searchTerm]);

  const filteredLogs = useMemo(() => {
    return registryLogs.filter(log => {
      // Exclude redundant financial logging events
      if (log.action === 'FINANCE_INCOME' || log.action === 'FINANCE_EXPENSE') return false;
      
      if (logFilter !== 'ALL' && log.action !== logFilter) return false;
      if (searchTerm && !(
          (log.details || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
          (log.userEmail || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (log.action || '').toLowerCase().includes(searchTerm.toLowerCase())
      )) return false;
      return true;
    });
  }, [registryLogs, logFilter, searchTerm]);

  // Define static filters for user-centric events
  const logFilters = [
    { label: 'All Events', value: 'ALL' },
    { label: 'User Login', value: 'USER_LOGIN' },
    { label: 'User Logout', value: 'USER_LOGOUT' },
    { label: 'User Created', value: 'USER_CREATED' },
    { label: 'User Updated', value: 'USER_UPDATED' }
  ];

  return (
    <div className="space-y-8 animate-fade-in-up">
        {/* Admin Header Card */}
        <div className="bg-slate-900 text-white p-8 rounded-[3rem] shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full -mr-20 -mt-20 blur-3xl"></div>
            <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="flex-1">
                    <h2 className="text-3xl font-black tracking-tight">Administration Hub</h2>
                    <p className="text-xs text-emerald-400 font-bold uppercase mt-1 tracking-widest">Village Oversight & Activity Tracking</p>
                    
                    {/* Tab Switcher */}
                    <div className="flex mt-6 bg-white/5 p-1 rounded-2xl w-fit border border-white/10">
                        <button 
                            onClick={() => setActiveSubTab('PERSONNEL')}
                            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'PERSONNEL' ? 'bg-white text-slate-900 shadow-xl' : 'text-slate-400 hover:text-white'}`}
                        >
                            Personnel Registry
                        </button>
                        <button 
                            onClick={() => setActiveSubTab('LOGS')}
                            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'LOGS' ? 'bg-white text-slate-900 shadow-xl' : 'text-slate-400 hover:text-white'}`}
                        >
                            System Activity Logs
                        </button>
                    </div>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto items-end">
                    <div className="relative w-full sm:w-64">
                        <input 
                          type="text" 
                          placeholder={activeSubTab === 'PERSONNEL' ? "Search Staff ID / Name..." : "Filter activity details..."}
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-10 pr-4 py-3 rounded-2xl bg-white/10 border border-white/20 text-sm focus:bg-white/20 focus:outline-none transition-all w-full"
                        />
                        <svg className="absolute left-3 top-3.5 h-4 w-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                    {activeSubTab === 'PERSONNEL' && (
                        <button 
                          onClick={() => setShowAddForm(!showAddForm)} 
                          className={`px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-xl whitespace-nowrap ${showAddForm ? 'bg-slate-700 text-white' : 'bg-emerald-500 text-white hover:bg-emerald-600'}`}
                        >
                          {showAddForm ? 'Close' : 'Enroll New Member'}
                        </button>
                    )}
                </div>
            </div>
        </div>

        {activeSubTab === 'PERSONNEL' ? (
            <>
                {showAddForm && (
                    <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-xl animate-fade-in">
                      <div className="flex justify-between items-center mb-8">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Secure Identity Registration</h3>
                        {actionError && <p className="text-xs font-bold text-red-500 animate-pulse">{actionError}</p>}
                      </div>
                      <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Full Member Name</label>
                              <input type="text" required value={newUserName} onChange={e => setNewUserName(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-medium shadow-inner focus:ring-2 focus:ring-emerald-500" placeholder="John Doe" />
                          </div>
                          <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Staff ID</label>
                              <div className="relative">
                                <input type="text" required value={newUserStaffId} onChange={e => setNewUserStaffId(e.target.value)} className="w-full p-4 pr-12 rounded-2xl bg-slate-100 border-none text-sm font-bold shadow-inner text-indigo-600 focus:ring-2 focus:ring-emerald-500" placeholder="e.g. VC-1029" />
                                <button 
                                  type="button" 
                                  onClick={() => setNewUserStaffId(generateStaffId(newUserVillage))}
                                  className="absolute right-3 top-3 p-1.5 text-slate-400 hover:text-indigo-600 transition-colors"
                                  title="Generate New ID"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                </button>
                              </div>
                          </div>
                          <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Network Email</label>
                              <input type="email" required value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-medium shadow-inner focus:ring-2 focus:ring-emerald-500" placeholder="name@village.net" />
                          </div>
                          <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Initial Security Key</label>
                              <input type="text" required value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-medium shadow-inner focus:ring-2 focus:ring-emerald-500" placeholder="Min 6 characters" />
                          </div>
                          <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Assigned Station</label>
                              <select value={newUserVillage} onChange={e => setNewUserVillage(e.target.value as VillageType)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold shadow-inner focus:ring-2 focus:ring-emerald-500">{Object.values(VILLAGES).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
                          </div>
                          <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Network Role</label>
                              <select value={newUserRole} onChange={e => setNewUserRole(e.target.value as UserRole)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold shadow-inner focus:ring-2 focus:ring-emerald-500">
                                <option value="user">Standard Member</option>
                                <option value="finance">Finance Specialist</option>
                                <option value="sales">Sales Coordinator</option>
                                <option value="admin">Administrator</option>
                              </select>
                          </div>
                          <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Job Designation</label>
                              <select value={newUserJobTitle} onChange={e => setNewUserJobTitle(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold shadow-inner focus:ring-2 focus:ring-emerald-500">{JOB_ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select>
                          </div>
                          <div className="md:col-span-2 lg:col-span-3 pt-4">
                            <button type="submit" disabled={isAddingUser} className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl hover:bg-emerald-700 transition-all active:scale-[0.98] disabled:opacity-50">
                              {isAddingUser ? 'Syncing Network...' : 'Confirm Network Enrollment'}
                            </button>
                          </div>
                      </form>
                    </div>
                )}

                <div className="bg-white rounded-[3rem] shadow-sm border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-100">
                            <thead className="bg-slate-50">
                                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    <th className="px-8 py-6 text-left">Staff Details</th>
                                    <th className="px-8 py-6 text-left">Staff ID</th>
                                    <th className="px-8 py-6 text-left">Station</th>
                                    <th className="px-8 py-6 text-left">Access Level</th>
                                    <th className="px-8 py-6 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              {filteredUsers.map((u) => (
                                <tr key={u.uid} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-8 py-6">
                                      <div className="flex items-center gap-4">
                                        <div className="h-10 w-10 rounded-xl bg-slate-200 flex items-center justify-center font-black text-slate-500 uppercase">
                                          {u.name.charAt(0)}
                                        </div>
                                        <div>
                                          <div className="text-sm font-black text-slate-900">{u.name}</div>
                                          <div className="text-[10px] text-slate-400 font-bold">{u.email} &middot; {u.jobTitle}</div>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-100 font-mono">
                                            {u.staffId || 'N/A'}
                                        </span>
                                    </td>
                                    <td className="px-8 py-6">
                                      <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase border ${u.villageId === VillageType.A ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : u.villageId === VillageType.B ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                                        {VILLAGES[u.villageId]?.name}
                                      </span>
                                    </td>
                                    <td className="px-8 py-6">
                                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight bg-slate-100 px-2 py-1 rounded-md">
                                        {u.role}
                                      </span>
                                    </td>
                                    <td className="px-8 py-6 text-right">
                                      <button 
                                        onClick={() => { 
                                            setEditingUser(u); 
                                            setEditName(u.name); 
                                            setEditStaffId(u.staffId || '');
                                            setEditRole(u.role); 
                                            setEditVillage(u.villageId); 
                                            setEditJobTitle(u.jobTitle || JOB_ROLES[0]); 
                                        }} 
                                        className="text-indigo-600 font-black text-[10px] uppercase tracking-widest hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-all"
                                      >
                                        Edit Profile
                                      </button>
                                    </td>
                                </tr>
                              ))}
                              {filteredUsers.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-8 py-20 text-center text-gray-400 italic text-sm">No members found matching your criteria.</td>
                                </tr>
                              )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </>
        ) : (
            /* System Activity Logs View */
            <div className="space-y-6">
                <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm">
                    <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">System Activity Stream</h3>
                        <div className="flex flex-wrap gap-2 bg-slate-100 p-1 rounded-xl">
                            {logFilters.map(filter => (
                                <button 
                                    key={filter.value}
                                    onClick={() => setLogFilter(filter.value)}
                                    className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${logFilter === filter.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    {filter.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-4">
                        {filteredLogs.length === 0 ? (
                            <div className="text-center py-20 text-slate-400 italic text-sm">No activity logs recorded matching your current filters.</div>
                        ) : (
                            filteredLogs.map((log) => {
                                const date = new Date(log.timestamp || '');
                                return (
                                    <div key={log.id} className="flex gap-6 group hover:bg-slate-50 p-4 rounded-3xl transition-all border border-transparent hover:border-slate-100">
                                        <div className="flex flex-col items-center">
                                            <div className={`h-10 w-10 rounded-2xl flex items-center justify-center font-black shadow-sm ${
                                                log.action?.includes('CREATE') || log.action?.includes('SALE') ? 'bg-emerald-100 text-emerald-600' :
                                                log.action?.includes('DELETE') ? 'bg-rose-100 text-rose-600' :
                                                log.action?.includes('UPDATE') ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'
                                            }`}>
                                                {log.action?.charAt(0) || 'L'}
                                            </div>
                                            <div className="flex-1 w-px bg-slate-200 my-2 group-last:hidden"></div>
                                        </div>
                                        <div className="flex-1 pb-4">
                                            <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-1 mb-1">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                                    {log.action?.replace('_', ' ')} &middot; {date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second: '2-digit'})}
                                                </span>
                                                <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                                    {date.toLocaleDateString()}
                                                </span>
                                            </div>
                                            <p className="text-sm font-bold text-slate-800 leading-relaxed mb-1">{log.details}</p>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-black text-indigo-600 lowercase">{log.userEmail}</span>
                                                {log.villageId && (
                                                    <>
                                                        <span className="text-slate-300">&bull;</span>
                                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                                                            {log.villageId}
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* Edit User Modal */}
        {editingUser && (
             <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
                 <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-lg p-10 animate-scale-in">
                     <h3 className="text-2xl font-black mb-8 tracking-tight">Revision: {editingUser.name}</h3>
                     <form onSubmit={handleUpdateUser} className="space-y-6">
                         <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Member Identity</label>
                                <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold" />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Staff ID</label>
                                <div className="relative">
                                  <input type="text" value={editStaffId} onChange={e => setEditStaffId(e.target.value)} className="w-full p-4 pr-12 rounded-2xl bg-slate-100 border-none text-sm font-bold text-indigo-600 font-mono" />
                                  <button 
                                    type="button" 
                                    onClick={() => setEditStaffId(generateStaffId(editVillage))}
                                    className="absolute right-3 top-3 p-1.5 text-slate-400 hover:text-indigo-600 transition-colors"
                                  >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                  </button>
                                </div>
                            </div>
                         </div>
                         <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Station</label>
                                <select value={editVillage} onChange={e => setEditVillage(e.target.value as VillageType)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold">{Object.values(VILLAGES).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
                            </div>
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Access Scope</label>
                                <select value={editRole} onChange={e => setEditRole(e.target.value as UserRole)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold">
                                  <option value="user">Member</option>
                                  <option value="finance">Finance</option>
                                  <option value="sales">Sales</option>
                                  <option value="admin">Admin</option>
                                </select>
                            </div>
                         </div>
                         <div className="space-y-2">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Designation</label>
                            <select value={editJobTitle} onChange={e => setEditJobTitle(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-100 border-none text-sm font-bold">{JOB_ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select>
                         </div>
                         <div className="flex gap-4 pt-6">
                             <button type="button" onClick={() => setEditingUser(null)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-xs">Abort</button>
                             <button type="submit" disabled={isUpdatingUser} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs shadow-xl active:scale-[0.98]">Confirm Revision</button>
                         </div>
                     </form>
                 </div>
             </div>
        )}
    </div>
  );
};