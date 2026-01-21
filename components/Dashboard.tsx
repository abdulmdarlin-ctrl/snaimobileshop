import React, { useEffect, useState, useMemo, useRef } from 'react';
import { db } from '../db';
import { Sale, Repair, Product, User, ProductType } from '../types';
import { Page } from '../App';
import {
   AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import {
   TrendingUp, TrendingDown, DollarSign, ShoppingBag, Activity,
   Wrench, Package, ArrowRight, Calendar, Users,
   Plus, Search, Filter, MoreHorizontal, ArrowUpRight, ChevronDown,
   CreditCard, AlertCircle, CheckCircle2, ShoppingCart, X, AlertTriangle, Receipt, Crown, Percent, Pause, Clock,
   Smartphone, Headphones, Battery, Box
} from 'lucide-react';

interface DashboardProps {
   onNavigate: (page: Page) => void;
   user: User;
}

const Dashboard: React.FC<DashboardProps> = ({ onNavigate, user }) => {
   const [loading, setLoading] = useState(true);
   const [greeting, setGreeting] = useState('');
   const [timeRange, setTimeRange] = useState<'Today' | 'This Month' | 'All Time' | 'Custom'>('Today');
   const [topSellingMode, setTopSellingMode] = useState<'Quantity' | 'Revenue'>('Quantity');
   const [dashboardSearch, setDashboardSearch] = useState('');
   const [searchFilter, setSearchFilter] = useState<'All' | 'Products' | 'Sales' | 'Repairs'>('All');
   const searchInputRef = useRef<HTMLInputElement>(null);
   const [showSearchResults, setShowSearchResults] = useState(false);
   const [customStart, setCustomStart] = useState(new Date().toISOString().split('T')[0]);
   const [customEnd, setCustomEnd] = useState(new Date().toISOString().split('T')[0]);
   const [rawRepairs, setRawRepairs] = useState<Repair[]>([]);
   const [rawProducts, setRawProducts] = useState<Product[]>([]);
   const [stats, setStats] = useState({
      revenue: 0,
      revenueTrend: 0,
      orders: 0,
      ordersTrend: 0,
      repairs: 0,
      inventoryCount: 0,
      lowStockCount: 0,
      invoicesToday: 0,
      qtySoldToday: 0,
      inventoryValue: 0,
      profitToday: 0,
      margin: 0,
      topCustomer: { name: '', amount: 0 }
   });

   const [allSales, setAllSales] = useState<Sale[]>([]);
   const [salesData, setSalesData] = useState<any[]>([]);
   const [recentSales, setRecentSales] = useState<Sale[]>([]);
   const [topProducts, setTopProducts] = useState<any[]>([]);
   const [lowStockItems, setLowStockItems] = useState<Product[]>([]);
   const [topCustomers, setTopCustomers] = useState<any[]>([]);
   const [recentActivity, setRecentActivity] = useState<any[]>([]);
   const [selectedDate, setSelectedDate] = useState<string | null>(null);
   const [showLowStockBanner, setShowLowStockBanner] = useState(true);

   const [heldSalesInfo, setHeldSalesInfo] = useState<{ count: number, oldestTimestamp: number | null, oldestNote?: string }>({ count: 0, oldestTimestamp: null });
   const [heldSales, setHeldSales] = useState<any[]>([]);
   const [isPendingSalesDropdownOpen, setIsPendingSalesDropdownOpen] = useState(false);

   useEffect(() => {
      const checkHeld = () => {
         const saved = localStorage.getItem('sna_held_sales');
         if (saved) {
            const parsed = JSON.parse(saved);
            setHeldSales(parsed);
            if (parsed.length > 0) {
               const oldestSale = parsed.reduce((prev: any, curr: any) => prev.timestamp < curr.timestamp ? prev : curr);
               setHeldSalesInfo({ count: parsed.length, oldestTimestamp: oldestSale.timestamp, oldestNote: oldestSale.notes });
               return;
            }
         }
         setHeldSales([]);
         setHeldSalesInfo({ count: 0, oldestTimestamp: null });
      };
      checkHeld();
      window.addEventListener('storage', checkHeld);
      // Listen for custom events for same-tab updates
      return () => window.removeEventListener('storage', checkHeld);
   }, []);

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
      const fetchData = async () => {
         const [sales, repairs, products, stockLogs] = await Promise.all([
            db.sales.toArray(),
            db.repairs.toArray(),
            db.products.toArray(),
            db.stockLogs.toArray()
         ]);

         setAllSales(sales.sort((a, b) => b.timestamp - a.timestamp));
         setRawRepairs(repairs);
         setRawProducts(products);

         // --- Chart Data (Last 7 Days) ---
         const last7Days = [...Array(7)].map((_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - i);
            return d.toISOString().split('T')[0];
         }).reverse();

         const chartData = last7Days.map(date => {
            const daySales = sales.filter(s => {
               if (!s.timestamp) return false;
               try {
                  return new Date(s.timestamp).toISOString().split('T')[0] === date;
               } catch (e) { return false; }
            });
            return {
               date: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
               revenue: daySales.reduce((sum, s) => sum + s.total, 0),
               orders: daySales.length,
               fullDate: date // Store
            };
         });

         setSalesData(chartData);
         setRecentSales(sales.sort((a, b) => b.timestamp - a.timestamp).slice(0, 5));

         // --- Recent Activity Feed ---
         const activities = [
            ...sales.map(s => ({
               id: s.id,
               type: 'sale',
               timestamp: s.timestamp,
               title: `Sale #${s.receiptNo}`,
               desc: s.customerName || '-',
               amount: s.total,
               status: 'Paid',
               saleObject: s
            })),
            ...repairs.map(r => ({
               id: r.id,
               type: 'repair',
               timestamp: r.timestamp,
               title: `Repair: ${r.deviceModel}`,
               desc: r.issue,
               amount: r.estimatedCost,
               status: r.status
            })),
            ...stockLogs.map((l: any) => ({
               id: l.id,
               type: 'stock',
               timestamp: l.timestamp,
               title: `Stock: ${l.productName}`,
               desc: `${l.changeAmount > 0 ? '+' : ''}${l.changeAmount} (${l.reason})`,
               amount: null,
               status: 'Updated'
            }))
         ].sort((a, b) => b.timestamp - a.timestamp).slice(0, 8);
         setRecentActivity(activities);

         setLowStockItems(products.filter(p => p.stockQuantity <= p.reorderLevel).slice(0, 5));
         setLoading(false);
      };

      fetchData();
   }, []);

   // Handle clicking outside search results
   useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
         if (showSearchResults && !(e.target as HTMLElement).closest('.dashboard-search-container')) {
            setShowSearchResults(false);
         }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
   }, [showSearchResults]);

   const searchResults = useMemo(() => {
      if (!dashboardSearch.trim()) return { products: [], sales: [], repairs: [] };
      const term = dashboardSearch.toLowerCase();

      const showProducts = searchFilter === 'All' || searchFilter === 'Products';
      const showSales = searchFilter === 'All' || searchFilter === 'Sales';
      const showRepairs = searchFilter === 'All' || searchFilter === 'Repairs';
      const limit = searchFilter === 'All' ? 5 : 10;

      return {
         products: showProducts ? rawProducts.filter(p => p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term)).slice(0, limit) : [],
         sales: showSales ? allSales.filter(s => s.receiptNo.toLowerCase().includes(term) || (s.customerName && s.customerName.toLowerCase().includes(term))).slice(0, limit) : [],
         repairs: showRepairs ? rawRepairs.filter(r => r.jobCardNo.toLowerCase().includes(term) || r.customerName.toLowerCase().includes(term) || r.deviceModel.toLowerCase().includes(term)).slice(0, limit) : []
      };
   }, [dashboardSearch, rawProducts, allSales, rawRepairs, searchFilter]);

   const [selectedIndex, setSelectedIndex] = useState(-1);

   const flatResults = useMemo(() => [
      ...searchResults.products.map(p => ({ type: 'product', data: p })),
      ...searchResults.sales.map(s => ({ type: 'sale', data: s })),
      ...searchResults.repairs.map(r => ({ type: 'repair', data: r }))
   ], [searchResults]);

   useEffect(() => {
      setSelectedIndex(-1);
   }, [dashboardSearch, searchFilter]);

   useEffect(() => {
      if (selectedIndex !== -1) {
         document.getElementById(`search-result-item-${selectedIndex}`)?.scrollIntoView({ block: 'nearest' });
      }
   }, [selectedIndex]);

   const handleKeyDown = (e: React.KeyboardEvent) => {
      if (!showSearchResults) return;

      if (e.key === 'ArrowDown') {
         e.preventDefault();
         setSelectedIndex(prev => (prev < flatResults.length - 1 ? prev + 1 : prev));
      } else if (e.key === 'ArrowUp') {
         e.preventDefault();
         setSelectedIndex(prev => (prev > -1 ? prev - 1 : -1));
      } else if (e.key === 'Enter') {
         e.preventDefault();
         if (selectedIndex > -1 && flatResults[selectedIndex]) {
            const item = flatResults[selectedIndex];
            if (item.type === 'product') onNavigate('inventory');
            if (item.type === 'sale') onNavigate('sales');
            if (item.type === 'repair') onNavigate('repairs');
            setShowSearchResults(false);
            setDashboardSearch('');
         }
      } else if (e.key === 'Escape') {
         setShowSearchResults(false);
         searchInputRef.current?.blur();
      }
   };

   const handleActivityClick = (item: any) => {
      if (item.type === 'sale' && item.saleObject?.id) {
         sessionStorage.setItem('sna_view_receipt_for_id', item.saleObject.id);
         onNavigate('sales');
      }
   };

   // Calculate stats based on timeRange
   useEffect(() => {
      if (loading) return;

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

      let currentSales: Sale[] = [];
      let previousSales: Sale[] = [];

      if (timeRange === 'Today') {
         currentSales = allSales.filter(s => s.timestamp >= todayStart);
         const yesterdayStart = todayStart - 86400000;
         previousSales = allSales.filter(s => s.timestamp >= yesterdayStart && s.timestamp < todayStart);
      } else if (timeRange === 'This Month') {
         currentSales = allSales.filter(s => s.timestamp >= monthStart);
         const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
         const lastMonthEnd = monthStart;
         previousSales = allSales.filter(s => s.timestamp >= lastMonthStart && s.timestamp < lastMonthEnd);
      } else if (timeRange === 'Custom') {
         const start = new Date(customStart).setHours(0, 0, 0, 0);
         const end = new Date(customEnd).setHours(23, 59, 59, 999);
         currentSales = allSales.filter(s => s.timestamp >= start && s.timestamp <= end);

         const duration = end - start;
         const prevStart = start - duration;
         const prevEnd = start;
         previousSales = allSales.filter(s => s.timestamp >= prevStart && s.timestamp < prevEnd);
      } else {
         // All Time
         currentSales = allSales;
         previousSales = [];
      }

      const revenue = currentSales.reduce((sum, s) => sum + s.total, 0);
      const prevRevenue = previousSales.reduce((sum, s) => sum + s.total, 0);
      const revenueTrend = prevRevenue === 0 ? (revenue > 0 ? 100 : 0) : ((revenue - prevRevenue) / prevRevenue) * 100;

      const orders = currentSales.length;
      const prevOrders = previousSales.length;
      const ordersTrend = prevOrders === 0 ? (orders > 0 ? 100 : 0) : ((orders - prevOrders) / prevOrders) * 100;

      // --- Calculate Profit & Margin for Selected Period ---
      const profit = currentSales.reduce((acc, s) => {
         const saleProfit = s.items.reduce((itemAcc, i) => {
            const product = rawProducts.find(p => p.id === i.productId);
            const cost = (product?.costPrice || 0) * i.quantity;
            return itemAcc + (i.total - cost);
         }, 0);
         return acc + saleProfit;
      }, 0);
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

      // --- Calculate Today's Specific Stats ---
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const salesToday = allSales.filter(s => s.timestamp >= startOfToday);
      const invoicesToday = salesToday.length;
      const qtySoldToday = salesToday.reduce((acc, s) => acc + s.items.reduce((sum, i) => sum + i.quantity, 0), 0);
      const profitToday = salesToday.reduce((acc, s) => {
         const saleProfit = s.items.reduce((itemAcc, i) => {
            const product = rawProducts.find(p => p.id === i.productId);
            const cost = (product?.costPrice || 0) * i.quantity;
            return itemAcc + (i.total - cost);
         }, 0);
         return acc + saleProfit;
      }, 0);
      const inventoryValue = rawProducts.reduce((sum, p) => sum + (p.stockQuantity * p.costPrice), 0);

      // --- Calculate Top Products for this time range ---
      const productMap = new Map<string, { product: Product, count: number, revenue: number }>();
      currentSales.forEach(s => s.items.forEach(i => {
         const existing = productMap.get(i.productId);
         if (existing) {
            existing.count += i.quantity;
            existing.revenue += i.total;
         } else {
            const product = rawProducts.find(p => p.id === i.productId);
            if (product) {
               productMap.set(i.productId, { product, count: i.quantity, revenue: i.total });
            }
         }
      }));
      const topProds = Array.from(productMap.values())
         .sort((a, b) => topSellingMode === 'Quantity' ? b.count - a.count : b.revenue - a.revenue)
         .slice(0, 5);

      setTopProducts(topProds);

      // --- Calculate Top Customers ---
      const customerMap = new Map<string, number>();
      currentSales.forEach(s => {
         const name = s.customerName || '-';
         customerMap.set(name, (customerMap.get(name) || 0) + s.total);
      });
      const topCustList = Array.from(customerMap.entries())
         .map(([name, amount]) => ({ name, amount }))
         .sort((a, b) => b.amount - a.amount)
         .slice(0, 5);
      setTopCustomers(topCustList);
      const topCust = topCustList.length > 0 ? topCustList[0] : { name: 'None', amount: 0 };

      setStats(prev => ({
         ...prev,
         revenue, revenueTrend, orders, ordersTrend, margin,
         repairs: rawRepairs.filter(r => r.status !== 'Delivered' && r.status !== 'Cancelled').length,
         inventoryCount: rawProducts.length,
         lowStockCount: rawProducts.filter(p => p.stockQuantity <= p.reorderLevel).length,
         invoicesToday, qtySoldToday, inventoryValue, profitToday,
         topCustomer: topCust
      }));
   }, [timeRange, allSales, rawRepairs, rawProducts, loading, customStart, customEnd, topSellingMode]);

   // Filter Recent Sales based on chart selection
   const filteredRecentSales = useMemo(() => {
      if (!selectedDate) return recentSales;

      // Filter all sales by the selected date string (YYYY-MM-DD)
      return allSales.filter(s => {
         try {
            return new Date(s.timestamp).toISOString().split('T')[0] === selectedDate;
         } catch { return false; }
      });
   }, [selectedDate, recentSales, allSales]);

   const handleChartClick = (data: any) => {
      if (data && data.activePayload && data.activePayload[0]) {
         setSelectedDate(data.activePayload[0].payload.fullDate);
      }
   };

   return (
      <div className="space-y-6 animate-in fade-in duration-500 pb-10 font-sans">

         {/* --- HEADER --- */}
         <div className="relative overflow-hidden rounded-3xl p-8 shadow-2xl text-white group">
            {/* Dynamic Background */}
            <div className="absolute inset-0 bg-slate-900">
               <div className="absolute inset-0 bg-gradient-to-br from-violet-600/20 via-slate-900 to-rose-600/20 opacity-100"></div>
               <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-rose-500/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2"></div>
               <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/2"></div>
            </div>

            {/* Content Container */}
            <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">

               {/* User Profile Section */}
               <div className="flex items-center gap-5 w-full md:w-auto">
                  <div className="relative shrink-0">
                     <div className="absolute -inset-1 bg-gradient-to-r from-rose-500 to-violet-500 rounded-2xl blur opacity-40 group-hover:opacity-75 transition duration-1000"></div>
                     <div className="relative w-16 h-16 rounded-2xl bg-slate-950 p-1 ring-1 ring-white/10">
                        <img
                           src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`}
                           alt="Profile"
                           className="w-full h-full object-cover rounded-xl bg-slate-900"
                        />
                     </div>
                     {stats.lowStockCount > 0 && (
                        <span className="absolute -top-2 -right-2 w-6 h-6 bg-rose-500 text-white text-[10px] font-black flex items-center justify-center rounded-full shadow-lg ring-4 ring-slate-900 animate-bounce">
                           {stats.lowStockCount}
                        </span>
                     )}
                  </div>

                  <div>
                     <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-400 mb-0.5">{greeting},</span>
                        <h1 className="text-3xl font-black tracking-tight text-white">
                           {user.fullName || user.username}
                        </h1>
                     </div>
                     <div className="flex items-center gap-3 mt-2">
                        <div className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 backdrop-blur-md flex items-center gap-2">
                           <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                           <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wide">{user.role}</span>
                        </div>
                        <span className="text-slate-500 text-[10px] font-bold">•</span>
                        <p className="text-xs font-medium text-slate-400">
                           {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                        </p>
                     </div>
                  </div>
               </div>

               {/* Actions / Filter / Search */}
               <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto justify-end">
                  {/* Dashboard Search */}
                  <div className="relative w-full sm:w-64 group dashboard-search-container">
                     <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search size={16} className="text-white/40 group-focus-within:text-white transition-colors" />
                     </div>
                     <input
                        ref={searchInputRef}
                        type="text"
                        onKeyDown={handleKeyDown}
                        placeholder={searchFilter === 'All' ? "Search products, sales, repairs..." : `Search ${searchFilter.toLowerCase()}...`}
                        className="w-full bg-white/10 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-xs font-bold text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-rose-500/50 focus:bg-white/20 transition-all backdrop-blur-sm"
                        value={dashboardSearch}
                        onChange={(e) => {
                           setDashboardSearch(e.target.value);
                           setShowSearchResults(true);
                        }}
                        onFocus={() => setShowSearchResults(true)}
                     />

                     {showSearchResults && dashboardSearch.trim() && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
                           <div className="p-2 max-h-[400px] overflow-y-auto">
                              {searchResults.products.length > 0 && (
                                 <div className="mb-2">
                                    <div className="px-3 py-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                       <Package size={12} /> Products
                                    </div>
                                    {searchResults.products.map((p, idx) => (
                                       <button key={p.id} id={`search-result-item-${idx}`} onClick={() => { onNavigate('inventory'); setShowSearchResults(false); }} className={`w-full text-left px-3 py-2 rounded-xl flex justify-between items-center group transition-colors ${selectedIndex === idx ? 'bg-slate-100 ring-1 ring-slate-200' : 'hover:bg-slate-50'}`}>
                                          <div className="min-w-0">
                                             <p className="text-xs font-bold text-slate-900 truncate group-hover:text-rose-600">{p.name}</p>
                                             <p className="text-[9px] text-slate-400 font-mono">{p.sku}</p>
                                          </div>
                                          <span className="text-[10px] font-black text-slate-900">UGX {p.selling_price.toLocaleString()}</span>
                                       </button>
                                    ))}
                                 </div>
                              )}
                              {searchResults.sales.length > 0 && (
                                 <div className="mb-2">
                                    <div className="px-3 py-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                       <Receipt size={12} /> Sales
                                    </div>
                                    {searchResults.sales.map((s, idx) => (
                                       <button key={s.id} id={`search-result-item-${searchResults.products.length + idx}`} onClick={() => { onNavigate('sales'); setShowSearchResults(false); }} className={`w-full text-left px-3 py-2 rounded-xl flex justify-between items-center group transition-colors ${selectedIndex === (searchResults.products.length + idx) ? 'bg-slate-100 ring-1 ring-slate-200' : 'hover:bg-slate-50'}`}>
                                          <div className="min-w-0">
                                             <p className="text-xs font-bold text-slate-900 truncate group-hover:text-rose-600">{s.receiptNo}</p>
                                             <p className="text-[9px] text-slate-400">{s.customerName || 'Walk-in'}</p>
                                          </div>
                                          <span className="text-[10px] font-black text-emerald-600">UGX {s.total.toLocaleString()}</span>
                                       </button>
                                    ))}
                                 </div>
                              )}
                              {searchResults.repairs.length > 0 && (
                                 <div>
                                    <div className="px-3 py-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                       <Wrench size={12} /> Repairs
                                    </div>
                                    {searchResults.repairs.map((r, idx) => (
                                       <button key={r.id} id={`search-result-item-${searchResults.products.length + searchResults.sales.length + idx}`} onClick={() => { onNavigate('repairs'); setShowSearchResults(false); }} className={`w-full text-left px-3 py-2 rounded-xl flex justify-between items-center group transition-colors ${selectedIndex === (searchResults.products.length + searchResults.sales.length + idx) ? 'bg-slate-100 ring-1 ring-slate-200' : 'hover:bg-slate-50'}`}>
                                          <div className="min-w-0">
                                             <p className="text-xs font-bold text-slate-900 truncate group-hover:text-rose-600">{r.deviceModel}</p>
                                             <p className="text-[9px] text-slate-400 font-mono">{r.jobCardNo} • {r.customerName}</p>
                                          </div>
                                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${r.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{r.status}</span>
                                       </button>
                                    ))}
                                 </div>
                              )}
                              {searchResults.products.length === 0 && searchResults.sales.length === 0 && searchResults.repairs.length === 0 && (
                                 <div className="p-4 text-center">
                                    <p className="text-xs font-bold text-slate-400 uppercase">No matches found</p>
                                 </div>
                              )}
                           </div>
                        </div>
                     )}
                  </div>

                  <div className="flex items-center gap-3 bg-white/5 p-1.5 rounded-2xl border border-white/5 backdrop-blur-sm">
                     <div className="pl-2">
                        <Calendar size={16} className="text-white/60" />
                     </div>
                     {timeRange === 'Custom' && (
                        <div className="flex items-center gap-2 px-3 border-r border-white/10 mr-1 animate-in fade-in slide-in-from-right-4">
                           <input
                              type="date"
                              value={customStart}
                              max={customEnd}
                              onChange={e => setCustomStart(e.target.value)}
                              className="text-[10px] font-bold text-white bg-transparent border-none focus:ring-0 w-auto p-0 [color-scheme:dark] cursor-pointer outline-none"
                           />
                           <span className="text-slate-500 text-[10px]">-</span>
                           <input
                              type="date"
                              value={customEnd}
                              min={customStart}
                              onChange={e => setCustomEnd(e.target.value)}
                              className="text-[10px] font-bold text-white bg-transparent border-none focus:ring-0 w-auto p-0 [color-scheme:dark] cursor-pointer outline-none"
                           />
                        </div>
                     )}

                     <div className="relative">
                        <select
                           value={timeRange}
                           onChange={(e) => setTimeRange(e.target.value as any)}
                           className="appearance-none bg-slate-900 border border-white/10 pl-3 pr-8 py-2.5 rounded-xl text-xs font-bold text-white uppercase tracking-wide shadow-lg focus:ring-2 focus:ring-rose-500/50 cursor-pointer hover:bg-slate-800 transition-all"
                        >
                           {['Today', 'This Month', 'All Time', 'Custom'].map((range) => (
                              <option key={range} value={range}>{range}</option>
                           ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                     </div>
                  </div>
               </div>
            </div>
         </div>

         {/* Pending Sales Alert */}
         {heldSalesInfo.count > 0 && (
            <div className="relative">
               <div className="relative overflow-hidden bg-amber-50/50 p-4 rounded-2xl border border-amber-200 flex items-center justify-between text-amber-900 animate-in slide-in-from-top-4">
                  <div className="absolute top-0 left-0 h-0.5 w-full bg-gradient-to-r from-transparent via-amber-500 to-transparent animate-strokemove"></div>
                  <div className="flex items-center gap-4">
                     <div className="w-12 h-12 bg-white/50 rounded-xl flex items-center justify-center backdrop-blur-md border border-amber-200/50">
                        <Pause size={24} className="animate-pulse" />
                     </div>
                     <div>
                        <div className="flex items-center gap-2">
                           <h3 className="text-sm font-black uppercase tracking-wider text-amber-950">Pending Transactions</h3>
                           {heldSalesInfo.oldestTimestamp && (
                              <span className="px-2 py-0.5 bg-amber-200/50 rounded-full text-[10px] font-bold flex items-center gap-1 backdrop-blur-sm">
                                 <Clock size={10} />
                                 {(() => {
                                    const diff = Math.floor((Date.now() - heldSalesInfo.oldestTimestamp) / 60000);
                                    if (diff < 1) return 'Just now';
                                    if (diff < 60) return `${diff}m ago`;
                                    const hours = Math.floor(diff / 60);
                                    if (hours < 24) return `${hours}h ago`;
                                    return `${Math.floor(hours / 24)}d ago`;
                                 })()}
                              </span>
                           )}
                        </div>
                        <p className="text-xs font-medium text-amber-800/80">
                           You have <span className="font-bold text-amber-950">{heldSalesInfo.count}</span> unfinished {heldSalesInfo.count === 1 ? 'sale' : 'sales'} waiting in the POS.
                        </p>
                     </div>
                  </div>
                  <div className="flex items-center gap-2">
                     <button
                        onClick={() => onNavigate('sales')}
                        className="px-5 py-2.5 bg-amber-600/10 border border-amber-500/50 text-amber-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-amber-600 hover:text-white transition-all shadow-lg shadow-amber-500/10 flex items-center gap-2 animate-pulse"
                     >
                        Resume Now <ArrowRight size={14} strokeWidth={3} />
                     </button>
                     <button onClick={() => setIsPendingSalesDropdownOpen(prev => !prev)} className="p-2.5 bg-amber-600/10 border border-amber-500/50 text-amber-700 rounded-xl hover:bg-amber-100 transition-all">
                        <ChevronDown size={16} className={`transition-transform ${isPendingSalesDropdownOpen ? 'rotate-180' : ''}`} />
                     </button>
                  </div>
               </div>
               {isPendingSalesDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-lg border border-slate-200 p-4 space-y-3 animate-in fade-in slide-in-from-top-2 z-10">
                     {heldSales.map(sale => (
                        <div key={sale.id} className="p-3 bg-slate-50 rounded-lg flex justify-between items-center border border-slate-100">
                           <div>
                              <p className="text-xs font-bold text-slate-800">{sale.customerName}</p>
                              <p className="text-[10px] text-slate-500">{sale.items.length} items • UGX {sale.total.toLocaleString()}</p>
                              {sale.notes && <p className="text-[10px] text-amber-700 italic">Note: {sale.notes}</p>}
                           </div>
                           <button onClick={() => onNavigate('sales')} className="text-[10px] font-bold text-blue-600 hover:underline">Resume</button>
                        </div>
                     ))}
                  </div>
               )}
            </div>
         )}

         {/* Quick Stats Row */}
         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-blue-900/5 hover:-translate-y-1 transition-all duration-300 group">
               <div className="flex items-center gap-4">
                  <div className="p-3.5 bg-gradient-to-br from-blue-50 to-blue-100 text-blue-600 rounded-2xl group-hover:scale-110 transition-transform duration-300 shadow-inner">
                     <Receipt size={24} strokeWidth={2} />
                  </div>
                  <div>
                     <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Invoices Today</p>
                     <p className="text-2xl font-black text-slate-900">{stats.invoicesToday}</p>
                  </div>
               </div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-orange-900/5 hover:-translate-y-1 transition-all duration-300 group">
               <div className="flex items-center gap-4">
                  <div className="p-3.5 bg-gradient-to-br from-orange-50 to-orange-100 text-orange-600 rounded-2xl group-hover:scale-110 transition-transform duration-300 shadow-inner">
                     <ShoppingBag size={24} strokeWidth={2} />
                  </div>
                  <div>
                     <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Qty Sold Today</p>
                     <p className="text-2xl font-black text-slate-900">{stats.qtySoldToday}</p>
                  </div>
               </div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-emerald-900/5 hover:-translate-y-1 transition-all duration-300 group">
               <div className="flex items-center gap-4">
                  <div className="p-3.5 bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-600 rounded-2xl group-hover:scale-110 transition-transform duration-300 shadow-inner">
                     <TrendingUp size={24} strokeWidth={2} />
                  </div>
                  <div>
                     <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Profit Today</p>
                     <p className="text-2xl font-black text-slate-900">
                        <span className="text-sm text-slate-400 mr-1 font-bold">UGX</span>
                        {stats.profitToday.toLocaleString()}
                     </p>
                  </div>
               </div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-violet-900/5 hover:-translate-y-1 transition-all duration-300 group">
               <div className="flex items-center gap-4">
                  <div className="p-3.5 bg-gradient-to-br from-violet-50 to-violet-100 text-violet-600 rounded-2xl group-hover:scale-110 transition-transform duration-300 shadow-inner">
                     <Package size={24} strokeWidth={2} />
                  </div>
                  <div>
                     <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Inventory Value</p>
                     <p className="text-2xl font-black text-slate-900">
                        <span className="text-sm text-slate-400 mr-1 font-bold">UGX</span>
                        {stats.inventoryValue >= 1000000 ? (stats.inventoryValue / 1000000).toFixed(1) + 'M' : (stats.inventoryValue / 1000).toFixed(0) + 'k'}
                     </p>
                  </div>
               </div>
            </div>
         </div>

         {/* Low Stock Banner */}
         {
            lowStockItems.length > 0 && showLowStockBanner && (
               <div className="relative overflow-hidden rounded-xl shadow-sm border border-rose-100 bg-rose-50/50 group mb-6 animate-in fade-in slide-in-from-top-4">
                  {/* Background Pattern */}
                  <div className="absolute inset-0 opacity-30 bg-[linear-gradient(to_right,#f43f5e12_1px,transparent_1px),linear-gradient(to_bottom,#f43f5e12_1px,transparent_1px)] bg-[size:12px_12px]"></div>

                  {/* Top Accent Line */}
                  <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-rose-400 via-red-500 to-rose-400 animate-gradient-x"></div>

                  {/* Content */}
                  <div className="relative p-3 flex items-center gap-4 pr-10">
                     {/* Icon / Label */}
                     <div className="flex items-center gap-3 text-rose-700 shrink-0 px-2 border-r border-rose-200/60">
                        <div className="relative">
                           <div className="absolute inset-0 bg-rose-500 rounded-full animate-ping opacity-20"></div>
                           <div className="relative p-1.5 bg-white rounded-full shadow-sm border border-rose-100">
                              <AlertTriangle size={16} strokeWidth={2.5} className="text-rose-600" />
                           </div>
                        </div>
                        <div className="flex flex-col">
                           <span className="text-[10px] font-black uppercase tracking-widest leading-none text-rose-950">Attention</span>
                           <span className="text-[11px] font-bold text-rose-600">Low Stock</span>
                        </div>
                     </div>

                     {/* Marquee Content */}
                     <div className="flex-1 overflow-hidden relative h-8 mask-linear-fade">
                        <div className="flex gap-3 absolute top-0 left-0 animate-marquee items-center h-full hover:pause">
                           {[...lowStockItems, ...lowStockItems, ...lowStockItems].map((item, idx) => (
                              <button
                                 key={`${item.id}-${idx}`}
                                 onClick={() => onNavigate('inventory')}
                                 className="flex items-center gap-2 bg-white hover:bg-rose-100 px-3 py-1.5 rounded-lg border border-rose-100 shadow-sm transition-all group/item shrink-0"
                              >
                                 <span className="text-[11px] font-bold text-slate-700 group-hover/item:text-rose-900">{item.name}</span>
                                 <span className="text-[10px] font-black text-white bg-rose-500 px-1.5 rounded py-0.5">{item.stockQuantity}</span>
                              </button>
                           ))}
                        </div>
                     </div>

                     {/* Dismiss */}
                     <button
                        onClick={() => setShowLowStockBanner(false)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-rose-400 hover:text-rose-700 hover:bg-rose-100 rounded-lg transition-all"
                     >
                        <X size={16} strokeWidth={2.5} />
                     </button>
                  </div>
                  <style>{`
                  @keyframes gradient-x {
                     0% { background-position: 0% 50%; }
                     50% { background-position: 100% 50%; }
                     100% { background-position: 0% 50%; }
                  }
                  .animate-gradient-x {
                     background-size: 200% 200%;
                     animation: gradient-x 3s ease infinite;
                  }
                  @keyframes marquee {
                     0% { transform: translateX(0); }
                     100% { transform: translateX(-33.33%); }
                  }
                  .animate-marquee {
                     animation: marquee 30s linear infinite;
                  }
                  .hover\\:pause:hover {
                     animation-play-state: paused;
                  }
                  .mask-linear-fade {
                     mask-image: linear-gradient(to right, transparent, black 5%, black 95%, transparent);
                     -webkit-mask-image: linear-gradient(to right, transparent, black 5%, black 95%, transparent);
                  }
                  @keyframes strokemove {
                     0% { transform: translateX(-100%); }
                     100% { transform: translateX(100%); }
                  }
                  .animate-strokemove {
                      animation: strokemove 3s linear infinite;
                  }
               `}</style>
               </div>
            )
         }

         {/* --- KPI BENTO GRID --- */}
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {/* Revenue Card */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-rose-900/5 hover:-translate-y-1 transition-all duration-300 group">
               <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-gradient-to-br from-rose-50 to-rose-100 text-rose-600 rounded-2xl group-hover:scale-110 transition-transform duration-300 shadow-inner">
                     <DollarSign size={24} />
                  </div>
                  <span className={`flex items-center text-[10px] font-bold px-2 py-1 rounded-full ${stats.revenueTrend >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                     {stats.revenueTrend >= 0 ? <TrendingUp size={12} className="mr-1" /> : <TrendingDown size={12} className="mr-1" />}
                     {Math.abs(stats.revenueTrend).toFixed(0)}%
                  </span>
               </div>
               <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">INCOME ({timeRange})</p>
               <h3 className="text-2xl font-black text-slate-900 mt-1">
                  <span className="text-xs text-slate-400 mr-1 font-bold">UGX</span>
                  {stats.revenue.toLocaleString()}
               </h3>
            </div>

            {/* Profit Margin Card */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-emerald-900/5 hover:-translate-y-1 transition-all duration-300 group">
               <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-600 rounded-2xl group-hover:scale-110 transition-transform duration-300 shadow-inner">
                     <Percent size={24} />
                  </div>
                  <span className={`flex items-center text-[10px] font-bold px-2 py-1 rounded-full ${stats.margin >= 20 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                     {stats.margin >= 20 ? 'Healthy' : 'Low'}
                  </span>
               </div>
               <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">MARGIN ({timeRange})</p>
               <h3 className="text-2xl font-black text-slate-900 mt-1">{stats.margin.toFixed(1)}%</h3>
            </div>

            {/* Orders Card */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-blue-900/5 hover:-translate-y-1 transition-all duration-300 group">
               <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-gradient-to-br from-blue-50 to-blue-100 text-blue-600 rounded-2xl group-hover:scale-110 transition-transform duration-300 shadow-inner">
                     <ShoppingBag size={24} />
                  </div>
                  <span className={`flex items-center text-[10px] font-bold px-2 py-1 rounded-full ${stats.ordersTrend >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                     {stats.ordersTrend >= 0 ? <TrendingUp size={12} className="mr-1" /> : <TrendingDown size={12} className="mr-1" />}
                     {Math.abs(stats.ordersTrend).toFixed(0)}%
                  </span>
               </div>
               <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">SALES ({timeRange})</p>
               <h3 className="text-2xl font-black text-slate-900 mt-1">{stats.orders}</h3>
            </div>

            {/* Repairs Card */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-orange-900/5 hover:-translate-y-1 transition-all duration-300 group cursor-pointer" onClick={() => onNavigate('repairs')}>
               <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-gradient-to-br from-orange-50 to-orange-100 text-orange-600 rounded-2xl group-hover:scale-110 transition-transform duration-300 shadow-inner">
                     <Wrench size={24} />
                  </div>
                  <div className="p-1 bg-slate-50 rounded-full">
                     <ArrowUpRight size={16} className="text-slate-400" />
                  </div>
               </div>
               <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Active Repairs</p>
               <h3 className="text-2xl font-black text-slate-900 mt-1">{stats.repairs}</h3>
            </div>

            {/* Inventory Card */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-violet-900/5 hover:-translate-y-1 transition-all duration-300 group cursor-pointer" onClick={() => onNavigate('inventory')}>
               <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-gradient-to-br from-violet-50 to-violet-100 text-violet-600 rounded-2xl group-hover:scale-110 transition-transform duration-300 shadow-inner">
                     <Package size={24} />
                  </div>
                  {stats.lowStockCount > 0 && (
                     <span className="flex items-center text-[10px] font-bold bg-rose-50 text-rose-600 px-2 py-1 rounded-full animate-pulse">
                        <AlertCircle size={12} className="mr-1" /> Low Stock
                     </span>
                  )}
               </div>
               <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Total Products</p>
               <h3 className="text-2xl font-black text-slate-900 mt-1">{stats.inventoryCount}</h3>
            </div>
         </div>

         {/* --- MAIN CONTENT GRID --- */}
         <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Left Column: Charts & Activity */}
            <div className="lg:col-span-2 space-y-6">
               {/* Revenue Chart */}
               <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                  <div className="flex justify-between items-center mb-6">
                     <h3 className="text-lg font-bold text-slate-900">Revenue Trend</h3>
                     <div className="px-3 py-1 bg-slate-50 rounded-lg text-xs font-bold text-slate-500">
                        Last 7 Days
                     </div>
                  </div>
                  <div className="h-[250px] w-full">
                     <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                        <AreaChart
                           key={timeRange}
                           data={salesData}
                           margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                           onClick={handleChartClick}
                           style={{ cursor: 'pointer' }}
                        >
                           <defs>
                              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                 <stop offset="5%" stopColor="#e11d48" stopOpacity={0.3} />
                                 <stop offset="95%" stopColor="#e11d48" stopOpacity={0} />
                              </linearGradient>
                           </defs>
                           <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                           <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 600 }} dy={10} />
                           <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} tickFormatter={(value) => `${value >= 1000 ? value / 1000 + 'k' : value}`} />
                           <Tooltip
                              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                              formatter={(value: number) => [`UGX ${value.toLocaleString()}`, 'Revenue']}
                           />
                           <Area type="monotone" dataKey="revenue" stroke="#e11d48" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                        </AreaChart>
                     </ResponsiveContainer>
                  </div>
               </div>

               {/* Recent Transactions */}
               <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-50 flex justify-between items-center">
                     <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-slate-900">Transactions</h3>
                        {selectedDate && (
                           <span className="px-2 py-1 bg-rose-50 text-rose-600 rounded-lg text-[10px] font-bold flex items-center gap-1">
                              {new Date(selectedDate).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}
                              <button onClick={(e) => { e.stopPropagation(); setSelectedDate(null); }}><X size={12} /></button>
                           </span>
                        )}
                     </div>
                     <button onClick={() => onNavigate('sales')} className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                        View All <ArrowUpRight size={14} />
                     </button>
                  </div>
                  <div className="overflow-x-auto p-3">
                     <table className="w-full text-left border-separate border-spacing-y-1">
                        <thead>
                           <tr>
                              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-4">Receipt</th>
                              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Customer</th>
                              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Amount</th>
                              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right pr-4">Status</th>
                           </tr>
                        </thead>
                        <tbody>
                           {filteredRecentSales.slice(0, 5).map((sale) => (
                              <tr key={sale.id} className="group hover:bg-slate-50 transition-all duration-200">
                                 <td className="px-4 py-3 text-xs font-bold text-slate-600 font-mono rounded-l-xl pl-4 group-hover:text-slate-900 transition-colors">{sale.receiptNo}</td>
                                 <td className="px-4 py-3 text-sm font-medium text-slate-900">{sale.customerName || '-'}</td>
                                 <td className="px-4 py-3 text-sm font-bold text-slate-900">UGX {sale.total.toLocaleString()}</td>
                                 <td className="px-4 py-3 text-right rounded-r-xl pr-4">
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-600 group-hover:bg-white group-hover:shadow-sm transition-all">
                                       Paid
                                    </span>
                                 </td>
                              </tr>
                           ))}
                           {filteredRecentSales.length === 0 && (
                              <tr><td colSpan={4} className="px-6 py-8 text-center text-xs text-slate-400 font-bold uppercase">No transactions found for this date</td></tr>
                           )}
                        </tbody>
                     </table>
                  </div>
               </div>
            </div>

            {/* Right Column: Quick Actions & Top Products */}
            <div className="space-y-6">

               {/* Recent Activity Feed */}
               <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                     <Activity size={18} className="text-blue-500" />
                     <h3 className="text-lg font-bold text-slate-900">Recent Activity</h3>
                  </div>
                  <div className="space-y-4">
                     {recentActivity.length > 0 ? recentActivity.map((item, idx) => {
                        const isClickable = item.type === 'sale';
                        const Wrapper = isClickable ? 'button' as const : 'div' as const;
                        return (
                           <Wrapper
                              key={idx}
                              onClick={isClickable ? () => handleActivityClick(item) : undefined}
                              className={`w-full text-left flex items-start gap-3 pb-3 border-b border-slate-50 last:border-0 last:pb-0 ${isClickable ? 'hover:bg-slate-50 rounded-lg -mx-2 px-2 transition-colors cursor-pointer' : ''}`}
                           >
                              <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${item.type === 'sale' ? 'bg-emerald-500' :
                                 item.type === 'repair' ? 'bg-orange-500' : 'bg-blue-500'
                                 }`} />
                              <div className="flex-1 min-w-0">
                                 <div className="flex justify-between items-start">
                                    <p className="text-xs font-bold text-slate-900 truncate">{item.title}</p>
                                    <span className="text-[9px] text-slate-400 whitespace-nowrap ml-2">
                                       {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                 </div>
                                 <p className="text-[10px] text-slate-500 truncate">{item.desc}</p>
                                 {item.amount !== null && (
                                    <p className="text-[10px] font-bold text-slate-700 mt-0.5">UGX {item.amount.toLocaleString()}</p>
                                 )}
                              </div>
                           </Wrapper>
                        );
                     }) : (
                        <div className="text-center py-8 text-slate-400 text-xs font-medium">No recent activity.</div>
                     )}
                  </div>
               </div>

               {/* Top Customers */}
               <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                     <Crown size={18} className="text-amber-500" />
                     <h3 className="text-lg font-bold text-slate-900">Top Customers</h3>
                  </div>
                  <div className="space-y-4">
                     {topCustomers.length > 0 ? topCustomers.map((cust, idx) => (
                        <div key={idx} className="flex items-center gap-3">
                           <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${idx === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                              {idx + 1}
                           </div>
                           <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-center mb-1">
                                 <p className="text-xs font-bold text-slate-900 truncate">{cust.name}</p>
                                 <p className="text-[10px] font-bold text-slate-500">{(cust.amount / 1000).toFixed(0)}k</p>
                              </div>
                              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                 <div className="bg-amber-500 h-full rounded-full" style={{ width: `${Math.min((cust.amount / (topCustomers[0]?.amount || 1)) * 100, 100)}%` }}></div>
                              </div>
                           </div>
                        </div>
                     )) : (
                        <div className="text-center py-8 text-slate-400 text-xs font-medium">No customer data available.</div>
                     )}
                  </div>
               </div>

               {/* Top Products */}
               <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                     <div className="flex items-center gap-2 shrink-0">
                        <h3 className="text-sm font-bold text-slate-900">Top Selling</h3>
                        <TrendingUp size={16} className="text-rose-500" />
                     </div>
                     <div className="flex items-center gap-3">
                        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200/50">
                           <button
                              onClick={() => setTopSellingMode('Quantity')}
                              className={`px-2 py-1 text-[9px] font-black uppercase rounded-md transition-all ${topSellingMode === 'Quantity' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                           >
                              Qty
                           </button>
                           <button
                              onClick={() => setTopSellingMode('Revenue')}
                              className={`px-2 py-1 text-[9px] font-black uppercase rounded-md transition-all ${topSellingMode === 'Revenue' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                           >
                              Rev
                           </button>
                        </div>
                        <button onClick={() => onNavigate('reports')} className="text-xs font-bold text-rose-500 hover:text-rose-600 flex items-center gap-1 transition-colors">
                           View All <ArrowUpRight size={14} />
                        </button>
                     </div>
                  </div>
                  <div className="space-y-4">
                     {topProducts.length > 0 ? topProducts.map((item: { product: Product; count: number; revenue: number }, idx) => (
                        <div key={item.product.id} className="flex items-center gap-3 group/item">
                           <div className="relative shrink-0">
                              <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover/item:bg-rose-50 group-hover/item:text-rose-500 transition-colors">
                                 {item.product.type === ProductType.PHONE ? <Smartphone size={20} /> :
                                    item.product.type === ProductType.ACCESSORY ? <Headphones size={20} /> :
                                       item.product.type === ProductType.SPARE_PART ? <Battery size={20} /> :
                                          <Box size={20} />}
                              </div>
                              <div className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-white border border-slate-100 shadow-sm flex items-center justify-center text-[10px] font-black text-slate-900">
                                 {idx + 1}
                              </div>
                           </div>
                           <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-start mb-1">
                                 <p className="text-sm font-bold text-slate-900 truncate pr-2">{item.product.name}</p>
                                 <span className="text-[10px] font-black text-slate-900 shrink-0">
                                    {item.count} <span className="text-slate-400 font-bold">PCS</span>
                                 </span>
                              </div>
                              <div className="flex justify-between items-center">
                                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                    {item.product.brand || 'General'}
                                 </p>
                                 <p className="text-[10px] font-bold text-emerald-600">
                                    UGX {item.revenue.toLocaleString()}
                                 </p>
                              </div>
                              <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
                                 <div
                                    className="bg-rose-500 h-full rounded-full transition-all duration-1000"
                                    style={{ width: `${Math.min(((topSellingMode === 'Quantity' ? item.count : item.revenue) / (topSellingMode === 'Quantity' ? (topProducts[0]?.count || 1) : (topProducts[0]?.revenue || 1))) * 100, 100)}%` }}
                                 ></div>
                              </div>
                           </div>
                        </div>
                     )) : (
                        <div className="text-center py-8 text-slate-400 text-xs font-medium">No sales data available.</div>
                     )}
                  </div>
               </div>

            </div>
         </div>
      </div>
   );
};

export default Dashboard;
