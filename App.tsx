
import React, { useState, useEffect } from 'react';
// Fix: Separate named imports for modular auth functions and type User
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './services/firebase';
import { VillageType, UserProfile } from './types';
import { VILLAGES } from './constants';
import VillageSelector from './components/VillageSelector';
import { Dashboard } from './components/Dashboard';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Auth State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedVillage, setSelectedVillage] = useState<VillageType>(VillageType.A);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  // Admin State
  const [isAdmin, setIsAdmin] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    // Fix: Correct usage of modular onAuthStateChanged with auth instance as the first argument
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!isLoggingIn) {
        if (currentUser) {
          try {
            // Fetch User Profile from Firestore to check Role and Validity
            const userDocRef = doc(db, 'users', currentUser.uid);
            const userSnap = await getDoc(userDocRef);
            
            if (userSnap.exists()) {
                const profile = userSnap.data() as UserProfile;
                setIsAdmin(profile.role === 'admin');
                setUserProfile(profile);
                setUser(currentUser);
            } else {
                console.warn("User authenticated but no profile found.");
                setUser(null);
                setIsAdmin(false);
            }
          } catch (error) {
            console.error("Error fetching user profile:", error);
            setIsAdmin(false);
          }
        } else {
          setIsAdmin(false);
          setUserProfile(null);
          setUser(null);
          // Clear inputs on logout/session end
          setEmail('');
          setPassword('');
        }
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [isLoggingIn]); 

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsLoggingIn(true);
    
    // Password Validation: 6 chars minimum + at least one numeric character
    if (password.length < 6 || !/\d/.test(password)) {
      setAuthError("Password must be at least 6 characters and include a number.");
      setIsLoggingIn(false);
      return;
    }
    
    try {
      // 1. Attempt Sign In
      // Fix: Modular signInWithEmailAndPassword expects auth as the first argument
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const currentUser = userCredential.user;

      // 2. Check Firestore Profile
      const userDocRef = doc(db, "users", currentUser.uid);
      let userDocSnap;
      try {
        userDocSnap = await getDoc(userDocRef);
      } catch (err) {
        console.error("Error reading profile:", err);
      }

      if (!userDocSnap || !userDocSnap.exists()) {
          // AUTO-RECOVERY: Create missing profile
          console.log("Profile missing. Attempting auto-creation...");
          
          const timestamp = new Date().toISOString();
          const baseProfile: UserProfile = {
              uid: currentUser.uid,
              name: currentUser.displayName || 'System User',
              email: currentUser.email || email,
              jobTitle: 'Unassigned',
              role: 'admin', // Try Admin first
              villageId: selectedVillage,
              createdAt: timestamp,
              staffId: 'TEMP-' + Math.floor(Math.random() * 1000)
          };

          try {
              // Attempt 1: Create as Admin
              await setDoc(userDocRef, baseProfile);
              setUserProfile(baseProfile);
              setIsAdmin(true);
          } catch (adminError) {
              console.warn("Could not create Admin profile (likely permission issues). Retrying as User...", adminError);
              
              try {
                  // Attempt 2: Create as standard User
                  const userProfileFallback = { ...baseProfile, role: 'user' as const };
                  await setDoc(userDocRef, userProfileFallback);
                  setUserProfile(userProfileFallback);
                  setIsAdmin(false);
              } catch (userError) {
                  console.error("Critical: Could not create any profile in Firestore.", userError);
                  // Attempt 3: In-Memory Fallback (Login allowed, but no persistence)
                  const memoryProfile = { ...baseProfile, role: 'user' as const, note: 'Temporary Session' };
                  setUserProfile(memoryProfile);
                  setIsAdmin(false);
              }
          }
          
          setUser(currentUser);
          setIsLoggingIn(false);
          return;
      }

      const userData = userDocSnap.data() as UserProfile;

      // 3. Auto-correct Village Selection
      if (userData.villageId && userData.villageId !== selectedVillage && userData.role !== 'admin') {
          console.log(`Auto-switching village from ${selectedVillage} to ${userData.villageId}`);
          setSelectedVillage(userData.villageId);
      }

      // Success
      setIsAdmin(userData.role === 'admin');
      setUserProfile(userData);
      setUser(currentUser);

    } catch (error: any) {
      console.error(error);
      let message = "Authentication failed. Please check your credentials.";
      const errorCode = error.code;
      
      if (errorCode === 'auth/user-not-found' || errorCode === 'auth/invalid-email') {
          message = "Account not found. Please contact your village administrator.";
      } else if (errorCode === 'auth/wrong-password') {
          message = "Invalid password.";
      } else if (errorCode === 'auth/invalid-credential' || errorCode === 'auth/invalid-login-credentials') {
          // Handles newer Firebase errors where user/pass errors are unified
          message = "Invalid credentials. Please check your email and password.";
      } else if (errorCode === 'auth/too-many-requests') {
          message = "Too many failed attempts. Please try again later.";
      } else if (errorCode === 'auth/weak-password') {
          message = "Password should be at least 6 characters.";
      } else if (error.message === 'profile-not-found') {
          message = "Access Denied: No profile found.";
      }
      
      setAuthError(message);
      setUser(null);
      // Only clear password on failure to allow user to correct typo
      setPassword('');
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen min-h-[100dvh] flex items-center justify-center bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
      </div>
    );
  }

  // Authenticated View
  if (user && !isLoggingIn && userProfile) {
    return (
      <Dashboard 
        villageId={selectedVillage} 
        userEmail={user.email || 'User'} 
        userName={userProfile.name}
        userRole={userProfile.role}
        isAdmin={isAdmin}
        staffId={userProfile.staffId || 'N/A'}
      />
    );
  }

  // Login View
  const activeVillage = VILLAGES[selectedVillage];
  const themeColor = activeVillage.color; 
  
  let btnColorClass = "";
  if (themeColor === 'green') {
    btnColorClass = 'bg-green-500 hover:bg-green-600 text-white';
  } else if (themeColor === 'blue') {
    btnColorClass = 'bg-blue-600 hover:bg-blue-700 text-white';
  } else {
    btnColorClass = 'bg-slate-800 hover:bg-slate-900 text-white';
  }

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col justify-center py-6 sm:py-12 sm:px-6 lg:px-8 relative overflow-hidden font-sans">
      
      {/* Background */}
      <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1623164227084-297f62086c8f?q=80&w=2669&auto=format&fit=crop')] bg-cover bg-center"></div>
          <div className="absolute inset-0 bg-green-950/80 bg-gradient-to-b from-green-900/50 to-slate-950/90 backdrop-blur-[2px]"></div>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 animate-fade-in-up">
        <div className="text-center mb-8">
          <div className="mx-auto h-20 w-20 flex items-center justify-center rounded-full bg-white/10 backdrop-blur-md border border-white/20 shadow-xl mb-6">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L15 8H9L12 2Z" fill="currentColor" opacity="0.9" />
                <path d="M12 10C13.6569 10 15 11.3431 15 13H9C9 11.3431 10.3431 10 12 10Z" fill="currentColor" />
                <rect x="11" y="13" width="2" height="4" fill="currentColor" />
                <path d="M6 12C7.10457 12 8 12.8954 8 14H4C4 12.8954 4.89543 12 6 12Z" fill="currentColor" opacity="0.8"/>
                <rect x="5" y="14" width="2" height="2" fill="currentColor" opacity="0.8"/>
                <path d="M18 12C19.1046 12 20 12.8954 20 14H16C16 12.8954 16.8954 12 18 12Z" fill="currentColor" opacity="0.8"/>
                <rect x="17" y="14" width="2" height="2" fill="currentColor" opacity="0.8"/>
             </svg>
          </div>
          <h2 className="text-3xl font-extrabold text-white drop-shadow-md tracking-tight mb-2">
            Mushroom Village System
          </h2>
          <p className="text-sm text-green-100/80 font-medium">
            Select your village
          </p>
        </div>
      </div>

      {/* Login Card */}
      <div className="mt-2 sm:mx-auto sm:w-full sm:max-w-lg relative z-10">
        <div className="bg-white py-8 px-4 shadow-2xl rounded-3xl sm:px-10 mx-4">
          
          <VillageSelector 
            selected={selectedVillage} 
            onSelect={setSelectedVillage} 
          />

          <form className="space-y-5" onSubmit={handleAuth}>
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-1">
                Email
              </label>
              <div className="relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-gray-400 sm:text-sm">@</span>
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setAuthError(null); }}
                  className="block w-full pl-10 pr-3 py-3 border border-transparent rounded-lg leading-5 bg-slate-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 sm:text-sm transition duration-150 ease-in-out"
                  placeholder="name@gmail.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-1">
                Password
              </label>
              <div className="relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setAuthError(null); }}
                  className="block w-full pl-10 pr-10 py-3 border border-transparent rounded-lg leading-5 bg-slate-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 sm:text-sm transition duration-150 ease-in-out"
                  placeholder="●●●●●●●●●●●"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-200 focus:outline-none"
                >
                  {showPassword ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268-2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268-2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {authError && (
              <div className="rounded-lg bg-red-50 p-3 border border-red-100">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-red-800">{authError}</p>
                  </div>
                </div>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={isLoggingIn}
                className={`w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-md text-sm font-bold text-white ${btnColorClass} focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all duration-200 transform hover:scale-[1.01] active:scale-[0.99]`}
              >
                {isLoggingIn ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing...
                  </span>
                ) : (
                  <span className="flex items-center">
                    Enter {activeVillage.name}
                    <svg className="ml-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </span>
                )}
              </button>
            </div>
          </form>

          <div className="mt-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-3 bg-white text-gray-400 uppercase tracking-widest text-[10px] font-semibold">
                  System Access Only
                </span>
              </div>
            </div>
            
            <div className="mt-6 text-center">
               <p className="text-xs text-gray-400 max-w-xs mx-auto leading-relaxed">
                 Contact management if you have forgotten your password.
               </p>
               <div className="flex justify-center mt-4 space-x-2">
                   <div className="h-1.5 w-1.5 rounded-full bg-gray-200"></div>
                   <div className="h-1.5 w-1.5 rounded-full bg-gray-300"></div>
                   <div className="h-1.5 w-1.5 rounded-full bg-gray-200"></div>
               </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Footer Version Info */}
      <div className="absolute bottom-4 left-0 right-0 text-center z-10">
          <p className="text-[10px] text-white/30">© 2025 Mushroom Village Systems v2.5.0</p>
      </div>
    </div>
  );
}

export default App;
