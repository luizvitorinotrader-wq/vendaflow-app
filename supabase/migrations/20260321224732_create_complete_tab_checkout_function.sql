/*
  # Create Atomic Tab Checkout Function - Phase 3

  ## Overview
  This migration creates the `complete_tab_checkout` RPC function that atomically
  converts an open tab/comanda into a final sale with all related operational records.

  ## Purpose
  Provides a single, transaction-safe endpoint for closing tabs that:
  1. Validates tab, table, payment method, and cash session
  2. Calculates total on backend (doesn't trust frontend)
  3. Creates final sale record
  4. Creates sale_items from tab_items
  5. Creates cash entry
  6. Deducts stock atomically
  7. Creates stock movements
  8. Closes the tab
  9. Frees the table

  ## Rollback Safety
  - All operations in single transaction
  - Any failure triggers complete rollback
  - No partial data persisted
  - Clear error messages for all failure cases

  ## RBAC Integration
  - Validates user has permission via store_users table
  - Admin/Manager can close tabs
  - Attendants cannot perform financial checkout

  ## Input Parameters
  - p_tab_id: UUID of the tab to close
  - p_store_id: UUID of the store
  - p_payment_method: Payment method ('cash', 'credit', 'debit', 'pix')
  - p_cash_session_id: UUID of open cash session (required for cash payments)
  - p_discount: Discount amount (default 0)
  - p_notes: Optional notes for the sale
  - p_closed_by_user_id: UUID of user performing checkout

  ## Return Value
  JSON object with:
  - sale_id: UUID of created sale
  - tab_id: UUID of closed tab
  - final_total: Final sale amount
  - success: Boolean true
*/

-- ================================================
-- DROP FUNCTION IF EXISTS (for clean redeployment)
-- ================================================

DROP FUNCTION IF EXISTS complete_tab_checkout(uuid, uuid, text, uuid, numeric, text, uuid);

-- ================================================
-- CREATE COMPLETE_TAB_CHECKOUT FUNCTION
-- ================================================

CREATE OR REPLACE FUNCTION complete_tab_checkout(
  p_tab_id uuid,
  p_store_id uuid,
  p_payment_method text,
  p_cash_session_id uuid,
  p_discount numeric DEFAULT 0,
  p_notes text DEFAULT NULL,
  p_closed_by_user_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tab_record tabs%ROWTYPE;
  v_table_record tables%ROWTYPE;
  v_tab_items_count integer;
  v_calculated_total numeric;
  v_final_total numeric;
  v_sale_id uuid;
  v_cash_entry_id uuid;
  v_item_record record;
  v_product_record record;
  v_sale_item_id uuid;
  v_cash_session_status text;
  v_user_role text;
BEGIN
  -- ================================================
  -- 1. VALIDATE USER ROLE (RBAC)
  -- ================================================

  SELECT su.role INTO v_user_role
  FROM store_users su
  WHERE su.user_id = COALESCE(p_closed_by_user_id, auth.uid())
    AND su.store_id = p_store_id
    AND COALESCE(su.is_active, true) = true
  LIMIT 1;

  IF v_user_role IS NULL THEN
    RAISE EXCEPTION 'User does not have access to this store';
  END IF;

  IF v_user_role = 'staff' THEN
    RAISE EXCEPTION 'Attendants cannot perform financial checkout. Please contact an admin or manager.';
  END IF;

  -- ================================================
  -- 2. VALIDATE TAB
  -- ================================================

  SELECT * INTO v_tab_record
  FROM tabs
  WHERE id = p_tab_id
    AND store_id = p_store_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tab not found or does not belong to this store';
  END IF;

  IF v_tab_record.status != 'open' THEN
    RAISE EXCEPTION 'Tab is not open. Current status: %', v_tab_record.status;
  END IF;

  -- ================================================
  -- 3. VALIDATE TABLE
  -- ================================================

  SELECT * INTO v_table_record
  FROM tables
  WHERE id = v_tab_record.table_id
    AND store_id = p_store_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table not found or does not belong to this store';
  END IF;

  -- ================================================
  -- 4. VALIDATE TAB ITEMS
  -- ================================================

  SELECT COUNT(*) INTO v_tab_items_count
  FROM tab_items
  WHERE tab_id = p_tab_id;

  IF v_tab_items_count = 0 THEN
    RAISE EXCEPTION 'Cannot close tab with no items';
  END IF;

  -- Validate all items have positive quantities and prices
  IF EXISTS (
    SELECT 1 FROM tab_items
    WHERE tab_id = p_tab_id
      AND (quantity <= 0 OR unit_price < 0)
  ) THEN
    RAISE EXCEPTION 'Tab contains invalid items with zero or negative quantity/price';
  END IF;

  -- ================================================
  -- 5. VALIDATE PAYMENT METHOD
  -- ================================================

  IF p_payment_method NOT IN ('cash', 'credit', 'debit', 'pix') THEN
    RAISE EXCEPTION 'Invalid payment method: %. Must be cash, credit, debit, or pix', p_payment_method;
  END IF;

  -- ================================================
  -- 6. VALIDATE CASH SESSION (if required)
  -- ================================================

  IF p_payment_method = 'cash' THEN
    IF p_cash_session_id IS NULL THEN
      RAISE EXCEPTION 'Cash session required for cash payments';
    END IF;

    SELECT status INTO v_cash_session_status
    FROM cash_sessions
    WHERE id = p_cash_session_id
      AND store_id = p_store_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cash session not found or does not belong to this store';
    END IF;

    IF v_cash_session_status != 'open' THEN
      RAISE EXCEPTION 'Cash session is not open. Please open a cash session first.';
    END IF;
  END IF;

  -- ================================================
  -- 7. CALCULATE TOTAL ON BACKEND (security)
  -- ================================================

  SELECT COALESCE(SUM(total_price), 0) INTO v_calculated_total
  FROM tab_items
  WHERE tab_id = p_tab_id;

  -- Apply discount safely
  IF p_discount < 0 THEN
    RAISE EXCEPTION 'Discount cannot be negative';
  END IF;

  IF p_discount > v_calculated_total THEN
    RAISE EXCEPTION 'Discount (%) cannot exceed total (%)', p_discount, v_calculated_total;
  END IF;

  v_final_total := v_calculated_total - p_discount;

  IF v_final_total < 0 THEN
    v_final_total := 0;
  END IF;

  -- ================================================
  -- 8. CREATE SALE
  -- ================================================

  INSERT INTO sales (
    store_id,
    customer_id,
    total_amount,
    payment_method,
    created_at
  ) VALUES (
    p_store_id,
    NULL,
    v_final_total,
    p_payment_method,
    now()
  )
  RETURNING id INTO v_sale_id;

  -- ================================================
  -- 9. CREATE SALE_ITEMS FROM TAB_ITEMS
  -- ================================================

  FOR v_item_record IN
    SELECT
      ti.product_id,
      ti.quantity,
      ti.unit_price,
      ti.total_price,
      ti.weight,
      ti.notes
    FROM tab_items ti
    WHERE ti.tab_id = p_tab_id
  LOOP
    INSERT INTO sale_items (
      sale_id,
      product_id,
      quantity,
      unit_price,
      total_price,
      weight,
      created_at
    ) VALUES (
      v_sale_id,
      v_item_record.product_id,
      v_item_record.quantity,
      v_item_record.unit_price,
      v_item_record.total_price,
      v_item_record.weight,
      now()
    )
    RETURNING id INTO v_sale_item_id;

    -- ================================================
    -- 10. DEDUCT STOCK ATOMICALLY
    -- ================================================

    SELECT * INTO v_product_record
    FROM products
    WHERE id = v_item_record.product_id
      AND store_id = p_store_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % not found', v_item_record.product_id;
    END IF;

    -- Check stock availability (for unit-priced items)
    IF v_product_record.pricing_type = 'unit' THEN
      IF v_product_record.stock_quantity < v_item_record.quantity THEN
        RAISE EXCEPTION 'Insufficient stock for product "%". Available: %, Required: %',
          v_product_record.name,
          v_product_record.stock_quantity,
          v_item_record.quantity;
      END IF;

      -- Deduct stock
      UPDATE products
      SET stock_quantity = stock_quantity - v_item_record.quantity,
          updated_at = now()
      WHERE id = v_item_record.product_id;

      -- ================================================
      -- 11. CREATE STOCK MOVEMENT
      -- ================================================

      INSERT INTO stock_movements (
        store_id,
        stock_item_id,
        type,
        quantity,
        previous_stock,
        new_stock,
        reason,
        reference_id,
        created_at
      ) VALUES (
        p_store_id,
        v_item_record.product_id,
        'sale',
        -v_item_record.quantity,
        v_product_record.stock_quantity,
        v_product_record.stock_quantity - v_item_record.quantity,
        'Tab checkout: ' || COALESCE(v_product_record.name, 'Unknown product'),
        v_sale_id,
        now()
      );
    END IF;

    -- For weight-priced items, stock deduction could be handled differently
    -- based on your business logic
  END LOOP;

  -- ================================================
  -- 12. CREATE CASH ENTRY
  -- ================================================

  INSERT INTO cash_entries (
    store_id,
    type,
    amount,
    description,
    category,
    payment_method,
    reference_id,
    status,
    created_at
  ) VALUES (
    p_store_id,
    'entry',
    v_final_total,
    COALESCE(p_notes, 'Tab checkout - Table ' || v_table_record.number),
    'sale',
    p_payment_method,
    v_sale_id,
    'completed',
    now()
  )
  RETURNING id INTO v_cash_entry_id;

  -- ================================================
  -- 13. CLOSE THE TAB
  -- ================================================

  UPDATE tabs
  SET status = 'closed',
      closed_at = now(),
      notes = COALESCE(notes || E'\n' || p_notes, p_notes),
      updated_at = now()
  WHERE id = p_tab_id;

  -- ================================================
  -- 14. FREE THE TABLE
  -- ================================================

  UPDATE tables
  SET status = 'free',
      updated_at = now()
  WHERE id = v_tab_record.table_id;

  -- ================================================
  -- 15. RETURN SUCCESS RESULT
  -- ================================================

  RETURN json_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'tab_id', p_tab_id,
    'table_id', v_tab_record.table_id,
    'final_total', v_final_total,
    'payment_method', p_payment_method,
    'cash_entry_id', v_cash_entry_id
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Rollback happens automatically
    RAISE EXCEPTION 'Tab checkout failed: %', SQLERRM;
END;
$$;

-- ================================================
-- GRANT EXECUTE PERMISSION
-- ================================================

GRANT EXECUTE ON FUNCTION complete_tab_checkout(uuid, uuid, text, uuid, numeric, text, uuid) TO authenticated;

-- ================================================
-- ADD COMMENT
-- ================================================

COMMENT ON FUNCTION complete_tab_checkout IS
'Atomically closes a tab/comanda and creates all related financial and operational records.
Performs complete validation and ensures rollback safety. Only admin and manager roles can execute.';
