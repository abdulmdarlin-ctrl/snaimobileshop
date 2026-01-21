
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc
} from 'firebase/firestore';
import { dbInstance, createSecondaryUser } from './firebaseConfig';
import { Product, Sale, Repair, Supplier, User, AppSettings, UserRole, Expense, ExpenseCategory, StockLog, AuditLog, Purchase, Loan, Agent } from './types';

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
  const cache = new Set();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (
        value.nodeType ||
        value === window ||
        (value.$$typeof && Symbol.keyFor && Symbol.keyFor(value.$$typeof) === 'react.element')
      ) {
        return;
      }
      if (cache.has(value)) {
        return;
      }
      cache.add(value);
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
      const cleanData = sanitizeData(data);
      const docRef = await addDoc(getColRef(), cleanData);
      return { ...data, id: docRef.id };
    },

    update: async (id: string, data: Partial<T>) => {
      const cleanData = sanitizeData(data);
      const docRef = doc(dbInstance!, collectionName, id);
      await updateDoc(docRef, cleanData);
    },

    delete: async (id: string) => {
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
export const db = {
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
  getStatus: () => 'live',
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
