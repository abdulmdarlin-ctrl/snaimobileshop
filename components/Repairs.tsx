import { confirmAction } from '../utils/dialog';
import { normalizeCustomerPhone } from '../utils/customers';
import { getSaleType } from '../utils/pos';

import React, { useState, useEffect, useRef } from 'react';
import { db } from '../db';
import { Repair, RepairStatus, User, UserRole, AppSettings, Sale, SaleItem, Product } from '../types';
import {
   Plus, Search, X, Trash2, Printer,
   Wrench, User as UserIcon, Clock, AlertCircle,
   Smartphone, Hash, Battery, FileText, CheckCircle2,
   ChevronRight, Calendar, DollarSign, PenTool, Layers,
   CreditCard, Loader2, AlertTriangle, Store, MessageCircle
} from 'lucide-react';
import { printSection } from '../utils/printExport';
import { useToast } from './Toast';
import Modal from './Modal';
import JsBarcode from 'jsbarcode';

interface RepairsProps { user: User; }

const Repairs: React.FC<RepairsProps> = ({ user }) => {
   // Core Data
   const [repairs, setRepairs] = useState<Repair[]>([]);
   const { showToast } = useToast();
   const [technicians, setTechnicians] = useState<User[]>([]);
   const [settings, setSettings] = useState<AppSettings | null>(null);

   // UI State
   const [searchTerm, setSearchTerm] = useState('');
   const [isModalOpen, setIsModalOpen] = useState(false);
   const [isReceiptOpen, setIsReceiptOpen] = useState(false);
   const [loading, setLoading] = useState(false);

   // Print Config State
   const [printConfig, setPrintConfig] = useState({ format: 'thermal', showLogo: true });

   // Form & Editing State
   const [editingRepair, setEditingRepair] = useState<Repair | null>(null);
   const [activeRepairForReceipt, setActiveRepairForReceipt] = useState<Repair | null>(null);

   // Delete State
   const [repairToDelete, setRepairToDelete] = useState<Repair | null>(null);
   const [isDeleting, setIsDeleting] = useState(false);

   // Accessories Helper
   const commonAccessories = ['SIM Card', 'Memory Card', 'Phone Case', 'Charger', 'Battery'];
   const [selectedAccessories, setSelectedAccessories] = useState<string[]>([]);

   const initialForm: Partial<Repair> = {
      customerName: '',
      customerPhone: '',
      deviceModel: '',
      issue: '',
      status: RepairStatus.RECEIVED,
      estimatedCost: 0,
      depositPaid: 0,
      jobCardNo: '',
      accessoriesLeft: []
   };

   const [formData, setFormData] = useState<Partial<Repair>>(initialForm);

   // RBAC
   const canDelete = user.role === UserRole.ADMIN;

   useEffect(() => {
      fetchRepairs();
      fetchTechnicians();
      fetchSettings();
   }, []);

   // Initialize Print Config
   useEffect(() => {
      if (isReceiptOpen && settings) {
         setPrintConfig({
            format: settings.receiptFormat || 'thermal',
            showLogo: settings.receiptShowLogo ?? true
         });
      }
   }, [isReceiptOpen, settings]);

   // Generate Barcode when Receipt Opens
   useEffect(() => {
      if (isReceiptOpen && activeRepairForReceipt) {
         setTimeout(() => {
            try {
               JsBarcode("#job-card-barcode", activeRepairForReceipt.jobCardNo, {
                  format: "CODE128",
                  lineColor: "#000",
                  width: 1.5, // Reduced width to ensure it fits 80mm
                  height: 40,
                  displayValue: true,
                  fontSize: 12,
                  font: "Monospace",
                  margin: 0
               });
            } catch (e) { console.error("Barcode generation error", e); }
         }, 200);
      }
   }, [isReceiptOpen, activeRepairForReceipt]);

   const fetchRepairs = async () => { setRepairs(await db.repairs.toArray()); };

   const fetchTechnicians = async () => {
      const allUsers = await db.users.toArray();
      setTechnicians(allUsers.filter(u => u.role === UserRole.TECHNICIAN || u.role === UserRole.ADMIN));
   };

   const fetchSettings = async () => {
      setSettings(await db.settings.toCollection().first() || null);
   };

   const handleSave = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!await confirmAction({"title": "Save repair job?", "message": "Save the job details, parts and payment information.", "confirmLabel": "Save repair"})) return;
      setLoading(true);

      try {
         // --- VALIDATION START ---
         if (!formData.customerName?.trim()) throw new Error("Customer Name is required.");
         if (!formData.deviceModel?.trim()) throw new Error("Device Model is required.");
         if (!formData.issue?.trim()) throw new Error("Fault/Issue description is required.");
         if ((formData.estimatedCost || 0) < 0) throw new Error("Estimated Cost cannot be negative.");
         if ((formData.depositPaid || 0) < 0) throw new Error("Deposit Amount cannot be negative.");
         // --- VALIDATION END ---

         // Prepare Data
         const timestamp = Date.now();
         const jobCardNo = formData.jobCardNo || `JOB-${timestamp.toString().slice(-6)}`;
         const finalData = {
            ...formData,
            accessoriesLeft: selectedAccessories,
            jobCardNo,
            timestamp: editingRepair ? editingRepair.timestamp : timestamp,
            isPaid: (formData.estimatedCost || 0) - (formData.depositPaid || 0) <= 0
         } as Repair;

         if (editingRepair?.id) {
            await db.repairs.update(editingRepair.id, finalData);
            setEditingRepair(null);
         } else {
            const savedRepair = await db.repairs.add(finalData);
            finalData.id = savedRepair.id;
         }

         // Refresh & Open Receipt
         await fetchRepairs();

         // Create sale from parts if any were sold
         if (formData.partsUsed && formData.partsUsed.length > 0) {
            await createSaleFromRepair(finalData, timestamp);
         }

         closeModal();

         // Open Receipt automatically for new repairs or major updates
         setActiveRepairForReceipt(finalData);
         setIsReceiptOpen(true);
         showToast('Job card saved successfully', 'success');

      } catch (err: any) {
         console.error(err);
         showToast(`Validation Error: ${err.message}`, 'error');
      } finally {
         setLoading(false);
      }
   };

   // Create sale from repair parts and update inventory
   const createSaleFromRepair = async (repair: Repair, timestamp: number) => {
      try {
         if (!repair.partsUsed || repair.partsUsed.length === 0) return;

         // Get all products for lookup
         const allProducts = await db.products.toArray();

         // Build sale items and update inventory
         const saleItems: SaleItem[] = [];
         let subtotal = 0;

         for (const part of repair.partsUsed) {
            const product = allProducts.find(p => p.id === part.productId);
            if (product) {
               const itemTotal = part.cost || product.selling_price || 0;
               subtotal += itemTotal;

               saleItems.push({
                  productId: part.productId,
                  name: part.name || product.name,
                  quantity: 1,
                  price: itemTotal,
                  total: itemTotal,
                  originalPrice: product.selling_price || 0
               });

            }
         }

         if (!saleItems.length || !repair.id) return;
         const customers = await db.customers.toArray();
         const matches = customers.filter(customer => normalizeCustomerPhone(customer.phone) === normalizeCustomerPhone(repair.customerPhone));
         if (!normalizeCustomerPhone(repair.customerPhone) || matches.length !== 1) throw new Error('Select a unique registered customer with the repair phone number before recording parts.');
         const saleId = `repair-${repair.id}-parts`;
         const existing = (await db.sales.toArray()).find(sale => sale.id === saleId);
         const amountPaid = existing?.amountPaid ?? Math.min(subtotal, repair.depositPaid || 0);
         const sale: Sale = {
            ...existing,
            id: saleId,
            customerId: matches[0].id,
            saleType: getSaleType({ total: subtotal, amountPaid }),
            receiptNo: existing?.receiptNo || `REP-${repair.id}`,
            items: saleItems,
            subtotal: subtotal,
            discount: 0,
            tax: 0,
            total: subtotal,
            amountPaid,
            balance: Math.max(0, subtotal - amountPaid),
            paymentMethod: 'Cash',
            cashierName: user.fullName || user.username || 'Technician',
            customerName: repair.customerName,
            customerPhone: repair.customerPhone,
            customerType: 'Retail',
            timestamp: existing?.timestamp || timestamp,
            isSynced: false,
            wasHeld: false
         };

         await db.commitSale(sale, false, existing ? 'edit' : 'create');

         // Update repair with sale info
         if (repair.id) {
            await db.repairs.update(repair.id, {
               saleInfo: {
                  receiptNo: sale.receiptNo,
                  items: saleItems.map(item => ({ name: item.name, price: item.price })),
                  total: subtotal,
                  paymentMethod: sale.paymentMethod
               }
            });
         }

         showToast(`Sale created from repair parts: ${sale.receiptNo}`, 'success');

      } catch (error) {
         console.error('Error creating sale from repair:', error);
         throw error;
      }
   };

   // Collect payment for repair service and record as sale
   const collectRepairPayment = async (repair: Repair, amount: number, paymentMethod: string = 'Cash') => {
      try {
         if (!repair.id || amount <= 0) return;

         if (!await confirmAction({ title: 'Collect repair payment?', message: 'Confirm that this payment has been received. The job balance will be updated.', confirmLabel: 'Record payment', details: [{ label: 'Job card', value: repair.jobCardNo }, { label: 'Amount received', value: `UGX ${amount.toLocaleString()}` }] })) return;
         await db.collectRepairPayment(repair.id, amount, repair.depositPaid || 0, user.fullName || user.username, paymentMethod);
         showToast(`Payment recorded for job card ${repair.jobCardNo}`, 'success');

         // Refresh repairs data
         await fetchRepairs();

      } catch (error) {
         console.error('Error collecting repair payment:', error);
         showToast('Failed to record payment', 'error');
      }
   };

   const handleSendWhatsApp = () => {
      if (!activeRepairForReceipt) return;
      const businessName = settings?.businessName || 'SNA Repair Center';
      const balance = activeRepairForReceipt.estimatedCost - activeRepairForReceipt.depositPaid;

      let message = `*Job Card - ${businessName}*\n\n`;
      message += `*Job No:* ${activeRepairForReceipt.jobCardNo}\n`;
      message += `*Device:* ${activeRepairForReceipt.deviceModel}\n`;
      message += `*Issue:* ${activeRepairForReceipt.issue}\n`;
      message += `*Est. Cost:* ${activeRepairForReceipt.estimatedCost.toLocaleString()} UGX\n`;
      message += `*Deposit:* ${activeRepairForReceipt.depositPaid.toLocaleString()} UGX\n`;
      message += `*Balance:* ${balance.toLocaleString()} UGX\n\n`;
      message += `*Status:* ${activeRepairForReceipt.status}\n\n`;
      message += `Please keep this job card for collection. Thank you!`;

      const encodedMessage = encodeURIComponent(message);
      const phone = activeRepairForReceipt.customerPhone.replace(/\D/g, '');
      window.open(`https://wa.me/${phone}?text=${encodedMessage}`, '_blank');
   };

   const confirmDeleteRepair = async () => {
      if (!repairToDelete?.id) return;
      setIsDeleting(true);
      try {
         await db.repairs.delete(repairToDelete.id);
         setRepairs(prev => prev.filter(r => r.id !== repairToDelete.id));
         setRepairToDelete(null);
         showToast('Job card deleted', 'success');
      } catch (e) {
         console.error("Delete failed", e);
         showToast("Failed to delete job card.", 'error');
      } finally {
         setIsDeleting(false);
      }
   };

   const closeModal = () => {
      setIsModalOpen(false);
      setEditingRepair(null);
      setFormData(initialForm);
      setSelectedAccessories([]);
   };

   const openEditModal = (repair: Repair) => {
      setEditingRepair(repair);
      setFormData(repair);
      setSelectedAccessories(repair.accessoriesLeft || []);
      setIsModalOpen(true);
   };

   const toggleAccessory = (acc: string) => {
      setSelectedAccessories(prev =>
         prev.includes(acc) ? prev.filter(a => a !== acc) : [...prev, acc]
      );
   };

   const filtered = repairs.filter(r =>
      r.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.jobCardNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.deviceModel.toLowerCase().includes(searchTerm.toLowerCase())
   );

   // Stats Calculation
   const repairStats = React.useMemo(() => {
      const active = repairs.filter(r => r.status !== RepairStatus.COMPLETED && r.status !== RepairStatus.DELIVERED && r.status !== RepairStatus.CANCELLED).length;
      const completed = repairs.filter(r => r.status === RepairStatus.COMPLETED || r.status === RepairStatus.DELIVERED).length;
      const pendingRevenue = repairs.reduce((acc, r) => {
         if (r.status === RepairStatus.COMPLETED || r.status === RepairStatus.DELIVERED || r.status === RepairStatus.CANCELLED) return acc;
         return acc + (r.estimatedCost - r.depositPaid);
      }, 0);
      return { active, completed, pendingRevenue };
   }, [repairs]);

   const getStatusColor = (status: RepairStatus) => {
      switch (status) {
         case RepairStatus.RECEIVED: return 'bg-slate-100 text-slate-600 border-slate-200';
         case RepairStatus.DIAGNOSING: return 'bg-blue-50 text-blue-600 border-blue-200';
         case RepairStatus.WAITING_FOR_PARTS: return 'bg-orange-50 text-orange-600 border-orange-200';
         case RepairStatus.IN_REPAIR: return 'bg-purple-50 text-purple-600 border-purple-200';
         case RepairStatus.COMPLETED: return 'bg-emerald-50 text-emerald-600 border-emerald-200';
         case RepairStatus.DELIVERED: return 'bg-slate-900 text-white border-slate-900';
         case RepairStatus.CANCELLED: return 'bg-red-50 text-red-600 border-red-200';
         default: return 'bg-slate-50 text-slate-500';
      }
   };

   return (
      <div className="space-y-6 pb-20 font-sans   duration-500">

         {/* --- CONTROL PANEL --- */}
         <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-2xl border border-slate-100 ">
            <div className="relative w-full md:w-96 group">
               <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search size={18} className="text-slate-400 group-focus-within:text-orange-500 transition-colors" strokeWidth={1.75} />
               </div>
               <input
                  type="text"
                  placeholder="Search by customer, job ID or model..."
                  className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-10 pr-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all "
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
               />
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
               <button
                  onClick={() => { setFormData(initialForm); setIsModalOpen(true); }}
                  className="px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider   flex items-center gap-2 transition-all  shrink-0 ml-auto"
               >
                  <Plus size={16} strokeWidth={1.75} /> New Job Card
               </button>
            </div>
         </div>

         {/* --- STATS GRID --- */}
         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-5 rounded-2xl  border border-slate-100 flex items-center justify-between  transition-shadow group">
               <div>
                  <p className="text-sm text-slate-500 font-medium mb-1">Active Jobs</p>
                  <h3 className="text-2xl font-bold text-slate-800">{repairStats.active}</h3>
                  <p className="text-xs text-orange-500 mt-1 font-medium flex items-center gap-1">
                     <Clock size={14} strokeWidth={1.75} /> In Progress
                  </p>
               </div>
               <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-500  transition-transform">
                  <Wrench size={24} strokeWidth={1.75} />
               </div>
            </div>

            <div className="bg-white p-5 rounded-2xl  border border-slate-100 flex items-center justify-between  transition-shadow group">
               <div>
                  <p className="text-sm text-slate-500 font-medium mb-1">Completed</p>
                  <h3 className="text-2xl font-bold text-slate-800">{repairStats.completed}</h3>
                  <p className="text-xs text-emerald-500 mt-1 font-medium flex items-center gap-1">
                     <CheckCircle2 size={14} strokeWidth={1.75} /> Ready/Delivered
                  </p>
               </div>
               <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-500  transition-transform">
                  <CheckCircle2 size={24} strokeWidth={1.75} />
               </div>
            </div>

            <div className="bg-white p-5 rounded-2xl  border border-slate-100 flex items-center justify-between  transition-shadow group">
               <div>
                  <p className="text-sm text-slate-500 font-medium mb-1">Pending Revenue</p>
                  <h3 className="text-2xl font-bold text-slate-800">
                     <span className="text-sm text-slate-400 mr-1">UGX</span>
                     {(repairStats.pendingRevenue / 1000).toFixed(0)}k
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 font-medium flex items-center gap-1">
                     <DollarSign size={14} strokeWidth={1.75} /> Unpaid Balances
                  </p>
               </div>
               <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-500  transition-transform">
                  <CreditCard size={24} strokeWidth={1.75} />
               </div>
            </div>
         </div>

         {/* --- REPAIR GRID --- */}
         <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filtered.map(repair => (
               <div key={repair.id} className="bg-white rounded-2xl border border-slate-200  overflow-hidden flex flex-col  transition-all group">

                  {/* Card Header */}
                  <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
                     <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(repair.status)}`}>
                        {repair.status}
                     </span>
                     <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setActiveRepairForReceipt(repair); setIsReceiptOpen(true); }} className="p-1.5 text-slate-400 hover:text-slate-900 bg-white border border-slate-200 rounded-lg  transition-colors" title="Print">
                           <Printer size={14} strokeWidth={1.75} />
                        </button>
                        <button onClick={() => openEditModal(repair)} className="p-1.5 text-slate-400 hover:text-indigo-600 bg-white border border-slate-200 rounded-lg  transition-colors" title="Edit">
                           <PenTool size={14} strokeWidth={1.75} />
                        </button>
                        {canDelete && (
                           <button onClick={() => setRepairToDelete(repair)} className="p-1.5 text-slate-400 hover:text-red-600 bg-white border border-slate-200 rounded-lg  transition-colors" title="Delete">
                              <Trash2 size={14} strokeWidth={1.75} />
                           </button>
                        )}
                     </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-6 space-y-4 flex-1">
                     <div>
                        <h3 className="text-base font-bold text-slate-900 truncate">{repair.deviceModel}</h3>
                        <div className="flex items-center gap-2 text-slate-500 mt-1">
                           <UserIcon size={14} strokeWidth={1.75} />
                           <p className="text-xs font-medium uppercase truncate">{repair.customerName}</p>
                        </div>
                     </div>

                     <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
                           <AlertCircle size={14} strokeWidth={1.75} /> Reported Fault
                        </p>
                        <p className="text-xs font-medium text-slate-700 line-clamp-2">"{repair.issue}"</p>
                     </div>

                     <div className="flex gap-2 flex-wrap">
                        {repair.accessoriesLeft && repair.accessoriesLeft.map(acc => (
                           <span key={acc} className="px-2 py-1 bg-slate-100 text-slate-500 rounded text-[10px] font-bold uppercase">{acc}</span>
                        ))}
                     </div>
                  </div>

                  {/* Card Footer */}
                  <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                     <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Balance Due</p>
                        <p className={`text-sm font-bold ${(repair.estimatedCost - repair.depositPaid) > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                           UGX {(repair.estimatedCost - repair.depositPaid).toLocaleString()}
                        </p>
                     </div>
                     <div className="flex items-center gap-2">
                        {(repair.estimatedCost - repair.depositPaid) > 0 && (
                           <button
                              onClick={() => collectRepairPayment(repair, repair.estimatedCost - repair.depositPaid)}
                              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-[10px] font-bold transition-colors flex items-center gap-1"
                              title="Collect full payment"
                           >
                              <DollarSign size={12} />
                              Pay
                           </button>
                        )}
                        <div className="text-right">
                           <p className="text-[10px] font-bold text-slate-400 uppercase">Job ID</p>
                           <p className="text-xs font-mono font-bold text-slate-900">{repair.jobCardNo}</p>
                        </div>
                     </div>
                  </div>
               </div>
            ))}
            {filtered.length === 0 && (
               <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-300">
                  <Layers size={32} className="mb-4 opacity-20" strokeWidth={1.75} />
                  <p className="text-sm font-medium">No repair jobs found</p>
               </div>
            )}
         </div>

         {/* --- JOB ENTRY MODAL --- */}
         <Modal
            isOpen={isModalOpen}
            onClose={closeModal}
            title={editingRepair ? 'Update Job Details' : 'New Service Request'}
            maxWidth="2xl"
         >
            <form onSubmit={handleSave} className="space-y-6">

               {/* Section 1: Customer */}
               <div className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Client Identity</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div className="space-y-1.5">
                        <label className="win-label">Customer Name</label>
                        <input required className="win-input h-10 font-bold text-xs" placeholder="e.g. Sarah Jones" value={formData.customerName} onChange={e => setFormData({ ...formData, customerName: e.target.value })} />
                     </div>
                     <div className="space-y-1.5">
                        <label className="win-label">Contact Phone</label>
                        <input required className="win-input h-10 font-bold text-xs" placeholder="+256..." value={formData.customerPhone} onChange={e => setFormData({ ...formData, customerPhone: e.target.value })} />
                     </div>
                  </div>
               </div>

               {/* Section 2: Device */}
               <div className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Device Diagnostics</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div className="col-span-full space-y-1.5">
                        <label className="win-label">Device Model / Make</label>
                        <input required className="win-input h-10 font-bold uppercase tracking-wide text-xs" placeholder="e.g. IPHONE 13 PRO MAX" value={formData.deviceModel} onChange={e => setFormData({ ...formData, deviceModel: e.target.value })} />
                     </div>
                     <div className="col-span-full space-y-1.5">
                        <label className="win-label">Reported Issue / Fault</label>
                        <textarea required rows={2} className="win-input p-3 font-medium text-slate-600 resize-none text-xs" placeholder="Describe the problem..." value={formData.issue} onChange={e => setFormData({ ...formData, issue: e.target.value })} />
                     </div>

                     {/* Accessories Checkbox */}
                     <div className="col-span-full bg-slate-50 rounded-xl p-4 border border-slate-100">
                        <label className="win-label mb-2 block">Accessories Left</label>
                        <div className="flex flex-wrap gap-2">
                           {commonAccessories.map(acc => (
                              <button
                                 type="button"
                                 key={acc}
                                 onClick={() => toggleAccessory(acc)}
                                 className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide border transition-all ${selectedAccessories.includes(acc)
                                    ? 'bg-slate-900 text-white border-slate-900 '
                                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                                    }`}
                              >
                                 {acc}
                              </button>
                           ))}
                        </div>
                     </div>
                  </div>
               </div>

               {/* Section 3: Financials */}
               <div className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Financials & Status</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     <div className="space-y-1.5">
                        <label className="win-label">Estimated Cost</label>
                        <div className="relative">
                           <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] font-bold">UGX</span>
                           <input type="number" min="0" required className="win-input h-10 pl-10 font-bold text-xs" value={formData.estimatedCost || ''} onChange={e => setFormData({ ...formData, estimatedCost: Number(e.target.value) })} />
                        </div>
                     </div>
                     <div className="space-y-1.5">
                        <label className="win-label">Deposit Paid</label>
                        <div className="relative">
                           <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] font-bold">UGX</span>
                           <input type="number" min="0" required className="win-input h-10 pl-10 font-bold text-emerald-600 text-xs" value={formData.depositPaid || ''} onChange={e => setFormData({ ...formData, depositPaid: Number(e.target.value) })} />
                        </div>
                     </div>
                     <div className="space-y-1.5">
                        <label className="win-label">Current Status</label>
                        <select className="win-input h-10 font-bold uppercase text-[10px]" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value as RepairStatus })}>
                           {Object.values(RepairStatus).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                     </div>
                  </div>
               </div>

               <div className="pt-4 border-t border-slate-100 flex gap-3 justify-end">
                  <button type="button" onClick={closeModal} className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold uppercase tracking-wide hover:bg-slate-100 transition-all">Cancel</button>
                  <button type="submit" disabled={loading} className="px-6 py-2.5 bg-orange-600 text-white rounded-lg text-xs font-bold uppercase tracking-wide  hover:bg-orange-700 transition-all flex items-center gap-2">
                     {loading ? <Loader2 className="animate-spin" size={14} strokeWidth={1.75} /> : (editingRepair ? 'Update Job' : 'Create Job Ticket')}
                  </button>
               </div>
            </form>
         </Modal>

         {/* --- RECEIPT / JOB CARD MODAL --- */}
         <Modal
            isOpen={isReceiptOpen && !!activeRepairForReceipt}
            onClose={() => setIsReceiptOpen(false)}
            noPadding
            maxWidth="lg"
         >
            {activeRepairForReceipt && (
               <div className="max-h-[90vh] flex flex-col">
                  {/* Print Preview Controls */}
                  <div className="bg-white border-b border-slate-100 p-4 flex justify-between items-center no-print shrink-0">
                     <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest">Job Card Preview</h3>
                     <div className="flex gap-3">
                        <button
                           onClick={() => setPrintConfig(c => ({ ...c, showLogo: !c.showLogo }))}
                           className={`px-3 py-1 rounded-lg border text-[10px] font-bold uppercase transition-all ${printConfig.showLogo ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-400 border-slate-200'}`}
                        >
                           Logo {printConfig.showLogo ? 'ON' : 'OFF'}
                        </button>
                     </div>
                  </div>

                  {/* ... Receipt Content ... */}
                  <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-100 flex justify-center">
                     <div id="repair-receipt-target" className="receipt-mode bg-white  origin-top p-4 text-black font-mono text-[11px] leading-tight w-[80mm] break-words">

                        {/* BUSINESS HEADER */}
                        <div className="text-center mb-4">
                           {/* Logo Section */}
                           {printConfig.showLogo && (
                              <div className="flex justify-center mb-2">
                                 {settings?.logo ? (
                                    <img src={settings.logo} alt="Logo" className="w-16 h-16 object-contain" />
                                 ) : (
                                    <div className="w-10 h-10 border-2 border-black rounded-lg flex items-center justify-center">
                                       <Store size={20} className="text-black" strokeWidth={1.75} />
                                    </div>
                                 )}
                              </div>
                           )}

                           <h2 className="font-bold text-base uppercase mb-1">{settings?.businessName || 'SNA! REPAIR CENTER'}</h2>
                           <div className="text-[10px] space-y-0.5">
                              <div>{settings?.address || 'Main Street, Kampala'}</div>
                              <div>Tel: {settings?.phone}</div>
                              <div>*** REPAIR JOB CARD ***</div>
                           </div>
                        </div>

                        <div className="text-center font-bold mb-2 text-[10px]">================================</div>

                        {/* JOB DETAILS */}
                        <div className="mb-3 space-y-1">
                           <div className="flex justify-between"><span>Job No:</span><span className="font-bold">{activeRepairForReceipt.jobCardNo}</span></div>
                           <div className="flex justify-between"><span>Date:</span><span>{new Date(activeRepairForReceipt.timestamp).toLocaleDateString()}</span></div>
                           <div className="flex justify-between"><span>Technician:</span><span>{user.username}</span></div>
                        </div>

                        <div className="text-center font-bold mb-2 text-[10px]">--------------------------------</div>

                        {/* CUSTOMER & DEVICE */}
                        <div className="mb-3 space-y-1">
                           <div className="font-bold uppercase underline">Customer Details:</div>
                           <div className="break-words">{activeRepairForReceipt.customerName}</div>
                           <div>{activeRepairForReceipt.customerPhone}</div>

                           <div className="font-bold uppercase underline mt-2">Device Details:</div>
                           <div className="font-bold break-words">{activeRepairForReceipt.deviceModel}</div>
                           <div className="italic break-words">"{activeRepairForReceipt.issue}"</div>
                        </div>

                        {/* ACCESSORIES */}
                        {activeRepairForReceipt.accessoriesLeft && activeRepairForReceipt.accessoriesLeft.length > 0 && (
                           <div className="mb-3">
                              <div className="font-bold uppercase text-[9px]">Accessories Received:</div>
                              <div className="flex flex-wrap gap-1 mt-0.5 break-words">
                                 {activeRepairForReceipt.accessoriesLeft.map((acc, i) => (
                                    <span key={i}>[{acc}]{i < (activeRepairForReceipt.accessoriesLeft?.length || 0) - 1 ? ',' : ''}</span>
                                 ))}
                              </div>
                           </div>
                        )}

                        <div className="text-center font-bold mb-2 text-[10px]">--------------------------------</div>

                        {/* FINANCIALS */}
                        <div className="mb-3 space-y-1">
                           <div className="flex justify-between"><span>Est. Cost:</span><span className="font-bold">{activeRepairForReceipt.estimatedCost.toLocaleString()}</span></div>
                           <div className="flex justify-between"><span>Deposit:</span><span>{activeRepairForReceipt.depositPaid.toLocaleString()}</span></div>
                           <div className="flex justify-between border-t border-dashed border-black pt-1 mt-1">
                              <span className="font-bold">BALANCE DUE:</span>
                              <span className="font-bold text-sm">{(activeRepairForReceipt.estimatedCost - activeRepairForReceipt.depositPaid).toLocaleString()}</span>
                           </div>
                        </div>

                        {/* PARTS SOLD - Show if sale info exists */}
                        {activeRepairForReceipt.saleInfo && (
                           <>
                              <div className="text-center font-bold mb-2 text-[10px]">--------------------------------</div>
                              <div className="mb-3">
                                 <div className="font-bold uppercase text-[9px] mb-1">Parts Sold:</div>
                                 <div className="space-y-0.5">
                                    {activeRepairForReceipt.saleInfo.items.map((item, i) => (
                                       <div key={i} className="flex justify-between text-[10px]">
                                          <span className="flex-1">{item.name}</span>
                                          <span className="font-bold">{item.price.toLocaleString()}</span>
                                       </div>
                                    ))}
                                 </div>
                                 <div className="flex justify-between border-t border-dashed border-black pt-1 mt-1">
                                    <span className="font-bold text-[10px]">Parts Total:</span>
                                    <span className="font-bold">{activeRepairForReceipt.saleInfo.total.toLocaleString()}</span>
                                 </div>
                                 <div className="text-center text-[9px] mt-1">
                                    Sale Receipt: {activeRepairForReceipt.saleInfo.receiptNo}
                                 </div>
                              </div>
                           </>
                        )}

                        {/* BARCODE */}
                        <div className="flex flex-col items-center justify-center my-4 overflow-hidden">
                           <svg id="job-card-barcode" className="w-full max-w-full"></svg>
                        </div>

                        {/* DISCLAIMER */}
                        <div className="text-[9px] text-justify leading-snug mb-4">
                           <span className="font-bold">TERMS:</span> Devices left for over 30 days after completion may be sold to recover costs. We are not responsible for data loss. Please back up your device.
                        </div>

                        {/* SIGNATURES */}
                        <div className="flex justify-between mt-6 pt-4 text-[9px]">
                           <div className="text-center w-24 border-t border-black">Customer Sign</div>
                           <div className="text-center w-24 border-t border-black">Tech Sign</div>
                        </div>

                        <div className="text-center mt-4 font-bold">*** THANK YOU ***</div>
                     </div>
                  </div>

                  {/* Footer Actions */}
                  <div className="p-6 bg-white border-t border-slate-200 flex gap-4">
                     <button onClick={() => setIsReceiptOpen(false)} className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-xl font-bold text-xs uppercase tracking-wide hover:bg-slate-200 transition-all">Close</button>
                     <button onClick={handleSendWhatsApp} className="flex-1 py-3 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl font-bold text-xs uppercase hover:bg-emerald-100 transition-all flex items-center justify-center gap-2">
                        <MessageCircle size={16} strokeWidth={1.75} /> WhatsApp
                     </button>
                     <button onClick={() => printSection('#repair-receipt-target', () => setIsReceiptOpen(false))} className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-wide  hover:bg-black transition-all flex items-center justify-center gap-2">
                        <Printer size={16} strokeWidth={1.75} /> Print & Close
                     </button>
                  </div>
               </div>
            )}
         </Modal>

         {/* DELETE CONFIRMATION MODAL */}
         <Modal
            isOpen={!!repairToDelete}
            onClose={() => setRepairToDelete(null)}
            noPadding
            maxWidth="sm"
         >
            {repairToDelete && (
               <div className="p-8 text-center space-y-6">
                  <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
                     <AlertTriangle size={32} strokeWidth={1.75} />
                  </div>
                  <div>
                     <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">Confirm Deletion</h3>
                     <p className="text-sm text-slate-500 font-medium mt-2 leading-relaxed">
                        Are you sure you want to permanently delete job card <span className="text-slate-900 font-bold">"{repairToDelete.jobCardNo}"</span>?
                     </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                     <button onClick={() => setRepairToDelete(null)} disabled={isDeleting} className="py-4 bg-slate-100 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
                     <button onClick={confirmDeleteRepair} disabled={isDeleting} className="py-4 bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest   hover:bg-red-700 transition-all flex items-center justify-center gap-2">
                        {isDeleting ? <Loader2 className="animate-spin" size={14} strokeWidth={1.75} /> : null} {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                     </button>
                  </div>
               </div>
            )}
         </Modal>

      </div>
   );
};

export default Repairs;
