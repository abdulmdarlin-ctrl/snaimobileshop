
import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, dbInstance } from '../firebaseConfig';
import { db } from '../db';
import { User, UserRole } from '../types';
import { Lock, User as UserIcon, ArrowRight, Layers, ShieldCheck, Mail, AlertTriangle } from 'lucide-react';

interface AuthProps { onLogin: (user: User) => void; }

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [identifier, setIdentifier] = useState(''); // Can be email or username
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [logo, setLogo] = useState<string | null>(null);

  useEffect(() => {
    const fetchBrand = async () => {
      try {
        const settings = await db.settings.toCollection().first();
        if (settings?.logo) {
          setLogo(settings.logo);
        }
      } catch (e) {
        console.error("Failed to load brand assets", e);
      }
    };
    fetchBrand();
  }, []);

  const getFriendlyErrorMessage = (errorCode: string) => {
    switch (errorCode) {
      case 'auth/user-not-found':
      case 'auth/invalid-email':
        return "Account not found. If you use a username, ensure it's correct.";
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
      case 'auth/invalid-login-credentials':
        return "Invalid username or password combination.";
      case 'auth/too-many-requests':
        return "Access temporarily locked due to multiple failed login attempts. Please try again later.";
      case 'auth/network-request-failed':
        return "Unable to connect to the server. Please check your internet connection.";
      case 'auth/user-disabled':
        return "This account has been disabled. Please contact the system administrator.";
      default:
        return "Authentication failed. Please verify your connection and credentials.";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!auth) throw new Error("Authentication service unavailable");

      // Construct Login Email
      // If user types 'john', we convert to 'john@sna.erp' to satisfy Firebase Auth
      let loginEmail = identifier.trim();
      if (!loginEmail.includes('@')) {
         loginEmail = `${loginEmail}@sna.erp`;
      }

      let firebaseUser;
      try {
        // Attempt Login
        const userCredential = await signInWithEmailAndPassword(auth, loginEmail, password);
        firebaseUser = userCredential.user;
      } catch (loginErr: any) {
        // Handle Rate Limiting immediately
        if (loginErr.code === 'auth/too-many-requests') {
           throw loginErr;
        }

        // Auto-provision Admin if not found (Convenience for first run)
        // Checks against hardcoded admin fallback
        const isDefaultAdmin = (loginEmail.toLowerCase() === 'admin@s.com' || loginEmail.toLowerCase() === 'admin@sna.erp') && password === '123456';
        
        if (
          (loginErr.code === 'auth/user-not-found' || loginErr.code === 'auth/invalid-credential' || loginErr.code === 'auth/invalid-login-credentials') && 
          isDefaultAdmin
        ) {
           console.log("Auto-provisioning Admin Account...");
           const createCredential = await createUserWithEmailAndPassword(auth, loginEmail, password);
           firebaseUser = createCredential.user;
        } else {
           throw loginErr;
        }
      }

      if (firebaseUser) {
        // Sync with Firestore User Profile
        if (!dbInstance) throw new Error("Database unavailable");
        
        let appUser: User | undefined;
        
        try {
            const userDocRef = doc(dbInstance, 'users', firebaseUser.uid);
            const userDoc = await getDoc(userDocRef);
            
            if (userDoc.exists()) {
               // Existing User
               const data = userDoc.data() as User;
               appUser = { ...data, id: firebaseUser.uid };
               
               // Update last login (Fire and forget)
               setDoc(userDocRef, { lastLogin: Date.now() }, { merge: true }).catch(console.warn);
            }
        } catch (fetchErr: any) {
            console.warn("Profile sync warning:", fetchErr);
        }

        if (!appUser) {
           // Fallback: Create profile if auth exists but firestore doc missing
           // Or if this is the auto-provisioned admin
           const isSpecificAdmin = loginEmail.includes('admin');
           
           appUser = {
             id: firebaseUser.uid,
             username: identifier.includes('@') ? identifier.split('@')[0] : identifier,
             fullName: isSpecificAdmin ? 'System Administrator' : 'User',
             role: isSpecificAdmin ? UserRole.ADMIN : UserRole.CASHIER,
             isActive: true,
             lastLogin: Date.now(),
             phone: ''
           };
           
           try {
              const userDocRef = doc(dbInstance, 'users', firebaseUser.uid);
              await setDoc(userDocRef, appUser);
           } catch (createErr) {
              console.error("Failed to create user profile remotely:", createErr);
           }
        }

        if (appUser.isActive === false) {
           setError('Account has been suspended. Please contact support.');
           setLoading(false);
           return;
        }

        // Session Token
        localStorage.setItem('sna_token', await firebaseUser.getIdToken());
        onLogin(appUser);
      }

    } catch (err: any) {
      console.error("Auth Error:", err);
      let msg = "Login failed.";
      if (err.code) {
        msg = getFriendlyErrorMessage(err.code);
      } else if (err.message) {
        msg = err.message;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const autoFill = () => {
    setIdentifier('admin');
    setPassword('123456');
  };

  return (
    <div className="min-h-screen w-full flex bg-[#1a1c2c] overflow-hidden font-sans">
      <div className="absolute top-0 right-0 w-[1000px] h-[1000px] bg-orange-500/10 rounded-full blur-[140px] -translate-y-1/2 translate-x-1/3"></div>
      <div className="absolute bottom-0 left-0 w-[800px] h-[800px] bg-indigo-500/10 rounded-full blur-[120px] translate-y-1/3 -translate-x-1/3"></div>

      <div className="flex-1 flex flex-col justify-center items-center p-8 z-10">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center space-y-6">
            <div className={`w-24 h-24 rounded-[2.2rem] flex items-center justify-center mx-auto shadow-2xl shadow-orange-500/30 overflow-hidden ${logo ? 'bg-white' : 'bg-orange-600'}`}>
               {logo ? (
                 <img src={logo} alt="Logo" className="w-full h-full object-contain p-2" />
               ) : (
                 <Layers size={32} className="text-white" strokeWidth={3} />
               )}
            </div>
            <div>
               <h1 className="text-3xl font-bold text-white tracking-tight leading-none">SNA! MOBILE SHOP</h1>
               <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[4px] mt-3">Business Management System</p>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 p-8 sm:p-10 rounded-[3rem] shadow-2xl space-y-8 backdrop-blur-sm">
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-2xl text-[10px] font-bold uppercase text-center animate-in flex items-center justify-center gap-2">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span className="leading-tight">{error}</span>
                </div>
              )}

              <div className="space-y-3">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Username / Email</label>
                <div className="relative">
                  <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={18}/>
                  <input 
                    type="text" 
                    required 
                    autoFocus 
                    className="w-full bg-white/5 border border-white/10 text-white rounded-2xl py-4 pl-14 pr-6 focus:ring-4 focus:ring-orange-500/20 outline-none transition-all placeholder:text-slate-600 font-bold text-sm" 
                    placeholder="e.g. admin or john@email.com" 
                    value={identifier} 
                    onChange={e => setIdentifier(e.target.value)} 
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Secure Key</label>
                <div className="relative">
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={18}/>
                  <input 
                    type="password" 
                    required 
                    className="w-full bg-white/5 border border-white/10 text-white rounded-2xl py-4 pl-14 pr-6 focus:ring-4 focus:ring-orange-500/20 outline-none transition-all placeholder:text-slate-600 font-bold text-sm" 
                    placeholder="••••••••" 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                  />
                </div>
              </div>

              <button type="submit" disabled={loading} className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-5 rounded-2xl transition-all shadow-xl flex items-center justify-center space-x-3 group uppercase text-[10px] tracking-[3px] disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/30 border-t-white"></div> : <><span>Authenticate</span><ArrowRight size={18} strokeWidth={3} className="group-hover:translate-x-2 transition-transform" /></>}
              </button>
            </form>

            <div className="pt-6 border-t border-white/5">
              <div 
                onClick={autoFill}
                className="bg-indigo-500/5 border border-indigo-500/10 rounded-2xl p-5 space-y-3 cursor-pointer hover:bg-indigo-500/10 transition-colors group"
              >
                <div className="flex items-center gap-2 text-indigo-400">
                  <ShieldCheck size={14} />
                  <span className="text-[9px] font-bold uppercase tracking-widest">Admin Credentials</span>
                </div>
                <div className="text-[11px] text-white/80 font-mono">
                  <p>User: <span className="text-white font-bold">admin</span></p>
                  <p>Pass: <span className="text-white font-bold">123456</span></p>
                </div>
                <p className="text-[9px] text-slate-500 group-hover:text-indigo-400 transition-colors text-center mt-2">Tap to Auto-fill</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="hidden lg:flex flex-1 relative bg-[#151726] items-center justify-center overflow-hidden">
        <div className="relative z-10 text-center space-y-8 max-w-md p-12">
          <div className="inline-flex p-8 bg-white/5 rounded-[3rem] mb-4 border border-white/10 shadow-2xl"><UserIcon size={100} className="text-orange-600 opacity-60" strokeWidth={1} /></div>
          <h2 className="text-3xl font-bold text-white tracking-tight uppercase leading-tight">Firebase Secured ERP</h2>
          <p className="text-slate-400 font-bold text-sm">Cloud-synchronized inventory and sales management for the modern enterprise.</p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
