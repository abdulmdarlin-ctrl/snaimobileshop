
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../db';
import { Expense, UserRole, User, ExpenseCategory } from '../types';
import {
   Plus, Search, Trash2, Edit2, X, ChevronDown,
   Download, Loader2, Check, User as UserIcon, Calendar, Wallet,
   ArrowUpRight, AlertCircle, FileText, Settings, Filter, Table, PieChart as PieIcon,
   AlertTriangle
} from 'lucide-react';
import {
   LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
   PieChart, Pie, Cell
} from 'recharts';
import { exportSectionToPDF } from '../utils/printExport';
import { useToast } from './Toast';

interface ExpensesProps {
   user: User;
}

const months = [
   'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const Expenses: React.FC<ExpensesProps> = ({ user }) => {
   // --- State ---
   const { showToast } = useToast();
   const [expenses, setExpenses] = useState<Expense[]>([]);
   const [categories, setCategories] = useState<ExpenseCategory[]>([]);
   const [loading, setLoading] = useState(true);

   // Modals
   const [isModalOpen, setIsModalOpen] = useState(false);
   const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
   const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

   const [editingId, setEditingId] = useState<string | null>(null);

   // Filter State
   const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
   // Initialize year to at least 2025 (System Start)
   const [selectedYear, setSelectedYear] = useState(Math.max(new Date().getFullYear(), 2025));
   const [historySearch, setHistorySearch] = useState('');

   // Delete State
   const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
   const [categoryToDelete, setCategoryToDelete] = useState<ExpenseCategory | null>(null);
   const [isDeleting, setIsDeleting] = useState(false);

   // Form State
   const [formData, setFormData] = useState({
      category: '',
      description: '',
      amount: 0,
      date: Date.now()
   });

   // Category Management State
   const [newCategoryName, setNewCategoryName] = useState('');

   const isAdmin = user.role === UserRole.ADMIN;

   // --- Data Fetching ---
   useEffect(() => {
      fetchData();
   }, []);

   const fetchData = async () => {
      setLoading(true);
      const [exp, cats] = await Promise.all([
         db.expenses.toArray(),
         db.expenseCategories.toArray()
      ]);
      setExpenses(exp.sort((a, b) => b.date - a.date)); // Newest first
      setCategories(cats);
      if (cats.length > 0 && !formData.category) {
         setFormData(prev => ({ ...prev, category: cats[0].name }));
      }
      setLoading(false);
   };

   // --- Dynamic Year List (From 2025 upwards) ---
   const availableYears = useMemo(() => {
      const currentY = new Date().getFullYear();
      const startY = 2025; // System Commencement
      const years = [];
      // Generate years from current down to start year
      for (let y = Math.max(currentY, startY); y >= startY; y--) {
         years.push(y);
      }
      return years;
   }, []);

   // --- Data Processing for Charts ---
   const filteredStats = useMemo(() => {
      const isYearlyView = selectedMonth === -1;

      const filtered = expenses.filter(e => {
         const d = new Date(e.date);
         if (isYearlyView) {
            return d.getFullYear() === selectedYear;
         }
         return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
      });

      const totalExpenditure = filtered.reduce((sum, e) => sum + Number(e.amount), 0);

      // Category Breakdown
      const catMap: Record<string, number> = {};
      filtered.forEach(e => {
         catMap[e.category] = (catMap[e.category] || 0) + Number(e.amount);
      });

      const categoryData = Object.entries(catMap).map(([name, value], index) => ({
         name,
         value,
         percentage: totalExpenditure > 0 ? (value / totalExpenditure) * 100 : 0,
         color: ['#f43f5e', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899'][index % 6]
      })).sort((a, b) => b.value - a.value);

      // Trend Expenditure (Weekly or Monthly)
      let trendData = [];
      if (isYearlyView) {
         // Monthly breakdown for the year
         const monthlyTotals = new Array(12).fill(0);
         filtered.forEach(e => {
            const d = new Date(e.date);
            monthlyTotals[d.getMonth()] += Number(e.amount);
         });
         trendData = monthlyTotals.map((val, idx) => ({
            name: months[idx],
            value: val
         }));
      } else {
         // Weekly breakdown for the month
         const weeks = [0, 0, 0, 0, 0];
         filtered.forEach(e => {
            const date = new Date(e.date);
            const day = date.getDate();
            const weekIdx = Math.min(Math.floor((day - 1) / 7), 4);
            weeks[weekIdx] += Number(e.amount);
         });
         trendData = [
            { name: 'Week 1', value: weeks[0] },
            { name: 'Week 2', value: weeks[1] },
            { name: 'Week 3', value: weeks[2] },
            { name: 'Week 4+', value: weeks[3] + weeks[4] },
         ];
      }

      // Status / Debt
      const budget = totalExpenditure > 0 ? totalExpenditure * 1.25 : 1000000;
      const remaining = Math.max(0, budget - totalExpenditure);
      const notifiedAmount = totalExpenditure * 0.15;

      return { totalExpenditure, categoryData, trendData, budget, remaining, notifiedAmount, filteredExpenses: filtered, isYearlyView };
   }, [expenses, selectedMonth, selectedYear]);

   // --- Handlers ---
   const handleSave = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!formData.description.trim()) return showToast("Description required", 'error');
      if (Number(formData.amount) <= 0) return showToast("Amount must be positive", 'error');

      if (editingId) {
         await db.expenses.update(editingId, formData);
      } else {
         await db.expenses.add({
            ...formData,
            category: formData.category || (categories[0]?.name || 'General'),
            paidBy: user.fullName || user.username
         });
      }
      setIsModalOpen(false);
      setEditingId(null);
      setFormData({ category: categories[0]?.name || '', description: '', amount: 0, date: Date.now() });
      fetchData();
      showToast('Expense saved', 'success');
   };

   const executeDelete = async () => {
      if (expenseToDelete?.id) {
         setIsDeleting(true);
         await db.expenses.delete(expenseToDelete.id);
         setExpenseToDelete(null);
         fetchData();
         setIsDeleting(false);
         showToast('Expense deleted', 'success');
      }
   };

   const handleAddCategory = async () => {
      if (!newCategoryName.trim()) return;
      try {
         await db.expenseCategories.add({ name: newCategoryName.trim() });
         setNewCategoryName('');
         fetchData();
         showToast('Category added', 'success');
      } catch (e) {
         showToast("Failed to add category. It might already exist.", 'error');
      }
   };

   const confirmDeleteCategory = async () => {
      if (categoryToDelete?.id) {
         setIsDeleting(true);
         await db.expenseCategories.delete(categoryToDelete.id);
         setCategoryToDelete(null);
         fetchData();
         setIsDeleting(false);
         showToast('Category deleted', 'success');
      }
   };

   return (
      <div className="h-[calc(100vh-80px)] flex flex-col font-sans text-slate-800 pb-2 relative animate-in">

         {/* Header Actions */}
         <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 px-1 gap-4 shrink-0 no-print">
            <div>
               <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Expense Manager</h1>
               <div className="flex flex-wrap items-center gap-2 mt-1">
                  <p className="text-sm text-slate-500">Financial Reports & Tracking</p>
                  <div className="h-4 w-px bg-slate-300 mx-2 hidden sm:block"></div>
                  {/* Global Filters */}
                  <div className="flex items-center gap-2">
                     <div className="relative">
                        <select
                           value={selectedMonth}
                           onChange={(e) => setSelectedMonth(Number(e.target.value))}
                           className="bg-white border border-slate-200 text-slate-700 text-xs font-bold py-1.5 pl-3 pr-8 rounded-lg outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-200 appearance-none shadow-sm cursor-pointer transition-all"
                        >
                           <option value={-1}>Full Year</option>
                           {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
                        </select>
                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                     </div>
                     <div className="relative">
                        <select
                           value={selectedYear}
                           onChange={(e) => setSelectedYear(Number(e.target.value))}
                           className="bg-white border border-slate-200 text-slate-700 text-xs font-bold py-1.5 pl-3 pr-8 rounded-lg outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-200 appearance-none shadow-sm cursor-pointer transition-all"
                        >
                           {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                     </div>
                  </div>
               </div>
            </div>

            <div className="flex items-center gap-2">
               <button
                  onClick={() => exportSectionToPDF('#expense-report-area', 'Expense_Report.pdf')}
                  className="bg-white border border-slate-200 text-slate-600 p-2.5 rounded-lg hover:bg-slate-50 transition-all shadow-sm"
                  title="Download Report"
               >
                  <Download size={18} />
               </button>
               <button
                  onClick={() => setIsCategoryModalOpen(true)}
                  className="bg-white border border-slate-200 text-slate-600 px-4 py-2.5 rounded-lg flex items-center gap-2 hover:bg-slate-50 transition-all text-sm font-bold shadow-sm"
               >
                  <Settings size={16} /> Categories
               </button>
               <button
                  onClick={() => {
                     setEditingId(null);
                     setFormData({ category: categories[0]?.name || '', description: '', amount: 0, date: Date.now() });
                     setIsModalOpen(true);
                  }}
                  className="bg-rose-600 text-white pl-4 pr-5 py-2.5 rounded-lg shadow-lg shadow-rose-200 flex items-center gap-2 transition-all hover:bg-rose-700 active:scale-95"
               >
                  <Plus size={18} strokeWidth={2.5} />
                  <span className="font-bold text-sm">New Expense</span>
               </button>
            </div>
         </div>

         <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-y-auto lg:overflow-hidden min-h-0 pr-1" id="expense-report-area">

            {/* --- LEFT COLUMN (4/12) --- */}
            <div className="lg:col-span-4 flex flex-col gap-4 h-full min-h-0">

               {/* Total Expenditure Card */}
               <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden shrink-0">
                  <div className="flex justify-between items-center mb-4">
                     <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                        {filteredStats.isYearlyView ? `${selectedYear} Total Spend` : `${months[selectedMonth]} ${selectedYear} Spend`}
                     </span>
                     <div className="p-2 bg-rose-50 rounded-lg text-rose-500">
                        <Wallet size={18} />
                     </div>
                  </div>

                  <div className="flex items-baseline mb-1">
                     <span className="text-4xl font-bold text-slate-900 tracking-tight">
                        {Math.floor(filteredStats.totalExpenditure).toLocaleString()}
                     </span>
                     <div className="flex flex-col ml-1">
                        <span className="text-lg font-bold text-rose-500 -mb-1">
                           .{filteredStats.totalExpenditure.toFixed(2).split('.')[1]}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">UGX</span>
                     </div>
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium mt-2">
                     Total expenses recorded for the selected period across all categories.
                  </p>
               </div>

               {/* Trend Chart - FIXED HEIGHT */}
               <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex-1 min-h-[180px] flex flex-col">
                  <div className="flex justify-between items-center mb-4 shrink-0">
                     <span className="text-sm font-bold text-slate-700">
                        {filteredStats.isYearlyView ? 'Monthly Trend' : 'Weekly Trend'}
                     </span>
                  </div>
                  <div className="flex-1 w-full min-h-0 -ml-2 relative h-40">
                     <div className="absolute inset-0">
                        <ResponsiveContainer width="100%" height="100%">
                           <LineChart data={filteredStats.trendData}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                              <XAxis
                                 dataKey="name"
                                 axisLine={false}
                                 tickLine={false}
                                 tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                                 dy={10}
                                 interval={0}
                              />
                              <YAxis hide domain={['dataMin', 'dataMax + 1000']} />
                              <Tooltip
                                 cursor={{ stroke: '#e2e8f0', strokeWidth: 2 }}
                                 contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', padding: '8px' }}
                                 itemStyle={{ fontSize: '12px', fontWeight: 'bold', color: '#1e293b' }}
                                 labelStyle={{ fontSize: '10px', color: '#94a3b8', marginBottom: '2px' }}
                                 formatter={(value: any) => [`UGX ${Number(value).toLocaleString()}`, 'Amount']}
                              />
                              <Line
                                 type="monotone"
                                 dataKey="value"
                                 stroke="#f43f5e"
                                 strokeWidth={3}
                                 dot={{ fill: '#fff', stroke: '#f43f5e', strokeWidth: 2, r: 4 }}
                                 activeDot={{ r: 6, fill: '#f43f5e', stroke: '#fff', strokeWidth: 2 }}
                              />
                           </LineChart>
                        </ResponsiveContainer>
                     </div>
                  </div>
               </div>

               {/* Recent Expenses List */}
               <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col h-[240px] shrink-0">
                  <div className="flex justify-between items-center mb-4">
                     <h3 className="text-sm font-bold text-slate-700">Recent Transactions</h3>
                     <button onClick={() => setIsHistoryModalOpen(true)} className="text-xs font-bold text-rose-500 hover:bg-rose-50 px-2 py-1 rounded transition-colors">View All</button>
                  </div>
                  <div className="space-y-3 overflow-y-auto pr-1 custom-scrollbar">
                     {expenses.slice(0, 5).map((expense) => (
                        <div key={expense.id} className="flex items-center justify-between group">
                           <div className="flex items-center gap-3 overflow-hidden">
                              <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 text-slate-400">
                                 <FileText size={16} />
                              </div>
                              <div className="min-w-0">
                                 <p className="text-xs font-bold text-slate-800 truncate">{expense.description}</p>
                                 <div className="flex items-center gap-1">
                                    <span className="text-[9px] text-slate-500 truncate bg-slate-100 px-1.5 py-0.5 rounded">{expense.category}</span>
                                    <span className="text-[9px] text-slate-400">• {new Date(expense.date).toLocaleDateString()}</span>
                                 </div>
                              </div>
                           </div>

                           <div className="flex items-center gap-2 ml-2">
                              <div className="text-right">
                                 <p className="text-xs font-bold text-slate-900">{Number(expense.amount).toLocaleString()}</p>
                              </div>
                              <button onClick={() => setExpenseToDelete(expense)} className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100">
                                 <Trash2 size={12} />
                              </button>
                           </div>
                        </div>
                     ))}
                     {expenses.length === 0 && (
                        <div className="text-center py-8 text-slate-300">
                           <Check size={24} className="mx-auto mb-1 opacity-50" />
                           <p className="text-xs font-bold">No recent expenses</p>
                        </div>
                     )}
                  </div>
               </div>

            </div>

            {/* --- RIGHT COLUMN (8/12) --- */}
            <div className="lg:col-span-8 flex flex-col gap-4 h-full min-h-0">

               {/* Expense Category Breakdown - FIXED HEIGHT */}
               <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex-[3] min-h-[200px] flex flex-col">
                  <div className="flex justify-between items-center mb-4 shrink-0">
                     <div>
                        <span className="text-sm font-bold text-slate-700">Expense Breakdown</span>
                        <p className="text-[10px] text-slate-400 mt-0.5">Distribution by Category</p>
                     </div>
                     <div className="text-xs font-bold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg">
                        {filteredStats.categoryData.length} Categories
                     </div>
                  </div>

                  <div className="flex-1 flex flex-col lg:flex-row items-center gap-8 min-h-0">
                     {/* Pie Chart - Enforce Container Size */}
                     <div className="w-full lg:w-1/3 aspect-square relative shrink-0 max-h-[240px] h-60">
                        <ResponsiveContainer width="100%" height="100%">
                           <PieChart>
                              <Pie
                                 data={filteredStats.categoryData}
                                 dataKey="value"
                                 cx="50%"
                                 cy="50%"
                                 innerRadius="55%"
                                 outerRadius="85%"
                                 paddingAngle={4}
                                 stroke="none"
                                 cornerRadius={6}
                              >
                                 {filteredStats.categoryData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                 ))}
                              </Pie>
                              <Tooltip
                                 formatter={(value: any) => [`UGX ${Number(value).toLocaleString()}`, 'Total']}
                                 contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '12px', fontWeight: 'bold' }}
                              />
                           </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                           <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Total</span>
                           <span className="text-lg font-black text-slate-900">{filteredStats.totalExpenditure > 1000000 ? (filteredStats.totalExpenditure / 1000000).toFixed(1) + 'M' : (filteredStats.totalExpenditure / 1000).toFixed(0) + 'k'}</span>
                        </div>
                     </div>

                     {/* Detailed Table */}
                     <div className="flex-1 h-full w-full overflow-y-auto pr-2 custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                           <thead className="sticky top-0 bg-white z-10 shadow-sm shadow-slate-100">
                              <tr>
                                 <th className="pb-3 pt-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-2">Category Name</th>
                                 <th className="pb-3 pt-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Total Amount</th>
                                 <th className="pb-3 pt-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right pr-2">Share</th>
                              </tr>
                           </thead>
                           <tbody className="space-y-2">
                              {filteredStats.categoryData.map((cat, i) => (
                                 <tr key={i} className="group hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
                                    <td className="py-3 pl-2">
                                       <div className="flex items-center gap-3">
                                          <div className="w-2 h-8 rounded-full shrink-0" style={{ backgroundColor: cat.color }}></div>
                                          <div>
                                             <span className="text-sm font-bold text-slate-700 block">{cat.name}</span>
                                             <div className="h-1.5 w-16 bg-slate-100 rounded-full mt-1 overflow-hidden">
                                                <div className="h-full rounded-full" style={{ width: `${cat.percentage}%`, backgroundColor: cat.color }}></div>
                                             </div>
                                          </div>
                                       </div>
                                    </td>
                                    <td className="py-3 text-right">
                                       <span className="text-sm font-black text-slate-900 block">{cat.value.toLocaleString()}</span>
                                       <span className="text-[10px] text-slate-400 font-bold uppercase">UGX</span>
                                    </td>
                                    <td className="py-3 text-right pr-2">
                                       <span className="inline-block px-2 py-1 bg-slate-100 rounded text-xs font-bold text-slate-600">
                                          {cat.percentage.toFixed(1)}%
                                       </span>
                                    </td>
                                 </tr>
                              ))}
                              {filteredStats.categoryData.length === 0 && (
                                 <tr><td colSpan={3} className="py-12 text-center text-xs text-slate-400">No expenses recorded for this period.</td></tr>
                              )}
                           </tbody>
                        </table>
                     </div>
                  </div>
               </div>

               {/* Financial Health - Squeezed Dashboard - FIXED HEIGHT */}
               <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex-[1] min-h-[140px] flex flex-col justify-center shrink-0">
                  <div className="flex flex-row justify-around items-center h-full gap-8">

                     {/* Gauge 1 */}
                     <div className="flex items-center gap-4 w-full justify-center">
                        <div className="w-24 h-12 relative flex justify-center">
                           <ResponsiveContainer width="100%" height={100}>
                              <PieChart>
                                 <Pie
                                    data={[{ value: filteredStats.remaining }, { value: filteredStats.totalExpenditure }]}
                                    dataKey="value"
                                    startAngle={180}
                                    endAngle={0}
                                    innerRadius={35}
                                    outerRadius={45}
                                    stroke="none"
                                 >
                                    <Cell fill={filteredStats.remaining > 0 ? '#10b981' : '#e2e8f0'} />
                                    <Cell fill={filteredStats.remaining > 0 ? '#e2e8f0' : '#ef4444'} />
                                 </Pie>
                              </PieChart>
                           </ResponsiveContainer>
                           <div className="absolute top-6 flex flex-col items-center">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">Remaining</span>
                              <span className={`text-sm font-black ${filteredStats.remaining < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                                 {(filteredStats.remaining / 1000).toFixed(0)}k
                              </span>
                           </div>
                        </div>

                        <div className="text-center mt-2">
                           <p className="text-[10px] text-slate-400 font-bold uppercase">Target Limit</p>
                           <p className="text-xs font-bold text-slate-900">{(filteredStats.budget / 1000000).toFixed(2)}M</p>
                        </div>
                     </div>
                  </div>
               </div>

            </div>
         </div>

         {/* --- MODALS --- */}

         {/* Add/Edit Expense Modal */}
         {isModalOpen && (
            <div className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in">
               <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-white/20">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                     <h2 className="text-lg font-bold text-slate-900">{editingId ? 'Edit Expense' : 'New Expense'}</h2>
                     <button onClick={() => setIsModalOpen(false)}><X size={20} className="text-slate-400 hover:text-slate-900" /></button>
                  </div>
                  <form onSubmit={handleSave} className="p-6 space-y-4">
                     <div className="space-y-1.5">
                        <label className="win-label">Category</label>
                        <div className="relative">
                           <select
                              className="win-input h-10 appearance-none font-bold"
                              value={formData.category}
                              onChange={e => setFormData({ ...formData, category: e.target.value })}
                           >
                              {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                           </select>
                           <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                        </div>
                     </div>

                     <div className="space-y-1.5">
                        <label className="win-label">Description</label>
                        <input
                           required
                           className="win-input h-10 font-bold"
                           value={formData.description}
                           onChange={e => setFormData({ ...formData, description: e.target.value })}
                           placeholder="e.g. Electricity Bill"
                        />
                     </div>

                     <div className="space-y-1.5">
                        <label className="win-label">Amount (UGX)</label>
                        <input
                           type="number"
                           min="0"
                           required
                           className="win-input h-10 font-bold"
                           value={formData.amount}
                           onChange={e => setFormData({ ...formData, amount: Number(e.target.value) })}
                        />
                     </div>

                     <div className="space-y-1.5">
                        <label className="win-label">Date</label>
                        <input
                           type="date"
                           required
                           className="win-input h-10 font-bold"
                           value={new Date(formData.date).toISOString().split('T')[0]}
                           onChange={e => setFormData({ ...formData, date: new Date(e.target.value).getTime() })}
                        />
                     </div>

                     <button className="w-full py-3 bg-slate-900 text-white rounded-lg font-bold text-sm shadow-lg hover:bg-black transition-all mt-2">
                        {editingId ? 'Update Expense' : 'Record Expense'}
                     </button>
                  </form>
               </div>
            </div>
         )}

         {/* Categories Modal */}
         {isCategoryModalOpen && (
            <div className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in">
               <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-white/20 flex flex-col max-h-[80vh]">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                     <h2 className="text-lg font-bold text-slate-900">Manage Categories</h2>
                     <button onClick={() => setIsCategoryModalOpen(false)}><X size={20} className="text-slate-400 hover:text-slate-900" /></button>
                  </div>

                  <div className="p-4 border-b border-slate-100 bg-white">
                     <div className="flex gap-2">
                        <input
                           className="flex-1 win-input h-10 text-xs font-bold"
                           placeholder="New Category Name"
                           value={newCategoryName}
                           onChange={e => setNewCategoryName(e.target.value)}
                        />
                        <button
                           onClick={handleAddCategory}
                           className="bg-slate-900 text-white px-3 rounded-lg hover:bg-black transition-colors"
                        >
                           <Plus size={16} />
                        </button>
                     </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                     {categories.map(cat => (
                        <div key={cat.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100 group">
                           <span className="text-xs font-bold text-slate-700">{cat.name}</span>
                           <button
                              onClick={() => setCategoryToDelete(cat)}
                              className="text-slate-300 hover:text-red-500 transition-colors"
                           >
                              <Trash2 size={14} />
                           </button>
                        </div>
                     ))}
                  </div>
               </div>
            </div>
         )}

         {/* History Modal (Full List) */}
         {isHistoryModalOpen && (
            <div className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in">
               <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden border border-white/20 flex flex-col max-h-[90vh]">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
                     <div>
                        <h2 className="text-lg font-bold text-slate-900">Expense History</h2>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-0.5">All Transactions</p>
                     </div>
                     <button onClick={() => setIsHistoryModalOpen(false)}><X size={20} className="text-slate-400 hover:text-slate-900" /></button>
                  </div>

                  <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center gap-4">
                     <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input
                           className="w-full pl-9 h-10 bg-white border border-slate-200 rounded-lg text-xs font-bold focus:outline-none focus:border-slate-300"
                           placeholder="Search description or category..."
                           value={historySearch}
                           onChange={e => setHistorySearch(e.target.value)}
                        />
                     </div>
                  </div>

                  <div className="flex-1 overflow-y-auto">
                     <table className="w-full text-left border-collapse">
                        <thead className="bg-white sticky top-0 z-10 border-b border-slate-100 shadow-sm">
                           <tr>
                              <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date</th>
                              <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Description</th>
                              <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Category</th>
                              <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Amount</th>
                              <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                           {expenses.filter(e =>
                              e.description.toLowerCase().includes(historySearch.toLowerCase()) ||
                              e.category.toLowerCase().includes(historySearch.toLowerCase())
                           ).map(expense => (
                              <tr key={expense.id} className="hover:bg-slate-50 transition-colors">
                                 <td className="px-6 py-3 text-xs text-slate-500 font-mono">
                                    {new Date(expense.date).toLocaleDateString()}
                                 </td>
                                 <td className="px-6 py-3 text-xs font-bold text-slate-800">
                                    {expense.description}
                                 </td>
                                 <td className="px-6 py-3">
                                    <span className="px-2 py-1 bg-slate-100 rounded text-[10px] font-bold uppercase text-slate-600">
                                       {expense.category}
                                    </span>
                                 </td>
                                 <td className="px-6 py-3 text-right text-xs font-black text-slate-900">
                                    {Number(expense.amount).toLocaleString()}
                                 </td>
                                 <td className="px-6 py-3 text-right">
                                    <div className="flex justify-end gap-2">
                                       <button
                                          onClick={() => {
                                             setEditingId(expense.id!);
                                             setFormData({
                                                category: expense.category,
                                                description: expense.description,
                                                amount: Number(expense.amount),
                                                date: expense.date
                                             });
                                             setIsHistoryModalOpen(false);
                                             setIsModalOpen(true);
                                          }}
                                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                       >
                                          <Edit2 size={14} />
                                       </button>
                                       <button
                                          onClick={() => setExpenseToDelete(expense)}
                                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                       >
                                          <Trash2 size={14} />
                                       </button>
                                    </div>
                                 </td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               </div>
            </div>
         )}

         {/* Delete Confirmation Modal (Expense) */}
         {expenseToDelete && (
            <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in">
               <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-8 text-center space-y-6 border border-white/20">
                  <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
                     <AlertTriangle size={40} strokeWidth={2} />
                  </div>
                  <div>
                     <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">Confirm Deletion</h3>
                     <p className="text-sm text-slate-500 font-medium mt-2 leading-relaxed">
                        Permanently delete this expense record?
                     </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                     <button onClick={() => setExpenseToDelete(null)} className="py-4 bg-slate-100 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
                     <button onClick={executeDelete} disabled={isDeleting} className="py-4 bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-red-600/20 hover:bg-red-700 transition-all flex items-center justify-center gap-2">
                        {isDeleting ? <Loader2 className="animate-spin" size={14} /> : null} {isDeleting ? 'Deleting...' : 'Delete'}
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* Delete Confirmation Modal (Category) */}
         {categoryToDelete && (
            <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in">
               <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-8 text-center space-y-6 border border-white/20">
                  <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
                     <AlertTriangle size={40} strokeWidth={2} />
                  </div>
                  <div>
                     <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">Remove Category</h3>
                     <p className="text-sm text-slate-500 font-medium mt-2 leading-relaxed">
                        Delete category <b>{categoryToDelete.name}</b>?
                     </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                     <button onClick={() => setCategoryToDelete(null)} className="py-4 bg-slate-100 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
                     <button onClick={confirmDeleteCategory} disabled={isDeleting} className="py-4 bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-red-600/20 hover:bg-red-700 transition-all flex items-center justify-center gap-2">
                        {isDeleting ? <Loader2 className="animate-spin" size={14} /> : null} {isDeleting ? 'Deleting...' : 'Delete'}
                     </button>
                  </div>
               </div>
            </div>
         )}
      </div>
   );
};

export default Expenses;
