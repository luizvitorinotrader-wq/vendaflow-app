/*
  # Create Missing RBAC and Categories Tables (Consolidated)

  ## Problem
  Production database is missing:
  1. store_users table (RBAC system)
  2. product_categories table
  
  This migration consolidates all necessary table creations with correct roles and support mode compatibility.

  ## Tables Created

  ### 1. store_users (RBAC system)
  - Multi-tenant role management
  - Roles: owner, manager, staff
  - RLS policies compatible with support mode

  ### 2. product_categories
  - Per-store product organization
  - Display ordering and active/inactive toggle
  - RLS policies compatible with support mode

  ## Security
  - All tables use get_effective_store_id() for support mode compatibility
  - RLS enforced on all tables
  - Multi-tenant isolation preserved
*/

-- ============================================================================
-- CREATE store_users TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS store_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE (store_id, user_id)
);

CREATE INDEX IF NOT EXISTS store_users_store_id_idx ON store_users(store_id);
CREATE INDEX IF NOT EXISTS store_users_user_id_idx ON store_users(user_id);
CREATE INDEX IF NOT EXISTS store_users_store_user_lookup_idx ON store_users(store_id, user_id);
CREATE INDEX IF NOT EXISTS store_users_role_idx ON store_users(role);

ALTER TABLE store_users ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view their own record
CREATE POLICY "Users can view own store access"
  ON store_users FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS: Owners can view all in their store (support mode compatible)
CREATE POLICY "Owners can view all store users"
  ON store_users FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM store_users su
      WHERE su.store_id = store_users.store_id
      AND su.user_id = auth.uid()
      AND su.role = 'owner'
      AND su.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'super_admin'
      AND p.support_mode_store_id = store_users.store_id
    )
  );

-- RLS: Owners can create (support mode compatible)
CREATE POLICY "Owners can create store users"
  ON store_users FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM store_users su
      WHERE su.store_id = store_users.store_id
      AND su.user_id = auth.uid()
      AND su.role = 'owner'
      AND su.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'super_admin'
      AND p.support_mode_store_id = store_users.store_id
    )
  );

-- RLS: Owners can update (support mode compatible)
CREATE POLICY "Owners can update store users"
  ON store_users FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM store_users su
      WHERE su.store_id = store_users.store_id
      AND su.user_id = auth.uid()
      AND su.role = 'owner'
      AND su.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'super_admin'
      AND p.support_mode_store_id = store_users.store_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM store_users su
      WHERE su.store_id = store_users.store_id
      AND su.user_id = auth.uid()
      AND su.role = 'owner'
      AND su.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'super_admin'
      AND p.support_mode_store_id = store_users.store_id
    )
  );

-- RLS: Owners can delete (support mode compatible)
CREATE POLICY "Owners can delete store users"
  ON store_users FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM store_users su
      WHERE su.store_id = store_users.store_id
      AND su.user_id = auth.uid()
      AND su.role = 'owner'
      AND su.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'super_admin'
      AND p.support_mode_store_id = store_users.store_id
    )
  );

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_store_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER store_users_updated_at_trigger
  BEFORE UPDATE ON store_users
  FOR EACH ROW
  EXECUTE FUNCTION update_store_users_updated_at();

-- Migrate existing store owners to store_users as 'owner'
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
    VALUES (store_record.store_id, store_record.user_id, 'owner', true)
    ON CONFLICT (store_id, user_id) DO NOTHING;
  END LOOP;
END $$;

COMMENT ON TABLE store_users IS 'Multi-tenant RBAC: user roles per store';
COMMENT ON COLUMN store_users.role IS 'User role: owner (full), manager (operational), staff (POS only)';

-- ============================================================================
-- CREATE product_categories TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE (store_id, name),
  CHECK (name != ''),
  CHECK (display_order >= 0),
  CHECK (metadata IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_product_categories_store_order
  ON product_categories(store_id, display_order);

CREATE INDEX IF NOT EXISTS idx_product_categories_store_active
  ON product_categories(store_id, is_active)
  WHERE is_active = true;

ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;

-- RLS: SELECT (support mode compatible)
CREATE POLICY "Users can view own store categories"
  ON product_categories FOR SELECT
  TO authenticated
  USING (store_id = get_effective_store_id());

-- RLS: INSERT (owners/managers + support mode)
CREATE POLICY "Store owners and managers can create categories"
  ON product_categories FOR INSERT
  TO authenticated
  WITH CHECK (
    store_id = get_effective_store_id()
    AND (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'super_admin'
        AND support_mode_store_id = get_effective_store_id()
      )
      OR EXISTS (
        SELECT 1 FROM store_users
        WHERE user_id = auth.uid()
        AND store_id = get_effective_store_id()
        AND role IN ('owner', 'manager')
        AND is_active = true
      )
    )
  );

-- RLS: UPDATE (owners/managers + support mode)
CREATE POLICY "Store owners and managers can update categories"
  ON product_categories FOR UPDATE
  TO authenticated
  USING (
    store_id = get_effective_store_id()
    AND (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'super_admin'
        AND support_mode_store_id = get_effective_store_id()
      )
      OR EXISTS (
        SELECT 1 FROM store_users
        WHERE user_id = auth.uid()
        AND store_id = get_effective_store_id()
        AND role IN ('owner', 'manager')
        AND is_active = true
      )
    )
  )
  WITH CHECK (
    store_id = get_effective_store_id()
    AND (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'super_admin'
        AND support_mode_store_id = get_effective_store_id()
      )
      OR EXISTS (
        SELECT 1 FROM store_users
        WHERE user_id = auth.uid()
        AND store_id = get_effective_store_id()
        AND role IN ('owner', 'manager')
        AND is_active = true
      )
    )
  );

-- RLS: DELETE (owners + support mode)
CREATE POLICY "Store owners can delete categories"
  ON product_categories FOR DELETE
  TO authenticated
  USING (
    store_id = get_effective_store_id()
    AND (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'super_admin'
        AND support_mode_store_id = get_effective_store_id()
      )
      OR EXISTS (
        SELECT 1 FROM store_users
        WHERE user_id = auth.uid()
        AND store_id = get_effective_store_id()
        AND role = 'owner'
        AND is_active = true
      )
    )
  );

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_product_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER product_categories_updated_at
  BEFORE UPDATE ON product_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_product_categories_updated_at();

COMMENT ON TABLE product_categories IS 'Store-specific product categories';
COMMENT ON COLUMN product_categories.store_id IS 'Multi-tenant isolation';
COMMENT ON COLUMN product_categories.name IS 'Category name (unique per store)';
COMMENT ON COLUMN product_categories.display_order IS 'UI ordering (lower = higher priority)';

-- ============================================================================
-- ADD category_id FOREIGN KEY TO products
-- ============================================================================

-- Add category_id column to products if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'category_id'
  ) THEN
    ALTER TABLE products ADD COLUMN category_id uuid REFERENCES product_categories(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
  END IF;
END $$;