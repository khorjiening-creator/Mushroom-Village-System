
import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, setDoc, query, orderBy, limit, addDoc } from 'firebase/firestore';
// Fix: Use @firebase/app path to resolve initializeApp, deleteApp, and FirebaseApp exports
import { initializeApp, deleteApp } from '@firebase/app';
import type { FirebaseApp } from '@firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, firebaseConfig } from '../../services/firebase';
import { UserProfile, UserRole, VillageType, SystemLog } from '../../types';
import { VILLAGES, JOB_ROLES, USER_ROLES, COLOR_THEMES } from '../../constants';

interface RegistryTabProps {
  adminEmail: string;
}

export const RegistryTab: React.FC<RegistryTabProps> = ({ adminEmail }) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [registryLogs, setRegistryLogs] = useState<SystemLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Add User State
  const [showAddForm, setShowAddForm] = useState(false);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('user');
  const [newUserVillage, setNewUserVillage] = useState<VillageType>(VillageType.A);
  const [newUserJobTitle, setNewUserJobTitle] = useState<string>(JOB_ROLES[0]);

  // Edit User State
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('user');
  const [editVillage, setEditVillage] = useState<VillageType>(VillageType.A);
  const [editJobTitle, setEditJobTitle] = useState<string>(JOB_ROLES[0]);
  const [editPassword, setEditPassword] = useState('');
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchRegistryLogs();
  }, []);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const querySnapshot = await getDocs(collection(db, "users"));
      const usersList: UserProfile[] = [];
      querySnapshot.forEach((doc) => {
        usersList.push({ uid: doc.id, ...doc.data() } as UserProfile);
      });
      setUsers(usersList);
    } catch (error: any) {
       console.error("Error fetching users:", error);
       setActionError("Failed to load user list.");
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
      } catch (error) {
         console.warn("Failed to fetch registry logs:", error);
      } finally {
          setLoadingLogs(false);
      }
  };

  const recordActivity = async (action: string, details: string) => {
    try {
      await addDoc(collection(db, "activity_logs"), {
          action, details, userEmail: adminEmail, timestamp: new Date().toISOString()
      });
      fetchRegistryLogs();
    } catch (error) {
      console.warn("Failed to persist system log", error);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setSuccessMessage(null);
    setIsAddingUser(true);
    
    if (!newUserName.trim() || !newUserEmail.endsWith('@gmail.com') || newUserPassword.length < 6) {
        setActionError("Invalid input. Check email format and password length.");
        setIsAddingUser(false);
        return;
    }
    
    let secondaryApp: FirebaseApp | undefined;
    try {
      secondaryApp = initializeApp(firebaseConfig, `SecondaryApp-${Date.now()}`);
      // Fix: modular getAuth call with app instance
      const secondaryAuth = getAuth(secondaryApp);
      // Fix: modular createUserWithEmailAndPassword call with auth instance
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newUserEmail, newUserPassword);
      const newUid = userCredential.user.uid;
      // Fix: Correct modular signOut call with auth instance
      await signOut(secondaryAuth);
      
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
      
      await setDoc(doc(db, "users", newUid), newUser);
      await recordActivity('USER_CREATED', `Created user ${newUserEmail}`);
      
      setUsers([...users, newUser]);
      setShowAddForm(false);
      setNewUserName(''); setNewUserEmail(''); setNewUserPassword('');
      setSuccessMessage(`User ${newUserName} added.`);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (error: any) {
      setActionError("Error creating user: " + error.message);
    } finally {
        if (secondaryApp) try { await deleteApp(secondaryApp); } catch (e) { console.error(e); }
        setIsAddingUser(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingUser) return;
      setIsUpdatingUser(true);
      try {
          const updates: any = { name: editName, role: editRole, villageId: editVillage, jobTitle: editJobTitle };
          if (editPassword.trim()) updates.password = editPassword;
          
          await updateDoc(doc(db, "users", editingUser.uid), updates);
          await recordActivity('USER_UPDATED', `Updated ${editingUser.email}`);
          
          setUsers(users.map(u => u.uid === editingUser.uid ? { ...u, ...updates } : u));
          setSuccessMessage("User updated.");
          setTimeout(() => setSuccessMessage(null), 3000);
          setEditingUser(null);
      } catch (error: any) {
          setActionError("Failed to update user: " + error.message);
      } finally {
          setIsUpdatingUser(false);
      }
  };

  const filteredUsers = users.filter(user => {
    const term = searchQuery.toLowerCase();
    const vName = VILLAGES[user.villageId]?.name || '';
    return (
        (user.email || '').toLowerCase().includes(term) ||
        (user.name || '').toLowerCase().includes(term) ||
        (user.role || '').toLowerCase().includes(term) ||
        vName.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-8 mb-8 animate-fade-in-up">
        {actionError && <div className="p-4 bg-red-50 text-red-700 rounded-lg">{actionError}</div>}
        {successMessage && <div className="p-4 bg-green-50 text-green-700 rounded-lg">{successMessage}</div>}

        <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Users</h2>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden relative">
            <div className="px-6 py-4 border-b border-gray-200 bg-white flex justify-between items-center">
                 <input 
                    type="text"
                    placeholder="Search users..."
                    className="block w-full max-w-xs pl-3 pr-3 py-2 border border-gray-300 rounded-md sm:text-sm"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                 />
                 <button onClick={() => setShowAddForm(!showAddForm)} className="ml-4 px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700">
                    {showAddForm ? 'Cancel' : 'Add User'}
                 </button>
            </div>

            {showAddForm && (
                <div className="bg-emerald-50 p-6 border-b border-gray-200">
                  <h3 className="text-sm font-bold text-emerald-800 mb-4">NEW USER</h3>
                  <form onSubmit={handleAddUser} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <input type="text" required value={newUserName} onChange={(e) => setNewUserName(e.target.value)} className="p-2 border rounded" placeholder="Full Name" />
                          <input type="email" required value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} className="p-2 border rounded" placeholder="Email (@gmail.com)" />
                          <input type="text" required value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} className="p-2 border rounded" placeholder="Password (min 6)" />
                          <select value={newUserVillage} onChange={(e) => setNewUserVillage(e.target.value as VillageType)} className="p-2 border rounded">
                              {Object.values(VILLAGES).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                          </select>
                          <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value as UserRole)} className="p-2 border rounded">
                              {USER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                          <select value={newUserJobTitle} onChange={(e) => setNewUserJobTitle(e.target.value)} className="p-2 border rounded">
                              {JOB_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                      </div>
                      <button type="submit" disabled={isAddingUser} className="px-4 py-2 bg-emerald-600 text-white rounded shadow-sm disabled:opacity-50">Save User</button>
                  </form>
                </div>
            )}

            <div className="overflow-x-auto max-h-[500px]">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Village</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Job Title</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredUsers.map((user) => {
                          const villageConfig = VILLAGES[user.villageId];
                          const theme = COLOR_THEMES[villageConfig?.color as keyof typeof COLOR_THEMES] || COLOR_THEMES.slate;
                          return (
                              <tr key={user.uid} className="hover:bg-gray-50">
                                <td className="px-6 py-4">
                                    <div className="text-sm font-medium text-gray-900">{user.name}</div>
                                    <div className="text-xs text-gray-500">{user.email}</div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full border ${theme.bgSoft} ${theme.textMain} ${theme.borderSoft}`}>
                                        {villageConfig?.name || user.villageId}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-500">{user.role}</td>
                                <td className="px-6 py-4 text-sm text-gray-500">{user.jobTitle || '-'}</td>
                                <td className="px-6 py-4 text-right">
                                  <button onClick={() => {
                                      setEditingUser(user);
                                      setEditName(user.name);
                                      setEditRole(user.role);
                                      setEditVillage(user.villageId);
                                      setEditJobTitle(user.jobTitle);
                                      setEditPassword('');
                                  }} className="text-indigo-600 hover:text-indigo-900 text-xs">Edit</button>
                                </td>
                              </tr>
                          );
                      })}
                    </tbody>
                </table>
            </div>
        </div>

        {/* System Logs */}
        <div className="mt-10 border-t border-gray-200 pt-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">System Activity Log</h3>
            <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Performed By</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {registryLogs.map((log) => (
                            <tr key={log.id}>
                                <td className="px-6 py-4 text-xs text-gray-500">{new Date(log.timestamp!).toLocaleString()}</td>
                                <td className="px-6 py-4 text-xs font-medium">
                                    <span className={`px-2 py-0.5 rounded-full ${log.action?.includes('CREATED') ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                                        {log.action}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-xs text-gray-600 font-medium">{log.userEmail || 'System'}</td>
                                <td className="px-6 py-4 text-xs text-gray-500">{log.details}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>

        {/* Edit Modal Overlay */}
        {editingUser && (
             <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                 <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
                     <h3 className="text-lg font-bold mb-4">Edit {editingUser.email}</h3>
                     <form onSubmit={handleUpdateUser} className="space-y-4">
                         <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="w-full p-2 border rounded" placeholder="Name" />
                         <select value={editVillage} onChange={e => setEditVillage(e.target.value as VillageType)} className="w-full p-2 border rounded">
                             {Object.values(VILLAGES).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                         </select>
                         <select value={editRole} onChange={e => setEditRole(e.target.value as UserRole)} className="w-full p-2 border rounded">
                             {USER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                         </select>
                         <select value={editJobTitle} onChange={e => setEditJobTitle(e.target.value)} className="w-full p-2 border rounded">
                             {JOB_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                         </select>
                         <input type="text" value={editPassword} onChange={e => setEditPassword(e.target.value)} className="w-full p-2 border rounded" placeholder="New Password (optional)" />
                         <div className="flex justify-end gap-2">
                             <button type="button" onClick={() => setEditingUser(null)} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
                             <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Update</button>
                         </div>
                     </form>
                 </div>
             </div>
        )}
    </div>
  );
};
