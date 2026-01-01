
import React, { useEffect, useState } from 'react';
import { db } from '../db';
import { Sale, Repair, Product } from '../types';
import { Page } from '../App';
import { 
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { 
  Box, ShoppingCart, Truck, CheckCircle2, AlertCircle, 
  ChevronRight, ArrowUpRight, Package, User as UserIcon,
  ShoppingBag, Activity
} from 'lucide-react';

interface DashboardProps {
  onNavigate: (page: Page) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const [stats, setStats] = useState({
    salesToday: 0,
    salesQty: 0,
    activeRepairs: 0,
    completedRepairs: 0,
    lowStock: 0,
    totalItems: 0,
    totalQty: 0
  });
  
  const [topItems, setTopItems] = useState<{name: string, value: number}[]>([]);
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  
  useEffect(() => {
    const fetchData = async () => {
      const [sales, repairs, products] = await Promise.all([
        db.sales.toArray(),
        db.repairs.toArray(),
        db.products.toArray()
      ]);

      const today = new Date().setHours(0,0,0,0);
      const todaySales = sales.filter(s => s.timestamp >= today);
      
      // Calculate Top Selling
      const itemCounts: Record<string, number> = {};
      sales.forEach(s => s.items.forEach(i => {
        itemCounts[i.name] = (itemCounts[i.name] || 0) + i.quantity;
      }));
      const sortedItems = Object.entries(itemCounts)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 4);

      setStats({
        salesToday: todaySales.length,
        salesQty: todaySales.reduce((acc, s) => acc + s.items.reduce((sum, i) => sum + i.quantity, 0), 0),
        activeRepairs: repairs.filter(r => r.status !== 'Delivered' && r.status !== 'Cancelled').length,
        completedRepairs: repairs.filter(r => r.status === 'Completed').length,
        lowStock: products.filter(p => p.stockQuantity <= p.reorderLevel).length,
        totalItems: products.length,
        totalQty: products.reduce((sum, p) => sum + p.stockQuantity, 0)
      });

      setTopItems(sortedItems);
      setRecentSales(sales.sort((a, b) => b.timestamp - a.timestamp).slice(0, 5));
    };

    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const COLORS = ['#ef4444', '#10b981', '#f59e0b', '#6366f1'];

  return (
    <div className="space-y-6 animate-in pb-10 font-sans">
      
      {/* Sales Activity Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">Business Management System</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          <ActivityCard 
            value={stats.salesQty} 
            label="Qty Sold Today" 
            color="text-blue-600" 
            icon={ShoppingBag}
            subLabel="Verified"
          />
          <ActivityCard 
            value={stats.activeRepairs} 
            label="Active Jobs" 
            color="text-rose-600" 
            icon={Package}
            subLabel="In Workshop"
          />
          <ActivityCard 
            value={stats.completedRepairs} 
            label="Ready for Pickup" 
            color="text-emerald-600" 
            icon={Truck}
            subLabel="To Be Delivered"
          />
          <ActivityCard 
            value={stats.salesToday} 
            label="Invoices Today" 
            color="text-amber-500" 
            icon={CheckCircle2}
            subLabel="Completed"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Left Column (2/3 width) */}
        <div className="xl:col-span-2 space-y-6">
          
          {/* Product Details & Inventory Summary Split */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Product Details */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-6">Product Details</h3>
              <div className="flex items-center">
                 <div className="flex-1 space-y-4">
                    <div className="flex justify-between items-center group cursor-pointer hover:bg-slate-50 p-2 rounded-lg transition-colors" onClick={() => onNavigate('inventory')}>
                       <span className="text-rose-500 font-semibold text-sm">Low Stock Items</span>
                       <span className="text-lg font-bold text-slate-800">{stats.lowStock}</span>
                    </div>
                    <div className="flex justify-between items-center group cursor-pointer hover:bg-slate-50 p-2 rounded-lg transition-colors">
                       <span className="text-slate-600 font-medium text-sm">All Item Groups</span>
                       <span className="text-lg font-bold text-slate-800">14</span>
                    </div>
                    <div className="flex justify-between items-center group cursor-pointer hover:bg-slate-50 p-2 rounded-lg transition-colors">
                       <span className="text-slate-600 font-medium text-sm">All Items</span>
                       <span className="text-lg font-bold text-slate-800">{stats.totalItems}</span>
                    </div>
                 </div>
                 <div className="w-32 h-32 relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Active', value: stats.totalItems - stats.lowStock },
                            { name: 'Low', value: stats.lowStock }
                          ]}
                          innerRadius={40}
                          outerRadius={55}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          <Cell fill="#10b981" />
                          <Cell fill="#ef4444" />
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                       <span className="text-xs font-bold text-slate-400">Status</span>
                    </div>
                 </div>
              </div>
            </div>

            {/* Inventory Summary */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center space-y-8">
               <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Inventory Summary</h3>
               
               <div className="space-y-2">
                 <div className="flex justify-between items-end text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <span>Quantity in Hand</span>
                 </div>
                 <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border-l-4 border-slate-800">
                    <span className="text-2xl font-bold text-slate-800">{stats.totalQty.toLocaleString()}</span>
                    <Box className="text-slate-300" />
                 </div>
               </div>
            </div>
          </div>

          {/* Recent Orders Table (Styled as Sales Order from screenshot) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
             <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Recent Sales</h3>
                <button onClick={() => onNavigate('sales')} className="text-xs text-blue-600 font-semibold hover:underline">View All</button>
             </div>
             <table className="w-full text-left">
                <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase">
                   <tr>
                      <th className="px-6 py-4">Receipt</th>
                      <th className="px-6 py-4">Customer</th>
                      <th className="px-6 py-4 text-center">Status</th>
                      <th className="px-6 py-4 text-right">Amount</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                   {recentSales.map((sale) => (
                      <tr key={sale.id} className="hover:bg-slate-50 transition-colors">
                         <td className="px-6 py-4 text-sm font-semibold text-blue-600">{sale.receiptNo}</td>
                         <td className="px-6 py-4 text-sm text-slate-600">{sale.customerName || 'Walk-in Customer'}</td>
                         <td className="px-6 py-4 text-center">
                            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold uppercase">Paid</span>
                         </td>
                         <td className="px-6 py-4 text-right text-sm font-bold text-slate-700">
                            UGX {sale.total.toLocaleString()}
                         </td>
                      </tr>
                   ))}
                </tbody>
             </table>
          </div>

        </div>

        {/* Right Column */}
        <div className="space-y-6">
           
           {/* Top Selling Items */}
           <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                 <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Top Selling Items</h3>
                 <span className="text-xs font-semibold text-slate-400">This Month</span>
              </div>
              
              <div className="space-y-6">
                 {topItems.length > 0 ? topItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-4 group">
                       <div className="w-16 h-16 bg-slate-100 rounded-lg flex items-center justify-center shrink-0 border border-slate-200 group-hover:border-rose-200 transition-colors">
                          <ShoppingBag className="text-slate-400 group-hover:text-rose-500 transition-colors" size={24} />
                       </div>
                       <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{item.name}</p>
                          <p className="text-xs text-slate-500 mt-1">Hot Item</p>
                       </div>
                       <div className="text-right">
                          <p className="text-lg font-bold text-slate-800">{item.value}</p>
                          <p className="text-[10px] text-slate-400 uppercase">Units</p>
                       </div>
                    </div>
                 )) : (
                    <div className="text-center py-8 text-slate-400 text-sm">No sales data yet.</div>
                 )}
              </div>
           </div>

           {/* Mobile App Promo (Visual Match) */}
           <div className="bg-rose-600 rounded-xl p-6 text-white relative overflow-hidden">
              <div className="relative z-10">
                 <h3 className="text-lg font-bold mb-2">SNA! Mobile App</h3>
                 <p className="text-rose-100 text-xs mb-4 max-w-[200px]">Manage your inventory and sales on the go. Available for technicians.</p>
                 <button className="px-4 py-2 bg-white text-rose-600 rounded-lg text-xs font-bold uppercase hover:bg-rose-50 transition-colors">
                    Download
                 </button>
              </div>
              <Activity className="absolute -right-6 -bottom-6 text-rose-700 opacity-50" size={120} />
           </div>

        </div>
      </div>
    </div>
  );
};

const ActivityCard = ({ value, label, color, icon: Icon, subLabel }: any) => (
  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center text-center hover:shadow-md transition-shadow">
     <div className={`mb-3 ${color}`}>
        <span className="text-4xl font-bold tracking-tight">{value}</span>
        <span className="block text-[10px] font-bold uppercase opacity-60 mt-1">{subLabel}</span>
     </div>
     <div className="flex items-center gap-2 text-slate-500 mt-auto">
        <Icon size={14} className={color.replace('text-', 'stroke-')} />
        <span className="text-xs font-bold uppercase tracking-wide">{label}</span>
     </div>
  </div>
);

export default Dashboard;
