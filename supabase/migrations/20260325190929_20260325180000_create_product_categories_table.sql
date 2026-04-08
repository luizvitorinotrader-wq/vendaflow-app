/*
  # Create Product Categories Infrastructure

  1. Purpose
    - Enable stores to organize products in custom categories
    - Foundation for multi-niche system
    - Zero impact on existing products.category field

  2. New Tables
    - `product_categories`
      - `id` (uuid, primary key)
      - `store_id` (uuid, FK to stores) - multi-tenant isolation
      - `name` (text, unique per store) - category name
      - `description` (text, nullable) - optional description
      - `display_order` (integer) - UI ordering
      - `is_active` (boolean) - visibility toggle
      - `metadata` (jsonb) - extensibility
      - `created_at`, `updated_at` (timestamptz)

  3. Constraints
    - UNIQUE (store_id, name) - no duplicate category names per store
    - FK to stores with CASCADE delete
    - CHECK constraints for data integrity

  4. Security
    - Enable RLS
    - SELECT: users see own store categories
    - INSERT/UPDATE: only owners/admins
    - DELETE: only owners

  5. Performance
    - Index on (store_id, display_order) for sorted listings
    - Partial index on (store_id, is_active) for active categories

  6. Compatibility
    - Does NOT modify products table
    - Does NOT migrate existing products.category data
    - Coexists with text-based categories until future migration
*/

-- Create product_categories table
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
  
  -- Constraints
  UNIQUE (store_id, name),
  CHECK (name != ''),
  CHECK (display_order >= 0),
  CHECK (metadata IS NOT NULL)
);

-- Performance index: store + order (for sorted category lists)
CREATE INDEX IF NOT EXISTS idx_product_categories_store_order
  ON product_categories(store_id, display_order);

-- Partial index: store + active (for filtering active categories)
CREATE INDEX IF NOT EXISTS idx_product_categories_store_active
  ON product_categories(store_id, is_active)
  WHERE is_active = true;

-- Enable RLS
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;

-- RLS Policy: SELECT
-- Users can view categories for their own store
CREATE POLICY "Users can view own store categories"
  ON product_categories FOR SELECT
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

-- RLS Policy: INSERT
-- Only store owners and admins can create categories
CREATE POLICY "Store owners and admins can create categories"
  ON product_categories FOR INSERT
  TO authenticated
  WITH CHECK (
    store_id IN (
      SELECT su.store_id
      FROM store_users su
      WHERE su.user_id = auth.uid()
        AND su.role IN ('owner', 'admin')
    )
  );

-- RLS Policy: UPDATE
-- Only store owners and admins can update categories
CREATE POLICY "Store owners and admins can update categories"
  ON product_categories FOR UPDATE
  TO authenticated
  USING (
    store_id IN (
      SELECT su.store_id
      FROM store_users su
      WHERE su.user_id = auth.uid()
        AND su.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    store_id IN (
      SELECT su.store_id
      FROM store_users su
      WHERE su.user_id = auth.uid()
        AND su.role IN ('owner', 'admin')
    )
  );

-- RLS Policy: DELETE
-- Only store owners can delete categories
CREATE POLICY "Store owners can delete categories"
  ON product_categories FOR DELETE
  TO authenticated
  USING (
    store_id IN (
      SELECT su.store_id
      FROM store_users su
      WHERE su.user_id = auth.uid()
        AND su.role = 'owner'
    )
  );

-- Trigger: auto-update updated_at
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

-- Add helpful comments
COMMENT ON TABLE product_categories IS 'Store-specific product categories for multi-niche organization';
COMMENT ON COLUMN product_categories.store_id IS 'Multi-tenant isolation: each store has own categories';
COMMENT ON COLUMN product_categories.name IS 'Category name (unique per store)';
COMMENT ON COLUMN product_categories.display_order IS 'UI ordering (0-based, lower = higher priority)';
COMMENT ON COLUMN product_categories.is_active IS 'Visibility toggle without deletion';
COMMENT ON COLUMN product_categories.metadata IS 'Extensible JSONB for future features';