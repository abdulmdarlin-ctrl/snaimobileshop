import { activateDialog } from '../utils/dialogSurface';
import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  LayoutDashboard, ShoppingCart, Wrench, BarChart3, Settings as SettingsIcon,
  X, LogOut, ChevronLeft, ChevronRight, Truck, Package, Layers, ReceiptText, Users, HandCoins, ContactRound
} from 'lucide-react';
import { Page } from '../App';
import { User, UserRole, AppSettings } from '../types';

interface SidebarProps {
  user: User;
  currentPage: Page;
  setCurrentPage: (page: Page) => void;
  isOpen: boolean;
  toggleSidebar: () => void;
  settings?: AppSettings | null;
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ user, currentPage, setCurrentPage, isOpen, toggleSidebar, settings, onLogout }) => {
  const role = user.role;
  const panelRef = useRef<HTMLElement>(null);
  const [mobile, setMobile] = useState(() => window.innerWidth < 1024);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 1023px)');
    const update = () => setMobile(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useLayoutEffect(() => {
    if (!mobile || !isOpen) return;
    if (panelRef.current) return activateDialog(panelRef.current, toggleSidebar);
  }, [mobile, isOpen]);

  // RBAC Configuration for Menu
  const menuGroups = [
    {
      label: 'Main',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.TECHNICIAN, UserRole.AUDITOR, UserRole.CASHIER] },
      ]
    },
    {
      label: 'Operations',
      items: [
        { id: 'sales', label: 'Sales (POS)', icon: ShoppingCart, roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER] },
        { id: 'inventory', label: 'Inventory', icon: Package, roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.AUDITOR, UserRole.CASHIER, UserRole.TECHNICIAN] },
        { id: 'customers', label: 'Customers', icon: ContactRound, roles: [UserRole.ADMIN] },
        { id: 'loans', label: 'Consignment', icon: HandCoins, roles: [UserRole.ADMIN, UserRole.MANAGER] },
        { id: 'repairs', label: 'Repairs', icon: Wrench, roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.TECHNICIAN, UserRole.CASHIER] },
        { id: 'expenses', label: 'Expenses', icon: ReceiptText, roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER] },
      ]
    },
    {
      label: 'Management',
      items: [
        { id: 'reports', label: 'Reports', icon: BarChart3, roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.AUDITOR] },
        { id: 'settings', label: 'Settings', icon: SettingsIcon, roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER, UserRole.TECHNICIAN, UserRole.AUDITOR] },
      ]
    }
  ];

  const descriptions: Record<Page, string> = {
    dashboard: 'Business overview and quick actions', sales: 'Create sales and collect payments',
    inventory: 'Products, prices and stock levels', customers: 'Profiles, statements and balances',
    loans: 'Agents and consignment stock', repairs: 'Job cards and repair progress',
    expenses: 'Record and review business costs', reports: 'Sales and financial performance',
    settings: 'Your account and system preferences',
  };

  if (mobile) return isOpen ? (
    <aside ref={panelRef} id="mobile-more-menu" className="mobile-more-panel" role="dialog" aria-modal="true" aria-labelledby="mobile-more-title">
      <header className="mobile-more-header"><div><p>YOUR WORKSPACE</p><h2 id="mobile-more-title">More</h2></div><button type="button" aria-label="Close menu" onClick={toggleSidebar}><X size={22} /></button></header>
      <div className="mobile-more-scroll">
        <button className="mobile-more-account" onClick={() => setCurrentPage('settings')}>
          <span className="mobile-account-avatar">{(user.fullName || user.username).trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()}</span>
          <span><strong>{user.fullName || user.username}</strong><small>{user.role} account</small></span><ChevronRight size={18} />
        </button>
        <nav aria-label="All workspace sections">{menuGroups.map(group => {
          const items = group.items.filter(item => item.roles.includes(role));
          if (!items.length) return null;
          return <section key={group.label} className="mobile-more-section"><h3>{group.label}</h3><div>{items.map(item => {
            const Icon = item.icon;
            return <button key={item.id} aria-current={currentPage === item.id ? 'page' : undefined} onClick={() => setCurrentPage(item.id as Page)}>
              <span className="mobile-more-icon"><Icon size={20} strokeWidth={1.8} /></span><span className="mobile-more-label"><strong>{item.label}</strong><small>{descriptions[item.id as Page]}</small></span><ChevronRight size={16} />
            </button>;
          })}</div></section>;
        })}</nav>
      </div>
      <footer className="mobile-more-footer"><span>{settings?.businessName || 'Sna! Mobile Shop'}</span><button onClick={onLogout}><LogOut size={17} /> Sign out</button></footer>
    </aside>
  ) : null;

  return (
    <aside
      ref={panelRef} inert={mobile && !isOpen} aria-label="Main navigation"
      className={`app-sidebar fixed lg:static inset-y-0 left-0 z-50 flex flex-col bg-[#0f172a] text-slate-300 transition-all duration-300   border-r border-slate-800 ${isOpen ? 'w-64 translate-x-0' : 'w-64 -translate-x-full lg:w-20 lg:translate-x-0'
        }`}
    >
      <div className={`flex items-center h-16 border-b border-slate-800 transition-all duration-300 ${isOpen ? 'px-6 gap-3' : 'justify-center'}`}>
        {settings?.logo ? (
          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center overflow-hidden shrink-0">
            <img src={settings.logo} alt="Logo" className="w-full h-full object-contain" />
          </div>
        ) : (
          <div className="w-8 h-8 bg-rose-600 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0">
            {(settings?.businessName || 'S').charAt(0)}
          </div>
        )}
        <span className={`font-bold text-xs text-white leading-tight whitespace-nowrap transition-all duration-300 ${isOpen ? 'opacity-100 w-auto' : 'opacity-0 w-0 overflow-hidden'}`}>
          {settings?.businessName || 'BUSINESS SYSTEM'}
        </span>
      </div>

      <div className="flex-1 mt-6 px-3 space-y-8 overflow-y-auto scrollbar-hide">
        {menuGroups.map((group, gIdx) => {
          const visibleItems = group.items.filter(i => i.roles.includes(role));
          if (visibleItems.length === 0) return null;

          return (
            <div key={gIdx}>
              <p className={`px-4 text-[10px] font-bold text-slate-500 uppercase mb-3 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 lg:hidden'}`}>
                {group.label}
              </p>
              <div className="space-y-1">
                {visibleItems.map(item => {
                  const Icon = item.icon;
                  const active = currentPage === item.id;
                  return (
                    <button
                      key={item.id}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => setCurrentPage(item.id as Page)}
                      className={`w-full flex items-center ${isOpen ? 'px-4 py-3' : 'justify-center py-3'} rounded-lg transition-all ${active
                        ? 'bg-slate-700 text-white font-semibold'
                        : 'hover:text-white hover:bg-slate-800 text-slate-400'
                        }`}
                      title={!isOpen ? item.label : ''}
                    >
                      <Icon size={20} className="shrink-0" strokeWidth={1.75} />
                      <span className={`ml-3 text-sm whitespace-nowrap transition-all duration-300 ${isOpen ? 'opacity-100 w-auto' : 'opacity-0 w-0 overflow-hidden lg:hidden'}`}>
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-4 border-t border-slate-800">
        <button aria-label={isOpen ? "Collapse navigation" : "Expand navigation"} onClick={toggleSidebar} className="w-full flex items-center justify-center py-2 text-slate-500 hover:text-white transition-colors">
          {isOpen ? <ChevronLeft size={20} strokeWidth={1.75} /> : <ChevronRight size={20} strokeWidth={1.75} />}
        </button>
        {isOpen && (
          <div className="mt-4 text-center">
            <p className="text-[9px] font-bold text-slate-600 uppercase">ABI-TECH</p>
          </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
