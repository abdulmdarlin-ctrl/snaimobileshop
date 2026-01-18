
import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, dbInstance } from '../firebaseConfig';
import { db } from '../db';
import { User, UserRole } from '../types';
import { Lock, ArrowRight, Mail, AlertTriangle, Loader2, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import brandLogo from '../assets/SNAI-LOGO.png';
import loginBg from '../assets/image (23).png';

interface AuthProps { onLogin: (user: User, rememberMe: boolean) => void; }

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [identifier, setIdentifier] = useState(''); // Can be email or username
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

  const getPasswordStrength = (pwd: string) => {
    if (!pwd) return 0;
    let score = 0;
    if (pwd.length > 6) score++;
    if (pwd.length > 10) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    return score;
  };

  const strength = getPasswordStrength(password);

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
        const storage = rememberMe ? localStorage : sessionStorage;
        storage.setItem('sna_token', await firebaseUser.getIdToken());
        onLogin(appUser, rememberMe);
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
      console.error("Reset Error:", err);
      setError(getFriendlyErrorMessage(err.code) || "Failed to send reset link.");
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-[#0f111a] font-sans text-slate-200 selection:bg-rose-500/30">
      {loading && <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-rose-600 via-rose-400 to-rose-600 animate-pulse z-50"></div>}

      {/* Left Side - Visuals */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden bg-[#0b0d14] items-center justify-center border-r border-white/5">
        <div className="absolute inset-0 z-0">
          <img src={loginBg} alt="Background" className="w-full h-full object-cover scale-150 blur-sm" loading="eager" />
          <div className="absolute inset-0 bg-black/80"></div>
        </div>

        <div className="relative z-10 p-16 max-w-xl">
          {/* Logo Display */}
          <div className="mb-12">
            <div className="w-24 h-24 bg-gradient-to-br from-rose-500/10 to-rose-500/5 rounded-3xl border border-rose-500/20 flex items-center justify-center backdrop-blur-sm mb-8 shadow-2xl shadow-rose-500/10">
              <img src={logo} alt="Logo" className="w-16 h-16 object-contain" />
            </div>
            <h1 className="text-5xl font-bold text-white tracking-tight mb-6 leading-tight drop-shadow-lg">
              Manage your shop with <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-orange-400">confidence.</span>
            </h1>
            <p className="text-lg text-slate-300 leading-relaxed drop-shadow-md">
              ABiTECH Systems provides the tools you need to track inventory, manage sales, and grow your business efficiently.
            </p>
          </div>

          {/* Feature List */}
          <div className="space-y-4">
            {[
              'Real-time Inventory Tracking',
              'Advanced Sales Analytics',
              'Secure Cloud Backup'
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-slate-300">
                <div className="w-6 h-6 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500">
                  <CheckCircle2 size={14} />
                </div>
                <span className="text-sm font-medium">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 lg:p-24 bg-[#0f111a] relative">
        {/* Mobile Logo */}
        <div className="lg:hidden mb-8">
          <img src={logo} alt="Logo" className="w-16 h-16 object-contain" />
        </div>

        <div className={`w-full max-w-[400px] space-y-8 ${shake ? 'animate-shake' : ''}`}>
          <style>{`
            @keyframes shake {
              0%, 100% { transform: translateX(0); }
              10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
              20%, 40%, 60%, 80% { transform: translateX(4px); }
            }
            .animate-shake {
              animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both;
            }
          `}</style>
          <div className="text-center lg:text-left">
            <h2 className="text-3xl font-bold text-white tracking-tight">
              {isResetMode ? 'Reset Password' : 'Welcome back'}
            </h2>
            <p className="text-slate-400 mt-2 text-sm">
              {isResetMode ? 'Enter your email to receive a reset link.' : 'Please enter your details to sign in.'}
            </p>
          </div>

          <form onSubmit={isResetMode ? handlePasswordReset : handleSubmit} className="space-y-6">
            {/* Error Alert */}
            {error && (
              <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-sm flex items-start gap-3">
                <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}
            {resetMessage && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl text-sm flex items-start gap-3">
                <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
                <span className="leading-relaxed">{resetMessage}</span>
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 ml-1">{isResetMode ? 'Email Address' : 'Email or Username'}</label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-rose-500 transition-colors" size={18} />
                  <input
                    type="text"
                    required
                    autoFocus
                    className="w-full bg-white/5 border border-white/10 text-white rounded-xl py-3.5 pl-11 pr-4 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500/50 outline-none transition-all placeholder:text-slate-600 text-sm font-medium"
                    placeholder={isResetMode ? "Enter your email" : "Enter your identifier"}
                    value={identifier}
                    onChange={e => setIdentifier(e.target.value)}
                  />
                </div>
              </div>

              {!isResetMode && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center ml-1">
                    <label className="text-xs font-semibold text-slate-400">Password</label>
                    <button type="button" onClick={() => { setIsResetMode(true); setError(''); setResetMessage(''); }} className="text-xs font-medium text-rose-400 hover:text-rose-300 transition-colors">Forgot password?</button>
                  </div>
                  <div className="relative group">
                    <Lock className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${!password ? "text-slate-500 group-focus-within:text-rose-500" : strength <= 2 ? "text-slate-500 group-focus-within:text-rose-500" : strength <= 3 ? "text-slate-500 group-focus-within:text-amber-500" : "text-slate-500 group-focus-within:text-emerald-500"}`} size={18} />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      className={`w-full bg-white/5 border text-white rounded-xl py-3.5 pl-11 pr-10 focus:ring-2 outline-none transition-all placeholder:text-slate-600 text-sm font-medium ${!password ? "border-white/10 focus:ring-rose-500/20 focus:border-rose-500/50" : strength <= 2 ? "border-rose-500/50 focus:ring-rose-500/20 focus:border-rose-500" : strength <= 3 ? "border-amber-500/50 focus:ring-amber-500/20 focus:border-amber-500" : "border-emerald-500/50 focus:ring-emerald-500/20 focus:border-emerald-500"}`}
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    {loading ? (
                      <Loader2 size={16} className="animate-spin text-rose-600" />
                    ) : (
                      <input
                        type="checkbox"
                        id="remember-me"
                        checked={rememberMe}
                        onChange={e => setRememberMe(e.target.checked)}
                        className="w-4 h-4 rounded border-white/10 bg-white/5 text-rose-600 focus:ring-rose-500/20 focus:ring-offset-0 cursor-pointer accent-rose-600"
                      />
                    )}
                    <label htmlFor="remember-me" className={`text-xs text-slate-400 select-none ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:text-slate-300'}`}>
                      Remember me
                    </label>
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-rose-600/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : (isResetMode ? <span>Send Reset Link</span> : <><span>Sign in</span><ArrowRight size={18} /></>)}
            </button>

            {isResetMode && (
              <button
                type="button"
                onClick={() => { setIsResetMode(false); setError(''); setResetMessage(''); }}
                className="w-full text-slate-400 text-sm font-medium hover:text-white transition-colors"
              >
                Back to Login
              </button>
            )}
          </form>

          <div className="pt-6 text-center border-t border-white/5">
            {!isResetMode && (
              <p className="text-xs text-slate-500">
                Don't have an account? <span className="text-slate-400">Contact your administrator.</span>
              </p>
            )}
            <p className="mt-8 text-[10px] font-bold text-slate-500 tracking-[0.2em] opacity-0 animate-in" style={{ animationDelay: '1s', animationFillMode: 'forwards', animationDuration: '0.7s' }}>
              Crafted by ABiTECH
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
