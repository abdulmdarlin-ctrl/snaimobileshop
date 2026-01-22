import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../db';
import { User, UserRole, Customer, CustomerCategory, CustomerStatus, Sale, AppSettings } from '../types';
import {
    Search, Edit2, Trash2, X, Users,
    Plus, Play, CheckCircle2, AlertCircle,
    MoreHorizontal, Filter, Download, Mail,
    TrendingUp, Award, Clock, ChevronLeft, ChevronRight, User as UserIcon,
    Printer, FileText, MessageCircle, UserPlus, Phone, MapPin, Tag,
    ChevronDown, Crown, RefreshCw
} from 'lucide-react';
import { useToast } from './Toast';
import Modal from './Modal';
import { printSection } from '../utils/printExport';
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

    // Statement State
    const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
    const [selectedCustomerForStatement, setSelectedCustomerForStatement] = useState<Customer | null>(null);
    const [customerSales, setCustomerSales] = useState<Sale[]>([]);
    const [isPrinting, setIsPrinting] = useState(false);
    const [settings, setSettings] = useState<AppSettings | null>(null);

    const COLORS = ['#10b981', '#f43f5e', '#f59e0b', '#6366f1']; // Emerald, Rose, Amber, Indigo

    useEffect(() => {
        fetchData();
        fetchSettings();
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

    const fetchSettings = async () => {
        setSettings(await db.settings.toCollection().first() || null);
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

    const handleViewStatement = async (customer: Customer) => {
        setLoading(true);
        const allSales = await db.sales.toArray();
        const sales = allSales.filter(s => s.customerPhone === customer.phone || s.customerName === customer.name);
        setCustomerSales(sales.sort((a, b) => b.timestamp - a.timestamp));
        setSelectedCustomerForStatement(customer);
        setIsStatementModalOpen(true);
        setLoading(false);
    };

    const handleSendWhatsApp = () => {
        if (!selectedCustomerForStatement) return;

        const businessName = settings?.businessName || 'SNA Mobile ERP';
        const totalSpent = customerSales.reduce((sum, s) => sum + s.total, 0).toLocaleString();

        let message = `*Account Statement - ${businessName}*\n\n`;
        message += `*Customer:* ${selectedCustomerForStatement.name}\n`;
        message += `*Total Transactions:* ${customerSales.length}\n`;
        message += `*Total Spent:* ${totalSpent} UGX\n\n`;
        message += `*Recent Purchases:*\n`;

        customerSales.slice(0, 10).forEach(sale => {
            message += `• ${new Date(sale.timestamp).toLocaleDateString()}: ${sale.total.toLocaleString()} UGX (${sale.receiptNo})\n`;
        });

        if (customerSales.length > 10) {
            message += `\n_Showing last 10 transactions._`;
        }

        message += `\n\nThank you for your continued business!`;

        const encodedMessage = encodeURIComponent(message);
        const phone = selectedCustomerForStatement.phone.replace(/\D/g, '');
        window.open(`https://wa.me/${phone}?text=${encodedMessage}`, '_blank');
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure?')) return;
        await db.customers.delete(id);
        fetchData();
        showToast('Client removed', 'success');
    };

    const exportCustomersToCSV = () => {
        if (customers.length === 0) return showToast("No data to export", 'info');
        const headers = ['Name', 'Phone', 'Email', 'Category', 'Status', 'Joined Date', 'Total Spent', 'Visits'];
        const rows = customers.map(c => [
            c.name,
            c.phone,
            c.email || '',
            c.category,
            c.status,
            new Date(c.joinedDate).toLocaleDateString(),
            c.totalSpending || 0,
            c.visitCount || 0
        ]);
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Customers_Report_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        showToast('Exported successfully', 'success');
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
                            Quick Action <span className="text-slate-400 font-normal text-[11px] uppercase tracking-normal">Manage Clients</span>
                        </h2>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 relative z-10">
                        <button onClick={() => { setEditingCustomer(null); setFormData({ category: CustomerCategory.RETAIL, status: CustomerStatus.ACTIVE }); setIsModalOpen(true); }} className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-all duration-300 shadow-sm hover:shadow-blue-200 active:scale-95">
                            <UserPlus size={20} strokeWidth={2.5} />
                            <span className="text-[11px] font-bold uppercase">Add New</span>
                        </button>
                        <button onClick={() => setActiveTab('VIP')} className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-amber-50 text-amber-600 hover:bg-amber-500 hover:text-white transition-all duration-300 shadow-sm hover:shadow-amber-200 active:scale-95">
                            <Crown size={20} strokeWidth={2.5} />
                            <span className="text-[11px] font-bold uppercase">List VIPs</span>
                        </button>
                        <button onClick={exportCustomersToCSV} className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all duration-300 shadow-sm hover:shadow-emerald-200 active:scale-95">
                            <Download size={20} strokeWidth={2.5} />
                            <span className="text-[11px] font-bold uppercase">Export</span>
                        </button>
                        <button onClick={() => { setLoading(true); fetchData(); }} className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-slate-50 text-slate-600 hover:bg-slate-900 hover:text-white transition-all duration-300 shadow-sm hover:shadow-slate-200 active:scale-95">
                            <RefreshCw size={20} strokeWidth={2.5} className={loading ? 'animate-spin' : ''} />
                            <span className="text-[11px] font-bold uppercase">Refresh</span>
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
                                    <p className="text-[11px] font-normal text-slate-400 uppercase">{stat.label}</p>
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
                                <p className="text-xs text-slate-400 font-normal mt-0.5">Management Overview</p>
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
                                    className="w-full pl-8 pr-8 h-10 bg-white border border-slate-100/50 rounded-xl text-xs font-normal focus:ring-2 focus:ring-blue-100 outline-none shadow-sm"
                                    placeholder="Search client name..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                                {searchTerm && (
                                    <button
                                        onClick={() => setSearchTerm('')}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Table */}
                        <div className="flex-1 overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-slate-50/50">
                                    <tr>
                                        <th className="pl-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Client Name</th>
                                        <th className="py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Date Joined</th>
                                        <th className="py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Engagement</th>
                                        <th className="py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Spent</th>
                                        <th className="pr-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                                        <th className="pr-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {paginatedCustomers.map(c => (
                                        <tr key={c.id} className="hover:bg-blue-50/30 transition-colors group cursor-pointer" onClick={() => { setEditingCustomer(c); setFormData(c); setIsModalOpen(true); }}>
                                            <td className="pl-4 py-4">
                                                <div className="flex items-center gap-2.5">
                                                    <div>
                                                        <div className="flex items-center gap-1.5">
                                                            <p className="text-xs font-bold text-slate-800">{c.name}</p>
                                                            {c.category === CustomerCategory.VIP && <Crown size={12} className="text-amber-500 fill-amber-500" />}
                                                        </div>
                                                        <p className="text-[11px] text-slate-400 font-normal">{c.category}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-4">
                                                <span className="text-xs font-normal text-slate-500">{new Date(c.joinedDate).toLocaleDateString()}</span>
                                            </td>
                                            <td className="py-4 w-40">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min((c.visitCount || 0) * 5, 100)}%` }}></div>
                                                    </div>
                                                    <span className="text-[11px] font-bold text-slate-600">{c.visitCount || 0} <span className="font-normal text-slate-400">visits</span></span>
                                                </div>
                                            </td>
                                            <td className="py-4">
                                                <span className="text-xs font-bold text-slate-800">{(c.totalSpending || 0).toLocaleString()} <span className="text-[10px] text-slate-400 font-normal">UGX</span></span>
                                            </td>
                                            <td className="pr-4 py-4">
                                                <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase ${c.status === 'Active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
                                                    }`}>
                                                    {c.status}
                                                </span>
                                            </td>
                                            <td className="pr-4 py-4 text-right">
                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleViewStatement(c); }}
                                                        className="p-1.5 text-slate-400 hover:text-blue-600 bg-white border border-slate-200 rounded-lg shadow-sm transition-colors"
                                                        title="Statement"
                                                    >
                                                        <FileText size={14} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setEditingCustomer(c); setFormData(c); setIsModalOpen(true); }}
                                                        className="p-1.5 text-slate-400 hover:text-indigo-600 bg-white border border-slate-200 rounded-lg shadow-sm transition-colors"
                                                        title="Edit"
                                                    >
                                                        <Edit2 size={14} />
                                                    </button>
                                                    {user.role === UserRole.ADMIN && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDelete(c.id!); }}
                                                            className="p-1.5 text-slate-400 hover:text-red-600 bg-white border border-slate-200 rounded-lg shadow-sm transition-colors"
                                                            title="Delete"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {paginatedCustomers.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="py-20 text-center">
                                                <div className="flex flex-col items-center justify-center text-slate-300">
                                                    <Users size={48} className="mb-4 opacity-20" />
                                                    <p className="text-sm font-bold uppercase tracking-widest">No clients found</p>
                                                    <p className="text-xs mt-1">Try adjusting your search or filters</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>

                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                                <div className="p-4 border-t border-slate-50 flex items-center justify-between bg-slate-50/20">
                                    <p className="text-xs text-slate-400 font-normal uppercase">Page {currentPage} of {totalPages}</p>
                                    <div className="flex items-center gap-1">
                                        <button
                                            disabled={currentPage === 1}
                                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                            className="w-8 h-8 rounded-lg flex items-center justify-center border border-slate-100 bg-white text-slate-400 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                        >
                                            <ChevronLeft size={16} />
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
                                            <ChevronRight size={16} />
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
                                <span className="text-[11px] font-normal text-slate-400 uppercase">Total</span>
                            </div>
                        </div>
                    </div>

                    {/* Widget 2: Recent Activity (List) */}
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-4 flex-1">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-base font-bold text-slate-800">Recent Activity</h3>
                            <span className="bg-slate-50 text-slate-400 text-xs font-normal px-1.5 py-0.5 rounded-lg">Last 5</span>
                        </div>
                        <div className="space-y-4">
                            {stats.recent.map((c, i) => (
                                <div key={c.id} className="flex items-start gap-3 p-2 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer group">
                                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 shrink-0 group-hover:bg-white transition-colors">
                                        <UserIcon size={14} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold text-slate-800 truncate">{c.name}</p>
                                        <p className="text-[11px] text-slate-400 mt-0.5 font-normal truncate">{c.category} • {c.phone}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-[11px] font-normal text-slate-400">{new Date(c.joinedDate).toLocaleDateString()}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button className="w-full mt-4 py-2 bg-slate-50 text-slate-500 rounded-lg text-xs font-normal uppercase hover:bg-slate-100 transition-colors">
                            View All History
                        </button>
                    </div>

                </div>
            </div>

            {/* --- MODAL (Existing logic, restyled) --- */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                            <UserPlus size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">{editingCustomer ? 'Edit Client Profile' : 'Register New Client'}</h2>
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-wide mt-0.5">Customer Relationship Management</p>
                        </div>
                    </div>
                }
                maxWidth="2xl"
                noPadding
            >
                <form onSubmit={handleSave} className="flex flex-col">
                    <div className="p-8 space-y-6 overflow-y-auto max-h-[70vh]">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="win-label">Full Name / Business Name</label>
                                <div className="relative">
                                    <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                    <input required className="win-input pl-12" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. John Doe or Apex Tech" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="win-label">Phone Number</label>
                                <div className="relative">
                                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                    <input required className="win-input pl-12" value={formData.phone || ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} placeholder="+256 700 000 000" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="win-label">Email Address (Optional)</label>
                                <div className="relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                    <input type="email" className="win-input pl-12" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="client@example.com" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="win-label">Client Category</label>
                                <div className="relative">
                                    <Tag className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                    <select className="win-input pl-12 appearance-none" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value as any })}>
                                        {Object.values(CustomerCategory).map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                                </div>
                            </div>
                            <div className="col-span-full space-y-2">
                                <label className="win-label">Physical Address</label>
                                <div className="relative">
                                    <MapPin className="absolute left-4 top-4 text-slate-400" size={18} />
                                    <textarea
                                        className="win-input pl-12 h-24 resize-none py-3"
                                        value={formData.address || ''}
                                        onChange={e => setFormData({ ...formData, address: e.target.value })}
                                        placeholder="Street, Building, Room No..."
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4 shrink-0">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3.5 rounded-2xl text-slate-600 font-bold hover:bg-slate-200 transition-all uppercase text-xs tracking-widest">
                            Cancel
                        </button>
                        <button type="submit" className="flex-1 py-3.5 rounded-2xl bg-slate-900 text-white font-bold shadow-xl shadow-slate-900/20 hover:bg-black transition-all uppercase text-xs tracking-widest flex items-center justify-center gap-2">
                            <CheckCircle2 size={18} />
                            {editingCustomer ? 'Update Profile' : 'Register Client'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* --- STATEMENT MODAL --- */}
            <Modal
                isOpen={isStatementModalOpen && !!selectedCustomerForStatement}
                onClose={() => setIsStatementModalOpen(false)}
                title={
                    <div className="flex flex-col">
                        <span className="text-lg font-bold text-slate-900">Customer Account Statement</span>
                        <span className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-0.5">Transaction History</span>
                    </div>
                }
                maxWidth="4xl"
                noPadding
            >
                <div className="flex-1 overflow-y-auto p-8 bg-slate-200 flex justify-center">
                    <div id="customer-statement" className="receipt-a4-mode bg-white p-8 shadow-xl text-slate-900 w-full max-w-[210mm] min-h-[297mm]">
                        {/* Report Header */}
                        <div className="flex justify-between items-start mb-8 border-b border-slate-900 pb-6">
                            <div>
                                <h1 className="text-2xl font-black uppercase tracking-tight mb-2">Account Statement</h1>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Generated: {new Date().toLocaleDateString()}</p>

                                <div className="mt-6">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Statement For:</p>
                                    <h2 className="text-xl font-bold text-slate-900">{selectedCustomerForStatement?.name}</h2>
                                    <p className="text-sm text-slate-600">{selectedCustomerForStatement?.phone}</p>
                                    <p className="text-xs text-slate-500 uppercase">{selectedCustomerForStatement?.category}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                {settings?.logo && (
                                    <img src={settings.logo} className="h-20 object-contain ml-auto mb-3" alt="Logo" />
                                )}
                                <h2 className="text-lg font-bold text-slate-900 uppercase">{settings?.businessName || 'SNA Mobile ERP'}</h2>
                                <p className="text-xs text-slate-500">{settings?.address}</p>
                                <p className="text-xs text-slate-500">{settings?.phone}</p>
                            </div>
                        </div>

                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 gap-4 mb-8">
                            <div className="p-4 border border-slate-200 rounded-lg">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Transactions</p>
                                <p className="text-xl font-black text-slate-900">
                                    {customerSales.length}
                                </p>
                            </div>
                            <div className="p-4 border border-slate-200 rounded-lg bg-emerald-50/50">
                                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">Total Spent</p>
                                <p className="text-xl font-black text-emerald-700">
                                    {customerSales.reduce((sum, s) => sum + s.total, 0).toLocaleString()} UGX
                                </p>
                            </div>
                        </div>

                        {/* Transaction Table */}
                        <div className="mb-8">
                            <h3 className="text-xs font-black uppercase tracking-widest border-b border-slate-200 pb-2 mb-4 text-slate-500">Purchase History</h3>
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="border-b border-slate-200">
                                        <th className="py-2 font-bold text-slate-500 uppercase">Date</th>
                                        <th className="py-2 font-bold text-slate-500 uppercase">Receipt #</th>
                                        <th className="py-2 font-bold text-slate-500 uppercase">Items</th>
                                        <th className="py-2 font-bold text-slate-500 uppercase text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {customerSales.map((sale, idx) => (
                                        <tr key={idx}>
                                            <td className="py-3 font-mono text-slate-600">{new Date(sale.timestamp).toLocaleDateString()}</td>
                                            <td className="py-3 font-bold text-slate-900">{sale.receiptNo}</td>
                                            <td className="py-3 text-slate-700">
                                                {sale.items.map(i => `${i.name} (x${i.quantity})`).join(', ')}
                                            </td>
                                            <td className="py-3 text-right font-bold text-slate-900">{sale.total.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer / Signatures */}
                        <div className="mt-12 pt-8 border-t-2 border-slate-100">
                            <p className="text-[10px] text-center text-slate-400">Thank you for your continued business!</p>
                            <p className="text-[10px] text-center text-slate-400 mt-2">Printed from SNA Mobile ERP System</p>
                        </div>
                    </div>
                </div>

                <div className="p-5 border-t border-slate-100 bg-white flex gap-4 justify-end no-print">
                    <button onClick={() => setIsStatementModalOpen(false)} className="px-6 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase hover:bg-slate-200 transition-colors">Close</button>
                    <button onClick={handleSendWhatsApp} className="px-6 py-2.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl font-bold text-xs uppercase hover:bg-emerald-100 transition-colors flex items-center gap-2">
                        <MessageCircle size={16} /> WhatsApp
                    </button>
                    <button onClick={() => printSection('#customer-statement')} disabled={isPrinting} className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase hover:bg-black transition-all flex items-center gap-2">
                        <Printer size={16} /> Print Statement
                    </button>
                </div>
            </Modal>

        </div>
    );
};

export default Customers;