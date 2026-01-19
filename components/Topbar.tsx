
import React, { useState, useRef, useEffect } from 'react';
import { Search, Bell, LogOut, Settings, ChevronDown, Box, ShoppingCart, Wrench, Menu, Database, WifiOff, RefreshCw, AlertTriangle, PackageX, ArrowRight, Globe } from 'lucide-react';
import { User, Product, Sale, Repair, AppSettings } from '../types';
import { Page } from '../App';
import { db } from '../db';

interface TopbarProps {
  user: User;
  onLogout: () => void;
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onMenuToggle: () => void;
  settings: AppSettings | null;
}

interface SearchResults {
  products: Product[];
  sales: Sale[];
  repairs: Repair[];
}

const Topbar: React.FC<TopbarProps> = ({ user, onLogout, onNavigate, onMenuToggle, settings }) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [lowStockItems, setLowStockItems] = useState<Product[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<SearchResults>({ products: [], sales: [], repairs: [] });
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [dbStatus, setDbStatus] = useState<'live' | 'mock'>('live');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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
    const performSearch = async () => {
      if (!searchTerm.trim()) {
        setResults({ products: [], sales: [], repairs: [] });
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        const query = searchTerm.toLowerCase();
        const [allProducts, allSales, allRepairs] = await Promise.all([
          db.products.toArray(),
          db.sales.toArray(),
          db.repairs.toArray()
        ]);

        const filteredProducts = allProducts.filter(p =>
          p.name.toLowerCase().includes(query) || p.sku.toLowerCase().includes(query)
        ).slice(0, 5);

        const filteredSales = allSales.filter(s =>
          s.receiptNo.toLowerCase().includes(query) ||
          (s.customerName && s.customerName.toLowerCase().includes(query))
        ).slice(0, 3);

        const filteredRepairs = allRepairs.filter(r =>
          r.jobCardNo.toLowerCase().includes(query) ||
          r.customerName.toLowerCase().includes(query) ||
          r.deviceModel.toLowerCase().includes(query)
        ).slice(0, 3);

        setResults({
          products: filteredProducts,
          sales: filteredSales,
          repairs: filteredRepairs
        });
      } catch (e) {
        console.error("Search failed", e);
      } finally {
        setIsSearching(false);
      }
    };

    const timer = setTimeout(performSearch, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };

    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setShowResults(true);
      }

      if (e.key === 'Escape') {
        setShowResults(false);
        setIsProfileOpen(false);
        setIsNotificationsOpen(false);
        inputRef.current?.blur();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleGlobalShortcuts);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleGlobalShortcuts);
    };
  }, []);

  const handleResultClick = (page: Page) => {
    onNavigate(page);
    setShowResults(false);
    setSearchTerm('');
  };

  const hasResults = results.products.length > 0 || results.sales.length > 0 || results.repairs.length > 0;

  return (
    <header className="h-16 bg-white flex items-center justify-between px-4 lg:px-8 z-40 shrink-0 border-b border-slate-200 sticky top-0 shadow-sm gap-2 sm:gap-4">
      <div className="flex items-center gap-2 sm:gap-4">
        <button
          onClick={onMenuToggle}
          className="p-2 rounded-xl text-slate-500 hover:bg-slate-50"
        >
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-3 hidden sm:flex">
          {settings?.logo && (
            <div className="w-8 h-8 rounded-lg overflow-hidden border border-slate-100 flex items-center justify-center bg-white shadow-sm">
              <img src={settings.logo} alt="Logo" className="w-full h-full object-contain" />
            </div>
          )}
          <div className="flex flex-col">
            <h2 className="text-sm font-black text-slate-900 leading-none truncate uppercase italic tracking-tighter">
              {settings?.businessName || 'SNA! MOBILE HUB'}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={fetchMeta}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border transition-all ${dbStatus === 'live'
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                    : 'bg-orange-50 text-orange-600 border-orange-100'
                  }`}
              >
                {dbStatus === 'live' ? <Globe size={10} /> : <WifiOff size={10} />}
                <span className="text-[8px] font-black uppercase tracking-tighter">
                  {dbStatus === 'live' ? 'ONLINE NODE (CLOUD)' : 'OFFLINE NODE (LOCAL)'}
                </span>
                <RefreshCw size={8} className={isRefreshing ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-lg relative" ref={searchRef}>
        <div className="relative group">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search catalog... (Ctrl+K)"
            className="win-input pl-10 pr-4 bg-slate-50 border-transparent focus:bg-white focus:ring-2 focus:ring-orange-500/10 transition-all text-xs h-10 shadow-sm rounded-lg"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setShowResults(true);
            }}
            onFocus={() => setShowResults(true)}
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        </div>

        {showResults && (searchTerm || isSearching) && (
          <div className="absolute top-full left-0 right-0 sm:left-auto sm:w-[400px] mt-2 bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden animate-in z-50">
            {isSearching ? (
              <div className="p-8 flex flex-col items-center justify-center space-y-3">
                <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-[10px] font-black uppercase tracking-[3px] text-slate-400">Querying DB...</p>
              </div>
            ) : !hasResults ? (
              <div className="p-8 flex flex-col items-center justify-center text-center">
                <p className="text-xs font-black text-slate-900 uppercase italic">No Matches Detected</p>
              </div>
            ) : (
              <div className="p-2 space-y-1 max-h-[60vh] overflow-y-auto scrollbar-hide">
                {results.products.length > 0 && (
                  <div className="pb-2">
                    <div className="px-4 py-2 flex items-center gap-2">
                      <Box size={12} className="text-orange-500" />
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Inventory Assets</span>
                    </div>
                    {results.products.map(p => (
                      <button key={p.id} onClick={() => handleResultClick('inventory')} className="w-full text-left px-4 py-2.5 hover:bg-slate-50 rounded-xl flex justify-between items-center group transition-colors">
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-900 truncate group-hover:text-orange-600 transition-colors">{p.name}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase">{p.sku}</p>
                        </div>
                        <span className="text-[10px] font-black text-slate-900">UGX {p.selling_price.toLocaleString()}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end">
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className={`p-2 rounded-xl transition-all relative ${isNotificationsOpen ? 'bg-orange-50 text-orange-600' : 'text-slate-500 hover:text-orange-600 hover:bg-orange-50'}`}
          >
            <Bell size={18} />
            {lowStockCount > 0 && (
              <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-orange-600 text-white text-[7px] font-black rounded-full flex items-center justify-center border-2 border-white animate-pulse">
                {lowStockCount}
              </span>
            )}
          </button>

          {isNotificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden animate-in z-50">
              <div className="p-4 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Notifications</span>
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

        <div className="h-6 w-px bg-slate-200 mx-1 sm:mx-2"></div>

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center gap-1 p-1 rounded-xl hover:bg-slate-50 transition-all"
          >
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden border border-slate-200">
              <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} alt="av" className="w-full h-full object-cover" />
            </div>
            <ChevronDown size={14} className={`text-slate-400 hidden sm:block transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden py-1 animate-in z-50">
              <div className="px-4 py-2 border-b border-slate-50 mb-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Logged as</p>
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
