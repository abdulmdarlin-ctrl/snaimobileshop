
import React, { useState } from 'react';
import {
  LayoutDashboard, ShoppingCart, Wrench, BarChart3, Settings as SettingsIcon,
  ChevronLeft, ChevronRight, Truck, Box, Layers, Wallet, Users, User as UserIcon
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
}

const Sidebar: React.FC<SidebarProps> = ({ user, currentPage, setCurrentPage, isOpen, toggleSidebar, settings }) => {
  const role = user.role;

  // RBAC Configuration for Menu
  const menuGroups = [
    {
      label: 'Main',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.TECHNICIAN, UserRole.AUDITOR] },
      ]
    },
    {
      label: 'Operations',
      items: [
        { id: 'sales', label: 'Sales (POS)', icon: ShoppingCart, roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER] },
        { id: 'inventory', label: 'Inventory', icon: Box, roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.AUDITOR, UserRole.CASHIER] }, // Cashiers need to see stock, but not edit
        { id: 'customers', label: 'Customers', icon: UserIcon, roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER] },
        { id: 'loans', label: 'Agent Stock', icon: Users, roles: [UserRole.ADMIN, UserRole.MANAGER] },
        { id: 'repairs', label: 'Repairs', icon: Wrench, roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.TECHNICIAN] },
        { id: 'expenses', label: 'Expenses', icon: Wallet, roles: [UserRole.ADMIN, UserRole.MANAGER] },
      ]
    },
    {
      label: 'Management',
      items: [
        { id: 'reports', label: 'Reports', icon: BarChart3, roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.AUDITOR] },
        // Settings restricted to Admin for system config. Others go to settings to view profile only.
        { id: 'settings', label: 'Settings', icon: SettingsIcon, roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER, UserRole.TECHNICIAN, UserRole.AUDITOR] },
      ]
    }
  ];

  return (
    <aside
      className={`fixed lg:static inset-y-0 left-0 z-50 flex flex-col bg-[#0f172a] text-slate-300 transition-all duration-300 shadow-2xl lg:shadow-none border-r border-slate-800 ${isOpen ? 'w-64 translate-x-0' : 'w-64 -translate-x-full lg:w-20 lg:translate-x-0'
        }`}
    >
      <div className="p-6 border-b border-slate-800 flex items-center gap-3 h-20">
        <span className={`font-black text-xs text-white tracking-widest leading-tight transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 lg:hidden'}`}>
          BUSINESS MANAGEMENT SYSTEM
        </span>
      </div>

      <div className="flex-1 mt-6 px-3 space-y-8 overflow-y-auto scrollbar-hide">
        {menuGroups.map((group, gIdx) => {
          const visibleItems = group.items.filter(i => i.roles.includes(role));
          if (visibleItems.length === 0) return null;

          return (
            <div key={gIdx}>
              <p className={`px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 lg:hidden'}`}>
                {group.label}
              </p>
              <div className="space-y-1">
                {visibleItems.map(item => {
                  const Icon = item.icon;
                  const active = currentPage === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setCurrentPage(item.id as Page)}
                      className={`w-full flex items-center ${isOpen ? 'px-4 py-3' : 'justify-center py-3'} rounded-lg transition-all ${active
                        ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/20 font-bold'
                        : 'hover:text-white hover:bg-slate-800 text-slate-400'
                        }`}
                      title={!isOpen ? item.label : ''}
                    >
                      <Icon size={18} strokeWidth={active ? 2.5 : 2} className="shrink-0" />
                      <span className={`ml-3 text-sm whitespace-nowrap transition-all duration-300 ${isOpen ? 'opacity-100 w-auto' : 'opacity-0 w-0 overflow-hidden lg:hidden'}`}>
                        {item.label}
                      </span>
                      {active && isOpen && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white"></div>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-4 border-t border-slate-800">
        <button onClick={toggleSidebar} className="w-full flex items-center justify-center py-2 text-slate-500 hover:text-white transition-colors">
          {isOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </button>
        {isOpen && (
          <div className="mt-4 text-center">
            <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Crafted by ABI-TECH</p>
          </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
