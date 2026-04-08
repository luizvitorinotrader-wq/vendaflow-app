/*
  # Fix stock_movements field name: movement_type → type

  ## Problem
  Functions `complete_sale_transaction` and `complete_tab_checkout` are using 
  the field `movement_type` when inserting into `stock_movements`, but the 
  actual table schema uses the field `type`.

  ## Changes
  1. Drop existing broken functions
  2. Recreate functions with correct field names:
     - Replace `movement_type` with `type`
     - Add missing `reason` field to INSERTs
  
  ## Functions Fixed
  - `complete_sale_transaction` - Used in PDV sales
  - `complete_tab_checkout` - Used in tab/table checkout
  
  ## Impact
  - Critical: Unblocks 100% of stock deductions
  - All sales with stock-enabled products will now properly record movements
*/

-- ============================================================================
-- DROP EXISTING BROKEN FUNCTIONS
-- ============================================================================

DROP FUNCTION IF EXISTS complete_sale_transaction(uuid, uuid, numeric, text, jsonb);
DROP FUNCTION IF EXISTS complete_tab_checkout(uuid, uuid, uuid, text, numeric, text, uuid);

-- ============================================================================
-- RECREATE: complete_sale_transaction
-- ============================================================================

CREATE OR REPLACE FUNCTION complete_sale_transaction(
  p_store_id UUID,
  p_cash_session_id UUID,
  p_total_amount NUMERIC,
  p_payment_method TEXT,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sale_id UUID;
  v_item JSONB;
  v_product_id UUID;
  v_product_name TEXT;
  v_quantity INTEGER;
  v_unit_price NUMERIC;
  v_weight NUMERIC;
  v_stock_item_id UUID;
  v_stock_deduction_mode TEXT;
  v_stock_multiplier NUMERIC;
  v_deduction_qty NUMERIC;
  v_previous_stock NUMERIC;
  v_new_stock NUMERIC;
  v_items_processed INTEGER := 0;
  v_user_id UUID;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Validate cash session
  IF NOT EXISTS (
    SELECT 1 FROM cash_sessions 
    WHERE id = p_cash_session_id 
      AND store_id = p_store_id 
      AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Cash session not found or not open';
  END IF;

  -- Create sale record
  INSERT INTO sales (
    store_id,
    total_amount,
    payment_method,
    created_by
  ) VALUES (
    p_store_id,
    p_total_amount,
    p_payment_method,
    v_user_id
  ) RETURNING id INTO v_sale_id;

  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_unit_price := (v_item->>'unit_price')::NUMERIC;
    v_weight := (v_item->>'weight')::NUMERIC;

    -- Insert sale item
    INSERT INTO sale_items (
      sale_id,
      product_id,
      quantity,
      unit_price,
      weight
    ) VALUES (
      v_sale_id,
      v_product_id,
      v_quantity,
      v_unit_price,
      v_weight
    );

    -- Get product stock configuration
    SELECT 
      stock_item_id, 
      stock_deduction_mode,
      stock_deduction_multiplier,
      name
    INTO 
      v_stock_item_id,
      v_stock_deduction_mode,
      v_stock_multiplier,
      v_product_name
    FROM products 
    WHERE id = v_product_id;

    -- Stock deduction logic based on mode
    IF v_stock_deduction_mode = 'none' THEN
      -- No stock deduction
      CONTINUE;

    ELSIF v_stock_item_id IS NULL THEN
      -- Log warning with detailed information
      RAISE NOTICE 'STOCK WARNING: Product "%" (ID: %) has stock_deduction_mode=% but no stock_item_id configured. Stock will not be deducted.', 
        v_product_name, v_product_id, v_stock_deduction_mode;
      CONTINUE;

    ELSIF v_stock_deduction_mode = 'by_quantity' THEN
      v_deduction_qty := v_quantity;

    ELSIF v_stock_deduction_mode = 'by_weight' THEN
      IF v_weight IS NULL OR v_weight <= 0 THEN
        RAISE EXCEPTION 'Weight required for product "%" with stock_deduction_mode = by_weight', v_product_name;
      END IF;
      v_deduction_qty := v_weight;

    ELSIF v_stock_deduction_mode = 'by_multiplier' THEN
      IF v_stock_multiplier IS NULL OR v_stock_multiplier <= 0 THEN
        RAISE EXCEPTION 'Invalid stock_deduction_multiplier for product "%"', v_product_name;
      END IF;
      v_deduction_qty := v_quantity * v_stock_multiplier;

    ELSE
      RAISE EXCEPTION 'Invalid stock_deduction_mode: % for product "%"', v_stock_deduction_mode, v_product_name;
    END IF;

    -- Apply stock deduction with lock
    SELECT current_stock INTO v_previous_stock
    FROM stock_items
    WHERE id = v_stock_item_id
    FOR UPDATE;

    v_new_stock := v_previous_stock - v_deduction_qty;

    UPDATE stock_items
    SET 
      current_stock = v_new_stock,
      updated_at = NOW()
    WHERE id = v_stock_item_id;

    -- Record stock movement (FIXED: movement_type → type, added reason)
    INSERT INTO stock_movements (
      store_id,
      stock_item_id,
      type,              -- ✅ CORRIGIDO: era "movement_type"
      quantity,
      reference_type,
      reference_id,
      previous_stock,
      new_stock,
      reason,            -- ✅ ADICIONADO
      created_by
    ) VALUES (
      p_store_id,
      v_stock_item_id,
      'sale',            -- ✅ CORRIGIDO: era 'out', agora 'sale'
      v_deduction_qty,
      'sale',
      v_sale_id,
      v_previous_stock,
      v_new_stock,
      'Venda PDV: ' || v_product_name || ' (qty: ' || v_deduction_qty || ')',  -- ✅ ADICIONADO
      v_user_id
    );

    v_items_processed := v_items_processed + 1;
  END LOOP;

  -- Create cash entry
  INSERT INTO cash_entries (
    store_id,
    cash_session_id,
    type,
    amount,
    payment_method,
    created_by
  ) VALUES (
    p_store_id,
    p_cash_session_id,
    'sale',
    p_total_amount,
    p_payment_method,
    v_user_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'items_processed', v_items_processed
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

-- ============================================================================
-- RECREATE: complete_tab_checkout
-- ============================================================================

CREATE OR REPLACE FUNCTION complete_tab_checkout(
  p_tab_id UUID,
  p_store_id UUID,
  p_cash_session_id UUID,
  p_payment_method TEXT,
  p_discount NUMERIC DEFAULT 0,
  p_notes TEXT DEFAULT '',
  p_closed_by_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sale_id UUID;
  v_subtotal NUMERIC := 0;
  v_final_total NUMERIC;
  v_item RECORD;
  v_stock_item_id UUID;
  v_stock_deduction_mode TEXT;
  v_stock_multiplier NUMERIC;
  v_deduction_qty NUMERIC;
  v_previous_stock NUMERIC;
  v_new_stock NUMERIC;
  v_user_id UUID;
  v_items_processed INTEGER := 0;
  v_product_name TEXT;
BEGIN
  -- Get user
  v_user_id := COALESCE(p_closed_by_user_id, auth.uid());

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Validate tab exists and is open
  IF NOT EXISTS (
    SELECT 1 FROM tabs 
    WHERE id = p_tab_id 
      AND store_id = p_store_id 
      AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Tab not found or already closed';
  END IF;

  -- Calculate subtotal
  SELECT COALESCE(SUM(total_price), 0) INTO v_subtotal
  FROM tab_items
  WHERE tab_id = p_tab_id;

  v_final_total := v_subtotal - p_discount;

  IF v_final_total < 0 THEN
    RAISE EXCEPTION 'Discount cannot be greater than subtotal';
  END IF;

  -- Create sale record
  INSERT INTO sales (
    store_id,
    total_amount,
    payment_method,
    notes,
    created_by
  ) VALUES (
    p_store_id,
    v_final_total,
    p_payment_method,
    p_notes,
    v_user_id
  ) RETURNING id INTO v_sale_id;

  -- Process tab items
  FOR v_item IN 
    SELECT 
      ti.*,
      p.stock_item_id,
      p.stock_deduction_mode,
      p.stock_deduction_multiplier,
      p.name as product_name
    FROM tab_items ti
    JOIN products p ON p.id = ti.product_id
    WHERE ti.tab_id = p_tab_id
  LOOP
    -- Insert sale item
    INSERT INTO sale_items (
      sale_id,
      product_id,
      quantity,
      unit_price,
      weight
    ) VALUES (
      v_sale_id,
      v_item.product_id,
      v_item.quantity,
      v_item.unit_price,
      v_item.weight
    );

    v_stock_item_id := v_item.stock_item_id;
    v_stock_deduction_mode := v_item.stock_deduction_mode;
    v_stock_multiplier := v_item.stock_deduction_multiplier;
    v_product_name := v_item.product_name;

    -- Stock deduction logic
    IF v_stock_deduction_mode = 'none' THEN
      CONTINUE;

    ELSIF v_stock_item_id IS NULL THEN
      RAISE NOTICE 'STOCK WARNING: Product "%" (ID: %) has stock_deduction_mode=% but no stock_item_id configured. Stock will not be deducted.', 
        v_product_name, v_item.product_id, v_stock_deduction_mode;
      CONTINUE;

    ELSIF v_stock_deduction_mode = 'by_quantity' THEN
      v_deduction_qty := v_item.quantity;

    ELSIF v_stock_deduction_mode = 'by_weight' THEN
      IF v_item.weight IS NULL OR v_item.weight <= 0 THEN
        RAISE EXCEPTION 'Weight required for product "%" with stock_deduction_mode = by_weight', v_product_name;
      END IF;
      v_deduction_qty := v_item.weight;

    ELSIF v_stock_deduction_mode = 'by_multiplier' THEN
      IF v_stock_multiplier IS NULL OR v_stock_multiplier <= 0 THEN
        RAISE EXCEPTION 'Invalid stock_deduction_multiplier for product "%"', v_product_name;
      END IF;
      v_deduction_qty := v_item.quantity * v_stock_multiplier;

    ELSE
      RAISE EXCEPTION 'Invalid stock_deduction_mode: % for product "%"', v_stock_deduction_mode, v_product_name;
    END IF;

    -- Apply deduction
    SELECT current_stock INTO v_previous_stock
    FROM stock_items
    WHERE id = v_stock_item_id
    FOR UPDATE;

    v_new_stock := v_previous_stock - v_deduction_qty;

    UPDATE stock_items
    SET 
      current_stock = v_new_stock,
      updated_at = NOW()
    WHERE id = v_stock_item_id;

    -- Record movement (FIXED: movement_type → type, added reason)
    INSERT INTO stock_movements (
      store_id,
      stock_item_id,
      type,              -- ✅ CORRIGIDO: era "movement_type"
      quantity,
      reference_type,
      reference_id,
      previous_stock,
      new_stock,
      reason,            -- ✅ ADICIONADO
      created_by
    ) VALUES (
      p_store_id,
      v_stock_item_id,
      'sale',            -- ✅ CORRIGIDO: era 'out', agora 'sale'
      v_deduction_qty,
      'tab_checkout',
      v_sale_id,
      v_previous_stock,
      v_new_stock,
      'Comanda fechada: ' || v_product_name || ' (qty: ' || v_deduction_qty || ')',  -- ✅ ADICIONADO
      v_user_id
    );

    v_items_processed := v_items_processed + 1;
  END LOOP;

  -- Cash entry if applicable
  IF p_cash_session_id IS NOT NULL THEN
    INSERT INTO cash_entries (
      store_id,
      cash_session_id,
      type,
      amount,
      payment_method,
      created_by
    ) VALUES (
      p_store_id,
      p_cash_session_id,
      'sale',
      v_final_total,
      p_payment_method,
      v_user_id
    );
  END IF;

  -- Close tab
  UPDATE tabs
  SET 
    status = 'closed',
    closed_at = NOW(),
    closed_by = v_user_id
  WHERE id = p_tab_id;

  -- Update table status
  UPDATE tables
  SET status = 'available'
  WHERE id = (SELECT table_id FROM tabs WHERE id = p_tab_id);

  RETURN jsonb_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'items_processed', v_items_processed,
    'final_total', v_final_total
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;
