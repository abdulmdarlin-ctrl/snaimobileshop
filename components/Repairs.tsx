
import React, { useState, useEffect, useRef } from 'react';
import { db } from '../db';
import { Repair, RepairStatus, User, UserRole, AppSettings } from '../types';
import {
   Plus, Search, X, Trash2, Printer,
   Wrench, User as UserIcon, Clock, AlertCircle,
   Smartphone, Hash, Battery, FileText, CheckCircle2,
   ChevronRight, Calendar, DollarSign, PenTool, Layers,
   CreditCard, Loader2, AlertTriangle, Store
} from 'lucide-react';
import { printSection } from '../utils/printExport';
import { useToast } from './Toast';
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
      <div className="space-y-6 pb-20 font-sans">

         {/* --- HEADER --- */}
         <div className="flex flex-col sm:flex-row sm:items-center justify-between no-print gap-4">
            <div className="flex items-center gap-4">
               <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-200 text-orange-600">
                  <Wrench size={24} strokeWidth={2.5} />
               </div>
               <div>
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Repair Center</h1>
                  <p className="text-sm text-slate-500 mt-1">Active Jobs: <span className="text-slate-900 font-bold">{repairs.length}</span></p>
               </div>
            </div>
            <button
               onClick={() => { setFormData(initialForm); setIsModalOpen(true); }}
               className="flex items-center gap-2 px-6 py-3 bg-orange-600 text-white rounded-xl shadow-lg shadow-orange-600/20 hover:bg-orange-700 transition-all font-bold text-sm"
            >
               <Plus size={18} strokeWidth={2.5} />
               <span>New Job Card</span>
            </button>
         </div>

         {/* --- SEARCH --- */}
         <div className="bg-white p-2 border border-slate-200 rounded-xl flex items-center relative shadow-sm">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
               className="w-full pl-12 h-12 bg-transparent text-sm font-medium focus:outline-none"
               placeholder="Search by customer, job ID or model..."
               value={searchTerm}
               onChange={e => setSearchTerm(e.target.value)}
            />
         </div>

         {/* --- REPAIR GRID --- */}
         <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filtered.map(repair => (
               <div key={repair.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-all group">

                  {/* Card Header */}
                  <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
                     <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(repair.status)}`}>
                        {repair.status}
                     </span>
                     <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setActiveRepairForReceipt(repair); setIsReceiptOpen(true); }} className="p-1.5 text-slate-400 hover:text-slate-900 bg-white border border-slate-200 rounded-lg shadow-sm transition-colors" title="Print">
                           <Printer size={14} />
                        </button>
                        <button onClick={() => openEditModal(repair)} className="p-1.5 text-slate-400 hover:text-indigo-600 bg-white border border-slate-200 rounded-lg shadow-sm transition-colors" title="Edit">
                           <PenTool size={14} />
                        </button>
                        {canDelete && (
                           <button onClick={() => setRepairToDelete(repair)} className="p-1.5 text-slate-400 hover:text-red-600 bg-white border border-slate-200 rounded-lg shadow-sm transition-colors" title="Delete">
                              <Trash2 size={14} />
                           </button>
                        )}
                     </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-6 space-y-4 flex-1">
                     <div>
                        <h3 className="text-base font-bold text-slate-900 truncate">{repair.deviceModel}</h3>
                        <div className="flex items-center gap-2 text-slate-500 mt-1">
                           <UserIcon size={14} />
                           <p className="text-xs font-medium uppercase truncate">{repair.customerName}</p>
                        </div>
                     </div>

                     <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
                           <AlertCircle size={10} /> Reported Fault
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
                     <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Job ID</p>
                        <p className="text-xs font-mono font-bold text-slate-900">{repair.jobCardNo}</p>
                     </div>
                  </div>
               </div>
            ))}
            {filtered.length === 0 && (
               <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-300">
                  <Layers size={64} className="mb-4 opacity-20" />
                  <p className="text-sm font-medium">No repair jobs found</p>
               </div>
            )}
         </div>

         {/* --- JOB ENTRY MODAL --- */}
         {isModalOpen && (
            <div className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in">
               <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-white/20 flex flex-col max-h-[90vh]">

                  {/* Modal Header */}
                  <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
                     <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600">
                           <Wrench size={20} strokeWidth={2} />
                        </div>
                        <div>
                           <h2 className="text-lg font-bold text-slate-900">{editingRepair ? 'Update Job Details' : 'New Service Request'}</h2>
                           <p className="text-xs text-slate-500 font-bold uppercase tracking-wide mt-0.5">Technician Dashboard</p>
                        </div>
                     </div>
                     <button onClick={closeModal} className="p-2 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-all"><X size={20} /></button>
                  </div>

                  {/* Modal Body */}
                  <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6">

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
                                          ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
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

                  </form>

                  {/* Modal Footer */}
                  <div className="p-5 border-t border-slate-100 bg-slate-50 flex gap-3 justify-end shrink-0">
                     <button type="button" onClick={closeModal} className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold uppercase tracking-wide hover:bg-slate-100 transition-all">Cancel</button>
                     <button onClick={handleSave} disabled={loading} className="px-6 py-2.5 bg-orange-600 text-white rounded-lg text-xs font-bold uppercase tracking-wide shadow-lg hover:bg-orange-700 transition-all flex items-center gap-2">
                        {loading ? <Loader2 className="animate-spin" size={14} /> : (editingRepair ? 'Update Job' : 'Create Job Ticket')}
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* --- RECEIPT / JOB CARD MODAL --- */}
         {isReceiptOpen && activeRepairForReceipt && (
            <div className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in">
               <div className="bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[95vh] flex flex-col w-full max-w-lg border border-white/20 m-auto">

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
                     <div id="repair-receipt-target" className="receipt-mode bg-white shadow-xl origin-top p-4 text-black font-mono text-[11px] leading-tight w-[80mm] break-words">

                        {/* BUSINESS HEADER */}
                        <div className="text-center mb-4">
                           {/* Logo Section */}
                           {printConfig.showLogo && (
                              <div className="flex justify-center mb-2">
                                 {settings?.logo ? (
                                    <img src={settings.logo} alt="Logo" className="w-16 h-16 object-contain" />
                                 ) : (
                                    <div className="w-10 h-10 border-2 border-black rounded-lg flex items-center justify-center">
                                       <Store size={20} className="text-black" />
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
                     <button onClick={() => printSection('#repair-receipt-target', () => setIsReceiptOpen(false))} className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-wide shadow-xl hover:bg-black transition-all flex items-center justify-center gap-2">
                        <Printer size={16} strokeWidth={3} /> Print & Close
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* DELETE CONFIRMATION MODAL */}
         {repairToDelete && (
            <div className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in">
               <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-8 text-center space-y-6 border border-white/20">
                  <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
                     <AlertTriangle size={40} strokeWidth={2} />
                  </div>
                  <div>
                     <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">Confirm Deletion</h3>
                     <p className="text-sm text-slate-500 font-medium mt-2 leading-relaxed">
                        Are you sure you want to permanently delete job card <span className="text-slate-900 font-bold">"{repairToDelete.jobCardNo}"</span>?
                     </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                     <button onClick={() => setRepairToDelete(null)} disabled={isDeleting} className="py-4 bg-slate-100 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
                     <button onClick={confirmDeleteRepair} disabled={isDeleting} className="py-4 bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-red-600/20 hover:bg-red-700 transition-all flex items-center justify-center gap-2">
                        {isDeleting ? <Loader2 className="animate-spin" size={14} /> : null} {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                     </button>
                  </div>
               </div>
            </div>
         )}

      </div>
   );
};

export default Repairs;
