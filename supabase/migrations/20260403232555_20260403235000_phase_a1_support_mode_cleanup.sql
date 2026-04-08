/*
  # Phase A.1 - Support Mode Cleanup and Completion

  ## Overview
  Sanitizes and completes the Support Mode Phase A implementation by:
  - Removing duplicate policies (old vs new)
  - Updating missing tables to use get_effective_store_id()
  - Ensuring consistent support mode behavior across all tables

  ## Changes

  ### 1. Remove Duplicate Policies
  Removes old policies that use `profiles.store_id` pattern from tables
  that already have new policies using `get_effective_store_id()`:
  - cash_entries (DELETE old)
  - cash_sessions (INSERT, SELECT, UPDATE old)
  - customers (DELETE, INSERT old)
  - products (DELETE, INSERT old)
  - stock_items (all 4 old policies)
  - sale_items (INSERT old)
  - sales (INSERT old)

  ### 2. Update Missing Tables
  Updates policies for tables still using old pattern:
  - loyalty_transactions (SELECT, INSERT)
  - product_recipe_items (SELECT, INSERT, UPDATE, DELETE)

  ### 3. Tables and Tabs System
  These tables use store_users RBAC pattern and do NOT need conversion:
  - tables (uses store_users JOIN)
  - tabs (uses store_users JOIN)
  - tab_items (uses store_users JOIN via tabs)
  
  Reason: Support mode works through store_users membership.
  When super_admin enters support mode, they get temporary store_users entry.

  ## Security
  - All policies remain restrictive
  - Multi-tenant isolation preserved
  - Support mode integration complete
  - No breaking changes to owner/manager/staff access
*/

-- ============================================================================
-- 1. REMOVE DUPLICATE OLD POLICIES
-- ============================================================================

-- cash_entries: Remove old DELETE policy
DROP POLICY IF EXISTS "Users can delete cash entries in their store" ON cash_entries;
DROP POLICY IF EXISTS "Users can insert cash entries in their store" ON cash_entries;

-- cash_sessions: Remove old policies
DROP POLICY IF EXISTS "Users can insert cash sessions for own store" ON cash_sessions;
DROP POLICY IF EXISTS "Users can read own store cash sessions" ON cash_sessions;
DROP POLICY IF EXISTS "Users can update own store cash sessions" ON cash_sessions;

-- customers: Remove old policies
DROP POLICY IF EXISTS "Users can delete customers in their store" ON customers;
DROP POLICY IF EXISTS "Users can insert customers in their store" ON customers;

-- products: Remove old policies
DROP POLICY IF EXISTS "Users can delete products in their store" ON products;
DROP POLICY IF EXISTS "Users can insert products in their store" ON products;

-- stock_items: Remove ALL old policies
DROP POLICY IF EXISTS "Users can delete stock in their store" ON stock_items;
DROP POLICY IF EXISTS "Users can insert stock in their store" ON stock_items;
DROP POLICY IF EXISTS "Users can update stock in their store" ON stock_items;
DROP POLICY IF EXISTS "Users can view stock from their store" ON stock_items;

-- sale_items: Remove old policy
DROP POLICY IF EXISTS "Users can insert sale items in their store" ON sale_items;

-- sales: Remove old policy
DROP POLICY IF EXISTS "Users can insert sales in their store" ON sales;

-- ============================================================================
-- 2. UPDATE LOYALTY_TRANSACTIONS
-- ============================================================================

DROP POLICY IF EXISTS "Users can view loyalty transactions from their store" ON loyalty_transactions;
DROP POLICY IF EXISTS "Users can insert loyalty transactions in their store" ON loyalty_transactions;

CREATE POLICY "Users can view loyalty transactions from their store"
  ON loyalty_transactions FOR SELECT
  TO authenticated
  USING (store_id = get_effective_store_id());

CREATE POLICY "Users can insert loyalty transactions to their store"
  ON loyalty_transactions FOR INSERT
  TO authenticated
  WITH CHECK (store_id = get_effective_store_id());

-- ============================================================================
-- 3. UPDATE PRODUCT_RECIPE_ITEMS
-- ============================================================================

DROP POLICY IF EXISTS "Users can view recipe items from their store" ON product_recipe_items;
DROP POLICY IF EXISTS "Users can insert recipe items for their store" ON product_recipe_items;
DROP POLICY IF EXISTS "Users can update recipe items from their store" ON product_recipe_items;
DROP POLICY IF EXISTS "Users can delete recipe items from their store" ON product_recipe_items;

CREATE POLICY "Users can view recipe items from their store"
  ON product_recipe_items FOR SELECT
  TO authenticated
  USING (store_id = get_effective_store_id());

CREATE POLICY "Users can insert recipe items to their store"
  ON product_recipe_items FOR INSERT
  TO authenticated
  WITH CHECK (store_id = get_effective_store_id());

CREATE POLICY "Users can update recipe items in their store"
  ON product_recipe_items FOR UPDATE
  TO authenticated
  USING (store_id = get_effective_store_id())
  WITH CHECK (store_id = get_effective_store_id());

CREATE POLICY "Users can delete recipe items from their store"
  ON product_recipe_items FOR DELETE
  TO authenticated
  USING (store_id = get_effective_store_id());

-- ============================================================================
-- 4. VALIDATION
-- ============================================================================

DO $$
DECLARE
  v_duplicate_count integer;
  v_old_pattern_count integer;
BEGIN
  -- Check for remaining duplicate policies (should be 0)
  SELECT COUNT(*)
  INTO v_duplicate_count
  FROM (
    SELECT tablename, cmd, COUNT(*) as policy_count
    FROM pg_policies
    WHERE tablename IN (
      'products', 'stock_items', 'sales', 'sale_items',
      'cash_sessions', 'cash_entries', 'customers',
      'loyalty_transactions', 'product_recipe_items'
    )
    GROUP BY tablename, cmd
    HAVING COUNT(*) > 1
  ) duplicates;

  -- Check for remaining old pattern usage in covered tables
  SELECT COUNT(*)
  INTO v_old_pattern_count
  FROM pg_policies
  WHERE tablename IN (
    'products', 'stock_items', 'sales', 'sale_items',
    'cash_sessions', 'cash_entries', 'customers',
    'loyalty_transactions', 'product_recipe_items'
  )
  AND (
    qual::text LIKE '%profiles.store_id%' OR
    with_check::text LIKE '%profiles.store_id%'
  );

  RAISE NOTICE '=== Phase A.1 Support Mode Cleanup Complete ===';
  RAISE NOTICE 'Duplicate policies remaining: %', v_duplicate_count;
  RAISE NOTICE 'Old pattern policies remaining: %', v_old_pattern_count;
  
  IF v_duplicate_count > 0 THEN
    RAISE WARNING 'Still have % duplicate policies!', v_duplicate_count;
  END IF;
  
  IF v_old_pattern_count > 0 THEN
    RAISE WARNING 'Still have % policies using old pattern!', v_old_pattern_count;
  END IF;
  
  RAISE NOTICE '=============================================';
END $$;
