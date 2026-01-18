
import React, { useState, useEffect } from 'react';
import { seedInitialData, db, safeStringify } from './db';
import { User, UserRole, AppSettings } from './types';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import POS from './components/POS';
import Repairs from './components/Repairs';
import Reports from './components/Reports';
import Settings from './components/Settings';
import Expenses from './components/Expenses';
import Loans from './components/Loans';
import Customers from './components/Customers';
import Auth from './components/Auth';
import { Database, WifiOff, RefreshCw, Loader2 } from 'lucide-react';
import brandLogo from './assets/SNAI-LOGO.png';
import { ToastProvider } from './components/Toast';

export type Page = 'dashboard' | 'inventory' | 'sales' | 'repairs' | 'reports' | 'expenses' | 'settings' | 'loans' | 'customers';

const App: React.FC = () => {
  // Initialize user from localStorage immediately to prevent login flash
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('sna_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Invalid session", e);
        localStorage.removeItem('sna_user');
      }
    }
    return null;
  });

  const [settings, setSettings] = useState<AppSettings | null>(null);

  // Initialize page based on user role immediately
  const [currentPage, setCurrentPage] = useState<Page>(() => {
    return (user && user.role === UserRole.CASHIER) ? 'sales' : 'dashboard';
  });

  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 1024);
  const [dbStatus, setDbStatus] = useState<'live' | 'mock'>('live');
  const [isSystemLoading, setIsSystemLoading] = useState(true);

  const fetchSettings = async () => {
    const s = await db.settings.toCollection().first();
    if (s) {
      setSettings(s);
      if (s.themeColor) {
        document.documentElement.style.setProperty('--sna-primary', s.themeColor);
      }
    }
  };

  useEffect(() => {
    const init = async () => {
      const minLoad = new Promise(resolve => setTimeout(resolve, 2500));
      const boot = async () => {
        try {
          await seedInitialData();
          setDbStatus(db.getStatus());
          await fetchSettings();
        } catch (e) {
          console.error("Initialization error", e);
        }
      };
      await Promise.all([minLoad, boot()]);
      setIsSystemLoading(false);
    };
    init();

    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsSidebarOpen(true);
      } else {
        setIsSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogin = (u: User) => {
    setUser(u);
    // Use safeStringify to prevent circular reference errors if User object contains Firestore/DOM refs
    localStorage.setItem('sna_user', safeStringify(u));
    if (u.role === UserRole.CASHIER) {
      setCurrentPage('sales');
    } else {
      setCurrentPage('dashboard');
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('sna_user');
    localStorage.removeItem('sna_token');
    setCurrentPage('dashboard');
  };

  if (isSystemLoading) {
    return (
      <div className="fixed inset-0 bg-[#0f111a] flex flex-col items-center justify-center z-[100] overflow-hidden font-sans select-none">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_at_center,black,transparent_80%)]"></div>

        <div className="relative z-10 flex flex-col items-center animate-in fade-in zoom-in duration-700">
          <div className="relative mb-10">
            <div className="absolute inset-0 bg-rose-500/20 blur-3xl rounded-full"></div>
            <div className="w-32 h-32 bg-[#13151f] border border-white/10 rounded-[2.5rem] flex items-center justify-center shadow-2xl relative z-10">
              <img src={brandLogo} alt="SNA Logo" className="w-16 h-16 object-contain" />
            </div>
            {/* Spinner Ring */}
            <div className="absolute -inset-4 border border-white/5 rounded-[3rem]"></div>
            <div className="absolute -inset-4 border-t border-rose-500/50 border-r-rose-500/50 rounded-[3rem] animate-spin"></div>
          </div>

          <h1 className="text-3xl font-bold text-white tracking-tight mb-2">SNA! MOBILE SHOP</h1>
          <p className="text-slate-500 text-[10px] font-bold tracking-[0.3em] uppercase animate-pulse">System Initializing</p>
        </div>
        <div className="absolute bottom-10 text-center">
          <p className="text-[10px] font-bold text-slate-700 tracking-[0.2em]">Crafted by ABiTECH</p>
        </div>
      </div>
    );
  }

  if (!user) return <Auth onLogin={handleLogin} />;

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <Dashboard onNavigate={setCurrentPage} />;
      case 'inventory': return <Inventory user={user} />;
      case 'sales': return <POS user={user} />;
      case 'loans': return <Loans user={user} />;
      case 'repairs': return <Repairs user={user} />;
      case 'reports': return <Reports />;
      case 'expenses': return <Expenses user={user} />;
      case 'customers': return <Customers user={user} />;
      case 'settings': return <Settings user={user} onNavigate={setCurrentPage} onSettingsChange={fetchSettings} />;
      default: return <Dashboard onNavigate={setCurrentPage} />;
    }
  };

  return (
    <ToastProvider>
      <div className="flex h-screen bg-[#f4f7fe] overflow-hidden">
        {/* Mobile Backdrop */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        <Sidebar
          user={user}
          currentPage={currentPage}
          setCurrentPage={(page) => { setCurrentPage(page); if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
          isOpen={isSidebarOpen}
          toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          settings={settings}
        />

        <div className="flex-1 flex flex-col min-w-0 h-full relative">
          <Topbar
            user={user}
            onLogout={handleLogout}
            onNavigate={setCurrentPage}
            currentPage={currentPage}
            onMenuToggle={() => setIsSidebarOpen(!isSidebarOpen)}
            settings={settings}
          />
          <main className="flex-1 overflow-y-auto p-4 lg:p-10 scrollbar-hide">
            <div className="max-w-[1600px] mx-auto w-full h-full">{renderPage()}</div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
};

export default App;
