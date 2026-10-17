import React from 'react';
import { LayoutDashboard, ShoppingCart, Package, Menu, Wrench, BarChart3 } from 'lucide-react';
import { UserRole } from '../types';
import type { Page } from '../App';

interface Props {
  role: UserRole;
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onOpenMenu: () => void;
}

export default function MobileNavigation({ role, currentPage, onNavigate, onOpenMenu }: Props) {
  const workspace = role === UserRole.TECHNICIAN
    ? { page: 'repairs' as Page, label: 'Repairs', icon: Wrench }
    : role === UserRole.AUDITOR
      ? { page: 'reports' as Page, label: 'Reports', icon: BarChart3 }
      : { page: 'sales' as Page, label: 'Sales', icon: ShoppingCart };
  const links = [{ page: 'dashboard' as Page, label: 'Home', icon: LayoutDashboard }, workspace,
    { page: 'inventory' as Page, label: 'Stock', icon: Package }];
  return <nav className="mobile-app-navigation" aria-label="Primary mobile navigation">
    {links.map(({ page, label, icon: Icon }) => <button key={page} type="button"
      aria-current={currentPage === page ? 'page' : undefined} onClick={() => onNavigate(page)}>
      <span><Icon size={21} strokeWidth={1.8} /></span><span>{label}</span>
    </button>)}
    <button type="button" className={!links.some(link => link.page === currentPage) ? 'is-section-active' : ''}
      aria-label="Open all sections" aria-haspopup="dialog" aria-controls="mobile-more-menu" onClick={onOpenMenu}><span><Menu size={21} strokeWidth={1.8} /></span><span>More</span></button>
  </nav>;
}
