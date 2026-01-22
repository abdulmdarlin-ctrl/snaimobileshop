
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../db';
import { Supplier, User, Product, Purchase, UserRole, PurchaseItem } from '../types';
import {
   Search, Plus, Filter, Trash2, Edit2, X, Check,
   Truck, PackageCheck, ClipboardList, ShoppingCart,
   ArrowRight, Calendar, User as UserIcon, Building2,
   MoreHorizontal, FileText, AlertCircle, DollarSign,
   TrendingUp, History, Package
} from 'lucide-react';
import { useToast } from './Toast';
import Modal from './Modal';

interface SuppliersProps { user: User; }

type ViewMode = 'vendors' | 'orders';

const Suppliers: React.FC<SuppliersProps> = ({ user }) => {
   // --- Core Data ---
   const { showToast } = useToast();
   const [suppliers, setSuppliers] = useState<Supplier[]>([]);
   const [products, setProducts] = useState<Product[]>([]);
   const [purchases, setPurchases] = useState<Purchase[]>([]);
   const [loading, setLoading] = useState(true);

   // --- UI State ---
   const [viewMode, setViewMode] = useState<ViewMode>('orders');
   const [searchTerm, setSearchTerm] = useState('');

   // --- Modal States ---
   const [isVendorModalOpen, setIsVendorModalOpen] = useState(false);
   const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
   const [selectedOrder, setSelectedOrder] = useState<Purchase | null>(null);

   // --- Form States ---
   const [vendorForm, setVendorForm] = useState<Partial<Supplier>>({});
   const [isEditingVendor, setIsEditingVendor] = useState(false);

   // --- New Order Logic State ---
   const [orderSupplierId, setOrderSupplierId] = useState('');
   const [orderInvoiceRef, setOrderInvoiceRef] = useState('');
   const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
   const [orderCart, setOrderCart] = useState<PurchaseItem[]>([]);
   const [orderNote, setOrderNote] = useState('');

   // -- Item Entry State --
   const [itemSearch, setItemSearch] = useState('');
   const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
   const [itemQty, setItemQty] = useState<number>(1);
   const [itemCost, setItemCost] = useState<number>(0);

   // RBAC
   const canEdit = [UserRole.ADMIN, UserRole.MANAGER].includes(user.role);
   const canDelete = user.role === UserRole.ADMIN;

   // --- Initialization ---
   useEffect(() => {
      fetchData();
   }, []);

   const fetchData = async () => {
      setLoading(true);
      try {
         const [s, p, allPurchases] = await Promise.all([
            db.suppliers.toArray(),
            db.products.toArray(),
            db.purchases.toArray()
         ]);
         setSuppliers(s);
         setProducts(p);
         setPurchases(allPurchases.sort((a, b) => b.timestamp - a.timestamp));
      } finally {
         setLoading(false);
      }
   };

   // --- Computed Stats ---
   const stats = useMemo(() => {
      const totalSpend = purchases.reduce((sum, p) => sum + p.totalAmount, 0);
      const thisMonthSpend = purchases
         .filter(p => {
            const d = new Date(p.timestamp);
            const now = new Date();
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
         })
         .reduce((sum, p) => sum + p.totalAmount, 0);

      return {
         vendorCount: suppliers.length,
         orderCount: purchases.length,
         totalSpend,
         thisMonthSpend
      };
   }, [suppliers, purchases]);

   // --- Handlers: Vendor ---
   const handleSaveVendor = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!vendorForm.name) return;

      try {
         if (vendorForm.id) {
            await db.suppliers.update(vendorForm.id, vendorForm);
         } else {
            await db.suppliers.add(vendorForm as Supplier);
         }
         setIsVendorModalOpen(false);
         setVendorForm({});
         fetchData();
         showToast('Vendor saved successfully', 'success');
      } catch (e) { showToast("Failed to save vendor", 'error'); }
   };

   const handleDeleteVendor = async (id: string) => {
      if (!confirm("Delete this vendor? This cannot be undone.")) return;
      await db.suppliers.delete(id);
      fetchData();
   };

   // --- Handlers: Order Cart ---
   const handleAddItem = () => {
      if (!selectedProduct || itemQty <= 0) return;

      const newItem: PurchaseItem = {
         productId: selectedProduct.id!,
         productName: selectedProduct.name,
         quantity: itemQty,
         unitCost: itemCost,
         totalCost: itemQty * itemCost
      };

      setOrderCart(prev => [...prev, newItem]);

      // Reset inputs but keep search focus logic if needed
      setSelectedProduct(null);
      setItemSearch('');
      setItemQty(1);
      setItemCost(0);
   };

   const handleRemoveItem = (index: number) => {
      setOrderCart(prev => prev.filter((_, i) => i !== index));
   };

   const handleSubmitOrder = async () => {
      if (!orderSupplierId) return showToast("Please select a supplier", 'error');
      if (orderCart.length === 0) return showToast("Order is empty", 'error');

      const supplier = suppliers.find(s => s.id === orderSupplierId);
      const total = orderCart.reduce((sum, i) => sum + i.totalCost, 0);

      const newPurchase: Purchase = {
         supplierId: orderSupplierId,
         supplierName: supplier?.name || 'Unknown',
         invoiceNo: orderInvoiceRef,
         items: orderCart,
         totalAmount: total,
         status: 'Received',
         timestamp: new Date(orderDate).getTime() + new Date().getTime() % 86400000, // Combine date picker + current time
         receivedBy: user.username,
         notes: orderNote
      };

      try {
         await db.purchases.add(newPurchase);

         // Update Inventory
         for (const item of orderCart) {
            const product = products.find(p => p.id === item.productId);
            if (product) {
               const newStock = product.stockQuantity + item.quantity;
               await db.products.update(product.id!, {
                  stockQuantity: newStock,
                  costPrice: item.unitCost // Update cost price to latest
               });

               await db.stockLogs.add({
                  productId: product.id!,
                  productName: product.name,
                  previousStock: product.stockQuantity,
                  newStock,
                  changeAmount: item.quantity,
                  reason: 'Restock',
                  note: `PO #${orderInvoiceRef} from ${supplier?.name}`,
                  user: user.username,
                  timestamp: Date.now()
               });
            }
         }

         setIsOrderModalOpen(false);
         resetOrderForm();
         fetchData();
         showToast('Order processed and stock updated', 'success');
      } catch (e) {
         console.error(e);
         showToast("Failed to process order", 'error');
      }
   };

   const resetOrderForm = () => {
      setOrderCart([]);
      setOrderSupplierId('');
      setOrderInvoiceRef('');
      setOrderNote('');
      setItemSearch('');
      setSelectedProduct(null);
   };

   // --- Filtering ---
   const filteredVendors = suppliers.filter(s =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase())
   );

   const filteredOrders = purchases.filter(p =>
      p.supplierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.invoiceNo?.toLowerCase().includes(searchTerm.toLowerCase())
   );

   const filteredProducts = products.filter(p =>
      p.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
      p.sku.toLowerCase().includes(itemSearch.toLowerCase())
   ).slice(0, 5); // Limit suggestions

   return (
      <div className="space-y-6 animate-in pb-20 font-sans">

         {/* HEADER & KPI */}
         <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 no-print">
            <div>
               <h1 className="text-2xl font-bold text-slate-900 italic uppercase">Procurement</h1>
               <p className="text-xs font-bold text-slate-400 mt-1 uppercase">Supply Chain Management</p>
            </div>

            <div className="flex gap-3">
               <div className="hidden md:flex gap-4 mr-6">
                  <div className="flex items-center gap-3 px-4 py-2 bg-white rounded-3xl border border-slate-100 shadow-sm">
                     <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><TrendingUp size={16} /></div>
                     <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Month Spend</p>
                        <p className="text-sm font-black text-slate-900">{(stats.thisMonthSpend / 1000000).toFixed(2)}M</p>
                        <p className="text-sm font-bold text-slate-900">{(stats.thisMonthSpend / 1000000).toFixed(2)}M</p>
                     </div>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-2 bg-white rounded-3xl border border-slate-100 shadow-sm">
                     <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Building2 size={16} /></div>
                     <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Vendors</p>
                        <p className="text-sm font-bold text-slate-900">{stats.vendorCount}</p>
                     </div>
                  </div>
               </div>

               <button
                  onClick={() => setIsOrderModalOpen(true)}
                  className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-bold uppercase shadow-xl shadow-slate-900/20 hover:bg-black transition-all active:scale-95"
               >
                  <PackageCheck size={16} /> Receive Stock
               </button>
            </div>
         </div>

         {/* NAVIGATION & FILTERS */}
         <div className="bg-white p-2 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4 no-print">
            <div className="flex p-1 bg-slate-100 rounded-xl w-full md:w-auto">
               <button
                  onClick={() => setViewMode('orders')}
                  className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-2 ${viewMode === 'orders' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
               >
                  <ClipboardList size={14} /> Purchase Orders
               </button>
               <button
                  onClick={() => setViewMode('vendors')}
                  className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-2 ${viewMode === 'vendors' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
               >
                  <Truck size={14} /> Supplier Database
               </button>
            </div>

            <div className="relative w-full md:w-72">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
               <input
                  className="win-input pl-9 h-11 bg-slate-50 border-transparent focus:bg-white"
                  placeholder={viewMode === 'orders' ? "Search invoice # or supplier..." : "Search vendors..."}
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
               />
            </div>
         </div>

         {/* --- ORDERS VIEW --- */}
         {viewMode === 'orders' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
               {filteredOrders.length > 0 ? (
                  <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                     <div className="overflow-x-auto">
                        <table className="w-full text-left">
                           <thead className="bg-slate-50 border-b border-slate-100">
                              <tr>
                                 <th className="pl-6 py-4 text-[9px] font-bold text-slate-400 uppercase">Date</th>
                                 <th className="py-4 text-[9px] font-bold text-slate-400 uppercase">Invoice Ref</th>
                                 <th className="py-4 text-[9px] font-bold text-slate-400 uppercase">Supplier</th>
                                 <th className="text-center py-4 text-[9px] font-bold text-slate-400 uppercase">Items</th>
                                 <th className="text-right py-4 text-[9px] font-bold text-slate-400 uppercase">Total Value</th>
                                 <th className="text-center py-4 text-[9px] font-bold text-slate-400 uppercase">Status</th>
                                 <th className="pr-6 text-right py-4 text-[9px] font-bold text-slate-400 uppercase">Action</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-50">
                              {filteredOrders.map(order => (
                                 <tr key={order.id} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="pl-6 py-4">
                                       <div className="flex flex-col">
                                          <span className="text-xs font-bold text-slate-900">{new Date(order.timestamp).toLocaleDateString()}</span>
                                          <span className="text-[10px] text-slate-400 font-medium">{new Date(order.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                       </div>
                                    </td>
                                    <td className="py-4">
                                       <span className="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded">{order.invoiceNo || 'N/A'}</span>
                                    </td>
                                    <td className="py-4">
                                       <span className="text-sm font-bold text-slate-900">{order.supplierName}</span>
                                    </td>
                                    <td className="text-center py-4">
                                       <span className="text-xs font-bold text-slate-700">{order.items.length}</span>
                                    </td>
                                    <td className="text-right py-4">
                                       <span className="text-sm font-bold text-slate-900">{order.totalAmount.toLocaleString()}</span>
                                    </td>
                                    <td className="text-center py-4">
                                       <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase bg-emerald-50 text-emerald-600 border border-emerald-100">
                                          <Check size={10} strokeWidth={4} /> Received
                                       </span>
                                    </td>
                                    <td className="pr-6 text-right py-4">
                                       <button onClick={() => setSelectedOrder(order)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                          <ArrowRight size={16} />
                                       </button>
                                    </td>
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                     </div>
                  </div>
               ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                     <PackageCheck size={64} className="mb-4 opacity-20" />
                     <p className="text-xs font-bold uppercase">No Orders Found</p>
                  </div>
               )}
            </div>
         )}

         {/* --- VENDORS VIEW --- */}
         {viewMode === 'vendors' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
               {canEdit && (
                  <div className="flex justify-end">
                     <button
                        onClick={() => { setVendorForm({}); setIsEditingVendor(false); setIsVendorModalOpen(true); }}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all"
                     >
                        <Plus size={14} strokeWidth={3} /> Add Vendor
                     </button>
                  </div>
               )}

               <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                  {filteredVendors.map(vendor => (
                     <div key={vendor.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all group relative">
                        <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                           {canEdit && <button onClick={() => { setVendorForm(vendor); setIsEditingVendor(true); setIsVendorModalOpen(true); }} className="p-2 bg-slate-50 text-slate-400 hover:text-blue-600 rounded-lg"><Edit2 size={14} /></button>}
                           {canDelete && <button onClick={() => vendor.id && handleDeleteVendor(vendor.id)} className="p-2 bg-slate-50 text-slate-400 hover:text-red-600 rounded-lg"><Trash2 size={14} /></button>}
                        </div>
                        <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 mb-4 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                           <Building2 size={24} />
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 uppercase truncate">{vendor.name}</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-4">{vendor.contactPerson}</p>

                        <div className="space-y-2">
                           <div className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-slate-50 p-2 rounded-lg">
                              <Truck size={14} className="text-slate-400" /> {vendor.phone}
                           </div>
                        </div>
                     </div>
                  ))}
               </div>
            </div>
         )}

         {/* --- NEW ORDER MODAL --- */}
         <Modal
            isOpen={isOrderModalOpen}
            onClose={() => setIsOrderModalOpen(false)}
            title={
               <div className="flex flex-col">
                  <span className="text-lg font-bold text-slate-900 uppercase italic">Receive Stock</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">New Purchase Order</span>
               </div>
            }
            maxWidth="5xl"
            noPadding
         >
            {/* Modal Body: Split View */}
            <div className="flex-1 overflow-hidden flex flex-col lg:flex-row min-h-[600px]">

               {/* Left: Input & Selection */}
               <div className="flex-1 p-8 overflow-y-auto border-r border-slate-100 space-y-8">

                  {/* 1. Supplier & Meta Info */}
                  <section className="space-y-4">
                     <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Order Details</h3>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                           <label className="win-label">Supplier</label>
                           <select className="win-input h-10 text-xs font-bold" value={orderSupplierId} onChange={e => setOrderSupplierId(e.target.value)}>
                              <option value="">-- Select Vendor --</option>
                              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                           </select>
                        </div>
                        <div className="space-y-1.5">
                           <label className="win-label">Date</label>
                           <input type="date" className="win-input h-10 text-xs font-bold" value={orderDate} onChange={e => setOrderDate(e.target.value)} />
                        </div>
                        <div className="col-span-2 space-y-1.5">
                           <label className="win-label">Invoice Ref #</label>
                           <input className="win-input h-10 font-mono uppercase text-xs" placeholder="e.g. INV-2024-001" value={orderInvoiceRef} onChange={e => setOrderInvoiceRef(e.target.value)} />
                        </div>
                     </div>
                  </section>

                  {/* 2. Item Selection */}
                  <section className="space-y-4">
                     <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Add Items</h3>

                     <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <div className="relative">
                           <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                           <input
                              className="win-input pl-10 h-10 text-xs font-bold"
                              placeholder="Search product to add..."
                              value={selectedProduct ? selectedProduct.name : itemSearch}
                              onChange={e => {
                                 setItemSearch(e.target.value);
                                 setSelectedProduct(null); // Reset selection on type
                              }}
                           />
                           {itemSearch && !selectedProduct && (
                              <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 mt-1 rounded-xl shadow-xl z-20 max-h-48 overflow-y-auto">
                                 {filteredProducts.map(p => (
                                    <button
                                       key={p.id}
                                       onClick={() => {
                                          setSelectedProduct(p);
                                          setItemCost(p.costPrice);
                                          setItemSearch('');
                                       }}
                                       className="w-full text-left px-4 py-2 hover:bg-slate-50 text-xs font-bold text-slate-700 border-b border-slate-50 last:border-0"
                                    >
                                       <div className="flex justify-between">
                                          <span>{p.name}</span>
                                          <span className="text-slate-400 font-normal text-[10px]">{p.sku}</span>
                                       </div>
                                    </button>
                                 ))}
                              </div>
                           )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                           <div className="space-y-1.5">
                              <label className="win-label">Quantity</label>
                              <input type="number" min="1" className="win-input h-10 font-bold text-center" value={itemQty} onChange={e => setItemQty(Number(e.target.value))} />
                           </div>
                           <div className="space-y-1.5">
                              <label className="win-label">Unit Cost (UGX)</label>
                              <input type="number" min="0" className="win-input h-10 font-bold text-center" value={itemCost} onChange={e => setItemCost(Number(e.target.value))} />
                           </div>
                        </div>

                        <button
                           onClick={handleAddItem}
                           disabled={!selectedProduct}
                           className="w-full py-3 bg-slate-900 text-white rounded-lg text-[10px] font-bold uppercase hover:bg-black transition-all disabled:opacity-50"
                        >
                           Add to List
                        </button>
                     </div>
                  </section>
               </div>

               {/* Right: Cart Summary */}
               <div className="w-full lg:w-[400px] bg-slate-50/50 flex flex-col border-l border-slate-100">
                  <div className="p-6 border-b border-slate-100">
                     <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">Items Pending ({orderCart.length})</h3>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                     {orderCart.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-300">
                           <ShoppingCart size={40} className="mb-2 opacity-50" />
                           <p className="text-[10px] font-bold uppercase tracking-widest">List Empty</p>
                        </div>
                     ) : (
                        orderCart.map((item, idx) => (
                           <div key={idx} className="bg-white p-3 rounded-xl border border-slate-100 flex justify-between items-center group shadow-sm">
                              <div>
                                 <p className="text-xs font-bold text-slate-900 truncate max-w-[180px]">{item.productName}</p>
                                 <p className="text-[10px] text-slate-500 font-medium">
                                    {item.quantity} x {item.unitCost.toLocaleString()}
                                 </p>
                              </div>
                              <div className="flex items-center gap-3">
                                 <span className="text-xs font-black text-slate-900">{item.totalCost.toLocaleString()}</span>
                                 <button onClick={() => handleRemoveItem(idx)} className="text-slate-300 hover:text-red-500"><X size={14} /></button>
                              </div>
                           </div>
                        ))
                     )}
                  </div>

                  <div className="p-6 bg-white border-t border-slate-100 space-y-4">
                     <div className="space-y-1">
                        <div className="flex justify-between text-xs font-bold text-slate-500 uppercase">
                           <span>Total Qty</span>
                           <span>{orderCart.reduce((s, i) => s + i.quantity, 0)}</span>
                        </div>
                        <div className="flex justify-between items-baseline pt-2 border-t border-slate-100 border-dashed">
                           <span className="text-sm font-black text-slate-900 uppercase tracking-widest">Total</span>
                           <span className="text-xl font-black text-slate-900">
                              <span className="text-xs text-slate-400 mr-1 align-top">UGX</span>
                              {orderCart.reduce((s, i) => s + i.totalCost, 0).toLocaleString()}
                           </span>
                        </div>
                     </div>
                     <button
                        onClick={handleSubmitOrder}
                        className="w-full py-4 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-[2px] shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                     >
                        <Check size={16} strokeWidth={4} /> Confirm & Receive
                     </button>
                  </div>
               </div>
            </div>
         </Modal>

         {/* --- VENDOR FORM MODAL --- */}
         <Modal
            isOpen={isVendorModalOpen}
            onClose={() => setIsVendorModalOpen(false)}
            title={isEditingVendor ? 'Edit Vendor' : 'New Vendor'}
            maxWidth="md"
         >
            <form onSubmit={handleSaveVendor} className="space-y-4">
               <div className="space-y-1.5">
                  <label className="win-label">Company Name</label>
                  <input required className="win-input h-11 font-bold" value={vendorForm.name || ''} onChange={e => setVendorForm({ ...vendorForm, name: e.target.value })} placeholder="e.g. Apex Tech Ltd" />
               </div>
               <div className="space-y-1.5">
                  <label className="win-label">Contact Person</label>
                  <input className="win-input h-11" value={vendorForm.contactPerson || ''} onChange={e => setVendorForm({ ...vendorForm, contactPerson: e.target.value })} placeholder="e.g. John Doe" />
               </div>
               <div className="space-y-1.5">
                  <label className="win-label">Phone</label>
                  <input className="win-input h-11" value={vendorForm.phone || ''} onChange={e => setVendorForm({ ...vendorForm, phone: e.target.value })} placeholder="e.g. +256 700..." />
               </div>
               <div className="pt-4">
                  <button className="w-full py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-[2px] hover:bg-black transition-all">Save Profile</button>
               </div>
            </form>
         </Modal>

         {/* --- ORDER DETAILS MODAL --- */}
         <Modal
            isOpen={!!selectedOrder}
            onClose={() => setSelectedOrder(null)}
            title={
               <div className="flex flex-col">
                  <span className="text-lg font-bold text-slate-900 uppercase">Order Details</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">{selectedOrder?.invoiceNo || 'N/A'}</span>
               </div>
            }
            maxWidth="2xl"
         >
            {selectedOrder && (
               <div className="space-y-6">
                  <div className="flex justify-between items-start bg-slate-50 p-4 rounded-xl border border-slate-100">
                     <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Supplier</p>
                        <p className="text-sm font-bold text-slate-900">{selectedOrder.supplierName}</p>
                     </div>
                     <div className="text-right">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Date Received</p>
                        <p className="text-sm font-bold text-slate-900">{new Date(selectedOrder.timestamp).toLocaleDateString()}</p>
                     </div>
                  </div>

                  <div className="space-y-3">
                     <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-2">Line Items</h3>
                     {selectedOrder.items.map((item, i) => (
                        <div key={i} className="flex justify-between items-center py-2 border-b border-slate-50 last:border-0">
                           <div>
                              <p className="text-xs font-bold text-slate-900">{item.productName}</p>
                              <p className="text-[10px] text-slate-500">{item.quantity} units @ {item.unitCost.toLocaleString()}</p>
                           </div>
                           <p className="text-xs font-black text-slate-900">{item.totalCost.toLocaleString()}</p>
                        </div>
                     ))}
                  </div>

                  <div className="flex justify-between items-center pt-4 border-t-2 border-slate-100 border-dashed">
                     <span className="text-sm font-black text-slate-900 uppercase tracking-widest">Total Value</span>
                     <span className="text-xl font-black text-slate-900">UGX {selectedOrder.totalAmount.toLocaleString()}</span>
                  </div>
               </div>
            )}
         </Modal>

      </div>
   );
};

export default Suppliers;
