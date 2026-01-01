
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../db';
import { Product, Sale, SaleItem, User, AppSettings, ProductType, UserRole } from '../types';
import {
   Search, ShoppingCart, Trash2, Plus, Minus, CreditCard,
   Printer, History, RotateCcw, X, Check, Calculator,
   User as UserIcon, AlertCircle, Package, Receipt, Edit,
   ChevronRight, Smartphone, Headphones, Battery, Box, Filter,
   Loader2, AlertTriangle, ScanBarcode, Download, FileText, Calendar,
   Eraser, Store, LayoutGrid, List as ListIcon, TrendingUp, DollarSign
} from 'lucide-react';
import { printSection, exportSectionToPDF } from '../utils/printExport';
import { useToast } from './Toast';

interface POSProps {
   user: User;
}

const POS: React.FC<POSProps> = ({ user }) => {
   const { showToast } = useToast();
   const [products, setProducts] = useState<Product[]>([]);
   const [salesHistory, setSalesHistory] = useState<Sale[]>([]);
   const [cart, setCart] = useState<SaleItem[]>([]);
   const [loading, setLoading] = useState(true);
   const [searchTerm, setSearchTerm] = useState('');
   const [settings, setSettings] = useState<AppSettings | null>(null);
   const [clearingHistory, setClearingHistory] = useState(false);

   // Report Filters
   const [reportStartDate, setReportStartDate] = useState(new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0]);
   const [reportEndDate, setReportEndDate] = useState(new Date().toISOString().split('T')[0]);
   const [reportCategory, setReportCategory] = useState('All');
   const [reportCashier, setReportCashier] = useState('All');
   const [reportViewMode, setReportViewMode] = useState<'list' | 'statement'>('list');

   // Modals
   const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
   const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
   const [isReceiptOpen, setIsReceiptOpen] = useState(false);
   const [isClearHistoryConfirmOpen, setIsClearHistoryConfirmOpen] = useState(false);
   const [processingPayment, setProcessingPayment] = useState(false);

   // Admin Actions State
   const [saleToEdit, setSaleToEdit] = useState<Sale | null>(null);
   const [isEditModalOpen, setIsEditModalOpen] = useState(false);
   const [saleToDelete, setSaleToDelete] = useState<Sale | null>(null);
   const [isDeleting, setIsDeleting] = useState(false);
   const [isUpdating, setIsUpdating] = useState(false);

   // Checkout State
   const [checkoutForm, setCheckoutForm] = useState({
      amountPaid: 0,
      paymentMethod: 'Cash' as const,
      customerName: '',
      customerPhone: '',
      customerType: 'Retail' as const
   });

   const [lastSale, setLastSale] = useState<Sale | null>(null);
   const searchInputRef = useRef<HTMLInputElement>(null);

   useEffect(() => {
      fetchData();
   }, []);

   const fetchData = async () => {
      setLoading(true);
      const [p, s, sets] = await Promise.all([
         db.products.toArray(),
         db.sales.toArray(),
         db.settings.toCollection().first()
      ]);
      // Only show active products with stock or if negative stock is enabled (checked later)
      setProducts(p.filter(x => x.inventoryType !== 'Loan'));
      setSalesHistory(s.sort((a, b) => b.timestamp - a.timestamp));
      setSettings(sets || null);
      setLoading(false);
   };

   const categories = useMemo(() => {
      const cats = new Set(products.map(p => p.category));
      return ['All', ...Array.from(cats)];
   }, [products]);

   const cashiers = useMemo(() => {
      const list = new Set(salesHistory.map(s => s.cashierName));
      return ['All', ...Array.from(list)];
   }, [salesHistory]);

   const filteredProducts = useMemo(() => {
      if (!searchTerm.trim()) return [];

      return products.filter(p => {
         const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.sku.toLowerCase().includes(searchTerm.toLowerCase());
         return matchesSearch;
      });
   }, [products, searchTerm]);

   const filteredHistory = useMemo(() => {
      return salesHistory.filter(s => {
         const date = new Date(s.timestamp);
         const start = new Date(reportStartDate);
         const end = new Date(reportEndDate);
         end.setHours(23, 59, 59, 999); // End of day

         const matchesDate = date >= start && date <= end;
         const matchesCashier = reportCashier === 'All' || s.cashierName === reportCashier;

         // Category match: If 'All', match. If specific, check if ANY item in sale belongs to that category
         const matchesCategory = reportCategory === 'All' || s.items.some(item => {
            const prod = products.find(p => p.id === item.productId);
            return prod?.category === reportCategory;
         });

         return matchesDate && matchesCashier && matchesCategory;
      });
   }, [salesHistory, reportStartDate, reportEndDate, reportCashier, reportCategory, products]);

   const reportTotals = useMemo(() => {
      const revenue = filteredHistory.reduce((sum, s) => sum + s.total, 0);
      const count = filteredHistory.length;
      const avgTicket = count > 0 ? revenue / count : 0;
      return { revenue, count, avgTicket };
   }, [filteredHistory]);

   // --- CART ACTIONS ---

   const addToCart = (product: Product) => {
      if (product.stockQuantity <= 0 && !settings?.enableNegativeStock) {
         showToast("Out of stock!", 'error');
         return;
      }

      setCart(prev => {
         const existing = prev.find(item => item.productId === product.id);
         if (existing) {
            if (existing.quantity >= product.stockQuantity && !settings?.enableNegativeStock) {
               showToast("Stock limit reached for this item.", 'error');
               return prev;
            }
            return prev.map(item => item.productId === product.id
               ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.price }
               : item
            );
         }
         return [...prev, {
            productId: product.id!,
            name: product.name,
            quantity: 1,
            price: product.selling_price,
            total: product.selling_price
         }];
      });

      // Keep focus on search input for rapid scanning
      if (searchInputRef.current) {
         searchInputRef.current.focus();
      }
   };

   const updateQuantity = (productId: string, delta: number) => {
      setCart(prev => {
         return prev.map(item => {
            if (item.productId === productId) {
               const product = products.find(p => p.id === productId);
               const newQty = item.quantity + delta;

               if (newQty <= 0) return item; // Don't remove, just floor at 1 or handle removal separately
               if (product && newQty > product.stockQuantity && !settings?.enableNegativeStock && delta > 0) {
                  return item; // Max stock reached
               }

               return { ...item, quantity: newQty, total: newQty * item.price };
            }
            return item;
         });
      });
   };

   const removeFromCart = (productId: string) => {
      setCart(prev => prev.filter(item => item.productId !== productId));
   };

   const clearCart = () => setCart([]);

   // --- CHECKOUT ---

   const subtotal = cart.reduce((acc, item) => acc + item.total, 0);
   const tax = settings?.taxEnabled ? (subtotal * (settings.taxPercentage || 18) / 100) : 0;
   const total = subtotal + tax;

   const handleCheckout = () => {
      if (cart.length === 0) return;
      setCheckoutForm(prev => ({ ...prev, amountPaid: total }));
      setIsCheckoutOpen(true);
   };

   const processPayment = async () => {
      if (checkoutForm.amountPaid < total) {
         showToast("Amount paid is less than total.", 'error');
         return;
      }

      setProcessingPayment(true);
      try {
         const sale: Sale = {
            receiptNo: `${settings?.invoicePrefix || 'INV'}-${Date.now().toString().slice(-6)}`,
            items: cart,
            subtotal,
            tax,
            discount: 0,
            total,
            amountPaid: 0,
            balance: 0,
            paymentMethod: checkoutForm.paymentMethod,
            customerName: checkoutForm.customerName,
            customerPhone: checkoutForm.customerPhone,
            customerType: checkoutForm.customerType,
            cashierName: user.username,
            timestamp: Date.now()
         };

         const result = await db.sales.add(sale);

         // Update Stock
         for (const item of cart) {
            const product = products.find(p => p.id === item.productId);
            if (product && product.id) {
               const newStock = product.stockQuantity - item.quantity;
               await db.products.update(product.id, { stockQuantity: newStock });
            }
         }

         setLastSale({ ...sale, id: result.id });
         setSalesHistory(prev => [result, ...prev]);
         setProducts(await db.products.toArray()); // Refresh products to show new stock

         setIsCheckoutOpen(false);
         setCart([]);
         setCheckoutForm({
            amountPaid: 0,
            paymentMethod: 'Cash',
            customerName: '',
            customerPhone: '',
            customerType: 'Retail'
         });

         // Auto Print or Open Receipt
         setIsReceiptOpen(true);
         showToast("Sale completed successfully", 'success');

      } catch (e) {
         console.error(e);
         showToast("Transaction failed.", 'error');
      } finally {
         setProcessingPayment(false);
      }
   };

   // --- ADMIN ACTIONS (EDIT / DELETE) ---

   const confirmDeleteSale = async () => {
      if (!saleToDelete || !saleToDelete.id) return;
      setIsDeleting(true);
      try {
         // Restore Stock
         for (const item of saleToDelete.items) {
            if (item.productId) {
               const allProds = await db.products.toArray();
               const product = allProds.find(p => p.id === item.productId);
               if (product) {
                  await db.products.update(item.productId, {
                     stockQuantity: product.stockQuantity + item.quantity
                  });
               }
            }
         }

         await db.sales.delete(saleToDelete.id);
         setSalesHistory(prev => prev.filter(s => s.id !== saleToDelete.id));
         setSaleToDelete(null);

         // Refresh products to show restored stock
         const p = await db.products.toArray();
         setProducts(p.filter(x => x.inventoryType !== 'Loan'));
         showToast("Sale record deleted", 'success');
      } catch (e) {
         console.error("Delete Error:", e);
         showToast("Failed to delete sale record.", 'error');
      } finally {
         setIsDeleting(false);
      }
   };

   const handleUpdateSale = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!saleToEdit || !saleToEdit.id) return;

      setIsUpdating(true);
      try {
         const originalSale = salesHistory.find(s => s.id === saleToEdit.id);
         if (!originalSale) return;

         // 1. Revert original stock changes (Add back original quantities)
         for (const item of originalSale.items) {
            if (item.productId) {
               const allProds = await db.products.toArray();
               const p = allProds.find(prod => prod.id === item.productId);
               if (p) await db.products.update(item.productId, { stockQuantity: p.stockQuantity + item.quantity });
            }
         }

         // 2. Apply new stock changes (Subtract new quantities)
         for (const item of saleToEdit.items) {
            if (item.productId) {
               const allProds = await db.products.toArray();
               const p = allProds.find(prod => prod.id === item.productId);
               if (p) await db.products.update(item.productId, { stockQuantity: p.stockQuantity - item.quantity });
            }
         }

         // 3. Update Sale Record
         await db.sales.update(saleToEdit.id, saleToEdit);

         // Update local state
         setSalesHistory(prev => prev.map(s => s.id === saleToEdit.id ? saleToEdit : s));
         setIsEditModalOpen(false);
         setSaleToEdit(null);

         // Refresh products
         const p = await db.products.toArray();
         setProducts(p.filter(x => x.inventoryType !== 'Loan'));
         showToast("Sale updated successfully", 'success');

      } catch (e) {
         console.error("Update Error:", e);
         showToast("Failed to update sale record.", 'error');
      } finally {
         setIsUpdating(false);
      }
   };

   const updateEditItem = (index: number, field: 'quantity' | 'price', value: number) => {
      if (!saleToEdit) return;

      const newItems = [...saleToEdit.items];
      const item = { ...newItems[index] };

      if (field === 'quantity') {
         item.quantity = value;
         item.total = value * item.price;
      } else {
         item.price = value;
         item.total = item.quantity * value;
      }

      newItems[index] = item;

      // Recalc totals
      const subtotal = newItems.reduce((sum, i) => sum + i.total, 0);
      const tax = settings?.taxEnabled ? (subtotal * (settings.taxPercentage || 18) / 100) : 0;
      const total = subtotal + tax;

      setSaleToEdit({
         ...saleToEdit,
         items: newItems,
         subtotal,
         tax,
         total,
         balance: total - saleToEdit.amountPaid
      });
   };

   const initiateClearHistory = () => {
      if (user.role !== UserRole.ADMIN) {
         showToast("Action Denied: Only Administrators can clear sales history.", 'error');
         return;
      }
      setIsClearHistoryConfirmOpen(true);
   };

   const performClearHistory = async () => {
      setClearingHistory(true);
      try {
         const allSales = await db.sales.toArray();
         const deletePromises = allSales.map(sale => sale.id ? db.sales.delete(sale.id) : Promise.resolve());
         await Promise.all(deletePromises);

         setSalesHistory([]);
         setIsClearHistoryConfirmOpen(false);
         showToast("Sales history cleared", 'success');
      } catch (e: any) {
         showToast(`System Error: ${e.message}`, 'error');
      } finally {
         setClearingHistory(false);
      }
   };

   const downloadCSV = () => {
      if (filteredHistory.length === 0) return showToast("No data to export", 'info');
      const headers = ['Receipt No', 'Date', 'Time', 'Cashier', 'Customer', 'Items', 'Payment Method', 'Total (UGX)'];
      const rows = filteredHistory.map(s => [
         s.receiptNo,
         new Date(s.timestamp).toLocaleDateString(),
         new Date(s.timestamp).toLocaleTimeString(),
         s.cashierName,
         s.customerName || 'Walk-in',
         `"${s.items.map(i => `${i.name} (x${i.quantity})`).join(', ')}"`,
         s.paymentMethod,
         s.total
      ]);
      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Sales_Report_${reportStartDate}_to_${reportEndDate}.csv`;
      link.click();
      URL.revokeObjectURL(url);
   };

   const getProductIcon = (type: ProductType) => {
      switch (type) {
         case ProductType.PHONE: return <Smartphone size={24} strokeWidth={1.5} />;
         case ProductType.ACCESSORY: return <Headphones size={24} strokeWidth={1.5} />;
         case ProductType.SPARE_PART: return <Battery size={24} strokeWidth={1.5} />;
         default: return <Box size={24} strokeWidth={1.5} />;
      }
   };

   return (
      <div className="flex flex-col lg:flex-row h-full gap-6 font-sans pb-20 lg:pb-0">

         {/* LEFT: Product Catalog */}
         <div className="flex-1 flex flex-col min-w-0 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden h-full">
            {/* Search Header */}
            <div className="p-4 border-b border-slate-100 flex gap-4 bg-white sticky top-0 z-10">
               <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                     ref={searchInputRef}
                     className="w-full pl-10 pr-10 h-12 bg-slate-50 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-slate-200"
                     placeholder="Search item name or SKU..."
                     value={searchTerm}
                     onChange={e => setSearchTerm(e.target.value)}
                     autoFocus
                  />
                  {searchTerm ? (
                     <button
                        onClick={() => { setSearchTerm(''); searchInputRef.current?.focus(); }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                     >
                        <X size={18} />
                     </button>
                  ) : (
                     <ScanBarcode className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  )}
               </div>
            </div>

            {/* Product Grid */}
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50">
               {loading ? (
                  <div className="h-full flex items-center justify-center text-slate-400">
                     <Loader2 className="animate-spin" size={32} />
                  </div>
               ) : !searchTerm ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300">
                     <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                        <Search size={40} className="opacity-50 text-slate-400" />
                     </div>
                     <p className="text-sm font-bold uppercase tracking-wider text-slate-400">Start Typing to Search</p>
                     <p className="text-[10px] font-medium text-slate-400 mt-2">Find items by Name or SKU</p>
                  </div>
               ) : filteredProducts.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300">
                     <Package size={48} className="mb-4 opacity-50" />
                     <p className="text-sm font-bold uppercase">No items found</p>
                  </div>
               ) : (
                  <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                     {filteredProducts.map(product => {
                        const isLowStock = product.stockQuantity <= 5;
                        const isOut = product.stockQuantity <= 0;

                        return (
                           <button
                              key={product.id}
                              onClick={() => addToCart(product)}
                              className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all text-left group flex flex-col justify-between h-[180px] relative overflow-hidden active:scale-95"
                           >
                              {isOut && <div className="absolute inset-0 bg-white/60 z-10 flex items-center justify-center backdrop-blur-[1px]"><span className="bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded uppercase">Out of Stock</span></div>}

                              <div>
                                 <div className="flex justify-between items-start mb-3">
                                    <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center group-hover:bg-slate-900 group-hover:text-white transition-colors">
                                       {getProductIcon(product.type)}
                                    </div>
                                    <span className={`px-2 py-1 rounded text-[9px] font-black uppercase ${isOut ? 'bg-red-50 text-red-600 border border-red-100' :
                                       isLowStock ? 'bg-orange-50 text-orange-600 border border-orange-100' :
                                          'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                       }`}>
                                       {product.stockQuantity} Left
                                    </span>
                                 </div>
                                 <h3 className="text-sm font-bold text-slate-800 line-clamp-2 leading-tight group-hover:text-blue-600 transition-colors">{product.name}</h3>
                                 <p className="text-[10px] text-slate-400 font-mono mt-1">{product.sku}</p>
                              </div>

                              <div className="mt-2 pt-3 border-t border-slate-50 flex items-center justify-between">
                                 <p className="text-sm font-black text-slate-900">
                                    <span className="text-[10px] text-slate-400 mr-0.5">UGX</span>
                                    {product.selling_price.toLocaleString()}
                                 </p>
                                 <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                                    <Plus size={14} strokeWidth={3} />
                                 </div>
                              </div>
                           </button>
                        );
                     })}
                  </div>
               )}
            </div>
         </div>

         {/* RIGHT: Cart & Checkout */}
         <div className="w-full lg:w-[400px] xl:w-[450px] bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col overflow-hidden shrink-0 h-full">
            {/* Cart Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white">
               <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow-lg">
                     <ShoppingCart size={20} />
                  </div>
                  <div>
                     <h2 className="text-base font-bold text-slate-900 uppercase">Current Order</h2>
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{cart.length} Items</p>
                  </div>
               </div>
               <button
                  onClick={clearCart}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  title="Clear Cart"
               >
                  <Trash2 size={18} />
               </button>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
               {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300">
                     <ShoppingCart size={48} className="mb-4 opacity-20" />
                     <p className="text-xs font-bold uppercase tracking-widest">Cart is empty</p>
                     <p className="text-[10px] mt-2">Search items from the catalog</p>
                  </div>
               ) : (
                  cart.map((item, idx) => (
                     <div key={idx} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex items-center gap-3 animate-in slide-in-from-right-2">
                        <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500 font-bold text-[10px]">
                           {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                           <p className="text-xs font-bold text-slate-800 truncate">{item.name}</p>
                           <p className="text-[10px] font-bold text-slate-400">
                              {item.price.toLocaleString()} x {item.quantity}
                           </p>
                        </div>
                        <div className="flex items-center gap-2 bg-slate-50 rounded-lg p-1">
                           <button onClick={() => updateQuantity(item.productId, -1)} className="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm text-slate-600 hover:text-red-500"><Minus size={12} /></button>
                           <span className="text-xs font-bold w-6 text-center">{item.quantity}</span>
                           <button onClick={() => updateQuantity(item.productId, 1)} className="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm text-slate-600 hover:text-emerald-500"><Plus size={12} /></button>
                        </div>
                        <div className="text-right min-w-[70px]">
                           <p className="text-xs font-bold text-slate-900">{item.total.toLocaleString()}</p>
                           <button onClick={() => removeFromCart(item.productId)} className="text-[9px] text-red-400 hover:text-red-600 underline">Remove</button>
                        </div>
                     </div>
                  ))
               )}
            </div>

            {/* Summary & Actions */}
            <div className="p-6 bg-white border-t border-slate-100 shadow-[0_-4px_20px_rgba(0,0,0,0.02)] z-10">
               <div className="space-y-2 mb-6">
                  <div className="flex justify-between text-xs font-medium text-slate-500">
                     <span>Subtotal</span>
                     <span className="font-bold">{subtotal.toLocaleString()}</span>
                  </div>
                  {settings?.taxEnabled && (
                     <div className="flex justify-between text-xs font-medium text-slate-500">
                        <span>Tax ({settings.taxPercentage}%)</span>
                        <span className="font-bold">{tax.toLocaleString()}</span>
                     </div>
                  )}
                  <div className="flex justify-between items-baseline pt-4 border-t border-dashed border-slate-200">
                     <span className="text-sm font-black text-slate-900 uppercase">Total Payable</span>
                     <span className="text-3xl font-black text-emerald-600">
                        <span className="text-xs text-slate-400 mr-1 font-medium">UGX</span>
                        {total.toLocaleString()}
                     </span>
                  </div>
               </div>

               <div className="grid grid-cols-4 gap-2">
                  <button
                     onClick={() => setIsHistoryModalOpen(true)}
                     className="col-span-1 py-4 bg-slate-100 text-slate-500 rounded-xl flex items-center justify-center hover:bg-slate-200 transition-colors"
                     title="Sales History & Reports"
                  >
                     <History size={20} />
                  </button>
                  <button
                     disabled={cart.length === 0}
                     onClick={handleCheckout}
                     className="col-span-3 py-4 bg-emerald-600 text-white rounded-xl text-sm font-black uppercase tracking-[2px] shadow-xl shadow-emerald-900/20 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                  >
                     Charge <ChevronRight size={18} strokeWidth={3} />
                  </button>
               </div>
            </div>
         </div>

         {/* --- CHECKOUT MODAL --- */}
         {isCheckoutOpen && (
            <div className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in">
               <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/20">
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                     <div>
                        <h2 className="text-lg font-black text-slate-900 uppercase italic tracking-tight">Checkout</h2>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Complete Transaction</p>
                     </div>
                     <button onClick={() => setIsCheckoutOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-all"><X size={20} /></button>
                  </div>

                  <div className="p-8 space-y-6">
                     {/* Amount Due Display */}
                     <div className="text-center mb-6">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Amount Due</p>
                        <p className="text-4xl font-black text-slate-900 tracking-tighter">
                           <span className="text-lg text-slate-400 mr-1 align-top">UGX</span>
                           {total.toLocaleString()}
                        </p>
                     </div>

                     {/* Payment Method */}
                     <div className="space-y-3">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide ml-1">Payment Method</label>
                        <div className="grid grid-cols-3 gap-2">
                           {['Cash', 'Mobile Money', 'Bank'].map(m => (
                              <button
                                 key={m}
                                 onClick={() => setCheckoutForm(prev => ({ ...prev, paymentMethod: m as any }))}
                                 className={`py-3 rounded-xl text-xs font-bold border transition-all ${checkoutForm.paymentMethod === m
                                    ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                                    }`}
                              >
                                 {m}
                              </button>
                           ))}
                        </div>
                     </div>

                     {/* Payment Input */}
                     <div className="space-y-3">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide ml-1">Amount Tendered</label>
                        <div className="relative">
                           <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">UGX</span>
                           <input
                              type="number"
                              autoFocus
                              className="w-full h-14 bg-slate-50 rounded-2xl pl-12 pr-4 text-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200 transition-all"
                              value={checkoutForm.amountPaid || ''}
                              onChange={e => setCheckoutForm(prev => ({ ...prev, amountPaid: Number(e.target.value) }))}
                           />
                        </div>
                        {checkoutForm.amountPaid >= total && (
                           <div className="flex justify-between items-center px-4 py-2 bg-emerald-50 rounded-xl border border-emerald-100">
                              <span className="text-xs font-bold text-emerald-600 uppercase">Change Due</span>
                              <span className="text-lg font-black text-emerald-700">{(checkoutForm.amountPaid - total).toLocaleString()}</span>
                           </div>
                        )}
                     </div>

                     {/* Optional Customer Info */}
                     <details className="group">
                        <summary className="list-none flex items-center gap-2 text-xs font-bold text-slate-500 cursor-pointer hover:text-slate-800 transition-colors py-2">
                           <ChevronRight size={14} className="group-open:rotate-90 transition-transform" />
                           Add Customer Details (Optional)
                        </summary>
                        <div className="space-y-3 pt-2 animate-in slide-in-from-top-2">
                           <input
                              className="w-full h-10 bg-slate-50 rounded-xl px-4 text-xs font-bold outline-none focus:ring-2 focus:ring-slate-200"
                              placeholder="Customer Name"
                              value={checkoutForm.customerName}
                              onChange={e => setCheckoutForm(prev => ({ ...prev, customerName: e.target.value }))}
                           />
                           <input
                              className="w-full h-10 bg-slate-50 rounded-xl px-4 text-xs font-bold outline-none focus:ring-2 focus:ring-slate-200"
                              placeholder="Phone Number"
                              value={checkoutForm.customerPhone}
                              onChange={e => setCheckoutForm(prev => ({ ...prev, customerPhone: e.target.value }))}
                           />
                        </div>
                     </details>

                     <button
                        onClick={processPayment}
                        disabled={processingPayment || checkoutForm.amountPaid < total}
                        className="w-full py-4 bg-emerald-600 text-white rounded-2xl text-xs font-black uppercase tracking-[3px] shadow-xl shadow-emerald-600/20 hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 active:scale-95"
                     >
                        {processingPayment ? <Loader2 className="animate-spin" /> : <Check size={20} strokeWidth={4} />}
                        Complete Sale
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* --- RECEIPT MODAL --- */}
         {isReceiptOpen && lastSale && (
            <div className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in">
               <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-white/20 flex flex-col max-h-[90vh]">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center no-print">
                     <h3 className="text-sm font-bold text-slate-900 uppercase">Receipt Preview</h3>
                     <button onClick={() => setIsReceiptOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 rounded-lg"><X size={18} /></button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 bg-slate-200 flex justify-center">
                     <div id="pos-receipt" className="receipt-mode bg-white p-4 shadow-xl text-black font-mono text-[11px] leading-tight w-full max-w-[80mm]">
                        <div className="text-center mb-4">
                           {settings?.logo ? (
                              <img src={settings.logo} className="h-16 mx-auto mb-2 object-contain grayscale" alt="Logo" />
                           ) : (
                              <div className="h-16 w-16 mx-auto mb-2 border-2 border-black border-dashed rounded-full flex items-center justify-center">
                                 <Store size={24} className="text-black" />
                              </div>
                           )}
                           <h2 className="font-bold text-sm uppercase">{settings?.businessName || 'SNA SHOP'}</h2>
                           <div className="text-[10px]">{settings?.address}</div>
                           <div className="text-[10px]">Tel: {settings?.phone}</div>
                           {settings?.tin && <div className="text-[10px]">TIN: {settings.tin}</div>}
                        </div>

                        <div className="border-b border-black border-dashed mb-2"></div>

                        <div className="flex justify-between mb-1">
                           <span>Date: {new Date(lastSale.timestamp).toLocaleDateString()}</span>
                           <span>Time: {new Date(lastSale.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className="mb-2">
                           <div>Receipt #: {lastSale.receiptNo}</div>
                           <div>Cashier: {lastSale.cashierName}</div>
                           {lastSale.customerName && <div>Cust: {lastSale.customerName}</div>}
                        </div>

                        <div className="border-b border-black border-dashed mb-2"></div>

                        <div className="mb-2">
                           {lastSale.items.map((item, i) => (
                              <div key={i} className="mb-1">
                                 <div>{item.name}</div>
                                 <div className="flex justify-between pl-2">
                                    <span>{item.quantity} x {item.price.toLocaleString()}</span>
                                    <span className="font-bold">{item.total.toLocaleString()}</span>
                                 </div>
                              </div>
                           ))}
                        </div>

                        <div className="border-b border-black border-dashed mb-2"></div>

                        <div className="space-y-1 mb-2">
                           <div className="flex justify-between font-bold">
                              <span>SUBTOTAL</span>
                              <span>{lastSale.subtotal.toLocaleString()}</span>
                           </div>
                           {lastSale.tax > 0 && (
                              <div className="flex justify-between">
                                 <span>TAX</span>
                                 <span>{lastSale.tax.toLocaleString()}</span>
                              </div>
                           )}
                           <div className="flex justify-between font-bold text-sm border-t border-black pt-1 mt-1">
                              <span>TOTAL</span>
                              <span>{lastSale.total.toLocaleString()}</span>
                           </div>
                        </div>

                        <div className="text-center text-[10px]">
                           {settings?.receiptFooter || 'Thank you for shopping with us!'}
                        </div>
                     </div>
                  </div>

                  <div className="p-4 bg-white border-t border-slate-100 flex gap-3 no-print">
                     <button onClick={() => setIsReceiptOpen(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold uppercase hover:bg-slate-200">Close</button>
                     <button onClick={() => printSection('#pos-receipt')} className="flex-1 py-3 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase hover:bg-black flex items-center justify-center gap-2">
                        <Printer size={16} /> Print
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* --- HISTORY & REPORTS MODAL --- */}
         {isHistoryModalOpen && (
            <div className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in">
               <div className={`bg-white w-full rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/20 flex flex-col max-h-[90vh] ${reportViewMode === 'statement' ? 'max-w-4xl' : 'max-w-5xl'}`}>

                  {/* Modal Header */}
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between no-print">
                     <div className="flex items-center gap-3">
                        <h2 className="text-lg font-black text-slate-900 uppercase">Sales History & Reports</h2>

                        {/* View Toggle */}
                        <div className="flex p-1 bg-slate-100 rounded-lg ml-4">
                           <button
                              onClick={() => setReportViewMode('list')}
                              className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase flex items-center gap-2 transition-all ${reportViewMode === 'list' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                           >
                              <ListIcon size={14} /> List View
                           </button>
                           <button
                              onClick={() => setReportViewMode('statement')}
                              className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase flex items-center gap-2 transition-all ${reportViewMode === 'statement' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                           >
                              <FileText size={14} /> Statement View
                           </button>
                        </div>
                     </div>

                     <div className="flex items-center gap-2">
                        <button
                           onClick={downloadCSV}
                           className="px-4 py-2 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-lg text-xs font-bold uppercase hover:bg-emerald-100 mr-2 flex items-center gap-2"
                        >
                           <FileText size={14} /> CSV
                        </button>
                        <button
                           onClick={() => exportSectionToPDF(reportViewMode === 'statement' ? '#sales-statement' : '#sales-history-table', 'Sales_Report.pdf')}
                           className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold uppercase hover:bg-slate-50 mr-2 flex items-center gap-2"
                        >
                           <Download size={14} /> PDF
                        </button>
                        {user.role === UserRole.ADMIN && (
                           <button
                              onClick={initiateClearHistory}
                              disabled={clearingHistory}
                              className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-xs font-bold uppercase hover:bg-red-100 mr-2 flex items-center gap-2 disabled:opacity-50"
                           >
                              {clearingHistory ? <Loader2 size={14} className="animate-spin" /> : <Eraser size={14} />} Clear All
                           </button>
                        )}
                        <button onClick={() => setIsHistoryModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-100"><X size={20} /></button>
                     </div>
                  </div>

                  {/* Filters Section */}
                  <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap gap-4 items-end no-print">
                     <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Start Date</label>
                        <input type="date" className="win-input h-10 bg-white" value={reportStartDate} onChange={e => setReportStartDate(e.target.value)} />
                     </div>
                     <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">End Date</label>
                        <input type="date" className="win-input h-10 bg-white" value={reportEndDate} onChange={e => setReportEndDate(e.target.value)} />
                     </div>
                     <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Category</label>
                        <select className="win-input h-10 bg-white" value={reportCategory} onChange={e => setReportCategory(e.target.value)}>
                           {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                     </div>
                     <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Cashier</label>
                        <select className="win-input h-10 bg-white" value={reportCashier} onChange={e => setReportCashier(e.target.value)}>
                           {cashiers.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                     </div>
                     <div className="flex-1 text-right self-center">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Report Total</p>
                        <p className="text-xl font-black text-slate-900">UGX {reportTotals.revenue.toLocaleString()}</p>
                        <p className="text-[10px] text-slate-500 font-bold">{reportTotals.count} Transactions</p>
                     </div>
                  </div>

                  {/* REPORT CONTENT AREA */}
                  <div className="flex-1 overflow-y-auto bg-slate-100 p-0 flex justify-center">

                     {reportViewMode === 'list' ? (
                        // === LIST VIEW (Standard Table) ===
                        <div id="sales-history-table" className="w-full bg-white h-full">
                           <table className="w-full text-left">
                              <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                                 <tr>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Receipt #</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cashier</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Customer</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Total</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right no-print">Action</th>
                                 </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                 {filteredHistory.map(sale => (
                                    <tr key={sale.id} className="hover:bg-slate-50 transition-colors">
                                       <td className="px-6 py-3 font-mono text-xs font-bold text-slate-600">{sale.receiptNo}</td>
                                       <td className="px-6 py-3 text-xs text-slate-500">
                                          {new Date(sale.timestamp).toLocaleDateString()}
                                          <div className="text-[9px] text-slate-400">{new Date(sale.timestamp).toLocaleTimeString()}</div>
                                       </td>
                                       <td className="px-6 py-3 text-xs font-medium text-slate-600">{sale.cashierName}</td>
                                       <td className="px-6 py-3 text-xs font-bold text-slate-900">{sale.customerName || 'Walk-in'}</td>
                                       <td className="px-6 py-3 text-xs font-bold text-slate-900 text-right">{sale.total.toLocaleString()}</td>
                                       <td className="px-6 py-3 text-right no-print">
                                          <button
                                             onClick={() => { setLastSale(sale); setIsReceiptOpen(true); }}
                                             className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-slate-900 hover:border-slate-400 transition-all"
                                             title="Reprint Receipt"
                                          >
                                             <Printer size={14} />
                                          </button>
                                          {user.role === UserRole.ADMIN && (
                                             <>
                                                <button onClick={() => { setSaleToEdit(JSON.parse(JSON.stringify(sale))); setIsEditModalOpen(true); }} className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-blue-600 hover:border-blue-400 transition-all ml-2" title="Edit Invoice">
                                                   <Edit size={14} />
                                                </button>
                                                <button onClick={() => setSaleToDelete(sale)} className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-red-600 hover:border-red-400 transition-all ml-2" title="Delete Invoice">
                                                   <Trash2 size={14} />
                                                </button>
                                             </>
                                          )}
                                       </td>
                                    </tr>
                                 ))}
                                 {filteredHistory.length === 0 && (
                                    <tr><td colSpan={6} className="py-12 text-center text-slate-400 font-medium">No sales records found for selected criteria.</td></tr>
                                 )}
                              </tbody>
                           </table>
                        </div>
                     ) : (
                        // === STATEMENT VIEW (A4 Printable) ===
                        <div id="sales-statement" className="receipt-a4-mode bg-white p-12 shadow-xl text-slate-900 w-full max-w-[210mm] min-h-[297mm] my-8">
                           {/* Report Header */}
                           <div className="flex justify-between items-start mb-8 border-b border-slate-900 pb-6">
                              <div>
                                 <h1 className="text-2xl font-black uppercase tracking-tight mb-2">Sales Report</h1>
                                 <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Period: {reportStartDate} to {reportEndDate}</p>
                                 <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">SNA Mobile ERP System</p>
                              </div>
                              <div className="text-right">
                                 <h2 className="text-lg font-bold text-slate-900 uppercase">{settings?.businessName || 'SNA SHOP'}</h2>
                                 <p className="text-xs text-slate-500">{settings?.address}</p>
                                 <p className="text-xs text-slate-500">Tel: {settings?.phone}</p>
                                 <p className="text-xs text-slate-500 mt-1">Generated: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}</p>
                              </div>
                           </div>

                           {/* Executive Summary Cards */}
                           <div className="grid grid-cols-3 gap-6 mb-10">
                              <div className="p-4 border border-slate-200 rounded-lg">
                                 <div className="flex items-center gap-2 mb-2 text-slate-400">
                                    <DollarSign size={14} />
                                    <p className="text-[10px] font-bold uppercase tracking-wider">Total Revenue</p>
                                 </div>
                                 <p className="text-2xl font-black text-slate-900">
                                    {reportTotals.revenue.toLocaleString()}
                                 </p>
                              </div>
                              <div className="p-4 border border-slate-200 rounded-lg bg-slate-50">
                                 <div className="flex items-center gap-2 mb-2 text-slate-400">
                                    <Receipt size={14} />
                                    <p className="text-[10px] font-bold uppercase tracking-wider">Transactions</p>
                                 </div>
                                 <p className="text-2xl font-black text-slate-900">
                                    {reportTotals.count}
                                 </p>
                              </div>
                              <div className="p-4 border border-slate-200 rounded-lg bg-slate-50">
                                 <div className="flex items-center gap-2 mb-2 text-slate-400">
                                    <TrendingUp size={14} />
                                    <p className="text-[10px] font-bold uppercase tracking-wider">Avg Ticket</p>
                                 </div>
                                 <p className="text-2xl font-black text-slate-900">
                                    {Math.round(reportTotals.avgTicket).toLocaleString()}
                                 </p>
                              </div>
                           </div>

                           {/* Transaction Table */}
                           <div className="mb-8">
                              <h3 className="text-xs font-black uppercase tracking-widest border-b border-slate-200 pb-2 mb-4 text-slate-500">Transaction Details</h3>
                              <table className="w-full text-left text-xs">
                                 <thead>
                                    <tr className="border-b border-slate-200">
                                       <th className="py-2 font-bold text-slate-500 uppercase">Date</th>
                                       <th className="py-2 font-bold text-slate-500 uppercase">Receipt #</th>
                                       <th className="py-2 font-bold text-slate-500 uppercase">Customer</th>
                                       <th className="py-2 font-bold text-slate-500 uppercase">Cashier</th>
                                       <th className="py-2 font-bold text-slate-500 uppercase text-right">Method</th>
                                       <th className="py-2 font-bold text-slate-500 uppercase text-right">Amount</th>
                                    </tr>
                                 </thead>
                                 <tbody className="divide-y divide-slate-100">
                                    {filteredHistory.map((sale, idx) => (
                                       <tr key={idx}>
                                          <td className="py-3 font-mono text-slate-600">{new Date(sale.timestamp).toLocaleDateString()}</td>
                                          <td className="py-3 font-bold text-slate-900">{sale.receiptNo}</td>
                                          <td className="py-3 text-slate-700">{sale.customerName || '-'}</td>
                                          <td className="py-3 text-slate-500">{sale.cashierName}</td>
                                          <td className="py-3 text-right text-slate-500">{sale.paymentMethod}</td>
                                          <td className="py-3 text-right font-bold text-slate-900">{sale.total.toLocaleString()}</td>
                                       </tr>
                                    ))}
                                 </tbody>
                                 <tfoot className="border-t-2 border-slate-200">
                                    <tr>
                                       <td colSpan={5} className="py-3 text-right font-black text-sm uppercase">Grand Total</td>
                                       <td className="py-3 text-right font-black text-sm">{reportTotals.revenue.toLocaleString()}</td>
                                    </tr>
                                 </tfoot>
                              </table>
                           </div>

                           {/* Footer / Signatures */}
                           <div className="mt-16 pt-8 border-t-2 border-slate-100">
                              <div className="flex justify-between gap-12">
                                 <div className="flex-1">
                                    <div className="h-12 border-b border-slate-900 border-dashed mb-2"></div>
                                    <p className="text-xs font-bold text-slate-900 uppercase">Prepared By</p>
                                 </div>
                                 <div className="flex-1">
                                    <div className="h-12 border-b border-slate-900 border-dashed mb-2"></div>
                                    <p className="text-xs font-bold text-slate-900 uppercase">Authorized Signature</p>
                                 </div>
                              </div>
                              <p className="text-[10px] text-center text-slate-400 mt-8">
                                 End of Report • {new Date().getFullYear()} © SNA Mobile Shop
                              </p>
                           </div>
                        </div>
                     )}
                  </div>
               </div>
            </div>
         )}

         {/* --- EDIT SALE MODAL --- */}
         {isEditModalOpen && saleToEdit && (
            <div className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in">
               <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-white/20 flex flex-col max-h-[90vh]">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                     <div>
                        <h2 className="text-lg font-bold text-slate-900">Edit Invoice</h2>
                        <p className="text-xs text-slate-500 font-mono">{saleToEdit.receiptNo}</p>
                     </div>
                     <button onClick={() => setIsEditModalOpen(false)}><X size={20} className="text-slate-400 hover:text-slate-900" /></button>
                  </div>
                  <form onSubmit={handleUpdateSale} className="flex-1 overflow-y-auto p-6 space-y-4">
                     <div className="space-y-4">
                        {saleToEdit.items.map((item, idx) => (
                           <div key={idx} className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                              <div className="flex-1">
                                 <p className="text-xs font-bold text-slate-900">{item.name}</p>
                              </div>
                              <div className="w-24">
                                 <label className="text-[9px] font-bold text-slate-400 uppercase">Qty</label>
                                 <input
                                    type="number"
                                    min="1"
                                    className="w-full h-8 px-2 rounded border border-slate-200 text-xs font-bold"
                                    value={item.quantity}
                                    onChange={e => updateEditItem(idx, 'quantity', Number(e.target.value))}
                                 />
                              </div>
                              <div className="w-32">
                                 <label className="text-[9px] font-bold text-slate-400 uppercase">Price</label>
                                 <input
                                    type="number"
                                    min="0"
                                    className="w-full h-8 px-2 rounded border border-slate-200 text-xs font-bold"
                                    value={item.price}
                                    onChange={e => updateEditItem(idx, 'price', Number(e.target.value))}
                                 />
                              </div>
                              <div className="w-24 text-right">
                                 <label className="text-[9px] font-bold text-slate-400 uppercase block">Total</label>
                                 <span className="text-xs font-black text-slate-900">{item.total.toLocaleString()}</span>
                              </div>
                           </div>
                        ))}
                     </div>
                     <div className="flex justify-end pt-4 border-t border-slate-100">
                        <div className="text-right">
                           <p className="text-xs font-bold text-slate-500 uppercase">New Total</p>
                           <p className="text-2xl font-black text-slate-900">UGX {saleToEdit.total.toLocaleString()}</p>
                        </div>
                     </div>
                     <div className="pt-2">
                        <button type="submit" disabled={isUpdating} className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold text-sm shadow-lg hover:bg-black transition-all flex items-center justify-center gap-2">
                           {isUpdating && <Loader2 className="animate-spin" size={14} />}
                           {isUpdating ? 'Updating...' : 'Save Changes & Update Stock'}
                        </button>
                     </div>
                  </form>
               </div>
            </div>
         )}

         {/* --- DELETE SALE CONFIRMATION --- */}
         {saleToDelete && (
            <div className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in">
               <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-8 text-center space-y-6 border border-white/20">
                  <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
                     <AlertTriangle size={40} strokeWidth={2} />
                  </div>
                  <div>
                     <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">Delete Invoice?</h3>
                     <p className="text-sm text-slate-500 font-medium mt-2 leading-relaxed">
                        This will permanently remove invoice <span className="text-slate-900 font-bold">{saleToDelete.receiptNo}</span> and <span className="text-emerald-600 font-bold">restore stock</span> for all items.
                     </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                     <button onClick={() => setSaleToDelete(null)} disabled={isDeleting} className="py-4 bg-slate-100 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
                     <button onClick={confirmDeleteSale} disabled={isDeleting} className="py-4 bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-red-600/20 hover:bg-red-700 transition-all flex items-center justify-center gap-2">
                        {isDeleting ? <Loader2 className="animate-spin" size={14} /> : null} {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* CONFIRMATION MODAL FOR CLEARING HISTORY */}
         {isClearHistoryConfirmOpen && (
            <div className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in">
               <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-8 text-center space-y-6 border border-white/20">
                  <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
                     <AlertTriangle size={40} strokeWidth={2} />
                  </div>
                  <div>
                     <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">System Warning</h3>
                     <p className="text-sm text-slate-500 font-medium mt-2 leading-relaxed">
                        You are about to permanently delete <span className="text-slate-900 font-bold">ALL Sales History</span>. This action cannot be undone and will reset revenue metrics.
                     </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                     <button onClick={() => setIsClearHistoryConfirmOpen(false)} className="py-4 bg-slate-100 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
                     <button onClick={performClearHistory} className="py-4 bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-red-600/20 hover:bg-red-700 transition-all">
                        {clearingHistory ? <Loader2 className="animate-spin inline mr-2" size={12} /> : null} Yes, Clear All
                     </button>
                  </div>
               </div>
            </div>
         )}

      </div>
   );
};

export default POS;
