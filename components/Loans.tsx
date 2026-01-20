
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../db';
import { Loan, User, UserRole, Product, Agent, AppSettings } from '../types';
import {
    Plus, Search, Edit2, Trash2, X, Users,
    User as UserIcon, Calendar, CheckCircle2, AlertOctagon,
    Loader2, Filter, ChevronDown, Check, XCircle, CreditCard,
    FileText, Box, ArrowLeft, Phone, MapPin, Briefcase, RefreshCw, DollarSign,
    History, AlertTriangle, Printer, Download, Mail
} from 'lucide-react';
import { printSection, exportSectionToPDF } from '../utils/printExport';
import { useToast } from './Toast';

interface LoansProps { user: User; }

const Loans: React.FC<LoansProps> = ({ user }) => {
    // --- STATE ---
    const [view, setView] = useState<'directory' | 'profile'>('directory');
    const [profileTab, setProfileTab] = useState<'active' | 'history'>('active');
    const [agents, setAgents] = useState<Agent[]>([]);
    const [loans, setLoans] = useState<Loan[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [settings, setSettings] = useState<AppSettings | null>(null);

    const { showToast } = useToast();
    // Use ID to track selected agent for robust updates
    const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

    // UI State
    const [searchTerm, setSearchTerm] = useState('');
    const [loanSearchTerm, setLoanSearchTerm] = useState(''); // New: Filter loans within profile
    const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
    const [isStockModalOpen, setIsStockModalOpen] = useState(false);
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [isReportOpen, setIsReportOpen] = useState(false); // New Report Modal State

    const [isSaving, setIsSaving] = useState(false);
    // Report Action States
    const [isPrinting, setIsPrinting] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [statusUpdateId, setStatusUpdateId] = useState<string | null>(null);

    // Delete State
    const [agentToDelete, setAgentToDelete] = useState<Agent | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Forms
    const agentFormInitial: Partial<Agent> = { name: '', phone: '', email: '', nin: '', location: '', status: 'Active' };
    const [agentForm, setAgentForm] = useState<Partial<Agent>>(agentFormInitial);

    const stockFormInitial: Partial<Loan> = {
        deviceModel: '',
        productId: '',
        imei: '',
        provider: 'TAKE NOW',
        deposit: 0,
        totalLoanAmount: 0,
        dailyInstallment: 0,
        startDate: Date.now(),
        status: 'Active',
        notes: ''
    };
    const [stockForm, setStockForm] = useState<Partial<Loan>>(stockFormInitial);

    const statusFormInitial = { status: 'Active', remittedAmount: 0, notes: '' };
    const [statusForm, setStatusForm] = useState(statusFormInitial);

    const canModify = [UserRole.ADMIN, UserRole.MANAGER].includes(user.role);

    // Derived State
    const selectedAgent = useMemo(() => agents.find(a => a.id === selectedAgentId) || null, [agents, selectedAgentId]);

    // --- FETCH DATA ---
    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        const [a, l, p, s] = await Promise.all([
            db.agents.toArray(),
            db.loans.toArray(),
            db.products.toArray(),
            db.settings.toCollection().first()
        ]);
        setAgents(a.sort((x, y) => x.name.localeCompare(y.name)));
        setLoans(l.sort((x, y) => y.timestamp - x.timestamp));
        setProducts(p.filter(prod => prod.stockQuantity > 0));
        setSettings(s || null);
    };

    // --- ACTIONS ---
    const handleSaveAgent = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            if (!agentForm.name) throw new Error("Agent Name Required");
            if (!agentForm.phone) throw new Error("Phone Number Required");

            // Sanitize Payload to prevent circular references and unwanted fields
            const payload: Partial<Agent> = {
                name: agentForm.name,
                phone: agentForm.phone,
                email: agentForm.email || '',
                nin: agentForm.nin || '',
                location: agentForm.location || '',
                status: agentForm.status || 'Active'
            };

            if (editingId) {
                await db.agents.update(editingId, payload);
                // Sync Agent Name Update to Loans
                if (payload.name) {
                    const linkedLoans = loans.filter(l => l.agentId === editingId);
                    for (const l of linkedLoans) {
                        await db.loans.update(l.id!, { customerName: payload.name, customerPhone: payload.phone || l.customerPhone });
                    }
                }
            } else {
                await db.agents.add({ ...payload, joinedDate: Date.now() } as Agent);
            }
            setIsAgentModalOpen(false);
            setEditingId(null);
            fetchData();
            showToast('Agent profile saved', 'success');
        } catch (err: any) { showToast(err.message, 'error'); } finally { setIsSaving(false); }
    };

    const handleIssueStock = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedAgent) return;
        setIsSaving(true);
        try {
            // Manual Entry Validation
            if (!stockForm.deviceModel) throw new Error("Device Model Required");
            if (!stockForm.imei) throw new Error("Serial/IMEI Required");

            const payload: Loan = {
                ...stockForm as Loan,
                agentId: selectedAgent.id,
                customerName: selectedAgent.name,
                customerPhone: selectedAgent.phone,
                customerNIN: selectedAgent.nin,
                timestamp: Date.now(),
                issuedBy: user.username,
                status: 'Active',
                remittedAmount: stockForm.deposit || 0
            };

            await db.loans.add(payload);

            // Stock Deduction (Only if product was selected from inventory)
            if (stockForm.productId) {
                const prod = products.find(p => p.id === stockForm.productId);
                if (prod && prod.id) {
                    await db.products.update(prod.id, { stockQuantity: prod.stockQuantity - 1 });
                    await db.stockLogs.add({
                        productId: prod.id,
                        productName: prod.name,
                        previousStock: prod.stockQuantity,
                        newStock: prod.stockQuantity - 1,
                        changeAmount: -1,
                        reason: 'Agent Issue',
                        note: `Issued to ${selectedAgent.name} (Ref: ${stockForm.imei})`,
                        user: user.username,
                        timestamp: Date.now()
                    });
                }
            }

            setIsStockModalOpen(false);
            setStockForm(stockFormInitial);
            fetchData(); // Refresh loan list
            showToast('Stock issued successfully', 'success');
        } catch (err: any) { showToast(err.message, 'error'); } finally { setIsSaving(false); }
    };

    const handleUpdateStatus = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!statusUpdateId) return;
        setIsSaving(true);
        try {
            const loan = loans.find(l => l.id === statusUpdateId);
            if (!loan) throw new Error("Record not found");

            const updates: any = {
                status: statusForm.status,
                notes: statusForm.notes,
                remittedAmount: Number(statusForm.remittedAmount) || 0
            };

            if (statusForm.status === 'Sold' && loan.status !== 'Sold') {
                updates.soldDate = Date.now();
            }

            await db.loans.update(statusUpdateId, updates);

            setIsStatusModalOpen(false);
            setStatusUpdateId(null);
            fetchData();
            showToast('Status updated', 'success');
        } catch (e: any) { showToast(e.message, 'error'); } finally { setIsSaving(false); }
    };

    const confirmDeleteAgent = async () => {
        if (!agentToDelete?.id) return;
        setIsDeleting(true);
        try {
            await db.agents.delete(agentToDelete.id);
            // Navigate back first to avoid rendering null selectedAgent if we deleted the currently viewed one
            if (selectedAgentId === agentToDelete.id) {
                setView('directory');
                setSelectedAgentId(null);
            }
            setAgentToDelete(null);
            fetchData();
            showToast('Agent deleted', 'success');
        } catch (e) {
            console.error("Delete failed", e);
            showToast("Failed to delete agent.", 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    const handlePrintReport = () => {
        setIsPrinting(true);
        // Short delay to ensure state and DOM are stable before printing
        setTimeout(() => {
            printSection('#agent-report', () => setIsPrinting(false));
        }, 100);
    };

    const handleDownloadReport = async () => {
        if (!selectedAgent) return;
        setIsDownloading(true);
        try {
            const safeName = selectedAgent.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const dateStr = new Date().toISOString().split('T')[0];
            const filename = `Statement_${safeName}_${dateStr}.pdf`;

            await exportSectionToPDF('#agent-report', filename);
        } catch (error) {
            console.error("Download failed", error);
            showToast("Failed to download PDF.", 'error');
        } finally {
            setIsDownloading(false);
        }
    };

    const handleEmailReport = () => {
        if (!selectedAgent?.email) {
            showToast("Agent email not found. Please update profile.", 'error');
            return;
        }
        const subject = `Account Statement - ${selectedAgent.name}`;
        const body = `Dear ${selectedAgent.name},\n\nPlease find attached your account statement.\n\nRegards,\n${settings?.businessName || 'Management'}`;
        window.location.href = `mailto:${selectedAgent.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        showToast("Opening email client...", 'info');
    };

    const handleProductSelect = (pid: string) => {
        if (!pid) {
            // Manual Entry Mode - Clear fields but enable editing
            setStockForm(prev => ({
                ...prev,
                productId: '',
                deviceModel: '',
                provider: 'TAKE NOW',
                totalLoanAmount: 0
            }));
            return;
        }

        const p = products.find(x => x.id === pid);
        if (p) {
            setStockForm(prev => ({
                ...prev,
                productId: p.id,
                deviceModel: p.brand ? `${p.brand} ${p.name}` : p.name,
                provider: 'TAKE NOW',
                totalLoanAmount: p.selling_price
            }));
        }
    };

    const openStatusModal = (loan: Loan) => {
        setStatusUpdateId(loan.id!);
        setStatusForm({
            status: loan.status,
            remittedAmount: loan.remittedAmount || loan.deposit || 0,
            notes: loan.notes || ''
        });
        setIsStatusModalOpen(true);
    };

    // --- FILTERS ---
    const filteredAgents = agents.filter(a => a.name.toLowerCase().includes(searchTerm.toLowerCase()));

    // Specific loans for the selected agent
    const agentLoans = useMemo(() => {
        if (!selectedAgent) return [];
        return loans.filter(l => l.agentId === selectedAgent.id || l.customerName === selectedAgent.name);
    }, [loans, selectedAgent]);

    const filteredAgentLoans = useMemo(() => {
        let data = agentLoans;

        // Tab Filter
        if (profileTab === 'active') {
            data = data.filter(l => l.status === 'Active');
        }
        // 'history' implies ALL records

        if (!loanSearchTerm) return data;
        const term = loanSearchTerm.toLowerCase();
        return data.filter(l =>
            l.deviceModel.toLowerCase().includes(term) ||
            l.imei.toLowerCase().includes(term) ||
            l.status.toLowerCase().includes(term)
        );
    }, [agentLoans, loanSearchTerm, profileTab]);

    const agentStats = useMemo(() => {
        if (!selectedAgent) return { totalValue: 0, paid: 0, items: 0 };

        const activeOnly = agentLoans.filter(l => l.status === 'Active');

        return {
            items: activeOnly.length, // Active Items
            totalValue: activeOnly.reduce((sum, l) => sum + l.totalLoanAmount, 0), // Active Liability
            paid: agentLoans.reduce((sum, l) => sum + (l.remittedAmount || l.deposit || 0), 0) // Lifetime Payments
        };
    }, [agentLoans]);

    // --- VIEWS ---

    if (view === 'directory') {
        return (
            <div className="space-y-6 pb-20 font-sans">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 no-print">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Consignment Management</h1>
                        <p className="text-sm text-slate-500 mt-1">Manage field agents and consignment stock.</p>
                    </div>
                    <button
                        onClick={() => { setEditingId(null); setAgentForm(agentFormInitial); setIsAgentModalOpen(true); }}
                        className="flex items-center gap-2 px-5 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold shadow-lg hover:bg-black transition-all"
                    >
                        <Plus size={18} /> Register Agent
                    </button>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                    <Search className="text-slate-400" size={18} />
                    <input
                        className="flex-1 bg-transparent outline-none text-sm font-bold placeholder:font-normal"
                        placeholder="Search agents..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredAgents.map(agent => {
                        // Quick calc stats for card
                        const myLoans = loans.filter(l => l.agentId === agent.id);
                        const activeLoans = myLoans.filter(l => l.status === 'Active');

                        return (
                            <div key={agent.id} onClick={() => { setSelectedAgentId(agent.id!); setView('profile'); setLoanSearchTerm(''); setProfileTab('active'); }} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer group relative">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 font-bold text-lg uppercase border border-slate-100">
                                            {agent.name.charAt(0)}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-900">{agent.name}</h3>
                                            <p className="text-xs text-slate-500">{agent.phone}</p>
                                        </div>
                                    </div>
                                    <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${agent.status === 'Active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                                        {agent.status}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-50">
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">Active Stock</p>
                                        <p className="text-lg font-bold text-slate-900">{activeLoans.length}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">Value Issued</p>
                                        <p className="text-lg font-bold text-slate-900">{myLoans.reduce((s, l) => s + l.totalLoanAmount, 0).toLocaleString()}</p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {filteredAgents.length === 0 && (
                        <div className="col-span-full py-20 text-center text-slate-400">
                            <Users size={48} className="mx-auto mb-4 opacity-20" />
                            <p className="text-sm font-medium">No agents found. Register one to get started.</p>
                        </div>
                    )}
                </div>

                {/* --- REGISTER AGENT MODAL --- */}
                {isAgentModalOpen && (
                    <div className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in !mt-0">
                        <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-white/20">
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                                <h2 className="text-lg font-bold text-slate-900">{editingId ? 'Edit Profile' : 'New Agent Profile'}</h2>
                                <button onClick={() => setIsAgentModalOpen(false)}><X size={20} className="text-slate-400 hover:text-slate-900" /></button>
                            </div>
                            <form onSubmit={handleSaveAgent} className="p-6 space-y-4">
                                <div className="space-y-1.5">
                                    <label className="win-label">Full Name</label>
                                    <input required className="win-input h-10 font-bold" value={agentForm.name} onChange={e => setAgentForm({ ...agentForm, name: e.target.value })} placeholder="e.g. John Doe" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="win-label">Phone Number</label>
                                    <input required className="win-input h-10" value={agentForm.phone} onChange={e => setAgentForm({ ...agentForm, phone: e.target.value })} placeholder="+256..." />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="win-label">ID / NIN</label>
                                    <input className="win-input h-10 uppercase" value={agentForm.nin || ''} onChange={e => setAgentForm({ ...agentForm, nin: e.target.value })} placeholder="National ID" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="win-label">Region / Location</label>
                                    <input className="win-input h-10" value={agentForm.location || ''} onChange={e => setAgentForm({ ...agentForm, location: e.target.value })} placeholder="e.g. Kampala Central" />
                                </div>
                                {/* Status Field added here */}
                                <div className="space-y-1.5">
                                    <label className="win-label">Account Status</label>
                                    <select
                                        className="win-input h-10 font-bold"
                                        value={agentForm.status}
                                        onChange={e => setAgentForm({ ...agentForm, status: e.target.value as 'Active' | 'Inactive' })}
                                    >
                                        <option value="Active">Active</option>
                                        <option value="Inactive">Inactive</option>
                                    </select>
                                </div>
                                <div className="pt-4">
                                    <button disabled={isSaving} className="w-full py-3 bg-slate-900 text-white rounded-lg font-bold text-sm shadow-lg hover:bg-black transition-all flex items-center justify-center gap-2">
                                        {isSaving && <Loader2 className="animate-spin" size={14} />} {isSaving ? 'Saving...' : 'Save Agent Profile'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // --- PROFILE VIEW ---
    return (
        <div className="space-y-6 pb-20 font-sans h-full flex flex-col">
            {/* Header / Nav */}
            <div className="flex items-center gap-4 border-b border-slate-200 pb-4 shrink-0">
                <button onClick={() => setView('directory')} className="p-2 hover:bg-white rounded-full transition-colors border border-transparent hover:border-slate-200 text-slate-500">
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-xl font-bold text-slate-900">{selectedAgent?.name}</h1>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${selectedAgent?.status === 'Active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                            {selectedAgent?.status}
                        </span>
                    </div>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">{selectedAgent?.location || 'No Location'} • {selectedAgent?.phone} {selectedAgent?.email && `• ${selectedAgent.email}`}</p>
                </div>
                <div className="ml-auto flex gap-2">
                    <button
                        onClick={() => setIsReportOpen(true)}
                        className="p-2 text-slate-400 hover:text-slate-900 bg-white border border-slate-200 rounded-lg shadow-sm transition-colors"
                        title="Generate Statement"
                    >
                        <FileText size={16} />
                    </button>
                    <button
                        onClick={() => {
                            if (selectedAgent) {
                                setEditingId(selectedAgent.id!);
                                // Clone safe properties to avoid circular references
                                setAgentForm({
                                    name: selectedAgent.name,
                                    phone: selectedAgent.phone,
                                    email: selectedAgent.email,
                                    nin: selectedAgent.nin,
                                    location: selectedAgent.location,
                                    status: selectedAgent.status
                                });
                                setIsAgentModalOpen(true);
                            }
                        }}
                        className="p-2 text-slate-400 hover:text-blue-600 bg-white border border-slate-200 rounded-lg shadow-sm"
                        title="Edit Agent"
                    >
                        <Edit2 size={16} />
                    </button>
                    {canModify && (
                        <button
                            onClick={() => selectedAgent && setAgentToDelete(selectedAgent)}
                            className="p-2 text-slate-400 hover:text-red-600 bg-white border border-slate-200 rounded-lg shadow-sm"
                            title="Delete Agent"
                        >
                            <Trash2 size={16} />
                        </button>
                    )}
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-4 shrink-0">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Active Stock</p>
                    <p className="text-2xl font-bold text-slate-900">{agentStats.items}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Stock Value</p>
                    <p className="text-2xl font-bold text-slate-900">{agentStats.totalValue.toLocaleString()}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Total Remitted</p>
                    <p className="text-2xl font-bold text-emerald-600">{agentStats.paid.toLocaleString()}</p>
                </div>
            </div>

            {/* Main Content: Stock List */}
            <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden min-h-[400px]">
                <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-center bg-slate-50 gap-4">
                    <div className="flex items-center gap-4 w-full sm:w-auto">
                        {/* Tabs */}
                        <div className="flex p-1 bg-slate-200 rounded-lg shrink-0">
                            <button
                                onClick={() => setProfileTab('active')}
                                className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wide flex items-center gap-2 transition-all ${profileTab === 'active' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <Box size={14} /> Active Stock
                            </button>
                            <button
                                onClick={() => setProfileTab('history')}
                                className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wide flex items-center gap-2 transition-all ${profileTab === 'history' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <History size={14} /> Transaction History
                            </button>
                        </div>

                        <div className="relative flex-1 sm:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                            <input
                                className="w-full pl-9 h-9 text-xs font-bold bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-300"
                                placeholder="Search items..."
                                value={loanSearchTerm}
                                onChange={e => setLoanSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                    <button
                        onClick={() => { setEditingId(null); setStockForm(stockFormInitial); setIsStockModalOpen(true); }}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold uppercase tracking-wide hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
                    >
                        <Plus size={14} strokeWidth={3} /> Issue Stock
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    <table className="w-full text-left">
                        <thead className="bg-white border-b border-slate-100 sticky top-0 z-10">
                            <tr>
                                <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Device / Model</th>
                                <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Provider</th>
                                <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Value</th>
                                <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">Date</th>
                                <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">Status</th>
                                <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredAgentLoans.map(l => (
                                <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-3">
                                        <p className="text-xs font-bold text-slate-900">{l.deviceModel}</p>
                                        <p className="text-[10px] text-slate-500 font-mono">{l.imei}</p>
                                    </td>
                                    <td className="px-6 py-3">
                                        <span className="px-2 py-1 bg-slate-100 rounded text-[9px] font-bold uppercase text-slate-600">{l.provider}</span>
                                    </td>
                                    <td className="px-6 py-3 text-right">
                                        <p className="text-xs font-bold text-slate-900">{l.totalLoanAmount.toLocaleString()}</p>
                                        {(l.remittedAmount || l.deposit) > 0 && <p className="text-[9px] text-emerald-600 font-bold">Paid: {(l.remittedAmount || l.deposit).toLocaleString()}</p>}
                                    </td>
                                    <td className="px-6 py-3 text-center text-xs text-slate-500">
                                        {new Date(l.startDate).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-3 text-center">
                                        <span className={`px-2 py-1 rounded text-[9px] font-bold uppercase border ${l.status === 'Active' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                            l.status === 'Sold' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                                l.status === 'Defaulted' ? 'bg-red-50 text-red-600 border-red-100' :
                                                    'bg-slate-50 text-slate-500'
                                            }`}>
                                            {l.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3 text-right">
                                        <button
                                            onClick={() => openStatusModal(l)}
                                            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold uppercase text-slate-600 hover:border-slate-300 transition-all shadow-sm"
                                        >
                                            {l.status === 'Sold' ? 'View Sale' : 'Update / Sell'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {filteredAgentLoans.length === 0 && (
                                <tr><td colSpan={6} className="py-12 text-center text-slate-400 text-xs font-bold uppercase">No records found in {profileTab}</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* --- AGENT REPORT MODAL --- */}
            {isReportOpen && selectedAgent && (
                <div className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in">
                    <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden border border-white/20 flex flex-col max-h-[90vh]">
                        <div className="p-5 border-b border-slate-100 flex items-center justify-between no-print bg-slate-50">
                            <div>
                                <h2 className="text-lg font-bold text-slate-900">Agent Account Statement</h2>
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-0.5">Generate Report</p>
                            </div>
                            <button onClick={() => setIsReportOpen(false)} className="p-2 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition-colors"><X size={20} /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 bg-slate-200 flex justify-center">
                            <div id="agent-report" className="receipt-a4-mode bg-white p-8 shadow-xl text-slate-900 w-full max-w-[210mm] min-h-[297mm]">
                                {/* Report Header */}
                                <div className="flex justify-between items-start mb-8 border-b border-slate-900 pb-6">
                                    <div>
                                        <h1 className="text-2xl font-black uppercase tracking-tight mb-2">Account Statement</h1>
                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Generated: {new Date().toLocaleDateString()}</p>

                                        <div className="mt-6">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Statement For:</p>
                                            <h2 className="text-xl font-bold text-slate-900">{selectedAgent.name}</h2>
                                            <p className="text-sm text-slate-600">{selectedAgent.phone}</p>
                                            {selectedAgent.email && <p className="text-xs text-slate-500">{selectedAgent.email}</p>}
                                            <p className="text-xs text-slate-500 uppercase">{selectedAgent.location || 'N/A'}</p>
                                            {selectedAgent.nin && <p className="text-xs text-slate-500 font-mono mt-1">ID: {selectedAgent.nin}</p>}
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
                                <div className="grid grid-cols-3 gap-4 mb-8">
                                    <div className="p-4 border border-slate-200 rounded-lg">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Issued</p>
                                        <p className="text-xl font-black text-slate-900">
                                            {agentLoans.reduce((sum, l) => sum + l.totalLoanAmount, 0).toLocaleString()}
                                        </p>
                                    </div>
                                    <div className="p-4 border border-slate-200 rounded-lg bg-emerald-50/50">
                                        <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">Total Paid</p>
                                        <p className="text-xl font-black text-emerald-700">
                                            {agentLoans.reduce((sum, l) => sum + (l.remittedAmount || l.deposit || 0), 0).toLocaleString()}
                                        </p>
                                    </div>
                                    <div className="p-4 border border-slate-200 rounded-lg bg-red-50/50">
                                        <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider mb-1">Outstanding Balance</p>
                                        <p className="text-xl font-black text-red-700">
                                            {(agentLoans.reduce((sum, l) => sum + l.totalLoanAmount, 0) - agentLoans.reduce((sum, l) => sum + (l.remittedAmount || l.deposit || 0), 0)).toLocaleString()}
                                        </p>
                                    </div>
                                </div>

                                {/* Transaction Table */}
                                <div className="mb-8">
                                    <h3 className="text-xs font-black uppercase tracking-widest border-b border-slate-200 pb-2 mb-4 text-slate-500">Transaction History</h3>
                                    <table className="w-full text-left text-xs">
                                        <thead>
                                            <tr className="border-b border-slate-200">
                                                <th className="py-2 font-bold text-slate-500 uppercase">Date</th>
                                                <th className="py-2 font-bold text-slate-500 uppercase">Item Description</th>
                                                <th className="py-2 font-bold text-slate-500 uppercase text-right">Value</th>
                                                <th className="py-2 font-bold text-slate-500 uppercase text-right">Paid</th>
                                                <th className="py-2 font-bold text-slate-500 uppercase text-center">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {agentLoans.map((loan, idx) => (
                                                <tr key={idx}>
                                                    <td className="py-3 font-mono text-slate-600">{new Date(loan.startDate).toLocaleDateString()}</td>
                                                    <td className="py-3">
                                                        <div className="font-bold text-slate-900">{loan.deviceModel}</div>
                                                        <div className="text-[10px] text-slate-500 font-mono">{loan.imei}</div>
                                                    </td>
                                                    <td className="py-3 text-right font-bold text-slate-900">{loan.totalLoanAmount.toLocaleString()}</td>
                                                    <td className="py-3 text-right font-bold text-emerald-600">{(loan.remittedAmount || loan.deposit || 0).toLocaleString()}</td>
                                                    <td className="py-3 text-center">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${loan.status === 'Active' ? 'border-emerald-200 text-emerald-600' : 'border-slate-200 text-slate-500'
                                                            }`}>{loan.status}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Footer / Signatures */}
                                <div className="mt-12 pt-8 border-t-2 border-slate-100">
                                    <div className="flex justify-between gap-12">
                                        <div className="flex-1">
                                            <div className="h-16 border-b border-slate-900 border-dashed mb-2"></div>
                                            <p className="text-xs font-bold text-slate-900 uppercase">Agent Signature</p>
                                        </div>
                                        <div className="flex-1">
                                            <div className="h-16 border-b border-slate-900 border-dashed mb-2"></div>
                                            <p className="text-xs font-bold text-slate-900 uppercase">Manager Signature</p>
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-center text-slate-400 mt-8">Printed from SNA Mobile ERP System</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-5 border-t border-slate-100 bg-white flex gap-4 justify-end no-print">
                            <button onClick={() => setIsReportOpen(false)} className="px-6 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase hover:bg-slate-200 transition-colors">Close</button>
                            <button onClick={handlePrintReport} disabled={isPrinting} className="px-6 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-xs uppercase hover:bg-slate-50 transition-colors flex items-center gap-2">
                                {isPrinting ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />} Print
                            </button>
                            <button onClick={handleEmailReport} className="px-6 py-2.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-xl font-bold text-xs uppercase hover:bg-blue-100 transition-colors flex items-center gap-2">
                                <Mail size={16} /> Email
                            </button>
                            <button onClick={handleDownloadReport} disabled={isDownloading} className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase hover:bg-black transition-colors flex items-center gap-2">
                                {isDownloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Download PDF
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- ISSUE STOCK MODAL --- */}
            {isStockModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in">
                    <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-white/20 flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
                            <div>
                                <h2 className="text-lg font-bold text-slate-900">Issue Stock</h2>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">TO: {selectedAgent?.name.toUpperCase()}</p>
                            </div>
                            <button onClick={() => setIsStockModalOpen(false)} className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-900 transition-all"><X size={20} /></button>
                        </div>

                        <form onSubmit={handleIssueStock} className="flex-1 flex flex-col min-h-0">
                            <div className="flex-1 overflow-y-auto p-8 space-y-6">
                                {/* Inventory Picker */}
                                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                        <Box size={14} className="text-slate-400" /> SELECT FROM INVENTORY (CONSIGNMENT)
                                    </label>
                                    <select
                                        className="w-full h-12 bg-white border border-slate-200 rounded-xl px-4 text-xs font-bold text-slate-700 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100 transition-all"
                                        value={stockForm.productId || ''}
                                        onChange={e => handleProductSelect(e.target.value)}
                                    >
                                        <option value="">-- Manual Entry / Select Stock --</option>
                                        {products.map(p => (
                                            <option key={p.id} value={p.id!}>
                                                {p.brand ? `[${p.brand}] ` : ''}{p.name} ({p.stockQuantity} avail)
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-5">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block ml-1">MODEL NAME</label>
                                        <input
                                            disabled={!!stockForm.productId}
                                            className={`win-input h-12 text-xs ${!!stockForm.productId ? 'bg-slate-50 text-slate-500 font-bold' : 'bg-white font-bold'}`}
                                            value={stockForm.deviceModel}
                                            onChange={e => setStockForm({ ...stockForm, deviceModel: e.target.value })}
                                            placeholder="Enter Model..."
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block ml-1">IMEI / SERIAL</label>
                                        <input
                                            required
                                            autoFocus
                                            className="win-input h-12 font-mono text-xs text-slate-900"
                                            value={stockForm.imei}
                                            onChange={e => setStockForm({ ...stockForm, imei: e.target.value })}
                                            placeholder="Scan or Type..."
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block ml-1">PROVIDER</label>
                                        <select
                                            disabled={!!stockForm.productId}
                                            className={`win-input h-12 text-xs ${!!stockForm.productId ? 'bg-slate-50 text-slate-500 font-bold' : 'bg-white font-bold'}`}
                                            value={stockForm.provider}
                                            onChange={e => setStockForm({ ...stockForm, provider: e.target.value as any })}
                                        >
                                            <option value="TAKE NOW">TAKE NOW</option>
                                            <option value="MOGO">MOGO</option>
                                            <option value="MOBI BUY">MOBI BUY</option>
                                            <option value="Other">Other</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block ml-1">TOTAL VALUE</label>
                                        <input
                                            type="number"
                                            className="win-input h-12 font-bold text-xs"
                                            value={stockForm.totalLoanAmount}
                                            onChange={e => setStockForm({ ...stockForm, totalLoanAmount: Number(e.target.value) })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block ml-1">UPFRONT DEPOSIT</label>
                                        <input
                                            type="number"
                                            className="win-input h-12 font-bold text-emerald-600 text-xs"
                                            value={stockForm.deposit}
                                            onChange={e => setStockForm({ ...stockForm, deposit: Number(e.target.value) })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block ml-1">DAILY REMITTANCE</label>
                                        <input
                                            type="number"
                                            className="win-input h-12 font-bold text-xs"
                                            value={stockForm.dailyInstallment}
                                            onChange={e => setStockForm({ ...stockForm, dailyInstallment: Number(e.target.value) })}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setIsStockModalOpen(false)}
                                    className="px-6 py-3 bg-white border border-slate-200 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all"
                                >
                                    CANCEL
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="px-6 py-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all flex items-center gap-2"
                                >
                                    {isSaving ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} strokeWidth={4} />} CONFIRM ISSUE
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* --- UPDATE STATUS / MARK SOLD MODAL --- */}
            {isStatusModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in">
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-white/20">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h2 className="text-lg font-bold text-slate-900">Update Status</h2>
                            <button onClick={() => setIsStatusModalOpen(false)}><X size={20} className="text-slate-400 hover:text-slate-900" /></button>
                        </div>
                        <form onSubmit={handleUpdateStatus} className="p-6 space-y-4">
                            <div className="space-y-1.5">
                                <label className="win-label">Current Status</label>
                                <div className="relative">
                                    <select
                                        className="win-input h-10 font-bold appearance-none"
                                        value={statusForm.status}
                                        onChange={e => setStatusForm({ ...statusForm, status: e.target.value })}
                                    >
                                        <option value="Active">Active</option>
                                        <option value="Sold">Sold / Completed</option>
                                        <option value="Defaulted">Defaulted</option>
                                        <option value="Repossessed">Repossessed</option>
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="win-label">Remitted Amount (UGX)</label>
                                <input
                                    type="number"
                                    className="win-input h-10 font-bold"
                                    value={statusForm.remittedAmount}
                                    onChange={e => setStatusForm({ ...statusForm, remittedAmount: Number(e.target.value) })}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="win-label">Notes</label>
                                <textarea
                                    className="win-input p-3 h-24 resize-none"
                                    value={statusForm.notes}
                                    onChange={e => setStatusForm({ ...statusForm, notes: e.target.value })}
                                    placeholder="Transaction details..."
                                />
                            </div>

                            <div className="pt-2">
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="w-full py-3 bg-slate-900 text-white rounded-lg font-bold text-xs uppercase tracking-widest shadow-lg hover:bg-black transition-all flex items-center justify-center gap-2"
                                >
                                    {isSaving ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} strokeWidth={3} />} UPDATE RECORD
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* --- REGISTER AGENT MODAL --- */}
            {isAgentModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in">
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-white/20">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <h2 className="text-lg font-bold text-slate-900">{editingId ? 'Edit Profile' : 'New Agent Profile'}</h2>
                            <button onClick={() => setIsAgentModalOpen(false)}><X size={20} className="text-slate-400 hover:text-slate-900" /></button>
                        </div>
                        <form onSubmit={handleSaveAgent} className="p-6 space-y-4">
                            <div className="space-y-1.5">
                                <label className="win-label">Full Name</label>
                                <input required className="win-input h-10 font-bold" value={agentForm.name} onChange={e => setAgentForm({ ...agentForm, name: e.target.value })} placeholder="e.g. John Doe" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="win-label">Email Address</label>
                                <input type="email" className="win-input h-10" value={agentForm.email || ''} onChange={e => setAgentForm({ ...agentForm, email: e.target.value })} placeholder="agent@example.com" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="win-label">Phone Number</label>
                                <input required className="win-input h-10" value={agentForm.phone} onChange={e => setAgentForm({ ...agentForm, phone: e.target.value })} placeholder="+256..." />
                            </div>
                            <div className="space-y-1.5">
                                <label className="win-label">ID / NIN</label>
                                <input className="win-input h-10 uppercase" value={agentForm.nin || ''} onChange={e => setAgentForm({ ...agentForm, nin: e.target.value })} placeholder="National ID" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="win-label">Region / Location</label>
                                <input className="win-input h-10" value={agentForm.location || ''} onChange={e => setAgentForm({ ...agentForm, location: e.target.value })} placeholder="e.g. Kampala Central" />
                            </div>
                            {/* Status Field added here */}
                            <div className="space-y-1.5">
                                <label className="win-label">Account Status</label>
                                <select
                                    className="win-input h-10 font-bold"
                                    value={agentForm.status}
                                    onChange={e => setAgentForm({ ...agentForm, status: e.target.value as 'Active' | 'Inactive' })}
                                >
                                    <option value="Active">Active</option>
                                    <option value="Inactive">Inactive</option>
                                </select>
                            </div>
                            <div className="pt-4">
                                <button disabled={isSaving} className="w-full py-3 bg-slate-900 text-white rounded-lg font-bold text-sm shadow-lg hover:bg-black transition-all flex items-center justify-center gap-2">
                                    {isSaving && <Loader2 className="animate-spin" size={14} />} {isSaving ? 'Saving...' : 'Save Agent Profile'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* DELETE AGENT CONFIRMATION */}
            {agentToDelete && (
                <div className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in">
                    <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-8 text-center space-y-6 border border-white/20">
                        <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
                            <AlertTriangle size={40} strokeWidth={2} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">Confirm Deletion</h3>
                            <p className="text-sm text-slate-500 font-medium mt-2 leading-relaxed">
                                Are you sure you want to permanently delete agent <span className="text-slate-900 font-bold">"{agentToDelete.name}"</span>?
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => setAgentToDelete(null)} disabled={isDeleting} className="py-4 bg-slate-100 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
                            <button onClick={confirmDeleteAgent} disabled={isDeleting} className="py-4 bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-red-600/20 hover:bg-red-700 transition-all flex items-center justify-center gap-2">
                                {isDeleting ? <Loader2 className="animate-spin" size={14} /> : null} {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default Loans;
