
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../db';
import { User, UserRole, Customer, CustomerCategory, CustomerStatus, Sale } from '../types';
import {
    Search, Edit2, Trash2, X, Users,
    Plus, Play, CheckCircle2, AlertCircle,
    MoreHorizontal, Filter, Download, Mail,
    TrendingUp, Award, Clock
} from 'lucide-react';
import { useToast } from './Toast';
import Modal from './Modal';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface CustomersProps { user: User; }

const Customers: React.FC<CustomersProps> = ({ user }) => {
    const { showToast } = useToast();
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<'All' | 'Active' | 'VIP' | 'Inactive'>('All');

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 8;

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
    const [formData, setFormData] = useState<Partial<Customer>>({
        category: CustomerCategory.RETAIL,
        status: CustomerStatus.ACTIVE
    });

    const COLORS = ['#10b981', '#f43f5e', '#f59e0b', '#6366f1']; // Emerald, Rose, Amber, Indigo

    useEffect(() => {
        fetchData();
    }, []);

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, activeTab]);

    const fetchData = async () => {
        const [custData, salesData] = await Promise.all([
            db.customers.toArray(),
            db.sales.toArray()
        ]);

        const enriched = custData.map(c => {
            const cSales = salesData.filter(s => s.customerPhone === c.phone || s.customerName === c.name);
            return {
                ...c,
                totalSpending: cSales.reduce((sum, s) => sum + s.total, 0),
                visitCount: cSales.length
            };
        }) as Customer[];

        setCustomers(enriched.sort((a, b) => b.joinedDate - a.joinedDate)); // Newest first
        setLoading(false);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const payload = {
                ...formData,
                name: formData.name!,
                phone: formData.phone || '',
                joinedDate: editingCustomer ? editingCustomer.joinedDate : Date.now()
            } as Customer;

            if (editingCustomer?.id) {
                await db.customers.update(editingCustomer.id, payload);
            } else {
                await db.customers.add(payload);
            }
            setIsModalOpen(false);
            setEditingCustomer(null);
            fetchData();
            showToast('Client saved successfully', 'success');
        } catch (e) { showToast('Failed to save', 'error'); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure?')) return;
        await db.customers.delete(id);
        fetchData();
        showToast('Client removed', 'success');
    };

    // Filter Logic
    const filteredCustomers = useMemo(() => {
        return customers.filter(c => {
            const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.phone.includes(searchTerm);
            const matchesTab = activeTab === 'All' ? true :
                activeTab === 'VIP' ? c.category === CustomerCategory.VIP :
                    activeTab === 'Active' ? c.status === CustomerStatus.ACTIVE :
                        activeTab === 'Inactive' ? c.status !== CustomerStatus.ACTIVE : true;
            return matchesSearch && matchesTab;
        });
    }, [customers, searchTerm, activeTab]);

    // Pagination Logic
    const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);
    const paginatedCustomers = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredCustomers.slice(start, start + itemsPerPage);
    }, [filteredCustomers, currentPage]);

    // Stats for Widgets
    const stats = useMemo(() => {
        const distribution = [
            { name: 'Retail', value: customers.filter(c => c.category === CustomerCategory.RETAIL).length },
            { name: 'Wholesale', value: customers.filter(c => c.category === CustomerCategory.WHOLESALE).length },
            { name: 'VIP', value: customers.filter(c => c.category === CustomerCategory.VIP).length },
        ].filter(d => d.value > 0);

        const recent = customers.slice(0, 5);

        return { distribution, recent };
    }, [customers]);

    return (
        <div className="min-h-screen bg-slate-50 p-4 lg:p-6 space-y-6 animate-in fade-in font-sans pb-24">

            {/* --- TOP SECTION: QUICK ACTIONS & STATS --- */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">

                {/* 1. Quick Action Card (Col Span 5) */}
                <div className="xl:col-span-5 bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-slate-50 rounded-bl-full -mr-6 -mt-6 transition-transform group-hover:scale-110"></div>

                    <div className="relative z-10 mb-4">
                        <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                            Quick Action <span className="text-slate-400 font-light text-[11px] uppercase tracking-normal">Manage Clients</span>
                        </h2>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 relative z-10">
                        <button onClick={() => { setEditingCustomer(null); setFormData({}); setIsModalOpen(true); }} className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
                            <Plus size={20} />
                            <span className="text-[11px] font-bold uppercase">Add New</span>
                        </button>
                        <button className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors">
                            <Award size={20} />
                            <span className="text-[11px] font-bold uppercase">List VIPs</span>
                        </button>
                        <button className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors">
                            <Download size={20} />
                            <span className="text-[11px] font-bold uppercase">Export</span>
                        </button>
                        <button className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors">
                            <Mail size={20} />
                            <span className="text-[11px] font-bold uppercase">Email</span>
                        </button>
                    </div>
                </div>

                {/* 2. Stats Tickers (Col Span 7) */}
                <div className="xl:col-span-7 grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                        { label: 'Total Clients', value: customers.length, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', trend: '+2.5%' },
                        { label: 'Active VIPs', value: customers.filter(c => c.category === 'VIP').length, icon: Award, color: 'text-amber-600', bg: 'bg-amber-50', trend: '+10%' },
                        { label: 'Total Revenue', value: `${(customers.reduce((a, c) => a + (c.totalSpending || 0), 0) / 1000000).toFixed(1)}M`, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50', trend: '+12%' },
                    ].map((stat, i) => (
                        <div key={i} className="bg-white p-3.5 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stat.bg} ${stat.color}`}>
                                    <stat.icon size={20} />
                                </div>
                                <div>
                                    <p className="text-lg font-bold text-slate-800">{stat.value}</p>
                                    <p className="text-[11px] font-light text-slate-400 uppercase">{stat.label}</p>
                                </div>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{stat.trend}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>


            {/* --- MAIN SPLIT LAYOUT --- */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">

                {/* LEFT PANEL: TABLE (Cols 8) */}
                <div className="xl:col-span-8 space-y-4">
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">

                        {/* Header & Tabs */}
                        <div className="p-4 border-b border-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div>
                                <h3 className="text-base font-bold text-slate-800">Client Directory</h3>
                                <p className="text-xs text-slate-400 font-light mt-0.5">Management Overview</p>
                            </div>

                            <div className="flex bg-slate-50 p-0.5 rounded-lg">
                                {['All', 'Active', 'VIP', 'Inactive'].map(tab => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab as any)}
                                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                    >
                                        {tab}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Search Bar (Optional inline) */}
                        <div className="px-4 py-3 border-b border-slate-50 bg-slate-50/30">
                            <div className="relative max-w-xs">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                <input
                                    className="w-full pl-8 h-8 bg-white border border-slate-100/50 rounded-lg text-xs font-light focus:ring-2 focus:ring-blue-100 outline-none"
                                    placeholder="Search client name..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Table */}
                        <div className="flex-1 overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-slate-50/50">
                                    <tr>
                                        <th className="pl-4 py-3 text-[11px] font-light text-slate-400 uppercase">Client Name</th>
                                        <th className="py-3 text-[11px] font-light text-slate-400 uppercase">Date Joined</th>
                                        <th className="py-3 text-[11px] font-light text-slate-400 uppercase">Progress</th>
                                        <th className="py-3 text-[11px] font-light text-slate-400 uppercase">Amount</th>
                                        <th className="pr-4 py-3 text-[11px] font-light text-slate-400 uppercase">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {paginatedCustomers.map(c => (
                                        <tr key={c.id} className="hover:bg-slate-50/50 transition-colors group cursor-pointer" onClick={() => { setEditingCustomer(c); setFormData(c); setIsModalOpen(true); }}>
                                            <td className="pl-4 py-3">
                                                <div className="flex items-center gap-2.5">
                                                    <div>
                                                        <p className="text-xs font-bold text-slate-800">{c.name}</p>
                                                        <p className="text-[11px] text-slate-400 font-light">{c.category}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-3">
                                                <span className="text-xs font-light text-slate-500">{new Date(c.joinedDate).toLocaleDateString()}</span>
                                            </td>
                                            <td className="py-3 w-40">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                                                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min((c.visitCount || 0) * 5, 100)}%` }}></div>
                                                    </div>
                                                    <span className="text-[11px] font-light text-slate-400">{Math.min((c.visitCount || 0) * 5, 100)}%</span>
                                                </div>
                                            </td>
                                            <td className="py-3">
                                                <span className="text-xs font-bold text-slate-800">{(c.totalSpending || 0).toLocaleString()}</span>
                                            </td>
                                            <td className="pr-4 py-3">
                                                <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase ${c.status === 'Active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
                                                    }`}>
                                                    {c.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                                <div className="p-4 border-t border-slate-50 flex items-center justify-between bg-slate-50/20">
                                    <p className="text-xs text-slate-400 font-light uppercase">Page {currentPage} of {totalPages}</p>
                                    <div className="flex items-center gap-1">
                                        <button
                                            disabled={currentPage === 1}
                                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                            className="w-8 h-8 rounded-lg flex items-center justify-center border border-slate-100 bg-white text-slate-400 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                        >
                                            <CheckCircle2 size={14} className="rotate-180" /> {/* Using icons from existing set */}
                                        </button>

                                        {[...Array(totalPages)].map((_, i) => (
                                            <button
                                                key={i}
                                                onClick={() => setCurrentPage(i + 1)}
                                                className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${currentPage === i + 1 ? 'bg-slate-900 text-white' : 'bg-white border border-slate-100 text-slate-400 hover:border-slate-300'}`}
                                            >
                                                {i + 1}
                                            </button>
                                        ))}

                                        <button
                                            disabled={currentPage === totalPages}
                                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                            className="w-8 h-8 rounded-lg flex items-center justify-center border border-slate-100 bg-white text-slate-400 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                        >
                                            <CheckCircle2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>


                {/* RIGHT PANEL: WIDGETS (Cols 4) */}
                <div className="xl:col-span-4 space-y-6">

                    {/* Widget 1: Client Distribution (Donut) */}
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-4">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-base font-bold text-slate-800">Client Scope</h3>
                            <button className="text-slate-300 hover:text-slate-800"><MoreHorizontal size={18} /></button>
                        </div>
                        <div className="h-64 relative">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={stats.distribution}
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {stats.distribution.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                </PieChart>
                            </ResponsiveContainer>
                            {/* Center Text */}
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className="text-xl font-bold text-slate-800">{customers.length}</span>
                                <span className="text-[11px] font-light text-slate-400 uppercase">Total</span>
                            </div>
                        </div>
                    </div>

                    {/* Widget 2: Recent Activity (List) */}
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-4 flex-1">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-base font-bold text-slate-800">Recent Activity</h3>
                            <span className="bg-slate-50 text-slate-400 text-xs font-light px-1.5 py-0.5 rounded-lg">Last 5</span>
                        </div>
                        <div className="space-y-4">
                            {stats.recent.map((c, i) => (
                                <div key={c.id} className="flex items-start gap-3 p-2 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer group">
                                    <div className="flex-1">
                                        <p className="text-xs font-bold text-slate-800">{c.name}</p>
                                        <p className="text-[11px] text-slate-400 mt-0.5 font-light">{c.category} • {c.phone}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[11px] font-light text-slate-400">{new Date(c.joinedDate).toLocaleDateString()}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button className="w-full mt-4 py-2 bg-slate-50 text-slate-500 rounded-lg text-xs font-light uppercase hover:bg-slate-100 transition-colors">
                            View All History
                        </button>
                    </div>

                </div>
            </div>

            {/* --- MODAL (Existing logic, restyled) --- */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingCustomer ? 'Edit Profile' : 'New Client'}
                maxWidth="lg"
            >
                <form onSubmit={handleSave} className="space-y-5">
                    <div className="space-y-2">
                        <label className="win-label">Client Name</label>
                        <input required className="win-input" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Full Business Name" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="win-label">Phone</label>
                            <input required className="win-input" value={formData.phone || ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} placeholder="+256..." />
                        </div>
                        <div className="space-y-2">
                            <label className="win-label">Category</label>
                            <select className="win-input" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value as any })}>
                                {Object.values(CustomerCategory).map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="flex gap-4 pt-4">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 rounded-xl text-slate-500 font-bold hover:bg-slate-50 transition-colors">Cancel</button>
                        <button type="submit" className="flex-1 py-4 rounded-xl bg-slate-900 text-white font-bold shadow-xl shadow-slate-900/20 hover:bg-black transition-all">Save Client</button>
                    </div>
                </form>
            </Modal>

        </div>
    );
};

export default Customers;