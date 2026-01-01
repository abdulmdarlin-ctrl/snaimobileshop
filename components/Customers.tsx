import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { User, UserRole } from '../types';
import {
    Search, Edit2, Trash2, X, Users,
    Download, FileText, Phone, Mail, MapPin,
    Loader2, AlertTriangle, UserPlus
} from 'lucide-react';
import { exportSectionToPDF } from '../utils/printExport';
import { useToast } from './Toast';

// Define Customer type locally since types.ts is not available in context
export interface Customer {
    id?: string;
    name: string;
    phone: string;
    email?: string;
    address?: string;
    notes?: string;
    joinedDate: number;
}

interface CustomersProps { user: User; }

const Customers: React.FC<CustomersProps> = ({ user }) => {
    const { showToast } = useToast();
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
    const [formData, setFormData] = useState<Partial<Customer>>({});
    const [isSaving, setIsSaving] = useState(false);

    // Delete State
    const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const canEdit = [UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER].includes(user.role);
    const canDelete = user.role === UserRole.ADMIN;

    useEffect(() => {
        fetchCustomers();
    }, []);

    const fetchCustomers = async () => {
        setLoading(true);
        try {
            const data = await db.customers.toArray();
            setCustomers(data.sort((a: Customer, b: Customer) => a.name.localeCompare(b.name)));
        } catch (e) {
            console.error("Failed to fetch customers", e);
            setCustomers([]);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name) {
            showToast("Customer Name is required", 'error');
            return;
        }

        setIsSaving(true);
        try {
            const payload = {
                ...formData,
                name: formData.name,
                phone: formData.phone || '',
                email: formData.email || '',
                address: formData.address || '',
                notes: formData.notes || '',
                joinedDate: editingCustomer ? editingCustomer.joinedDate : Date.now()
            };

            if (editingCustomer?.id) {
                await db.customers.update(editingCustomer.id, payload);
                showToast('Customer updated', 'success');
            } else {
                await db.customers.add(payload);
                showToast('Customer added', 'success');
            }

            setIsModalOpen(false);
            setEditingCustomer(null);
            setFormData({});
            fetchCustomers();
        } catch (e) {
            console.error(e);
            showToast("Failed to save customer", 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const confirmDelete = async () => {
        if (!customerToDelete?.id) return;
        setIsDeleting(true);
        try {
            await db.customers.delete(customerToDelete.id);
            setCustomerToDelete(null);
            fetchCustomers();
            showToast('Customer deleted', 'success');
        } catch (e) {
            showToast("Failed to delete customer", 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    const filteredCustomers = customers.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone.includes(searchTerm)
    );

    return (
        <div className="space-y-6 pb-20 font-sans animate-in fade-in">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 no-print">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Customer Management</h1>
                    <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">CRM & Client Database</p>
                </div>
                <div className="flex gap-3">
                    <button onClick={() => exportSectionToPDF('#customer-list', 'Customer_List.pdf')} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all">
                        <Download size={14} /> PDF
                    </button>
                    {canEdit && (
                        <button onClick={() => { setEditingCustomer(null); setFormData({}); setIsModalOpen(true); }} className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-black transition-all">
                            <UserPlus size={16} /> Add Customer
                        </button>
                    )}
                </div>
            </div>

            {/* Search & Stats */}
            <div className="bg-white p-2 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4 no-print">
                <div className="flex items-center gap-4 px-4">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Users size={16} /></div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Total Clients</p>
                        <p className="text-sm font-black text-slate-900">{customers.length}</p>
                    </div>
                </div>
                <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                        className="win-input pl-9 h-11 bg-slate-50 border-transparent focus:bg-white"
                        placeholder="Search by name or phone..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Customer List */}
            <div id="customer-list" className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                            <th className="pl-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Customer Name</th>
                            <th className="py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Contact Info</th>
                            <th className="py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Location</th>
                            <th className="py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Joined</th>
                            <th className="pr-6 text-right py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest no-print">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {filteredCustomers.map(c => (
                            <tr key={c.id} className="hover:bg-slate-50/50 transition-colors group">
                                <td className="pl-6 py-4">
                                    <span className="text-sm font-bold text-slate-900">{c.name}</span>
                                </td>
                                <td className="py-4">
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                                            <Phone size={12} className="text-slate-400" /> {c.phone}
                                        </div>
                                        {c.email && (
                                            <div className="flex items-center gap-2 text-[10px] text-slate-500">
                                                <Mail size={10} className="text-slate-400" /> {c.email}
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="py-4">
                                    {c.address ? (
                                        <div className="flex items-center gap-2 text-xs text-slate-600">
                                            <MapPin size={12} className="text-slate-400" /> {c.address}
                                        </div>
                                    ) : <span className="text-[10px] text-slate-300 italic">--</span>}
                                </td>
                                <td className="py-4">
                                    <span className="text-xs font-mono text-slate-500">{new Date(c.joinedDate).toLocaleDateString()}</span>
                                </td>
                                <td className="pr-6 text-right py-4 no-print">
                                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {canEdit && (
                                            <button onClick={() => { setEditingCustomer(c); setFormData(c); setIsModalOpen(true); }} className="p-2 bg-slate-50 text-slate-400 hover:text-blue-600 rounded-lg">
                                                <Edit2 size={14} />
                                            </button>
                                        )}
                                        {canDelete && (
                                            <button onClick={() => setCustomerToDelete(c)} className="p-2 bg-slate-50 text-slate-400 hover:text-red-600 rounded-lg">
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {filteredCustomers.length === 0 && (
                            <tr><td colSpan={5} className="py-12 text-center text-slate-300 text-xs font-bold uppercase tracking-widest">No customers found</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in !mt-0">
                    <div className="bg-white w-full max-w-lg rounded-[2rem] shadow-2xl p-8 border border-white/20">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">{editingCustomer ? 'Edit Customer' : 'New Customer'}</h2>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 rounded-xl hover:bg-slate-50"><X size={24} /></button>
                        </div>
                        <form onSubmit={handleSave} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="win-label">Full Name</label>
                                <input required className="win-input h-11 font-bold" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Jane Doe" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="win-label">Phone Number</label>
                                    <input className="win-input h-11" value={formData.phone || ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} placeholder="+256..." />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="win-label">Email (Optional)</label>
                                    <input type="email" className="win-input h-11" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="jane@example.com" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="win-label">Address / Location</label>
                                <input className="win-input h-11" value={formData.address || ''} onChange={e => setFormData({ ...formData, address: e.target.value })} placeholder="e.g. Kampala Road" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="win-label">Notes</label>
                                <textarea className="win-input p-3 h-24 resize-none" value={formData.notes || ''} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="Additional details..." />
                            </div>
                            <div className="pt-4">
                                <button disabled={isSaving} className="w-full py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-[2px] hover:bg-black transition-all flex items-center justify-center gap-2">
                                    {isSaving && <Loader2 size={14} className="animate-spin" />} {isSaving ? 'Saving...' : 'Save Customer'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {customerToDelete && (
                <div className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in !mt-0">
                    <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-8 text-center space-y-6 border border-white/20">
                        <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
                            <AlertTriangle size={40} strokeWidth={2} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">Confirm Deletion</h3>
                            <p className="text-sm text-slate-500 font-medium mt-2 leading-relaxed">
                                Permanently delete customer <span className="text-slate-900 font-bold">"{customerToDelete.name}"</span>?
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => setCustomerToDelete(null)} disabled={isDeleting} className="py-4 bg-slate-100 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
                            <button onClick={confirmDelete} disabled={isDeleting} className="py-4 bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-red-600/20 hover:bg-red-700 transition-all flex items-center justify-center gap-2">
                                {isDeleting ? <Loader2 className="animate-spin" size={14} /> : null} {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Customers;