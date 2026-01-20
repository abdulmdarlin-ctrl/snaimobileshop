
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../db';
import { Product, User, UserRole, ProductType, AppSettings } from '../types';
import {
   Plus, Search, Edit2, Trash2, X, Package,
   Filter, ChevronDown, Check, XCircle, AlertCircle,
   Barcode, Printer,
   Box, Smartphone, Headphones, Battery, DollarSign, TrendingDown,
   Loader2, ArrowRight, MapPin, Tag, RefreshCw, Layers, AlertTriangle, AlertOctagon, MoreHorizontal
} from 'lucide-react';
import { useToast } from './Toast';
import { printSection } from '../utils/printExport';

interface InventoryProps { user: User; }
import JsBarcode from 'jsbarcode';

const Inventory: React.FC<InventoryProps> = ({ user }) => {
   const [products, setProducts] = useState<Product[]>([]);
   const [loading, setLoading] = useState(true);
   const [searchTerm, setSearchTerm] = useState('');
   const [filterType, setFilterType] = useState<'All' | 'Low Stock' | 'Loss Making'>('All');
   const [settings, setSettings] = useState<AppSettings | null>(null);

   const { showToast } = useToast();
   const [isModalOpen, setIsModalOpen] = useState(false);
   const [editingProduct, setEditingProduct] = useState<Product | null>(null);
   const [isSaving, setIsSaving] = useState(false);

   // Stock Adjustment State
   const [isStockAdjustModalOpen, setIsStockAdjustModalOpen] = useState(false);
   const [stockAdjustProduct, setStockAdjustProduct] = useState<Product | null>(null);
   const [isStockConfirming, setIsStockConfirming] = useState(false);
   const [stockAdjustForm, setStockAdjustForm] = useState({
      newQuantity: 0,
      reason: 'Restock',
      note: ''
   });

   // Delete Confirmation State
   const [productToDelete, setProductToDelete] = useState<Product | null>(null);
   const [isDeleting, setIsDeleting] = useState(false);

   // Barcode Print State
   const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
   const [productForBarcode, setProductForBarcode] = useState<Product | null>(null);
   const [barcodeLabelCount, setBarcodeLabelCount] = useState(1);

   // RBAC Permissions
   const canEdit = [UserRole.ADMIN, UserRole.MANAGER].includes(user.role);
   const canDelete = user.role === UserRole.ADMIN;

   const initialForm: Partial<Product> = {
      name: '',
      sku: '',
      brand: '',
      type: ProductType.OTHERS,
      category: '',
      costPrice: 0,
      middleManPrice: 0,
      selling_price: 0,
      minSellingPrice: 0,
      stockQuantity: 0,
      reorderLevel: 5,
      location: '',
      warrantyPeriod: ''
   };

   const [formData, setFormData] = useState<Partial<Product>>(initialForm);

   useEffect(() => {
      fetchProducts();
      fetchSettings();
   }, []);

   const fetchProducts = async () => {
      setLoading(true);
      const data = await db.products.toArray();
      setProducts(data.sort((a, b) => a.name.localeCompare(b.name)));
      setLoading(false);
   };

   const fetchSettings = async () => {
      const s = await db.settings.toCollection().first();
      setSettings(s || null);
   };

   const handleSave = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSaving(true);
      try {
         if (!formData.name) throw new Error("Product Name Required");
         if (!formData.sku) throw new Error("SKU Required");

         // Auto-generate SKU if empty (though handled by validation above, good to have logic)
         if (!formData.sku) {
            formData.sku = `SKU-${Date.now()}`;
         }

         // Default category if missing (since field is hidden)
         const dataToSave = {
            ...formData,
            category: formData.category || 'General',
         };

         if (editingProduct?.id) {
            await db.products.update(editingProduct.id, dataToSave);
         } else {
            await db.products.add(dataToSave as Product);
         }

         setIsModalOpen(false);
         setEditingProduct(null);
         setFormData(initialForm);
         fetchProducts();
         showToast('Product saved successfully', 'success');
      } catch (err: any) {
         showToast(err.message, 'error');
      } finally {
         setIsSaving(false);
      }
   };

   const handleStockAdjustSave = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!stockAdjustProduct) return;

      const diff = stockAdjustForm.newQuantity - stockAdjustProduct.stockQuantity;
      if (diff === 0) return showToast("No change in quantity", 'info');

      if (!isStockConfirming) {
         setIsStockConfirming(true);
         return;
      }

      setIsSaving(true);
      try {
         await db.products.update(stockAdjustProduct.id!, { stockQuantity: stockAdjustForm.newQuantity });
         await db.stockLogs.add({
            productId: stockAdjustProduct.id!,
            productName: stockAdjustProduct.name,
            previousStock: stockAdjustProduct.stockQuantity,
            newStock: stockAdjustForm.newQuantity,
            changeAmount: diff,
            reason: stockAdjustForm.reason,
            note: stockAdjustForm.note,
            user: user.username,
            timestamp: Date.now()
         });

         setIsStockAdjustModalOpen(false);
         setStockAdjustProduct(null);
         fetchProducts();
         showToast('Stock adjusted successfully', 'success');
      } catch (e) {
         console.error(e);
         showToast("Failed to update stock", 'error');
      } finally {
         setIsSaving(false);
         setIsStockConfirming(false);
      }
   };

   const confirmDeleteProduct = async () => {
      if (!productToDelete?.id) return;
      setIsDeleting(true);
      try {
         await db.products.delete(productToDelete.id);
         fetchProducts();
         setProductToDelete(null);
         showToast('Product deleted successfully', 'success');
      } catch (e) {
         console.error(e);
         showToast("Failed to delete product.", 'error');
      } finally {
         setIsDeleting(false);
      }
   };

   const openModal = (product?: Product) => {
      if (product) {
         setEditingProduct(product);
         setFormData(product);
      } else {
         setEditingProduct(null);
         setFormData({
            ...initialForm,
            reorderLevel: settings?.globalLowStockThreshold || 5,
            brand: '',
            sku: `SKU-${Math.floor(Math.random() * 100000)}` // Auto-gen suggestion
         });
      }
      setIsModalOpen(true);
   };

   const openStockAdjust = (product: Product) => {
      setStockAdjustProduct(product);
      setStockAdjustForm({
         newQuantity: product.stockQuantity,
         reason: 'Restock',
         note: ''
      });
      setIsStockConfirming(false);
      setIsStockAdjustModalOpen(true);
   };

   const openBarcodeModal = (product: Product) => {
      setProductForBarcode(product);
      setBarcodeLabelCount(product.stockQuantity > 0 ? product.stockQuantity : 1);
      setIsBarcodeModalOpen(true);
   };

   const handlePrintBarcodes = () => {
      if (!productForBarcode) return;
      // Use a timeout to ensure the DOM is updated with all SVGs before printing
      setTimeout(() => {
         printSection('#barcode-print-area', () => { });
      }, 100);
   };


   const lowStockCount = useMemo(() =>
      products.filter(p => p.stockQuantity <= p.reorderLevel).length
      , [products]);

   const lossMakingCount = useMemo(() =>
      products.filter(p => p.selling_price < p.costPrice).length
      , [products]);

   const inventoryStats = useMemo(() => {
      const totalSKUs = products.length;
      const totalUnits = products.reduce((sum, p) => sum + p.stockQuantity, 0);
      const totalValue = products.reduce((sum, p) => sum + (p.stockQuantity * (p.costPrice || 0)), 0);

      return {
         totalSKUs,
         totalUnits,
         totalValue,
         lowStockItems: lowStockCount,
         lossMakingItems: lossMakingCount,
      };
   }, [products, lowStockCount, lossMakingCount]);

   const filteredProducts = useMemo(() => {
      return products.filter(p => {
         const matchesSearch =
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.sku.toLowerCase().includes(searchTerm.toLowerCase());

         let matchesType = true;
         if (filterType === 'Low Stock') {
            matchesType = p.stockQuantity <= p.reorderLevel;
         } else if (filterType === 'Loss Making') {
            matchesType = p.selling_price < p.costPrice;
         }

         return matchesSearch && matchesType;
      }).sort((a, b) => {
         // When filtering for Low Stock, prioritize the lowest stock items first
         if (filterType === 'Low Stock') {
            return a.stockQuantity - b.stockQuantity;
         }
         // When filtering for Loss Making, prioritize the biggest loss
         if (filterType === 'Loss Making') {
            return (a.selling_price - a.costPrice) - (b.selling_price - b.costPrice);
         }
         return a.name.localeCompare(b.name);
      });
   }, [products, searchTerm, filterType]);

   const getProductIcon = (type: ProductType) => {
      switch (type) {
         case ProductType.PHONE: return <Smartphone size={20} />;
         case ProductType.ACCESSORY: return <Headphones size={20} />;
         case ProductType.SPARE_PART: return <Battery size={20} />;
         default: return <Box size={20} />;
      }
   };

   return (
      <div className="h-full flex flex-col font-sans pb-6">
         {/* Header */}
         <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
               <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Inventory Management</h1>
               <p className="text-sm text-slate-500 mt-1">Manage stock, pricing, and assets.</p>
            </div>
            <div className="flex gap-3">
               {canEdit && (
                  <button
                     onClick={() => openModal()}
                     className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-rose-600/20 hover:bg-rose-700 transition-all active:scale-95"
                  >
                     <Plus size={18} strokeWidth={2.5} /> Add Product
                  </button>
               )}
            </div>
         </div>

         {/* Summary Cards */}
         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
               <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><Package size={20} /></div>
                  <div>
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total SKUs</p>
                     <p className="text-2xl font-black text-slate-900">{inventoryStats.totalSKUs}</p>
                  </div>
               </div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
               <div className="flex items-center gap-4">
                  <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><Layers size={20} /></div>
                  <div>
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Units</p>
                     <p className="text-2xl font-black text-slate-900">{inventoryStats.totalUnits.toLocaleString()}</p>
                  </div>
               </div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
               <div className="flex items-center gap-4">
                  <div className="p-3 bg-violet-50 text-violet-600 rounded-xl"><DollarSign size={20} /></div>
                  <div>
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Inventory Value</p>
                     <p className="text-2xl font-black text-slate-900">
                        <span className="text-sm text-slate-400 mr-1 font-bold">UGX</span>
                        {inventoryStats.totalValue > 1000000 ? `${(inventoryStats.totalValue / 1000000).toFixed(1)}M` : `${(inventoryStats.totalValue / 1000).toFixed(0)}k`}
                     </p>
                  </div>
               </div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
               <div className="flex items-center gap-4">
                  <div className="p-3 bg-orange-50 text-orange-600 rounded-xl"><AlertTriangle size={20} /></div>
                  <div>
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Low Stock</p>
                     <p className="text-2xl font-black text-slate-900">{inventoryStats.lowStockItems}</p>
                  </div>
               </div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
               <div className="flex items-center gap-4">
                  <div className="p-3 bg-red-50 text-red-600 rounded-xl"><TrendingDown size={20} /></div>
                  <div>
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Loss-Making</p>
                     <p className="text-2xl font-black text-slate-900">{inventoryStats.lossMakingItems}</p>
                  </div>
               </div>
            </div>
         </div>

         {/* Stats & Filter Bar */}
         <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
            <div className="flex p-1 bg-slate-100 rounded-xl">
               {['All', 'Low Stock', 'Loss Making'].map(t => (
                  <button
                     key={t}
                     onClick={() => setFilterType(t as any)}
                     className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${filterType === t
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                        } ${(t === 'Low Stock' && lowStockCount > 0) || (t === 'Loss Making' && lossMakingCount > 0) ? 'pr-2' : ''}`}
                  >
                     {t}
                     {t === 'Low Stock' && lowStockCount > 0 && (
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] ${filterType === t ? 'bg-orange-100 text-orange-600' : 'bg-orange-500 text-white'
                           }`}>
                           {lowStockCount}
                        </span>
                     )}
                     {t === 'Loss Making' && lossMakingCount > 0 && (
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] ${filterType === t ? 'bg-red-100 text-red-600' : 'bg-red-500 text-white'
                           }`}>
                           {lossMakingCount}
                        </span>
                     )}
                  </button>
               ))}
            </div>
            <div className="relative w-full md:w-72">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
               <input
                  className="w-full h-11 bg-white border border-slate-200 rounded-xl pl-10 pr-4 text-sm font-medium outline-none focus:ring-2 focus:ring-rose-500/20"
                  placeholder="Search products by name or SKU..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
               />
            </div>
         </div>

         {/* Product Table */}
         <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            {loading ? (
               <div className="h-40 flex items-center justify-center"><Loader2 className="animate-spin text-slate-300" /></div>
            ) : filteredProducts.length === 0 ? (
               <div className="h-60 flex flex-col items-center justify-center text-slate-300">
                  <Package size={48} className="mb-4 opacity-50" />
                  <p className="text-sm font-bold">No products found</p>
               </div>
            ) : (
               <div className="flex-1 overflow-auto">
                  <table className="w-full text-left border-collapse">
                     <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm shadow-slate-100">
                        <tr>
                           <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Product</th>
                           <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">Stock</th>
                           <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Price (Retail)</th>
                           <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Location</th>
                           <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100">
                        {filteredProducts.map(product => {
                           const isLowStock = product.stockQuantity <= product.reorderLevel;
                           const isCritical = product.stockQuantity === 0;

                           return (
                              <tr
                                 key={product.id}
                                 className={`group transition-colors ${isCritical ? 'bg-red-50/30 hover:bg-red-50/50' :
                                    isLowStock ? 'bg-orange-50/20 hover:bg-orange-50/40' :
                                       'hover:bg-slate-50'
                                    }`}
                              >
                                 {/* Product Info */}
                                 <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                       <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-slate-100 text-slate-500">
                                          {getProductIcon(product.type)}
                                       </div>
                                       <div>
                                          <p className="text-sm font-bold text-slate-900 truncate max-w-[200px]">{product.name}</p>
                                          <p className="text-[10px] text-slate-400">
                                             {product.brand && <span className="font-bold uppercase">{product.brand}</span>}
                                             <span className="font-mono">{product.brand && ' • '}{product.sku}</span>
                                             {product.warrantyPeriod && (
                                                <span className="font-bold text-slate-500"> • {product.warrantyPeriod}</span>
                                             )}
                                          </p>
                                       </div>
                                    </div>
                                 </td>

                                 {/* Stock */}
                                 <td className="px-6 py-4 text-center">
                                    <div className="flex justify-center">
                                       <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide flex items-center gap-1.5 ${isCritical ? 'bg-red-100 text-red-600' :
                                          isLowStock ? 'bg-orange-100 text-orange-600' :
                                             'bg-emerald-100 text-emerald-600'
                                          }`}>
                                          {isCritical && <AlertOctagon size={12} />}
                                          {isLowStock && !isCritical && <AlertTriangle size={12} />}
                                          {product.stockQuantity}
                                       </span>
                                    </div>
                                 </td>

                                 {/* Price */}
                                 <td className="px-6 py-4 text-right">
                                    <p className={`text-sm font-bold ${product.selling_price < product.costPrice ? 'text-red-500' : 'text-slate-900'}`}>{product.selling_price.toLocaleString()}</p>
                                    <p className={`text-[10px] ${product.selling_price < product.costPrice ? 'text-red-400' : 'text-slate-400'}`}>Cost: {product.costPrice.toLocaleString()}</p>
                                 </td>

                                 {/* Location */}
                                 <td className="px-6 py-4">
                                    {product.location ? (
                                       <span className="flex items-center gap-1 text-xs text-slate-500">
                                          <MapPin size={12} className="text-slate-400" /> {product.location}
                                       </span>
                                    ) : (
                                       <span className="text-[10px] text-slate-300 italic">--</span>
                                    )}
                                 </td>

                                 {/* Actions */}
                                 <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                       {canEdit && (
                                          <>
                                             <button
                                                onClick={() => openStockAdjust(product)}
                                                className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                                title="Adjust Stock"
                                             >
                                                <RefreshCw size={16} />
                                             </button>
                                             <button
                                                onClick={() => openModal(product)}
                                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                title="Edit"
                                             >
                                                <Edit2 size={16} />
                                             </button>
                                             <button
                                                onClick={() => openBarcodeModal(product)}
                                                className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                                title="Print Barcodes"
                                             >
                                                <Barcode size={16} />
                                             </button>
                                          </>
                                       )}
                                       {canDelete && (
                                          <button
                                             onClick={() => setProductToDelete(product)}
                                             className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                             title="Delete"
                                          >
                                             <Trash2 size={16} />
                                          </button>
                                       )}
                                    </div>
                                 </td>
                              </tr>
                           );
                        })}
                     </tbody>
                  </table>
               </div>
            )}
         </div>

         {/* Product Edit/Add Modal */}
         {isModalOpen && (
            <div className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in">
               <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-white/20 flex flex-col max-h-[90vh]">
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
                     <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center text-rose-600">
                           <Package size={20} />
                        </div>
                        <div>
                           <h2 className="text-lg font-bold text-slate-900">{editingProduct ? 'Edit Product' : 'New Product'}</h2>
                           <p className="text-xs text-slate-500 font-bold uppercase tracking-wide mt-0.5">Inventory Control</p>
                        </div>
                     </div>
                     <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-all"><X size={20} /></button>
                  </div>

                  <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-8 space-y-6">
                     {/* Basic Info */}
                     <div className="space-y-4">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Basic Information</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <div className="space-y-1.5">
                              <label className="win-label">Product Name</label>
                              <input required className="win-input h-10 font-bold" placeholder="e.g. iPhone 13" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                           </div>
                           <div className="space-y-1.5">
                              <label className="win-label">SKU / Barcode</label>
                              <input required className="win-input h-10 font-mono" placeholder="SKU-..." value={formData.sku} onChange={e => setFormData({ ...formData, sku: e.target.value })} />
                           </div>
                           <div className="space-y-1.5">
                              <label className="win-label">Brand (Optional)</label>
                              <input className="win-input h-10" placeholder="e.g. Apple, Samsung" value={formData.brand || ''} onChange={e => setFormData({ ...formData, brand: e.target.value })} />
                           </div>
                           <div className="space-y-1.5">
                              <label className="win-label">Type</label>
                              <div className="relative">
                                 <select className="win-input h-10 appearance-none font-bold" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value as ProductType })}>
                                    {Object.values(ProductType).map(t => <option key={t} value={t}>{t}</option>)}
                                 </select>
                                 <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                              </div>
                           </div>
                           <div className="space-y-1.5 md:col-span-2">
                              <label className="win-label">Warranty Period (Optional)</label>
                              <input className="win-input h-10" placeholder="e.g. 1 Year, 6 Months" value={formData.warrantyPeriod || ''} onChange={e => setFormData({ ...formData, warrantyPeriod: e.target.value })} />
                           </div>
                        </div>
                     </div>

                     {/* Section 2: Financials & Categorization */}
                     <div className="space-y-4">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Pricing & Categorization</h3>

                        <div className="grid grid-cols-3 gap-6">
                           <div>
                              <label className="block text-xs font-bold text-slate-600 mb-1.5">Cost Price</label>
                              <input type="number" min="0" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none transition-all"
                                 value={formData.costPrice} onChange={e => setFormData({ ...formData, costPrice: Number(e.target.value) })} />
                           </div>
                           <div>
                              <label className="block text-xs font-bold text-blue-600 mb-1.5">Middle Man Price</label>
                              <input type="number" min="0" placeholder="Negotiable Price" className="w-full p-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-sm font-bold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                 value={formData.middleManPrice || ''} onChange={e => setFormData({ ...formData, middleManPrice: Number(e.target.value) })} />
                           </div>
                           <div>
                              <label className="block text-xs font-bold text-emerald-600 mb-1.5">Retail Price</label>
                              <input type="number" min="0" required placeholder="Preferred" className="w-full p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm font-bold focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                                 value={formData.selling_price} onChange={e => setFormData({ ...formData, selling_price: Number(e.target.value) })} />
                              <div className="mt-2">
                                 <label className="block text-[10px] font-bold text-emerald-400 mb-1">Min Retail</label>
                                 <input type="number" min="0" className="w-full p-2 bg-white border border-emerald-100 text-emerald-600 rounded-md text-xs font-bold outline-none"
                                    value={formData.minSellingPrice || ''} onChange={e => setFormData({ ...formData, minSellingPrice: Number(e.target.value) })} />
                              </div>
                           </div>
                        </div>
                     </div>

                     {/* Stock Level */}
                     <div className="space-y-4">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Inventory Control</h3>
                        <div className="grid grid-cols-3 gap-4">
                           <div className="space-y-1.5">
                              <label className="win-label">Current Stock</label>
                              <input type="number" className="win-input h-10 font-bold" value={formData.stockQuantity} onChange={e => setFormData({ ...formData, stockQuantity: Number(e.target.value) })} />
                           </div>
                           <div className="space-y-1.5">
                              <label className="win-label">Reorder Level</label>
                              <input type="number" className="win-input h-10" value={formData.reorderLevel} onChange={e => setFormData({ ...formData, reorderLevel: Number(e.target.value) })} />
                           </div>
                           <div className="space-y-1.5">
                              <label className="win-label">Location / Bin</label>
                              <input className="win-input h-10" placeholder="e.g. A-12" value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} />
                           </div>
                        </div>
                     </div>

                  </form>

                  <div className="p-5 border-t border-slate-100 bg-slate-50 flex gap-3 justify-end shrink-0">
                     <button onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold uppercase tracking-wide hover:bg-slate-100 transition-all">Cancel</button>
                     <button onClick={handleSave} disabled={isSaving} className="px-6 py-2.5 bg-rose-600 text-white rounded-lg text-xs font-bold uppercase tracking-wide shadow-lg hover:bg-rose-700 transition-all flex items-center gap-2">
                        {isSaving ? <Loader2 className="animate-spin" size={14} /> : (editingProduct ? 'Update Product' : 'Add Product')}
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* Stock Adjust Modal */}
         {isStockAdjustModalOpen && stockAdjustProduct && (() => {
            const diff = stockAdjustForm.newQuantity - stockAdjustProduct.stockQuantity;
            const diffText = `${diff > 0 ? '+' : ''}${diff}`;
            const diffColorClass = diff > 0
               ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
               : diff < 0
                  ? 'bg-red-50 text-red-600 border-red-100'
                  : 'bg-slate-50 text-slate-400 border-slate-100';
            const diffTextColorClass = diff > 0 ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold';

            return (
               <div className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in">
                  <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-white/20">
                     <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                        <h2 className="text-lg font-bold text-slate-900">{isStockConfirming ? 'Confirm Adjustment' : 'Adjust Stock Level'}</h2>
                        <button onClick={() => setIsStockAdjustModalOpen(false)}><X size={20} className="text-slate-400 hover:text-slate-900" /></button>
                     </div>
                     <form onSubmit={handleStockAdjustSave} className="p-6 space-y-4">
                        {!isStockConfirming ? (
                           <>
                              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-4">
                                 <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Product</p>
                                 <p className="font-bold text-slate-900 text-sm">{stockAdjustProduct.name}</p>
                                 <p className="text-xs text-slate-400 font-mono mt-0.5">{stockAdjustProduct.sku}</p>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                 <div>
                                    <label className="win-label">Current Stock</label>
                                    <input disabled className="win-input h-10 bg-slate-50 text-slate-500 font-bold" value={stockAdjustProduct.stockQuantity} />
                                 </div>
                                 <div>
                                    <label className="win-label">New Quantity</label>
                                    <input
                                       type="number"
                                       className="win-input h-10 font-bold"
                                       value={stockAdjustForm.newQuantity}
                                       onChange={e => setStockAdjustForm({ ...stockAdjustForm, newQuantity: Number(e.target.value) })}
                                       autoFocus
                                    />
                                 </div>
                              </div>

                              {/* Difference Display */}
                              <div className="flex justify-end">
                                 <span className={`text-xs font-bold px-2 py-1 rounded border ${diffColorClass}`}>
                                    Change: {diffText} Units
                                 </span>
                              </div>

                              <div>
                                 <label className="win-label">Reason Code</label>
                                 <div className="relative">
                                    <select
                                       className="win-input h-10 appearance-none"
                                       value={stockAdjustForm.reason}
                                       onChange={e => setStockAdjustForm({ ...stockAdjustForm, reason: e.target.value })}
                                    >
                                       <option value="Restock">Restock / Purchase</option>
                                       <option value="Correction">Inventory Correction</option>
                                       <option value="Damage">Damaged / Expired</option>
                                       <option value="Loss">Loss / Theft</option>
                                       <option value="Return">Customer Return</option>
                                       <option value="Other">Other</option>
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                                 </div>
                              </div>

                              <div>
                                 <label className="win-label">Notes (Optional)</label>
                                 <textarea
                                    className="win-input p-3 h-20 resize-none"
                                    value={stockAdjustForm.note}
                                    onChange={e => setStockAdjustForm({ ...stockAdjustForm, note: e.target.value })}
                                    placeholder="Additional details..."
                                 />
                              </div>

                              <button
                                 disabled={isSaving || diff === 0}
                                 className="w-full py-3 bg-slate-900 text-white rounded-lg font-bold text-sm shadow-lg hover:bg-black transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:shadow-none"
                              >
                                 <RefreshCw size={16} /> Review Adjustment
                              </button>
                           </>
                        ) : (
                           <div className="space-y-6 animate-in fade-in">
                              <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 flex gap-3">
                                 <AlertCircle className="text-orange-600 shrink-0" size={20} />
                                 <div>
                                    <p className="text-sm font-bold text-orange-800">Confirm Stock Change</p>
                                    <p className="text-xs text-orange-600 mt-1">This action will modify inventory records and log an audit trail.</p>
                                 </div>
                              </div>

                              <div className="flex items-center justify-between px-4">
                                 <div className="text-center">
                                    <p className="text-xs font-bold text-slate-400 uppercase">Old Qty</p>
                                    <p className="text-2xl font-black text-slate-900">{stockAdjustProduct.stockQuantity}</p>
                                 </div>
                                 <ArrowRight className="text-slate-300" size={24} />
                                 <div className="text-center">
                                    <p className="text-xs font-bold text-slate-400 uppercase">New Qty</p>
                                    <p className="text-2xl font-black text-slate-900">{stockAdjustForm.newQuantity}</p>
                                 </div>
                              </div>

                              <div className="bg-slate-50 rounded-xl p-4 space-y-2 border border-slate-100">
                                 <div className="flex justify-between text-xs">
                                    <span className="text-slate-500 font-bold">Difference</span>
                                    <span className={diffTextColorClass}>
                                       {diffText}
                                    </span>
                                 </div>
                                 <div className="flex justify-between text-xs">
                                    <span className="text-slate-500 font-bold">Reason</span>
                                    <span className="text-slate-900 font-bold">{stockAdjustForm.reason}</span>
                                 </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3 pt-2">
                                 <button
                                    type="button"
                                    onClick={() => setIsStockConfirming(false)}
                                    className="w-full py-3 bg-white border border-slate-200 text-slate-600 rounded-lg font-bold text-sm hover:bg-slate-50 transition-all"
                                 >
                                    Back
                                 </button>
                                 <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="w-full py-3 bg-slate-900 text-white rounded-lg font-bold text-sm shadow-lg hover:bg-black transition-all flex items-center justify-center gap-2"
                                 >
                                    {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                                    Confirm Save
                                 </button>
                              </div>
                           </div>
                        )}
                     </form>
                  </div>
               </div>
            )
         })()}

         {/* DELETE CONFIRMATION MODAL */}
         {productToDelete && (
            <div className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in">
               <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-8 text-center space-y-6 border border-white/20">
                  <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
                     <AlertTriangle size={40} strokeWidth={2} />
                  </div>
                  <div>
                     <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">Confirm Deletion</h3>
                     <p className="text-sm text-slate-500 font-medium mt-2 leading-relaxed">
                        Are you sure you want to permanently delete the product <span className="text-slate-900 font-bold">"{productToDelete.name}"</span>?
                     </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                     <button onClick={() => setProductToDelete(null)} disabled={isDeleting} className="py-4 bg-slate-100 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
                     <button onClick={confirmDeleteProduct} disabled={isDeleting} className="py-4 bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-red-600/20 hover:bg-red-700 transition-all flex items-center justify-center gap-2">
                        {isDeleting ? <Loader2 className="animate-spin" size={14} /> : null} {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* --- BARCODE PRINT MODAL --- */}
         {isBarcodeModalOpen && productForBarcode && (
            <div className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in">
               <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-white/20 flex flex-col max-h-[90vh]">
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
                     <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600">
                           <Barcode size={20} />
                        </div>
                        <div>
                           <h2 className="text-lg font-bold text-slate-900">Print Barcode Labels</h2>
                           <p className="text-xs text-slate-500 font-bold uppercase tracking-wide mt-0.5">{productForBarcode.name}</p>
                        </div>
                     </div>
                     <button onClick={() => setIsBarcodeModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-all"><X size={20} /></button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                     <div className="space-y-1.5">
                        <label className="win-label">Number of Labels</label>
                        <input
                           type="number"
                           min="1"
                           max="100" // Limit to prevent excessive rendering
                           className="win-input h-10 w-32"
                           value={barcodeLabelCount}
                           onChange={e => setBarcodeLabelCount(Number(e.target.value))}
                        />
                     </div>

                     <div id="barcode-print-area" className="grid grid-cols-2 gap-4 p-4 border border-dashed border-slate-200 rounded-xl bg-slate-50 print:grid-cols-3 print:gap-2 print:p-2">
                        {Array.from({ length: barcodeLabelCount || 1 }).map((_, index) => (
                           <div key={index} className="bg-white p-2 rounded-lg shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center print:shadow-none print:border-none print:p-1 space-y-1">
                              {settings?.businessName && <p className="text-[8px] font-black text-slate-800 uppercase leading-tight print:text-[6px]">{settings.businessName}</p>}
                              <div className="text-center">
                                 {productForBarcode.brand && (
                                    <p className="text-[7px] font-bold text-slate-500 uppercase leading-tight print:text-[5px]">{productForBarcode.brand}</p>
                                 )}
                                 <p className="text-sm font-bold text-slate-800 uppercase leading-tight print:text-[7px]">{productForBarcode.name}</p>
                              </div>

                              {/* SKU Barcode */}
                              <svg id={`barcode-sku-${productForBarcode.sku}-${index}`} className="w-full h-auto max-h-[35px]"></svg>
                              <p className="text-xs font-mono text-slate-800 -mt-1 print:text-[7px]">{productForBarcode.sku}</p>

                              {/* Price Barcode */}
                              <svg id={`barcode-price-${productForBarcode.sku}-${index}`} className="w-full h-auto max-h-[20px]"></svg>
                              <p className="text-lg font-extrabold text-slate-800 -mt-1 print:text-[9px]">UGX {productForBarcode.selling_price.toLocaleString()}</p>

                              <div className="pt-1 border-t border-slate-100 w-full text-[7px] text-slate-500 print:text-[5px]">
                                 {productForBarcode.warrantyPeriod && (
                                    <span className="font-medium">Warranty: {productForBarcode.warrantyPeriod}</span>
                                 )}
                                 <span className="mx-1">{productForBarcode.warrantyPeriod && '•'}</span>
                                 <span>{new Date().toLocaleDateString()}</span>
                              </div>
                           </div>
                        ))}
                     </div>
                  </div>

                  <div className="p-5 border-t border-slate-100 bg-slate-50 flex gap-3 justify-end shrink-0 no-print">
                     <button onClick={() => setIsBarcodeModalOpen(false)} className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold uppercase tracking-wide hover:bg-slate-100 transition-all">Cancel</button>
                     <button onClick={handlePrintBarcodes} className="px-6 py-2.5 bg-purple-600 text-white rounded-lg text-xs font-bold uppercase tracking-wide shadow-lg hover:bg-purple-700 transition-all flex items-center gap-2">
                        <Printer size={14} /> Print Labels
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* Barcode Generation Effect */}
         {isBarcodeModalOpen && productForBarcode && (
            <style>{`
               @media print {
                  body > #root > div { display: none; }
                  #barcode-print-area {
                     display: grid !important;
                     grid-template-columns: repeat(3, 1fr) !important;
                     gap: 8px !important;
                     padding: 8px !important;
                     width: 100% !important;
                     height: auto !important;
                     position: absolute !important;
                     top: 0 !important;
                     left: 0 !important;
                     background: white !important;
                  }
               }
            `}</style>
         )}
      </div>
   );
};

export default Inventory;
