
import React, { useState, useRef, useEffect } from 'react';
import { Bell, LogOut, Settings, ChevronDown, Menu, Database, WifiOff, RefreshCw, AlertTriangle, PackageX, Globe, User as UserIcon, Sun, Moon, Sunrise, Sunset, CalendarDays, Sparkles, Clock, Search } from 'lucide-react';
import { User, Product } from '../types';
import { Page } from '../App';
import { db } from '../db';

interface TopbarProps {
  user: User;
  onLogout: () => void;
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onMenuToggle: () => void;
}

const Topbar: React.FC<TopbarProps> = ({ user, onLogout, onNavigate, onMenuToggle, currentPage }) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [lowStockItems, setLowStockItems] = useState<Product[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  const [dbStatus, setDbStatus] = useState<'live' | 'mock'>('live');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const fetchMeta = async () => {
    setIsRefreshing(true);
    try {
      const products = await db.products.toArray();
      const lowStock = products.filter(p => p.stockQuantity <= p.reorderLevel);
      setLowStockCount(lowStock.length);
      setLowStockItems(lowStock);
      setDbStatus(db.getStatus() as any);
    } catch (e) {
      setDbStatus('mock');
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  useEffect(() => {
    fetchMeta();
    const interval = setInterval(fetchMeta, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const [greeting, setGreeting] = useState('');


  useEffect(() => {
    const updateGreeting = () => {
      const h = new Date().getHours();
      setGreeting(h < 12 ? 'Good Morning' : h < 18 ? 'Good Afternoon' : 'Good Evening');
    };
    updateGreeting();

    const interval = setInterval(updateGreeting, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };

    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsProfileOpen(false);
        setIsNotificationsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleGlobalShortcuts);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleGlobalShortcuts);
    };
  }, []);

  return (
    <header className="h-20 bg-white/80 backdrop-blur-xl flex items-center justify-between px-4 lg:px-8 z-40 shrink-0 border-b border-slate-200/60 sticky top-0 w-full transition-all duration-300 shadow-sm">

      {/* Left Section: Menu Toggle (Mobile Only) */}
      <div className="flex items-center gap-3 lg:gap-5">
        <button
          onClick={onMenuToggle}
          className="p-2.5 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors lg:hidden"
        >
          <Menu size={22} strokeWidth={2} />
        </button>
      </div>

      {/* Center Section: Page Title & Search (Migrated from Dashboard) */}
      <div className="flex-1 px-4 lg:px-8 flex items-center justify-between gap-8">
        <h1 className="text-xl font-bold text-slate-900 capitalize hidden md:block">
          {currentPage === 'sales' ? 'Point of Sale' : currentPage}
        </h1>

        <div className="flex-1 max-w-lg relative group">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={18} className="text-slate-400 group-focus-within:text-blue-500 transition-colors" />
          </div>
          <input
            type="text"
            placeholder="Search projects, sales, repairs..."
            className="w-full bg-slate-50 border-none rounded-full py-2.5 pl-10 pr-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all shadow-sm group-hover:bg-white"
          />
        </div>
      </div>

      {/* Right Section: Actions & Profile */}
      <div className="flex items-center gap-2 sm:gap-4">

        {/* Clock - Minimal */}
        <div className="hidden lg:flex flex-col items-end mr-2">
          <span className="text-xs font-bold text-slate-500">
            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className={`p-2.5 rounded-xl transition-all relative group ${isNotificationsOpen ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
          >
            <Bell size={20} strokeWidth={2} />
            {lowStockCount > 0 && (
              <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-white"></span>
            )}
          </button>

          {isNotificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden animate-in z-50">
              <div className="p-4 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                <span className="text-[10px] text-slate-500 uppercase">Notifications</span>
                {lowStockCount > 0 && <span className="text-[9px] font-bold text-white bg-orange-600 px-2 py-0.5 rounded-full">{lowStockCount} Alerts</span>}
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                {lowStockItems.length > 0 ? (
                  <div className="divide-y divide-slate-50">
                    {lowStockItems.map(item => (
                      <div key={item.id} onClick={() => { onNavigate('inventory'); setIsNotificationsOpen(false); }} className="p-4 hover:bg-slate-50 cursor-pointer transition-colors group">
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-lg shrink-0 ${item.stockQuantity === 0 ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'}`}>
                            {item.stockQuantity === 0 ? <PackageX size={16} /> : <AlertTriangle size={16} />}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-800 group-hover:text-orange-600 transition-colors">{item.name}</p>
                            <p className="text-[10px] text-slate-400 mt-1 font-medium">
                              Stock: <span className={item.stockQuantity === 0 ? 'text-red-600 font-bold' : 'text-orange-600 font-bold'}>{item.stockQuantity}</span>
                              <span className="mx-1">•</span>
                              Reorder: {item.reorderLevel}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center flex flex-col items-center">
                    <div className="w-10 h-10 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-3">
                      <Database size={18} />
                    </div>
                    <p className="text-xs font-bold text-slate-900">All Systems Nominal</p>
                    <p className="text-[10px] text-slate-400 mt-1">Inventory levels are healthy.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="h-8 w-px bg-slate-100 mx-1 hidden sm:block"></div>

        {/* Profile Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center gap-3 p-1.5 pr-3 rounded-xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100"
          >
            <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden border border-slate-200 shadow-sm">
              <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} alt="av" className="w-full h-full object-cover" />
            </div>
            <div className="hidden sm:flex flex-col items-start">
              <p className="text-xs font-bold text-slate-700 leading-none">{user.username}</p>
              <p className="text-[10px] font-medium text-slate-400 uppercase mt-0.5">{user.role}</p>
            </div>
            <ChevronDown size={14} className={`text-slate-400 transition-transform duration-300 ${isProfileOpen ? 'rotate-180' : ''}`} />
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden py-1 animate-in z-50">
              <div className="px-4 py-2 border-b border-slate-50 mb-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Logged as</p>
                <p className="text-xs font-bold text-slate-900 truncate">{user.fullName || user.username}</p>
              </div>
              <button onClick={() => { onNavigate('settings'); setIsProfileOpen(false); }} className="w-full flex items-center px-4 py-2 text-xs text-slate-600 hover:bg-slate-50">
                <Settings size={14} className="mr-2" /> Settings
              </button>
              <button onClick={onLogout} className="w-full flex items-center px-4 py-2 text-xs text-red-600 hover:bg-red-50">
                <LogOut size={14} className="mr-2" /> Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Topbar;
