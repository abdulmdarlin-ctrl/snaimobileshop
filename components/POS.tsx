
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../db';
import { Product, Sale, SaleItem, User, AppSettings, ProductType, UserRole } from '../types';
import {
   Search, ShoppingCart, Trash2, Plus, Minus, CreditCard,
   Printer, History, RotateCcw, X, Check, Calculator, ChevronDown, ChevronUp, Users as UsersIcon,
   User as UserIcon, AlertCircle, Package, Receipt, Edit,
   ChevronRight, Smartphone, Headphones, Battery, Box, Filter, TrendingUp as TrendingUpIcon,
   Loader2, AlertTriangle, ScanBarcode, Download, FileText, Calendar,
   Eraser, Store, LayoutGrid, List as ListIcon, TrendingUp, DollarSign, UserPlus, MapPin, Mail, Phone
} from 'lucide-react';
import { printSection, exportSectionToPDF } from '../utils/printExport';
import { useToast } from './Toast';

const calculateWarrantyEndDate = (warrantyString: string): Date | null => {
   const now = new Date();
   const parts = warrantyString.toLowerCase().split(' ');
   if (parts.length < 2) return null;

   const value = parseInt(parts[0]);
   const unit = parts[1];

   if (isNaN(value)) return null;

   if (unit.startsWith('year')) {
      now.setFullYear(now.getFullYear() + value);
      return now;
   }
   if (unit.startsWith('month')) {
      now.setMonth(now.getMonth() + value);
      return now;
   }
   if (unit.startsWith('day')) {
      now.setDate(now.getDate() + value);
      return now;
   }

   return null;
};

interface POSProps {
   user: User;
}

const POS: React.FC<POSProps> = ({ user }) => {
   const { showToast } = useToast();
   const [products, setProducts] = useState<Product[]>([]);
   const [customers, setCustomers] = useState<any[]>([]);
   const [salesHistory, setSalesHistory] = useState<Sale[]>([]);
   const [cart, setCart] = useState<SaleItem[]>([]);
   const [loading, setLoading] = useState(true);
   const [pricingMode, setPricingMode] = useState<'Retail' | 'Wholesale' | 'Middle Man'>('Retail');
   const [searchTerm, setSearchTerm] = useState('');
   const [settings, setSettings] = useState<AppSettings | null>(null);
   const [clearingHistory, setClearingHistory] = useState(false);

   // Report Filters
   const [reportStartDate, setReportStartDate] = useState(() => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
   });
   const [reportEndDate, setReportEndDate] = useState(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
   });
   const [reportCategory, setReportCategory] = useState('All');
   const [reportCashier, setReportCashier] = useState('All');
   const [reportType, setReportType] = useState<'All' | 'Retail' | 'Wholesale'>('All');
   const [reportPaymentMethod, setReportPaymentMethod] = useState('All');

   // Modals
   const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
   const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
   const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
   const [isReceiptOpen, setIsReceiptOpen] = useState(false);
   const [processingPayment, setProcessingPayment] = useState(false);
   const [printConfig, setPrintConfig] = useState({ showLogo: true });

   // Admin Actions State
   const [saleToEdit, setSaleToEdit] = useState<Sale | null>(null);
   const [isEditModalOpen, setIsEditModalOpen] = useState(false);
   const [saleToDelete, setSaleToDelete] = useState<Sale | null>(null);
   const [isDeleting, setIsDeleting] = useState(false);
   const [isUpdating, setIsUpdating] = useState(false);

   // Cart Item Edit State
   const [editingCartItem, setEditingCartItem] = useState<{ index: number, item: SaleItem, product: Product } | null>(null);
   const statementPageRefs = useRef<(HTMLDivElement | null)[]>([]);

   // Sales History UI State
   const [historyPage, setHistoryPage] = useState(1);
   const HISTORY_ITEMS_PER_PAGE = 20;
   const [statementCurrentPage, setStatementCurrentPage] = useState(1);
   const [isPrintingStatement, setIsPrintingStatement] = useState(false);
   const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
   const [editItemForm, setEditItemForm] = useState({
      price: 0,
      quantity: 1
   });

   // Checkout State
   const [checkoutForm, setCheckoutForm] = useState({
      amountPaid: 0,
      paymentMethod: 'Cash' as const,
      customerName: '',
      customerPhone: '',
   });
   const [hasManuallyAdjustedPayment, setHasManuallyAdjustedPayment] = useState(false);

   // Customer Search State in POS
   const [customerSearch, setCustomerSearch] = useState('');
   const [showCustomerResults, setShowCustomerResults] = useState(false);
   const [newCustomerForm, setNewCustomerForm] = useState({ name: '', phone: '', email: '', address: '' });
   const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);

   const [lastSale, setLastSale] = useState<Sale | null>(null);
   const searchInputRef = useRef<HTMLInputElement>(null);

   useEffect(() => {
      fetchData();
   }, []);

   const fetchData = async () => {
      setLoading(true);
      const [p, s, sets, cust] = await Promise.all([
         db.products.toArray(),
         db.sales.toArray(),
         db.settings.toCollection().first(),
         db.customers.toArray()
      ]);
      setProducts(p);
      setCustomers(cust);
      setSalesHistory(s.sort((a, b) => b.timestamp - a.timestamp));
      setSettings(sets || null);
      setLoading(false);
   };

   useEffect(() => {
      if (isReceiptOpen && settings) {
         setPrintConfig({
            showLogo: settings.receiptShowLogo ?? true
         });
      }
   }, [isReceiptOpen, settings]);

   // Effect to handle printing the full statement from a paginated view
   useEffect(() => {
      if (isPrintingStatement) {
         printSection('#sales-statement', () => {
            setIsPrintingStatement(false); // Reset state after print dialog closes
         });
      }
   }, [isPrintingStatement]);

   // Effect to scroll to the top of the relevant page in the statement modal
   useEffect(() => {
      if (isStatementModalOpen) {
         // A small timeout ensures the DOM has updated (e.g., 'hidden' class removed) before scrolling
         setTimeout(() => {
            const pageElement = statementPageRefs.current[statementCurrentPage - 1];
            pageElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
         }, 50);
      }
   }, [statementCurrentPage, isStatementModalOpen]);

   const calculatePrice = (product: Product, mode: typeof pricingMode) => {
      switch (mode) {
         case 'Wholesale':
            return product.costPrice;
         case 'Middle Man':
            // Use middleManPrice if available, otherwise fallback to retail price
            return product.middleManPrice || product.selling_price;
         case 'Retail':
         default:
            return product.selling_price;
      }
   };

   // --- PRICING MODE EFFECT ---
   useEffect(() => {
      if (cart.length === 0) return;

      const newCart = cart.map(item => {
         const product = products.find(p => p.id === item.productId);
         if (product) {
            const newPrice = calculatePrice(product, pricingMode);
            return {
               ...item,
               price: newPrice,
               total: newPrice * item.quantity,
               originalPrice: newPrice // Reset negotiation on mode switch
            };
         }
         return item;
      });
      setCart(newCart);
   }, [pricingMode]);

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
         // Robust local date parsing to avoid timezone offsets shifting the day
         const parseTime = (dateStr: string, isEnd: boolean) => {
            if (!dateStr) return isEnd ? 8640000000000000 : 0;
            const [y, m, d] = dateStr.split('-').map(Number);
            return new Date(y, m - 1, d, isEnd ? 23 : 0, isEnd ? 59 : 0, isEnd ? 59 : 0).getTime();
         };

         const start = parseTime(reportStartDate, false);
         const end = parseTime(reportEndDate, true);

         const matchesDate = s.timestamp >= start && s.timestamp <= end;
         const matchesCashier = reportCashier === 'All' || s.cashierName === reportCashier;

         // Category match: If 'All', match. If specific, check if ANY item in sale belongs to that category
         const matchesCategory = reportCategory === 'All' || s.items.some(item => {
            const prod = products.find(p => p.id === item.productId);
            return prod?.category === reportCategory;
         });

         const matchesPaymentMethod = reportPaymentMethod === 'All' || s.paymentMethod === reportPaymentMethod;
         return matchesDate && matchesCashier && matchesCategory && matchesPaymentMethod;
      });
   }, [salesHistory, reportStartDate, reportEndDate, reportCashier, reportCategory, reportPaymentMethod, products]);

   const reportData = useMemo(() => {
      const salesWithProfit = filteredHistory.map(sale => {
         const profit = sale.items.reduce((acc, item) => {
            const product = products.find(p => p.id === item.productId);
            const cost = product ? product.costPrice * item.quantity : 0;
            return acc + (item.total - cost);
         }, 0);
         return { ...sale, profit };
      });

      const revenue = salesWithProfit.reduce((sum, s) => sum + s.total, 0);
      const profit = salesWithProfit.reduce((sum, s) => sum + s.profit, 0);
      const count = salesWithProfit.length;
      const avgTicket = count > 0 ? revenue / count : 0;

      const totalPages = Math.ceil(count / HISTORY_ITEMS_PER_PAGE);
      const startIndex = (historyPage - 1) * HISTORY_ITEMS_PER_PAGE;
      const paginatedSales = salesWithProfit.slice(startIndex, startIndex + HISTORY_ITEMS_PER_PAGE);

      return {
         totals: { revenue, count, avgTicket, profit },
         paginatedSales,
         totalPages
      };
   }, [filteredHistory, products, historyPage]);

   // Reset page on filter change
   useEffect(() => {
      setHistoryPage(1);
      setStatementCurrentPage(1);
   }, [reportStartDate, reportEndDate, reportCategory, reportCashier, reportPaymentMethod]);

   const statementPages = useMemo(() => {
      const STATEMENT_ITEMS_PER_PAGE = 30; // Adjust as needed for A4 layout
      const chunks: Sale[][] = [];
      // Create a copy to avoid mutating the original filteredHistory
      const data = [...filteredHistory];
      while (data.length > 0) {
         chunks.push(data.splice(0, STATEMENT_ITEMS_PER_PAGE));
      }
      return chunks;
   }, [filteredHistory]);

   useEffect(() => {
      statementPageRefs.current = statementPageRefs.current.slice(0, statementPages.length);
   }, [statementPages]);

   const filteredCustomers = useMemo(() => {
      if (!customerSearch) return [];
      const term = customerSearch.toLowerCase();
      return customers.filter(c =>
         c.name.toLowerCase().includes(term) ||
         (c.phone && c.phone.includes(term)) ||
         (c.email && c.email.toLowerCase().includes(term)) ||
         (c.address && c.address.toLowerCase().includes(term))
      ).slice(0, 5);
   }, [customers, customerSearch]);

   // --- CART ACTIONS ---

   const addToCart = (product: Product) => {
      if (product.stockQuantity <= 0 && !settings?.enableNegativeStock) {
         showToast("Out of stock!", 'error');
         return;
      }

      const price = calculatePrice(product, pricingMode);

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
            price: price,
            total: price,
            originalPrice: price // Store preferred price for discount calc
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

   // --- CART EDITING ---
   const openEditCartItem = (item: SaleItem, index: number) => {
      if (pricingMode === 'Wholesale') {
         showToast("Price negotiation is not available for Wholesale.", 'info');
         return;
      }
      const product = products.find(p => p.id === item.productId);
      if (!product) return;
      setEditingCartItem({ index, item, product });
      setEditItemForm({ price: item.price, quantity: item.quantity });
   };

   const saveCartItemEdit = () => {
      if (!editingCartItem) return;

      const { product } = editingCartItem;
      const minPrice = pricingMode === 'Retail'
         ? (product.minSellingPrice || product.selling_price)
         : product.costPrice; // Middle Man cannot sell below cost

      if (editItemForm.price < minPrice) {
         showToast(`Price cannot be lower than minimum: ${minPrice.toLocaleString()}`, 'error');
         return;
      }

      setCart(prev => prev.map((item, idx) => {
         if (idx === editingCartItem.index) {
            return {
               ...item,
               price: editItemForm.price,
               quantity: editItemForm.quantity,
               total: editItemForm.price * editItemForm.quantity
            };
         }
         return item;
      }));
      setEditingCartItem(null);
   };

   // --- CHECKOUT ---

   const subtotal = cart.reduce((acc, item) => acc + item.total, 0);
   const totalDiscount = cart.reduce((acc, item) => acc + ((item.originalPrice || item.price) - item.price) * item.quantity, 0);
   const tax = settings?.taxEnabled ? (subtotal * (settings.taxPercentage || 18) / 100) : 0;
   const total = subtotal + tax;

   const handleCheckout = (mode?: typeof pricingMode) => {
      if (cart.length === 0) return;
      if (mode) setPricingMode(mode);

      setCheckoutForm({
         amountPaid: 0, // Will be synced via useEffect
         paymentMethod: 'Cash',
         customerName: '',
         customerPhone: '',
      });
      setHasManuallyAdjustedPayment(false);

      // Reset Customer Search State
      setCustomerSearch('');
      setShowCustomerResults(false);
      setIsCreatingCustomer(false);
      setNewCustomerForm({ name: '', phone: '', email: '', address: '' });
      setIsCheckoutOpen(true);
   };

   // Sync amount paid with total when checkout opens or total changes
   useEffect(() => {
      if (isCheckoutOpen && !hasManuallyAdjustedPayment) {
         setCheckoutForm(prev => ({ ...prev, amountPaid: total }));
      }
   }, [isCheckoutOpen, total, hasManuallyAdjustedPayment]);

   const processPayment = async () => {
      if (checkoutForm.amountPaid < total) {
         showToast("Amount paid is less than total.", 'error');
         return;
      }

      setProcessingPayment(true);
      try {
         const cartWithWarranty = cart.map(item => {
            const product = products.find(p => p.id === item.productId);
            if (product?.warrantyPeriod) {
               const endDate = calculateWarrantyEndDate(product.warrantyPeriod);
               if (endDate) {
                  return { ...item, warrantyEndDate: endDate.getTime() };
               }
            }
            return item;
         });
         const sale: Sale = {
            receiptNo: `${settings?.invoicePrefix || 'INV'}-${Date.now().toString().slice(-6)}`,
            items: cartWithWarranty,
            subtotal,
            tax,
            discount: totalDiscount,
            total,
            amountPaid: checkoutForm.amountPaid,
            balance: checkoutForm.amountPaid - total,
            paymentMethod: checkoutForm.paymentMethod,
            customerName: checkoutForm.customerName,
            customerPhone: checkoutForm.customerPhone,
            customerType: pricingMode,
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
            customerPhone: ''
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

   const handleSelectCustomer = (c: any) => {
      setCheckoutForm(prev => ({
         ...prev,
         customerName: c.name,
         customerPhone: c.phone || ''
      }));
      setCustomerSearch(c.name);
      setShowCustomerResults(false);
   };

   const handleCreateCustomer = async () => {
      if (!newCustomerForm.name) return showToast("Customer Name is required", 'error');

      try {
         const newC = await db.customers.add({
            ...newCustomerForm,
            joinedDate: Date.now()
         });
         const createdCustomer = { ...newCustomerForm, id: newC.id };

         setCustomers(prev => [...prev, createdCustomer]);
         handleSelectCustomer(createdCustomer);
         setIsCreatingCustomer(false);
         showToast("Customer created & selected", 'success');
      } catch (e) {
         showToast("Failed to create customer", 'error');
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
         setProducts(await db.products.toArray());
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
         setProducts(await db.products.toArray());
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

   const downloadCSV = () => {
      if (filteredHistory.length === 0) return showToast("No data to export", 'info');
      const headers = ['Receipt No', 'Date', 'Time', 'Cashier', 'Customer', 'Items', 'Payment Method', 'Total (UGX)'];
      const rows = filteredHistory.map(s => [
         s.receiptNo,
         new Date(s.timestamp).toLocaleDateString(),
         new Date(s.timestamp).toLocaleTimeString(),
         s.cashierName,
         s.customerName || '',
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

   const handleEmailReceipt = () => {
      if (!lastSale) return;

      const customer = customers.find(c => c.name === lastSale.customerName);
      const email = customer?.email || '';

      const subject = `Receipt #${lastSale.receiptNo} - ${settings?.businessName || 'SNA SHOP'}`;
      const body = `Here is your receipt from ${settings?.businessName || 'SNA SHOP'}.\n\nReceipt No: ${lastSale.receiptNo}\nDate: ${new Date(lastSale.timestamp).toLocaleDateString()}\nTotal: UGX ${lastSale.total.toLocaleString()}\n\nThank you for your business!`;

      window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      showToast("Opening email client...", 'info');
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
                                 <p className="text-[10px] text-slate-400 mt-1">
                                    {product.brand && <span className="font-bold uppercase">{product.brand}</span>}
                                    <span className="font-mono">{product.brand && ' • '}{product.sku}</span>
                                 </p>
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
                     <div key={idx} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex items-center gap-4 animate-in slide-in-from-right-2 group">
                        <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500 shrink-0">
                           {getProductIcon(products.find(p => p.id === item.productId)?.type || ProductType.OTHERS)}
                        </div>
                        <div className="flex-1 min-w-0">
                           <p className="text-xs font-bold text-slate-800 truncate">{item.name}</p>
                           <p className="text-xs font-bold text-slate-500">
                              {item.price.toLocaleString()}
                              {(item.originalPrice && item.originalPrice > item.price) && (
                                 <span className="text-emerald-600 ml-1 line-through text-[9px]">{item.originalPrice.toLocaleString()}</span>
                              )}
                           </p>
                        </div>
                        <div className="flex items-center gap-1 bg-slate-50 rounded-lg p-1" onClick={e => e.stopPropagation()}>
                           <button onClick={() => updateQuantity(item.productId, -1)} className="w-7 h-7 flex items-center justify-center bg-white rounded shadow-sm text-slate-600 hover:text-red-500 disabled:opacity-50"><Minus size={14} /></button>
                           <span className="text-sm font-bold w-8 text-center">{item.quantity}</span>
                           <button onClick={() => updateQuantity(item.productId, 1)} className="w-7 h-7 flex items-center justify-center bg-white rounded shadow-sm text-slate-600 hover:text-emerald-500 disabled:opacity-50"><Plus size={14} /></button>
                        </div>
                        <div className="text-right min-w-[70px]">
                           <p className="text-xs font-bold text-slate-900">{item.total.toLocaleString()}</p>
                           <button onClick={(e) => { e.stopPropagation(); openEditCartItem(item, idx); }} className="text-[9px] text-blue-500 hover:underline">Edit</button>
                        </div>
                     </div>
                  ))
               )}
            </div>

            {/* Summary & Actions */}
            <div className="p-4 bg-white border-t border-slate-100 shadow-[0_-4px_20px_rgba(0,0,0,0.02)] z-10 space-y-4">
               {/* Pricing Mode Toggle */}
               <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Customer Type</label>
                  <div className="grid grid-cols-3 gap-2">
                     {(['Retail', 'Middle Man', 'Wholesale'] as const).map(mode => (
                        <button
                           key={mode}
                           onClick={() => handleCheckout(mode)}
                           className={`py-2.5 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-2 ${pricingMode === mode
                              ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                              }`}
                        >
                           {mode}
                        </button>
                     ))}
                  </div>
               </div>
               <div className="space-y-2 mb-6">
                  <div className="flex justify-between text-xs font-medium text-slate-500">
                     <span>Subtotal</span>
                     <span className="font-bold">{subtotal.toLocaleString()}</span>
                  </div>
                  {totalDiscount > 0 && (
                     <div className="flex justify-between text-xs font-medium text-emerald-600">
                        <span>Discount Applied</span>
                        <span className="font-bold">-{totalDiscount.toLocaleString()}</span>
                     </div>
                  )}
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
                     {/* Customer Type Selection inside Modal */}
                     <div className="space-y-3">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide ml-1">Customer Type (Pricing)</label>
                        <div className="grid grid-cols-3 gap-2">
                           {(['Retail', 'Middle Man', 'Wholesale'] as const).map(mode => (
                              <button
                                 key={mode}
                                 onClick={() => setPricingMode(mode)}
                                 className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${pricingMode === mode
                                    ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                                    }`}
                              >
                                 {mode}
                              </button>
                           ))}
                        </div>
                     </div>

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
                              onChange={e => {
                                 setCheckoutForm(prev => ({ ...prev, amountPaid: Number(e.target.value) }));
                                 setHasManuallyAdjustedPayment(true);
                              }}
                           />
                        </div>
                        {checkoutForm.amountPaid >= total && (
                           <div className="flex justify-between items-center px-4 py-2 bg-emerald-50 rounded-xl border border-emerald-100">
                              <span className="text-xs font-bold text-emerald-600 uppercase">Change Due</span>
                              <span className="text-lg font-black text-emerald-700">{(checkoutForm.amountPaid - total).toLocaleString()}</span>
                           </div>
                        )}
                     </div>

                     {/* Customer Search & Create */}
                     <div className="space-y-3 pt-2 border-t border-slate-100">
                        <div className="flex justify-between items-center">
                           <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide ml-1">Customer Details</label>
                           {!isCreatingCustomer && (
                              <button onClick={() => setIsCreatingCustomer(true)} className="text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-1">
                                 <UserPlus size={12} /> New Customer
                              </button>
                           )}
                        </div>

                        {!isCreatingCustomer ? (
                           <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                              <input
                                 className="w-full h-10 bg-slate-50 rounded-xl pl-9 pr-4 text-xs font-bold outline-none focus:ring-2 focus:ring-slate-200"
                                 placeholder="Search Name, Phone, Email or Address..."
                                 value={customerSearch}
                                 onChange={e => {
                                    setCustomerSearch(e.target.value);
                                    setShowCustomerResults(true);
                                    if (checkoutForm.customerName && e.target.value !== checkoutForm.customerName) {
                                       setCheckoutForm(prev => ({ ...prev, customerName: '', customerPhone: '' }));
                                    }
                                 }}
                                 onFocus={() => setShowCustomerResults(true)}
                              />
                              {showCustomerResults && customerSearch && (
                                 <div className="absolute top-full left-0 right-0 bg-white border border-slate-100 shadow-xl rounded-xl mt-1 z-20 max-h-48 overflow-y-auto">
                                    {filteredCustomers.map(c => (
                                       <button
                                          key={c.id}
                                          onClick={() => handleSelectCustomer(c)}
                                          className="w-full text-left px-4 py-2 hover:bg-slate-50 border-b border-slate-50 last:border-0"
                                       >
                                          <p className="text-xs font-bold text-slate-800">{c.name}</p>
                                          <div className="flex gap-2 text-[10px] text-slate-400">
                                             {c.phone && <span>{c.phone}</span>}
                                             {c.address && <span>• {c.address}</span>}
                                          </div>
                                       </button>
                                    ))}
                                    {filteredCustomers.length === 0 && (
                                       <div className="p-3 text-center">
                                          <p className="text-[10px] text-slate-400 mb-2">No customer found</p>
                                          <button onClick={() => setIsCreatingCustomer(true)} className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-[10px] font-bold uppercase">Create New</button>
                                       </div>
                                    )}
                                 </div>
                              )}
                           </div>
                        ) : (
                           <div className="bg-slate-50 p-3 rounded-xl space-y-2 animate-in slide-in-from-right-5">
                              <div className="flex justify-between items-center mb-1">
                                 <span className="text-[10px] font-bold text-slate-400 uppercase">New Customer Profile</span>
                                 <button onClick={() => setIsCreatingCustomer(false)} className="text-[10px] text-red-500 hover:underline">Cancel</button>
                              </div>
                              <input
                                 className="w-full h-9 bg-white border border-slate-200 rounded-lg px-3 text-xs font-bold outline-none focus:border-blue-400"
                                 placeholder="Full Name (Required)"
                                 value={newCustomerForm.name}
                                 onChange={e => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
                              />
                              <div className="grid grid-cols-2 gap-2">
                                 <input
                                    className="w-full h-9 bg-white border border-slate-200 rounded-lg px-3 text-xs outline-none focus:border-blue-400"
                                    placeholder="Phone (Optional)"
                                    value={newCustomerForm.phone}
                                    onChange={e => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })}
                                 />
                                 <input
                                    className="w-full h-9 bg-white border border-slate-200 rounded-lg px-3 text-xs outline-none focus:border-blue-400"
                                    placeholder="Email (Optional)"
                                    value={newCustomerForm.email}
                                    onChange={e => setNewCustomerForm({ ...newCustomerForm, email: e.target.value })}
                                 />
                              </div>
                              <input
                                 className="w-full h-9 bg-white border border-slate-200 rounded-lg px-3 text-xs outline-none focus:border-blue-400"
                                 placeholder="Address (Optional)"
                                 value={newCustomerForm.address}
                                 onChange={e => setNewCustomerForm({ ...newCustomerForm, address: e.target.value })}
                              />
                              <button onClick={handleCreateCustomer} className="w-full py-2 bg-blue-600 text-white rounded-lg text-[10px] font-bold uppercase hover:bg-blue-700 transition-colors">
                                 Save & Select Customer
                              </button>
                           </div>
                        )}

                        {/* Selected Customer Display */}
                        {checkoutForm.customerName && !isCreatingCustomer && (
                           <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg border border-blue-100">
                              <UserIcon size={14} />
                              <div className="flex-1 min-w-0">
                                 <p className="text-xs font-bold truncate">{checkoutForm.customerName}</p>
                                 {checkoutForm.customerPhone && <p className="text-[10px] opacity-80">{checkoutForm.customerPhone}</p>}
                              </div>
                              <button onClick={() => { setCheckoutForm(prev => ({ ...prev, customerName: '', customerPhone: '' })); setCustomerSearch(''); }} className="p-1 hover:bg-blue-100 rounded">
                                 <X size={14} />
                              </button>
                           </div>
                        )}
                     </div>

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

         {/* --- EDIT CART ITEM MODAL --- */}
         {editingCartItem && (
            <div className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in">
               <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-white/20">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                     <h3 className="text-sm font-bold text-slate-900">Adjust Item</h3>
                     <button onClick={() => setEditingCartItem(null)}><X size={18} className="text-slate-400" /></button>
                  </div>
                  <div className="p-6 space-y-4">
                     <div>
                        <p className="text-xs font-bold text-slate-500 uppercase mb-1">Product</p>
                        <p className="font-bold text-slate-900">{editingCartItem.item.name}</p>
                        <p className="text-[10px] text-slate-400">
                           Preferred: {(editingCartItem.item.originalPrice || editingCartItem.item.price).toLocaleString()} |
                           Min: {(pricingMode === 'Retail' ? editingCartItem.product.minSellingPrice : editingCartItem.product.costPrice)?.toLocaleString() || 0}
                        </p>
                     </div>

                     <div className="grid grid-cols-2 gap-4">
                        <div>
                           <label className="text-[10px] font-bold text-slate-400 uppercase">Unit Price</label>
                           <input
                              type="number"
                              className="w-full h-10 border border-slate-200 rounded-lg px-3 font-bold text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                              value={editItemForm.price}
                              onChange={e => setEditItemForm({ ...editItemForm, price: Number(e.target.value) })}
                           />
                        </div>
                        <div>
                           <label className="text-[10px] font-bold text-slate-400 uppercase">Quantity</label>
                           <input
                              type="number"
                              className="w-full h-10 border border-slate-200 rounded-lg px-3 font-bold text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                              value={editItemForm.quantity}
                              onChange={e => setEditItemForm({ ...editItemForm, quantity: Number(e.target.value) })}
                           />
                        </div>
                     </div>

                     <div className="pt-2">
                        <button
                           onClick={saveCartItemEdit}
                           className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-black transition-all"
                        >
                           Update Item
                        </button>
                     </div>
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
                     <div className="flex gap-2 items-center">
                        <button
                           onClick={() => setPrintConfig(c => ({ ...c, showLogo: !c.showLogo }))}
                           className={`px-3 py-1 rounded-lg border text-[10px] font-bold uppercase transition-all ${printConfig.showLogo ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-400 border-slate-200'}`}
                        >
                           Logo {printConfig.showLogo ? 'ON' : 'OFF'}
                        </button>
                        <button onClick={() => setIsReceiptOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 rounded-lg"><X size={18} /></button>
                     </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 bg-slate-200 flex justify-center">
                     <div id="pos-receipt" className="receipt-mode bg-white p-4 shadow-xl text-black font-mono text-[11px] leading-tight w-full max-w-[80mm]">
                        <div className="text-center mb-4">
                           {printConfig.showLogo && (
                              settings?.logo ? (
                                 <img src={settings.logo} className="h-16 mx-auto mb-2 object-contain" alt="Logo" />
                              ) : (
                                 <div className="h-16 w-16 mx-auto mb-2 border-2 border-black border-dashed rounded-full flex items-center justify-center">
                                    <Store size={24} className="text-black" />
                                 </div>
                              )
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
                           {lastSale.customerName && lastSale.customerName.trim() !== '' && lastSale.customerName !== 'Walk-in' && (
                              <div>Cust: {lastSale.customerName}</div>
                           )}
                        </div>

                        <div className="border-b border-black border-dashed mb-2"></div>

                        <div className="mb-2">
                           {lastSale.items.map((item, i) => {
                              const itemPrice = item.price;
                              const originalItemPrice = item.originalPrice || item.price;
                              const discount = (originalItemPrice - itemPrice) * item.quantity;
                              const itemTotal = item.total;
                              return (
                                 <div key={i} className="mb-1.5">
                                    <div>{item.name}</div>
                                    {lastSale.customerType === 'Retail' && discount > 0 ? (
                                       <>
                                          <div className="flex justify-between pl-2">
                                             <span>{item.quantity} x {itemPrice.toLocaleString()}</span>
                                             <span className="font-bold">{itemTotal.toLocaleString()}</span>
                                          </div>
                                          <div className="flex justify-between pl-2 text-[9px] text-slate-500">
                                             <span>(was {originalItemPrice.toLocaleString()} each)</span>
                                             <span>Discount: -{discount.toLocaleString()}</span>
                                          </div>
                                       </>
                                    ) : (
                                       <div className="flex justify-between pl-2">
                                          <span>{item.quantity} x {itemPrice.toLocaleString()}</span>
                                          <span className="font-bold">{itemTotal.toLocaleString()}</span>
                                       </div>
                                    )}
                                    {item.warrantyEndDate && (
                                       <div className="pl-2 text-[9px] text-slate-500">
                                          Warranty valid until: {new Date(item.warrantyEndDate).toLocaleDateString()}
                                       </div>
                                    )}
                                 </div>
                              );
                           })}
                        </div>

                        <div className="border-b border-black border-dashed mb-2"></div>

                        <div className="space-y-1 mb-2">
                           {(() => {
                              const grossSubtotal = lastSale.items.reduce((acc, item) => acc + ((item.originalPrice || item.price) * item.quantity), 0);
                              const discountPercent = grossSubtotal > 0 ? (lastSale.discount / grossSubtotal) * 100 : 0;

                              return (
                                 <>
                                    <div className="flex justify-between font-bold">
                                       <span>SUBTOTAL</span>
                                       <span>{grossSubtotal.toLocaleString()}</span>
                                    </div>
                                    {lastSale.discount > 0 && (
                                       <div className="flex justify-between">
                                          <span>DISCOUNT ({discountPercent.toFixed(1)}%)</span>
                                          <span>-{lastSale.discount.toLocaleString()}</span>
                                       </div>
                                    )}
                                 </>
                              );
                           })()}
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
                     <button onClick={handleEmailReceipt} className="flex-1 py-3 bg-blue-50 text-blue-600 border border-blue-100 rounded-xl text-xs font-bold uppercase hover:bg-blue-100 flex items-center justify-center gap-2 transition-colors">
                        <Mail size={16} /> Email
                     </button>
                     <button onClick={() => printSection('#pos-receipt')} className="flex-1 py-3 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase hover:bg-black flex items-center justify-center gap-2">
                        <Printer size={16} /> Print
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* --- HISTORY & REPORTS MODAL --- */}
         {isHistoryModalOpen && (
            <div className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
               <div className={`bg-white w-full rounded-[2rem] shadow-2xl overflow-hidden border border-white/20 flex flex-col max-h-[90vh] transition-all duration-300 max-w-6xl`}>

                  {/* Modal Header */}
                  <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between no-print bg-white shrink-0 z-20">
                     <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-900">
                           <History size={20} strokeWidth={2} />
                        </div>
                        <div>
                           <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Sales History</h2>
                           <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Transaction Records</p>
                        </div>
                     </div>

                     <div className="flex items-center gap-2">
                        <button
                           onClick={() => setIsStatementModalOpen(true)}
                           className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold uppercase hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center gap-2"
                        >
                           <FileText size={14} /> Statement
                        </button>
                        <button
                           onClick={downloadCSV}
                           className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold uppercase hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center gap-2"
                        >
                           <FileText size={14} /> CSV
                        </button>
                        <button
                           onClick={() => exportSectionToPDF('#sales-history-table', 'Sales_Report.pdf')}
                           className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase hover:bg-black transition-all flex items-center gap-2 shadow-lg shadow-slate-900/20"
                        >
                           <Download size={14} /> PDF
                        </button>
                        <button onClick={() => setIsHistoryModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-all ml-2"><X size={20} /></button>
                     </div>
                  </div>

                  {/* Filters & Summary Section */}
                  <div className="shrink-0 bg-slate-50/50 border-b border-slate-100">
                     {/* Summary Cards - Restructured */}
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-6 pb-2">
                        <div className="bg-slate-900 p-5 rounded-2xl text-white shadow-xl shadow-slate-900/10 relative overflow-hidden group">
                           <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                              <DollarSign size={64} />
                           </div>
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Revenue</p>
                           <p className="text-3xl font-black tracking-tight">
                              <span className="text-lg text-slate-500 mr-1 font-medium">UGX</span>
                              {reportData.totals.revenue.toLocaleString()}
                           </p>
                        </div>
                        <div className={`p-5 rounded-2xl text-white shadow-xl group ${reportData.totals.profit >= 0 ? 'bg-emerald-600 shadow-emerald-900/10' : 'bg-red-600 shadow-red-900/10'}`}>
                           <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                              <TrendingUpIcon size={64} />
                           </div>
                           <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mb-1">Total Profit</p>
                           <p className="text-3xl font-black tracking-tight">
                              <span className="text-lg text-white/80 mr-1 font-medium">UGX</span>
                              {reportData.totals.profit.toLocaleString()}
                           </p>
                        </div>
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center group hover:border-blue-300 transition-colors">
                           <div className="flex items-center gap-3">
                              <div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:scale-110 transition-transform">
                                 <Receipt size={20} />
                              </div>
                              <div>
                                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Transactions</p>
                                 <p className="text-2xl font-black text-slate-900">{reportData.totals.count}</p>
                              </div>
                           </div>
                        </div>
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center group hover:border-emerald-300 transition-colors">
                           <div className="flex items-center gap-3">
                              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl group-hover:scale-110 transition-transform">
                                 <TrendingUpIcon size={20} />
                              </div>
                              <div>
                                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Avg. Ticket</p>
                                 <p className="text-2xl font-black text-slate-900">
                                    <span className="text-sm text-slate-400 mr-1 font-bold">UGX</span>
                                    {Math.round(reportData.totals.avgTicket).toLocaleString()}
                                 </p>
                              </div>
                           </div>
                        </div>
                     </div>

                     {/* Filter Bar */}
                     <div className="px-6 pb-6 pt-2 flex flex-wrap gap-3 items-center">
                        <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
                           <div className="px-3 border-r border-slate-100">
                              <Calendar size={14} className="text-slate-400" />
                           </div>
                           <input
                              type="date"
                              className="text-xs font-bold text-slate-700 bg-transparent border-none focus:ring-0 h-9 w-32"
                              value={reportStartDate}
                              onChange={e => setReportStartDate(e.target.value)}
                           />
                           <span className="text-slate-300 text-xs font-bold px-1">-</span>
                           <input
                              type="date"
                              className="text-xs font-bold text-slate-700 bg-transparent border-none focus:ring-0 h-9 w-32"
                              value={reportEndDate}
                              onChange={e => setReportEndDate(e.target.value)}
                           />
                        </div>

                        <div className="h-8 w-px bg-slate-200 mx-1"></div>

                        <div className="relative">
                           <select
                              className="appearance-none bg-white border border-slate-200 pl-4 pr-10 h-11 rounded-xl text-xs font-bold text-slate-700 shadow-sm focus:ring-2 focus:ring-slate-100 outline-none cursor-pointer hover:bg-slate-50 transition-colors min-w-[140px]"
                              value={reportCategory}
                              onChange={e => setReportCategory(e.target.value)}
                           >
                              {categories.map(c => <option key={c} value={c}>{c === 'All' ? 'All Categories' : c}</option>)}
                           </select>
                           <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>

                        <div className="relative">
                           <select
                              className="appearance-none bg-white border border-slate-200 pl-4 pr-10 h-11 rounded-xl text-xs font-bold text-slate-700 shadow-sm focus:ring-2 focus:ring-slate-100 outline-none cursor-pointer hover:bg-slate-50 transition-colors min-w-[120px]"
                              value={reportPaymentMethod}
                              onChange={e => setReportPaymentMethod(e.target.value)}
                           >
                              <option value="All">All Payments</option>
                              <option value="Cash">Cash</option>
                              <option value="Mobile Money">Mobile Money</option>
                              <option value="Bank">Bank</option>
                           </select>
                           <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>

                        <div className="relative">
                           <select
                              className="appearance-none bg-white border border-slate-200 pl-4 pr-10 h-11 rounded-xl text-xs font-bold text-slate-700 shadow-sm focus:ring-2 focus:ring-slate-100 outline-none cursor-pointer hover:bg-slate-50 transition-colors min-w-[140px]"
                              value={reportCashier}
                              onChange={e => setReportCashier(e.target.value)}
                           >
                              {cashiers.map(c => <option key={c} value={c}>{c === 'All' ? 'All Cashiers' : c}</option>)}
                           </select>
                           <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>

                        <button
                           onClick={() => {
                              const today = new Date();
                              const str = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                              setReportStartDate(str);
                              setReportEndDate(str);
                              setReportCategory('All');
                              setReportPaymentMethod('All');
                              setReportCashier('All');
                           }}
                           className="ml-auto p-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                           title="Reset Filters"
                        >
                           <RotateCcw size={16} />
                        </button>
                     </div>
                  </div>

                  {/* REPORT CONTENT AREA */}
                  <div className="flex-1 overflow-y-auto bg-white p-0 flex justify-center relative">
                     <div id="sales-history-table" className="w-full bg-white h-full">
                        <table className="w-full text-left border-collapse">
                           <thead className="bg-white sticky top-0 z-10 shadow-sm shadow-slate-100">
                              <tr>
                                 <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50 border-b border-slate-100">Receipt #</th>
                                 <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50 border-b border-slate-100">Date & Time</th>
                                 <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50 border-b border-slate-100">Customer</th>
                                 <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50 border-b border-slate-100 text-center">Items</th>
                                 <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50 border-b border-slate-100 text-right">Profit</th>
                                 <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50 border-b border-slate-100 text-right">Total</th>
                                 <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50 border-b border-slate-100 text-right no-print">Action</th>
                              </tr>
                           </thead>
                           <tbody>
                              {(() => {
                                 let lastRenderedDate: string | null = null;
                                 return reportData.paginatedSales.map(sale => {
                                    const saleDate = new Date(sale.timestamp).toLocaleDateString('en-CA');
                                    const showDateHeader = saleDate !== lastRenderedDate;
                                    lastRenderedDate = saleDate;

                                    return (
                                       <React.Fragment key={sale.id}>
                                          {showDateHeader && (
                                             <tr className="bg-slate-100 sticky top-[57px] z-[5]">
                                                <td colSpan={7} className="px-6 py-2">
                                                   <div className="flex items-center gap-2">
                                                      <Calendar size={14} className="text-slate-400" />
                                                      <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider">
                                                         {new Date(sale.timestamp).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                                      </h3>
                                                   </div>
                                                </td>
                                             </tr>
                                          )}
                                          <tr className="hover:bg-slate-50 transition-colors group border-b border-slate-100">
                                             <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                   <div className="p-1.5 bg-slate-100 rounded text-slate-500">
                                                      <Receipt size={14} />
                                                   </div>
                                                   <span className="font-mono text-xs font-bold text-slate-700">{sale.receiptNo}</span>
                                                </div>
                                             </td>
                                             <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                   <span className="text-xs font-bold text-slate-900">{new Date(sale.timestamp).toLocaleDateString()}</span>
                                                   <span className="text-[10px] font-medium text-slate-400">{new Date(sale.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                             </td>
                                             <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                   <span className="text-xs font-bold text-slate-900">{sale.customerName || 'Walk-in Customer'}</span>
                                                   <span className="text-[10px] text-slate-400">{sale.customerType || 'Retail'}</span>
                                                </div>
                                             </td>
                                             <td className="px-6 py-4 text-center">
                                                <div className="inline-block px-2 py-1 bg-slate-100 text-slate-600 rounded-md text-xs font-bold">
                                                   {sale.items.length}
                                                </div>
                                             </td>
                                             <td className="px-6 py-4 text-right">
                                                <span className={`text-sm font-black ${sale.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                   {sale.profit.toLocaleString()}
                                                </span>
                                             </td>
                                             <td className="px-6 py-4 text-right">
                                                <span className="text-sm font-black text-slate-900">{sale.total.toLocaleString()}</span>
                                                <div className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">{sale.paymentMethod}</div>
                                             </td>
                                             <td className="px-6 py-4 text-right no-print">
                                                <div className="flex justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                                   <button
                                                      onClick={() => setExpandedSaleId(expandedSaleId === sale.id ? null : sale.id)}
                                                      className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-slate-900 hover:border-slate-400 transition-all shadow-sm"
                                                      title="View Details"
                                                   >
                                                      {expandedSaleId === sale.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                   </button>
                                                   <button
                                                      onClick={() => { setLastSale(sale); setIsReceiptOpen(true); }}
                                                      className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-slate-900 hover:border-slate-400 transition-all shadow-sm"
                                                      title="Reprint Receipt"
                                                   >
                                                      <Printer size={14} />
                                                   </button>
                                                   {user.role === UserRole.ADMIN && (
                                                      <>
                                                         <button onClick={() => { setSaleToEdit(JSON.parse(JSON.stringify(sale))); setIsEditModalOpen(true); }} className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-blue-600 hover:border-blue-400 transition-all shadow-sm ml-1" title="Edit Invoice">
                                                            <Edit size={14} />
                                                         </button>
                                                         <button onClick={() => setSaleToDelete(sale)} className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-red-600 hover:border-red-400 transition-all shadow-sm ml-1" title="Delete Invoice">
                                                            <Trash2 size={14} />
                                                         </button>
                                                      </>
                                                   )}
                                                </div>
                                             </td>
                                          </tr>
                                          {expandedSaleId === sale.id && (
                                             <tr className="bg-slate-50/50 animate-in fade-in duration-200">
                                                <td colSpan={7} className="p-0">
                                                   <div className="p-4 m-4 bg-white rounded-lg border border-slate-200">
                                                      <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">Items in this Sale</h4>
                                                      <div className="space-y-2">
                                                         {sale.items.map((item, index) => (
                                                            <div key={index} className="flex justify-between items-center text-xs border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                                                               <div>
                                                                  <p className="font-bold text-slate-800">{item.name}</p>
                                                                  <p className="text-[10px] text-slate-400">
                                                                     {item.quantity} x {item.price.toLocaleString()}
                                                                  </p>
                                                               </div>
                                                               <p className="font-bold text-slate-800">{item.total.toLocaleString()}</p>
                                                            </div>
                                                         ))}
                                                      </div>
                                                   </div>
                                                </td>
                                             </tr>
                                          )}
                                       </React.Fragment>
                                    );
                                 });
                              })()}

                              {reportData.paginatedSales.length === 0 && (
                                 <tr>
                                    <td colSpan={7} className="py-20 text-center">
                                       <div className="flex flex-col items-center justify-center text-slate-300">
                                          <Search size={48} className="mb-4 opacity-50" />
                                          <p className="text-sm font-bold uppercase tracking-widest">No records found</p>
                                          <p className="text-xs mt-1">Try adjusting your filters</p>
                                       </div>
                                    </td>
                                 </tr>
                              )}
                           </tbody>
                        </table>
                     </div>
                  </div>

                  {/* Pagination Footer */}
                  <div className="shrink-0 p-4 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center no-print">
                     <div>
                        <p className="text-xs font-bold text-slate-500">
                           Showing <span className="text-slate-900">{reportData.paginatedSales.length}</span> of <span className="text-slate-900">{reportData.totals.count}</span> transactions
                        </p>
                     </div>
                     <div className="flex items-center gap-2">
                        <button
                           onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                           disabled={historyPage === 1}
                           className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold uppercase text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                           Previous
                        </button>
                        <span className="text-xs font-bold text-slate-600">Page {historyPage} of {reportData.totalPages}</span>
                        <button
                           onClick={() => setHistoryPage(p => Math.min(reportData.totalPages, p + 1))}
                           disabled={historyPage >= reportData.totalPages}
                           className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold uppercase text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                           Next
                        </button>
                     </div>
                  </div>
               </div>
            </div>
         )}

         {/* --- STATEMENT MODAL --- */}
         {isStatementModalOpen && (
            <div className="fixed inset-0 bg-slate-900/60 z-[10000] flex items-center justify-center p-4 backdrop-blur-sm animate-in">
               <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden border border-white/20 flex flex-col max-h-[90vh]">
                  <div className="p-5 border-b border-slate-100 flex items-center justify-between no-print bg-slate-50 shrink-0">
                     <div>
                        <h2 className="text-lg font-bold text-slate-900">Sales Statement</h2>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-0.5">Period: {reportStartDate} to {reportEndDate}</p>
                     </div>
                     <div className="flex items-center gap-2">
                        <button onClick={() => setIsPrintingStatement(true)} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase hover:bg-black transition-all flex items-center gap-2 shadow-lg shadow-slate-900/20">
                           <Printer size={14} /> Print
                        </button>
                        <button onClick={() => setIsStatementModalOpen(false)} className="p-2 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition-colors"><X size={20} /></button>
                     </div>
                  </div>
                  <div className="flex-1 overflow-y-auto bg-white">
                     <div id="sales-statement" className="receipt-a4-mode p-12 w-full max-w-[210mm] mx-auto">
                        {/* Report Header */}
                        <div className="flex justify-between items-start mb-8 border-b border-slate-900 pb-6">
                           <div>
                              <h1 className="text-2xl font-black uppercase tracking-tight mb-2">Sales Report</h1>
                              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Period: {reportStartDate} to {reportEndDate}</p>
                              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">SNA Mobile ERP System</p>
                           </div>
                           <div className="text-right">
                              {settings?.logo && (
                                 <img src={settings.logo} className="h-20 object-contain ml-auto mb-3" alt="Logo" />
                              )}
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
                                 {reportData.totals.revenue.toLocaleString()}
                              </p>
                           </div>
                           <div className="p-4 border border-slate-200 rounded-lg bg-slate-50">
                              <div className="flex items-center gap-2 mb-2 text-slate-400">
                                 <Receipt size={14} />
                                 <p className="text-[10px] font-bold uppercase tracking-wider">Transactions</p>
                              </div>
                              <p className="text-2xl font-black text-slate-900">
                                 {reportData.totals.count}
                              </p>
                           </div>
                           <div className="p-4 border border-slate-200 rounded-lg bg-slate-50">
                              <div className="flex items-center gap-2 mb-2 text-slate-400">
                                 <TrendingUpIcon size={14} />
                                 <p className="text-[10px] font-bold uppercase tracking-wider">Avg Ticket</p>
                              </div>
                              <p className="text-2xl font-black text-slate-900">
                                 {Math.round(reportData.totals.avgTicket).toLocaleString()}
                              </p>
                           </div>
                        </div>

                        {/* Transaction Table */}
                        {statementPages.map((pageItems, pageIndex) => (
                           <div key={pageIndex} className="mb-8" style={pageIndex < statementPages.length - 1 ? { pageBreakAfter: 'always' } : {}}>
                              {pageIndex === 0 && (
                                 <h3 className="text-xs font-black uppercase tracking-widest border-b border-slate-200 pb-2 mb-4 text-slate-500">Transaction Details</h3>
                              )}
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
                                    {pageItems.map((sale, idx) => (
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
                                 {/* Grand Total Footer only on the last page */}
                                 {pageIndex === statementPages.length - 1 && (
                                    <tfoot className="border-t-2 border-slate-200">
                                       <tr>
                                          <td colSpan={5} className="py-3 text-right font-black text-sm uppercase">Grand Total</td>
                                          <td className="py-3 text-right font-black text-sm">{reportData.totals.revenue.toLocaleString()}</td>
                                       </tr>
                                    </tfoot>
                                 )}
                              </table>
                              {/* Page Number Footer */}
                              {statementPages.length > 1 && (
                                 <div className="text-center text-xs text-slate-400 mt-4 print:block hidden">
                                    Page {pageIndex + 1} of {statementPages.length}
                                 </div>
                              )}
                           </div>
                        ))}

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
                  </div>
                  {/* Pagination Footer for Statement */}
                  <div className="shrink-0 p-4 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center no-print">
                     <div>
                        <p className="text-xs font-bold text-slate-500">
                           Total Transactions: <span className="text-slate-900">{filteredHistory.length}</span>
                        </p>
                     </div>
                     <div className="flex items-center gap-2">
                        <button
                           onClick={() => setStatementCurrentPage(p => Math.max(1, p - 1))}
                           disabled={statementCurrentPage === 1}
                           className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold uppercase text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                           Previous
                        </button>
                        <span className="text-xs font-bold text-slate-600">Page {statementCurrentPage} of {statementPages.length}</span>
                        <button
                           onClick={() => setStatementCurrentPage(p => Math.min(statementPages.length, p + 1))}
                           disabled={statementCurrentPage >= statementPages.length}
                           className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold uppercase text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                           Next
                        </button>
                     </div>
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

      </div>
   );
};

export default POS;
