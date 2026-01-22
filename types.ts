
export enum UserRole {
  ADMIN = 'Admin',
  MANAGER = 'Manager',
  CASHIER = 'Cashier',
  TECHNICIAN = 'Technician',
  AUDITOR = 'Auditor'
}

export enum RepairStatus {
  RECEIVED = 'Received',
  DIAGNOSING = 'Diagnosing',
  WAITING_FOR_PARTS = 'Waiting for Parts',
  IN_REPAIR = 'In Repair',
  COMPLETED = 'Completed',
  DELIVERED = 'Delivered',
  CANCELLED = 'Cancelled'
}

export enum ProductType {
  PHONE = 'Phone',
  ACCESSORY = 'Accessory',
  SPARE_PART = 'Spare Part',
  OTHERS = 'Others'
}

export enum CustomerCategory {
  RETAIL = 'Retail',
  WHOLESALE = 'Wholesale',
  MIDDLE_MAN = 'Middle Man',
  VIP = 'VIP'
}

export enum CustomerStatus {
  ACTIVE = 'Active',
  INACTIVE = 'Inactive',
  BLACKLISTED = 'Blacklisted'
}

export interface User {
  id?: string;
  username: string;
  fullName?: string;
  phone?: string;
  role: UserRole;
  password?: string;
  fingerprintId?: string;
  lastLogin?: number;
  isActive?: boolean;
}

export interface Product {
  id?: string;
  sku: string;
  name: string;
  type: ProductType;
  brand?: string;
  category: string;
  supplierId?: string;
  costPrice: number;
  middleManPrice?: number;
  selling_price: number;
  minSellingPrice?: number;
  stockQuantity: number;
  reorderLevel: number;
  warrantyPeriod?: string;
  location?: string;
}

export interface Agent {
  id?: string;
  name: string;
  phone: string;
  email?: string;
  nin?: string;
  location?: string;
  status: 'Active' | 'Inactive';
  joinedDate: number;
  notes?: string;
}

export interface Customer {
  id?: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  tin?: string;
  nin?: string;
  category: CustomerCategory;
  status: CustomerStatus;
  notes?: string;
  joinedDate: number;
  totalSpending?: number;
  visitCount?: number;
  balance?: number;
}

export interface Loan {
  id?: string;
  agentId?: string;
  customerName: string;
  customerPhone: string;
  customerNIN?: string;
  deviceModel: string;
  productId?: string;
  imei: string;
  provider: string;
  deposit: number;
  totalLoanAmount: number;
  dailyInstallment?: number;
  startDate: number;
  status: 'Active' | 'Completed' | 'Defaulted' | 'Repossessed' | 'Sold';
  notes?: string;
  timestamp: number;
  issuedBy: string;
  soldDate?: number;
  remittedAmount?: number;
}

export interface StockLog {
  id?: string;
  productId: string;
  productName: string;
  previousStock: number;
  newStock: number;
  changeAmount: number;
  reason: string;
  note?: string;
  user: string;
  timestamp: number;
}

export interface AuditLog {
  id?: string;
  action: string;
  details: string;
  user: string;
  timestamp: number;
  entityId?: string;
  entityType?: 'User' | 'Product' | 'Sale' | 'Settings' | 'System';
}

export interface ExpenseCategory {
  id?: string;
  name: string;
}

export interface Expense {
  id?: string;
  category: string;
  description: string;
  amount: number;
  date: number;
  paidBy: string;
}

export interface SaleItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  originalPrice?: number;
  total: number;
  warrantyEndDate?: number;
  sn?: string;
}

export interface Sale {
  id?: string;
  receiptNo: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  tax?: number;
  total: number;
  amountPaid: number;
  balance: number;
  paymentMethod: 'Cash' | 'Mobile Money' | 'Bank' | 'Credit';
  cashierName: string;
  customerName?: string;
  customerPhone?: string;
  customerType?: 'Retail' | 'Wholesale' | 'Middle Man';
  globalDiscountPercentage?: number; // Added to store global discount applied
  timestamp: number;
  isSynced?: boolean;
}

export interface Repair {
  id?: string;
  jobCardNo: string;
  customerName: string;
  customerPhone: string;
  deviceModel: string;
  issue: string;
  accessoriesLeft: string[];
  status: RepairStatus;
  technicianId?: string;
  estimatedCost: number;
  depositPaid: number;
  partsUsed: { productId: string; name: string; cost: number }[];
  timestamp: number;
  completionDate?: number;
  isPaid: boolean;
}

export interface Supplier {
  id?: string;
  name: string;
  contactPerson: string;
  phone: string;
  email?: string;
  address?: string;
}

export interface PurchaseItem {
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface Purchase {
  id?: string;
  supplierId: string;
  supplierName: string;
  invoiceNo?: string;
  items: PurchaseItem[];
  totalAmount: number;
  status: 'Ordered' | 'Received';
  timestamp: number;
  receivedBy: string;
  notes?: string;
}

export interface HardwareConfig {
  printerIp?: string;
  printerType?: 'network' | 'bluetooth' | 'usb';
  printerPaperWidth?: '58mm' | '80mm';
  autoPrintReceipt?: boolean;
  barcodeScannerPrefix?: string;
  barcodeScannerSuffix?: string;
}

export interface AppSettings {
  id?: string;
  businessName: string;
  tagline: string;
  address: string;
  phone: string;
  tin?: string;
  logo?: string;
  receiptHeader: string;
  receiptFooter: string;
  receiptFormat?: 'thermal' | 'a4';
  receiptFooterFontSize?: number;
  receiptFooterBold?: boolean;
  receiptFooterItalic?: boolean;
  receiptFooterAlign?: 'left' | 'center' | 'right';
  receiptShowLogo?: boolean;
  receiptShowTaxDetail?: boolean;
  receiptShowCashier?: boolean;
  receiptShowQRCode?: boolean;
  receiptFont?: 'monospace' | 'sans' | 'serif';
  receiptFontSize?: number;
  receiptLineHeight?: number;
  theme: 'light' | 'dark';
  themeColor?: string;
  currency?: string;
  dateFormat?: 'dd/MM/yyyy' | 'MM/dd/yyyy' | 'yyyy-MM-dd';
  taxEnabled?: boolean;
  taxPercentage?: number;
  invoicePrefix?: string;
  hardware?: HardwareConfig;
  enableNegativeStock?: boolean;
  globalLowStockThreshold?: number;
  defaultLaborRate?: number;
  commonIssues?: string;
  aiStockForecast?: boolean;
  aiFaultDiagnosis?: boolean;
  aiPriceOptimization?: boolean;
}
