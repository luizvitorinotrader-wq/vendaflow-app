# Tables/Comandas System - Phase 2 Complete

## Status: ✅ IMPLEMENTED AND STABLE

This document describes the complete Phase 2 implementation of the Tables/Comandas (tabs) system.

---

## Overview

Phase 2 adds operational table and tab (comanda) management to the Açaí POS system. This feature allows stores to manage dine-in service with tables and open tabs, tracking orders without yet performing final financial checkout.

**Important:** This phase focuses ONLY on operational comanda management. It does NOT include:
- Final sale creation
- Cash entry generation
- Stock deduction
- Complete financial checkout

These features will be added in a future phase.

---

## Database Schema

### tables
```sql
{
  id: uuid PRIMARY KEY
  store_id: uuid NOT NULL (FK to stores)
  number: integer NOT NULL
  name: text NULL
  capacity: integer DEFAULT 4
  status: text NOT NULL ('free' | 'occupied' | 'inactive')
  created_at: timestamptz
  updated_at: timestamptz

  UNIQUE (store_id, number)
}
```

**Purpose:** Represents physical tables in the store

**Business Rules:**
- Each table must have a unique number within the store
- Status automatically updates based on tab state
- Inactive tables can't be used but remain in system

### tabs
```sql
{
  id: uuid PRIMARY KEY
  store_id: uuid NOT NULL (FK to stores)
  table_id: uuid NOT NULL (FK to tables)
  customer_name: text NULL
  attendant_id: uuid NULL (FK to auth.users)
  status: text NOT NULL ('open' | 'closed' | 'cancelled')
  opened_at: timestamptz NOT NULL
  closed_at: timestamptz NULL
  notes: text NULL
  created_at: timestamptz
  updated_at: timestamptz
}
```

**Purpose:** Represents open tabs/comandas for tables

**Business Rules:**
- Only ONE open tab per table at a time (enforced by trigger)
- When tab opens, table status → 'occupied'
- When tab closes, table status → 'free' (if no other open tabs)
- Attendant tracks who opened the tab

### tab_items
```sql
{
  id: uuid PRIMARY KEY
  tab_id: uuid NOT NULL (FK to tabs)
  product_id: uuid NOT NULL (FK to products)
  quantity: numeric NOT NULL
  unit_price: numeric NOT NULL
  total_price: numeric NOT NULL (auto-calculated)
  notes: text NULL
  created_at: timestamptz
  updated_at: timestamptz
}
```

**Purpose:** Items in a tab/comanda

**Business Rules:**
- total_price = quantity × unit_price (auto-calculated by trigger)
- unit_price captured at order time (not live product price)
- Items do NOT deduct stock immediately
- Notes for special instructions (e.g., "sem leite condensado")

---

## Database Triggers

### Auto-Update Table Status
**Trigger:** `sync_table_status_from_tab()`
- When tab opens → table.status = 'occupied'
- When tab closes → table.status = 'free' (if no other open tabs)
- Keeps table status in sync with tab state

### Prevent Multiple Open Tabs
**Trigger:** `prevent_multiple_open_tabs()`
- Blocks INSERT/UPDATE if table already has open tab
- Ensures business rule: one tab per table

### Auto-Calculate Total Price
**Trigger:** `calculate_tab_item_total()`
- Sets tab_items.total_price = quantity × unit_price
- Prevents manual price manipulation

---

## Plan Limits

### Starter Plan
- **Table Limit:** 0 tables
- **Access:** Feature locked, upgrade prompt shown

### Pro Plan
- **Table Limit:** 10 tables
- **Access:** Full tables/comandas feature

### Premium Plan
- **Table Limit:** 30 tables
- **Access:** Full tables/comandas feature

**Enforcement:**
- Limits checked at creation time (frontend + business logic)
- User cannot create more tables than plan allows
- Upgrade prompts shown when limit reached

---

## Role-Based Access Control

### System Admin
- Not involved in tables feature (unrelated to store operations)

### Store Admin
- ✅ View all tables in own store
- ✅ Create new tables
- ✅ Edit table details
- ✅ Delete/deactivate tables
- ✅ Open tabs
- ✅ Add/edit/remove tab items
- ✅ Close tabs

### Manager
- ✅ View all tables in own store
- ✅ Create new tables
- ✅ Edit table details
- ✅ Delete/deactivate tables
- ✅ Open tabs
- ✅ Add/edit/remove tab items
- ✅ Close tabs

### Attendant
- ✅ View all tables in own store
- ✅ Open tabs
- ✅ Add/edit/remove tab items
- ❌ Cannot create/edit/delete tables
- ❌ Cannot access admin modules

---

## Security (RLS Policies)

All tables have Row Level Security enabled with store-scoped access.

### tables Policies
1. **View:** Users can view tables in their store (all roles)
2. **Create:** Admins and managers can create tables
3. **Update:** Admins and managers can update tables
4. **Delete:** Admins and managers can delete tables

### tabs Policies
1. **View:** Users can view tabs in their store (all roles)
2. **Create:** All store users can create tabs
3. **Update:** All store users can update tabs
4. **Delete:** Admins and managers can delete tabs

### tab_items Policies
1. **View:** Users can view tab_items for tabs in their store (all roles)
2. **Create:** All store users can create tab_items
3. **Update:** All store users can update tab_items
4. **Delete:** All store users can delete tab_items

All policies enforce store membership via `store_users` table.

---

## Frontend Components

### 1. Tables Dashboard (`src/pages/Tables.tsx`)

**Features:**
- Grid view of all tables in store
- Color-coded status (free = white, occupied = green, inactive = gray)
- Shows customer name and subtotal for occupied tables
- Click table to open or view tab
- Create new table button (respects plan limits)
- Upgrade prompts for starter users and limit reached

**Permissions:**
- All roles can view
- Admin/Manager can create tables
- Attendant view-only for table management

### 2. Tab View (`src/pages/TabView.tsx`)

**Features:**
- Open new tab for free table
- View/edit customer name
- Add items to tab
- Remove items from tab
- View running total
- Close tab (marks as closed, no financial processing yet)

**Item Management:**
- Select product from dropdown
- Enter quantity
- Add optional notes
- Auto-calculates total

**Permissions:**
- All roles can operate tabs
- Admin/Manager can close tabs

### 3. New Table Modal (`src/components/NewTableModal.tsx`)

**Features:**
- Enter table number (required, unique)
- Enter table name/label (optional)
- Enter capacity (default: 4)
- Validates against plan limits
- Shows current count vs max allowed

**Permissions:**
- Admin/Manager only

---

## Helper Functions

### Plan Limit Utilities (`src/lib/planLimits.ts`)
```typescript
getPlanLimits(planName: string): PlanLimits
canCreateTable(currentCount: number, planName: string): boolean
getTableLimitMessage(planName: string): string
```

### Database Functions
```sql
get_tab_total(p_tab_id uuid): numeric
  - Calculate total price for all items in a tab

get_store_table_count(p_store_id uuid): integer
  - Count active tables for a store

get_table_limit_for_plan(p_plan text): integer
  - Returns table limit for plan (starter=0, pro=10, premium=30)
```

---

## Routes

### New Routes Added
```typescript
/app/tables
  - Tables dashboard (all roles)

/app/tables/:tableId
  - Open tab for free table (all roles)

/app/tables/:tableId/tab/:tabId
  - View/edit open tab (all roles)
```

### Navigation
- New "Mesas" menu item in sidebar (Utensils icon)
- Shown to all roles with tables permission
- Hidden for starter plan users (shown with lock icon on page)

---

## Permissions Module Updates

Added `tables` module to `src/lib/permissions.ts`:

**Admin:**
- view, create, edit, delete

**Manager:**
- view, create, edit, delete

**Attendant:**
- view only (for tables themselves)
- full access to tab operations (open, add items, etc.)

---

## Business Workflow

### Opening a Tab
1. Navigate to `/app/tables`
2. Click on free table
3. (Optional) Enter customer name
4. Click "Abrir Comanda"
5. Tab opens, table status → occupied

### Adding Items
1. Open tab view
2. Click "Adicionar Item"
3. Select product
4. Enter quantity
5. (Optional) Add notes
6. Click "Adicionar"
7. Item added to tab, total updates

### Closing a Tab
1. Open tab view
2. Click "Fechar Comanda"
3. Confirm action
4. Tab marked as closed
5. Table status → free
6. **Note:** No sale/cash/stock movements created yet

---

## What's NOT Included (Phase 2 Limitations)

### Financial Checkout
- ❌ No sale record created
- ❌ No cash entry generated
- ❌ No payment processing
- ❌ No receipt generation

### Stock Management
- ❌ Stock NOT deducted when adding items
- ❌ No stock movements created
- ❌ No low stock warnings for tab items

### Reporting
- ❌ Tabs not included in sales reports
- ❌ No tab analytics
- ❌ No historical tab viewing

### Advanced Features
- ❌ Cannot transfer items between tabs
- ❌ Cannot merge tabs
- ❌ Cannot split tabs
- ❌ No tab printing

**These features will be added in future phases.**

---

## Migration Applied

**File:** `supabase/migrations/create_tables_and_tabs_system.sql`

**What it does:**
1. Creates `tables` table with constraints
2. Creates `tabs` table with constraints
3. Creates `tab_items` table with constraints
4. Adds indexes for performance
5. Creates triggers for business logic
6. Enables RLS on all tables
7. Creates RLS policies for store-scoped access
8. Creates helper functions

**Safe to run multiple times:** Uses `IF NOT EXISTS` checks

---

## Files Created/Modified

### New Files
1. ✅ `src/pages/Tables.tsx` - Tables dashboard
2. ✅ `src/pages/TabView.tsx` - Tab management view
3. ✅ `src/components/NewTableModal.tsx` - Create table modal
4. ✅ `src/lib/planLimits.ts` - Plan limit utilities
5. ✅ `supabase/migrations/create_tables_and_tabs_system.sql` - Database migration

### Modified Files
1. ✅ `src/App.tsx` - Added routes for tables
2. ✅ `src/components/Sidebar.tsx` - Added Mesas menu item
3. ✅ `src/lib/permissions.ts` - Added tables module permissions
4. ✅ `src/lib/formatters.ts` - Added formatCurrency helper

---

## Testing Checklist

### Database
- [x] Tables table created with correct schema
- [x] Tabs table created with correct schema
- [x] Tab_items table created with correct schema
- [x] Triggers work (status sync, prevent duplicate tabs, calculate total)
- [x] RLS policies enforce store scoping
- [x] Helper functions work correctly

### Plan Limits
- [x] Starter plan shows locked feature
- [x] Pro plan allows up to 10 tables
- [x] Premium plan allows up to 30 tables
- [x] Cannot create more tables than limit
- [x] Upgrade prompts shown correctly

### Role Access
- [x] Admin has full access
- [x] Manager has full access
- [x] Attendant can view and operate tabs
- [x] Attendant cannot manage tables

### UI/UX
- [x] Tables dashboard shows all tables
- [x] Color coding works (free/occupied/inactive)
- [x] Can create new table (within limit)
- [x] Can open tab on free table
- [x] Can add items to tab
- [x] Can remove items from tab
- [x] Total calculates correctly
- [x] Can close tab
- [x] Table status updates correctly

### Build
- [x] Project builds without errors
- [x] No TypeScript errors
- [x] All imports resolve correctly

---

## Manual Steps (None Required)

No manual steps required after deployment. The migration handles all database setup automatically.

---

## Known Limitations

### Temporary (Phase 2)
1. Closing tab doesn't create sale
2. No stock deduction
3. No cash integration
4. No receipt printing

### By Design
1. One open tab per table (enforced)
2. Cannot edit closed tabs
3. Table numbers must be unique per store
4. Plan limits enforced at creation time

---

## Future Enhancements (Phase 3+)

### Financial Integration
- Create sale when closing tab
- Generate cash entry
- Deduct stock
- Print receipt

### Advanced Features
- Transfer items between tabs
- Merge multiple tabs
- Split tab into multiple payments
- Tab history viewing
- Tab analytics and reporting

### UX Improvements
- Table layout/map view
- Drag-and-drop table management
- Quick-add favorite items
- Tab templates
- Kitchen display system integration

---

## Summary

Phase 2 Tables/Comandas system is **fully implemented and stable**.

**Key Features:**
✅ Table management with plan limits
✅ Tab/comanda operations
✅ Item management
✅ Role-based access control
✅ Store-scoped security
✅ Automatic status tracking

**Limitations:**
❌ No financial checkout (Phase 3)
❌ No stock deduction (Phase 3)
❌ No reporting integration (Phase 3)

**Next Phase:** Integrate tabs with sales, cash, and stock systems for complete financial workflow.
