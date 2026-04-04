import { UserRole } from '../types';

// Define permission levels for each role
export const ROLE_PERMISSIONS = {
  [UserRole.ADMIN]: {
    level: 100,
    permissions: [
      'view_dashboard',
      'view_sales',
      'create_sales',
      'edit_sales',
      'delete_sales',
      'view_reports',
      'export_reports',
      'view_inventory',
      'add_inventory',
      'edit_inventory',
      'delete_inventory',
      'view_customers',
      'add_customers',
      'edit_customers',
      'delete_customers',
      'view_repairs',
      'create_repairs',
      'edit_repairs',
      'delete_repairs',
      'view_expenses',
      'create_expenses',
      'edit_expenses',
      'delete_expenses',
      'view_loans',
      'create_loans',
      'edit_loans',
      'delete_loans',
      'view_suppliers',
      'add_suppliers',
      'edit_suppliers',
      'delete_suppliers',
      'view_users',
      'create_users',
      'edit_users',
      'delete_users',
      'view_settings',
      'edit_settings',
      'view_audit_logs',
      'manage_system',
      'access_all_modules'
    ]
  },
  [UserRole.MANAGER]: {
    level: 80,
    permissions: [
      'view_dashboard',
      'view_sales',
      'create_sales',
      'edit_sales',
      'delete_sales',
      'view_reports',
      'export_reports',
      'view_inventory',
      'add_inventory',
      'edit_inventory',
      'delete_inventory',
      'view_customers',
      'add_customers',
      'edit_customers',
      'view_repairs',
      'create_repairs',
      'edit_repairs',
      'delete_repairs',
      'view_expenses',
      'create_expenses',
      'edit_expenses',
      'delete_expenses',
      'view_loans',
      'create_loans',
      'edit_loans',
      'view_suppliers',
      'add_suppliers',
      'edit_suppliers',
      'view_settings',
      'edit_settings'
    ]
  },
  [UserRole.TECHNICIAN]: {
    level: 60,
    permissions: [
      'view_dashboard',
      'view_repairs',
      'create_repairs',
      'edit_repairs',
      'view_inventory',
      'view_customers',
      'view_expenses'
    ]
  },
  [UserRole.CASHIER]: {
    level: 40,
    permissions: [
      'view_dashboard',
      'view_sales',
      'create_sales',
      'edit_sales',
      'view_inventory',
      'view_customers',
      'add_customers',
      'edit_customers',
      'view_repairs',
      'create_repairs',
      'edit_repairs',
      'view_expenses',
      'create_expenses',
      'edit_expenses'
    ]
  },
  [UserRole.AUDITOR]: {
    level: 70,
    permissions: [
      'view_dashboard',
      'view_sales',
      'view_reports',
      'export_reports',
      'view_inventory',
      'view_customers',
      'view_repairs',
      'view_expenses',
      'view_loans',
      'view_suppliers',
      'view_audit_logs'
    ]
  }
};

// Permission checking utilities
export class PermissionManager {
  static hasPermission(userRole: UserRole, permission: string): boolean {
    const roleConfig = ROLE_PERMISSIONS[userRole];
    return roleConfig ? roleConfig.permissions.includes(permission) : false;
  }

  static hasAnyPermission(userRole: UserRole, permissions: string[]): boolean {
    return permissions.some(permission => this.hasPermission(userRole, permission));
  }

  static hasAllPermissions(userRole: UserRole, permissions: string[]): boolean {
    return permissions.every(permission => this.hasPermission(userRole, permission));
  }

  static canAccessModule(userRole: UserRole, module: string): boolean {
    const modulePermissions = {
      'dashboard': 'view_dashboard',
      'sales': 'view_sales',
      'inventory': 'view_inventory',
      'customers': 'view_customers',
      'repairs': 'view_repairs',
      'expenses': 'view_expenses',
      'loans': 'view_loans',
      'suppliers': 'view_suppliers',
      'users': 'view_users',
      'settings': 'view_settings',
      'reports': 'view_reports'
    };
    
    const requiredPermission = modulePermissions[module as keyof typeof modulePermissions];
    return requiredPermission ? this.hasPermission(userRole, requiredPermission) : false;
  }

  static canCreate(userRole: UserRole, module: string): boolean {
    const createPermissions = {
      'sales': 'create_sales',
      'inventory': 'add_inventory',
      'customers': 'add_customers',
      'repairs': 'create_repairs',
      'expenses': 'create_expenses',
      'loans': 'create_loans',
      'suppliers': 'add_suppliers',
      'users': 'create_users'
    };
    
    const requiredPermission = createPermissions[module as keyof typeof createPermissions];
    return requiredPermission ? this.hasPermission(userRole, requiredPermission) : false;
  }

  static canEdit(userRole: UserRole, module: string): boolean {
    const editPermissions = {
      'sales': 'edit_sales',
      'inventory': 'edit_inventory',
      'customers': 'edit_customers',
      'repairs': 'edit_repairs',
      'expenses': 'edit_expenses',
      'loans': 'edit_loans',
      'suppliers': 'edit_suppliers',
      'users': 'edit_users',
      'settings': 'edit_settings'
    };
    
    const requiredPermission = editPermissions[module as keyof typeof editPermissions];
    return requiredPermission ? this.hasPermission(userRole, requiredPermission) : false;
  }

  static canDelete(userRole: UserRole, module: string): boolean {
    const deletePermissions = {
      'sales': 'delete_sales',
      'inventory': 'delete_inventory',
      'customers': 'delete_customers',
      'repairs': 'delete_repairs',
      'expenses': 'delete_expenses',
      'loans': 'delete_loans',
      'suppliers': 'delete_suppliers',
      'users': 'delete_users'
    };
    
    const requiredPermission = deletePermissions[module as keyof typeof deletePermissions];
    return requiredPermission ? this.hasPermission(userRole, requiredPermission) : false;
  }

  static getAccessibleModules(userRole: UserRole): string[] {
    const allModules = ['dashboard', 'sales', 'inventory', 'customers', 'repairs', 'expenses', 'loans', 'suppliers', 'users', 'settings', 'reports'];
    return allModules.filter(module => this.canAccessModule(userRole, module));
  }

  static getRoleLevel(userRole: UserRole): number {
    return ROLE_PERMISSIONS[userRole]?.level || 0;
  }

  static canManageUser(currentUserRole: UserRole, targetUserRole: UserRole): boolean {
    const currentLevel = this.getRoleLevel(currentUserRole);
    const targetLevel = this.getRoleLevel(targetUserRole);
    
    // Admin can manage everyone
    if (currentUserRole === UserRole.ADMIN) return true;
    
    // Manager can manage users with lower level (but not other managers or admin)
    if (currentUserRole === UserRole.MANAGER) {
      return targetLevel < currentLevel;
    }
    
    return false;
  }

  static canViewSensitiveData(userRole: UserRole): boolean {
    return this.hasPermission(userRole, 'view_audit_logs') || 
           this.hasPermission(userRole, 'manage_system') ||
           userRole === UserRole.ADMIN;
  }

  static canExportData(userRole: UserRole): boolean {
    return this.hasPermission(userRole, 'export_reports');
  }

  static canAccessAllModules(userRole: UserRole): boolean {
    return this.hasPermission(userRole, 'access_all_modules');
  }
}

// React hook for permissions
export const usePermissions = (userRole: UserRole) => {
  return {
    hasPermission: (permission: string) => PermissionManager.hasPermission(userRole, permission),
    hasAnyPermission: (permissions: string[]) => PermissionManager.hasAnyPermission(userRole, permissions),
    hasAllPermissions: (permissions: string[]) => PermissionManager.hasAllPermissions(userRole, permissions),
    canAccessModule: (module: string) => PermissionManager.canAccessModule(userRole, module),
    canCreate: (module: string) => PermissionManager.canCreate(userRole, module),
    canEdit: (module: string) => PermissionManager.canEdit(userRole, module),
    canDelete: (module: string) => PermissionManager.canDelete(userRole, module),
    canManageUser: (targetRole: UserRole) => PermissionManager.canManageUser(userRole, targetRole),
    canViewSensitiveData: () => PermissionManager.canViewSensitiveData(userRole),
    canExportData: () => PermissionManager.canExportData(userRole),
    canAccessAllModules: () => PermissionManager.canAccessAllModules(userRole),
    getAccessibleModules: () => PermissionManager.getAccessibleModules(userRole),
    getRoleLevel: () => PermissionManager.getRoleLevel(userRole)
  };
};

// Menu items configuration based on roles
export const getMenuItemsForRole = (userRole: UserRole) => {
  const baseMenuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard', requiredPermission: 'view_dashboard' },
    { id: 'sales', label: 'Sales (POS)', icon: 'ShoppingCart', requiredPermission: 'view_sales' },
    { id: 'inventory', label: 'Inventory', icon: 'Box', requiredPermission: 'view_inventory' },
    { id: 'customers', label: 'Customers', icon: 'User', requiredPermission: 'view_customers' },
    { id: 'repairs', label: 'Repairs', icon: 'Wrench', requiredPermission: 'view_repairs' },
    { id: 'expenses', label: 'Expenses', icon: 'Wallet', requiredPermission: 'view_expenses' },
    { id: 'loans', label: 'Consignment', icon: 'Users', requiredPermission: 'view_loans' },
    { id: 'suppliers', label: 'Suppliers', icon: 'Truck', requiredPermission: 'view_suppliers' },
    { id: 'reports', label: 'Reports', icon: 'BarChart3', requiredPermission: 'view_reports' },
    { id: 'settings', label: 'Settings', icon: 'Settings', requiredPermission: 'view_settings' }
  ];

  // Add users menu only for admin
  if (userRole === UserRole.ADMIN) {
    baseMenuItems.push({ id: 'users', label: 'Users', icon: 'Users', requiredPermission: 'view_users' });
  }

  return baseMenuItems.filter(item => PermissionManager.hasPermission(userRole, item.requiredPermission));
};

// Export default permissions
export default PermissionManager;
