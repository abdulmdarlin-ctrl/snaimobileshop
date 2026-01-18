
import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp, getApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { db } from '../db';
import { AppSettings, User, UserRole, ProductType, AuditLog } from '../types';
import { Page } from '../App';
import {
   Save, Users, Receipt, Database, Store, ChevronRight,
   Loader2, Download, Plus, Edit2, Fingerprint,
   Smartphone, MapPin, CreditCard, ScrollText, FileText,
   AlignLeft, AlignCenter, AlignRight, Type, AlertTriangle, HardDrive,
   Printer, Check, RefreshCw, Shield, Key, Clock, Activity,
   Search, CheckCircle2, XCircle, Eye, EyeOff, Lock, UserPlus, Trash2,
   User as UserIcon, Scan, Power, Globe, BarChart2, Hash, FileInput, Upload,
   Cpu, Wifi, Bluetooth, ScanBarcode, FileJson, History, X, Filter, Calendar, ChevronDown, Image as ImageIcon
} from 'lucide-react';
import { useToast } from './Toast';

interface SettingsProps {
   user: User;
   onNavigate: (page: Page) => void;
   onSettingsChange?: () => void;
}

type TabId = 'general' | 'users' | 'receipts' | 'hardware' | 'database' | 'audit' | 'profile';

// Helper for safe JSON stringification
const safeStringify = (obj: any, indent = 0) => {
   const cache = new Set();
   return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
         if (cache.has(value)) {
            return; // Duplicate reference found, discard key
         }
         cache.add(value);
      }
      return value;
   }, indent);
};

const ToggleSwitch = ({ checked, onChange }: { checked: boolean; onChange: (val: boolean) => void }) => (
   <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-12 h-6 rounded-full transition-colors relative ${checked ? 'bg-emerald-500' : 'bg-slate-200'}`}
   >
      <div className={`w-4 h-4 rounded-full bg-white shadow-sm absolute top-1 transition-transform ${checked ? 'left-7' : 'left-1'}`} />
   </button>
);

const Settings: React.FC<SettingsProps> = ({ user: currentUser, onNavigate, onSettingsChange }) => {
   const { showToast } = useToast();
   const [activeTab, setActiveTab] = useState<TabId>('profile'); // Default to profile for safety
   const [settings, setSettings] = useState<AppSettings | null>(null);
   const [users, setUsers] = useState<User[]>([]);
   const [loading, setLoading] = useState(true);
   const [saving, setSaving] = useState(false);
   const [userSaving, setUserSaving] = useState(false);

   // Database Stats
   const [dbStats, setDbStats] = useState({ size: '0 KB', percentage: 0 });

   // Import/Restore State
   const [isImportModalOpen, setIsImportModalOpen] = useState(false);
   const [importText, setImportText] = useState('');
   const [importing, setImporting] = useState(false);
   const [restoreFile, setRestoreFile] = useState<File | null>(null);
   const [restoring, setRestoring] = useState(false);

   // Audit Logs State
   const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
   const [auditLimit, setAuditLimit] = useState(50);

   // Audit Filters
   const [auditUserFilter, setAuditUserFilter] = useState('All');
   const [auditActionFilter, setAuditActionFilter] = useState('All');
   const [auditStartDate, setAuditStartDate] = useState('');
   const [auditEndDate, setAuditEndDate] = useState('');

   // Clear Logs State
   const [isClearLogsConfirmOpen, setIsClearLogsConfirmOpen] = useState(false);
   const [clearingLogs, setClearingLogs] = useState(false);

   // User Management State
   const [isUserModalOpen, setIsUserModalOpen] = useState(false);
   const [userToDelete, setUserToDelete] = useState<User | null>(null);
   const [isDeletingUser, setIsDeletingUser] = useState(false);
   const [editingUser, setEditingUser] = useState<User | null>(null);
   const [userSearch, setUserSearch] = useState('');
   const [showPassword, setShowPassword] = useState(false);
   const [isScanning, setIsScanning] = useState(false);

   const [userForm, setUserForm] = useState<Partial<User>>({
      username: '', fullName: '', phone: '', role: UserRole.CASHIER, password: '', fingerprintId: '', isActive: true
   });

   const isAdmin = currentUser.role === UserRole.ADMIN;

   const themeColors = [
      { name: 'Rose', hex: '#ef4444', class: 'bg-rose-500' },
      { name: 'Blue', hex: '#3b82f6', class: 'bg-blue-500' },
      { name: 'Emerald', hex: '#10b981', class: 'bg-emerald-500' },
      { name: 'Violet', hex: '#8b5cf6', class: 'bg-violet-500' },
      { name: 'Orange', hex: '#f97316', class: 'bg-orange-500' },
   ];

   useEffect(() => {
      loadData();
      // Force active tab to profile if not admin
      if (!isAdmin) {
         setActiveTab('profile');
      } else {
         setActiveTab('general');
      }
   }, [isAdmin]);

   useEffect(() => {
      if (activeTab === 'database') calculateStorage();
      if (activeTab === 'audit') loadAuditLogs();
   }, [activeTab, auditLimit]);

   const loadData = async () => {
      setLoading(true);
      try {
         const [s, u] = await Promise.all([
            db.settings.toCollection().first(),
            db.users.toArray()
         ]);

         const initialSettings: AppSettings = s || {
            businessName: 'SNA! MOBILE SHOP',
            tagline: 'ERP Operations',
            address: 'Kampala, Uganda',
            phone: '+256 700 000 000',
            currency: 'UGX',
            taxEnabled: true,
            taxPercentage: 18,
            receiptHeader: 'SNA! SHOP',
            receiptFooter: 'Thank you for shopping with us!',
            receiptFooterFontSize: 10,
            receiptFooterAlign: 'center',
            receiptFormat: 'thermal',
            receiptShowLogo: true,
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
         };

         setSettings(initialSettings);
         setUsers(u);
      } finally {
         setLoading(false);
      }
   };

   const loadAuditLogs = async () => {
      try {
         const allLogs = await db.auditLogs.toArray();
         const logs = allLogs.sort((a, b) => b.timestamp - a.timestamp).slice(0, auditLimit);
         setAuditLogs(logs);
      } catch (e) {
         console.error("Failed to load audit logs", e);
      }
   };

   // --- Audit Filtering Logic ---
   const uniqueAuditUsers = useMemo(() => {
      const fromLogs = new Set(auditLogs.map(l => l.user));
      users.forEach(u => fromLogs.add(u.username));
      return Array.from(fromLogs).sort();
   }, [auditLogs, users]);

   const uniqueAuditActions = useMemo(() => {
      return Array.from(new Set(auditLogs.map(l => l.action))).sort();
   }, [auditLogs]);

   const filteredAuditLogs = useMemo(() => {
      return auditLogs.filter(log => {
         const matchesUser = auditUserFilter === 'All' || log.user === auditUserFilter;
         const matchesAction = auditActionFilter === 'All' || log.action === auditActionFilter;
         let matchesDate = true;

         if (auditStartDate) {
            const start = new Date(auditStartDate).setHours(0, 0, 0, 0);
            if (log.timestamp < start) matchesDate = false;
         }
         if (auditEndDate) {
            const end = new Date(auditEndDate).setHours(23, 59, 59, 999);
            if (log.timestamp > end) matchesDate = false;
         }

         return matchesUser && matchesAction && matchesDate;
      });
   }, [auditLogs, auditUserFilter, auditActionFilter, auditStartDate, auditEndDate]);

   const clearAuditFilters = () => {
      setAuditUserFilter('All');
      setAuditActionFilter('All');
      setAuditStartDate('');
      setAuditEndDate('');
   };

   const calculateStorage = async () => {
      try {
         const [products, sales, repairs, expenses, stockLogs] = await Promise.all([
            db.products.toArray(),
            db.sales.toArray(),
            db.repairs.toArray(),
            db.expenses.toArray(),
            db.stockLogs.toArray()
         ]);
         const data = safeStringify({ products, sales, repairs, expenses, stockLogs });
         const bytes = new Blob([data]).size;
         const kb = (bytes / 1024).toFixed(1);
         const percent = Math.min(100, (bytes / (5 * 1024 * 1024)) * 100);

         setDbStats({ size: `${kb} KB`, percentage: percent });
      } catch (e) {
         console.error("Storage calc failed", e);
         setDbStats({ size: 'Unknown', percentage: 0 });
      }
   };

   const handleSaveSettings = async () => {
      if (!settings) return;
      setSaving(true);
      try {
         await db.settings.put(settings);

         if (settings.themeColor) {
            document.documentElement.style.setProperty('--sna-primary', settings.themeColor);
         }

         await logAudit('SETTINGS_UPDATE', 'System configuration updated');

         if (onSettingsChange) {
            onSettingsChange();
         }

         await new Promise(resolve => setTimeout(resolve, 800));
         showToast("System Configuration Updated Successfully.", 'success');
      } catch (err) {
         showToast("Failed to save settings", 'error');
      } finally {
         setSaving(false);
      }
   };

   const handleImportProducts = async () => {
      if (!importText.trim()) return;
      setImporting(true);
      try {
         const lines = importText.trim().split('\n');
         let count = 0;
         for (const line of lines) {
            const parts = line.split(',');
            if (parts.length >= 2) {
               const [name, sku, category, cost, price, stock] = parts.map(p => p.trim());
               await db.products.add({
                  name: name,
                  sku: sku || `SKU-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                  category: category || 'General',
                  type: ProductType.SPARE_PART,
                  costPrice: Number(cost) || 0,
                  selling_price: Number(price) || 0,
                  stockQuantity: Number(stock) || 0,
                  reorderLevel: settings?.globalLowStockThreshold || 5
               } as any);
               count++;
            }
         }
         await logAudit('DATA_IMPORT', `Bulk imported ${count} products`);
         showToast(`Successfully imported ${count} items.`, 'success');
         setImportText('');
         setIsImportModalOpen(false);
      } catch (e) {
         showToast("Import failed. Please check CSV format.", 'error');
      } finally {
         setImporting(false);
      }
   };

   const handleBackup = async () => {
      try {
         const [
            settingsData, products, sales, usersData,
            repairs, suppliers, expenses, expenseCategories, stockLogs, auditLogsData
         ] = await Promise.all([
            db.settings.toCollection().first(),
            db.products.toArray(),
            db.sales.toArray(),
            db.users.toArray(),
            db.repairs.toArray(),
            db.suppliers.toArray(),
            db.expenses.toArray(),
            db.expenseCategories.toArray(),
            db.stockLogs.toArray(),
            db.auditLogs.toArray()
         ]);

         const backupData = {
            meta: {
               version: '1.0',
               timestamp: new Date().toISOString(),
               app: 'SNA Mobile ERP'
            },
            data: {
               settings: settingsData,
               products,
               sales,
               users: usersData,
               repairs,
               suppliers,
               expenses,
               expenseCategories,
               stockLogs,
               auditLogs: auditLogsData
            }
         };

         const blob = new Blob([safeStringify(backupData, 2)], { type: 'application/json' });
         const url = URL.createObjectURL(blob);
         const link = document.createElement('a');
         link.href = url;
         link.download = `SNA_Backup_${new Date().toISOString().split('T')[0]}.json`;
         document.body.appendChild(link);
         link.click();
         document.body.removeChild(link);
         await logAudit('DATA_BACKUP', 'Full system backup generated');
      } catch (e) {
         console.error(e);
         showToast("Backup generation failed.", 'error');
      }
   };

   const handleRestore = async () => {
      if (!restoreFile) return;
      if (!confirm("WARNING: This will merge the backup data into your current system. Existing IDs may cause conflicts. Proceed?")) return;

      setRestoring(true);
      const reader = new FileReader();
      reader.onload = async (e) => {
         try {
            const json = JSON.parse(e.target?.result as string);
            const data = json.data;

            if (!data) throw new Error("Invalid backup format");

            if (data.products) await Promise.all(data.products.map((p: any) => db.products.add(p)));
            if (data.sales) await Promise.all(data.sales.map((s: any) => db.sales.add(s)));
            if (data.repairs) await Promise.all(data.repairs.map((r: any) => db.repairs.add(r)));
            if (data.suppliers) await Promise.all(data.suppliers.map((s: any) => db.suppliers.add(s)));
            if (data.expenses) await Promise.all(data.expenses.map((ex: any) => db.expenses.add(ex)));
            if (data.expenseCategories) await Promise.all(data.expenseCategories.map((ec: any) => db.expenseCategories.add(ec)));
            if (data.stockLogs) await Promise.all(data.stockLogs.map((sl: any) => db.stockLogs.add(sl)));
            if (data.settings) await db.settings.put(data.settings);

            await logAudit('DATA_RESTORE', 'System data restored from backup file');
            showToast("Data restored successfully. Reloading...", 'success');
            window.location.reload();
         } catch (err) {
            showToast("Restore failed. Invalid file or data corruption.", 'error');
            console.error(err);
         } finally {
            setRestoring(false);
            setRestoreFile(null);
         }
      };
      reader.readAsText(restoreFile);
   };

   const handleFactoryReset = async () => {
      const confirmation = prompt('CRITICAL WARNING: This will permanently erase all business data. Type "CONFIRM" to proceed.');
      if (confirmation === 'CONFIRM') {
         try {
            await logAudit('SYSTEM_RESET', 'Factory reset initiated');
            await db.resetSystem();
            showToast("System reset successful. Reloading.", 'success');
            localStorage.clear();
            window.location.reload();
         } catch (err) {
            showToast("Reset operation failed.", 'error');
         }
      }
   };

   const handleDeleteUser = (user: User) => {
      if (currentUser.id === user.id) {
         showToast("Action Denied: You cannot delete your own active account.", 'error');
         return;
      }
      setUserToDelete(user);
   };

   const confirmDeleteUser = async () => {
      if (!userToDelete || !userToDelete.id) return;
      setIsDeletingUser(true);
      try {
         await db.users.delete(userToDelete.id);
         await logAudit('USER_DELETE', `Deleted user: ${userToDelete.username}`);
         setUsers(prev => prev.filter(u => u.id !== userToDelete.id));
         setUserToDelete(null);
         showToast('User deleted successfully', 'success');
      } catch (err) {
         console.error("Failed to delete", err);
         showToast("Failed to delete user.", 'error');
      } finally {
         setIsDeletingUser(false);
      }
   };

   const handleToggleStatus = async (user: User) => {
      if (user.id === currentUser.id) {
         showToast("Action Denied: You cannot suspend your own active session.", 'error');
         return;
      }
      const newStatus = !(user.isActive ?? true);
      const action = newStatus ? 'Activate' : 'Suspend';
      if (confirm(`Are you sure you want to ${action.toUpperCase()} ${user.username}'s account?`)) {
         await db.users.update(user.id!, { isActive: newStatus });
         await logAudit('USER_STATUS_CHANGE', `${action}d user: ${user.username}`);
         loadData();
         showToast(`User ${action}d`, 'success');
      }
   };

   const initiateClearLogs = () => {
      setIsClearLogsConfirmOpen(true);
   };

   const performClearLogs = async () => {
      setClearingLogs(true);
      try {
         const allLogs = await db.auditLogs.toArray();
         await Promise.all(allLogs.map(log => log.id ? db.auditLogs.delete(log.id) : Promise.resolve()));

         await logAudit('SYSTEM_LOGS_CLEARED', 'Audit history purged by administrator');
         loadAuditLogs();
         setIsClearLogsConfirmOpen(false);
         showToast('Audit logs cleared', 'success');
      } catch (e) {
         console.error("Clear failed", e);
         showToast("Failed to clear logs.", 'error');
      } finally {
         setClearingLogs(false);
      }
   };

   const logAudit = async (action: string, details: string) => {
      try {
         await db.auditLogs.add({
            action,
            details,
            user: currentUser.username,
            timestamp: Date.now(),
            entityType: 'Settings'
         });
      } catch (e) { console.error("Audit log error", e); }
   };

   const handleUserSave = async () => {
      if (!userForm.username) return showToast("Username required", 'error');
      // Only require password for new users
      if (!editingUser && !userForm.password) return showToast("Password required for new users", 'error');

      setUserSaving(true);
      try {
         if (editingUser?.id) {
            // Update existing user (standard firestore update)
            await db.users.update(editingUser.id, userForm);
            await logAudit('USER_UPDATE', `Updated user: ${userForm.username}`);
         } else {
            // Create new user using a secondary app to avoid logging out the admin
            const secondaryApp = initializeApp(getApp().options, 'Secondary');
            const secondaryAuth = getAuth(secondaryApp);

            // Construct email from username if needed
            let loginEmail = userForm.username!.trim();
            if (!loginEmail.includes('@')) {
               loginEmail = `${loginEmail}@sna.erp`;
            }

            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, loginEmail, userForm.password!);
            const newUser = { ...userForm, id: userCredential.user.uid, lastLogin: 0 };

            // Save to Firestore using main app's db connection
            await db.users.add(newUser as User);

            // Cleanup secondary app
            await signOut(secondaryAuth);
            await deleteApp(secondaryApp);

            await logAudit('USER_CREATE', `Created user: ${userForm.username}`);
         }
         setIsUserModalOpen(false);
         loadData();
         showToast('User saved successfully', 'success');
      } catch (e: any) {
         console.error("User op failed", e);
         let msg = "Operation failed";
         if (e.code === 'auth/email-already-in-use') msg = "Username/Email already taken";
         if (e.code === 'auth/weak-password') msg = "Password too weak (min 6 chars)";
         showToast(msg, 'error');
      } finally {
         setUserSaving(false);
      }
   };

   const menuItems = [
      ...(isAdmin ? [
         { id: 'general', label: 'General & Theme', icon: Store, color: 'text-rose-500', bg: 'bg-rose-50' },
         { id: 'users', label: 'Users & Security', icon: Users, color: 'text-blue-500', bg: 'bg-blue-50' },
         { id: 'hardware', label: 'Hardware Config', icon: Cpu, color: 'text-emerald-500', bg: 'bg-emerald-50' },
         { id: 'receipts', label: 'Receipt & Invoicing', icon: Receipt, color: 'text-orange-500', bg: 'bg-orange-50' },
         { id: 'database', label: 'Data & Backup', icon: Database, color: 'text-violet-500', bg: 'bg-violet-50' },
         { id: 'audit', label: 'Audit Logs', icon: History, color: 'text-slate-500', bg: 'bg-slate-100' },
      ] : []),
      { id: 'profile', label: 'My Profile', icon: UserIcon, color: 'text-blue-500', bg: 'bg-blue-50' }
   ];

   const getRoleBadgeColor = (role: UserRole) => {
      switch (role) {
         case UserRole.ADMIN: return 'bg-rose-100 text-rose-700 border-rose-200';
         case UserRole.MANAGER: return 'bg-indigo-100 text-indigo-700 border-indigo-200';
         case UserRole.TECHNICIAN: return 'bg-amber-100 text-amber-700 border-amber-200';
         case UserRole.CASHIER: return 'bg-emerald-100 text-emerald-700 border-emerald-200';
         case UserRole.AUDITOR: return 'bg-slate-100 text-slate-700 border-slate-200';
         default: return 'bg-slate-100 text-slate-600';
      }
   };

   const filteredUsers = users.filter(u =>
      u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
      (u.fullName && u.fullName.toLowerCase().includes(userSearch.toLowerCase()))
   );

   if (loading || !settings) {
      return (
         <div className="h-full flex flex-col items-center justify-center space-y-4 animate-pulse">
            <Loader2 className="w-10 h-10 text-slate-300 animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-[4px] text-slate-400">Loading Configuration...</p>
         </div>
      );
   }

   const openSelfEdit = () => {
      setEditingUser(currentUser);
      setUserForm({ ...currentUser, password: currentUser.password });
      setShowPassword(false);
      setIsUserModalOpen(true);
   };

   return (
      <div className="flex flex-col lg:flex-row h-full gap-6 pb-20 animate-in fade-in duration-500">
         {/* ... (Left Sidebar & Sticky Header - No Changes) ... */}

         {/* LEFT SIDEBAR NAVIGATION */}
         <div className="w-full lg:w-72 shrink-0 flex flex-col gap-6">

            {/* User Mini Profile */}
            <div className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm flex items-center gap-4">
               <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center overflow-hidden border border-slate-200">
                  <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.username}`} alt="av" className="w-full h-full object-cover" />
               </div>
               <div className="min-w-0">
                  <p className="font-bold text-slate-900 truncate">{currentUser.fullName || currentUser.username}</p>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{currentUser.role}</p>
               </div>
            </div>

            {/* Navigation Menu */}
            <div className="bg-white rounded-[2rem] p-4 border border-slate-100 shadow-sm flex-1 h-fit">
               <nav className="space-y-1">
                  {menuItems.map((item) => {
                     const isActive = activeTab === item.id;
                     const Icon = item.icon;
                     return (
                        <button
                           key={item.id}
                           onClick={() => setActiveTab(item.id as TabId)}
                           className={`w-full flex items-center gap-3 p-3.5 rounded-2xl transition-all duration-200 group ${isActive ? 'bg-slate-50' : 'hover:bg-slate-50'
                              }`}
                        >
                           <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${isActive ? `${item.bg} ${item.color} shadow-sm` : 'bg-slate-50 text-slate-400 group-hover:bg-white group-hover:shadow-sm'
                              }`}>
                              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                           </div>
                           <span className={`text-sm font-bold ${isActive ? 'text-slate-900' : 'text-slate-500 group-hover:text-slate-700'}`}>
                              {item.label}
                           </span>
                           {isActive && <ChevronRight size={16} className="ml-auto text-slate-300" />}
                        </button>
                     );
                  })}
               </nav>
            </div>
         </div>

         {/* RIGHT CONTENT AREA */}
         <div className="flex-1 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col overflow-hidden relative min-h-[600px]">

            {/* Sticky Header */}
            <div className="px-8 py-6 border-b border-slate-50 flex flex-col sm:flex-row items-start sm:items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-20 gap-4">
               <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                     {menuItems.find(i => i.id === activeTab)?.label}
                  </h2>
                  <p className="text-xs font-bold text-slate-400">Manage your system preferences</p>
               </div>

               {activeTab === 'general' && (
                  <button
                     onClick={handleSaveSettings}
                     disabled={saving}
                     className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg shadow-slate-900/10 active:scale-95 disabled:opacity-70"
                  >
                     {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                     {saving ? 'Saving...' : 'Save Changes'}
                  </button>
               )}
            </div>

            {/* Content Scroll Area */}
            <div className="flex-1 overflow-y-auto p-8">

               {/* --- GENERAL TAB --- */}
               {activeTab === 'general' && isAdmin && (
                  <div className="space-y-8 max-w-4xl animate-in fade-in slide-in-from-bottom-4">
                     {/* Theme Section */}
                     <section className="space-y-4">
                        <div className="flex items-center gap-2 border-b border-slate-100 pb-2 mb-4">
                           <Activity size={18} className="text-purple-500" />
                           <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">System Appearance</h3>
                        </div>
                        <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                           <p className="text-xs font-bold text-slate-500 mb-4 uppercase tracking-wide">Accent Color</p>
                           <div className="flex gap-4">
                              {themeColors.map(c => (
                                 <button
                                    key={c.name}
                                    onClick={() => setSettings(s => s ? { ...s, themeColor: c.hex } : null)}
                                    className={`w-12 h-12 rounded-full ${c.class} shadow-sm transition-all hover:scale-110 flex items-center justify-center ${settings.themeColor === c.hex ? 'ring-4 ring-slate-200 scale-110' : 'opacity-80 hover:opacity-100'}`}
                                    title={c.name}
                                 >
                                    {settings.themeColor === c.hex && <Check size={20} className="text-white" strokeWidth={3} />}
                                 </button>
                              ))}
                           </div>
                        </div>
                     </section>

                     {/* Store Identity */}
                     <section className="space-y-6">
                        <div className="flex items-center gap-2 border-b border-slate-100 pb-2 mb-4">
                           <Store size={18} className="text-rose-500" />
                           <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Store Identity</h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <div className="space-y-2">
                              <label className="win-label">Business Name</label>
                              <input className="win-input h-12" value={settings.businessName} onChange={e => setSettings(s => s ? { ...s, businessName: e.target.value } : null)} />
                           </div>
                           <div className="space-y-2">
                              <label className="win-label">Tagline</label>
                              <input className="win-input h-12" value={settings.tagline} onChange={e => setSettings(s => s ? { ...s, tagline: e.target.value } : null)} />
                           </div>
                           <div className="col-span-full space-y-2">
                              <label className="win-label">Address</label>
                              <div className="relative">
                                 <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                                 <input className="win-input h-12 pl-12" value={settings.address} onChange={e => setSettings(s => s ? { ...s, address: e.target.value } : null)} />
                              </div>
                           </div>
                           <div className="space-y-2">
                              <label className="win-label">Phone</label>
                              <div className="relative">
                                 <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                                 <input className="win-input h-12 pl-12" value={settings.phone} onChange={e => setSettings(s => s ? { ...s, phone: e.target.value } : null)} />
                              </div>
                           </div>
                        </div>
                     </section>

                     {/* Operational Rules */}
                     <section className="space-y-6">
                        <div className="flex items-center gap-2 border-b border-slate-100 pb-2 mb-4">
                           <BarChart2 size={18} className="text-orange-500" />
                           <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Operational Rules</h3>
                        </div>

                        <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-8">
                           <div>
                              <div className="flex items-center justify-between mb-2">
                                 <div>
                                    <p className="text-sm font-bold text-slate-900">Negative Stock Sales</p>
                                    <p className="text-xs text-slate-500">Allow selling items with 0 stock</p>
                                 </div>
                                 <ToggleSwitch
                                    checked={settings.enableNegativeStock || false}
                                    onChange={(v) => setSettings(s => s ? { ...s, enableNegativeStock: v } : null)}
                                 />
                              </div>
                           </div>

                           <div>
                              <p className="text-sm font-bold text-slate-900 mb-2">Global Low Stock Threshold</p>
                              <p className="text-xs text-slate-500 mb-3">Default alert level for new products</p>
                              <input
                                 type="number"
                                 className="win-input h-10 w-full"
                                 value={settings.globalLowStockThreshold || 5}
                                 onChange={e => setSettings(s => s ? { ...s, globalLowStockThreshold: Number(e.target.value) } : null)}
                              />
                           </div>

                           <div className="col-span-full border-t border-slate-200 pt-6 mt-2">
                              <div className="flex items-center justify-between">
                                 <div>
                                    <p className="text-sm font-bold text-slate-900">Tax Calculation</p>
                                    <p className="text-xs text-slate-500">Enable VAT processing on sales</p>
                                 </div>
                                 <ToggleSwitch
                                    checked={settings.taxEnabled || false}
                                    onChange={(v) => setSettings(s => s ? { ...s, taxEnabled: v } : null)}
                                 />
                              </div>
                              {settings.taxEnabled && (
                                 <div className="mt-4">
                                    <label className="win-label">Tax Percentage (%)</label>
                                    <input type="number" className="win-input h-10 w-32 bg-white" value={settings.taxPercentage} onChange={e => setSettings(s => s ? { ...s, taxPercentage: Number(e.target.value) } : null)} />
                                 </div>
                              )}
                           </div>
                        </div>
                     </section>
                  </div>
               )}

               {/* ... (Hardware, Data Management Tabs removed for brevity as they are unchanged) ... */}
               {/* --- HARDWARE TAB --- */}
               {activeTab === 'hardware' && isAdmin && (
                  <div className="space-y-8 max-w-4xl animate-in fade-in slide-in-from-bottom-4">
                     <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden">
                        <div className="flex items-center gap-3 mb-6 relative z-10">
                           <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
                              <Printer size={24} />
                           </div>
                           <div>
                              <h3 className="text-lg font-black text-slate-900">Receipt Printer</h3>
                              <p className="text-xs text-slate-500 font-medium">Network & Format Settings</p>
                           </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                           <div className="space-y-4">
                              <div className="space-y-2">
                                 <label className="win-label">Connection Type</label>
                                 <div className="flex gap-2">
                                    {['network', 'bluetooth', 'usb'].map(type => (
                                       <button
                                          key={type}
                                          onClick={() => setSettings(s => s ? { ...s, hardware: { ...s.hardware, printerType: type as any } } : null)}
                                          className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${settings.hardware?.printerType === type ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200'}`}
                                       >
                                          {type === 'network' && <Wifi size={14} className="mx-auto mb-1" />}
                                          {type === 'bluetooth' && <Bluetooth size={14} className="mx-auto mb-1" />}
                                          {type === 'usb' && <Cpu size={14} className="mx-auto mb-1" />}
                                          {type}
                                       </button>
                                    ))}
                                 </div>
                              </div>
                              <div className="space-y-2">
                                 <label className="win-label">Printer IP Address</label>
                                 <input
                                    className="win-input h-12 font-mono"
                                    placeholder="192.168.1.200"
                                    value={settings.hardware?.printerIp || ''}
                                    onChange={e => setSettings(s => s ? { ...s, hardware: { ...s.hardware, printerIp: e.target.value } } : null)}
                                    disabled={settings.hardware?.printerType !== 'network'}
                                 />
                              </div>
                           </div>
                           <div className="space-y-4">
                              <div className="space-y-2">
                                 <label className="win-label">Paper Width</label>
                                 <select
                                    className="win-input h-12"
                                    value={settings.hardware?.printerPaperWidth || '80mm'}
                                    onChange={e => setSettings(s => s ? { ...s, hardware: { ...s.hardware, printerPaperWidth: e.target.value as any } } : null)}
                                 >
                                    <option value="58mm">58mm (Small)</option>
                                    <option value="80mm">80mm (Standard)</option>
                                 </select>
                              </div>
                              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 mt-6">
                                 <div>
                                    <p className="text-sm font-bold text-slate-900">Auto-Print</p>
                                    <p className="text-xs text-slate-500">Print receipt after sale</p>
                                 </div>
                                 <ToggleSwitch
                                    checked={settings.hardware?.autoPrintReceipt || false}
                                    onChange={(v) => setSettings(s => s ? { ...s, hardware: { ...s.hardware, autoPrintReceipt: v } } : null)}
                                 />
                              </div>
                           </div>
                        </div>
                     </div>

                     <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden">
                        <div className="flex items-center gap-3 mb-6 relative z-10">
                           <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                              <ScanBarcode size={24} />
                           </div>
                           <div>
                              <h3 className="text-lg font-black text-slate-900">Barcode Scanner</h3>
                              <p className="text-xs text-slate-500 font-medium">Input Configuration</p>
                           </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                           <div className="space-y-2">
                              <label className="win-label">Prefix Character (Optional)</label>
                              <input
                                 className="win-input h-12 font-mono"
                                 value={settings.hardware?.barcodeScannerPrefix || ''}
                                 onChange={e => setSettings(s => s ? { ...s, hardware: { ...s.hardware, barcodeScannerPrefix: e.target.value } } : null)}
                              />
                           </div>
                           <div className="space-y-2">
                              <label className="win-label">Suffix Character (Optional)</label>
                              <input
                                 className="win-input h-12 font-mono"
                                 value={settings.hardware?.barcodeScannerSuffix || ''}
                                 onChange={e => setSettings(s => s ? { ...s, hardware: { ...s.hardware, barcodeScannerSuffix: e.target.value } } : null)}
                              />
                           </div>
                        </div>
                     </div>
                  </div>
               )}

               {/* --- DATA MANAGEMENT TAB --- */}
               {activeTab === 'database' && isAdmin && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 max-w-4xl">
                     {/* Backup Card with safe backup handler */}
                     <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-lg transition-all">
                        <div className="relative z-10">
                           <div className="w-12 h-12 bg-violet-100 text-violet-600 rounded-2xl flex items-center justify-center mb-4">
                              <Download size={24} />
                           </div>
                           <h3 className="text-lg font-black text-slate-900 mb-2">Data Backup</h3>
                           <p className="text-sm text-slate-500 mb-8 leading-relaxed">
                              Export a full JSON snapshot of your business data including inventory, sales history, and user accounts.
                           </p>
                           <button onClick={handleBackup} className="px-6 py-3 bg-violet-100 text-violet-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-violet-200 transition-colors flex items-center gap-2">
                              <Download size={16} /> Download Backup
                           </button>
                        </div>
                     </div>

                     {/* Import Card */}
                     <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-lg transition-all">
                        <div className="relative z-10">
                           <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-4">
                              <Upload size={24} />
                           </div>
                           <h3 className="text-lg font-black text-slate-900 mb-2">Import Data</h3>
                           <p className="text-sm text-slate-500 mb-8 leading-relaxed">
                              Bulk import products via CSV or restore a previous system backup file.
                           </p>
                           <div className="flex gap-4">
                              <button onClick={() => setIsImportModalOpen(true)} className="px-6 py-3 bg-blue-100 text-blue-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-200 transition-colors flex items-center gap-2">
                                 <FileText size={16} /> CSV Import
                              </button>
                              <div className="relative">
                                 <input
                                    type="file"
                                    accept=".json"
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    onChange={(e) => {
                                       if (e.target.files?.[0]) {
                                          setRestoreFile(e.target.files[0]);
                                          setTimeout(() => {
                                             if (confirm("Restore this backup file?")) {
                                                // Trigger restore
                                             }
                                          }, 100);
                                       }
                                    }}
                                 />
                                 <button className="px-6 py-3 bg-slate-100 text-slate-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-colors flex items-center gap-2">
                                    <RefreshCw size={16} /> Restore Backup
                                 </button>
                              </div>
                              {restoreFile && (
                                 <button onClick={handleRestore} className="px-6 py-3 bg-red-100 text-red-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-200 transition-colors animate-pulse">
                                    Confirm Restore
                                 </button>
                              )}
                           </div>
                        </div>
                     </div>

                     {/* DB Stats */}
                     <div className="md:col-span-2 bg-slate-50 p-6 rounded-3xl border border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                           <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center border border-slate-100 shadow-sm">
                              <HardDrive size={20} className="text-slate-400" />
                           </div>
                           <div>
                              <p className="text-xs font-black text-slate-900 uppercase">Storage Usage</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">Estimated DB Size</p>
                           </div>
                        </div>
                        <div className="text-right">
                           <p className="text-2xl font-black text-slate-900 tracking-tight">{dbStats.size}</p>
                           <div className="w-32 h-2 bg-slate-200 rounded-full mt-2 overflow-hidden">
                              <div className="h-full bg-slate-900 rounded-full" style={{ width: `${dbStats.percentage}%` }}></div>
                           </div>
                        </div>
                     </div>

                     {/* Factory Reset */}
                     <div className="mt-8 pt-8 border-t border-slate-100">
                        <button onClick={handleFactoryReset} className="text-red-500 text-xs font-bold uppercase hover:text-red-700 flex items-center gap-2">
                           <Trash2 size={14} /> Factory Reset System
                        </button>
                     </div>
                  </div>
               )}

               {activeTab === 'profile' && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 max-w-2xl mx-auto">
                     <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-lg relative">
                        <div className="flex items-center gap-4 mb-8">
                           <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden border-2 border-slate-200">
                              <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.username}`} alt="av" className="w-full h-full object-cover" />
                           </div>
                           <div>
                              <h3 className="text-xl font-black text-slate-900">{currentUser.fullName}</h3>
                              <p className="text-sm font-medium text-slate-500">@{currentUser.username}</p>
                              <span className={`inline-block mt-2 px-3 py-1 rounded-full text-[10px] font-black uppercase ${getRoleBadgeColor(currentUser.role)}`}>
                                 {currentUser.role}
                              </span>
                           </div>
                        </div>

                        <div className="space-y-6">
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Phone Contact</p>
                                 <p className="text-sm font-bold text-slate-900">{currentUser.phone || 'Not Set'}</p>
                              </div>
                              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Last Login</p>
                                 <p className="text-sm font-bold text-slate-900">{currentUser.lastLogin ? new Date(currentUser.lastLogin).toLocaleString() : 'Never'}</p>
                              </div>
                           </div>

                           <button
                              onClick={openSelfEdit}
                              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-[3px] shadow-xl hover:bg-black transition-all flex items-center justify-center gap-2"
                           >
                              <Edit2 size={16} /> Edit Profile & Password
                           </button>
                        </div>
                     </div>
                  </div>
               )}

               {/* --- USERS TAB --- */}
               {activeTab === 'users' && isAdmin && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                     <div className="flex justify-between items-center">
                        <div className="relative w-64">
                           <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                           <input
                              className="win-input pl-10 h-10 bg-slate-50"
                              placeholder="Search users..."
                              value={userSearch}
                              onChange={e => setUserSearch(e.target.value)}
                           />
                        </div>
                        <button
                           onClick={() => {
                              setEditingUser(null);
                              setUserForm({ username: '', fullName: '', phone: '', role: UserRole.CASHIER, password: '', fingerprintId: '', isActive: true });
                              setIsUserModalOpen(true);
                           }}
                           className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold uppercase tracking-wide hover:bg-blue-700"
                        >
                           <UserPlus size={16} /> Add User
                        </button>
                     </div>

                     <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {filteredUsers.map(u => (
                           <div key={u.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
                              <div className="flex justify-between items-start mb-4">
                                 <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 overflow-hidden">
                                    <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`} alt="av" className="w-full h-full object-cover" />
                                 </div>
                                 <div className="flex gap-1">
                                    <button onClick={() => { setEditingUser(u); setUserForm(u); setIsUserModalOpen(true); }} className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-blue-600 transition-colors"><Edit2 size={16} /></button>
                                    {u.id !== currentUser.id && (
                                       <>
                                          <button onClick={() => handleToggleStatus(u)} className={`p-2 hover:bg-slate-50 rounded-lg transition-colors ${u.isActive ? 'text-emerald-500 hover:text-red-500' : 'text-red-500 hover:text-emerald-500'}`}>
                                             <Power size={16} />
                                          </button>
                                          <button onClick={() => u.id && handleDeleteUser(u)} className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-red-600 transition-colors"><Trash2 size={16} /></button>
                                       </>
                                    )}
                                 </div>
                              </div>

                              <h3 className="text-lg font-bold text-slate-900">{u.fullName}</h3>
                              <p className="text-sm text-slate-500 mb-4">@{u.username}</p>

                              <div className="flex gap-2 mb-4">
                                 <span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${getRoleBadgeColor(u.role)}`}>{u.role}</span>
                                 <span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${u.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                                    {u.isActive ? 'Active' : 'Suspended'}
                                 </span>
                              </div>

                              <div className="pt-4 border-t border-slate-50 flex items-center gap-2 text-[10px] text-slate-400">
                                 <Clock size={12} /> Last login: {u.lastLogin ? new Date(u.lastLogin).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Never'}
                              </div>
                           </div>
                        ))}
                     </div>
                  </div>
               )}

               {activeTab === 'receipts' && isAdmin && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 max-w-3xl">
                     <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
                        <div className="flex items-center gap-2 mb-6">
                           <ScrollText className="text-orange-500" size={20} />
                           <h3 className="text-lg font-black text-slate-900 uppercase">Receipt Configuration</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <div className="space-y-2">
                              <label className="win-label">Receipt Header</label>
                              <input className="win-input h-12" value={settings.receiptHeader} onChange={e => setSettings(s => s ? { ...s, receiptHeader: e.target.value } : null)} />
                           </div>
                           <div className="space-y-2">
                              <label className="win-label">Tax ID / TIN</label>
                              <input className="win-input h-12" value={settings.tin || ''} onChange={e => setSettings(s => s ? { ...s, tin: e.target.value } : null)} />
                           </div>
                           <div className="col-span-full space-y-2">
                              <label className="win-label">Receipt Footer Message</label>
                              <textarea className="win-input p-4 h-24 resize-none" value={settings.receiptFooter} onChange={e => setSettings(s => s ? { ...s, receiptFooter: e.target.value } : null)} />
                           </div>
                        </div>
                     </div>
                  </div>
               )}

               {activeTab === 'audit' && isAdmin && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                     {/* ... Audit Logs Content (Unchanged) ... */}
                     <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row items-center gap-4">
                        <div className="flex items-center gap-2 mr-2">
                           <Filter size={16} className="text-slate-400" />
                           <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Filters</span>
                        </div>

                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
                           <div className="relative">
                              <select
                                 className="win-input h-10 text-xs font-bold pl-3 pr-8 bg-slate-50 appearance-none focus:bg-white"
                                 value={auditUserFilter}
                                 onChange={e => setAuditUserFilter(e.target.value)}
                              >
                                 <option value="All">All Users</option>
                                 {uniqueAuditUsers.map(u => <option key={u} value={u}>{u}</option>)}
                              </select>
                              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                           </div>

                           <div className="relative">
                              <select
                                 className="win-input h-10 text-xs font-bold pl-3 pr-8 bg-slate-50 appearance-none focus:bg-white"
                                 value={auditActionFilter}
                                 onChange={e => setAuditActionFilter(e.target.value)}
                              >
                                 <option value="All">All Actions</option>
                                 {uniqueAuditActions.map(a => <option key={a} value={a}>{a}</option>)}
                              </select>
                              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                           </div>

                           <div className="relative">
                              <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                              <input
                                 type="date"
                                 className="win-input h-10 pl-9 text-xs font-bold bg-slate-50 focus:bg-white"
                                 value={auditStartDate}
                                 onChange={e => setAuditStartDate(e.target.value)}
                                 placeholder="Start Date"
                              />
                           </div>

                           <div className="relative">
                              <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                              <input
                                 type="date"
                                 className="win-input h-10 pl-9 text-xs font-bold bg-slate-50 focus:bg-white"
                                 value={auditEndDate}
                                 onChange={e => setAuditEndDate(e.target.value)}
                                 placeholder="End Date"
                              />
                           </div>
                        </div>

                        <button onClick={clearAuditFilters} className="p-2 text-slate-400 hover:text-orange-500 transition-colors">
                           <RefreshCw size={16} />
                        </button>
                     </div>

                     <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
                        {/* Header with Clear Button */}
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 border-b border-slate-50 pb-4">
                           <div>
                              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">System Activity Log</h3>
                              <p className="text-[10px] font-bold text-slate-400 mt-1">
                                 Showing {filteredAuditLogs.length} of last {auditLimit} events
                              </p>
                           </div>
                           <div className="flex items-center gap-3">
                              <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                                 <span className="text-[10px] font-bold text-slate-500 uppercase">Limit:</span>
                                 <select
                                    value={auditLimit}
                                    onChange={(e) => setAuditLimit(Number(e.target.value))}
                                    className="bg-transparent text-[10px] font-black text-slate-900 outline-none"
                                 >
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                    <option value={500}>500</option>
                                    <option value={1000}>1000</option>
                                 </select>
                              </div>
                              {isAdmin && (
                                 <button
                                    onClick={initiateClearLogs}
                                    className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-100 transition-all border border-red-100"
                                 >
                                    <Trash2 size={14} /> Clear Logs
                                 </button>
                              )}
                           </div>
                        </div>

                        <table className="w-full text-left">
                           <thead className="bg-slate-50 border-b border-slate-100">
                              <tr>
                                 <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Time</th>
                                 <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">User</th>
                                 <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Action</th>
                                 <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Entity Affected</th>
                                 <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Details</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-50">
                              {filteredAuditLogs.length > 0 ? filteredAuditLogs.map(log => (
                                 <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 text-xs font-medium text-slate-500">
                                       {new Date(log.timestamp).toLocaleDateString()} <span className="text-slate-300">|</span> {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </td>
                                    <td className="px-6 py-4">
                                       <div className="flex items-center gap-2">
                                          <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500 uppercase">
                                             {log.user.charAt(0)}
                                          </div>
                                          <span className="text-xs font-bold text-slate-900">{log.user}</span>
                                       </div>
                                    </td>
                                    <td className="px-6 py-4"><span className="px-2 py-1 bg-slate-100 rounded text-[9px] font-black uppercase text-slate-600 border border-slate-200">{log.action}</span></td>
                                    <td className="px-6 py-4">
                                       {log.entityType ? (
                                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-blue-50 text-[10px] font-bold text-blue-700 font-mono border border-blue-100">
                                             <Hash size={10} className="text-blue-400" />
                                             {log.entityType}: {log.entityId ? log.entityId.substring(0, 8) + '...' : 'N/A'}
                                          </span>
                                       ) : (
                                          <span className="text-slate-300 text-[10px] italic">--</span>
                                       )}
                                    </td>
                                    <td className="px-6 py-4 text-xs text-slate-600 font-medium">{log.details}</td>
                                 </tr>
                              )) : (
                                 <tr>
                                    <td colSpan={5} className="py-12 text-center text-slate-400 text-xs font-bold uppercase tracking-wider">
                                       <Search size={32} className="mx-auto mb-2 opacity-20" />
                                       No audit logs matching filters
                                    </td>
                                 </tr>
                              )}
                           </tbody>
                        </table>
                     </div>
                  </div>
               )}
            </div>
         </div>

         {/* --- USER MODAL --- */}
         {isUserModalOpen && (
            <div className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in">
               <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/20">
                  <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                     <h2 className="text-xl font-black text-slate-900 italic uppercase tracking-tighter">{editingUser ? 'Edit User' : 'New User'}</h2>
                     <button onClick={() => setIsUserModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 rounded-xl hover:bg-slate-50 transition-all"><X size={24} /></button>
                  </div>
                  <div className="p-8 space-y-6">
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <label className="win-label">Username</label>
                           <input className="win-input h-12" value={userForm.username} onChange={e => setUserForm({ ...userForm, username: e.target.value })} disabled={!!editingUser && editingUser.id !== currentUser.id} />
                        </div>
                        <div className="space-y-2">
                           <label className="win-label">Full Name</label>
                           <input className="win-input h-12" value={userForm.fullName} onChange={e => setUserForm({ ...userForm, fullName: e.target.value })} />
                        </div>
                     </div>
                     <div className="space-y-2">
                        <label className="win-label">Role</label>
                        <select className="win-input h-12" value={userForm.role} onChange={e => setUserForm({ ...userForm, role: e.target.value as UserRole })} disabled={editingUser?.id === currentUser.id && currentUser.role === UserRole.ADMIN}>
                           {Object.values(UserRole).map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                     </div>

                     {/* Added Last Login Field for visibility */}
                     {editingUser && (
                        <div className="space-y-2">
                           <label className="win-label">Last Login Timestamp</label>
                           <div className="relative">
                              <input
                                 disabled
                                 className="win-input h-12 bg-slate-50 text-slate-500 pl-10 font-mono text-xs"
                                 value={editingUser.lastLogin ? new Date(editingUser.lastLogin).toLocaleString() : 'Never Logged In'}
                              />
                              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                           </div>
                        </div>
                     )}

                     <div className="space-y-2">
                        <label className="win-label">Password {editingUser && '(Optional)'}</label>
                        <div className="relative">
                           <input type={showPassword ? "text" : "password"} className="win-input h-12 pr-10" value={userForm.password} onChange={e => setUserForm({ ...userForm, password: e.target.value })} placeholder={editingUser ? "Leave blank to keep current" : ""} />
                           <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                           </button>
                        </div>
                     </div>
                     <div className="pt-4 flex gap-4">
                        <button onClick={() => setIsUserModalOpen(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-[10px] uppercase tracking-[2px] hover:bg-slate-200">Cancel</button>
                        <button onClick={handleUserSave} disabled={userSaving} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-[2px] hover:bg-black flex items-center justify-center gap-2">
                           {userSaving && <Loader2 size={14} className="animate-spin" />}
                           {userSaving ? 'Saving...' : 'Save User'}
                        </button>
                     </div>
                  </div>
               </div>
            </div>
         )}

         {/* --- IMPORT MODAL --- */}
         {isImportModalOpen && (
            <div className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in">
               <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/20">
                  <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                     <h2 className="text-xl font-black text-slate-900 italic uppercase tracking-tighter">Bulk Import Products</h2>
                     <button onClick={() => setIsImportModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 rounded-xl hover:bg-slate-50 transition-all"><X size={24} /></button>
                  </div>
                  <div className="p-8 space-y-6">
                     <p className="text-sm text-slate-500">Paste CSV data (Name, SKU, Category, Cost, Price, Stock)</p>
                     <textarea
                        className="w-full h-64 p-4 bg-slate-50 rounded-2xl border border-slate-200 font-mono text-xs focus:ring-2 focus:ring-blue-500/20 outline-none resize-none"
                        placeholder="iPhone 13, IPH13, Phones, 2000000, 2500000, 10..."
                        value={importText}
                        onChange={e => setImportText(e.target.value)}
                     />
                     <div className="flex gap-4">
                        <button onClick={() => setIsImportModalOpen(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-[10px] uppercase tracking-[2px] hover:bg-slate-200">Cancel</button>
                        <button onClick={handleImportProducts} disabled={importing} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-[2px] hover:bg-black disabled:opacity-70">
                           {importing ? 'Importing...' : 'Process Import'}
                        </button>
                     </div>
                  </div>
               </div>
            </div>
         )}

         {userToDelete && (
            <div className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in">
               <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-8 text-center space-y-6">
                  <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
                     <AlertTriangle size={40} strokeWidth={2} />
                  </div>
                  <div>
                     <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">Confirm Deletion</h3>
                     <p className="text-sm text-slate-500 font-medium mt-2 leading-relaxed">
                        Are you sure you want to permanently delete the user <span className="text-slate-900 font-bold">"{userToDelete.username}"</span>?
                     </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                     <button onClick={() => setUserToDelete(null)} disabled={isDeletingUser} className="py-4 bg-slate-100 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
                     <button onClick={confirmDeleteUser} disabled={isDeletingUser} className="py-4 bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-red-600/20 hover:bg-red-700 transition-all flex items-center justify-center gap-2">
                        {isDeletingUser ? <Loader2 className="animate-spin" size={14} /> : null} {isDeletingUser ? 'Deleting...' : 'Yes, Delete'}
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* CONFIRMATION MODAL FOR CLEARING AUDIT LOGS */}
         {isClearLogsConfirmOpen && (
            <div className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in">
               <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-8 text-center space-y-6 border border-white/20">
                  <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
                     <AlertTriangle size={40} strokeWidth={2} />
                  </div>
                  <div>
                     <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">System Warning</h3>
                     <p className="text-sm text-slate-500 font-medium mt-2 leading-relaxed">
                        You are about to permanently delete <span className="text-slate-900 font-bold">ALL Audit Logs</span>. This action cannot be undone and removes all activity history.
                     </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                     <button onClick={() => setIsClearLogsConfirmOpen(false)} className="py-4 bg-slate-100 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
                     <button onClick={performClearLogs} className="py-4 bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-red-600/20 hover:bg-red-700 transition-all">
                        {clearingLogs ? <Loader2 className="animate-spin inline mr-2" size={12} /> : null} Yes, Clear All
                     </button>
                  </div>
               </div>
            </div>
         )}

      </div>
   );
};

export default Settings;
