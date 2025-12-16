import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, setDoc, addDoc } from 'firebase/firestore';
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { VillageType, UserProfile, VillageRole } from '../types';
import { VILLAGES } from '../constants';
import { auth, db, firebaseConfig } from '../services/firebase';

interface DashboardProps {
  villageId: VillageType;
  userEmail: string;
  isAdmin: boolean;
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

const COLOR_THEMES = {
    green: {
        bgLight: "bg-green-200",
        textMain: "text-green-800",
        bgSoft: "bg-green-100",
        textIcon: "text-green-700",
        borderSoft: "border-green-200",
        badgeBg: "bg-green-200",
        badgeText: "text-green-900"
    },
    blue: {
        bgLight: "bg-blue-200",
        textMain: "text-blue-800",
        bgSoft: "bg-blue-100",
        textIcon: "text-blue-700",
        borderSoft: "border-blue-200",
        badgeBg: "bg-blue-200",
        badgeText: "text-blue-900"
    },
    slate: {
        bgLight: "bg-slate-200",
        textMain: "text-slate-800",
        bgSoft: "bg-slate-100",
        textIcon: "text-slate-700",
        borderSoft: "border-slate-200",
        badgeBg: "bg-slate-200",
        badgeText: "text-slate-900"
    }
};

const Dashboard: React.FC<DashboardProps> = ({ villageId, userEmail, isAdmin }) => {
  const village = VILLAGES[villageId];
  const theme = COLOR_THEMES[village.color as keyof typeof COLOR_THEMES] || COLOR_THEMES.slate;

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('');

  // State for adding a user manually (Admin only)
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<VillageRole>(VillageRole.FARMING);
  const [newUserVillage, setNewUserVillage] = useState<VillageType>(VillageType.A);
  const [newUserJobTitle, setNewUserJobTitle] = useState<string>(JOB_ROLES[0]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isAddingUser, setIsAddingUser] = useState(false);

  // State for Editing User
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editRole, setEditRole] = useState<VillageRole>(VillageRole.FARMING);
  const [editVillage, setEditVillage] = useState<VillageType>(VillageType.A);
  const [editJobTitle, setEditJobTitle] = useState<string>(JOB_ROLES[0]);
  const [editPassword, setEditPassword] = useState('');
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);

  useEffect(() => {
    // 1. Fetch Users (Admin Only)
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

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
      console.error("Error fetching users:", error);
      if (error.code === 'permission-denied') {
          setActionError("Access Denied: Unable to view user registry.");
      } else {
          setActionError("Failed to load user list.");
      }
    } finally {
      setLoadingUsers(false);
    }
  };

  const recordActivity = async (action: string, details: string) => {
    const newLog = {
      action,
      details,
      adminEmail: userEmail,
      timestamp: new Date().toISOString()
    };

    try {
      // Attempt to save to Firestore
      await addDoc(collection(db, "activity_logs"), newLog);
    } catch (error: any) {
      // If permission denied, we just log to console
      if (error.code !== 'permission-denied') {
          console.error("Failed to persist log:", error);
      }
    }
  };

  const openEditModal = (user: UserProfile) => {
      setEditingUser(user);
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
          // Determine new role based on selected village (Auto-assign role)
          const newRole = VILLAGES[editVillage].role;

          const updates: any = {
              role: newRole,
              villageId: editVillage,
              jobTitle: editJobTitle
          };

          let passwordChanged = false;
          if (editPassword && editPassword.trim() !== '') {
             if (editPassword.length < 6 || !/\d/.test(editPassword)) {
                 throw new Error("Password must be at least 6 characters and contain a number.");
             }
             updates.password = editPassword;
             passwordChanged = true;
          }

          // Strictly Firestore update
          await updateDoc(doc(db, "users", editingUser.uid), updates);
          
          const logDetails = `Updated profile for ${editingUser.email}. Role: ${newRole}. Village: ${editVillage}.${passwordChanged ? ' Password updated.' : ''}`;
          await recordActivity('USER_UPDATED', logDetails);

          // Update local state
          setUsers(users.map(u => u.uid === editingUser.uid ? { 
              ...u, 
              ...updates
          } : u));

          setSuccessMessage(`User profile updated successfully.`);
          setTimeout(() => setSuccessMessage(null), 4000);
          closeEditModal();

      } catch (error: any) {
          console.error("Error updating user:", error);
          if (error.code === 'permission-denied') {
            setActionError("Permission Denied: You do not have rights to update users.");
          } else {
            setActionError("Failed to update user: " + error.message);
          }
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

    // Email Validation: Must be Gmail
    if (!newUserEmail.endsWith('@gmail.com')) {
        setActionError("Only @gmail.com addresses are allowed.");
        setIsAddingUser(false);
        return;
    }

    // Password Validation
    if (newUserPassword.length < 6 || !/\d/.test(newUserPassword)) {
        setActionError("Password must be at least 6 characters and contain a number.");
        setIsAddingUser(false);
        return;
    }

    let secondaryApp: FirebaseApp | undefined;

    try {
      // 1. Initialize a secondary Firebase App to create user without logging out the admin
      // Using a timestamp to ensure unique app name
      secondaryApp = initializeApp(firebaseConfig, `SecondaryApp-${Date.now()}`);
      const secondaryAuth = getAuth(secondaryApp);

      // 2. Create the user in Firebase Auth (Secondary Instance)
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newUserEmail, newUserPassword);
      const newUid = userCredential.user.uid;

      // 3. Sign out the secondary auth immediately to clean up
      await signOut(secondaryAuth);

      // 4. Create document in Firestore 'users' collection using the AUTH UID
      const newUserRef = doc(db, "users", newUid);
      
      const newUser: UserProfile = {
        uid: newUid,
        email: newUserEmail,
        villageId: newUserVillage,
        role: newUserRole, // Role is auto-assigned via state in render/onChange
        jobTitle: newUserJobTitle,
        createdAt: new Date().toISOString(),
        password: newUserPassword
      };

      // Create document in 'users' collection
      await setDoc(newUserRef, newUser);
      
      await recordActivity('USER_CREATED', `Created new user ${newUserEmail} in ${newUserVillage} as ${newUserJobTitle}`);
      
      setUsers([...users, newUser]);
      setShowAddForm(false);
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserJobTitle(JOB_ROLES[0]);
      setSuccessMessage(`User ${newUserEmail} added to system.`);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (error: any) {
      console.error("Error adding user:", error);
      if (error.code === 'permission-denied') {
          setActionError("Permission Denied: You do not have rights to add users.");
      } else if (error.code === 'auth/email-already-in-use') {
          setActionError("Error: This email is already registered.");
      } else {
          setActionError("Error creating user: " + error.message);
      }
    } finally {
        if (secondaryApp) {
          try {
             await deleteApp(secondaryApp);
          } catch (e) {
             console.error("Error deleting secondary app:", e);
          }
        }
        setIsAddingUser(false);
    }
  };

  const filteredUsers = users.filter(user => {
    const lowerQuery = searchQuery.toLowerCase();
    const villageName = VILLAGES[user.villageId]?.name || '';
    return (
        (user.email || '').toLowerCase().includes(lowerQuery) ||
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
            <span className="text-sm text-gray-600 hidden md:block">Signed in as <span className="font-semibold text-gray-900">{userEmail}</span></span>
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
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        
        {/* Welcome Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8 mb-6 sm:mb-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Welcome back to {village.name}</h1>
            </div>
            <div className={`px-4 py-2 rounded-full ${theme.bgSoft} ${theme.textMain} font-medium text-xs sm:text-sm border ${theme.borderSoft} whitespace-nowrap`}>
              Current Status: Active
            </div>
          </div>
        </div>

        {/* Action Messages */}
        {actionError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center text-red-700">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span className="text-sm font-medium">{actionError}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center text-green-700">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM6.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l7-7a1 1 0 00-1.414-1.414L10 10.586 6.707 9.293z" clipRule="evenodd" />
             </svg>
             <span className="text-sm font-medium">{successMessage}</span>
          </div>
        )}

        {/* Dashboard Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
           {/* Stat Card 1 */}
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

           {/* Stat Card 2 */}
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

           {/* Stat Card 3 */}
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

        {/* User Management Section - ONLY VISIBLE TO ADMIN */}
        {isAdmin && (
          <div className="space-y-8 mb-8">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden relative">
              <div className="px-6 py-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-center bg-gray-50 gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">User Registry</h2>
                </div>
                <button 
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
                >
                  {showAddForm ? 'Cancel' : 'Add User Profile'}
                </button>
              </div>

              {/* User Search Bar */}
              <div className="px-6 py-4 border-b border-gray-200 bg-white">
                 <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                           <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <input 
                        type="text"
                        placeholder="Search users by email, role, or village..."
                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm transition duration-150 ease-in-out"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                 </div>
              </div>

              {/* Add User Form */}
              {showAddForm && (
                <div className="bg-emerald-50 p-6 border-b border-gray-200">
                  <h3 className="text-sm font-bold text-emerald-800 mb-4 uppercase tracking-wider">ADD NEW USER PROFILE</h3>
                  <form onSubmit={handleAddUser} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Email */}
                          <div className="col-span-1 md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Email (@gmail.com only)</label>
                            <input 
                              type="email" 
                              required
                              value={newUserEmail}
                              onChange={(e) => setNewUserEmail(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                              placeholder="name@gmail.com"
                            />
                          </div>
                          
                          {/* Password Input (New) */}
                          <div className="col-span-1 md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Initial Password</label>
                            <input 
                              type="text" 
                              required
                              value={newUserPassword}
                              onChange={(e) => setNewUserPassword(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                              placeholder="Secret123 (Min 6 chars + number)"
                            />
                          </div>

                          {/* Village */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Village</label>
                            <select 
                              value={newUserVillage}
                              onChange={(e) => {
                                const v = e.target.value as VillageType;
                                setNewUserVillage(v);
                                setNewUserRole(VILLAGES[v].role);
                              }}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                            >
                              {Object.values(VILLAGES).map(v => (
                                <option key={v.id} value={v.id}>{v.name}</option>
                              ))}
                            </select>
                            <div className="mt-2 text-xs text-gray-500">
                                System Role: <span className="font-semibold text-gray-900">{newUserRole}</span> (Auto-assigned)
                            </div>
                          </div>

                          {/* Job Role */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Job Role</label>
                            <select 
                              value={newUserJobTitle}
                              onChange={(e) => setNewUserJobTitle(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                            >
                              {JOB_ROLES.map(role => (
                                <option key={role} value={role}>{role}</option>
                              ))}
                            </select>
                          </div>
                      </div>

                      <div className="flex justify-end pt-2">
                          <button 
                            type="submit"
                            disabled={isAddingUser}
                            className={`w-full sm:w-auto inline-flex justify-center py-2 px-6 border border-transparent shadow-sm text-sm font-bold rounded-md text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-all ${isAddingUser ? 'opacity-75 cursor-not-allowed' : ''}`}
                          >
                            {isAddingUser ? 'Creating...' : 'Save User'}
                          </button>
                      </div>
                  </form>
                </div>
              )}

              {/* Users Table */}
              <div className="overflow-x-auto">
                {loadingUsers ? (
                  <div className="p-8 text-center text-gray-500">Loading directory...</div>
                ) : (
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Village</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
                        <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                            {users.length === 0 ? "No users found in directory." : "No matching users found."}
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map((user) => (
                          <tr key={user.uid || Math.random().toString()} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-bold text-xs">
                                  {(user.email || '??').substring(0, 2).toUpperCase()}
                                </div>
                                <div className="ml-4">
                                  <div className="text-sm font-medium text-gray-900">{user.email || 'Unknown Email'}</div>
                                  <div className="text-xs text-gray-500">ID: {(user.uid || '').substring(0, 8)}...</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${COLOR_THEMES[VILLAGES[user.villageId]?.color as keyof typeof COLOR_THEMES]?.badgeBg || 'bg-gray-100'} ${COLOR_THEMES[VILLAGES[user.villageId]?.color as keyof typeof COLOR_THEMES]?.badgeText || 'text-gray-800'}`}>
                                {VILLAGES[user.villageId]?.name || user.villageId || 'Unknown'}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                              {/* Display specific Job Title if exists, else generic Role */}
                              {user.jobTitle ? (
                                <span className="font-medium text-gray-800">{user.jobTitle}</span>
                              ) : (
                                <span className="uppercase text-xs">{user.role || 'Unknown'}</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                              <button 
                                onClick={() => openEditModal(user)}
                                className="text-indigo-600 hover:text-indigo-900 bg-indigo-50 px-3 py-1.5 rounded hover:bg-indigo-100 transition-colors"
                              >
                                Edit
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Edit User Modal Overlay */}
              {editingUser && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden animate-fade-in-up">
                          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                              <h3 className="text-lg font-bold text-gray-900">Edit User Profile</h3>
                              <button onClick={closeEditModal} className="text-gray-400 hover:text-gray-600">
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                              </button>
                          </div>
                          <form onSubmit={handleUpdateUser} className="p-6">
                              <div className="mb-4">
                                  <label className="block text-sm font-medium text-gray-500 mb-1">User Email (Read Only)</label>
                                  <input type="text" value={editingUser.email} disabled className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-gray-500 text-sm cursor-not-allowed" />
                              </div>

                              <div className="mb-4">
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Village</label>
                                  <select 
                                      value={editVillage}
                                      onChange={(e) => {
                                          const v = e.target.value as VillageType;
                                          setEditVillage(v);
                                      }}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                  >
                                      {Object.values(VILLAGES).map(v => (
                                          <option key={v.id} value={v.id}>{v.name}</option>
                                      ))}
                                  </select>
                                  <div className="mt-2 text-xs text-gray-500">
                                      System Role: <span className="font-semibold text-gray-900">{VILLAGES[editVillage].role}</span> (Auto-assigned)
                                  </div>
                              </div>

                              <div className="mb-4">
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Job Role</label>
                                  <select 
                                      value={editJobTitle}
                                      onChange={(e) => setEditJobTitle(e.target.value)}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                  >
                                      {JOB_ROLES.map(role => (
                                          <option key={role} value={role}>{role}</option>
                                      ))}
                                  </select>
                              </div>

                              <div className="mb-6">
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Change Password</label>
                                  <input 
                                      type="text" 
                                      value={editPassword}
                                      onChange={(e) => setEditPassword(e.target.value)}
                                      placeholder="Enter new password to update"
                                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                  />
                                  <p className="mt-1 text-xs text-gray-500">Leave blank to keep current password in registry.</p>
                              </div>

                              <div className="flex justify-end gap-3">
                                  <button 
                                      type="button" 
                                      onClick={closeEditModal}
                                      className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                                  >
                                      Cancel
                                  </button>
                                  <button 
                                      type="submit" 
                                      disabled={isUpdatingUser}
                                      className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                                  >
                                      {isUpdatingUser ? 'Saving...' : 'Save Changes'}
                                  </button>
                              </div>
                          </form>
                      </div>
                  </div>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
};

export default Dashboard;