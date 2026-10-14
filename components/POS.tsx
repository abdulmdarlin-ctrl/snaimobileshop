import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../db';
import { itemImeis, validateImeis } from '../utils/imei';
import { calculateSaleTotals, money, validateItems, validatePayment, getSaleType, outstandingAmount } from '../utils/pos';
import { normalizeCustomerPhone, escapeCustomerCSVCell } from '../utils/customers';
import { Product, Sale, SaleItem, User, AppSettings, ProductType, UserRole, CustomerCategory, CustomerStatus, SaleType } from '../types';
import {
   Search, ShoppingCart, Trash2, Plus, Minus, CreditCard,
   Printer, History, RotateCcw, X, Check, Calculator, ChevronDown, ChevronUp, Users as UsersIcon,
   User as UserIcon, AlertCircle, Package, Receipt, Edit, Tag,
   ChevronRight, Smartphone, Headphones, Battery, Box, Filter, TrendingUp as TrendingUpIcon, Pause, PlayCircle,
   Loader2, AlertTriangle, ScanBarcode, Download, FileText, Calendar, Percent,
   Eraser, Store, LayoutGrid, List as ListIcon, DollarSign, UserPlus, MapPin, Mail, Phone,
   ArrowUpRight, PackageSearch, MessageCircle
} from 'lucide-react';
import { printSection, exportSectionToPDF } from '../utils/printExport';
import { useToast } from './Toast';
import Modal from './Modal';
import QRCode from 'qrcode';
import SnaiLogo from '../assets/SNAI-LOGO.png';

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
   const [imeiLookupOpen, setImeiLookupOpen] = useState(false);
   const [imeiQuery, setImeiQuery] = useState('');
   const [customers, setCustomers] = useState<any[]>([]);
   const [categories, setCategories] = useState<string[]>(['All']);
   const [salesHistory, setSalesHistory] = useState<Sale[]>([]);
   const [cart, setCart] = useState<SaleItem[]>([]);
   const [loading, setLoading] = useState(true);
   const [pricingMode, setPricingMode] = useState<'Retail' | 'Wholesale' | 'Middle Man'>('Retail');
   const [searchTerm, setSearchTerm] = useState('');
   const [selectedCategory, setSelectedCategory] = useState('All');
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
   const [historySearchTerm, setHistorySearchTerm] = useState('');

   // Modals
   const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
   const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
   const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
   const [isReceiptOpen, setIsReceiptOpen] = useState(false);
   const [processingPayment, setProcessingPayment] = useState(false);
   const paymentLock = useRef(false);
   const saleIdRef = useRef<string>(crypto.randomUUID());
   const adminLock = useRef(false);
   const customerLock = useRef(false);
   const [paymentReference, setPaymentReference] = useState('');
   const [dataError, setDataError] = useState(false);
   const skipReprice = useRef(false);
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
      paymentMethod: 'Cash' as Sale['paymentMethod'],
      customerName: '',
      customerPhone: '',
      discountPercentage: 0,
   });
   const [saleType, setSaleType] = useState<SaleType>('Cash sale');
   const [saleTypeFilter, setSaleTypeFilter] = useState('All');
   const [paymentSale, setPaymentSale] = useState<Sale | null>(null);
   const [collectionForm, setCollectionForm] = useState({ amount: 0, method: 'Cash', reference: '' });
   const [collecting, setCollecting] = useState(false);
   const collectionLock = useRef(false);
   const collectionId = useRef<string>(crypto.randomUUID());
   const [hasManuallyAdjustedPayment, setHasManuallyAdjustedPayment] = useState(false);

   // Customer Search State in POS
   const [customerSearch, setCustomerSearch] = useState('');
   const [showCustomerResults, setShowCustomerResults] = useState(false);
   const [newCustomerForm, setNewCustomerForm] = useState({ name: '', phone: '', email: '', address: '' });
   const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);

   const [isSelectPricingModalOpen, setIsSelectPricingModalOpen] = useState(false); // New state for pricing type selection modal
   const [isConfirmSaleModalOpen, setIsConfirmSaleModalOpen] = useState(false);
   const [stagedPricingMode, setStagedPricingMode] = useState<'Retail' | 'Wholesale' | 'Middle Man'>('Retail');
   const [lastSale, setLastSale] = useState<Sale | null>(null);
   const [qrCodeDataURL, setQrCodeDataURL] = useState<string | null>(null);
   const searchInputRef = useRef<HTMLInputElement>(null);

   // Held Sales State
   const [heldSales, setHeldSales] = useState<any[]>([]);
   const [isHeldSalesModalOpen, setIsHeldSalesModalOpen] = useState(false);
   const [isHoldModalOpen, setIsHoldModalOpen] = useState(false);
   const [holdNote, setHoldNote] = useState('');
   const [heldSalesView, setHeldSalesView] = useState<'pending' | 'completed'>('pending');

   useEffect(() => {
      fetchData();
      readHeldSales();
   }, []);

   useEffect(() => {
      const storedResumeId = sessionStorage.getItem('sna_resume_held_sale_id');
      if (storedResumeId && heldSales.length > 0) {
         const saleToResume = heldSales.find(s => s.id === storedResumeId);
         if (saleToResume) {
            handleResumeSale(saleToResume);
            sessionStorage.removeItem('sna_resume_held_sale_id');
         }
      }
   }, [heldSales]);

   useEffect(() => {
      if (lastSale) {
         const verificationText = `SNA-VERIFY|${lastSale.receiptNo}|${lastSale.total}|${lastSale.timestamp}`;
         QRCode.toDataURL(verificationText, {
            margin: 2,
            scale: 4,
            color: {
               dark: '#000000',
               light: '#ffffff'
            }
         })
            .then(url => setQrCodeDataURL(url))
            .catch(err => {
               console.error('Failed to generate QR Code', err);
               setQrCodeDataURL(null);
            });
      } else {
         setQrCodeDataURL(null);
      }
   }, [lastSale]);

   useEffect(() => {
      const syncHeld = () => {
         readHeldSales();
      };
      window.addEventListener('storage', syncHeld);
      return () => window.removeEventListener('storage', syncHeld);
   }, []);

   const readHeldSales = () => {
      try {
         const saved = JSON.parse(localStorage.getItem('sna_held_sales') || '[]');
         if (!Array.isArray(saved)) throw new Error('Invalid held sales');
         setHeldSales(saved.filter(sale => sale && typeof sale.id === 'string' && Array.isArray(sale.items)));
      } catch { showToast('Held sales could not be read. Saved data has been preserved.', 'error'); }
   };

   const handleHoldSale = () => {
      if (cart.length === 0) return;
      setHoldNote('');
      setIsHoldModalOpen(true);
   };

   const [activeHeldSaleId, setActiveHeldSaleId] = useState<string | null>(null);

   const confirmHoldSale = () => {
      const newHeldSale = {
         id: activeHeldSaleId || crypto.randomUUID(),
         items: cart,
         pricingMode,
         checkoutForm,
         saleType,
         paymentReference,
         customerName: checkoutForm.customerName || 'Walk-in',
         timestamp: Date.now(),
         total,
         notes: holdNote
      };
      const updated = [newHeldSale, ...heldSales.filter(s => s.id !== activeHeldSaleId)];
      try { localStorage.setItem('sna_held_sales', JSON.stringify(updated)); }
      catch { showToast('Could not hold this sale. The cart has been kept.', 'error'); return; }
      setHeldSales(updated);
      setCart([]);
      setSaleType('Cash sale');
      setActiveHeldSaleId(null);
      saleIdRef.current = crypto.randomUUID();
      setPaymentReference('');
      setCheckoutForm({ amountPaid: 0, paymentMethod: 'Cash', customerName: '', customerPhone: '', discountPercentage: 0 });
      setIsHoldModalOpen(false);
      showToast("Sale put on hold", 'info');
      window.dispatchEvent(new Event('storage'));
   };

   const handleResumeSale = (heldSale: any) => {
      try { validateItems(heldSale.items); calculateSaleTotals(heldSale.items, heldSale.checkoutForm?.discountPercentage || 0); }
      catch { showToast('This held sale contains invalid items. It has not been changed.', 'error'); return; }
      if (cart.length > 0 && !confirm("Current cart will be cleared. Continue?")) return;
      skipReprice.current = heldSale.pricingMode !== pricingMode;
      saleIdRef.current = `held-${heldSale.id}`;
      setPaymentReference(heldSale.paymentReference || '');
      setSaleType(heldSale.saleType || 'Cash sale');
      setCart(heldSale.items);
      setPricingMode(heldSale.pricingMode);

      // Initialize checkout form with held data
      setCheckoutForm({
         amountPaid: heldSale.saleType === 'Partial sale' ? (heldSale.checkoutForm?.amountPaid || 0) : 0,
         customerName: heldSale.customerName === 'Walk-in' ? '' : heldSale.customerName,
         customerPhone: heldSale.checkoutForm?.customerPhone || '',
         discountPercentage: heldSale.checkoutForm?.discountPercentage || 0,
         paymentMethod: heldSale.checkoutForm?.paymentMethod || 'Cash'
      });
      setHasManuallyAdjustedPayment(false);

      setActiveHeldSaleId(heldSale.id);
      setIsHeldSalesModalOpen(false);
      showToast("Sale resumed", 'success');

      // Immediately open checkout to complete the sale
      setIsCheckoutOpen(true);
   };

   const deleteHeldSale = (id: string) => {
      const updated = heldSales.filter(s => s.id !== id);
      setHeldSales(updated);
      localStorage.setItem('sna_held_sales', JSON.stringify(updated));
      window.dispatchEvent(new Event('storage'));
   };

   const fetchData = async () => {
      setLoading(true);
      setDataError(false);
      try {
      const [p, s, sets, cust] = await Promise.all([
         db.products.toArray(),
         db.sales.toArray(),
         db.settings.toCollection().first(),
         db.customers.toArray()
      ]);

      const cats = new Set(p.map(prod => prod.category || 'General'));
      setCategories(['All', ...Array.from(cats).sort()]);
      setProducts(p);
      setCustomers(cust);
      setSettings(sets || null);
      setSalesHistory(s.sort((a, b) => b.timestamp - a.timestamp));
      } catch { setDataError(true); showToast('Could not refresh sales and stock. Please retry.', 'error'); }
      finally { setLoading(false); }
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
      if (skipReprice.current) { skipReprice.current = false; return; }
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

   useEffect(() => {
      if (salesHistory.length > 0) {
         const saleIdToView = sessionStorage.getItem('sna_view_receipt_for_id');
         if (saleIdToView) {
            sessionStorage.removeItem('sna_view_receipt_for_id');
            const sale = salesHistory.find(s => s.id === saleIdToView);
            if (sale) {
               setLastSale(sale);
               setIsReceiptOpen(true);
            }
         }
      }
   }, [salesHistory]);

   const cashiers = useMemo(() => {
      const list = new Set(salesHistory.map(s => s.cashierName));
      return ['All', ...Array.from(list)];
   }, [salesHistory]);

   const filteredProducts = useMemo(() => {
      return products.filter(p => {
         const matchesSearch = (p.name || '').toLowerCase().includes(searchTerm.trim().toLowerCase()) ||
            (p.sku || '').toLowerCase().includes(searchTerm.trim().toLowerCase());
         const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
         return matchesSearch && matchesCategory;
      });
   }, [products, searchTerm, selectedCategory]);

   const filteredHistory = useMemo(() => {
      const lowercasedTerm = historySearchTerm.toLowerCase();
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

         const matchesSearch = historySearchTerm.trim() === '' ||
            s.receiptNo.toLowerCase().includes(lowercasedTerm) ||
            (s.customerName && s.customerName.toLowerCase().includes(lowercasedTerm)) ||
            s.items.some(item => item.name.toLowerCase().includes(lowercasedTerm));

         return (saleTypeFilter === 'All' || getSaleType(s) === saleTypeFilter) && matchesDate && matchesCashier && matchesCategory && matchesPaymentMethod && matchesSearch;
      });
   }, [saleTypeFilter, salesHistory, reportStartDate, reportEndDate, reportCashier, reportCategory, reportPaymentMethod, products, historySearchTerm]);

   const reportData = useMemo(() => {
      const salesWithProfit = filteredHistory.map(sale => {
         const cost = sale.items.reduce((acc, item) => {
            const product = products.find(p => p.id === item.productId);
            return acc + (item.costPrice ?? product?.costPrice ?? 0) * item.quantity;
         }, 0);
         const profit = money(sale.total - (sale.tax || 0) - cost);
         return { ...sale, profit };
      });

      const revenue = salesWithProfit.reduce((sum, s) => sum + s.total, 0);
      const profit = salesWithProfit.reduce((sum, s) => sum + s.profit, 0);
      const count = salesWithProfit.length;
      const avgTicket = count > 0 ? revenue / count : 0;

      const totalPages = Math.max(1, Math.ceil(count / HISTORY_ITEMS_PER_PAGE));
      const startIndex = (historyPage - 1) * HISTORY_ITEMS_PER_PAGE;
      const paginatedSales = salesWithProfit.slice(startIndex, startIndex + HISTORY_ITEMS_PER_PAGE);

      return {
         totals: { revenue, count, avgTicket, profit },
         paginatedSales,
         totalPages
      };
   }, [filteredHistory, products, historyPage]);
   useEffect(() => { setHistoryPage(page => Math.min(page, reportData.totalPages)); }, [reportData.totalPages]);

   // Reset page on filter change
   useEffect(() => {
      setHistoryPage(1);
      setStatementCurrentPage(1);
   }, [saleTypeFilter, reportStartDate, reportEndDate, reportCategory, reportCashier, reportPaymentMethod, historySearchTerm]);

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
         (c.name || '').toLowerCase().includes(term) ||
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

   const clearCart = () => {
      if (cart.length && !confirm('Clear all items from this cart?')) return;
      setCart([]);
      setSaleType('Cash sale');
      setActiveHeldSaleId(null);
      saleIdRef.current = crypto.randomUUID();
      setPaymentReference('');
      setCheckoutForm({ amountPaid: 0, paymentMethod: 'Cash', customerName: '', customerPhone: '', discountPercentage: 0 });
   };

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
      try { validateItems([{ ...editingCartItem.item, ...editItemForm }]); }
      catch (error) { showToast((error as Error).message, 'error'); return; }
      if (!settings?.enableNegativeStock && editItemForm.quantity > product.stockQuantity) {
         showToast(`Only ${product.stockQuantity} units are available.`, 'error'); return;
      }
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

   const { subtotal, discount: totalDiscount, tax, total } = calculateSaleTotals(
      cart, checkoutForm.discountPercentage || 0, settings?.taxEnabled ? (settings.taxPercentage ?? 18) : 0
   );

   const handleCheckout = () => { // This now opens the pricing selection modal first
      if (cart.length === 0) return;

      setHasManuallyAdjustedPayment(false);
      setStagedPricingMode(pricingMode); // Set initial mode for the dropdown
      setIsSelectPricingModalOpen(true); // Open the first modal
   };

   const handlePricingModeSelected = (mode: 'Retail' | 'Wholesale' | 'Middle Man') => {
      setPricingMode(mode);
      setIsSelectPricingModalOpen(false); // Close first modal

      setHasManuallyAdjustedPayment(false);
      setShowCustomerResults(false);
      setIsCreatingCustomer(false);
      setIsCheckoutOpen(true);
   }; // Open second modal

   // Sync amount paid with total when checkout opens or total changes
   useEffect(() => {
      if (isCheckoutOpen && !hasManuallyAdjustedPayment && saleType !== 'Partial sale') {
         setCheckoutForm(prev => ({ ...prev, amountPaid: saleType === 'Debt' ? 0 : total }));
      }
   }, [isCheckoutOpen, total, hasManuallyAdjustedPayment, saleType]);

   const validateCheckout = () => {
      validateItems(cart);
      for (const item of cart) {
         if (products.find(product => product.id === item.productId)?.type === ProductType.PHONE) validateImeis(itemImeis(item), item.quantity);
      }
      validatePayment(total, checkoutForm.amountPaid, checkoutForm.paymentMethod, saleType);
      if (loading || dataError) throw new Error('Refresh the product list before completing this sale.');
      const customer = customers.find(c => c.name === checkoutForm.customerName && c.phone === checkoutForm.customerPhone);
      if (!customer?.id || !customer.phone?.trim()) throw new Error('Select a customer with a phone number before completing the sale.');
      if (customer?.status === CustomerStatus.BLACKLISTED) throw new Error('This customer is blacklisted. Select another customer.');
   };

   const handleInitiateConfirm = () => {
      try { validateCheckout(); setIsConfirmSaleModalOpen(true); }
      catch (error) { showToast((error as Error).message, 'error'); }
   };

   const collectPayment = async (event: React.FormEvent) => {
      event.preventDefault();
      if (!paymentSale?.id || collectionLock.current) return;
      collectionLock.current = true;
      setCollecting(true);
      try {
         if (!confirm(`Record UGX ${collectionForm.amount.toLocaleString()} against ${paymentSale.receiptNo}?`)) return;
         const updated = await db.recordSalePayment(paymentSale.id, {
            id: collectionId.current, amount: collectionForm.amount, method: collectionForm.method,
            reference: collectionForm.reference.trim(), timestamp: Date.now(), user: user.username
         });
         setSalesHistory(previous => previous.map(sale => sale.id === updated.id ? updated : sale));
         setLastSale(updated);
         setPaymentSale(null);
         setIsReceiptOpen(true);
         showToast('Payment recorded successfully.', 'success');
      } catch (error) { showToast(error instanceof Error ? error.message : 'Could not record payment.', 'error'); }
      finally { collectionLock.current = false; setCollecting(false); }
   };

   const processPayment = async () => {
      if (paymentLock.current) return;
      try { validateCheckout(); }
      catch (error) { showToast((error as Error).message, 'error'); return; }
      paymentLock.current = true;
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
            id: activeHeldSaleId ? `held-${activeHeldSaleId}` : saleIdRef.current,
            receiptNo: `${settings?.invoicePrefix || 'INV'}-${Date.now()}-${saleIdRef.current.slice(0, 8)}`,
            taxPercentage: settings?.taxEnabled ? (settings.taxPercentage ?? 18) : 0,
            paymentReference: checkoutForm.paymentMethod === 'Cash' ? '' : paymentReference.trim(),
            customerId: customers.find(c => c.name === checkoutForm.customerName && c.phone === checkoutForm.customerPhone)?.id,
            saleType,
            items: cartWithWarranty,
            subtotal,
            tax,
            discount: totalDiscount,
            total,
            amountPaid: checkoutForm.amountPaid,
            balance: Math.max(0, total - checkoutForm.amountPaid),
            paymentMethod: checkoutForm.paymentMethod,
            customerName: checkoutForm.customerName,
            customerPhone: checkoutForm.customerPhone,
            customerType: pricingMode,
            globalDiscountPercentage: checkoutForm.discountPercentage,
            cashierName: user.username,
            timestamp: Date.now(),
            wasHeld: !!activeHeldSaleId // Mark as held sale
         };

         const result = await db.commitSale(sale, !!settings?.enableNegativeStock);
         // The transaction is committed. Receipt delivery or refresh failures must not report a failed payment.
         if (activeHeldSaleId) {
            try { deleteHeldSale(activeHeldSaleId); }
            catch { showToast('Sale saved; the local held-sale list could not be cleared.', 'info'); }
            setActiveHeldSaleId(null);
         }
         setLastSale(result);
         setSalesHistory(prev => [result, ...prev.filter(s => s.id !== result.id)]);
         saleIdRef.current = crypto.randomUUID();
         setPaymentReference('');
         setIsCheckoutOpen(false);
         setIsConfirmSaleModalOpen(false);
         setCart([]);
      setSaleType('Cash sale');
         setCheckoutForm({
            amountPaid: 0,
            paymentMethod: 'Cash',
            customerName: '',
            customerPhone: '',
            discountPercentage: 0
         });

         // Auto Print or Open Receipt
         setIsReceiptOpen(true);
         showToast("Sale completed successfully", 'success');
         void fetchData();

      } catch (e) {
         console.error(e);
         showToast(e instanceof Error ? e.message : 'Transaction failed. Please retry.', 'error');
      } finally {
         paymentLock.current = false;
         setProcessingPayment(false);
      }
   };

   const handleSelectCustomer = (c: any) => {
      if (c.status === CustomerStatus.BLACKLISTED) return showToast('This customer is blacklisted.', 'error');
      setCheckoutForm(prev => ({
         ...prev,
         customerName: c.name,
         customerPhone: c.phone || ''
      }));
      setCustomerSearch(c.name);
      setShowCustomerResults(false);
   };

   const handleCreateCustomer = async () => {
      if (customerLock.current) return;
      if (!newCustomerForm.name.trim() || !normalizeCustomerPhone(newCustomerForm.phone)) return showToast('Enter a customer name and phone number.', 'error');
      if (customers.some(c => normalizeCustomerPhone(c.phone) === normalizeCustomerPhone(newCustomerForm.phone))) return showToast('A customer with this phone already exists.', 'error');
      customerLock.current = true;

      try {
         const newC = await db.customers.add({
            ...newCustomerForm,
            name: newCustomerForm.name.trim(),
            phone: newCustomerForm.phone.trim(),
            status: CustomerStatus.ACTIVE,
            category: CustomerCategory.RETAIL,
            joinedDate: Date.now()
         });
         const createdCustomer = newC;

         setCustomers(prev => [...prev, createdCustomer]);
         handleSelectCustomer(createdCustomer);
         setIsCreatingCustomer(false);
         showToast("Customer created & selected", 'success');
      } catch (e) {
         showToast("Failed to create customer", 'error');
      } finally { customerLock.current = false; }
   };

   // --- ADMIN ACTIONS (EDIT / DELETE) ---

   const confirmDeleteSale = async () => {
      if (!saleToDelete?.id || adminLock.current || user.role !== UserRole.ADMIN) return;
      adminLock.current = true;
      setIsDeleting(true);
      try {
         await db.deleteSale(saleToDelete.id, user.username);
         setSalesHistory(prev => prev.filter(s => s.id !== saleToDelete.id));
         setSaleToDelete(null);

         // Refresh products to show restored stock
         void fetchData();
         showToast("Sale record deleted", 'success');
      } catch (e) {
         console.error("Delete Error:", e);
         showToast("Failed to delete sale record.", 'error');
      } finally {
         adminLock.current = false;
         setIsDeleting(false);
      }
   };

   const handleUpdateSale = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!saleToEdit?.id || adminLock.current || user.role !== UserRole.ADMIN) return;
      adminLock.current = true;

      setIsUpdating(true);
      try {
         const originalSale = salesHistory.find(s => s.id === saleToEdit.id);
         if (!originalSale) throw new Error('Original sale is unavailable. Refresh sales history.');
         validateItems(saleToEdit.items);
         if (!saleToEdit.customerId) throw new Error('Select a customer before saving this sale.');
         if (!confirm(`Update ${saleToEdit.receiptNo}?\nItems: ${saleToEdit.items.reduce((sum, item) => sum + item.quantity, 0)}\nTotal: UGX ${saleToEdit.total.toLocaleString()}\nOutstanding: UGX ${outstandingAmount(saleToEdit).toLocaleString()}\nStock will be adjusted to match.`)) return;
         const net = originalSale.items.reduce((sum, item) => sum + item.price * item.quantity, 0) * (1 - (originalSale.globalDiscountPercentage || 0) / 100);
         const taxRate = originalSale.taxPercentage ?? (net > 0 ? (originalSale.tax || 0) / net * 100 : 0);
         const updatedSale = await db.commitSale({ ...saleToEdit, taxPercentage: taxRate }, !!settings?.enableNegativeStock, 'edit', user.username);
         // Update local state
         setSalesHistory(prev => prev.map(s => s.id === saleToEdit.id ? updatedSale : s));
         setIsEditModalOpen(false);
         setSaleToEdit(null);

         // Refresh products
         void fetchData();
         showToast("Sale updated successfully", 'success');

      } catch (e) {
         console.error("Update Error:", e);
         showToast(e instanceof Error ? e.message : 'Failed to update sale record.', 'error');
      } finally {
         adminLock.current = false;
         setIsUpdating(false);
      }
   };

   const updateEditItem = (index: number, field: 'quantity' | 'price', value: number) => {
      if (!saleToEdit) return;
      if (!Number.isFinite(value) || value < 0 || (field === 'quantity' && (!Number.isInteger(value) || value < 1))) return;

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

      recalculateEditedSale(newItems);
   };

   const recalculateEditedSale = (newItems: SaleItem[]) => {
      if (!saleToEdit) return;
      const original = salesHistory.find(s => s.id === saleToEdit.id) || saleToEdit;
      const net = original.items.reduce((sum, i) => sum + i.price * i.quantity, 0) * (1 - (original.globalDiscountPercentage || 0) / 100);
      const taxRate = original.taxPercentage ?? (net > 0 ? (original.tax || 0) / net * 100 : 0);
      const totals = calculateSaleTotals(newItems, saleToEdit.globalDiscountPercentage || 0, taxRate);
      setSaleToEdit({ ...saleToEdit, items: newItems, ...totals, taxPercentage: taxRate, saleType: getSaleType({ total: totals.total, amountPaid: saleToEdit.amountPaid }), balance: outstandingAmount({ total: totals.total, amountPaid: saleToEdit.amountPaid }) });
   };

   const downloadCSV = () => {
      if (filteredHistory.length === 0) return showToast("No data to export", 'info');
      const headers = ['Receipt No', 'Date', 'Time', 'Cashier', 'Customer', 'Items', 'Payment Method', 'Sale Type', 'Paid (UGX)', 'Outstanding (UGX)', 'Total (UGX)'];
      const rows = filteredHistory.map(s => [
         s.receiptNo,
         new Date(s.timestamp).toLocaleDateString(),
         new Date(s.timestamp).toLocaleTimeString(),
         s.cashierName,
         s.customerName || '',
         s.items.map(i => `${i.name} (x${i.quantity})`).join(', '),
         s.paymentMethod,
         getSaleType(s),
         s.amountPaid,
         outstandingAmount(s),
         s.total
      ]);
      const csvContent = [headers, ...rows].map(row => row.map(escapeCustomerCSVCell).join(',')).join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Sales_Report_${reportStartDate}_to_${reportEndDate}.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
   };

   const handleEmailReceipt = () => {
      if (!lastSale) return;

      const customer = customers.find(c => c.name === lastSale.customerName);
      const email = customer?.email || '';

      const subject = `Receipt #${lastSale.receiptNo} - ${settings?.businessName || 'SNA SHOP'}`;
      const body = `Here is your receipt from ${settings?.businessName || 'SNA SHOP'}.\n\nReceipt No: ${lastSale.receiptNo}\nDate: ${new Date(lastSale.timestamp).toLocaleDateString()}\nSale type: ${getSaleType(lastSale)}\nTotal: UGX ${lastSale.total.toLocaleString()}\nPaid: UGX ${lastSale.amountPaid.toLocaleString()}\nOutstanding: UGX ${outstandingAmount(lastSale).toLocaleString()}\n\nThank you for your business!`;

      window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      showToast("Opening email client...", 'info');
   };

   const handleSendReceiptWhatsApp = () => {
      if (!lastSale) return;
      const businessName = settings?.businessName || 'SNA Mobile Shop';
      const total = lastSale.total.toLocaleString();
      const receiptNo = lastSale.receiptNo;

      let message = `*Receipt from ${businessName}*\n\n`;
      message += `*Receipt No:* ${receiptNo}\n`;
      message += `*Date:* ${new Date(lastSale.timestamp).toLocaleDateString()}\n`;
      message += `*Total:* ${total} UGX\n\n`;
      message += `*Sale type:* ${getSaleType(lastSale)}\n*Paid:* ${lastSale.amountPaid.toLocaleString()} UGX\n*Outstanding:* ${outstandingAmount(lastSale).toLocaleString()} UGX\n\n`;
      message += `*Items:*\n`;
      lastSale.items.forEach(item => {
         message += `• ${item.name} (x${item.quantity}) - ${item.total.toLocaleString()} UGX\n`;
      });
      message += `\nThank you for shopping with us!`;

      const encodedMessage = encodeURIComponent(message);
      const phone = lastSale.customerPhone?.replace(/\D/g, '') || '';
      window.open(`https://wa.me/${phone}?text=${encodedMessage}`, '_blank');
   };

   const getProductIcon = (type: ProductType) => {
      switch (type) {
         case ProductType.PHONE: return <Smartphone size={24} strokeWidth={1.75} />;
         case ProductType.ACCESSORY: return <Headphones size={24} strokeWidth={1.75} />;
         case ProductType.SPARE_PART: return <Battery size={24} strokeWidth={1.75} />;
         default: return <Box size={24} strokeWidth={1.75} />;
      }
   };

   // --- RENDER HELPERS ---
   const imeiInput = (item: SaleItem, onChange: (imeis: string[]) => void) => products.find(product => product.id === item.productId)?.type === ProductType.PHONE ? (
      <label className="block text-xs mt-2">Phone IMEI(s) — required
         <textarea aria-label={`IMEIs for ${item.name}`} className="win-input mt-1 text-xs" rows={2} value={(item.imeis || itemImeis(item)).join('\n')} onChange={e => onChange(e.target.value.split('\n'))} placeholder={`Enter ${item.quantity} primary IMEI(s), one per phone`} />
         <span className="text-slate-500">Use the IMEI printed on each phone. Only registered, available units can be sold.</span>
      </label>
   ) : null;

   const openSaleEdit = (sale: Sale) => {
      const candidates = customers.filter(customer => sale.customerPhone
         ? normalizeCustomerPhone(customer.phone) === normalizeCustomerPhone(sale.customerPhone)
         : !!sale.customerName && customer.name === sale.customerName);
      setSaleToEdit({ ...structuredClone(sale), customerId: sale.customerId || (candidates.length === 1 ? candidates[0].id : undefined) });
      setIsEditModalOpen(true);
   };

   const renderCatalog = () => (
      <div className="flex-1 flex flex-col min-w-0 bg-white rounded-3xl border border-slate-100  overflow-hidden h-full">
         {dataError && <div role="alert" className="p-3 bg-amber-50 text-amber-800 text-sm flex items-center justify-between gap-3">
            Stock and sales could not be refreshed.
            <button type="button" onClick={fetchData} className="underline font-semibold">Retry</button>
         </div>}
         {/* Search & Category Header */}
         <button type="button" className="px-4 py-2 text-sm text-left border-b border-slate-200 font-semibold" onClick={() => { setImeiLookupOpen(true); setImeiQuery(''); void fetchData(); }}>Find sold phone by IMEI</button>
         <div className="p-4 border-b border-slate-50 space-y-4 bg-white sticky top-0 z-10 ">
            <div className="flex gap-4">
               <div className="relative flex-1 group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                     <Search className="text-slate-400 group-focus-within:text-rose-500 transition-colors" size={20} strokeWidth={1.75} />
                  </div>
                  <input
                     ref={searchInputRef}
                     className="w-full pl-12 pr-12 h-14 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-rose-500/20 focus:bg-white transition-all  placeholder:text-slate-400"
                     placeholder="Scan barcode or type item name..."
                     value={searchTerm}
                     onChange={e => setSearchTerm(e.target.value)}
                     onKeyDown={e => {
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        const matches = products.filter(p => p.sku?.toLowerCase() === searchTerm.trim().toLowerCase());
                        const product = matches.length === 1 ? matches[0] : filteredProducts.length === 1 ? filteredProducts[0] : null;
                        if (product) { addToCart(product); setSearchTerm(''); }
                        else showToast('Scan an exact SKU or select a product from the results.', 'info');
                     }}
                     autoFocus
                  />
                  {searchTerm && (
                     <button
                        onClick={() => { setSearchTerm(''); searchInputRef.current?.focus(); }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-full"
                     >
                        <X size={18} strokeWidth={1.75} />
                     </button>
                  )}
               </div>
               <button
                  onClick={() => setIsHeldSalesModalOpen(true)}
                  className="relative p-4 bg-slate-900 text-white rounded-2xl hover:bg-black transition-all    flex items-center justify-center w-14 h-14"
                  title="Held Sales"
               >
                  <Pause size={24} strokeWidth={1.75} />
                  {heldSales.length > 0 && (
                     <span className="absolute -top-2 -right-2 w-6 h-6 bg-rose-500 text-white text-xs font-black flex items-center justify-center rounded-full border-2 border-white ">
                        {heldSales.length}
                     </span>
                  )}
               </button>
            </div>

            {/* Category Quick Filter */}
            {/* Category Quick Filter */}
            <div className="flex items-center gap-3 overflow-x-auto pb-2 pt-1 px-1 no-scrollbar mask-gradient-right">
               {categories.map(cat => (
                  <button
                     key={cat}
                     onClick={() => setSelectedCategory(cat)}
                     className={`px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wide whitespace-nowrap transition-all border  ${selectedCategory === cat
                        ? 'bg-slate-900 text-white border-slate-900  scale-105'
                        : 'bg-white text-slate-500 border-slate-100 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                  >
                     {cat}
                  </button>
               ))}
            </div>
         </div>

         {/* Product Grid */}
         <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
            {loading ? (
               <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4">
                  <Loader2 className="animate-spin text-rose-500" size={32} strokeWidth={1.75} />
                  <p className="text-xs font-black uppercase tracking-widest">Syncing Inventory...</p>
               </div>
            ) : filteredProducts.length === 0 ? (
               <div className="h-full flex flex-col items-center justify-center text-slate-300">
                  <div className="w-24 h-24 bg-white rounded-3xl  border border-slate-100 flex items-center justify-center mb-6">
                     <PackageSearch size={32} className="opacity-20 text-slate-900" strokeWidth={1.75} />
                  </div>
                  <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">No matches found</p>
                  <p className="text-xs font-light text-slate-400 mt-2">Try a different search or category</p>
               </div>
            ) : (
               <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
                  {filteredProducts.map(product => {
                     const isLowStock = product.stockQuantity <= 5;
                     const isOut = product.stockQuantity <= 0;

                     return (
                        <button
                           key={product.id}
                           onClick={() => addToCart(product)}
                           className="bg-white p-4 rounded-2xl border border-slate-100    transition-all text-left group flex flex-col justify-between h-[210px] relative overflow-hidden "
                        >
                           {isOut && (
                              <div className="absolute inset-0 bg-white/80 z-10 flex items-center justify-center backdrop-blur-[2px]">
                                 <span className="bg-rose-600 text-white text-xs font-black px-3 py-1.5 rounded-full uppercase tracking-widest ">Sold Out</span>
                              </div>
                           )}

                           <div>
                              <div className="flex justify-between items-start mb-3">
                                 <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center group-hover:bg-slate-900 group-hover:text-white transition-all duration-300 ">
                                    {getProductIcon(product.type)}
                                 </div>
                                 <div className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter border ${isOut ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                    isLowStock ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                       'bg-emerald-50 text-emerald-600 border-emerald-100'
                                    }`}>
                                    {product.stockQuantity} Left
                                 </div>
                              </div>
                              <h3 className="text-xs font-black text-slate-900 line-clamp-2 leading-snug group-hover:text-rose-600 transition-colors mb-1">{product.name}</h3>
                              <div className="flex items-center gap-1.5">
                                 <Tag size={14} className="text-slate-300" strokeWidth={1.75} />
                                 <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest truncate">
                                    {product.brand || 'Gen'} • {product.sku ? product.sku.substring(0, 8) : '---'}
                                 </p>
                              </div>
                           </div>

                           <div className="mt-3 pt-3 border-t border-slate-50 flex items-center justify-between">
                              <div>
                                 <p className="text-[11px] font-black text-slate-300 uppercase tracking-widest leading-none mb-0.5">Price</p>
                                 <p className="text-base font-black text-slate-900">
                                    <span className="text-xs text-slate-400 mr-0.5 font-normal">UGX</span>
                                    {product.selling_price.toLocaleString()}
                                 </p>
                              </div>
                              <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center    transition-transform">
                                 <Plus size={16} strokeWidth={1.75} />
                              </div>
                           </div>
                        </button>
                     );
                  })}
               </div>
            )}
         </div>
      </div>
   );

   return (
      <div className="flex flex-col lg:flex-row h-full gap-6 font-sans pb-20 lg:pb-0   duration-500">

         {/* LEFT: Product Catalog */}
         {renderCatalog()}

         {/* RIGHT: Cart & Checkout */}
         <div className="w-full lg:w-[400px] xl:w-[450px] bg-white rounded-3xl border border-slate-100  flex flex-col overflow-hidden shrink-0 h-full">
            {/* Cart Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white">
               <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center ">
                     <ShoppingCart size={20} strokeWidth={1.75} />
                  </div>
                  <div>
                     <h2 className="text-base font-bold text-slate-900 uppercase">Current Order</h2>
                     <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{cart.length} Items</p>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-tighter border ${pricingMode === 'Retail' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                           pricingMode === 'Wholesale' ? 'bg-purple-50 text-purple-600 border-purple-100' :
                              'bg-amber-50 text-amber-600 border-amber-100'
                           }`}>
                           {pricingMode}
                        </span>
                     </div>
                  </div>
               </div>

               <div className="flex items-center gap-1">
                  <button
                     onClick={handleHoldSale}
                     disabled={cart.length === 0 || loading || dataError || processingPayment}
                     className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all disabled:opacity-30"
                     title="Hold Sale"
                  >
                     <Pause size={18} strokeWidth={1.75} />
                  </button>
                  <button
                     onClick={clearCart}
                     className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                     title="Clear Cart"
                  >
                     <Trash2 size={18} strokeWidth={1.75} />
                  </button>
               </div>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
               {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300">
                     <ShoppingCart size={32} className="mb-4 opacity-10" strokeWidth={1.75} />
                     <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Cart is empty</p>
                     <p className="text-xs font-normal text-slate-400 mt-2">Add items to begin transaction</p>
                  </div>
               ) : (
                  cart.map((item, idx) => (
                     <div key={idx} className="bg-white p-3 rounded-xl border border-slate-100  flex items-center gap-4   group">
                        <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500 shrink-0">
                           {getProductIcon(products.find(p => p.id === item.productId)?.type || ProductType.OTHERS)}
                        </div>
                        <div className="flex-1 min-w-0">
                           <p className="text-xs font-bold text-slate-800 truncate">{item.name}</p>
                           {imeiInput(item, imeis => setCart(previous => previous.map((entry, index) => index === idx ? { ...entry, imeis } : entry)))}
                           <p className="text-xs font-bold text-slate-500">
                              {item.price.toLocaleString()}
                              {(item.originalPrice && item.originalPrice > item.price) && (
                                 <span className="text-emerald-600 ml-1 line-through text-[11px]">{item.originalPrice.toLocaleString()}</span>
                              )}
                           </p>
                        </div>
                        <div className="flex items-center gap-1 bg-slate-50 rounded-lg p-1" onClick={e => e.stopPropagation()}>
                           <button onClick={() => updateQuantity(item.productId, -1)} className="w-7 h-7 flex items-center justify-center bg-white rounded  text-slate-600 hover:text-red-500 disabled:opacity-50"><Minus size={14} strokeWidth={1.75} /></button>
                           <span className="text-sm font-bold w-8 text-center">{item.quantity}</span>
                           <button onClick={() => updateQuantity(item.productId, 1)} className="w-7 h-7 flex items-center justify-center bg-white rounded  text-slate-600 hover:text-emerald-500 disabled:opacity-50"><Plus size={14} strokeWidth={1.75} /></button>
                        </div>
                        <div className="text-right min-w-[70px]">
                           <p className="text-xs font-bold text-slate-900">{item.total.toLocaleString()}</p>
                           <div className="flex items-center justify-end gap-2 mt-1">
                              <button onClick={(e) => { e.stopPropagation(); openEditCartItem(item, idx); }} className="text-[10px] uppercase font-bold text-blue-600 hover:text-blue-700">Edit</button>
                              <button
                                 onClick={(e) => { e.stopPropagation(); removeFromCart(item.productId); }}
                                 className="text-slate-400 hover:text-rose-500 transition-colors p-1 hover:bg-rose-50 rounded"
                                 title="Remove Item"
                              >
                                 <Trash2 size={14} strokeWidth={1.75} />
                              </button>
                           </div>
                        </div>
                     </div>
                  ))
               )}
            </div>

            {/* Summary & Actions */}
            <div className="p-6 bg-white border-t border-slate-100  z-10 space-y-5">
               <div className="flex items-center gap-2 mb-1">
                  <Tag size={14} className="text-slate-400" strokeWidth={1.75} />
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Pricing: {pricingMode}</span>
               </div>
               <div className="space-y-2.5 mb-6">
                  <div className="flex justify-between text-xs font-normal text-slate-500">
                     <span>Subtotal</span>
                     <span className="font-bold">{subtotal.toLocaleString()}</span>
                  </div>
                  {totalDiscount > 0 && (
                     <div className="flex justify-between text-xs font-normal text-emerald-600">
                        <span>Discount Applied</span>
                        <span className="font-bold">-{totalDiscount.toLocaleString()}</span>
                     </div>
                  )}
                  {settings?.taxEnabled && (
                     <div className="flex justify-between text-xs font-normal text-slate-500">
                        <span>Tax ({settings.taxPercentage}%)</span>
                        <span className="font-bold">{tax.toLocaleString()}</span>
                     </div>
                  )}
                  <div className="flex justify-between items-baseline pt-4 border-t border-dashed border-slate-200">
                     <span className="text-sm font-black text-slate-900 uppercase tracking-wider">Total Payable</span>
                     <span className="text-3xl font-black text-emerald-600">
                        <span className="text-xs text-slate-400 mr-1 font-normal">UGX</span>
                        {total.toLocaleString()}
                     </span>
                  </div>
               </div>

               <div className="grid grid-cols-4 gap-2">
                  <button
                     onClick={() => setIsHistoryModalOpen(true)}
                     className="col-span-1 py-4 bg-slate-100 text-slate-500 rounded-2xl flex items-center justify-center hover:bg-slate-200 transition-colors"
                     title="Sales History & Reports"
                  >
                     <History size={20} strokeWidth={1.75} />
                  </button>
                  <button
                     disabled={cart.length === 0 || loading || dataError || processingPayment}
                     onClick={handleCheckout}
                     className="col-span-3 py-4 bg-emerald-600 text-white rounded-2xl text-sm font-black uppercase tracking-[3px]   hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed "
                  >
                     Charge <ChevronRight size={18} strokeWidth={1.75} />
                  </button>
               </div>
            </div>
         </div>

         {/* --- CHECKOUT MODAL --- */}
         <Modal
            isOpen={isCheckoutOpen}
            onClose={() => { if (!paymentLock.current) setIsCheckoutOpen(false); }}
            title="Checkout"
            maxWidth="lg"
            noPadding
         >
            {/* Checkout Content - Header removed as it is handled by Modal */}
            <div className="p-8 space-y-8">
               {/* Section 1: Order Summary */}
               <section className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                     <FileText size={16} className="text-slate-400" strokeWidth={1.75} />
                     <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Order Summary</h3>
                  </div>
                  <div className="text-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                     <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Amount Due</p>
                     <p className="text-4xl font-black text-slate-900 tracking-tighter">
                        <span className="text-lg text-slate-400 mr-1 align-top">UGX</span>
                        {total.toLocaleString()}
                     </p>
                  </div>
                  <div className="space-y-3">
                     <label className="text-xs font-bold text-slate-500 uppercase tracking-wide ml-1">Global Discount (%)</label>
                     <div className="relative">
                        <Percent className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} strokeWidth={1.75} />
                        <input
                           type="number"
                           min="0"
                           max="100"
                           className="w-full h-12 bg-slate-50 rounded-xl pl-12 pr-4 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200 transition-all"
                           placeholder="0"
                           value={checkoutForm.discountPercentage || ''}
                           onChange={e => {
                              const val = Math.min(100, Math.max(0, Number(e.target.value)));
                              setCheckoutForm(prev => ({ ...prev, discountPercentage: val }));
                           }}
                        />
                     </div>
                  </div>
               </section>

               <section className="space-y-2">
                  <label htmlFor="sale-type" className="win-label">Sale type</label>
                  <select id="sale-type" className="win-input" value={saleType} onChange={e => {
                     const selected = e.target.value as SaleType;
                     setSaleType(selected);
                     setHasManuallyAdjustedPayment(false);
                     setCheckoutForm(previous => ({ ...previous, amountPaid: selected === 'Cash sale' ? total : 0 }));
                  }}>
                     <option>Cash sale</option><option>Debt</option><option>Partial sale</option>
                  </select>
                  <p className="text-xs text-slate-500">{saleType === 'Cash sale' ? 'Paid in full using cash, mobile money or bank.' : saleType === 'Debt' ? 'No payment now. The full amount remains due.' : 'Enter the amount received now. The rest remains due.'}</p>
               </section>
               {/* Section 2: Payment */}
               <section className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                     <CreditCard size={16} className="text-slate-400" strokeWidth={1.75} />
                     <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Payment</h3>
                  </div>
                  <div className="space-y-3">
                     <label className="text-xs font-bold text-slate-500 uppercase tracking-wide ml-1">Payment Method</label>
                     <div className="grid grid-cols-3 gap-2">
                        {['Cash', 'Mobile Money', 'Bank'].map(m => (
                           <button
                              key={m}
                              type="button"
                              onClick={() => {
                                 setCheckoutForm(prev => ({ ...prev, paymentMethod: m as Sale['paymentMethod'] }));
                                 setHasManuallyAdjustedPayment(false);
                              }}
                              className={`py-3 rounded-xl text-xs font-bold border transition-all ${checkoutForm.paymentMethod === m
                                 ? 'bg-slate-900 text-white border-slate-900 '
                                 : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                                 }`}
                           >
                              {m}
                           </button>
                        ))}
                     </div>
                  </div>
                  <div className="space-y-3">
                     <label className="text-xs font-bold text-slate-500 uppercase tracking-wide ml-1">{checkoutForm.paymentMethod === 'Cash' ? 'Amount tendered' : 'Amount received'}</label>
                     <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">UGX</span>
                        <input
                           type="number"
                           autoFocus
                           min="0"
                           disabled={saleType === 'Debt'}
                           step="0.01"
                           className="w-full h-14 bg-slate-50 rounded-2xl pl-12 pr-4 text-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200 transition-all"
                           value={checkoutForm.amountPaid || ''}
                           onChange={e => {
                              setCheckoutForm(prev => ({ ...prev, amountPaid: Number(e.target.value) }));
                              setHasManuallyAdjustedPayment(true);
                           }}
                        />
                     </div>
                     {saleType === 'Cash sale' && <button type="button" className="text-sm text-slate-700 underline" onClick={() => { setCheckoutForm(prev => ({ ...prev, amountPaid: total })); setHasManuallyAdjustedPayment(false); }}>Use exact amount</button>}
                     {checkoutForm.amountPaid < total && <p role="status" className="text-sm text-amber-700">Remaining: UGX {money(total - checkoutForm.amountPaid).toLocaleString()}</p>}
                     {checkoutForm.paymentMethod !== 'Cash' && (
                        <label className="block text-sm text-slate-600">Payment reference (optional)
                           <input className="win-input mt-1" value={paymentReference} onChange={e => setPaymentReference(e.target.value)} placeholder="Transaction or bank reference" />
                        </label>
                     )}
                     {checkoutForm.amountPaid >= total && (
                        <div className="flex justify-between items-center px-4 py-2 bg-emerald-50 rounded-xl border border-emerald-100">
                           <span className="text-xs font-bold text-emerald-600 uppercase">Change Due</span>
                           <span className="text-lg font-black text-emerald-700">{(checkoutForm.amountPaid - total).toLocaleString()}</span>
                        </div>
                     )}
                  </div>
               </section>

               {/* Section 3: Customer */}
               <section className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                     <UserIcon size={16} className="text-slate-400" strokeWidth={1.75} />
                     <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Customer Details</h3>
                  </div>
                  <div className="flex justify-between items-center">
                     <label className="text-xs font-bold text-slate-500 uppercase tracking-wide ml-1">Customer Details</label>
                     {!isCreatingCustomer && (
                        <button onClick={() => setIsCreatingCustomer(true)} className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1">
                           <UserPlus size={14} strokeWidth={1.75} /> New Customer
                        </button>
                     )}
                  </div>

                  {!isCreatingCustomer ? (
                     <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} strokeWidth={1.75} />
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
                           <div className="absolute top-full left-0 right-0 bg-white border border-slate-100  rounded-xl mt-1 z-20 max-h-48 overflow-y-auto">
                              {filteredCustomers.map(c => (
                                 <button
                                    key={c.id}
                                    onClick={() => handleSelectCustomer(c)}
                                    className="w-full text-left px-4 py-2 hover:bg-slate-50 border-b border-slate-50 last:border-0"
                                 >
                                    <p className="text-xs font-bold text-slate-800">{c.name}</p>
                                    <div className="flex gap-2 text-xs text-slate-400">
                                       {c.phone && <span>{c.phone}</span>}
                                       {c.address && <span>• {c.address}</span>}
                                    </div>
                                 </button>
                              ))}
                              {filteredCustomers.length === 0 && (
                                 <div className="p-3 text-center">
                                    <p className="text-xs text-slate-400 mb-2">No customer found</p>
                                    <button onClick={() => setIsCreatingCustomer(true)} className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold uppercase">Create New</button>
                                 </div>
                              )}
                           </div>
                        )}
                     </div>
                  ) : (
                     <div className="bg-slate-50 p-4 rounded-2xl space-y-4   border border-slate-100">
                        <div className="flex justify-between items-center mb-1">
                           <div className="flex items-center gap-2">
                              <UserPlus size={16} className="text-blue-600" strokeWidth={1.75} />
                              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">New Customer Profile</span>
                           </div>
                           <button onClick={() => setIsCreatingCustomer(false)} className="text-xs text-red-500 hover:underline font-bold">Cancel</button>
                        </div>

                        <div className="space-y-3">
                           <div className="relative">
                              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} strokeWidth={1.75} />
                              <input
                                 className="w-full h-10 bg-white border border-slate-200 rounded-xl pl-9 pr-4 text-xs font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50 transition-all"
                                 placeholder="Full Name (Required)"
                                 value={newCustomerForm.name}
                                 onChange={e => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
                              />
                           </div>

                           <div className="grid grid-cols-2 gap-3">
                              <div className="relative">
                                 <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} strokeWidth={1.75} />
                                 <input
                                    className="w-full h-10 bg-white border border-slate-200 rounded-xl pl-9 pr-4 text-xs font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50 transition-all"
                                    placeholder="Phone"
                                    value={newCustomerForm.phone}
                                    onChange={e => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })}
                                 />
                              </div>
                              <div className="relative">
                                 <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} strokeWidth={1.75} />
                                 <input
                                    className="w-full h-10 bg-white border border-slate-200 rounded-xl pl-9 pr-4 text-xs font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50 transition-all"
                                    placeholder="Email"
                                    value={newCustomerForm.email}
                                    onChange={e => setNewCustomerForm({ ...newCustomerForm, email: e.target.value })}
                                 />
                              </div>
                           </div>

                           <div className="relative">
                              <MapPin className="absolute left-3 top-3 text-slate-400" size={14} strokeWidth={1.75} />
                              <textarea
                                 className="w-full h-16 bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50 transition-all resize-none"
                                 placeholder="Physical Address"
                                 value={newCustomerForm.address}
                                 onChange={e => setNewCustomerForm({ ...newCustomerForm, address: e.target.value })}
                              />
                           </div>
                        </div>

                        <button onClick={handleCreateCustomer} className="w-full py-3 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all   flex items-center justify-center gap-2">
                           <Check size={16} strokeWidth={1.75} /> Save & Select
                        </button>
                     </div>
                  )}

                  {/* Selected Customer Display */}
                  {checkoutForm.customerName && !isCreatingCustomer && (
                     <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg border border-blue-100">
                        <UserIcon size={14} strokeWidth={1.75} />
                        <div className="flex-1 min-w-0">
                           <p className="text-xs font-bold truncate">{checkoutForm.customerName}</p>
                           {checkoutForm.customerPhone && <p className="text-xs opacity-80">{checkoutForm.customerPhone}</p>}
                        </div>
                        <button onClick={() => { setCheckoutForm(prev => ({ ...prev, customerName: '', customerPhone: '' })); setCustomerSearch(''); }} className="p-1 hover:bg-blue-100 rounded">
                           <X size={14} strokeWidth={1.75} />
                        </button>
                     </div>
                  )}
               </section>

               <button
                  onClick={handleInitiateConfirm}
                  disabled={processingPayment || cart.length === 0 || !checkoutForm.customerName || !checkoutForm.customerPhone}
                  className="w-full py-4 bg-emerald-600 text-white rounded-2xl text-xs font-black uppercase tracking-[3px]   hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 "
               >
                  {processingPayment ? <Loader2 className="animate-spin" strokeWidth={1.75} /> : <Check size={20} strokeWidth={1.75} />}
                  Complete Sale
               </button>
            </div>
         </Modal>


         {/* --- CONFIRM SALE MODAL --- */}
         <Modal
            isOpen={isConfirmSaleModalOpen}
            onClose={() => { if (!paymentLock.current) setIsConfirmSaleModalOpen(false); }}
            title="Confirm Transaction"
            maxWidth="md"
            noPadding
         >
            <div className="p-8 space-y-6">
               <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
                  <div className="flex justify-between items-baseline">
                     <span className="text-sm font-bold text-slate-500 uppercase">Total Payable</span>
                     <span className="text-2xl font-black text-slate-900">{total.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                     <span className="text-sm font-bold text-slate-500 uppercase">Amount Tendered</span>
                     <span className="text-2xl font-black text-slate-900">{checkoutForm.amountPaid.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-baseline pt-4 border-t border-dashed border-slate-200">
                     <span className="text-sm font-bold text-emerald-600 uppercase">{checkoutForm.amountPaid < total ? 'Outstanding balance' : 'Change due'}</span>
                     <span className="text-3xl font-black text-emerald-600">{money(Math.abs(checkoutForm.amountPaid - total)).toLocaleString()}</span>
                  </div>
               </div>
               <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setIsConfirmSaleModalOpen(false)} disabled={processingPayment} className="py-4 bg-slate-100 text-slate-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
                  <button onClick={processPayment} disabled={processingPayment} className="py-4 bg-emerald-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest   hover:bg-emerald-700 transition-all flex items-center justify-center gap-2">
                     {processingPayment ? <Loader2 className="animate-spin" size={14} strokeWidth={1.75} /> : null} {processingPayment ? 'Processing...' : 'Confirm Sale'}
                  </button>
               </div>
            </div>
         </Modal>

         {/* --- EDIT CART ITEM MODAL --- */}
         {
            editingCartItem && (
               <Modal
                  isOpen={!!editingCartItem}
                  onClose={() => setEditingCartItem(null)}
                  title="Adjust Item"
                  maxWidth="sm"
                  noPadding
               >
                  <div className="p-6 space-y-4">
                     <div>
                        <p className="text-xs font-bold text-slate-500 uppercase mb-1">Product</p>
                        <p className="font-bold text-slate-900">{editingCartItem.item.name}</p>
                        <p className="text-xs text-slate-400">
                           Preferred: {(editingCartItem.item.originalPrice || editingCartItem.item.price).toLocaleString()} |
                           Min: {(pricingMode === 'Retail' ? editingCartItem.product.minSellingPrice : editingCartItem.product.costPrice)?.toLocaleString() || 0}
                        </p>
                     </div>

                     <div className="grid grid-cols-2 gap-4">
                        <div>
                           <label className="text-xs font-bold text-slate-400 uppercase">Unit Price</label>
                           <input
                              type="number"
                              className="w-full h-10 border border-slate-200 rounded-lg px-3 font-bold text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                              value={editItemForm.price}
                              onChange={e => setEditItemForm({ ...editItemForm, price: Number(e.target.value) })}
                           />
                        </div>
                        <div>
                           <label className="text-xs font-bold text-slate-400 uppercase">Quantity</label>
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
               </Modal>
            )
         }

         {/* --- RECEIPT MODAL --- */}
         {/* --- RECEIPT MODAL --- */}
         {isReceiptOpen && lastSale && (
            <Modal
               isOpen={isReceiptOpen}
               onClose={() => setIsReceiptOpen(false)}
               maxWidth="sm"
               noPadding
               contentClassName="flex-1 flex flex-col min-h-0"
            >
               <div className="p-4 border-b border-slate-100 flex justify-between items-center no-print shrink-0">
                  <h3 className="text-sm font-bold text-slate-900 uppercase">Receipt Preview</h3>
                  <div className="flex gap-2 items-center">
                     <button
                        onClick={() => setPrintConfig(c => ({ ...c, showLogo: !c.showLogo }))}
                        className={`px-3 py-1 rounded-lg border text-xs font-bold uppercase transition-all ${printConfig.showLogo ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-400 border-slate-200'}`}
                     >
                        Logo {printConfig.showLogo ? 'ON' : 'OFF'}
                     </button>
                     <button onClick={() => setIsReceiptOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 rounded-lg"><X size={18} strokeWidth={1.75} /></button>
                  </div>
               </div>

               <div className="flex-1 overflow-y-auto p-4 bg-slate-200 flex justify-center custom-scrollbar">
                  <div
                     id="pos-receipt"
                     className={`receipt-mode bg-white p-4  text-black ${settings?.receiptFont === 'sans' ? 'font-sans' :
                        settings?.receiptFont === 'serif' ? 'font-serif' : 'font-mono'
                        } w-full max-w-[80mm] min-h-[100mm]`}
                     style={{
                        fontSize: `${settings?.receiptFontSize || 11}px`,
                        lineHeight: settings?.receiptLineHeight || 1.3
                     }}>
                     {/* Header Section */}
                     <div className="text-center mb-4">
                        {printConfig.showLogo && (
                           <img src={SnaiLogo} className="h-16 mx-auto mb-2 object-contain" alt="Logo" />
                        )}
                        <h2 className="font-bold text-sm uppercase whitespace-pre-wrap">{settings?.receiptHeader || settings?.businessName || 'SNA! MOBILE SHOP'}</h2>
                        <p className="text-xs font-bold whitespace-pre-wrap">{settings?.address || 'KYAZANGA OPP STABEX PETROL STATION'}</p>
                        <p className="text-xs font-bold">Tel: {settings?.phone || '+256 756337888 | +256 778413197'}</p>
                        <div className="flex justify-center gap-4 mt-1 text-[11px] border-t border-b border-black/10 py-1">
                           <span>Date: {new Date(lastSale.timestamp).toLocaleDateString()}</span>
                           <span>Time: {new Date(lastSale.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="text-[11px] mt-1">Receipt #: {lastSale.receiptNo}</p>
                        <p className="text-[11px]">Server: {lastSale.cashierName}</p>
                        <p className="text-xs">Sale type: {getSaleType(lastSale)}</p>
                        {lastSale.customerName && <p className="text-[11px]">Customer: {lastSale.customerName}</p>}
                     </div>

                     {/* Items Table */}
                     <div className="mb-4">
                        <table className="w-full text-left">
                           <thead>
                              <tr className="border-b border-black">
                                 <th className="py-1 text-[11px] font-bold uppercase w-[45%]">Item</th>
                                 <th className="py-1 text-[11px] font-bold uppercase text-center w-[15%]">Qty</th>
                                 <th className="py-1 text-[11px] font-bold uppercase text-right w-[20%]">Price</th>
                                 <th className="py-1 text-[11px] font-bold uppercase text-right w-[20%]">Total</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-black/10">
                              {lastSale.items.map((item, idx) => (
                                 <tr key={idx}>
                                    <td className="py-1 text-[11px] font-bold leading-tight pr-1">
                                       {item.name}
                                       {itemImeis(item).length > 0 && <div className="text-xs break-all">IMEI: {itemImeis(item).join(', ')}</div>}
                                    </td>
                                    <td className="py-1 text-[11px] text-center font-bold align-top">
                                       {item.quantity}
                                    </td>
                                    <td className="py-1 text-[11px] text-right align-top">
                                       {item.price.toLocaleString()}
                                    </td>
                                    <td className="py-1 text-[11px] text-right font-bold align-top">
                                       {item.total.toLocaleString()}
                                    </td>
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                     </div>

                     {/* Totals Section */}
                     <div className="border-t border-black mb-4 pt-2 space-y-1">
                        <div className="flex justify-between text-xs">
                           <span>Subtotal:</span>
                           <span>{lastSale.subtotal.toLocaleString()}</span>
                        </div>
                        {lastSale.discount > 0 && (
                           <div className="flex justify-between text-xs">
                              <span>Discount:</span>
                              <span>-{lastSale.discount.toLocaleString()}</span>
                           </div>
                        )}
                        {!!lastSale.tax && <div className="flex justify-between text-xs"><span>Tax:</span><span>{lastSale.tax.toLocaleString()}</span></div>}
                        <div className="flex justify-between text-xs font-black border-t border-black pt-1 mt-1 border-dashed">
                           <span>TOTAL:</span>
                           <span>UGX {lastSale.total.toLocaleString()}</span>
                        </div>
                        {/* Payment Info */}
                        <div className="flex justify-between text-sm font-semibold"><span>Outstanding:</span><span>UGX {outstandingAmount(lastSale).toLocaleString()}</span></div>
                        {!!lastSale.payments?.length && <div className="text-xs space-y-1">
                           <p>Initial payment ({lastSale.paymentMethod}): UGX {money(lastSale.amountPaid - lastSale.payments.reduce((sum, payment) => sum + payment.amount, 0)).toLocaleString()}</p>
                           <p className="font-semibold">Subsequent payments</p>
                           {lastSale.payments.map(payment => <p key={payment.id}>{new Date(payment.timestamp).toLocaleDateString()} · {payment.method} · UGX {payment.amount.toLocaleString()}{payment.reference ? ` · ${payment.reference}` : ''}</p>)}
                        </div>}
                        {lastSale.paymentReference && <p className="text-xs break-all">Payment reference: {lastSale.paymentReference}</p>}
                        <div className="pt-2 mt-2 border-t border-black/20 text-[11px] space-y-0.5">
                           <div className="flex justify-between">
                              <span>Total paid:</span>
                              <span>{(lastSale.amountPaid ?? 0).toLocaleString()}</span>
                           </div>
                           {(lastSale.amountPaid || 0) > lastSale.total && (
                              <div className="flex justify-between font-bold">
                                 <span>Change:</span>
                                 <span>{((lastSale.amountPaid || 0) - lastSale.total).toLocaleString()}</span>
                              </div>
                           )}
                        </div>
                     </div>

                     {/* Footer Message */}
                     <div className="text-center text-[11px] font-bold border-t border-black pt-2">
                        <p>{settings?.receiptFooter || 'Thank you for shopping with us!'}</p>
                        <p className="mt-1 font-normal text-[10px] italic">Powered by SNA Mobile Shop</p>
                        <div className="mt-3 flex justify-center">
                           {qrCodeDataURL && <img src={qrCodeDataURL} alt="Receipt QR" className="w-16 h-16" />}
                        </div>
                     </div>
                  </div>
               </div>
               {/* Footer Actions */}
               <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2 justify-end no-print shrink-0">
                  <button className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold uppercase hover:bg-slate-50 flex items-center justify-center gap-2">
                     <Mail size={16} strokeWidth={1.75} /> Email
                  </button>
                  <button onClick={() => printSection('#pos-receipt')} className="flex-1 py-3 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase hover:bg-black flex items-center justify-center gap-2">
                     <Printer size={16} strokeWidth={1.75} /> Print
                  </button>
               </div>
            </Modal>
         )}


         {/* --- SELECT PRICING TYPE MODAL --- */}
         {
            isSelectPricingModalOpen && (
               <Modal
                  isOpen={isSelectPricingModalOpen}
                  onClose={() => setIsSelectPricingModalOpen(false)}
                  title="Select Pricing"
                  maxWidth="sm"
                  noPadding
               >
                  <div className="p-8 space-y-4">
                     <div className="space-y-3">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide ml-1">Customer Type</label>
                        <div className="relative">
                           <select
                              className="win-input h-12 appearance-none font-bold text-sm"
                              value={stagedPricingMode}
                              onChange={e => setStagedPricingMode(e.target.value as any)}
                           >
                              <option value="Retail">Retail Customer</option>
                              <option value="Middle Man">Middle Man / Reseller</option>
                              <option value="Wholesale">Wholesale / Bulk</option>
                           </select>
                           <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} strokeWidth={1.75} />
                        </div>
                     </div>
                     <button
                        onClick={() => handlePricingModeSelected(stagedPricingMode)}
                        className="w-full py-4 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-[3px]  hover:bg-black transition-all flex items-center justify-center gap-2 "
                     >
                        Continue <ChevronRight size={16} strokeWidth={1.75} />
                     </button>
                  </div>
               </Modal>
            )
         }
         {/* --- HISTORY & REPORTS MODAL --- */}
         {/* --- HISTORY & REPORTS MODAL --- */}
         <Modal
            isOpen={isHistoryModalOpen}
            onClose={() => setIsHistoryModalOpen(false)}
            maxWidth="6xl"
            noPadding
            contentClassName="flex-1 flex flex-col min-h-0"
         >
            {/* Modal Header */}
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between no-print bg-white shrink-0 z-20">
               <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center ">
                     <History size={24} strokeWidth={1.75} />
                  </div>
                  <div>
                     <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Sales & Reports</h2>
                     <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Transaction History & Analysis</p>
                  </div>
               </div>

               <div className="flex items-center gap-2">
                  <button
                     onClick={() => setIsStatementModalOpen(true)}
                     className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold uppercase hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center gap-2"
                  >
                     <FileText size={14} strokeWidth={1.75} /> Statement
                  </button>
                  <button
                     onClick={downloadCSV}
                     className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold uppercase hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center gap-2"
                  >
                     <FileText size={14} strokeWidth={1.75} /> CSV
                  </button>
                  <button
                     onClick={() => exportSectionToPDF('#sales-history-table', 'Sales_Report.pdf')}
                     className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase hover:bg-black transition-all flex items-center gap-2  "
                  >
                     <Download size={14} strokeWidth={1.75} /> PDF
                  </button>
                  <button onClick={() => setIsHistoryModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-all ml-2"><X size={20} strokeWidth={1.75} /></button>
               </div>
            </div>

            {/* Filters & Summary Section */}
            <div className="shrink-0 bg-slate-50/50 border-b border-slate-100 no-print">
               {/* Summary Cards - Restructured */}
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 p-6">
                  <div className="bg-slate-900 p-6 rounded-3xl text-white   relative overflow-hidden group">
                     <div className="absolute -top-4 -right-4 p-4 opacity-5 group-hover:opacity-10 transition-opacity text-white">
                        <DollarSign size={32} strokeWidth={1.75} />
                     </div>
                     <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Sales value (includes unpaid)</p>
                     <p className="text-4xl font-black tracking-tighter">
                        <span className="text-xl text-slate-500 mr-1 font-normal">UGX</span>
                        {reportData.totals.revenue.toLocaleString()}
                     </p>
                  </div>
                  <div className={`p-6 rounded-3xl text-white  group ${reportData.totals.profit >= 0 ? 'bg-emerald-600 ' : 'bg-red-600 '}`}>
                     <div className="absolute -top-4 -right-4 p-4 opacity-10 group-hover:opacity-20 transition-opacity text-white">
                        <TrendingUpIcon size={32} strokeWidth={1.75} />
                     </div>
                     <p className="text-xs font-bold text-white/70 uppercase tracking-widest mb-2">Total Profit</p>
                     <p className="text-4xl font-black tracking-tighter">
                        <span className="text-xl text-white/80 mr-1 font-normal">UGX</span>
                        {reportData.totals.profit.toLocaleString()}
                     </p>
                  </div>
                  <div className="bg-white p-6 rounded-3xl border border-slate-200  flex flex-col justify-center group hover:border-blue-300 transition-colors">
                     <div className="flex items-center gap-3">
                        <div className="p-3.5 bg-blue-50 text-blue-600 rounded-2xl  transition-transform">
                           <Receipt size={24} strokeWidth={1.75} />
                        </div>
                        <div>
                           <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Transactions</p>
                           <p className="text-3xl font-black text-slate-900">{reportData.totals.count}</p>
                        </div>
                     </div>
                  </div>
                  <div className="bg-white p-6 rounded-3xl border border-slate-200  flex flex-col justify-center group hover:border-emerald-300 transition-colors">
                     <div className="flex items-center gap-3">
                        <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-2xl  transition-transform">
                           <TrendingUpIcon size={24} strokeWidth={1.75} />
                        </div>
                        <div>
                           <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Avg. Ticket</p>
                           <p className="text-3xl font-black text-slate-900">
                              <span className="text-lg text-slate-400 mr-1 font-bold">UGX</span>
                              {Math.round(reportData.totals.avgTicket).toLocaleString()}
                           </p>
                        </div>
                     </div>
                  </div>
               </div>

               {/* Filter Bar */}
               <div className="px-6 pb-6 pt-4 flex flex-wrap gap-3 items-center">
                  <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 ">
                     <div className="px-3 border-r border-slate-100">
                        <Calendar size={14} className="text-slate-400" strokeWidth={1.75} />
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
                        className="appearance-none bg-white border border-slate-200 pl-4 pr-10 h-11 rounded-xl text-xs font-bold text-slate-700  focus:ring-2 focus:ring-slate-100 outline-none cursor-pointer hover:bg-slate-50 transition-colors min-w-[140px]"
                        value={reportCategory}
                        onChange={e => setReportCategory(e.target.value)}
                     >
                        {categories.map(c => <option key={c} value={c}>{c === 'All' ? 'All Categories' : c}</option>)}
                     </select>
                     <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" strokeWidth={1.75} />
                  </div>

                  <div className="relative">
                     <select
                        className="appearance-none bg-white border border-slate-200 pl-4 pr-10 h-11 rounded-xl text-xs font-bold text-slate-700  focus:ring-2 focus:ring-slate-100 outline-none cursor-pointer hover:bg-slate-50 transition-colors min-w-[120px]"
                        value={reportPaymentMethod}
                        onChange={e => setReportPaymentMethod(e.target.value)}
                     >
                        <option value="All">All Payments</option>
                        <option value="Cash">Cash</option>
                        <option value="Mobile Money">Mobile Money</option>
                        <option value="Bank">Bank</option>
                     </select>
                     <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" strokeWidth={1.75} />
                  </div>

                  <select aria-label="Filter by sale type" className="win-input max-w-[160px]" value={saleTypeFilter} onChange={e => setSaleTypeFilter(e.target.value)}>
                     <option value="All">All sale types</option><option>Cash sale</option><option>Debt</option><option>Partial sale</option>
                  </select>
                  <div className="relative">
                     <select
                        className="appearance-none bg-white border border-slate-200 pl-4 pr-10 h-11 rounded-xl text-xs font-bold text-slate-700  focus:ring-2 focus:ring-slate-100 outline-none cursor-pointer hover:bg-slate-50 transition-colors min-w-[140px]"
                        value={reportCashier}
                        onChange={e => setReportCashier(e.target.value)}
                     >
                        {cashiers.map(c => <option key={c} value={c}>{c === 'All' ? 'All Cashiers' : c}</option>)}
                     </select>
                     <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" strokeWidth={1.75} />
                  </div>

                  <button
                     onClick={() => {
                        const today = new Date();
                        const str = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                        setReportStartDate(str);
                        setReportEndDate(str);
                        setReportCategory('All');
                        setSaleTypeFilter('All');
                        setReportPaymentMethod('All');
                        setReportCashier('All');
                     }}
                     className="ml-auto p-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                     title="Reset Filters"
                  >
                     <RotateCcw size={16} strokeWidth={1.75} />
                  </button>
               </div>
            </div>

            {/* REPORT CONTENT AREA */}
            <div className="flex-1 overflow-y-auto bg-white p-0 flex justify-center relative">
               <div id="sales-history-table" className="w-full bg-white h-full">
                  <div className="px-6 py-3 flex flex-wrap gap-6 text-sm border-b border-slate-200">
                     <span>Received: UGX {money(filteredHistory.reduce((sum, sale) => sum + Math.min(sale.total, sale.amountPaid), 0)).toLocaleString()}</span>
                     <span className="font-semibold">Outstanding: UGX {money(filteredHistory.reduce((sum, sale) => sum + outstandingAmount(sale), 0)).toLocaleString()}</span>
                  </div>
                  <table className="w-full text-left border-collapse">
                     <thead className="bg-slate-50/80 backdrop-blur-sm sticky top-0 z-10">
                        <tr>
                           <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Receipt #</th>
                           <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Date & Time</th>
                           <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Customer</th>
                           <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-center">Items</th>
                           <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-right">Profit</th>
                           <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-right">Total</th>
                           <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-right no-print">Action</th>
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
                                    {showDateHeader && !isPrintingStatement && (
                                       <tr className="bg-slate-100 sticky top-[57px] z-[5]">
                                          <td colSpan={7} className="px-6 py-2">
                                             <div className="flex items-center gap-2">
                                                <Calendar size={14} className="text-slate-400" strokeWidth={1.75} />
                                                <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider">
                                                   {new Date(sale.timestamp).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                                </h3>
                                             </div>
                                          </td>
                                       </tr>
                                    )}
                                    <tr className="hover:bg-slate-50/50 transition-colors group border-b border-slate-100">
                                       <td className="px-6 py-4">
                                          <div className="flex items-center gap-2">
                                             <div className="p-2 bg-slate-100 rounded-lg text-slate-500 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                                                <Receipt size={14} strokeWidth={1.75} />
                                             </div>
                                             <span className="font-mono text-xs font-bold text-slate-700 group-hover:text-slate-900">{sale.receiptNo}</span>
                                          </div>
                                       </td>
                                       <td className="px-6 py-4">
                                          <div className="flex flex-col">
                                             <span className="text-xs font-bold text-slate-900">{new Date(sale.timestamp).toLocaleDateString()}</span>
                                             <span className="text-xs font-normal text-slate-400">{new Date(sale.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                          </div>
                                       </td>
                                       <td className="px-6 py-4">
                                          <div className="flex flex-col">
                                             <span className="text-xs font-bold text-slate-900">{sale.customerName || 'Walk-in Customer'}</span>
                                             <span className="text-xs text-slate-400">{typeof sale.customerType === 'string' ? sale.customerType : 'Retail'}</span>
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
                                          <div className="text-[11px] font-bold text-slate-400 uppercase mt-0.5">{getSaleType(sale)} · {sale.paymentMethod}</div>
                                          <div className="text-xs text-slate-600">Paid: {sale.amountPaid.toLocaleString()} · Due: {outstandingAmount(sale).toLocaleString()}</div>
                                       </td>
                                       <td className="px-6 py-4 text-right no-print">
                                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                             <button
                                                onClick={() => setExpandedSaleId(expandedSaleId === sale.id ? null : sale.id)}
                                                className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-slate-900 hover:border-slate-400 transition-all "
                                                title="View Details"
                                             >
                                                {expandedSaleId === sale.id ? <ChevronUp size={14} strokeWidth={1.75} /> : <ChevronDown size={14} strokeWidth={1.75} />}
                                             </button>
                                             <button
                                                onClick={() => { setLastSale(sale); setIsReceiptOpen(true); }}
                                                className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-slate-900 hover:border-slate-400 transition-all "
                                                title="Reprint Receipt"
                                             >
                                                <Printer size={14} strokeWidth={1.75} />
                                             </button>
                                             {user.role === UserRole.ADMIN && (
                                                <>
                                                   <button onClick={() => openSaleEdit(sale)} className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-blue-600 hover:border-blue-400 transition-all  ml-1" title="Edit Invoice">
                                                      <Edit size={14} strokeWidth={1.75} />
                                                   </button>
                                                   <button onClick={() => setSaleToDelete(sale)} className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-red-600 hover:border-red-400 transition-all  ml-1" title="Delete Invoice">
                                                      <Trash2 size={14} strokeWidth={1.75} />
                                                   </button>
                                                </>
                                             )}
                                             {outstandingAmount(sale) > 0 && (
                                                <button type="button" className="px-3 py-2 border border-slate-200 rounded text-xs font-semibold" onClick={() => {
                                                   collectionId.current = crypto.randomUUID();
                                                   setCollectionForm({ amount: outstandingAmount(sale), method: 'Cash', reference: '' });
                                                   setPaymentSale(sale);
                                                }}>Record payment</button>
                                             )}
                                          </div>
                                       </td>
                                    </tr>
                                    {expandedSaleId === sale.id && (
                                       <tr className="bg-slate-50/50   duration-200">
                                          <td colSpan={7} className="p-0">
                                             <div className="p-4 m-4 bg-white rounded-lg border border-slate-200">
                                                <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">Items in this Sale</h4>
                                                <div className="space-y-2">
                                                   {sale.items.map((item, index) => (
                                                      <div key={index} className="flex justify-between items-center text-xs border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                                                         <div>
                                                            <p className="font-bold text-slate-800">{item.name}</p>
                                                            <p className="text-xs text-slate-400">
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
                                    <Search size={32} className="mb-4 opacity-50" strokeWidth={1.75} />
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
         </Modal>



         {/* --- STATEMENT MODAL --- */}
         {
            isStatementModalOpen && (
               <div className="fixed inset-0 bg-slate-900/60 z-[10000] flex items-center justify-center p-4 backdrop-blur-sm ">
                  <div className="bg-white w-full max-w-4xl rounded-2xl  overflow-hidden border border-white/20 flex flex-col max-h-[90vh]">
                     <div className="p-5 border-b border-slate-100 flex items-center justify-between no-print bg-slate-50 shrink-0">
                        <div>
                           <h2 className="text-lg font-bold text-slate-900">Sales Statement</h2>
                           <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-0.5">Period: {reportStartDate} to {reportEndDate}</p>
                        </div>
                        <div className="flex items-center gap-2">
                           <button onClick={() => setIsPrintingStatement(true)} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase hover:bg-black transition-all flex items-center gap-2  ">
                              <Printer size={14} strokeWidth={1.75} /> Print
                           </button>
                           <button onClick={() => setIsStatementModalOpen(false)} className="p-2 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition-colors"><X size={20} strokeWidth={1.75} /></button>
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
                                 <h2 className="text-lg font-bold text-slate-900 uppercase">{settings?.businessName || 'SNA! MOBILE SHOP'}</h2>
                                 <p className="text-xs text-slate-500">{settings?.address || 'KYAZANGA OPP STABEX PETROL STATION'}</p>
                                 <p className="text-xs text-slate-500">Tel: {settings?.phone || '+256 756337888 | +256 778413197'}</p>
                                 <p className="text-xs text-slate-500 mt-1">Generated: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}</p>
                              </div>
                           </div>

                           {/* Executive Summary Cards */}
                           <div className="grid grid-cols-3 gap-6 mb-10">
                              <div className="p-4 border border-slate-200 rounded-lg">
                                 <div className="flex items-center gap-2 mb-2 text-slate-400">
                                    <DollarSign size={14} strokeWidth={1.75} />
                                    <p className="text-xs font-bold uppercase tracking-wider">Sales value (includes unpaid)</p>
                                 </div>
                                 <p className="text-2xl font-black text-slate-900">
                                    {reportData.totals.revenue.toLocaleString()}
                                 </p>
                              </div>
                              <div className="p-4 border border-slate-200 rounded-lg bg-slate-50">
                                 <div className="flex items-center gap-2 mb-2 text-slate-400">
                                    <Receipt size={14} strokeWidth={1.75} />
                                    <p className="text-xs font-bold uppercase tracking-wider">Transactions</p>
                                 </div>
                                 <p className="text-2xl font-black text-slate-900">
                                    {reportData.totals.count}
                                 </p>
                              </div>
                              <div className="p-4 border border-slate-200 rounded-lg bg-slate-50">
                                 <div className="flex items-center gap-2 mb-2 text-slate-400">
                                    <TrendingUpIcon size={14} strokeWidth={1.75} />
                                    <p className="text-xs font-bold uppercase tracking-wider">Avg Ticket</p>
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
                                             <td className="py-3 text-right text-slate-500">{getSaleType(sale)} · {sale.paymentMethod}<br />Paid: {sale.amountPaid.toLocaleString()} · Due: {outstandingAmount(sale).toLocaleString()}</td>
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
                              <p className="text-xs text-center text-slate-400 mt-8">
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
            )
         }

         {/* --- STATEMENT MODAL --- */}
         {
            isStatementModalOpen && (
               <Modal
                  isOpen={isStatementModalOpen}
                  onClose={() => setIsStatementModalOpen(false)}
                  title="Sales Statement"
                  maxWidth="4xl"
                  noPadding
                  contentClassName="flex-1 flex flex-col min-h-0"
               >
                  <div className="p-5 border-b border-slate-100 flex items-center justify-between no-print bg-slate-50 shrink-0">
                     <div>
                        <h2 className="text-lg font-bold text-slate-900">Sales Statement</h2>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-0.5">Period: {reportStartDate} to {reportEndDate}</p>
                     </div>
                     <div className="flex items-center gap-2">
                        <button onClick={() => setIsPrintingStatement(true)} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase hover:bg-black transition-all flex items-center gap-2  ">
                           <Printer size={14} strokeWidth={1.75} /> Print
                        </button>
                        <button onClick={() => setIsStatementModalOpen(false)} className="p-2 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition-colors"><X size={20} strokeWidth={1.75} /></button>
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
                              <h2 className="text-lg font-bold text-slate-900 uppercase">{settings?.businessName || 'SNA! MOBILE SHOP'}</h2>
                              <p className="text-xs text-slate-500">{settings?.address || 'KYAZANGA OPP STABEX PETROL STATION'}</p>
                              <p className="text-xs text-slate-500">Tel: {settings?.phone || '+256 756337888 | +256 778413197'}</p>
                              <p className="text-xs text-slate-500 mt-1">Generated: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}</p>
                           </div>
                        </div>

                        {/* Executive Summary Cards */}
                        <div className="grid grid-cols-3 gap-6 mb-10">
                           <div className="p-4 border border-slate-200 rounded-lg">
                              <div className="flex items-center gap-2 mb-2 text-slate-400">
                                 <DollarSign size={14} strokeWidth={1.75} />
                                 <p className="text-xs font-bold uppercase tracking-wider">Sales value (includes unpaid)</p>
                              </div>
                              <p className="text-2xl font-black text-slate-900">
                                 {reportData.totals.revenue.toLocaleString()}
                              </p>
                           </div>
                           <div className="p-4 border border-slate-200 rounded-lg bg-slate-50">
                              <div className="flex items-center gap-2 mb-2 text-slate-400">
                                 <Receipt size={14} strokeWidth={1.75} />
                                 <p className="text-xs font-bold uppercase tracking-wider">Transactions</p>
                              </div>
                              <p className="text-2xl font-black text-slate-900">
                                 {reportData.totals.count}
                              </p>
                           </div>
                           <div className="p-4 border border-slate-200 rounded-lg bg-slate-50">
                              <div className="flex items-center gap-2 mb-2 text-slate-400">
                                 <TrendingUpIcon size={14} strokeWidth={1.75} />
                                 <p className="text-xs font-bold uppercase tracking-wider">Avg Ticket</p>
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
                                          <td className="py-3 text-right text-slate-500">{getSaleType(sale)} · {sale.paymentMethod}<br />Paid: {sale.amountPaid.toLocaleString()} · Due: {outstandingAmount(sale).toLocaleString()}</td>
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
                           <p className="text-xs text-center text-slate-400 mt-8">
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
               </Modal>
            )
         }

         {/* --- HOLD SALE MODAL --- */}
         {
            isHoldModalOpen && (
               <Modal
                  isOpen={isHoldModalOpen}
                  onClose={() => setIsHoldModalOpen(false)}
                  title="Hold Sale"
                  maxWidth="sm"
                  noPadding
               >
                  <div className="p-6 space-y-4">
                     <div className="p-4 bg-amber-50 text-amber-900 rounded-xl flex items-center gap-3 mb-2">
                        <Pause className="shrink-0 text-amber-600" size={24} strokeWidth={1.75} />
                        <div>
                           <p className="font-bold text-sm">Hold Current Sale?</p>
                           <p className="text-xs opacity-80">You can resume it later from "Held Sales".</p>
                        </div>
                     </div>
                     <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide ml-1">Note / Description</label>
                        <textarea
                           autoFocus
                           className="w-full h-24 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-normal outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all resize-none"
                           placeholder="e.g. Customer went to get cash..."
                           value={holdNote}
                           onChange={e => setHoldNote(e.target.value)}
                        />
                     </div>
                     <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => setIsHoldModalOpen(false)} className="py-3 bg-slate-100 text-slate-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
                        <button
                           onClick={confirmHoldSale}
                           className="py-3 bg-amber-500 text-white rounded-xl text-xs font-black uppercase tracking-widest   hover:bg-amber-600 transition-all "
                        >
                           Confirm Hold
                        </button>
                     </div>
                  </div>
               </Modal>
            )
         }

         {/* --- HELD SALES MODAL --- */}
         {
            isHeldSalesModalOpen && (
               <Modal
                  isOpen={isHeldSalesModalOpen}
                  onClose={() => setIsHeldSalesModalOpen(false)}
                  title="Held Sales Management"
                  maxWidth="md"
                  noPadding
                  contentClassName="flex-1 flex flex-col min-h-0"
               >
                  <div className="p-4 border-b border-slate-100 bg-slate-50 shrink-0">
                     <div className="flex p-1 bg-slate-200/50 rounded-xl mb-4">
                        <button
                           onClick={() => setHeldSalesView('pending')}
                           className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-lg transition-all ${heldSalesView === 'pending' ? 'bg-white text-slate-900 ' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                           Pending ({heldSales.length})
                        </button>
                        <button
                           onClick={() => setHeldSalesView('completed')}
                           className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-lg transition-all ${heldSalesView === 'completed' ? 'bg-white text-emerald-600 ' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                           Completed History
                        </button>
                     </div>

                     {heldSalesView === 'pending' ? (
                        <>
                           <h2 className="text-sm font-bold text-slate-900 uppercase">Pending Orders</h2>
                           <p className="text-xs text-slate-500">Select a sale to resume</p>
                        </>
                     ) : (
                        <>
                           <h2 className="text-sm font-bold text-slate-900 uppercase">Completed Held Sales</h2>
                           <p className="text-xs text-slate-500">History of finalized hold transactions</p>
                        </>
                     )}
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
                     {heldSalesView === 'pending' ? (
                        heldSales.length === 0 ? (
                           <div className="h-40 flex flex-col items-center justify-center text-slate-300">
                              <Pause size={32} className="mb-2 opacity-20" strokeWidth={1.75} />
                              <p className="text-xs font-bold uppercase tracking-widest">No held sales</p>
                           </div>
                        ) : (
                           heldSales.map((s) => (
                              <div key={s.id} className="bg-white p-4 rounded-2xl border border-slate-100  flex items-center justify-between group hover:border-amber-200 transition-all">
                                 <div className="min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                       <span className="text-xs font-black text-slate-900 truncate">{s.customerName}</span>
                                       <span className="text-[11px] font-bold text-slate-400 uppercase bg-slate-100 px-1.5 py-0.5 rounded">{s.items.length} Items</span>
                                    </div>
                                    <p className="text-xs text-slate-400 font-normal">
                                       {new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • UGX {s.total.toLocaleString()}
                                    </p>
                                    {s.notes && (
                                       <p className="text-xs text-amber-600 font-bold mt-1 italic truncate max-w-[200px]">Note: {s.notes}</p>
                                    )}
                                 </div>
                                 <div className="flex items-center gap-2">
                                    <button onClick={() => deleteHeldSale(s.id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={16} strokeWidth={1.75} /></button>
                                    <button
                                       onClick={() => handleResumeSale(s)}
                                       className="p-2.5 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-all   "
                                    >
                                       <PlayCircle size={18} strokeWidth={1.75} />
                                    </button>
                                 </div>
                              </div>
                           ))
                        )
                     ) : (
                        // COMPLETED VIEW
                        (() => {
                           const completedHeldSales = salesHistory.filter(s => s.wasHeld);
                           return completedHeldSales.length === 0 ? (
                              <div className="h-40 flex flex-col items-center justify-center text-slate-300">
                                 <Check size={32} className="mb-2 opacity-20" strokeWidth={1.75} />
                                 <p className="text-xs font-bold uppercase tracking-widest">No completed held sales found</p>
                              </div>
                           ) : (
                              completedHeldSales.map((s) => (
                                 <div key={s.id} className="bg-white p-4 rounded-2xl border border-slate-100  flex items-center justify-between group hover:border-emerald-200 transition-all opacity-75 hover:opacity-100">
                                    <div className="min-w-0">
                                       <div className="flex items-center gap-2 mb-1">
                                          <span className="text-xs font-black text-slate-900 truncate">{s.customerName || 'Walk-in'}</span>
                                          <span className="text-[11px] font-bold text-emerald-600 uppercase bg-emerald-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                                             <Check size={14} strokeWidth={1.75} /> Completed
                                          </span>
                                       </div>
                                       <p className="text-xs text-slate-400 font-normal">
                                          {new Date(s.timestamp).toLocaleDateString()} {new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                       </p>
                                       <p className="text-xs font-bold text-slate-900 mt-0.5">
                                          UGX {s.total.toLocaleString()}
                                       </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                       <button
                                          onClick={() => { setLastSale(s); setIsReceiptOpen(true); }}
                                          className="p-2 bg-slate-50 text-slate-400 hover:text-slate-900 hover:bg-slate-200 rounded-lg transition-all"
                                          title="View Receipt"
                                       >
                                          <Receipt size={16} strokeWidth={1.75} />
                                       </button>
                                    </div>
                                 </div>
                              ))
                           );
                        })()
                     )}
                  </div>
               </Modal>
            )
         }

         <Modal isOpen={!!paymentSale} onClose={() => { if (!collectionLock.current) setPaymentSale(null); }} title="Record customer payment" maxWidth="md">
            {paymentSale && <form onSubmit={collectPayment} className="space-y-4">
               <p className="text-sm">{paymentSale.customerName} · {paymentSale.receiptNo}</p>
               <p className="font-semibold">Outstanding: UGX {outstandingAmount(paymentSale).toLocaleString()}</p>
               <label className="block text-sm">Amount received
                  <input required type="number" min="0.01" step="0.01" max={outstandingAmount(paymentSale)} className="win-input mt-1" value={collectionForm.amount} onChange={e => setCollectionForm({ ...collectionForm, amount: Number(e.target.value) })} />
               </label>
               <label className="block text-sm">Payment method
                  <select className="win-input mt-1" value={collectionForm.method} onChange={e => setCollectionForm({ ...collectionForm, method: e.target.value })}>
                     <option>Cash</option><option>Mobile Money</option><option>Bank</option>
                  </select>
               </label>
               <label className="block text-sm">Reference (optional)<input className="win-input mt-1" value={collectionForm.reference} onChange={e => setCollectionForm({ ...collectionForm, reference: e.target.value })} /></label>
               <button type="submit" disabled={collecting} className="win-button-primary w-full">{collecting ? 'Saving...' : 'Record payment'}</button>
            </form>}
         </Modal>
         <Modal isOpen={imeiLookupOpen} onClose={() => setImeiLookupOpen(false)} title="Sold phone lookup" maxWidth="2xl">
            <label className="block text-sm">Enter the phone's primary IMEI
               <input className="win-input mt-2" inputMode="numeric" maxLength={15} value={imeiQuery} onChange={e => setImeiQuery(e.target.value.replace(/\D/g, ''))} placeholder="15-digit IMEI" />
            </label>
            {loading && <p className="text-sm mt-4">Refreshing sales…</p>}
            {dataError && <p role="alert" className="text-sm text-red-600 mt-4">Lookup data could not be refreshed. Close and retry before relying on these results.</p>}
            {imeiQuery.length === 15 && !loading && <div className="mt-4 space-y-3">
               {salesHistory.filter(sale => sale.items.some(item => itemImeis(item).includes(imeiQuery))).map(sale => (
                  <div key={sale.id} className="border border-slate-200 rounded p-4 text-sm space-y-2">
                     <p className="font-semibold">{sale.customerName} · {sale.customerPhone}</p>
                     <p>{sale.receiptNo} · Sold {new Date(sale.timestamp).toLocaleDateString()} · Attendant: {sale.cashierName}</p>
                     {sale.items.filter(item => itemImeis(item).includes(imeiQuery)).map(item => <p key={item.productId}>{item.name} · IMEI {imeiQuery}<br />{item.warrantyEndDate ? `Warranty ends ${new Date(item.warrantyEndDate).toLocaleDateString()}` : 'No warranty recorded'}</p>)}
                     <p>{getSaleType(sale)} · Outstanding: UGX {outstandingAmount(sale).toLocaleString()}</p>
                     <button className="underline" onClick={() => { setLastSale(sale); setImeiLookupOpen(false); setIsReceiptOpen(true); }}>Open original receipt</button>
                  </div>
               ))}
               {!dataError && !salesHistory.some(sale => sale.items.some(item => itemImeis(item).includes(imeiQuery))) && <p>No recorded sale found for this IMEI. Older sales without IMEIs cannot be matched.</p>}
            </div>}
         </Modal>
         {/* --- EDIT SALE MODAL --- */}
         {
            isEditModalOpen && saleToEdit && (
               <Modal
                  isOpen={isEditModalOpen}
                  onClose={() => setIsEditModalOpen(false)}
                  title={`Edit Invoice #${saleToEdit.receiptNo}`}
                  maxWidth="2xl"
                  noPadding
                  contentClassName="flex-1 flex flex-col min-h-0"
               >
                  <form onSubmit={handleUpdateSale} className="flex-1 overflow-y-auto p-6 space-y-4">
                     <label className="block text-sm">Customer (required)
                        <select required className="win-input mt-1" value={saleToEdit.customerId || ''} onChange={e => {
                           const customer = customers.find(c => c.id === e.target.value);
                           setSaleToEdit({ ...saleToEdit, customerId: customer?.id, customerName: customer?.name || '', customerPhone: customer?.phone || '' });
                        }}>
                           <option value="">Select customer</option>
                           {customers.filter(c => c.status !== CustomerStatus.BLACKLISTED).map(c => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}
                        </select>
                     </label>
                     <label className="block text-sm">Add product
                        <select className="win-input mt-1" value="" onChange={e => {
                           const product = products.find(p => p.id === e.target.value);
                           if (!product?.id) return;
                           const existing = saleToEdit.items.find(item => item.productId === product.id);
                           const price = calculatePrice(product, saleToEdit.customerType || 'Retail');
                           recalculateEditedSale(existing ? saleToEdit.items.map(item => item.productId === product.id ? { ...item, quantity: item.quantity + 1, total: money((item.quantity + 1) * item.price) } : item) : [...saleToEdit.items, { productId: product.id, name: product.name, price, originalPrice: price, costPrice: product.costPrice, quantity: 1, total: price }]);
                        }}>
                           <option value="">Select a product to add</option>
                           {products.map(product => <option key={product.id} value={product.id}>{product.name} · {product.sku} · Stock: {product.stockQuantity}</option>)}
                        </select>
                     </label>
                     {saleToEdit.items.length === 0 && <p role="alert" className="text-sm text-red-600">Add at least one item before saving.</p>}
                     <div className="space-y-4">
                        {saleToEdit.items.map((item, idx) => (
                           <div key={idx} className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                              <div className="flex-1">
                                 <p className="text-xs font-bold text-slate-900">{item.name}</p>
                                 {imeiInput(item, imeis => setSaleToEdit({ ...saleToEdit, items: saleToEdit.items.map((entry, index) => index === idx ? { ...entry, imeis } : entry) }))}
                              </div>
                              <div className="w-24">
                                 <label className="text-[11px] font-bold text-slate-400 uppercase">Qty</label>
                                 <input
                                    type="number"
                                    min="1"
                                    className="w-full h-8 px-2 rounded border border-slate-200 text-xs font-bold"
                                    value={item.quantity}
                                    onChange={e => updateEditItem(idx, 'quantity', Number(e.target.value))}
                                 />
                              </div>
                              <div className="w-32">
                                 <label className="text-[11px] font-bold text-slate-400 uppercase">Price</label>
                                 <input
                                    type="number"
                                    min="0"
                                    className="w-full h-8 px-2 rounded border border-slate-200 text-xs font-bold"
                                    value={item.price}
                                    onChange={e => updateEditItem(idx, 'price', Number(e.target.value))}
                                 />
                              </div>
                              <button type="button" aria-label={`Remove ${item.name}`} className="p-2 text-red-600" onClick={() => {
                                 if (confirm(`Remove ${item.name} from this sale?`)) recalculateEditedSale(saleToEdit.items.filter((_, index) => index !== idx));
                              }}><Trash2 size={16} /></button>
                              <div className="w-24 text-right">
                                 <label className="text-[11px] font-bold text-slate-400 uppercase block">Total</label>
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
                        <button type="submit" disabled={isUpdating || saleToEdit.items.length === 0 || !saleToEdit.customerId} className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold text-sm  hover:bg-black transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                           {isUpdating && <Loader2 className="animate-spin" size={14} strokeWidth={1.75} />}
                           {isUpdating ? 'Updating...' : 'Save Changes & Update Stock'}
                        </button>
                     </div>
                  </form>
               </Modal>
            )
         }

         {/* --- DELETE SALE CONFIRMATION --- */}
         {
            saleToDelete && (
               <Modal
                  isOpen={!!saleToDelete}
                  onClose={() => setSaleToDelete(null)}
                  title="Delete Invoice?"
                  maxWidth="sm"
                  noPadding
               >
                  <div className="p-8 text-center space-y-6">
                     <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
                        <AlertTriangle size={32} strokeWidth={1.75} />
                     </div>
                     <div>
                        <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">Are you sure?</h3>
                        <p className="text-sm text-slate-500 font-normal mt-2 leading-relaxed">
                           This will permanently remove invoice <span className="text-slate-900 font-bold">{saleToDelete.receiptNo}</span> and <span className="text-emerald-600 font-bold">restore stock</span> for all items.
                        </p>
                     </div>
                     <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => setSaleToDelete(null)} disabled={isDeleting} className="py-4 bg-slate-100 text-slate-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
                        <button onClick={confirmDeleteSale} disabled={isDeleting} className="py-4 bg-red-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest   hover:bg-red-700 transition-all flex items-center justify-center gap-2">
                           {isDeleting ? <Loader2 className="animate-spin" size={14} strokeWidth={1.75} /> : null} {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                        </button>
                     </div>
                  </div>
               </Modal>
            )
         }

      </div >
   );
};

export default POS;
