
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../db';
import { Sale, Repair, Product, Expense } from '../types';
import {
   LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
   PieChart, Pie, Cell
} from 'recharts';
import {
   Download, Calendar, ChevronDown, TrendingUp, TrendingDown,
   MoreHorizontal, ArrowUpDown, Filter
} from 'lucide-react';
import { exportSectionToPDF } from '../utils/printExport';

type TimeRange = '7d' | '30d' | 'month' | 'year' | 'all';

const Reports: React.FC = () => {
   const [loading, setLoading] = useState(true);
   const [timeRange, setTimeRange] = useState<TimeRange>('30d');
   const [selectedCategory, setSelectedCategory] = useState('All');

   // Sorting State
   const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'revenue', direction: 'desc' });

   const [data, setData] = useState<{
      sales: Sale[];
      repairs: Repair[];
      products: Product[];
      expenses: Expense[];
   }>({ sales: [], repairs: [], products: [], expenses: [] });

   useEffect(() => {
      const fetchData = async () => {
         setLoading(true);
         try {
            const [sales, repairs, products, expenses] = await Promise.all([
               db.sales.toArray(),
               db.repairs.toArray(),
               db.products.toArray(),
               db.expenses.toArray()
            ]);
            setData({ sales, repairs, products, expenses });
         } finally {
            setLoading(false);
         }
      };
      fetchData();
   }, []);

   // Derived Categories
   const categories = useMemo(() => {
      const cats = new Set(data.products.map(p => p.category));
      return ['All', ...Array.from(cats).sort()];
   }, [data.products]);

   // --- ANALYTICS ENGINE ---
   const analytics = useMemo(() => {
      const { sales, repairs, products, expenses } = data;
      const now = new Date();

      // 1. Calculate Date Ranges
      let startCurrent = 0;
      let startPrevious = 0;
      let endPrevious = 0;

      switch (timeRange) {
         case '7d':
            startCurrent = Date.now() - (7 * 86400000);
            startPrevious = startCurrent - (7 * 86400000);
            endPrevious = startCurrent;
            break;
         case '30d':
            startCurrent = Date.now() - (30 * 86400000);
            startPrevious = startCurrent - (30 * 86400000);
            endPrevious = startCurrent;
            break;
         case 'month':
            startCurrent = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
            startPrevious = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
            endPrevious = startCurrent;
            break;
         case 'year':
            startCurrent = new Date(now.getFullYear(), 0, 1).getTime();
            startPrevious = new Date(now.getFullYear() - 1, 0, 1).getTime();
            endPrevious = startCurrent;
            break;
         case 'all':
            startCurrent = 0;
            startPrevious = 0;
            endPrevious = 0;
            break;
      }

      const filterByDate = (items: any[], field: string, start: number, end: number = Date.now()) =>
         items.filter(i => i[field] >= start && i[field] < end);

      // Filter by Date first
      const curSales = filterByDate(sales, 'timestamp', startCurrent);
      const curRepairs = filterByDate(repairs, 'timestamp', startCurrent);
      const curExpenses = filterByDate(expenses, 'date', startCurrent);

      const prevSales = timeRange === 'all' ? [] : filterByDate(sales, 'timestamp', startPrevious, endPrevious);
      const prevRepairs = timeRange === 'all' ? [] : filterByDate(repairs, 'timestamp', startPrevious, endPrevious);
      const prevExpenses = timeRange === 'all' ? [] : filterByDate(expenses, 'date', startPrevious, endPrevious);

      // Helper: Check if item matches category
      const getProductCat = (pid: string) => products.find(p => p.id === pid)?.category || 'General';
      const isCatMatch = (cat: string) => selectedCategory === 'All' || cat === selectedCategory;

      // Metrics Helper
      const calcMetrics = (sList: Sale[], rList: Repair[], eList: Expense[]) => {
         let revenue = 0;
         let cost = 0;
         let itemsCount = 0;
         let orderCount = 0; // Distinct orders containing category items

         // Process Sales
         sList.forEach(s => {
            let hasCategoryItem = false;
            s.items.forEach(i => {
               const cat = getProductCat(i.productId);
               if (isCatMatch(cat)) {
                  revenue += i.total;
                  itemsCount += i.quantity;
                  hasCategoryItem = true;

                  // COGS
                  const prod = products.find(p => p.id === i.productId);
                  const unitCost = (prod?.costPrice && prod.costPrice > 0) ? prod.costPrice : (i.price * 0.7);
                  cost += (unitCost * i.quantity);
               }
            });
            if (hasCategoryItem) orderCount++;
         });

         // Process Repairs (Only if All or specific 'Repair' logic, skipping for product categories)
         // If selectedCategory is 'All', we include repairs. 
         // If selectedCategory matches a product category, we exclude repairs (unless we map repairs to categories later)
         if (selectedCategory === 'All') {
            rList.forEach(r => {
               const val = r.isPaid ? r.estimatedCost : r.depositPaid;
               revenue += val;
               itemsCount += 1;
               orderCount += 1;

               const partsCost = r.partsUsed ? r.partsUsed.reduce((p, part) => p + part.cost, 0) : 0;
               cost += partsCost > 0 ? partsCost : (val * 0.2);
            });
         }

         // Process Expenses
         // If filtering by Product Category, exclude operational expenses from Net Profit to show Contribution Margin
         const expensesTotal = selectedCategory === 'All' ? eList.reduce((a, b) => a + Number(b.amount), 0) : 0;
         const profit = revenue - cost - expensesTotal;

         return { revenue, profit, expenseTotal: expensesTotal, orders: orderCount, items: itemsCount };
      };

      const current = calcMetrics(curSales, curRepairs, curExpenses);
      const previous = calcMetrics(prevSales, prevRepairs, prevExpenses);

      const getChange = (curr: number, prev: number) => {
         if (timeRange === 'all' || prev === 0) return 0;
         return ((curr - prev) / prev) * 100;
      };

      // --- Chart Data ---
      const dailyData = new Map();
      const daysToGen = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : timeRange === 'month' ? 31 : 12;

      if (timeRange !== 'all') {
         for (let i = 0; i < daysToGen; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            dailyData.set(key, { date: key, revenue: 0, profit: 0, expenses: 0, orders: 0 });
         }
      }

      // Populate Daily Data
      curSales.forEach(s => {
         let dailyRev = 0;
         let dailyCost = 0;
         let hasItem = false;

         s.items.forEach(i => {
            const cat = getProductCat(i.productId);
            if (isCatMatch(cat)) {
               dailyRev += i.total;
               const prod = products.find(p => p.id === i.productId);
               const unitCost = (prod?.costPrice && prod.costPrice > 0) ? prod.costPrice : (i.price * 0.7);
               dailyCost += (unitCost * i.quantity);
               hasItem = true;
            }
         });

         if (dailyRev > 0 || hasItem) {
            const d = new Date(s.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            if (!dailyData.has(d) && timeRange === 'all') dailyData.set(d, { date: d, revenue: 0, profit: 0, expenses: 0, orders: 0 });
            if (dailyData.has(d)) {
               const entry = dailyData.get(d);
               entry.revenue += dailyRev;
               entry.profit += (dailyRev - dailyCost);
               if (hasItem) entry.orders += 1;
            }
         }
      });

      if (selectedCategory === 'All') {
         curRepairs.forEach(r => {
            const d = new Date(r.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            if (!dailyData.has(d) && timeRange === 'all') dailyData.set(d, { date: d, revenue: 0, profit: 0, expenses: 0, orders: 0 });
            if (dailyData.has(d)) {
               const entry = dailyData.get(d);
               const val = r.isPaid ? r.estimatedCost : r.depositPaid;
               entry.revenue += val;
               entry.orders += 1;
               entry.profit += (val * 0.3);
            }
         });

         curExpenses.forEach(e => {
            const d = new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            if (!dailyData.has(d) && timeRange === 'all') dailyData.set(d, { date: d, revenue: 0, profit: 0, expenses: 0, orders: 0 });
            if (dailyData.has(d)) dailyData.get(d).expenses += Number(e.amount);
         });
      }

      let chartData = Array.from(dailyData.values());
      if (timeRange === 'all') {
         chartData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      } else {
         chartData = chartData.reverse();
      }

      // --- Splits Data ---
      // 1. Revenue by Category
      const catRevenue: Record<string, number> = {};
      curSales.forEach(s => s.items.forEach(i => {
         const cat = getProductCat(i.productId);
         // Include in pie chart only if it matches filter (which means 100% if single cat selected)
         if (isCatMatch(cat)) {
            catRevenue[cat] = (catRevenue[cat] || 0) + i.total;
         }
      }));
      const splitRevenue = Object.entries(catRevenue).map(([name, value]) => ({ name, value }));

      // 2. Expenses by Category (Hide if filtering product)
      const splitExpenses = selectedCategory === 'All'
         ? Object.entries(curExpenses.reduce((acc: any, e) => {
            acc[e.category] = (acc[e.category] || 0) + Number(e.amount);
            return acc;
         }, {})).map(([name, value]: any) => ({ name, value }))
         : [];

      // 3. Payment Methods (for matching sales)
      const payMethods: Record<string, number> = {};
      curSales.forEach(s => {
         const hasMatch = s.items.some(i => isCatMatch(getProductCat(i.productId)));
         if (hasMatch) {
            payMethods[s.paymentMethod] = (payMethods[s.paymentMethod] || 0) + 1;
         }
      });
      const splitMethods = Object.entries(payMethods).map(([name, value]) => ({ name, value }));

      // --- DETAILED TABLE ---
      const catStats: Record<string, { revenue: number, count: number, cost: number }> = {};
      curSales.forEach(s => {
         s.items.forEach(i => {
            const cat = getProductCat(i.productId);
            if (isCatMatch(cat)) {
               if (!catStats[cat]) catStats[cat] = { revenue: 0, count: 0, cost: 0 };
               catStats[cat].revenue += i.total;
               catStats[cat].count += i.quantity;
               const prod = products.find(p => p.id === i.productId);
               const unitCost = (prod?.costPrice && prod.costPrice > 0) ? prod.costPrice : (i.price * 0.7);
               catStats[cat].cost += (unitCost * i.quantity);
            }
         });
      });

      const tableRows = Object.entries(catStats).map(([name, stats]) => ({
         category: name,
         revenue: stats.revenue,
         itemsSold: stats.count,
         totalCost: stats.cost,
         avgPrice: stats.count > 0 ? stats.revenue / stats.count : 0,
         avgCost: stats.count > 0 ? stats.cost / stats.count : 0,
         profitPerItem: stats.count > 0 ? (stats.revenue - stats.cost) / stats.count : 0
      }));

      if (selectedCategory === 'All') {
         const repairRevenue = curRepairs.reduce((a, r) => a + (r.isPaid ? r.estimatedCost : 0), 0);
         if (repairRevenue > 0) {
            const repairCost = curRepairs.reduce((sum, r) => {
               const partsCost = r.partsUsed ? r.partsUsed.reduce((p, part) => p + part.cost, 0) : 0;
               return sum + partsCost;
            }, 0);
            const finalRepairCost = repairCost > 0 ? repairCost : (repairRevenue * 0.2);
            tableRows.push({
               category: 'Repair Services',
               revenue: repairRevenue,
               itemsSold: curRepairs.length,
               totalCost: finalRepairCost,
               avgPrice: curRepairs.length > 0 ? repairRevenue / curRepairs.length : 0,
               avgCost: curRepairs.length > 0 ? finalRepairCost / curRepairs.length : 0,
               profitPerItem: curRepairs.length > 0 ? (repairRevenue - finalRepairCost) / curRepairs.length : 0
            });
         }
      }

      return {
         overview: [
            { title: 'Total Transactions', value: current.orders, change: getChange(current.orders, previous.orders), format: 'number' },
            { title: 'Avg Order Value', value: current.orders ? current.revenue / current.orders : 0, change: getChange(current.revenue / current.orders, previous.revenue / previous.orders), format: 'currency' },
            { title: 'Gross Revenue', value: current.revenue, change: getChange(current.revenue, previous.revenue), format: 'currency' },
            { title: 'Net Profit', value: current.profit, change: getChange(current.profit, previous.profit), format: 'currency' },
            { title: 'Items Sold', value: current.items, change: getChange(current.items, previous.items), format: 'number' },
            { title: 'Profit Margin', value: current.revenue ? (current.profit / current.revenue) * 100 : 0, change: 0, format: 'percent' },
         ],
         charts: { trend: chartData, splitRevenue, splitExpenses, splitMethods },
         table: tableRows
      };

   }, [data, timeRange, selectedCategory]);

   // ... (Sort logic remains same)
   const handleSort = (key: string) => {
      setSortConfig(current => ({
         key,
         direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc'
      }));
   };

   const sortedTableData = useMemo(() => {
      const items = [...analytics.table];
      return items.sort((a: any, b: any) => {
         const valA = a[sortConfig.key];
         const valB = b[sortConfig.key];

         if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
         if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
         return 0;
      });
   }, [analytics.table, sortConfig]);

   const COLORS = ['#0f172a', '#e11d48', '#64748b', '#cbd5e1', '#f59e0b', '#10b981'];

   return (
      <div className="bg-[#f8fafc] min-h-screen p-4 lg:p-8 font-sans text-slate-900 space-y-8 animate-in fade-in pb-20">

         {/* --- HEADER --- */}
         <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
            <div>
               <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Analytics Dashboard</div>
               <h1 className="text-2xl font-black text-[#0f172a]">Financial Overview</h1>
            </div>

            <div className="flex flex-wrap items-center gap-3">
               {/* Category Filter */}
               <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                     <Filter size={14} className="text-slate-400" />
                  </div>
                  <select
                     value={selectedCategory}
                     onChange={(e) => setSelectedCategory(e.target.value)}
                     className="pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 shadow-sm outline-none cursor-pointer appearance-none h-full focus:ring-2 focus:ring-slate-100"
                  >
                     <option value="All">All Categories</option>
                     {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
               </div>

               {/* Time Range Filter */}
               <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                     <Calendar size={14} className="text-slate-400" />
                  </div>
                  <select
                     value={timeRange}
                     onChange={(e) => setTimeRange(e.target.value as TimeRange)}
                     className="pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 shadow-sm outline-none cursor-pointer appearance-none h-full focus:ring-2 focus:ring-slate-100"
                  >
                     <option value="7d">Last 7 Days</option>
                     <option value="30d">Last 30 Days</option>
                     <option value="month">This Month</option>
                     <option value="year">This Year</option>
                     <option value="all">All Time (System)</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
               </div>

               <button
                  onClick={() => exportSectionToPDF('#reports-container', 'SNA_Report.pdf')}
                  className="bg-white border border-slate-200 p-2.5 rounded-xl text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
                  title="Download PDF"
               >
                  <Download size={18} />
               </button>
            </div>
         </div>

         <div id="reports-container" className="space-y-6">

            {/* --- OVERVIEW CARDS --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-5">
               {analytics.overview.map((item, i) => (
                  <div key={i} className="bg-white rounded-[20px] p-4 shadow-sm border border-slate-200 flex flex-col justify-between min-h-[100px]">
                     <div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">{item.title}</p>
                        <h3 className="text-2xl font-bold text-[#0f172a] mt-1">
                           {item.format === 'currency' && 'UGX '}
                           {item.value.toLocaleString(undefined, { maximumFractionDigits: item.format === 'percent' ? 1 : 0 })}
                           {item.format === 'percent' && '%'}
                        </h3>
                     </div>
                     {timeRange !== 'all' && (
                        <div className="flex items-center gap-1 mt-2">
                           {item.change >= 0 ? (
                              <span className="flex items-center text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                                 <TrendingUp size={10} className="mr-1" /> +{item.change.toFixed(1)}%
                              </span>
                           ) : (
                              <span className="flex items-center text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-full">
                                 <TrendingDown size={10} className="mr-1" /> {item.change.toFixed(1)}%
                              </span>
                           )}
                           <span className="text-[9px] text-slate-400 ml-1">vs prev</span>
                        </div>
                     )}
                  </div>
               ))}
            </div>

            {/* --- CHARTS ROW --- */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
               {/* Chart 1: Revenue vs Profit */}
               <div className="bg-white p-6 rounded-[20px] shadow-sm border border-slate-200">
                  <div className="flex justify-between items-start mb-6">
                     <div>
                        <h3 className="text-lg font-bold text-[#0f172a]">Revenue vs Profit</h3>
                        <div className="flex items-center gap-4 mt-2">
                           <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold">
                              <span className="w-2 h-2 rounded-full bg-[#0f172a]"></span> Revenue
                           </div>
                           <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold">
                              <span className="w-2 h-2 rounded-full bg-[#e11d48]"></span> Profit
                           </div>
                        </div>
                     </div>
                     <button className="bg-slate-50 p-2 rounded-lg text-[#0f172a]"><TrendingUp size={16} /></button>
                  </div>
                  <div className="h-[200px] w-full">
                     <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                        <AreaChart data={analytics.charts.trend}>
                           <defs>
                              <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                 <stop offset="5%" stopColor="#0f172a" stopOpacity={0.1} />
                                 <stop offset="95%" stopColor="#0f172a" stopOpacity={0} />
                              </linearGradient>
                           </defs>
                           <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                           <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                           <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={val => `${val / 1000}k`} />
                           <Tooltip contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                           <Area type="monotone" dataKey="revenue" stroke="#0f172a" strokeWidth={3} fill="url(#colorRev)" />
                           <Line type="monotone" dataKey="profit" stroke="#e11d48" strokeWidth={3} dot={false} />
                        </AreaChart>
                     </ResponsiveContainer>
                  </div>
               </div>

               {/* Chart 2: Expenses Trend */}
               <div className="bg-white p-6 rounded-[20px] shadow-sm border border-slate-200">
                  <div className="flex justify-between items-start mb-6">
                     <div>
                        <h3 className="text-lg font-bold text-[#0f172a]">Expense Trend</h3>
                        <p className="text-[10px] font-bold text-slate-400 mt-1">Daily Spending</p>
                     </div>
                     <div className="bg-slate-50 p-2 rounded-lg text-[#f59e0b]"><TrendingDown size={16} /></div>
                  </div>
                  <div className="h-[200px] w-full">
                     {selectedCategory === 'All' ? (
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                           <LineChart data={analytics.charts.trend}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={val => `${val / 1000}k`} />
                              <Tooltip contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                              <Line type="monotone" dataKey="expenses" stroke="#f59e0b" strokeWidth={3} dot={{ r: 3, fill: '#f59e0b' }} />
                           </LineChart>
                        </ResponsiveContainer>
                     ) : (
                        <div className="h-full flex items-center justify-center text-center p-4">
                           <p className="text-xs text-slate-400 font-medium">Expenses excluded from specific product category view.</p>
                        </div>
                     )}
                  </div>
               </div>

               {/* Chart 3: Sales Count */}
               <div className="bg-white p-6 rounded-[20px] shadow-sm border border-slate-200">
                  <div className="flex justify-between items-start mb-6">
                     <div>
                        <h3 className="text-lg font-bold text-[#0f172a]">Sales Activity</h3>
                        <p className="text-[10px] font-bold text-slate-400 mt-1">Transaction Volume</p>
                     </div>
                     <div className="bg-slate-50 p-2 rounded-lg text-[#10b981]"><TrendingUp size={16} /></div>
                  </div>
                  <div className="h-[200px] w-full">
                     <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                        <AreaChart data={analytics.charts.trend}>
                           <defs>
                              <linearGradient id="colorOrd" x1="0" y1="0" x2="0" y2="1">
                                 <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                                 <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                              </linearGradient>
                           </defs>
                           <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                           <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                           <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                           <Tooltip contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                           <Area type="monotone" dataKey="orders" stroke="#10b981" strokeWidth={3} fill="url(#colorOrd)" />
                        </AreaChart>
                     </ResponsiveContainer>
                  </div>
               </div>
            </div>

            {/* --- SPLITS ROW (Donuts) --- */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
               {/* Split 1: Revenue Categories */}
               <div className="bg-white p-6 rounded-[20px] shadow-sm border border-slate-200 flex flex-col">
                  <h3 className="text-sm font-bold text-[#0f172a] mb-6">Revenue Sources</h3>
                  <div className="flex items-center justify-between flex-1">
                     <div className="w-[120px] h-[120px]">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                           <PieChart>
                              <Pie
                                 data={analytics.charts.splitRevenue}
                                 innerRadius={40}
                                 outerRadius={55}
                                 paddingAngle={5}
                                 dataKey="value"
                                 onClick={(data) => setSelectedCategory(data.name === selectedCategory ? 'All' : data.name)}
                                 cursor="pointer"
                              >
                                 {analytics.charts.splitRevenue.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke={entry.name === selectedCategory ? '#0f172a' : 'none'} strokeWidth={2} />)}
                              </Pie>
                           </PieChart>
                        </ResponsiveContainer>
                     </div>
                     <div className="space-y-2 flex-1 pl-4">
                        {analytics.charts.splitRevenue.slice(0, 3).map((item, i) => (
                           <div key={i} className="flex justify-between items-center text-xs">
                              <div className="flex items-center gap-2">
                                 <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i] }}></span>
                                 <span className="text-slate-400 font-medium">{item.name}</span>
                              </div>
                              <span className="font-bold text-[#0f172a]">{(item.value / 1000).toFixed(0)}k</span>
                           </div>
                        ))}
                     </div>
                  </div>
               </div>

               {/* Split 2: Expense Categories */}
               <div className="bg-white p-6 rounded-[20px] shadow-sm border border-slate-200 flex flex-col">
                  <h3 className="text-sm font-bold text-[#0f172a] mb-6">Cost Breakdown</h3>
                  <div className="flex items-center justify-between flex-1">
                     {selectedCategory === 'All' ? (
                        <>
                           <div className="w-[120px] h-[120px]">
                              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                 <PieChart>
                                    <Pie data={analytics.charts.splitExpenses} innerRadius={40} outerRadius={55} paddingAngle={5} dataKey="value">
                                       {analytics.charts.splitExpenses.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />)}
                                    </Pie>
                                 </PieChart>
                              </ResponsiveContainer>
                           </div>
                           <div className="space-y-2 flex-1 pl-4">
                              {analytics.charts.splitExpenses.slice(0, 3).map((item, i) => (
                                 <div key={i} className="flex justify-between items-center text-xs">
                                    <div className="flex items-center gap-2">
                                       <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[(i + 2) % COLORS.length] }}></span>
                                       <span className="text-slate-400 font-medium">{item.name}</span>
                                    </div>
                                    <span className="font-bold text-[#0f172a]">{(item.value / 1000).toFixed(0)}k</span>
                                 </div>
                              ))}
                           </div>
                        </>
                     ) : (
                        <div className="w-full text-center text-xs text-slate-400">N/A for filtered view</div>
                     )}
                  </div>
               </div>

               {/* Split 3: Payment Methods */}
               <div className="bg-white p-6 rounded-[20px] shadow-sm border border-slate-200 flex flex-col">
                  <h3 className="text-sm font-bold text-[#0f172a] mb-6">Payment Methods</h3>
                  <div className="flex items-center justify-between flex-1">
                     <div className="w-[120px] h-[120px]">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                           <PieChart>
                              <Pie data={analytics.charts.splitMethods} innerRadius={40} outerRadius={55} paddingAngle={5} dataKey="value">
                                 {analytics.charts.splitMethods.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[(index + 4) % COLORS.length]} />)}
                              </Pie>
                           </PieChart>
                        </ResponsiveContainer>
                     </div>
                     <div className="space-y-2 flex-1 pl-4">
                        {analytics.charts.splitMethods.map((item, i) => (
                           <div key={i} className="flex justify-between items-center text-xs">
                              <div className="flex items-center gap-2">
                                 <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[(i + 4) % COLORS.length] }}></span>
                                 <span className="text-slate-400 font-medium">{item.name}</span>
                              </div>
                              <span className="font-bold text-[#0f172a]">{item.value}</span>
                           </div>
                        ))}
                     </div>
                  </div>
               </div>
            </div>

            {/* --- DATA TABLE --- */}
            <div className="bg-white rounded-[20px] p-6 shadow-sm border border-slate-200">
               <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-bold text-[#0f172a]">Detailed Performance</h3>
                  <button className="text-[#0f172a] bg-slate-50 p-2 rounded-lg"><MoreHorizontal size={16} /></button>
               </div>

               <div className="overflow-x-auto">
                  <table className="w-full text-left">
                     <thead>
                        <tr className="border-b border-slate-100">
                           {[
                              { id: 'category', label: 'Category Name', align: 'left' },
                              { id: 'revenue', label: 'Total Revenue', align: 'right' },
                              { id: 'itemsSold', label: 'Items Sold', align: 'right' },
                              { id: 'totalCost', label: 'Total Cost (Est)', align: 'right' },
                              { id: 'avgPrice', label: 'Avg Price / Item', align: 'right' },
                              { id: 'avgCost', label: 'Avg Cost (COGS)', align: 'right' },
                              { id: 'profitPerItem', label: 'Profit / Item', align: 'right' }
                           ].map((col) => (
                              <th
                                 key={col.id}
                                 onClick={() => handleSort(col.id)}
                                 className={`py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-50 hover:text-slate-600 transition-colors select-none ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                              >
                                 <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : 'justify-start'}`}>
                                    {col.label}
                                    <ArrowUpDown size={12} className={`text-slate-300 ${sortConfig.key === col.id ? 'text-rose-500' : ''}`} />
                                 </div>
                              </th>
                           ))}
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-50">
                        {sortedTableData.map((row, i) => (
                           <tr key={i} className="hover:bg-slate-50 transition-colors group">
                              <td className="py-4 text-sm font-bold text-[#0f172a]">{row.category}</td>
                              <td className="py-4 text-right text-sm font-bold text-slate-900">{row.revenue.toLocaleString()}</td>
                              <td className="py-4 text-right text-sm font-bold text-slate-600">{row.itemsSold.toLocaleString()}</td>
                              <td className="py-4 text-right text-sm font-bold text-slate-500">{row.totalCost.toLocaleString()}</td>
                              <td className="py-4 text-right text-sm font-bold text-slate-900">{Math.round(row.avgPrice).toLocaleString()}</td>
                              <td className="py-4 text-right text-sm font-bold text-slate-500">{Math.round(row.avgCost).toLocaleString()}</td>
                              <td className={`py-4 text-right text-sm font-bold ${row.profitPerItem > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                 {Math.round(row.profitPerItem).toLocaleString()}
                              </td>
                           </tr>
                        ))}
                        {sortedTableData.length === 0 && (
                           <tr>
                              <td colSpan={7} className="py-8 text-center text-xs text-slate-400">No data available for this period.</td>
                           </tr>
                        )}
                     </tbody>
                  </table>
               </div>
            </div>

         </div>
      </div>
   );
};

export default Reports;
