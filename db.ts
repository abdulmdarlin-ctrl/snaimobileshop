
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc, runTransaction
} from 'firebase/firestore';
import { dbInstance, createSecondaryUser } from './firebaseConfig';
import { validateRecord } from './utils/validation';
import { validateImeis, itemImeis } from './utils/imei';
import { calculateSaleTotals, money, stockChanges, validateItems, validatePayment, getSaleType, outstandingAmount } from './utils/pos';
import { Product, Sale, SaleItem, Repair, Supplier, User, AppSettings, UserRole, Expense, ExpenseCategory, StockLog, AuditLog, Purchase, Loan, Agent } from './types';

// --- DATABASE COLLECTIONS ---
const COLLECTIONS = {
  products: 'products',
  sales: 'sales',
  repairs: 'repairs',
  loans: 'loans',
  agents: 'agents',
  expenses: 'expenses',
  expenseCategories: 'expenseCategories',
  stockLogs: 'stockLogs',
  auditLogs: 'auditLogs',
  settings: 'settings',
  users: 'users',
  suppliers: 'suppliers',
  purchases: 'purchases',
  customers: 'customers'
};

// --- SAFE JSON UTILS ---
export const safeStringify = (obj: any) => {
  const ancestors: object[] = [];
  return JSON.stringify(obj, function (key, value) {
    if (typeof value === 'object' && value !== null) {
      if (
        value.nodeType ||
        (typeof window !== 'undefined' && value === window) ||
        (value.$$typeof && Symbol.keyFor && Symbol.keyFor(value.$$typeof) === 'react.element')
      ) {
        return;
      }
      while (ancestors.length && ancestors[ancestors.length - 1] !== this) ancestors.pop();
      if (ancestors.includes(value)) return;
      ancestors.push(value);
    }
    return value;
  });
};

// Helper: Sanitize Data for Firestore (Deep Clean)
const sanitizeData = (data: any) => {
  if (!data || typeof data !== 'object') return data;
  return JSON.parse(safeStringify(data));
};

// --- FIRESTORE ADAPTER ---
function createCollectionHelper<T extends { id?: string }>(collectionName: string) {

  const getColRef = () => {
    if (!dbInstance) throw new Error("Database not initialized");
    return collection(dbInstance, collectionName);
  };

  return {
    toArray: async () => {
      try {
        const snapshot = await getDocs(getColRef());
        return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as T[];
      } catch (e) {
        console.error(`Error fetching ${collectionName}:`, e);
        throw e;
      }
    },

    add: async (data: T) => {
      if (collectionName === 'products') return saveInventoryProduct(data as unknown as Product) as Promise<any>;
      validateRecord(collectionName, data);
      const cleanData = sanitizeData(data);
      const docRef = await addDoc(getColRef(), cleanData);
      return { ...data, id: docRef.id };
    },

    update: async (id: string, data: Partial<T>) => {
      if (collectionName === 'products') { await saveInventoryProduct(data as Partial<Product>, id); return; }
      if (!id) throw new Error('Select a record to update.');
      validateRecord(collectionName, data, true);
      const cleanData = sanitizeData(data);
      const docRef = doc(dbInstance!, collectionName, id);
      await updateDoc(docRef, cleanData);
    },

    delete: async (id: string) => {
      if (!id) throw new Error('Select a record to delete.');
      const docRef = doc(dbInstance!, collectionName, id);
      await deleteDoc(docRef);
    },

    // For Dexie-like API compatibility in App.tsx
    toCollection: () => ({
      first: async () => {
        try {
          const snapshot = await getDocs(getColRef());
          return snapshot.empty ? null : { ...snapshot.docs[0].data(), id: snapshot.docs[0].id } as T;
        } catch (e) {
          console.error(`Error fetching first ${collectionName}:`, e);
          return null;
        }
      }
    }),

    // For Settings upsert
    put: async (data: T) => {
      validateRecord(collectionName, data);
      const snapshot = await getDocs(getColRef());
      if (!snapshot.empty) {
        const id = snapshot.docs[0].id;
        await updateDoc(doc(dbInstance!, collectionName, id), sanitizeData(data));
        return id;
      } else {
        const docRef = await addDoc(getColRef(), sanitizeData(data));
        return docRef.id;
      }
    }
  };
}

// --- DB INSTANCE ---
async function saveInventoryProduct(data: Partial<Product>, id?: string) {
  const ref = id ? doc(dbInstance, 'products', id) : doc(collection(dbInstance, 'products'));
  return runTransaction(dbInstance, async transaction => {
    const previous = await transaction.get(ref);
    if (id && !previous.exists()) throw new Error('Product no longer exists.');
    const product = { ...(previous.data() || {}), ...data, id: id || ref.id } as Product;
    validateRecord('products', product);
    const old = previous.data() as Product | undefined;
    if (old?.type === 'Phone' && product.type !== 'Phone') throw new Error('A registered phone cannot be converted to another product type.');
    const writes: { ref: any; data: any }[] = [];
    if (product.type === 'Phone') {
      validateImeis(product.imeis || [], product.stockQuantity);
      for (const imei of new Set([...(old?.imeis || []), ...(product.imeis || [])])) {
        const imeiRef = doc(dbInstance, 'phoneImeis', imei);
        const registration = await transaction.get(imeiRef);
        if (registration.exists() && (registration.data().productId !== product.id || registration.data().saleId))
          throw new Error(`IMEI ${imei} is already registered to another product or has been sold.`);
        writes.push({ ref: imeiRef, data: { productId: product.id, status: product.imeis?.includes(imei) ? 'Available' : 'Removed', saleId: null } });
      }
    }
    for (const write of writes) transaction.set(write.ref, write.data);
    transaction.set(ref, sanitizeData(product));
    return product;
  });
}

export const db = {
  collectRepairPayment: async (id: string, amount: number, expectedDeposit: number, actor: string, method: string) => {
    if (!Number.isFinite(amount) || amount <= 0 || !['Cash', 'Mobile Money', 'Bank'].includes(method)) throw new Error('Enter a valid payment.');
    return runTransaction(dbInstance, async transaction => {
      const ref = doc(dbInstance, 'repairs', id);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw new Error('Repair no longer exists.');
      const repair = snapshot.data() as Repair;
      const paid = repair.depositPaid || 0;
      if (paid !== expectedDeposit) throw new Error('Repair balance changed. Refresh before collecting payment.');
      if (money(amount) > money(repair.estimatedCost - paid)) throw new Error('Payment exceeds the repair balance.');
      const depositPaid = money(paid + amount);
      transaction.update(ref, { depositPaid, isPaid: depositPaid >= repair.estimatedCost });
      transaction.set(doc(collection(dbInstance, 'auditLogs')), { action: 'Repair payment received', entityType: 'Repair', entityId: id, user: actor, timestamp: Date.now(), details: `${repair.jobCardNo}: ${amount} via ${method}` });
    });
  },
  adjustStock: async (log: StockLog) => {
    if (!log.productId || !Number.isSafeInteger(log.newStock) || log.newStock < 0) throw new Error('Enter a non-negative whole stock quantity.');
    validateRecord('stockLogs', log);
    return runTransaction(dbInstance, async transaction => {
      const ref = doc(dbInstance, 'products', log.productId);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw new Error('Product no longer exists.');
      const product = snapshot.data() as Product;
      if (product.type === 'Phone') throw new Error('Edit phone stock together with its IMEI list.');
      if (product.stockQuantity !== log.previousStock) throw new Error('Stock changed since you opened this form. Refresh inventory and try again.');
      if (product.stockQuantity === log.newStock) return;
      transaction.update(ref, { stockQuantity: log.newStock });
      transaction.set(doc(collection(dbInstance, 'stockLogs')), sanitizeData({ ...log, productName: product.name, changeAmount: log.newStock - product.stockQuantity }));
    });
  },
  receivePurchase: async (purchase: Purchase) => {
    if (!purchase.id || !purchase.supplierId || !purchase.items.length) throw new Error('Select a supplier and add purchase items.');
    validateRecord('purchases', purchase);
    for (const item of purchase.items) {
      if (!item.productId || !Number.isSafeInteger(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unitCost) || item.unitCost < 0)
        throw new Error('Purchase items need a valid product, whole quantity and non-negative cost.');
    }
    return runTransaction(dbInstance, async transaction => {
      const ref = doc(dbInstance, 'purchases', purchase.id!);
      const existing = await transaction.get(ref);
      if (existing.exists()) return existing.data();
      const supplier = await transaction.get(doc(dbInstance, 'suppliers', purchase.supplierId));
      if (!supplier.exists()) throw new Error('Supplier no longer exists.');
      const grouped = new Map<string, { quantity: number; unitCost: number }>();
      for (const item of purchase.items) grouped.set(item.productId, { quantity: (grouped.get(item.productId)?.quantity || 0) + item.quantity, unitCost: item.unitCost });
      const updates = [];
      for (const [productId, item] of grouped) {
        const productRef = doc(dbInstance, 'products', productId);
        const snapshot = await transaction.get(productRef);
        if (!snapshot.exists()) throw new Error('A purchased product no longer exists.');
        const product = snapshot.data() as Product;
        if (product.type === 'Phone') throw new Error('Register phone deliveries in Inventory with one IMEI per phone.');
        const newStock = product.stockQuantity + item.quantity;
        if (!Number.isSafeInteger(newStock)) throw new Error('Invalid stock quantity.');
        updates.push({ productId, productRef, product, newStock, ...item });
      }
      const items = purchase.items.map(item => ({ ...item, totalCost: money(item.quantity * item.unitCost) }));
      const saved = { ...purchase, items, supplierName: supplier.data().name, totalAmount: money(items.reduce((sum, item) => sum + item.totalCost, 0)), status: 'Received' };
      validateRecord('purchases', saved);
      for (const update of updates) {
        transaction.update(update.productRef, { stockQuantity: update.newStock, costPrice: update.unitCost });
        transaction.set(doc(collection(dbInstance, 'stockLogs')), { productId: update.productId, productName: update.product.name,
          previousStock: update.product.stockQuantity, newStock: update.newStock, changeAmount: update.quantity,
          reason: 'Restock', note: `Purchase ${purchase.invoiceNo || purchase.id}`, user: purchase.receivedBy, timestamp: purchase.timestamp });
      }
      transaction.set(ref, sanitizeData(saved));
      return saved;
    });
  },
  issueConsignment: async (loan: Loan) => {
    if (!loan.id || !loan.agentId) throw new Error('Select an agent before issuing stock.');
    validateRecord('loans', loan);
    return runTransaction(dbInstance, async transaction => {
      const ref = doc(dbInstance, 'loans', loan.id!);
      const existing = await transaction.get(ref);
      if (existing.exists()) return existing.data();
      const agent = await transaction.get(doc(dbInstance, 'agents', loan.agentId!));
      if (!agent.exists()) throw new Error('Agent no longer exists.');
      let stockUpdate: { ref: any; product: Product } | undefined;
      if (loan.productId) {
        const productRef = doc(dbInstance, 'products', loan.productId);
        const snapshot = await transaction.get(productRef);
        if (!snapshot.exists()) throw new Error('Product no longer exists.');
        const product = snapshot.data() as Product;
        if (product.type === 'Phone') throw new Error('Use the IMEI-tracked sales workflow for registered phones.');
        if (!Number.isSafeInteger(product.stockQuantity) || product.stockQuantity < 1) throw new Error('Insufficient stock to issue this product.');
        stockUpdate = { ref: productRef, product };
      }
      if (stockUpdate) {
        const { product } = stockUpdate;
        transaction.update(stockUpdate.ref, { stockQuantity: product.stockQuantity - 1 });
        transaction.set(doc(collection(dbInstance, 'stockLogs')), { productId: loan.productId, productName: product.name,
          previousStock: product.stockQuantity, newStock: product.stockQuantity - 1, changeAmount: -1,
          reason: 'Agent Issue', note: `Issued to ${agent.data().name}`, user: loan.issuedBy, timestamp: loan.timestamp });
      }
      transaction.set(ref, sanitizeData(loan));
      return loan;
    });
  },
  // Sale and inventory writes commit together, using fresh stock inside the transaction.
  commitSale: async (sale: Sale, allowNegativeStock = false, mode: 'create' | 'edit' = 'create', actor = sale.cashierName) => {
    if (!sale.id || !dbInstance) throw new Error('Sale reference or database is unavailable.');
    validateItems(sale.items);
    const totals = calculateSaleTotals(sale.items, sale.globalDiscountPercentage ?? 0, sale.taxPercentage ?? 0);
    const saleType = sale.saleType || getSaleType({ total: totals.total, amountPaid: sale.amountPaid });
    validatePayment(totals.total, sale.amountPaid, sale.paymentMethod, saleType);
    if (!sale.customerId || !sale.customerName?.trim() || !sale.customerPhone?.trim()) throw new Error('Select a customer with a name and phone number before saving any sale.');
    const amountDue = outstandingAmount({ total: totals.total, amountPaid: sale.amountPaid });
    const cleanSale = sanitizeData({ ...sale, ...totals, saleType, amountDue, balance: amountDue, changeDue: money(Math.max(0, sale.amountPaid - totals.total)),
      items: sale.items.map(item => ({ ...item, ...(item.imeis ? { imeis: itemImeis(item) } : {}), total: money(item.price * item.quantity) })) });
    const saleRef = doc(dbInstance, COLLECTIONS.sales, sale.id);
    return runTransaction(dbInstance, async transaction => {
      const existing = await transaction.get(saleRef);
      if (mode === 'create' && existing.exists()) return { ...existing.data(), id: existing.id } as Sale;
      const customer = await transaction.get(doc(dbInstance, COLLECTIONS.customers, sale.customerId));
      if (!customer.exists() || customer.data().status === 'Blacklisted') throw new Error('Select an existing customer who is not blacklisted.');
      if (!customer.data().name?.trim() || !customer.data().phone?.trim()) throw new Error('Update the customer name and phone before completing the sale.');
      cleanSale.customerName = customer.data().name;
      cleanSale.customerPhone = customer.data().phone;
      if (mode === 'edit' && !existing.exists()) throw new Error('This sale no longer exists. Refresh sales history.');
      if (mode === 'edit' && (existing.data()?.revision || 0) !== (sale.revision || 0)) throw new Error('This sale was changed elsewhere. Refresh history before editing.');
      cleanSale.revision = (existing.data()?.revision || 0) + 1;
      const changes = stockChanges(existing.exists() ? (existing.data() as Sale).items : [], cleanSale.items);
      const stockUpdates = [];
      const imeiWrites: { ref: any; data: any }[] = [];
      const seenImeis = new Set<string>();
      for (const [id, delta] of changes) {
        const ref = doc(dbInstance, COLLECTIONS.products, id);
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) throw new Error('A product in this sale no longer exists.');
        const product = snapshot.data() as Product;
        let availableImeis = product.imeis;
        if (product.type === 'Phone') {
          const previousItems = existing.exists() ? (existing.data() as Sale).items.filter(item => item.productId === id) : [];
          const nextItems = cleanSale.items.filter((item: SaleItem) => item.productId === id) as SaleItem[];
          const oldImeis = previousItems.flatMap(itemImeis);
          const newImeis = nextItems.flatMap(itemImeis);
          for (const item of nextItems) validateImeis(itemImeis(item), item.quantity);
          for (const imei of newImeis) {
            if (seenImeis.has(imei)) throw new Error(`IMEI ${imei} appears more than once in this sale.`);
            seenImeis.add(imei);
          }
          const pool = new Set([...(product.imeis || []), ...oldImeis]);
          if (newImeis.some(imei => !pool.has(imei))) throw new Error('Select IMEIs from available phone inventory.');
          for (const imei of new Set([...oldImeis, ...newImeis])) {
            const imeiRef = doc(dbInstance, 'phoneImeis', imei);
            const registration = await transaction.get(imeiRef);
            if (!registration.exists() || registration.data().productId !== id || (registration.data().saleId && registration.data().saleId !== sale.id))
              throw new Error(`IMEI ${imei} is unavailable. Correct its inventory registration first.`);
            imeiWrites.push({ ref: imeiRef, data: { productId: id, status: newImeis.includes(imei) ? 'Sold' : 'Available', saleId: newImeis.includes(imei) ? sale.id : null } });
          }
          availableImeis = [...pool].filter(imei => !newImeis.includes(imei));
          validateImeis(availableImeis, product.stockQuantity + delta);
        }
        for (const item of cleanSale.items.filter((item: SaleItem) => item.productId === id)) {
          if (mode === 'create') item.costPrice = product.costPrice ?? 0;
        }
        const quantity = product.stockQuantity + delta;
        if (!Number.isFinite(quantity)) throw new Error(`Invalid stock for ${product.name}.`);
        if (!allowNegativeStock && quantity < 0) throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stockQuantity}.`);
        stockUpdates.push({ ref, quantity, ...(availableImeis ? { imeis: availableImeis } : {}) });
      }
      for (const { ref, quantity, imeis } of stockUpdates) transaction.update(ref, { stockQuantity: quantity, ...(imeis ? { imeis } : {}) });
      for (const write of imeiWrites) transaction.set(write.ref, write.data);
      transaction.set(saleRef, cleanSale);
      transaction.set(doc(collection(dbInstance, COLLECTIONS.auditLogs)), {
        action: mode === 'edit' ? 'Sale updated' : 'Sale created', entityType: 'Sale', entityId: sale.id,
        user: actor, timestamp: Date.now(), details: `${cleanSale.receiptNo}: ${cleanSale.total}`,
        ...(existing.exists() ? { previousSale: existing.data() } : {})
      });
      return cleanSale as Sale;
    });
  },
  recordSalePayment: async (id: string, payment: { id: string; amount: number; method: string; reference: string; timestamp: number; user: string }) => {
    if (!dbInstance) throw new Error('Database is unavailable.');
    if (!payment.id || !Number.isFinite(payment.amount) || money(payment.amount) <= 0) throw new Error('Enter a positive payment amount.');
    if (!['Cash', 'Mobile Money', 'Bank'].includes(payment.method)) throw new Error('Choose a valid payment method.');
    return runTransaction(dbInstance, async transaction => {
      const ref = doc(dbInstance, COLLECTIONS.sales, id);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw new Error('This sale no longer exists.');
      const sale = { ...snapshot.data(), id } as Sale;
      if (sale.payments?.some(entry => entry.id === payment.id)) return sale;
      const amount = money(payment.amount);
      if (amount > outstandingAmount(sale)) throw new Error('Payment exceeds the current outstanding balance. Refresh and try again.');
      const amountPaid = money(sale.amountPaid + amount);
      const amountDue = outstandingAmount({ ...sale, amountPaid });
      const updated = { ...sale, amountPaid, amountDue, balance: amountDue, changeDue: 0,
        saleType: getSaleType({ ...sale, amountPaid }), revision: (sale.revision || 0) + 1,
        payments: [...(sale.payments || []), { ...payment, amount }] };
      transaction.set(ref, sanitizeData(updated));
      transaction.set(doc(collection(dbInstance, COLLECTIONS.auditLogs)), {
        action: 'Sale payment received', entityType: 'Sale', entityId: id, user: payment.user,
        timestamp: payment.timestamp, details: `${sale.receiptNo}: received ${amount}; outstanding ${amountDue}`
      });
      return updated;
    });
  },
  deleteSale: async (id: string, actor: string) => {
    if (!dbInstance) throw new Error('Database is unavailable.');
    return runTransaction(dbInstance, async transaction => {
      const ref = doc(dbInstance, COLLECTIONS.sales, id);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) return;
      const updates = [];
      const restoredImeis: { ref: any; data: any }[] = [];
      for (const [productId, delta] of stockChanges((snapshot.data() as Sale).items, [])) {
        const productRef = doc(dbInstance, COLLECTIONS.products, productId);
        const product = await transaction.get(productRef);
        if (!product.exists()) throw new Error('Cannot restore stock: a product no longer exists.');
        if (!Number.isFinite(product.data().stockQuantity + delta)) throw new Error('Cannot restore stock: invalid quantity.');
        const imeis = product.data().type === 'Phone' ? (snapshot.data() as Sale).items.filter(item => item.productId === productId).flatMap(itemImeis) : [];
        for (const imei of imeis) {
          const imeiRef = doc(dbInstance, 'phoneImeis', imei);
          const registration = await transaction.get(imeiRef);
          if (!registration.exists() || registration.data().saleId !== id) throw new Error('Phone ownership changed. Cannot restore this IMEI.');
          restoredImeis.push({ ref: imeiRef, data: { productId, saleId: null, status: 'Available' } });
        }
        const available = [...(product.data().imeis || []), ...imeis];
        if (product.data().type === 'Phone') validateImeis(available, product.data().stockQuantity + delta);
        updates.push({ ref: productRef, quantity: product.data().stockQuantity + delta, ...(product.data().type === 'Phone' ? { imeis: available } : {}) });
      }
      for (const update of updates) transaction.update(update.ref, { stockQuantity: update.quantity, ...(update.imeis ? { imeis: update.imeis } : {}) });
      for (const entry of restoredImeis) transaction.set(entry.ref, entry.data);
      transaction.set(doc(collection(dbInstance, COLLECTIONS.auditLogs)), {
        action: 'Sale deleted', entityType: 'Sale', entityId: id, user: actor,
        timestamp: Date.now(), details: `Deleted ${snapshot.data().receiptNo} and restored stock.`,
        saleSnapshot: snapshot.data()
      });
      transaction.delete(ref);
    });
  },
  products: createCollectionHelper<Product>(COLLECTIONS.products),
  sales: createCollectionHelper<Sale>(COLLECTIONS.sales),
  repairs: createCollectionHelper<Repair>(COLLECTIONS.repairs),
  loans: createCollectionHelper<Loan>(COLLECTIONS.loans),
  agents: createCollectionHelper<Agent>(COLLECTIONS.agents),
  expenses: createCollectionHelper<Expense>(COLLECTIONS.expenses),
  expenseCategories: createCollectionHelper<ExpenseCategory>(COLLECTIONS.expenseCategories),
  stockLogs: createCollectionHelper<StockLog>(COLLECTIONS.stockLogs),
  auditLogs: createCollectionHelper<AuditLog>(COLLECTIONS.auditLogs),
  settings: createCollectionHelper<AppSettings>(COLLECTIONS.settings),
  suppliers: createCollectionHelper<Supplier>(COLLECTIONS.suppliers),
  purchases: createCollectionHelper<Purchase>(COLLECTIONS.purchases),
  customers: createCollectionHelper<any>(COLLECTIONS.customers),
  users: {
    ...createCollectionHelper<User>(COLLECTIONS.users),
    create: async (user: User, password?: string) => {
      validateRecord('users', user);
      if (!password) throw new Error("Password is required for new users");
      if (!user.username) throw new Error("Username is required");

      // 1. Create User in Firebase Auth
      // If username is simple string (e.g. 'john'), append domain to make it a valid email for Auth
      const email = user.username.includes('@') ? user.username : `${user.username}@sna.erp`;

      // Use secondary app to avoid signing out the current admin
      const uid = await createSecondaryUser(email, password);

      // 2. Create User Profile in Firestore
      // We use setDoc with the Auth UID to ensure they match
      const cleanData = sanitizeData({ ...user, id: uid });
      const docRef = doc(dbInstance!, COLLECTIONS.users, uid);
      await setDoc(docRef, cleanData);

      return { ...user, id: uid };
    }
  },

  // System Methods
  getStatus: () => 'live' as const,
  resetSystem: async () => {
    console.warn("System reset requires manual Cloud Firestore deletion.");
    alert("Please contact administrator to reset cloud database.");
  }
};

// --- SEEDING ---
export const seedInitialData = async () => {
  try {
    const settings = await db.settings.toCollection().first();
    if (!settings) {
      await db.settings.add({
        businessName: 'SNA! MOBILE SHOP',
        tagline: "We repair, we don't disrepair",
        address: 'KYAZANGA OPP STABEX PETROL STATION',
        phone: '+256 756337888 | +256 778413197',
        currency: 'UGX',
        taxEnabled: true,
        taxPercentage: 18,
        receiptHeader: 'SNA! MOBILE SHOP',
        receiptFooter: 'Thank you for shopping with us!',
        receiptFooterFontSize: 10,
        receiptFooterAlign: 'center',
        receiptFormat: 'thermal',
        receiptShowLogo: true,
        receiptShowCashier: true,
        receiptShowTaxDetail: true,
        receiptFooterBold: false,
        receiptFooterItalic: false,
        receiptFont: 'monospace',
        receiptFontSize: 11,
        receiptLineHeight: 1.3,
        theme: 'light',
        themeColor: '#ef4444',
        invoicePrefix: 'INV',
        enableNegativeStock: false,
        globalLowStockThreshold: 5,
        dateFormat: 'dd/MM/yyyy',
        hardware: {
          printerPaperWidth: '80mm',
          autoPrintReceipt: true
        }
      });
    }

    const cats = await db.expenseCategories.toArray();
    if (cats.length === 0) {
      const defaults = ['Rent', 'Utilities', 'Staff Lunch', 'Transport', 'Supplies', 'Taxes', 'Maintenance', 'Others'];
      for (const name of defaults) await db.expenseCategories.add({ name });
    }

    // Ensure Admin
    const users = await db.users.toArray();
    if (users.length === 0) {
      // This only creates the Firestore record for initial seed
      // The Auth account must be created via the Auth component logic or manually first time
      await db.users.add({
        username: 'admin',
        fullName: 'System Admin',
        role: UserRole.ADMIN,
        isActive: true,
        lastLogin: Date.now()
      });
    }
  } catch (e) {
    console.error("Initial seeding failed (likely network issue):", e);
  }
};
