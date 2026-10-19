import { customerStatus, normalizeCustomerPhone, validateCustomerContact, getCustomerSales } from './utils/customers';

import {
  collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc, setDoc, runTransaction as firestoreTransaction, onSnapshot, query, limit
} from 'firebase/firestore';
import { dbInstance, createSecondaryUser } from './firebaseConfig';
import { validateRecord } from './utils/validation';
import { createDatabaseReadCache, ReadOptions } from './utils/databaseReadCache';
import { receiptNumber } from './utils/saleDocuments';
import { validateImeis, itemImeis } from './utils/imei';
import { calculateSaleTotals, money, stockChanges, validateItems, validatePayment, getSaleType, outstandingAmount } from './utils/pos';
import { Customer, Product, Sale, SaleItem, Repair, Supplier, User, AppSettings, UserRole, Expense, ExpenseCategory, StockLog, AuditLog, Purchase, Loan, Agent } from './types';

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

const displayReads = createDatabaseReadCache();
// Invalidate only after a successful commit; failed writes never change display data.
const runTransaction: typeof firestoreTransaction = async (...args) => {
  const result = await firestoreTransaction(...args);
  displayReads.invalidate();
  return result;
};

// --- FIRESTORE ADAPTER ---
function createCollectionHelper<T extends { id?: string }>(collectionName: string) {

  const getColRef = () => {
    if (!dbInstance) throw new Error("Database not initialized");
    return collection(dbInstance, collectionName);
  };

  return {
    subscribe: (onData: (records: T[]) => void, onError: (error: Error) => void) =>
      onSnapshot(getColRef(), snapshot => {
        const records = snapshot.docs.map(record => ({ ...record.data(), id: record.id })) as T[];
        if (!snapshot.metadata?.fromCache) displayReads.seed(`${collectionName}:all`, records);
        onData(records);
      }, error => { displayReads.invalidate(`${collectionName}:`); onError(error); }),
    getMany: async (ids: string[], options: ReadOptions = {}) => {
      const records = await Promise.all([...new Set(ids)].filter(Boolean).map(id => displayReads.read(`${collectionName}:doc:${id}`, async () => {
        const snapshot = await getDoc(doc(dbInstance, collectionName, id));
        return snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } as T : null;
      }, options)));
      return records.filter(record => record !== null) as T[];
    },
    toArray: async (options: ReadOptions = {}) => displayReads.read(`${collectionName}:all`, async () => {
      try {
        const snapshot = await getDocs(getColRef());
        return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as T[];
      } catch (e) {
        console.error(`Error fetching ${collectionName}:`, e);
        throw e;
      }
    }, options),

    add: async (data: T) => {
      if (collectionName === 'products') return saveInventoryProduct(data as unknown as Product) as Promise<any>;
      if (collectionName === 'customers') return db.saveCustomerProfile(data as unknown as Customer, undefined, (data as unknown as Customer).updatedBy || 'System') as Promise<any>;
      validateRecord(collectionName, data);
      const cleanData = sanitizeData(data);
      const docRef = await addDoc(getColRef(), cleanData);
      displayReads.invalidate(`${collectionName}:`);
      return { ...data, id: docRef.id };
    },

    update: async (id: string, data: Partial<T>) => {
      if (collectionName === 'products') { await saveInventoryProduct(data as Partial<Product>, id); return; }
      if (collectionName === 'customers') { await db.saveCustomerProfile(data as Partial<Customer>, id, (data as Partial<Customer>).updatedBy || 'System'); return; }
      if (!id) throw new Error('Select a record to update.');
      validateRecord(collectionName, data, true);
      const cleanData = sanitizeData(data);
      const docRef = doc(dbInstance!, collectionName, id);
      await updateDoc(docRef, cleanData);
      displayReads.invalidate(`${collectionName}:`);
    },

    delete: async (id: string) => {
      if (!id) throw new Error('Select a record to delete.');
      const docRef = doc(dbInstance!, collectionName, id);
      await deleteDoc(docRef);
      displayReads.invalidate(`${collectionName}:`);
    },

    // For Dexie-like API compatibility in App.tsx
    toCollection: () => ({
      first: async (options: ReadOptions = {}) => displayReads.read(`${collectionName}:first`, async () => {
        try {
          const snapshot = await getDocs(query(getColRef(), limit(1)));
          return snapshot.empty ? null : { ...snapshot.docs[0].data(), id: snapshot.docs[0].id } as T;
        } catch (e) {
          console.error(`Error fetching first ${collectionName}:`, e);
          throw e;
        }
      }, options)
    }),

    // For Settings upsert
    put: async (data: T) => {
      validateRecord(collectionName, data);
      const snapshot = await getDocs(query(getColRef(), limit(1)));
      if (!snapshot.empty) {
        const id = snapshot.docs[0].id;
        await updateDoc(doc(dbInstance!, collectionName, id), sanitizeData(data));
        displayReads.invalidate(`${collectionName}:`);
        return id;
      } else {
        const docRef = await addDoc(getColRef(), sanitizeData(data));
        displayReads.invalidate(`${collectionName}:`);
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
        const next = { productId: product.id, status: product.imeis?.includes(imei) ? 'Available' : 'Removed', saleId: null };
        const current = registration.data();
        if (!registration.exists() || current.productId !== next.productId || current.status !== next.status || current.saleId != null) writes.push({ ref: imeiRef, data: next });
      }
    }
    for (const write of writes) transaction.set(write.ref, write.data);
    transaction.set(ref, sanitizeData(product));
    return product;
  });
}

export const db = {
  clearReadCache: () => displayReads.invalidate(),
  saveCustomerProfile: async (data: Partial<Customer>, id: string | undefined, actor: string, expectedUpdatedAt?: number) => {
    const ref = id ? doc(dbInstance, 'customers', id) : doc(collection(dbInstance, 'customers'));
    const customerId = id || ref.id;
    // The phone registry protects concurrent registrations. Existing unindexed
    // customers are also checked so legacy records are not silently duplicated.
    const snapshot = await getDocs(collection(dbInstance, 'customers'));
    const customers = snapshot.docs.map(record => ({ ...record.data(), id: record.id })) as Customer[];
    const oldCustomer = customers.find(customer => customer.id === id);
    const proposedPhone = normalizeCustomerPhone(data.phone ?? oldCustomer?.phone ?? '');
    if (customers.some(customer => customer.id !== id && normalizeCustomerPhone(customer.phone) === proposedPhone)) throw new Error('A customer with this phone number already exists.');
    let legacySales: Sale[] = [];
    if (oldCustomer && ((data.phone != null && data.phone !== oldCustomer.phone) || (data.name != null && data.name !== oldCustomer.name))) {
      const sales = await getDocs(collection(dbInstance, 'sales'));
      legacySales = getCustomerSales(sales.docs.map(record => ({ ...record.data(), id: record.id })) as Sale[], oldCustomer, customers).filter(sale => !sale.customerId);
      if (legacySales.length > 400) throw new Error('This profile has too many legacy invoices to update safely in one operation. Contact an administrator to link its history first.');
    }
    return runTransaction(dbInstance, async transaction => {
      const previous = await transaction.get(ref);
      if (id && !previous.exists()) throw new Error('Customer no longer exists. Refresh the directory.');
      const previousCustomer = previous.data() as Customer | undefined;
      if (expectedUpdatedAt !== undefined && (previousCustomer?.updatedAt || 0) !== expectedUpdatedAt) throw new Error('This customer was updated by another attendant. Refresh the profile before saving.');
      if (oldCustomer && (previousCustomer?.name !== oldCustomer.name || previousCustomer?.phone !== oldCustomer.phone)) throw new Error('Customer contact details changed elsewhere. Refresh and try again.');
      const customer = { ...(previousCustomer || {}), ...data, id: customerId, updatedAt: Date.now(), updatedBy: actor } as Customer;
      customer.status = customerStatus(customer.status);
      validateRecord('customers', customer);
      validateCustomerContact(customer.name, customer.phone, customer.email);
      if (!['Active', 'Inactive', 'Blacklisted'].includes(customer.status)) throw new Error('Choose a valid customer status.');
      if (!['Retail', 'Wholesale', 'Middle Man', 'VIP'].includes(customer.category)) throw new Error('Choose a valid customer category.');
      if (customer.status !== 'Active' && customer.status !== previousCustomer?.status && !customer.statusReason?.trim()) throw new Error('Add a reason for this account restriction.');
      const phone = normalizeCustomerPhone(customer.phone);
      const phoneRef = doc(dbInstance, 'customerPhones', phone);
      const owner = await transaction.get(phoneRef);
      if (owner.exists() && owner.data().customerId !== customerId) throw new Error('A customer with this phone number already exists.');
      const oldPhone = normalizeCustomerPhone(previousCustomer?.phone);
      let oldPhoneRef: any;
      let releaseOldPhone = false;
      if (oldPhone && oldPhone !== phone) {
        oldPhoneRef = doc(dbInstance, 'customerPhones', oldPhone);
        const oldOwner = await transaction.get(oldPhoneRef);
        releaseOldPhone = oldOwner.exists() && (oldOwner.data() as { customerId?: string }).customerId === customerId;
      }
      const links = [];
      for (const sale of legacySales) {
        const saleRef = doc(dbInstance, 'sales', sale.id!);
        const current = await transaction.get(saleRef);
        if (current.exists() && !current.data().customerId && getCustomerSales([{ ...current.data(), id: sale.id } as Sale], oldCustomer!, customers).length) links.push({ ref: saleRef, revision: (current.data().revision || 0) + 1 });
      }
      if (releaseOldPhone) transaction.delete(oldPhoneRef);
      transaction.set(phoneRef, { customerId });
      for (const link of links) transaction.update(link.ref, { customerId, revision: link.revision });
      transaction.set(ref, sanitizeData(customer));
      transaction.set(doc(collection(dbInstance, 'auditLogs')), { action: id ? 'Customer profile updated' : 'Customer created', entityType: 'Customer', entityId: customerId, user: actor, timestamp: Date.now(), details: `${customer.name}: ${customer.status}`, changedFields: Object.keys(data), ...(previousCustomer ? { previousStatus: previousCustomer.status || 'Active' } : {}) });
      return customer;
    });
  },
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
  lookupPhoneImei: async (imei: string): Promise<{ status: string; sale?: Sale; productName?: string }> => {
    validateImeis([imei], 1);
    if (!dbInstance) throw new Error('Database is unavailable.');
    const registration = await getDoc(doc(dbInstance, 'phoneImeis', imei));
    if (!registration.exists()) return { status: 'Not found' };
    const entry = registration.data();
    if (entry.saleId) {
      const snapshot = await getDoc(doc(dbInstance, COLLECTIONS.sales, entry.saleId));
      if (!snapshot.exists()) throw new Error('The linked sale could not be found. Review this IMEI registration.');
      const sale = { ...snapshot.data(), id: snapshot.id } as Sale;
      if (!sale.items.some(item => item.productId === entry.productId && itemImeis(item).includes(imei))) throw new Error('The IMEI registration does not match the linked invoice. Review the inventory record.');
      return { status: 'Sold', sale };
    }
    if (entry.status === 'Sold') throw new Error('This sold IMEI has no linked invoice. Review its inventory registration.');
    const product = entry.productId ? await getDoc(doc(dbInstance, COLLECTIONS.products, entry.productId)) : null;
    if (entry.status === 'Available' && (!product?.exists() || !product.data().imeis?.includes(imei))) throw new Error('The IMEI registration does not match available inventory. Refresh or review this phone record.');
    return { status: entry.status || 'Not found', ...(product?.exists() ? { productName: product.data().name } : {}) };
  },
  // Sale and inventory writes commit together, using fresh stock inside the transaction.
  commitSale: async (sale: Sale, allowNegativeStock = false, mode: 'create' | 'edit' = 'create', actor = sale.cashierName) => {
    if (!sale.id || !dbInstance) throw new Error('Sale reference or database is unavailable.');
    validateItems(sale.items);
    const totals = calculateSaleTotals(sale.items, sale.globalDiscountPercentage ?? 0, sale.taxPercentage ?? 0);
    const saleType = sale.saleType || getSaleType({ total: totals.total, amountPaid: sale.amountPaid });
    validatePayment(totals.total, sale.amountPaid, sale.paymentMethod, saleType);
    const walkIn = sale.customerKind === 'Walk-in';
    if (walkIn) {
      if (!sale.walkInName?.trim()) throw new Error('Enter the walk-in customer name for the receipt.');
      if (sale.walkInName.trim().length > 100) throw new Error('Enter a customer name of up to 100 characters.');
      if (sale.customerPhone?.trim()) validateCustomerContact(sale.walkInName, sale.customerPhone);
      if (saleType !== 'Cash sale') throw new Error('Walk-in sales must be paid in full. Select a registered customer for debt or partial sales.');
    } else if (!sale.customerId || !sale.customerName?.trim() || !sale.customerPhone?.trim()) throw new Error('Select a customer with a name and phone number before saving any sale.');
    const amountDue = outstandingAmount({ total: totals.total, amountPaid: sale.amountPaid });
    const cleanSale = sanitizeData({ ...sale, ...totals, saleType, customerKind: walkIn ? 'Walk-in' : 'Registered', invoiceNo: sale.invoiceNo || sale.receiptNo,
      ...(walkIn ? { customerId: null, customerName: 'Walk-in', walkInName: sale.walkInName!.trim() } : { walkInName: null }),
      ...(sale.amountPaid > 0 ? { initialReceiptNo: receiptNumber(sale.id), initialBalanceAfter: amountDue } : {}),
      amountPaid: money(Math.min(sale.amountPaid, totals.total)), amountDue, balance: amountDue, changeDue: money(Math.max(0, sale.amountPaid - totals.total)),
      items: sale.items.map(item => ({ ...item, ...(item.imeis ? { imeis: itemImeis(item) } : {}), total: money(item.price * item.quantity) })) });
    const saleRef = doc(dbInstance, COLLECTIONS.sales, sale.id);
    let committedStock: Product[] = [];
    return runTransaction(dbInstance, async transaction => {
      committedStock = [];
      const existing = await transaction.get(saleRef);
      if (mode === 'create' && existing.exists()) return { ...existing.data(), id: existing.id } as Sale;
      if (!walkIn) {
        const customer = await transaction.get(doc(dbInstance, COLLECTIONS.customers, sale.customerId!));
        if (!customer.exists() || customer.data().status === 'Blacklisted') throw new Error('Select an existing customer who is not blacklisted.');
        if (mode === 'create' && customer.data().status === 'Inactive') throw new Error('This customer is inactive. Reactivate the account before creating a new sale.');
        if (!customer.data().name?.trim() || !customer.data().phone?.trim()) throw new Error('Update the customer name and phone before completing the sale.');
        cleanSale.customerName = customer.data().name;
        cleanSale.customerPhone = customer.data().phone;
      }
      if (mode === 'edit' && !existing.exists()) throw new Error('This sale no longer exists. Refresh sales history.');
      if (mode === 'edit' && (existing.data()?.revision || 0) !== (sale.revision || 0)) throw new Error('This sale was changed elsewhere. Refresh history before editing.');
      if (mode === 'edit') {
        const previous = existing.data() as Sale;
        const received = money(Math.min(previous.total, previous.amountPaid));
        if (totals.total < received) throw new Error('The revised total is less than payments already received. Refunds must be recorded separately before reducing this invoice.');
        if (sale.amountPaid !== previous.amountPaid || JSON.stringify(sale.payments || []) !== JSON.stringify(previous.payments || [])) throw new Error('Use Record payment to change payments. Editing an invoice cannot rewrite payment history.');
        cleanSale.receiptNo = previous.receiptNo;
        cleanSale.invoiceNo = previous.invoiceNo || previous.receiptNo;
        if (previous.initialReceiptNo) cleanSale.initialReceiptNo = previous.initialReceiptNo;
        cleanSale.initialBalanceAfter = previous.initialBalanceAfter ?? money(Math.max(0, previous.total - Math.max(0, received - (previous.payments || []).reduce((sum, payment) => sum + payment.amount, 0))));
        if (walkIn !== (previous.customerKind === 'Walk-in')) throw new Error('The customer type of a completed sale cannot be changed.');
        cleanSale.amountPaid = received;
        cleanSale.amountDue = cleanSale.balance = outstandingAmount({ total: totals.total, amountPaid: received });
        cleanSale.saleType = getSaleType({ total: totals.total, amountPaid: received });
        cleanSale.changeDue = previous.changeDue ?? Math.max(0, previous.amountPaid - previous.total);
        cleanSale.paymentMethod = previous.paymentMethod;
        cleanSale.paymentReference = previous.paymentReference || '';
        cleanSale.timestamp = previous.timestamp;
        cleanSale.cashierName = previous.cashierName;
        if (walkIn && cleanSale.amountDue > 0) throw new Error('A walk-in invoice must remain paid in full. Register the customer before creating a credit sale.');
      }
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
        stockUpdates.push({ ref, quantity, product: { ...product, id, stockQuantity: quantity, ...(availableImeis ? { imeis: availableImeis } : {}) }, ...(availableImeis ? { imeis: availableImeis } : {}) });
      }
      for (const { ref, quantity, imeis } of stockUpdates) transaction.update(ref, { stockQuantity: quantity, ...(imeis ? { imeis } : {}) });
      for (const write of imeiWrites) transaction.set(write.ref, write.data);
      committedStock = stockUpdates.map(update => update.product);
      transaction.set(saleRef, cleanSale);
      transaction.set(doc(collection(dbInstance, COLLECTIONS.auditLogs)), {
        action: mode === 'edit' ? 'Sale updated' : 'Sale created', entityType: 'Sale', entityId: sale.id,
        user: actor, timestamp: Date.now(), details: `${cleanSale.receiptNo}: ${cleanSale.total}`,
        ...(existing.exists() ? { previousSale: existing.data() } : {})
      });
      return cleanSale as Sale;
    }).then(result => {
      // Checkout already read these exact products in its successful transaction.
      // Reuse that result for the immediate UI refresh instead of charging more reads.
      for (const product of committedStock) displayReads.seed(`products:doc:${product.id}`, product);
      return result;
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
      const updated = { ...sale, amountPaid, amountDue, balance: amountDue, changeDue: sale.changeDue || 0,
        saleType: getSaleType({ ...sale, amountPaid }), revision: (sale.revision || 0) + 1,
        payments: [...(sale.payments || []), { ...payment, receiptNo: receiptNumber(id, payment.id), balanceAfter: amountDue, amount }] };
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
    throw new Error("Cloud database resets must be performed by an administrator. No data has been erased.");
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

    const category = await db.expenseCategories.toCollection().first();
    if (!category) {
      const defaults = ['Rent', 'Utilities', 'Staff Lunch', 'Transport', 'Supplies', 'Taxes', 'Maintenance', 'Others'];
      for (const name of defaults) await db.expenseCategories.add({ name });
    }

    // Ensure Admin
    const existingUser = await db.users.toCollection().first();
    if (!existingUser) {
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
