# RBAC Implementation - Role-Based Access Control

## Overview

Complete Role-Based Access Control (RBAC) system implemented for the multi-tenant SaaS application.

## Database Structure

### Table: store_users

Created in migration: `create_store_users_rbac_table`

**Columns:**
- `id` (uuid, primary key)
- `store_id` (uuid, not null) - Reference to stores table
- `user_id` (uuid, not null) - Reference to auth.users
- `role` (text, not null) - One of: 'admin', 'manager', 'attendant'
- `is_active` (boolean, default true)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

**Constraints:**
- Unique constraint on (store_id, user_id)
- Foreign key to stores(id) with CASCADE delete
- Foreign key to auth.users(id) with CASCADE delete
- Check constraint on role values

**Indexes:**
- `store_users_store_id_idx` on store_id
- `store_users_user_id_idx` on user_id
- `store_users_store_user_lookup_idx` on (store_id, user_id)
- `store_users_role_idx` on role

## Backend Functions

### Helper Functions (SQL)

#### `get_user_role(p_user_id uuid, p_store_id uuid)`
Returns the role of a user in a specific store.

```sql
SELECT get_user_role('user-id', 'store-id');
```

#### `user_has_role(p_user_id uuid, p_store_id uuid, p_required_role text)`
Checks if user has a specific role or higher in a store.
- Admin has all permissions
- Manager has attendant permissions
- Returns boolean

```sql
SELECT user_has_role('user-id', 'store-id', 'manager');
```

#### `user_belongs_to_store(p_user_id uuid, p_store_id uuid)`
Checks if user is active member of a store.

```sql
SELECT user_belongs_to_store('user-id', 'store-id');
```

#### `get_current_user_role(p_store_id uuid)`
Returns the role of the currently authenticated user in a store.

```sql
SELECT get_current_user_role('store-id');
```

## Role Definitions

### Admin
- Full access to all modules and actions
- Can manage subscription and critical settings
- Can manage other users (when user management is added)
- Has all permissions

### Manager
- Operational access to:
  - Dashboard (view)
  - Products (view, create, edit)
  - Stock (view, edit)
  - Cash (view, create, edit)
  - Reports (view)
  - Customers (view, create, edit)
  - PDV (view, create)
  - Recipe (view)
  - Movements (view)
- Cannot manage subscription
- Cannot access admin panel
- Cannot change critical account settings

### Attendant
- Minimal access (Phase 1):
  - PDV (view, create)
- No access to:
  - Dashboard
  - Reports
  - Stock
  - Settings
  - Subscription
  - Cash
  - Products

## Frontend Implementation

### 1. AuthContext Updates

**File:** `src/contexts/AuthContext.tsx`

**New exports:**
- `userRole: UserRole` - Current user's role ('admin' | 'manager' | 'attendant' | null)
- `storeId: string | null` - Current store ID

**Usage:**
```tsx
const { userRole, storeId } = useAuth();
```

### 2. RoleGuard Component

**File:** `src/components/RoleGuard.tsx`

Protects routes and components based on user roles.

**Props:**
- `allowedRoles: UserRole[]` - Array of roles allowed to access
- `fallback?: ReactNode` - Optional fallback component
- `redirectTo?: string` - Redirect path (default: '/app/dashboard')

**Usage:**
```tsx
<RoleGuard allowedRoles={['admin', 'manager']}>
  <Dashboard />
</RoleGuard>
```

### 3. Permission Utilities

**File:** `src/lib/permissions.ts`

**Functions:**

#### `hasPermission(role, module, action)`
Checks if role has specific permission.

```ts
hasPermission('manager', 'products', 'edit') // true
hasPermission('attendant', 'reports', 'view') // false
```

#### `canAccessModule(role, module)`
Checks if role can access a module at all.

```ts
canAccessModule('manager', 'dashboard') // true
canAccessModule('attendant', 'dashboard') // false
```

#### `canPerformAction(role, module, action)`
Alias for `hasPermission`.

#### `getModulePermissions(role, module)`
Returns all permissions for a module.

```ts
getModulePermissions('manager', 'products')
// { canView: true, canCreate: true, canEdit: true, canDelete: false }
```

#### Convenience Functions
- `isAdmin(role)` - Check if admin
- `isManager(role)` - Check if manager
- `isAttendant(role)` - Check if attendant
- `isManagerOrHigher(role)` - Check if manager or admin
- `canManageUsers(role)` - Check if can manage users
- `canManageSubscription(role)` - Check if can manage subscription
- `canAccessFinancialData(role)` - Check if can access financial data
- `canManageInventory(role)` - Check if can manage inventory

### 4. Sidebar Integration

**File:** `src/components/Sidebar.tsx`

The sidebar automatically filters menu items based on user role using `canAccessModule()`.

Only visible menu items are rendered based on permissions.

### 5. Route Protection

**File:** `src/App.tsx`

All protected routes wrapped with `RoleGuard`:

- Dashboard: admin, manager only
- PDV: admin, manager, attendant
- Cash: admin, manager only
- Products: admin, manager only
- Recipe: admin, manager only
- Stock: admin, manager only
- Movements: admin, manager only
- Reports: admin, manager only
- Subscription: admin only
- Account: admin only
- Admin Panel: admin only

## Permission Matrix

| Module | Admin | Manager | Attendant |
|--------|-------|---------|-----------|
| Dashboard | View | View | No access |
| PDV | Full | Full | View, Create |
| Products | Full | View, Create, Edit | No access |
| Stock | Full | View, Edit | No access |
| Cash | Full | View, Create, Edit | No access |
| Reports | View | View | No access |
| Customers | Full | View, Create, Edit | No access |
| Settings | Full | Limited | No access |
| Subscription | Full | No access | No access |
| Admin Panel | Full | No access | No access |
| Recipe | Full | View | No access |
| Movements | View | View | No access |

## Migration Safety

### Automatic Migration

All existing store owners were automatically migrated to `store_users` as 'admin' role.

Migration code (executed in SQL migration):
```sql
DO $$
DECLARE
  store_record RECORD;
BEGIN
  FOR store_record IN
    SELECT DISTINCT s.id as store_id, s.owner_id as user_id
    FROM stores s
    WHERE s.owner_id IS NOT NULL
  LOOP
    INSERT INTO store_users (store_id, user_id, role, is_active)
    VALUES (store_record.store_id, store_record.user_id, 'admin', true)
    ON CONFLICT (store_id, user_id) DO NOTHING;
  END LOOP;
END $$;
```

No existing users were affected or lost data.

## Row Level Security (RLS)

All RLS policies implemented on `store_users`:

1. **Users can view own store access**
   - Users can see their own store_users record

2. **Admins can view all store users**
   - Admins can see all users in their store

3. **Admins can create store users**
   - Only admins can add new users to store

4. **Admins can update store users**
   - Only admins can modify user roles

5. **Admins can delete store users**
   - Only admins can remove users from store

## Security Considerations

### Backend Validation

All sensitive operations must validate:
1. User belongs to store (via `user_belongs_to_store()`)
2. User has required role (via `user_has_role()`)

### Frontend Protection

Multiple layers of security:
1. Route guards via `RoleGuard`
2. Menu filtering in Sidebar
3. Permission checks in components
4. Backend validation as final authority

### Important Notes

- Never trust frontend role alone
- Backend must always validate permissions
- All queries must filter by store_id
- Attendant cannot access protected routes even via URL manipulation
- No privilege escalation allowed

## Usage Examples

### Example 1: Check permission in component

```tsx
import { useAuth } from '../contexts/AuthContext';
import { canPerformAction } from '../lib/permissions';

function ProductsPage() {
  const { userRole } = useAuth();

  const canEdit = canPerformAction(userRole, 'products', 'edit');
  const canDelete = canPerformAction(userRole, 'products', 'delete');

  return (
    <div>
      {canEdit && <button>Edit Product</button>}
      {canDelete && <button>Delete Product</button>}
    </div>
  );
}
```

### Example 2: Protect component section

```tsx
import { useAuth } from '../contexts/AuthContext';
import { canAccessFinancialData } from '../lib/permissions';

function Dashboard() {
  const { userRole } = useAuth();

  return (
    <div>
      <h1>Dashboard</h1>
      {canAccessFinancialData(userRole) && (
        <div>
          <h2>Financial Data</h2>
          {/* Financial charts and data */}
        </div>
      )}
    </div>
  );
}
```

### Example 3: Backend validation in RPC

```sql
CREATE OR REPLACE FUNCTION delete_product(p_product_id uuid)
RETURNS void AS $$
DECLARE
  v_store_id uuid;
BEGIN
  -- Get product's store_id
  SELECT store_id INTO v_store_id
  FROM products
  WHERE id = p_product_id;

  -- Validate user has permission
  IF NOT user_has_role(auth.uid(), v_store_id, 'admin') THEN
    RAISE EXCEPTION 'Insufficient permissions to delete product';
  END IF;

  -- Perform deletion
  DELETE FROM products WHERE id = p_product_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Phase 2 Preparation

This RBAC system is ready for Phase 2 features:
- Tables/comandas management
- Enhanced attendant permissions for table operations
- Additional role-specific features

## Manual Steps Required

### None

All setup is automatic:
- Database migration applied automatically
- Existing users migrated automatically
- RLS policies enabled
- Frontend integrated

## Testing Checklist

- [x] Admin can access all routes
- [x] Manager cannot access subscription page
- [x] Manager cannot access admin panel
- [x] Attendant can only access PDV
- [x] Attendant redirected to PDV from dashboard
- [x] Sidebar shows only allowed modules
- [x] RoleGuard blocks unauthorized access
- [x] Backend functions return correct roles
- [x] Existing users migrated successfully

## Files Modified/Created

### Database
- `supabase/migrations/create_store_users_rbac_table.sql` (created)

### Frontend
- `src/contexts/AuthContext.tsx` (modified)
- `src/components/RoleGuard.tsx` (created)
- `src/components/Sidebar.tsx` (modified)
- `src/lib/permissions.ts` (created)
- `src/App.tsx` (modified)

### Documentation
- `RBAC_IMPLEMENTATION.md` (this file)

## Conclusion

Complete RBAC system implemented with:
- Secure database structure
- Backend validation functions
- Frontend route protection
- Permission utilities
- Role-based UI filtering
- Automatic migration of existing users
- Full RLS policies
- Zero data loss

System is production-ready for Phase 1 and prepared for Phase 2 enhancements.
