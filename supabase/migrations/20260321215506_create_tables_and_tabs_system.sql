/*
  # Create Tables and Tabs (Comandas) System - Phase 2

  ## Overview
  Implements the operational table/tab (comanda) management system.
  This phase focuses on table and order management WITHOUT financial checkout.

  ## New Tables

  ### tables
  Represents physical tables in the store
  - `id` (uuid, primary key)
  - `store_id` (uuid, not null) - Links to stores
  - `number` (integer, not null) - Table number
  - `name` (text) - Optional table name/label
  - `capacity` (integer) - Number of seats
  - `status` (text, not null) - 'free', 'occupied', 'inactive'
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### tabs
  Represents open tabs/comandas for tables
  - `id` (uuid, primary key)
  - `store_id` (uuid, not null) - Links to stores
  - `table_id` (uuid, not null) - Links to tables
  - `customer_name` (text) - Customer name
  - `attendant_id` (uuid) - User who opened the tab
  - `status` (text, not null) - 'open', 'closed', 'cancelled'
  - `opened_at` (timestamptz, not null)
  - `closed_at` (timestamptz)
  - `notes` (text)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### tab_items
  Items in a tab/comanda
  - `id` (uuid, primary key)
  - `tab_id` (uuid, not null) - Links to tabs
  - `product_id` (uuid, not null) - Links to products
  - `quantity` (numeric, not null) - Quantity ordered
  - `unit_price` (numeric, not null) - Price per unit at time of order
  - `total_price` (numeric, not null) - quantity * unit_price
  - `notes` (text) - Special instructions
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ## Constraints
  - Unique constraint on (store_id, number) for tables
  - Only one open tab per table at a time
  - Quantity, prices must be positive
  - All records scoped by store_id

  ## Security
  - Enable RLS on all tables
  - Store-scoped access policies
  - Role-based permissions for operations

  ## Business Rules
  - One table can have only one open tab at a time
  - A tab can have many items
  - Tab items do NOT deduct stock (Phase 2 limitation)
  - Final sale is NOT created in this phase
  - Plan limits enforced at application level
*/

-- ================================================
-- 1. CREATE TABLES TABLE
-- ================================================

CREATE TABLE IF NOT EXISTS tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  number integer NOT NULL,
  name text,
  capacity integer DEFAULT 4,
  status text NOT NULL DEFAULT 'free' CHECK (status IN ('free', 'occupied', 'inactive')),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  
  -- Constraints
  CONSTRAINT tables_store_number_unique UNIQUE (store_id, number),
  CONSTRAINT tables_number_positive CHECK (number > 0),
  CONSTRAINT tables_capacity_positive CHECK (capacity > 0)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS tables_store_id_idx ON tables(store_id);
CREATE INDEX IF NOT EXISTS tables_status_idx ON tables(status);
CREATE INDEX IF NOT EXISTS tables_store_status_idx ON tables(store_id, status);

-- Add comment
COMMENT ON TABLE tables IS 'Physical tables in stores for dine-in service';

-- ================================================
-- 2. CREATE TABS TABLE
-- ================================================

CREATE TABLE IF NOT EXISTS tabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  customer_name text,
  attendant_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  opened_at timestamptz DEFAULT now() NOT NULL,
  closed_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  
  -- Constraints
  CONSTRAINT tabs_closed_at_check CHECK (
    (status = 'open' AND closed_at IS NULL) OR
    (status IN ('closed', 'cancelled') AND closed_at IS NOT NULL)
  )
);

-- Create indexes
CREATE INDEX IF NOT EXISTS tabs_store_id_idx ON tabs(store_id);
CREATE INDEX IF NOT EXISTS tabs_table_id_idx ON tabs(table_id);
CREATE INDEX IF NOT EXISTS tabs_status_idx ON tabs(status);
CREATE INDEX IF NOT EXISTS tabs_attendant_id_idx ON tabs(attendant_id);
CREATE INDEX IF NOT EXISTS tabs_store_status_idx ON tabs(store_id, status);

-- Add comment
COMMENT ON TABLE tabs IS 'Open tabs/comandas for tables';

-- ================================================
-- 3. CREATE TAB_ITEMS TABLE
-- ================================================

CREATE TABLE IF NOT EXISTS tab_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_id uuid NOT NULL REFERENCES tabs(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_price numeric NOT NULL CHECK (unit_price >= 0),
  total_price numeric NOT NULL CHECK (total_price >= 0),
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS tab_items_tab_id_idx ON tab_items(tab_id);
CREATE INDEX IF NOT EXISTS tab_items_product_id_idx ON tab_items(product_id);

-- Add comment
COMMENT ON TABLE tab_items IS 'Items in a tab/comanda';

-- ================================================
-- 4. CREATE TRIGGER FUNCTIONS
-- ================================================

-- Update updated_at timestamp for tables
CREATE OR REPLACE FUNCTION update_tables_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tables_updated_at_trigger
  BEFORE UPDATE ON tables
  FOR EACH ROW
  EXECUTE FUNCTION update_tables_updated_at();

-- Update updated_at timestamp for tabs
CREATE OR REPLACE FUNCTION update_tabs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tabs_updated_at_trigger
  BEFORE UPDATE ON tabs
  FOR EACH ROW
  EXECUTE FUNCTION update_tabs_updated_at();

-- Update updated_at timestamp for tab_items
CREATE OR REPLACE FUNCTION update_tab_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tab_items_updated_at_trigger
  BEFORE UPDATE ON tab_items
  FOR EACH ROW
  EXECUTE FUNCTION update_tab_items_updated_at();

-- ================================================
-- 5. BUSINESS LOGIC TRIGGERS
-- ================================================

-- Auto-update table status when tab is opened/closed
CREATE OR REPLACE FUNCTION sync_table_status_from_tab()
RETURNS TRIGGER AS $$
BEGIN
  -- When opening a tab, mark table as occupied
  IF (TG_OP = 'INSERT' AND NEW.status = 'open') THEN
    UPDATE tables
    SET status = 'occupied'
    WHERE id = NEW.table_id;
  END IF;
  
  -- When closing a tab, check if table should be freed
  IF (TG_OP = 'UPDATE' AND OLD.status = 'open' AND NEW.status IN ('closed', 'cancelled')) THEN
    -- Only free the table if there are no other open tabs
    IF NOT EXISTS (
      SELECT 1 FROM tabs
      WHERE table_id = NEW.table_id
        AND status = 'open'
        AND id != NEW.id
    ) THEN
      UPDATE tables
      SET status = 'free'
      WHERE id = NEW.table_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_table_status_trigger
  AFTER INSERT OR UPDATE ON tabs
  FOR EACH ROW
  EXECUTE FUNCTION sync_table_status_from_tab();

-- Prevent multiple open tabs on same table
CREATE OR REPLACE FUNCTION prevent_multiple_open_tabs()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'open' THEN
    IF EXISTS (
      SELECT 1 FROM tabs
      WHERE table_id = NEW.table_id
        AND status = 'open'
        AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) THEN
      RAISE EXCEPTION 'Table already has an open tab';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_multiple_open_tabs_trigger
  BEFORE INSERT OR UPDATE ON tabs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_multiple_open_tabs();

-- Auto-calculate total_price in tab_items
CREATE OR REPLACE FUNCTION calculate_tab_item_total()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total_price = NEW.quantity * NEW.unit_price;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_tab_item_total_trigger
  BEFORE INSERT OR UPDATE ON tab_items
  FOR EACH ROW
  EXECUTE FUNCTION calculate_tab_item_total();

-- ================================================
-- 6. ENABLE RLS
-- ================================================

ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab_items ENABLE ROW LEVEL SECURITY;

-- ================================================
-- 7. RLS POLICIES FOR TABLES
-- ================================================

-- Users can view tables in their store
CREATE POLICY "Users can view tables in their store"
  ON tables
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM store_users
      WHERE store_users.store_id = tables.store_id
        AND store_users.user_id = auth.uid()
        AND store_users.is_active = true
    )
  );

-- Store admins and managers can insert tables
CREATE POLICY "Admins and managers can create tables"
  ON tables
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM store_users
      WHERE store_users.store_id = tables.store_id
        AND store_users.user_id = auth.uid()
        AND store_users.role IN ('admin', 'manager')
        AND store_users.is_active = true
    )
  );

-- Store admins and managers can update tables
CREATE POLICY "Admins and managers can update tables"
  ON tables
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM store_users
      WHERE store_users.store_id = tables.store_id
        AND store_users.user_id = auth.uid()
        AND store_users.role IN ('admin', 'manager')
        AND store_users.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM store_users
      WHERE store_users.store_id = tables.store_id
        AND store_users.user_id = auth.uid()
        AND store_users.role IN ('admin', 'manager')
        AND store_users.is_active = true
    )
  );

-- Store admins and managers can delete tables
CREATE POLICY "Admins and managers can delete tables"
  ON tables
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM store_users
      WHERE store_users.store_id = tables.store_id
        AND store_users.user_id = auth.uid()
        AND store_users.role IN ('admin', 'manager')
        AND store_users.is_active = true
    )
  );

-- ================================================
-- 8. RLS POLICIES FOR TABS
-- ================================================

-- Users can view tabs in their store
CREATE POLICY "Users can view tabs in their store"
  ON tabs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM store_users
      WHERE store_users.store_id = tabs.store_id
        AND store_users.user_id = auth.uid()
        AND store_users.is_active = true
    )
  );

-- All store users can create tabs
CREATE POLICY "Store users can create tabs"
  ON tabs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM store_users
      WHERE store_users.store_id = tabs.store_id
        AND store_users.user_id = auth.uid()
        AND store_users.is_active = true
    )
  );

-- All store users can update tabs
CREATE POLICY "Store users can update tabs"
  ON tabs
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM store_users
      WHERE store_users.store_id = tabs.store_id
        AND store_users.user_id = auth.uid()
        AND store_users.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM store_users
      WHERE store_users.store_id = tabs.store_id
        AND store_users.user_id = auth.uid()
        AND store_users.is_active = true
    )
  );

-- Admins and managers can delete tabs
CREATE POLICY "Admins and managers can delete tabs"
  ON tabs
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM store_users
      WHERE store_users.store_id = tabs.store_id
        AND store_users.user_id = auth.uid()
        AND store_users.role IN ('admin', 'manager')
        AND store_users.is_active = true
    )
  );

-- ================================================
-- 9. RLS POLICIES FOR TAB_ITEMS
-- ================================================

-- Users can view tab_items for tabs in their store
CREATE POLICY "Users can view tab items in their store"
  ON tab_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tabs
      JOIN store_users ON store_users.store_id = tabs.store_id
      WHERE tabs.id = tab_items.tab_id
        AND store_users.user_id = auth.uid()
        AND store_users.is_active = true
    )
  );

-- Store users can create tab_items
CREATE POLICY "Store users can create tab items"
  ON tab_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tabs
      JOIN store_users ON store_users.store_id = tabs.store_id
      WHERE tabs.id = tab_items.tab_id
        AND store_users.user_id = auth.uid()
        AND store_users.is_active = true
    )
  );

-- Store users can update tab_items
CREATE POLICY "Store users can update tab items"
  ON tab_items
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tabs
      JOIN store_users ON store_users.store_id = tabs.store_id
      WHERE tabs.id = tab_items.tab_id
        AND store_users.user_id = auth.uid()
        AND store_users.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tabs
      JOIN store_users ON store_users.store_id = tabs.store_id
      WHERE tabs.id = tab_items.tab_id
        AND store_users.user_id = auth.uid()
        AND store_users.is_active = true
    )
  );

-- Store users can delete tab_items
CREATE POLICY "Store users can delete tab items"
  ON tab_items
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tabs
      JOIN store_users ON store_users.store_id = tabs.store_id
      WHERE tabs.id = tab_items.tab_id
        AND store_users.user_id = auth.uid()
        AND store_users.is_active = true
    )
  );

-- ================================================
-- 10. HELPER FUNCTIONS
-- ================================================

-- Get tab total
CREATE OR REPLACE FUNCTION get_tab_total(p_tab_id uuid)
RETURNS numeric AS $$
DECLARE
  v_total numeric;
BEGIN
  SELECT COALESCE(SUM(total_price), 0)
  INTO v_total
  FROM tab_items
  WHERE tab_id = p_tab_id;
  
  RETURN v_total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_tab_total(uuid) IS 
  'Calculate total price for all items in a tab';

-- Get table count for store by plan
CREATE OR REPLACE FUNCTION get_store_table_count(p_store_id uuid)
RETURNS integer AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM tables
  WHERE store_id = p_store_id
    AND status != 'inactive';
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_store_table_count(uuid) IS 
  'Count active tables for a store (excluding inactive)';

-- Get table limit for plan
CREATE OR REPLACE FUNCTION get_table_limit_for_plan(p_plan text)
RETURNS integer AS $$
BEGIN
  CASE p_plan
    WHEN 'starter' THEN RETURN 0;
    WHEN 'pro' THEN RETURN 10;
    WHEN 'premium' THEN RETURN 30;
    ELSE RETURN 0;
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION get_table_limit_for_plan(text) IS 
  'Returns table limit for a given plan: starter=0, pro=10, premium=30';

-- ================================================
-- 11. VALIDATION
-- ================================================

DO $$
DECLARE
  tables_count integer;
  tabs_count integer;
  tab_items_count integer;
BEGIN
  SELECT COUNT(*) INTO tables_count FROM tables;
  SELECT COUNT(*) INTO tabs_count FROM tabs;
  SELECT COUNT(*) INTO tab_items_count FROM tab_items;
  
  RAISE NOTICE '=== Tables/Tabs System Created ===';
  RAISE NOTICE 'Tables: %', tables_count;
  RAISE NOTICE 'Tabs: %', tabs_count;
  RAISE NOTICE 'Tab Items: %', tab_items_count;
  RAISE NOTICE '================================';
END $$;
