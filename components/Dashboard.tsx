import React, { useEffect, useState, useMemo, useRef } from 'react';
import { db } from '../db';
import { Sale, Repair, Product, User, ProductType } from '../types';
import { Page } from '../App';
import {
   AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { Search, Package, ShoppingBag, Users, TrendingUp, TrendingDown, DollarSign, Activity, Wrench, AlertTriangle, ArrowUpRight, ChevronDown, Calendar, Receipt, Pause, AlertCircle, Play, X, Clock, ArrowRight, Percent, Crown, CheckCircle2, Smartphone, Headphones, Battery, Box, Settings } from 'lucide-react';

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
      topCustomer: { name: '', amount: 0 },
      cashRevenue: 0,
      mmRevenue: 0,
      bankRevenue: 0
   });

   const [allSales, setAllSales] = useState<Sale[]>([]);
   const [salesData, setSalesData] = useState<any[]>([]);
   const [recentSales, setRecentSales] = useState<Sale[]>([]);
   const [topProducts, setTopProducts] = useState<any[]>([]);
   const [lowStockItems, setLowStockItems] = useState<Product[]>([]);
   const [topCustomers, setTopCustomers] = useState<any[]>([]);
   const [recentActivity, setRecentActivity] = useState<any[]>([]);
   const [selectedDate, setSelectedDate] = useState<string | null>(null);


   const [heldSalesInfo, setHeldSalesInfo] = useState<{ count: number, oldestTimestamp: number | null, oldestNote?: string }>({ count: 0, oldestTimestamp: null });
   const [heldSales, setHeldSales] = useState<any[]>([]);
   const [isPendingSalesDropdownOpen, setIsPendingSalesDropdownOpen] = useState(false);
   const [categoryData, setCategoryData] = useState<any[]>([]);
   const [isPendingExpanded, setIsPendingExpanded] = useState(false);
   const [heldTotalValue, setHeldTotalValue] = useState(0);
   const [timeTick, setTimeTick] = useState(0);

   const getTimeAgo = (timestamp: number | null) => {
      if (!timestamp) return '';
      // Use timeTick to ensure this re-calculates
      const seconds = Math.floor((Date.now() - timestamp) / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (days > 0) return `${days}d ago`;
      if (hours > 0) return `${hours}h ago`;
      if (minutes > 0) return `${minutes}m ago`;
      return 'Just now';
   };

   useEffect(() => {
      const checkHeld = () => {
         const saved = localStorage.getItem('sna_held_sales');
         if (saved) {
            const parsed = JSON.parse(saved);
            setHeldSales(parsed);

            // Calculate total value of all held sales
            const total = parsed.reduce((sum: number, sale: any) => {
               const saleTotal = sale.items.reduce((iSum: number, item: any) => iSum + (item.price * item.quantity), 0);
               return sum + saleTotal;
            }, 0);
            setHeldTotalValue(total);

            if (parsed.length > 0) {
               const oldestSale = parsed.reduce((prev: any, curr: any) => prev.timestamp < curr.timestamp ? prev : curr);
               setHeldSalesInfo({ count: parsed.length, oldestTimestamp: oldestSale.timestamp, oldestNote: oldestSale.notes });
               return;
            }
         }
         setHeldSales([]);
         setHeldTotalValue(0);
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
         setTimeTick(prev => prev + 1); // Tick to update timeAgo
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

         setLowStockItems(products.filter(p => p.stockQuantity <= p.reorderLevel).sort((a, b) => a.stockQuantity - b.stockQuantity));
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
      const qtySoldToday = salesToday.reduce((acc, s) => acc + s.items.reduce((sum, i) => sum + i.quantity, 0), 0),
         profitToday = salesToday.reduce((acc, s) => {
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

      // --- V2 Stats Aggregation ---
      // Revenue Breakdown (Cash vs Mobile Money vs Bank)
      const cashRevenue = currentSales.filter(s => s.paymentMethod === 'Cash').reduce((sum, s) => sum + s.total, 0);
      const mmRevenue = currentSales.filter(s => s.paymentMethod === 'Mobile Money').reduce((sum, s) => sum + s.total, 0);
      const bankRevenue = currentSales.filter(s => s.paymentMethod === 'Bank').reduce((sum, s) => sum + s.total, 0);


      setStats(prev => ({
         ...prev,
         revenue, revenueTrend, orders, ordersTrend, margin,
         repairs: rawRepairs.filter(r => r.status !== 'Delivered' && r.status !== 'Cancelled').length,
         inventoryCount: rawProducts.length,
         lowStockCount: rawProducts.filter(p => p.stockQuantity <= p.reorderLevel).length,
         invoicesToday, qtySoldToday, inventoryValue, profitToday,
         topCustomer: topCust,
         // New V2 Stats
         cashRevenue, mmRevenue, bankRevenue
      }));

      // --- Calculate Category Data ---
      const catMap = new Map<string, number>();
      currentSales.forEach(s => s.items.forEach(i => {
         const p = rawProducts.find(prod => prod.id === i.productId);
         const type = p?.type || 'Other';
         catMap.set(type, (catMap.get(type) || 0) + 1); // Count quantity
      }));
      const catData = Array.from(catMap.entries()).map(([name, value]) => ({ name, value }));
      setCategoryData(catData);

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
      <div className="space-y-6 animate-in fade-in duration-500 pb-10 font-sans text-slate-800">

         {/* --- DASHBOARD HEADER --- */}
         {/* --- WELCOME BANNER --- */}
         <div className="w-full flex items-center justify-between bg-[#0f172a] border border-slate-800 rounded-3xl p-4 shadow-2xl group relative overflow-hidden transition-all duration-500 hover:shadow-rose-950/10 mb-4">
            {/* Background Decor */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-rose-600/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none group-hover:bg-rose-600/10 transition-colors duration-700"></div>
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-600/5 rounded-full blur-2xl -ml-8 -mb-8 pointer-events-none"></div>

            {/* Left: Avatar + Welcome Text */}
            <div className="flex items-center gap-7 relative z-10">
               <div className="relative shrink-0">
                  {/* Avatar Glow */}
                  <div className="absolute inset-0 bg-rose-600/20 blur-2xl rounded-full scale-150 animate-pulse"></div>

                  {/* Avatar Container */}
                  <div className="relative w-16 h-16 rounded-[1.5rem] bg-[#020617] p-1 border border-slate-700/50 shadow-2xl group-hover:border-rose-600/50 transition-all duration-500 overflow-visible">
                     <div className="w-full h-full rounded-[1.2rem] overflow-hidden bg-slate-900 ring-1 ring-white/5">
                        <img
                           src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}&backgroundColor=0f172a`}
                           alt={user.username}
                           className="w-full h-full object-cover scale-110 translate-y-1"
                        />
                     </div>

                     {/* Notification Badge */}
                     <div className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-[#f43f5e] rounded-full border-2 border-[#0f172a] shadow-lg flex items-center justify-center anim-bounce">
                        <span className="text-[10px] font-bold text-white">15</span>
                     </div>
                  </div>
               </div>

               <div className="flex flex-col">
                  <p className="text-xs text-slate-400 font-light mb-0.5">
                     {new Date().getHours() < 12 ? 'Good Morning' : new Date().getHours() < 18 ? 'Good Afternoon' : 'Good Evening'},
                  </p>
                  <h2 className="text-xl lg:text-2xl font-bold text-white leading-tight tracking-tight uppercase">
                     {user.username}
                  </h2>
                  <div className="flex items-center gap-3 mt-1.5">
                     <div className="px-2 py-0.5 rounded-lg bg-slate-800/80 border border-slate-700/50 flex items-center gap-1.5">
                        <div className="w-1 h-1 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{user.role}</span>
                     </div>
                     <span className="w-1 h-1 rounded-full bg-slate-700"></span>
                     <p className="text-[11px] font-light text-slate-500">
                        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                     </p>
                  </div>
               </div>
            </div>

            {/* Right: Progress Widget */}
            <div className="hidden xl:flex flex-col items-end gap-2 pl-8 border-l border-slate-800 ml-6 min-w-[200px] relative z-10">
               <div className="flex items-center gap-6 w-full justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Daily Performance</span>
                  <span className="text-xs font-bold text-rose-500 bg-rose-500/10 px-2 py-1 rounded-lg">75% Complete</span>
               </div>

               <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden shadow-inner ring-1 ring-white/5">
                  <div className="h-full w-[75%] bg-gradient-to-r from-rose-600 to-rose-400 rounded-full shadow-[0_0_15px_rgba(225,29,72,0.4)] relative">
                  </div>
               </div>

               <div className="flex items-center justify-between w-full mt-1">
                  <p className="text-[11px] text-slate-500 font-bold uppercase">15 / 20 Invoices</p>
                  <div className="flex -space-x-1.5 grayscale brightness-50 group-hover:grayscale-0 group-hover:brightness-100 transition-all duration-500">
                     {[1, 2, 3].map(i => (
                        <div key={i} className="w-5 h-5 rounded-full border-2 border-slate-900 bg-slate-800 text-[10px] flex items-center justify-center text-slate-400 overflow-hidden">
                           <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=user${i}`} alt="user" />
                        </div>
                     ))}
                  </div>
               </div>
            </div>
         </div>

         {/* --- PENDING TRANSACTIONS ALERT --- */}
         {heldSales.length > 0 && (
            <div className="w-full bg-amber-50/50 border border-amber-200 border-t-[3px] border-t-amber-400 rounded-3xl overflow-hidden relative group/ticker mb-4 shadow-sm transition-all duration-500">
               <div className="flex items-center p-3 md:px-5 md:py-4">
                  {/* Left Side: Pause Icon Card with Glow */}
                  <div className="relative shrink-0">
                     <div className="absolute inset-0 bg-amber-400/20 blur-xl rounded-full scale-125 group-hover/ticker:scale-150 transition-transform duration-700"></div>
                     <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-white flex items-center justify-center text-amber-900 shadow-sm border border-amber-100/50 relative z-10">
                        <Pause size={20} fill="currentColor" strokeWidth={0} />
                     </div>
                  </div>

                  {/* Center: Title and Description */}
                  <div className="flex-1 px-4 md:px-6">
                     <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-sm md:text-base font-bold text-amber-950 uppercase">Pending Transactions</h3>
                        <div className="px-2 py-0.5 rounded-full bg-amber-100/80 border border-amber-200/50 flex items-center gap-1 shrink-0">
                           <Clock size={10} className="text-amber-700" />
                           <span className="text-[11px] font-bold text-amber-800 leading-none">
                              {getTimeAgo(heldSalesInfo.oldestTimestamp)}
                           </span>
                        </div>
                     </div>
                     <p className="text-[11px] md:text-sm font-light text-amber-900/70 flex items-center gap-2">
                        <span>You have <span className="text-amber-950 font-bold">{heldSales.length}</span> unfinished sale{heldSales.length > 1 ? 's' : ''}.</span>
                        <span className="w-1 h-1 rounded-full bg-amber-300"></span>
                        <span className="text-amber-800 font-bold">Value: UGX {heldTotalValue.toLocaleString()}</span>
                     </p>
                  </div>

                  {/* Right Side: Actions */}
                  <div className="flex items-center gap-2">
                     <button
                        onClick={() => onNavigate('sales')}
                        className="flex items-center gap-2 bg-amber-950 px-4 py-2.5 rounded-xl shadow-lg shadow-amber-900/10 text-white group/btn hover:bg-black transition-all duration-300"
                     >
                        <span className="text-xs font-bold uppercase">Resume Now</span>
                        <Play size={14} fill="white" className="group-hover/btn:translate-x-1 transition-transform" />
                     </button>

                     <button
                        onClick={() => setIsPendingExpanded(!isPendingExpanded)}
                        className={`w-10 h-10 rounded-xl border border-amber-200/50 flex items-center justify-center text-amber-900 hover:bg-white hover:border-amber-300 transition-all shadow-sm ${isPendingExpanded ? 'rotate-180 bg-white' : 'bg-white/50'}`}
                     >
                        <ChevronDown size={18} strokeWidth={2.5} />
                     </button>
                  </div>
               </div>

               {/* Collapsible Detailed View */}
               {isPendingExpanded && (
                  <div className="border-t border-amber-200/50 bg-white/40 backdrop-blur-md animate-in py-6">
                     <div className="flex items-center gap-4 px-7 overflow-x-auto no-scrollbar pb-2">
                        {heldSales.map((sale) => (
                           <div
                              key={sale.id}
                              className="min-w-[280px] bg-white rounded-2xl p-4 border border-amber-100 shadow-sm hover:shadow-md hover:border-amber-200 transition-all flex flex-col gap-3 group/sale"
                           >
                              <div className="flex items-center justify-between">
                                 <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center">
                                       <Users size={16} className="text-slate-400" />
                                    </div>
                                    <span className="text-xs font-bold text-slate-800 truncate max-w-[120px]">
                                       {sale.customerName || "Walk-in Customer"}
                                    </span>
                                 </div>
                                 <span className="text-xs font-bold text-slate-400">{getTimeAgo(sale.timestamp)}</span>
                              </div>

                              <div className="flex items-center justify-between px-1">
                                 <div className="flex flex-col">
                                    <span className="text-xs uppercase font-bold text-slate-400">Items</span>
                                    <span className="text-xs font-bold text-slate-700">{sale.items.length} Product{sale.items.length > 1 ? 's' : ''}</span>
                                 </div>
                                 <div className="flex flex-col items-end">
                                    <span className="text-xs uppercase font-bold text-amber-500">Total</span>
                                    <span className="text-sm font-bold text-amber-950">
                                       {sale.items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0).toLocaleString()} <span className="text-[11px]">UGX</span>
                                    </span>
                                 </div>
                              </div>

                              <button
                                 onClick={() => onNavigate('sales')}
                                 className="w-full py-2.5 rounded-xl bg-amber-50 text-amber-700 text-xs font-bold uppercase border border-amber-100 hover:bg-amber-950 hover:text-white hover:border-amber-950 transition-all flex items-center justify-center gap-2"
                              >
                                 Resume Sale
                                 <ArrowRight size={14} />
                              </button>
                           </div>
                        ))}
                     </div>
                  </div>
               )}
            </div>
         )}

         {/* --- LOW STOCK ALERT TICKER --- */}
         {lowStockItems.length > 0 && (
            <div className="w-full bg-rose-50/30 border-t-[3px] border-rose-500 rounded-3xl overflow-hidden relative group/ticker mb-4 shadow-sm">
               {/* Shimmer Effect */}
               <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_3s_infinite] pointer-events-none"></div>

               <div className="flex items-center">
                  {/* Left Side: Label with Count */}
                  <div className="flex items-center gap-3 px-5 py-3 border-r border-rose-100/50 bg-white/40 backdrop-blur-xl z-20 shrink-0">
                     <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-rose-500 shadow-sm border border-rose-50/50 ring-4 ring-rose-50/30 text-xs text-bold">
                        <AlertTriangle size={18} strokeWidth={2.5} />
                     </div>
                     <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                           <span className="text-[11px] font-bold text-slate-800 uppercase leading-none">Attention</span>
                           <span className="px-1 py-0.5 rounded bg-rose-500 text-[11px] font-bold text-white leading-none">{lowStockItems.length}</span>
                        </div>
                        <span className="text-xs font-bold text-rose-500 mt-0.5">Low Stock</span>
                     </div>
                  </div>

                  {/* Center: Scrolling Content */}
                  <div className="flex-1 overflow-hidden relative">
                     <div className="flex items-center gap-4 px-6 animate-marquee whitespace-nowrap py-3">
                        {/* Render items twice for seamless loop */}
                        {[...lowStockItems, ...lowStockItems].map((item, idx) => (
                           <button
                              key={`${item.id}-${idx}`}
                              onClick={() => onNavigate('inventory')}
                              className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-rose-100/20 shadow-sm shrink-0 hover:shadow-md hover:border-rose-300 transition-all duration-300 cursor-pointer group/item outline-none"
                           >
                              <span className="text-xs font-bold text-slate-700 uppercase tracking-tight group-hover/item:text-rose-600 transition-colors">{item.name}</span>
                              <div className={`flex items-center justify-center min-w-[20px] h-5 px-1 rounded-md text-white text-[11px] font-bold shadow-sm group-hover/item:scale-110 transition-transform ${item.stockQuantity === 0 ? 'bg-rose-600 animate-pulse' : 'bg-rose-500'}`}>
                                 {item.stockQuantity}
                              </div>
                           </button>
                        ))}
                     </div>

                     {/* Gradient Fades for Smoothness */}
                     <div className="absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-rose-50/40 to-transparent pointer-events-none z-[5]"></div>
                     <div className="absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-rose-50/40 to-transparent pointer-events-none z-[5]"></div>
                  </div>

                  {/* Right Side: Manage Link */}
                  <div className="px-8 border-l border-rose-100/50 hidden md:block z-20">
                     <button
                        onClick={() => onNavigate('inventory')}
                        className="flex items-center gap-2 text-rose-500 hover:text-rose-600 font-black text-xs uppercase tracking-widest group/manage transition-colors"
                     >
                        Manage
                        <ArrowRight size={16} className="group-hover/manage:translate-x-1 transition-transform" />
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* --- TOP ROW (Sales Overview & Category Dist) --- */}
         <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="col-span-1 lg:col-span-8 bg-white rounded-2xl p-8 border border-slate-100 shadow-sm flex flex-col md:flex-row gap-8">

               {/* Chart Area */}
               <div className="flex-1 min-w-0 flex flex-col">
                  <div className="flex justify-between items-center mb-6">
                     <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center">
                           <Activity size={20} />
                        </div>
                        <h3 className="text-lg font-black text-slate-900">Sales Overview</h3>
                     </div>
                     <div className="flex bg-slate-50 p-1 rounded-xl">
                        {['Today', 'This Month', 'All Time'].map(t => (
                           <button
                              key={t}
                              onClick={() => setTimeRange(t as any)}
                              className={`px-3 py-1.5 text-xs font-bold uppercase rounded-lg transition-all ${timeRange === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                           >
                              {t === 'This Month' ? 'Monthly' : t}
                           </button>
                        ))}
                     </div>
                  </div>

                  <div className="flex-1 h-[300px] w-full relative">
                     <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={salesData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                           <defs>
                              <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                 <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                                 <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                                 <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2} />
                                 <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                              </linearGradient>
                           </defs>
                           <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                           <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} dy={10} />
                           <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                           <Tooltip
                              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                              cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4' }}
                           />
                           <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" activeDot={{ r: 6, strokeWidth: 0 }} />
                           <Area type="monotone" dataKey="orders" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorProfit)" />
                        </AreaChart>
                     </ResponsiveContainer>
                  </div>
               </div>

               {/* Side Stats Panel */}
               <div className="w-full md:w-64 shrink-0 flex flex-col gap-6 border-t md:border-t-0 md:border-l border-slate-100 pt-6 md:pt-0 md:pl-8">

                  {/* Total Stat */}
                  <div>
                     <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Revenue</p>
                     <h2 className="text-3xl font-black text-slate-900 tracking-tight">
                        <span className="text-sm text-slate-400 mr-1 font-light">UGX</span>
                        {(stats.revenue / 1000).toFixed(1)}k
                     </h2>
                  </div>

                  {/* Breakdown Stats */}
                  <div className="space-y-4">
                     <div>
                        <div className="flex items-center gap-2 mb-1">
                           <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                           <p className="text-xs font-bold text-slate-600">Mobile Money</p>
                           <span className="text-xs text-green-500 ml-auto font-bold flex items-center gap-0.5"><ArrowUpRight size={10} /> 12%</span>
                        </div>
                        <p className="text-sm font-bold text-slate-900 pl-4">UGX {(stats.mmRevenue / 1000).toFixed(1)}k</p>
                     </div>

                     <div>
                        <div className="flex items-center gap-2 mb-1">
                           <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                           <p className="text-xs font-bold text-slate-600">Cash Sales</p>
                           <span className="text-xs text-rose-500 ml-auto font-bold flex items-center gap-0.5"><TrendingDown size={10} /> 0%</span>
                        </div>
                        <p className="text-sm font-bold text-slate-900 pl-4">UGX {(stats.cashRevenue / 1000).toFixed(1)}k</p>
                     </div>
                  </div>

                  {/* Insight Box */}
                  <div className="mt-auto bg-blue-50 rounded-2xl p-4 flex items-start gap-3">
                     <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                        <CheckCircle2 size={16} />
                     </div>
                     <div>
                        <p className="text-xs font-bold text-slate-900">You're doing good!</p>
                        <p className="text-xs text-slate-500 leading-relaxed mt-1">
                           Revenue performance is <span className="font-bold text-blue-600">{(stats.revenueTrend).toFixed(0)}% better</span> compared to previous period.
                        </p>
                     </div>
                  </div>

               </div>
            </div>

            {/* CATEGORY DISTRIBUTION (Audience Demographics Style) - Spans 4 Cols */}
            <div className="col-span-1 lg:col-span-4 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col">
               <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center">
                     <Users size={20} />
                  </div>
                  <h3 className="text-lg font-black text-slate-900">Category Dist.</h3>
               </div>

               {/* Chart */}
               <div className="h-48 w-full relative mb-6">
                  <ResponsiveContainer width="100%" height="100%">
                     <PieChart>
                        <Pie
                           data={categoryData}
                           cx="50%"
                           cy="50%"
                           innerRadius={60}
                           outerRadius={80}
                           paddingAngle={5}
                           dataKey="value"
                        >
                           {categoryData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={['#3b82f6', '#f43f5e', '#10b981', '#f59e0b'][index % 4]} strokeWidth={0} />
                           ))}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                     </PieChart>
                  </ResponsiveContainer>
                  {/* Center Text */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                     <span className="text-2xl font-black text-slate-900">{stats.qtySoldToday}</span>
                     <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Items</span>
                  </div>
               </div>

               {/* Legend / Stats List */}
               <div className="flex-1 space-y-4 overflow-y-auto pr-1 custom-scrollbar">
                  {categoryData.length > 0 ? categoryData.map((cat, idx) => (
                     <div key={idx}>
                        <div className="flex justify-between items-center mb-1.5">
                           <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full`} style={{ backgroundColor: ['#3b82f6', '#f43f5e', '#10b981', '#f59e0b'][idx % 4] }} />
                              <span className="text-xs font-bold text-slate-700 capitalize">{cat.name.replace('_', ' ')}</span>
                           </div>
                           <span className="text-xs font-bold text-slate-900">{cat.value}</span>
                        </div>
                        <div className="w-full bg-slate-50 h-1.5 rounded-full overflow-hidden">
                           <div
                              className="h-full rounded-full transition-all duration-1000"
                              style={{
                                 width: `${(cat.value / (stats.qtySoldToday || 1)) * 100}%`,
                                 backgroundColor: ['#3b82f6', '#f43f5e', '#10b981', '#f59e0b'][idx % 4]
                              }}
                           />
                        </div>
                     </div>
                  )) : (
                     <div className="text-center py-8 text-slate-400 text-xs text-medium">No category data yet.</div>
                  )}
               </div>
            </div>

         </div>

         {/* --- BOTTOM ROW (Activity & Customers) --- */}
         <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* RECENT ACTIVITY (Schedule Content Style) - Spans 8 Cols */}
            <div className="col-span-1 lg:col-span-8 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
               <div className="flex justify-between items-center mb-5">
                  <div className="flex items-center gap-2.5">
                     <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center">
                        <Clock size={16} />
                     </div>
                     <h3 className="text-base font-bold text-slate-900">Recent Activity</h3>
                  </div>
                  <button onClick={() => onNavigate('reports')} className="text-xs font-bold text-blue-500 hover:text-blue-600 flex items-center gap-1 transition-colors">
                     See Detail <ArrowUpRight size={12} />
                  </button>
               </div>

               <div className="space-y-3">
                  {recentActivity.map((item, idx) => {
                     const date = new Date(item.timestamp);
                     const day = date.getDate();
                     const month = date.toLocaleDateString('en-US', { month: 'short' });
                     const isSale = item.type === 'sale';

                     return (
                        <div key={idx} className="flex gap-3 group">
                           {/* Date Column */}
                           <div className="flex flex-col items-center justify-center w-11 shrink-0 pt-1">
                              <span className="text-lg font-bold text-slate-400 group-hover:text-blue-500 transition-colors uppercase">{day}</span>
                              <span className="text-[11px] font-bold text-slate-400 uppercase leading-none">{month}</span>
                           </div>

                           {/* Card */}
                           <div onClick={() => handleActivityClick(item)} className={`flex-1 p-2.5 rounded-xl border border-slate-100 flex items-center gap-3 transition-all ${isSale ? 'bg-blue-50/50 hover:bg-blue-50 border-blue-100/50 hover:border-blue-200 cursor-pointer' : 'bg-slate-50 hover:bg-slate-100'}`}>
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-sm shrink-0 ${isSale ? 'bg-white text-blue-500' : 'bg-white text-orange-500'}`}>
                                 {isSale ? <ShoppingBag size={16} /> : <Wrench size={16} />}
                              </div>

                              <div className="flex-1 min-w-0">
                                 <h4 className="text-xs font-bold text-slate-900 truncate">{item.title}</h4>
                                 <p className="text-xs text-slate-500 font-light truncate leading-tight">{item.desc}</p>
                              </div>

                              {item.amount && (
                                 <div className="text-right shrink-0">
                                    <span className="block text-[11px] font-bold text-slate-400 uppercase leading-none">UGX</span>
                                    <span className="block text-xs font-bold text-slate-700">{item.amount.toLocaleString()}</span>
                                 </div>
                              )}

                              <button className="p-1.5 text-slate-300 hover:text-slate-500">
                                 <ArrowRight size={14} />
                              </button>
                           </div>
                        </div>
                     );
                  })}
                  {recentActivity.length === 0 && (
                     <div className="text-center py-10 text-slate-400 text-xs font-light">No recent activity found.</div>
                  )}
               </div>
            </div>

            {/* TOP CUSTOMERS (Most Engaged Style) - Spans 4 Cols */}
            <div className="col-span-1 lg:col-span-4 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
               <div className="flex items-center gap-2.5 mb-5">
                  <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center">
                     <Crown size={16} />
                  </div>
                  <h3 className="text-base font-bold text-slate-900">Top Clients</h3>
               </div>

               <div className="space-y-5">
                  {topCustomers.map((cust, idx) => (
                     <div key={idx} className="flex items-center gap-3 group border-b border-slate-50 last:border-0 pb-3 last:pb-0">
                        <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-100 group-hover:border-blue-200 transition-colors shrink-0">
                           <img
                              src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${cust.name}&backgroundColor=b6e3f4`}
                              alt={cust.name}
                              className="w-full h-full object-cover"
                           />
                        </div>
                        <div className="flex-1 min-w-0">
                           <h4 className="text-xs font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors">{cust.name}</h4>
                           <div className="flex items-center gap-2 mt-0.5">
                              <span className="flex items-center gap-1 text-[11px] font-bold text-slate-400">
                                 <ShoppingBag size={8} /> {Math.floor(Math.random() * 20) + 1}
                              </span>
                              <span className="flex items-center gap-1 text-[11px] font-bold text-blue-500 uppercase">
                                 High Value
                              </span>
                           </div>
                        </div>
                        <div className="text-right">
                           <span className="block text-xs font-bold text-slate-900">{(cust.amount / 1000).toFixed(0)}k</span>
                           <span className="block text-[11px] font-bold text-slate-400 uppercase leading-none">Spent</span>
                        </div>
                     </div>
                  ))}
                  {topCustomers.length === 0 && (
                     <div className="text-center py-10 text-slate-400 text-xs font-light">No customer data available.</div>
                  )}
               </div>
            </div>

         </div>

      </div >
   );
};

export default Dashboard;
