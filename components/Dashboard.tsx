import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../db';
import { Sale, Repair, Product, User } from '../types';
import { Page } from '../App';
import {
   AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import {
   TrendingUp, TrendingDown, DollarSign, ShoppingBag,
   Wrench, Package, ArrowRight, Calendar, Users,
   Plus, Search, Filter, MoreHorizontal, ArrowUpRight, ChevronDown,
   CreditCard, AlertCircle, CheckCircle2, ShoppingCart, X, AlertTriangle, Receipt, Crown
} from 'lucide-react';

interface DashboardProps {
   onNavigate: (page: Page) => void;
   user: User;
}

const Dashboard: React.FC<DashboardProps> = ({ onNavigate, user }) => {
   const [loading, setLoading] = useState(true);
   const [greeting, setGreeting] = useState('');
   const [timeRange, setTimeRange] = useState<'Today' | 'This Month' | 'All Time' | 'Custom'>('Today');
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
      topCustomer: { name: '', amount: 0 }
   });

   const [allSales, setAllSales] = useState<Sale[]>([]);
   const [salesData, setSalesData] = useState<any[]>([]);
   const [recentSales, setRecentSales] = useState<Sale[]>([]);
   const [topProducts, setTopProducts] = useState<any[]>([]);
   const [lowStockItems, setLowStockItems] = useState<Product[]>([]);
   const [selectedDate, setSelectedDate] = useState<string | null>(null);

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
         const [sales, repairs, products] = await Promise.all([
            db.sales.toArray(),
            db.repairs.toArray(),
            db.products.toArray()
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
         setLowStockItems(products.filter(p => p.stockQuantity <= p.reorderLevel).slice(0, 5));
         setLoading(false);
      };

      fetchData();
   }, []);

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
      const productMap = new Map<string, number>();
      currentSales.forEach(s => s.items.forEach(i => {
         productMap.set(i.name, (productMap.get(i.name) || 0) + i.quantity);
      }));
      const topProds = Array.from(productMap.entries())
         .map(([name, count]) => ({ name, count }))
         .sort((a, b) => b.count - a.count)
         .slice(0, 5);

      setTopProducts(topProds);

      // --- Calculate Top Customer ---
      const customerMap = new Map<string, number>();
      currentSales.forEach(s => {
         const name = s.customerName || 'Walk-in Customer';
         customerMap.set(name, (customerMap.get(name) || 0) + s.total);
      });

      let topCust = { name: 'None', amount: 0 };
      for (const [name, amount] of customerMap.entries()) {
         if (amount > topCust.amount) {
            topCust = { name, amount };
         }
      }

      setStats(prev => ({
         ...prev,
         revenue, revenueTrend, orders, ordersTrend,
         repairs: rawRepairs.filter(r => r.status !== 'Delivered' && r.status !== 'Cancelled').length,
         inventoryCount: rawProducts.length,
         lowStockCount: rawProducts.filter(p => p.stockQuantity <= p.reorderLevel).length,
         invoicesToday, qtySoldToday, inventoryValue, profitToday,
         topCustomer: topCust
      }));
   }, [timeRange, allSales, rawRepairs, rawProducts, loading, customStart, customEnd]);

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
         <div className="relative overflow-hidden bg-[#0f172a] rounded-2xl p-5 shadow-lg text-white">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>

            <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-4">
               <div className="flex items-center gap-4">
                  <div className="relative">
                     <div className="w-12 h-12 rounded-xl bg-white/10 p-1 shadow-inner border border-white/10 shrink-0 backdrop-blur-sm">
                        <img
                           src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`}
                           alt="Profile"
                           className="w-full h-full object-cover rounded-lg bg-white/5"
                        />
                     </div>
                     {stats.lowStockCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-white text-rose-600 text-[9px] font-bold flex items-center justify-center rounded-full shadow-md animate-pulse">
                           {stats.lowStockCount}
                        </span>
                     )}
                  </div>

                  <div>
                     <div className="flex items-center gap-2">
                        <h1 className="text-xl font-bold text-white tracking-tight leading-none">
                           {greeting}, {user.fullName || user.username}
                        </h1>
                     </div>
                     <p className="text-xs font-medium text-slate-400 mt-0.5 flex items-center gap-1">
                        <Calendar size={10} />
                        {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
                     </p>
                  </div>
               </div>

               {/* Time Filter & Actions */}
               <div className="flex items-center gap-3">
                  {timeRange === 'Custom' && (
                     <div className="flex items-center gap-2 bg-white/10 p-1 rounded-lg border border-white/10 animate-in fade-in slide-in-from-right-4 backdrop-blur-md">
                        <input
                           type="date"
                           value={customStart}
                           onChange={e => setCustomStart(e.target.value)}
                           className="text-[10px] font-bold text-white outline-none bg-transparent pl-2 border-none focus:ring-0 w-20 [color-scheme:dark] placeholder-white/50"
                        />
                        <span className="text-white/50 text-[10px]">-</span>
                        <input
                           type="date"
                           value={customEnd}
                           onChange={e => setCustomEnd(e.target.value)}
                           className="text-[10px] font-bold text-white outline-none bg-transparent pr-2 border-none focus:ring-0 w-20 [color-scheme:dark] placeholder-white/50"
                        />
                     </div>
                  )}

                  <div className="relative group">
                     <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                        <Calendar size={12} className="text-slate-400 group-hover:text-white transition-colors" />
                     </div>
                     <select
                        value={timeRange}
                        onChange={(e) => setTimeRange(e.target.value as any)}
                        className="appearance-none bg-white/10 border border-white/10 pl-8 pr-8 py-2 rounded-lg text-xs font-bold text-white uppercase tracking-wide shadow-sm outline-none focus:ring-1 focus:ring-white/30 cursor-pointer hover:bg-white/20 transition-all backdrop-blur-md"
                     >
                        {['Today', 'This Month', 'All Time', 'Custom'].map((range) => (
                           <option key={range} value={range} className="bg-rose-600 text-white">{range}</option>
                        ))}
                     </select>
                     <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-hover:text-white transition-colors" />
                  </div>
               </div>
            </div>
         </div>

         {/* Quick Stats Row */}
         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-center gap-3 px-5 py-4 bg-rose-50 rounded-2xl border border-rose-100 shadow-sm hover:shadow-md transition-all">
               <div className="p-3 bg-white text-rose-600 rounded-xl shadow-sm">
                  <Receipt size={20} />
               </div>
               <div>
                  <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wide">Invoices (Today)</p>
                  <p className="text-lg font-black text-rose-900">{stats.invoicesToday}</p>
               </div>
            </div>
            <div className="flex items-center gap-3 px-5 py-4 bg-rose-50 rounded-2xl border border-rose-100 shadow-sm hover:shadow-md transition-all">
               <div className="p-3 bg-white text-rose-600 rounded-xl shadow-sm">
                  <ShoppingBag size={20} />
               </div>
               <div>
                  <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wide">Qty Sold (Today)</p>
                  <p className="text-lg font-black text-rose-900">{stats.qtySoldToday}</p>
               </div>
            </div>
            <div className="flex items-center gap-3 px-5 py-4 bg-rose-50 rounded-2xl border border-rose-100 shadow-sm hover:shadow-md transition-all">
               <div className="p-3 bg-white text-rose-600 rounded-xl shadow-sm">
                  <TrendingUp size={20} />
               </div>
               <div>
                  <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wide">Profit (Today)</p>
                  <p className="text-lg font-black text-rose-900">UGX {stats.profitToday.toLocaleString()}</p>
               </div>
            </div>
            <div className="flex items-center gap-3 px-5 py-4 bg-rose-50 rounded-2xl border border-rose-100 shadow-sm hover:shadow-md transition-all">
               <div className="p-3 bg-white text-rose-600 rounded-xl shadow-sm">
                  <Package size={20} />
               </div>
               <div>
                  <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wide">Inventory Value</p>
                  <p className="text-lg font-black text-rose-900">UGX {stats.inventoryValue.toLocaleString()}</p>
               </div>
            </div>
         </div>

         {/* --- KPI BENTO GRID --- */}
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Revenue Card */}
            <div className="bg-white p-6 rounded-2xl border border-rose-200 shadow-sm hover:shadow-md transition-all group">
               <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl group-hover:scale-110 transition-transform">
                     <DollarSign size={24} />
                  </div>
                  <span className={`flex items-center text-[10px] font-bold px-2 py-1 rounded-full ${stats.revenueTrend >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                     {stats.revenueTrend >= 0 ? <TrendingUp size={12} className="mr-1" /> : <TrendingDown size={12} className="mr-1" />}
                     {Math.abs(stats.revenueTrend).toFixed(0)}%
                  </span>
               </div>
               <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">INCOME ({timeRange.toUpperCase()})</p>
               <h3 className="text-2xl font-black text-slate-900 mt-1">
                  <span className="text-sm text-slate-400 mr-1">UGX</span>
                  {stats.revenue.toLocaleString()}
               </h3>
            </div>

            {/* Orders Card */}
            <div className="bg-white p-6 rounded-2xl border border-blue-200 shadow-sm hover:shadow-md transition-all group">
               <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:scale-110 transition-transform">
                     <ShoppingBag size={24} />
                  </div>
                  <span className={`flex items-center text-[10px] font-bold px-2 py-1 rounded-full ${stats.ordersTrend >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                     {stats.ordersTrend >= 0 ? <TrendingUp size={12} className="mr-1" /> : <TrendingDown size={12} className="mr-1" />}
                     {Math.abs(stats.ordersTrend).toFixed(0)}%
                  </span>
               </div>
               <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">SALES ({timeRange.toUpperCase()})</p>
               <h3 className="text-2xl font-black text-slate-900 mt-1">{stats.orders}</h3>
            </div>

            {/* Repairs Card */}
            <div className="bg-white p-6 rounded-2xl border border-orange-200 shadow-sm hover:shadow-md transition-all group cursor-pointer" onClick={() => onNavigate('repairs')}>
               <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl group-hover:scale-110 transition-transform">
                     <Wrench size={24} />
                  </div>
                  <div className="p-1 bg-slate-50 rounded-full">
                     <ArrowUpRight size={16} className="text-slate-400" />
                  </div>
               </div>
               <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Active Repairs</p>
               <h3 className="text-2xl font-black text-slate-900 mt-1">{stats.repairs}</h3>
            </div>

            {/* Inventory Card */}
            <div className="bg-white p-6 rounded-2xl border border-emerald-200 shadow-sm hover:shadow-md transition-all group cursor-pointer" onClick={() => onNavigate('inventory')}>
               <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:scale-110 transition-transform">
                     <Package size={24} />
                  </div>
                  {stats.lowStockCount > 0 && (
                     <span className="flex items-center text-[10px] font-bold bg-rose-50 text-rose-600 px-2 py-1 rounded-full animate-pulse">
                        <AlertCircle size={12} className="mr-1" /> Low Stock
                     </span>
                  )}
               </div>
               <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Total Products</p>
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
                  <div className="overflow-x-auto">
                     <table className="w-full text-left">
                        <thead className="bg-slate-50/50">
                           <tr>
                              <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Receipt</th>
                              <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Customer</th>
                              <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Amount</th>
                              <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Status</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                           {filteredRecentSales.slice(0, 5).map((sale) => (
                              <tr key={sale.id} className="hover:bg-slate-50 transition-colors">
                                 <td className="px-6 py-4 text-xs font-bold text-slate-600 font-mono">{sale.receiptNo}</td>
                                 <td className="px-6 py-4 text-sm font-medium text-slate-900">{sale.customerName || 'Walk-in Customer'}</td>
                                 <td className="px-6 py-4 text-sm font-bold text-slate-900">UGX {sale.total.toLocaleString()}</td>
                                 <td className="px-6 py-4 text-right">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600">
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

               {/* Low Stock Alerts */}
               <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                     <div className="p-2 bg-rose-100 text-rose-600 rounded-lg">
                        <AlertTriangle size={20} />
                     </div>
                     <h3 className="text-lg font-bold text-slate-900">Low Stock Alerts</h3>
                  </div>

                  <div className="space-y-3">
                     {lowStockItems.length > 0 ? (
                        lowStockItems.map(item => (
                           <div key={item.id} className="flex items-center justify-between p-3 rounded-xl border border-rose-100 bg-rose-50/30">
                              <div className="min-w-0">
                                 <p className="text-sm font-bold text-slate-800 truncate">{item.name}</p>
                                 <p className="text-xs text-rose-600 font-medium">Only {item.stockQuantity} left</p>
                              </div>
                              <button onClick={() => onNavigate('inventory')} className="px-3 py-1.5 bg-white border border-rose-200 text-rose-600 text-[10px] font-bold uppercase rounded-lg hover:bg-rose-50 transition-colors">
                                 Restock
                              </button>
                           </div>
                        ))
                     ) : (
                        <div className="text-center py-6 text-slate-400">
                           <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-500 opacity-50" />
                           <p className="text-sm font-medium">Inventory levels are healthy</p>
                        </div>
                     )}
                  </div>
               </div>

               {/* Top Products */}
               <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-900 mb-4">Top Selling ({timeRange})</h3>
                  <div className="space-y-4">
                     {topProducts.length > 0 ? topProducts.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-3">
                           <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-500 font-bold text-sm">
                              {idx + 1}
                           </div>
                           <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-900 truncate">{item.name}</p>
                              <div className="w-full bg-slate-100 h-1.5 rounded-full mt-1.5 overflow-hidden">
                                 <div className="bg-rose-500 h-full rounded-full" style={{ width: `${Math.min((item.count / (topProducts[0]?.count || 1)) * 100, 100)}%` }}></div>
                              </div>
                           </div>
                           <span className="text-xs font-bold text-slate-600">{item.count}</span>
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
