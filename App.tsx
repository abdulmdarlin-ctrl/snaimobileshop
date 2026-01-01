
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
import { Database, WifiOff, RefreshCw } from 'lucide-react';
import { ToastProvider } from './components/Toast';

export type Page = 'dashboard' | 'inventory' | 'sales' | 'repairs' | 'reports' | 'expenses' | 'settings' | 'loans' | 'customers';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 1024);
  const [initialized, setInitialized] = useState(false);
  const [dbStatus, setDbStatus] = useState<'live' | 'mock'>('live');

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
      try {
        await seedInitialData();
        setDbStatus(db.getStatus());
        await fetchSettings();

        const savedUser = localStorage.getItem('sna_user');
        if (savedUser) {
          try {
            const u = JSON.parse(savedUser);
            setUser(u);
            if (u.role === UserRole.CASHIER) {
              setCurrentPage('sales');
            }
          } catch (e) {
            console.error("Invalid session", e);
            localStorage.removeItem('sna_user');
          }
        }
      } finally {
        setInitialized(true);
      }
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

  if (!initialized) return <div className="h-screen flex items-center justify-center bg-[#1a1c2c] text-white animate-pulse"><Database size={48} /></div>;
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
