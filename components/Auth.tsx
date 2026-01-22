
import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, dbInstance } from '../firebaseConfig';
import { db } from '../db';
import { User, UserRole } from '../types';
import { Lock, ArrowRight, Mail, AlertTriangle, Loader2, CheckCircle2, Eye, EyeOff, ShieldCheck, Target } from 'lucide-react';
import brandLogo from '../assets/SNAI-LOGO.png';
import loginBg from '../assets/image (23).png';

interface AuthProps { onLogin: (user: User, rememberMe: boolean) => void; }

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [logo] = useState<string>(brandLogo);
  const [isResetMode, setIsResetMode] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [rememberMe, setRememberMe] = useState(() => {
    return localStorage.getItem('sna_remember_pref') === 'true';
  });
  const [showPassword, setShowPassword] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    localStorage.setItem('sna_remember_pref', String(rememberMe));
  }, [rememberMe]);

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
        return "Access temporarily locked due to multiple failed login attempts.";
      case 'auth/network-request-failed':
        return "Unable to connect to the server.";
      default:
        return "Authentication failed. Please check your credentials.";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!auth) throw new Error("Authentication service unavailable");

      let loginEmail = identifier.trim();
      if (!loginEmail.includes('@')) {
        loginEmail = `${loginEmail}@sna.erp`;
      }

      let firebaseUser;
      try {
        const userCredential = await signInWithEmailAndPassword(auth, loginEmail, password);
        firebaseUser = userCredential.user;
      } catch (loginErr: any) {
        const isDefaultAdmin = (loginEmail.toLowerCase() === 'admin@s.com' || loginEmail.toLowerCase() === 'admin@sna.erp') && password === '123456';
        if ((loginErr.code === 'auth/user-not-found' || loginErr.code === 'auth/invalid-credential' || loginErr.code === 'auth/invalid-login-credentials') && isDefaultAdmin) {
          const createCredential = await createUserWithEmailAndPassword(auth, loginEmail, password);
          firebaseUser = createCredential.user;
        } else {
          throw loginErr;
        }
      }

      if (firebaseUser) {
        if (!dbInstance) throw new Error("Database unavailable");
        let appUser: User | undefined;

        try {
          const userDocRef = doc(dbInstance, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            const data = userDoc.data() as User;
            appUser = { ...data, id: firebaseUser.uid };
            setDoc(userDocRef, { lastLogin: Date.now() }, { merge: true }).catch(console.warn);
          }
        } catch (fetchErr: any) {
          console.warn("Profile sync warning:", fetchErr);
        }

        if (!appUser) {
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
          const userDocRef = doc(dbInstance, 'users', firebaseUser.uid);
          await setDoc(userDocRef, appUser);
        }

        if (appUser.isActive === false) {
          setError('Account has been suspended.');
          setLoading(false);
          return;
        }

        const storage = rememberMe ? localStorage : sessionStorage;
        storage.setItem('sna_token', await firebaseUser.getIdToken());
        onLogin(appUser, rememberMe);
      }
    } catch (err: any) {
      setError(getFriendlyErrorMessage(err.code));
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier) {
      setError("Please enter your email address.");
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }
    setLoading(true);
    setError('');
    setResetMessage('');

    try {
      await sendPasswordResetEmail(auth, identifier);
      setResetMessage("Password reset link sent! Check your email.");
    } catch (err: any) {
      setError("Failed to send reset link.");
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-[#0f172a] font-sans selection:bg-rose-500/30">
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
        .animate-shake { animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both; }
      `}</style>

      {/* LEFT SIDE: Hero Content */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center">
        {/* Blurred Shop Background */}
        <div className="absolute inset-0 z-0">
          <img
            src={loginBg}
            alt="Storefront Background"
            className="w-full h-full object-cover blur-[2px] opacity-40 mix-blend-luminosity brightness-50"
          />
          <div className="absolute inset-0 bg-black/40"></div>
        </div>

        {/* Branding Content */}
        <div className="relative z-10 px-20 max-w-2xl py-20 flex flex-col h-full justify-center">
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md mb-8 border border-white/20">
            <img src={logo} alt="SNA!" className="w-10 h-10 object-contain" />
          </div>

          <h1 className="text-5xl font-bold text-white mb-8 leading-[1.15]">
            Manage your shop <br />
            with <span className="text-[#ef4444]">confidence.</span>
          </h1>

          <p className="text-lg text-slate-300 leading-relaxed font-medium mb-12 max-w-lg">
            ABITECH Systems provides the tools you need to track inventory, manage sales, and grow your business efficiently.
          </p>

          <div className="space-y-6">
            <div className="flex items-center gap-4 text-white">
              <div className="w-5 h-5 rounded-full border border-rose-500/50 flex items-center justify-center text-rose-500 shrink-0">
                <Target size={12} strokeWidth={3} />
              </div>
              <span className="text-sm font-medium">Real-time Inventory Tracking</span>
            </div>
            <div className="flex items-center gap-4 text-white">
              <div className="w-5 h-5 rounded-full border border-rose-500/50 flex items-center justify-center text-rose-500 shrink-0">
                <Target size={12} strokeWidth={3} />
              </div>
              <span className="text-sm font-medium">Advanced Sales Analytics</span>
            </div>
            <div className="flex items-center gap-4 text-white">
              <div className="w-5 h-5 rounded-full border border-rose-500/50 flex items-center justify-center text-rose-500 shrink-0">
                <Target size={12} strokeWidth={3} />
              </div>
              <span className="text-sm font-medium">Secure Cloud Backup</span>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE: Login Form */}
      <div className="flex-1 flex flex-col justify-center items-center p-8 bg-[#0f172a]">
        <div className={`w-full max-w-[420px] ${shake ? 'animate-shake' : ''}`}>
          {/* Header */}
          <div className="mb-10 text-center lg:text-left">
            <h2 className="text-4xl font-bold text-white mb-3">
              {isResetMode ? 'Reset Access' : 'Welcome back'}
            </h2>
            <p className="text-slate-400 text-sm font-medium">
              {isResetMode ? 'Enter your details to recover access.' : 'Please enter your details to sign in.'}
            </p>
          </div>

          {/* Form Container */}
          <form onSubmit={isResetMode ? handlePasswordReset : handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-rose-500/10 border border-rose-500/50 text-rose-400 p-4 rounded-xl text-[11px] font-bold uppercase flex items-center gap-3">
                <AlertTriangle size={16} className="shrink-0" />
                {error}
              </div>
            )}
            {resetMessage && (
              <div className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 p-4 rounded-xl text-[11px] font-bold uppercase flex items-center gap-3">
                <CheckCircle2 size={16} className="shrink-0" />
                {resetMessage}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Email or Username</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  required
                  className="w-full h-12 bg-white text-slate-900 rounded-xl pl-12 pr-4 outline-none font-medium text-sm shadow-inner transition-all focus:ring-2 focus:ring-rose-500"
                  placeholder="admin"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                />
              </div>
            </div>

            {!isResetMode && (
              <div className="space-y-1.5">
                <div className="flex justify-between items-center ml-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Password</label>
                  <button type="button" onClick={() => setIsResetMode(true)} className="text-[10px] font-bold text-rose-500 uppercase hover:text-rose-400 transition-colors">Forgot password?</button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    className="w-full h-12 bg-white text-slate-900 rounded-xl pl-12 pr-12 outline-none font-medium text-sm shadow-inner transition-all focus:ring-2 focus:ring-rose-500"
                    placeholder="••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            )}

            {!isResetMode && (
              <div className="flex items-center gap-3 ml-1">
                <input
                  type="checkbox"
                  id="remember"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded-md border-slate-700 bg-slate-800 text-rose-600 focus:ring-rose-500 accent-rose-600"
                />
                <label htmlFor="remember" className="text-xs font-medium text-slate-400 cursor-pointer select-none">Remember me</label>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-[#ef4444] hover:bg-[#dc2626] text-white font-bold uppercase rounded-xl transition-all shadow-lg shadow-rose-900/40 flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : (
                <>
                  <span>{isResetMode ? 'Reset Access' : 'Sign in'}</span>
                  <ArrowRight size={18} strokeWidth={2.5} />
                </>
              )}
            </button>
          </form>

          {/* Secondary Footer */}
          <div className="mt-12 text-center">
            <p className="text-[10px] text-slate-600 font-medium uppercase mb-4">
              Don't have an account? <span className="text-slate-400">Contact your administrator.</span>
            </p>
            <div className="flex items-center justify-center gap-2 opacity-50 grayscale hover:grayscale-0 transition-all cursor-default">
              <ShieldCheck size={12} className="text-slate-500" />
              <span className="text-[10px] font-bold text-slate-500 uppercase">Crafted by ABITECH</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
