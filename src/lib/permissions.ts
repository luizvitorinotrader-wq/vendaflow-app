type UserRole = 'owner' | 'manager' | 'staff';

export interface Permission {
  module: string;
  action: 'view' | 'create' | 'edit' | 'delete';
}

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  owner: [
    { module: 'dashboard', action: 'view' },
    { module: 'products', action: 'view' },
    { module: 'products', action: 'create' },
    { module: 'products', action: 'edit' },
    { module: 'products', action: 'delete' },
    { module: 'stock', action: 'view' },
    { module: 'stock', action: 'create' },
    { module: 'stock', action: 'edit' },
    { module: 'stock', action: 'delete' },
    { module: 'cash', action: 'view' },
    { module: 'cash', action: 'create' },
    { module: 'cash', action: 'edit' },
    { module: 'cash', action: 'delete' },
    { module: 'reports', action: 'view' },
    { module: 'customers', action: 'view' },
    { module: 'customers', action: 'create' },
    { module: 'customers', action: 'edit' },
    { module: 'customers', action: 'delete' },
    { module: 'settings', action: 'view' },
    { module: 'settings', action: 'edit' },
    { module: 'subscription', action: 'view' },
    { module: 'subscription', action: 'edit' },
    { module: 'pdv', action: 'view' },
    { module: 'pdv', action: 'create' },
    { module: 'recipe', action: 'view' },
    { module: 'recipe', action: 'create' },
    { module: 'recipe', action: 'edit' },
    { module: 'recipe', action: 'delete' },
    { module: 'movements', action: 'view' },
    { module: 'tables', action: 'view' },
    { module: 'tables', action: 'create' },
    { module: 'tables', action: 'edit' },
    { module: 'tables', action: 'delete' },
    { module: 'team', action: 'view' },
    { module: 'team', action: 'create' },
    { module: 'team', action: 'edit' },
    { module: 'team', action: 'delete' },
  ],
  manager: [
    { module: 'dashboard', action: 'view' },
    { module: 'products', action: 'view' },
    { module: 'products', action: 'create' },
    { module: 'products', action: 'edit' },
    { module: 'stock', action: 'view' },
    { module: 'stock', action: 'edit' },
    { module: 'cash', action: 'view' },
    { module: 'cash', action: 'create' },
    { module: 'cash', action: 'edit' },
    { module: 'reports', action: 'view' },
    { module: 'customers', action: 'view' },
    { module: 'customers', action: 'create' },
    { module: 'customers', action: 'edit' },
    { module: 'pdv', action: 'view' },
    { module: 'pdv', action: 'create' },
    { module: 'recipe', action: 'view' },
    { module: 'movements', action: 'view' },
    { module: 'tables', action: 'view' },
    { module: 'tables', action: 'create' },
    { module: 'tables', action: 'edit' },
    { module: 'tables', action: 'delete' },
  ],
  staff: [
    { module: 'pdv', action: 'view' },
    { module: 'pdv', action: 'create' },
    { module: 'tables', action: 'view' },
  ],
};

export function hasPermission(
  role: UserRole | null,
  module: string,
  action: 'view' | 'create' | 'edit' | 'delete'
): boolean {
  if (!role) return false;

  const permissions = ROLE_PERMISSIONS[role];
  return permissions.some(p => p.module === module && p.action === action);
}

export function canAccessModule(role: UserRole | null, module: string): boolean {
  if (!role) return false;

  const permissions = ROLE_PERMISSIONS[role];
  return permissions.some(p => p.module === module);
}

export function canPerformAction(
  role: UserRole | null,
  module: string,
  action: 'view' | 'create' | 'edit' | 'delete'
): boolean {
  return hasPermission(role, module, action);
}

export function getModulePermissions(role: UserRole | null, module: string) {
  if (!role) return { canView: false, canCreate: false, canEdit: false, canDelete: false };

  return {
    canView: hasPermission(role, module, 'view'),
    canCreate: hasPermission(role, module, 'create'),
    canEdit: hasPermission(role, module, 'edit'),
    canDelete: hasPermission(role, module, 'delete'),
  };
}

export function isOwner(role: UserRole | null): boolean {
  return role === 'owner';
}

export function isManager(role: UserRole | null): boolean {
  return role === 'manager';
}

export function isStaff(role: UserRole | null): boolean {
  return role === 'staff';
}

export function isManagerOrHigher(role: UserRole | null): boolean {
  return role === 'owner' || role === 'manager';
}

export function canManageTeam(role: UserRole | null): boolean {
  return role === 'owner';
}

export function canManageUsers(role: UserRole | null): boolean {
  return role === 'owner';
}

export function canManageSubscription(role: UserRole | null): boolean {
  return role === 'owner';
}

export function canAccessFinancialData(role: UserRole | null): boolean {
  return role === 'owner' || role === 'manager';
}

export function canManageInventory(role: UserRole | null): boolean {
  return role === 'owner' || role === 'manager';
}

export function canCheckoutTab(role: UserRole | null): boolean {
  return role === 'owner' || role === 'manager';
}

export function canManageTables(role: UserRole | null): boolean {
  return role === 'owner' || role === 'manager';
}
