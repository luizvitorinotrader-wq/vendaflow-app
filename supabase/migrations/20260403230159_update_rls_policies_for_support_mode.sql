/*
  # Update RLS Policies for Support Mode

  1. Updates
    - Replace policies that use `profiles.store_id` with `get_effective_store_id()`
    - Remove redundant "Super admins can view all" policies (no longer needed)
    - Affected tables:
      - products
      - stock_items
      - stock_movements
      - sales
      - sale_items
      - cash_sessions
      - cash_entries
      - customers

  2. Security
    - get_effective_store_id() already enforces super_admin check
    - Normal users continue using profiles.store_id
    - Multi-tenant isolation preserved
*/

-- ============================================================================
-- PRODUCTS
-- ============================================================================

DROP POLICY IF EXISTS "Users can view products from their store" ON products;
DROP POLICY IF EXISTS "Super admins can view all products" ON products;

CREATE POLICY "Users can view products from their store"
  ON products FOR SELECT
  TO authenticated
  USING (store_id = get_effective_store_id());

DROP POLICY IF EXISTS "Users can insert products to their store" ON products;

CREATE POLICY "Users can insert products to their store"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (store_id = get_effective_store_id());

DROP POLICY IF EXISTS "Users can update products in their store" ON products;

CREATE POLICY "Users can update products in their store"
  ON products FOR UPDATE
  TO authenticated
  USING (store_id = get_effective_store_id())
  WITH CHECK (store_id = get_effective_store_id());

DROP POLICY IF EXISTS "Users can delete products from their store" ON products;

CREATE POLICY "Users can delete products from their store"
  ON products FOR DELETE
  TO authenticated
  USING (store_id = get_effective_store_id());

-- ============================================================================
-- STOCK_ITEMS
-- ============================================================================

DROP POLICY IF EXISTS "Users can view stock items from their store" ON stock_items;
DROP POLICY IF EXISTS "Super admins can view all stock items" ON stock_items;

CREATE POLICY "Users can view stock items from their store"
  ON stock_items FOR SELECT
  TO authenticated
  USING (store_id = get_effective_store_id());

DROP POLICY IF EXISTS "Users can insert stock items to their store" ON stock_items;

CREATE POLICY "Users can insert stock items to their store"
  ON stock_items FOR INSERT
  TO authenticated
  WITH CHECK (store_id = get_effective_store_id());

DROP POLICY IF EXISTS "Users can update stock items in their store" ON stock_items;

CREATE POLICY "Users can update stock items in their store"
  ON stock_items FOR UPDATE
  TO authenticated
  USING (store_id = get_effective_store_id())
  WITH CHECK (store_id = get_effective_store_id());

DROP POLICY IF EXISTS "Users can delete stock items from their store" ON stock_items;

CREATE POLICY "Users can delete stock items from their store"
  ON stock_items FOR DELETE
  TO authenticated
  USING (store_id = get_effective_store_id());

-- ============================================================================
-- STOCK_MOVEMENTS
-- ============================================================================

DROP POLICY IF EXISTS "Users can view stock movements from their store" ON stock_movements;
DROP POLICY IF EXISTS "Super admins can view all stock movements" ON stock_movements;

CREATE POLICY "Users can view stock movements from their store"
  ON stock_movements FOR SELECT
  TO authenticated
  USING (store_id = get_effective_store_id());

DROP POLICY IF EXISTS "Users can insert stock movements to their store" ON stock_movements;

CREATE POLICY "Users can insert stock movements to their store"
  ON stock_movements FOR INSERT
  TO authenticated
  WITH CHECK (store_id = get_effective_store_id());

-- ============================================================================
-- SALES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view sales from their store" ON sales;
DROP POLICY IF EXISTS "Super admins can view all sales" ON sales;

CREATE POLICY "Users can view sales from their store"
  ON sales FOR SELECT
  TO authenticated
  USING (store_id = get_effective_store_id());

DROP POLICY IF EXISTS "Users can insert sales to their store" ON sales;

CREATE POLICY "Users can insert sales to their store"
  ON sales FOR INSERT
  TO authenticated
  WITH CHECK (store_id = get_effective_store_id());

DROP POLICY IF EXISTS "Users can update sales in their store" ON sales;

CREATE POLICY "Users can update sales in their store"
  ON sales FOR UPDATE
  TO authenticated
  USING (store_id = get_effective_store_id())
  WITH CHECK (store_id = get_effective_store_id());

-- ============================================================================
-- SALE_ITEMS
-- ============================================================================

DROP POLICY IF EXISTS "Users can view sale items from their store" ON sale_items;
DROP POLICY IF EXISTS "Super admins can view all sale items" ON sale_items;

CREATE POLICY "Users can view sale items from their store"
  ON sale_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sales
      WHERE sales.id = sale_items.sale_id
      AND sales.store_id = get_effective_store_id()
    )
  );

DROP POLICY IF EXISTS "Users can insert sale items" ON sale_items;

CREATE POLICY "Users can insert sale items"
  ON sale_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sales
      WHERE sales.id = sale_items.sale_id
      AND sales.store_id = get_effective_store_id()
    )
  );

-- ============================================================================
-- CASH_SESSIONS
-- ============================================================================

DROP POLICY IF EXISTS "Users can view cash sessions from their store" ON cash_sessions;
DROP POLICY IF EXISTS "Super admins can view all cash sessions" ON cash_sessions;

CREATE POLICY "Users can view cash sessions from their store"
  ON cash_sessions FOR SELECT
  TO authenticated
  USING (store_id = get_effective_store_id());

DROP POLICY IF EXISTS "Users can insert cash sessions to their store" ON cash_sessions;

CREATE POLICY "Users can insert cash sessions to their store"
  ON cash_sessions FOR INSERT
  TO authenticated
  WITH CHECK (store_id = get_effective_store_id());

DROP POLICY IF EXISTS "Users can update cash sessions in their store" ON cash_sessions;

CREATE POLICY "Users can update cash sessions in their store"
  ON cash_sessions FOR UPDATE
  TO authenticated
  USING (store_id = get_effective_store_id())
  WITH CHECK (store_id = get_effective_store_id());

-- ============================================================================
-- CASH_ENTRIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view cash entries from their store" ON cash_entries;
DROP POLICY IF EXISTS "Super admins can view all cash entries" ON cash_entries;

CREATE POLICY "Users can view cash entries from their store"
  ON cash_entries FOR SELECT
  TO authenticated
  USING (store_id = get_effective_store_id());

DROP POLICY IF EXISTS "Users can insert cash entries to their store" ON cash_entries;

CREATE POLICY "Users can insert cash entries to their store"
  ON cash_entries FOR INSERT
  TO authenticated
  WITH CHECK (store_id = get_effective_store_id());

DROP POLICY IF EXISTS "Users can update cash entries in their store" ON cash_entries;

CREATE POLICY "Users can update cash entries in their store"
  ON cash_entries FOR UPDATE
  TO authenticated
  USING (store_id = get_effective_store_id())
  WITH CHECK (store_id = get_effective_store_id());

-- ============================================================================
-- CUSTOMERS
-- ============================================================================

DROP POLICY IF EXISTS "Users can view customers from their store" ON customers;
DROP POLICY IF EXISTS "Super admins can view all customers" ON customers;

CREATE POLICY "Users can view customers from their store"
  ON customers FOR SELECT
  TO authenticated
  USING (store_id = get_effective_store_id());

DROP POLICY IF EXISTS "Users can insert customers to their store" ON customers;

CREATE POLICY "Users can insert customers to their store"
  ON customers FOR INSERT
  TO authenticated
  WITH CHECK (store_id = get_effective_store_id());

DROP POLICY IF EXISTS "Users can update customers in their store" ON customers;

CREATE POLICY "Users can update customers in their store"
  ON customers FOR UPDATE
  TO authenticated
  USING (store_id = get_effective_store_id())
  WITH CHECK (store_id = get_effective_store_id());

DROP POLICY IF EXISTS "Users can delete customers from their store" ON customers;

CREATE POLICY "Users can delete customers from their store"
  ON customers FOR DELETE
  TO authenticated
  USING (store_id = get_effective_store_id());