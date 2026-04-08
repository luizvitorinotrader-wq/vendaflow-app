/*
  # Fix complete_sale_transaction - Align stock_movements INSERT

  1. Changes
    - Update stock_movements INSERT to use actual schema columns
    - Replace: movement_type, reference_type
    - With: type, reason (no reference_type column exists)
    - Calculate and store previous_stock and new_stock values

  2. Stock Movements Schema
    - id (uuid)
    - store_id (uuid)
    - stock_item_id (uuid)
    - type (text) - was movement_type
    - quantity (numeric)
    - previous_stock (numeric) - required
    - new_stock (numeric) - required
    - reason (text) - optional description
    - reference_id (uuid)
    - created_at (timestamp)
*/

DROP FUNCTION IF EXISTS complete_sale_transaction(uuid, numeric, text, jsonb, uuid);

CREATE OR REPLACE FUNCTION complete_sale_transaction(
  p_store_id uuid,
  p_total_amount numeric,
  p_payment_method text,
  p_items jsonb,
  p_cash_session_id uuid
) RETURNS jsonb AS $$
DECLARE
  v_sale_id uuid;
  v_item record;
  v_product record;
  v_recipe_item record;
  v_stock_item record;
  v_quantity_to_deduct numeric;
  v_current_stock numeric;
  v_new_stock numeric;
  v_items_processed integer := 0;
  v_result jsonb;
BEGIN
  -- ============================================
  -- VALIDATION PHASE
  -- ============================================

  IF p_payment_method NOT IN ('cash', 'credit', 'debit', 'pix') THEN
    RAISE EXCEPTION 'Invalid payment method: %', p_payment_method;
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Sale must contain at least one item';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM cash_sessions
    WHERE id = p_cash_session_id
      AND store_id = p_store_id
      AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Cash session not found or not open';
  END IF;

  -- ============================================
  -- STOCK PRE-VALIDATION PHASE
  -- ============================================

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
    product_id uuid,
    quantity numeric,
    unit_price numeric,
    weight numeric
  )
  LOOP
    SELECT * INTO v_product
    FROM products
    WHERE id = v_item.product_id
      AND store_id = p_store_id
      AND active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found or inactive: %', v_item.product_id;
    END IF;

    IF EXISTS (
      SELECT 1 FROM product_recipe_items
      WHERE product_id = v_item.product_id
        AND store_id = p_store_id
    ) THEN
      FOR v_recipe_item IN
        SELECT pri.*, si.name as stock_name, si.current_stock, si.unit
        FROM product_recipe_items pri
        JOIN stock_items si ON si.id = pri.stock_item_id
        WHERE pri.product_id = v_item.product_id
          AND pri.store_id = p_store_id
      LOOP
        IF v_product.pricing_type = 'weight' AND v_item.weight IS NOT NULL THEN
          v_quantity_to_deduct := (v_item.weight / 1000.0) * v_recipe_item.quantity_used;
        ELSIF v_product.pricing_type = 'weight' AND v_item.weight IS NULL THEN
          RAISE EXCEPTION 'Weight required for product: %', v_product.name;
        ELSE
          v_quantity_to_deduct := v_item.quantity * v_recipe_item.quantity_used;
        END IF;

        IF v_recipe_item.current_stock < v_quantity_to_deduct THEN
          RAISE EXCEPTION 'Insufficient stock for %. Available: % %, Required: % %',
            v_recipe_item.stock_name,
            v_recipe_item.current_stock,
            v_recipe_item.unit,
            v_quantity_to_deduct,
            v_recipe_item.unit;
        END IF;
      END LOOP;

    ELSE
      SELECT si.* INTO v_stock_item
      FROM stock_items si
      WHERE si.product_id = v_item.product_id
        AND si.store_id = p_store_id
      LIMIT 1;

      IF FOUND THEN
        IF v_product.pricing_type = 'unit' THEN
          IF v_stock_item.current_stock < v_item.quantity THEN
            RAISE EXCEPTION 'Insufficient stock for %. Available: %, Required: %',
              v_stock_item.name,
              v_stock_item.current_stock,
              v_item.quantity;
          END IF;
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- ============================================
  -- SALE CREATION PHASE
  -- ============================================

  INSERT INTO sales (store_id, total_amount, payment_method, created_at)
  VALUES (p_store_id, p_total_amount, p_payment_method, now())
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
    product_id uuid,
    quantity numeric,
    unit_price numeric,
    weight numeric
  )
  LOOP
    INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, weight)
    VALUES (v_sale_id, v_item.product_id, v_item.quantity, v_item.unit_price, v_item.weight);
  END LOOP;

  INSERT INTO cash_entries (
    store_id,
    cash_session_id,
    type,
    amount,
    reference_id,
    category,
    payment_method,
    created_at
  ) VALUES (
    p_store_id,
    p_cash_session_id,
    'sale',
    p_total_amount,
    v_sale_id,
    'sale',
    p_payment_method,
    now()
  );

  -- ============================================
  -- STOCK DEDUCTION PHASE
  -- ============================================

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
    product_id uuid,
    quantity numeric,
    unit_price numeric,
    weight numeric
  )
  LOOP
    SELECT * INTO v_product
    FROM products
    WHERE id = v_item.product_id AND store_id = p_store_id;

    IF EXISTS (
      SELECT 1 FROM product_recipe_items
      WHERE product_id = v_item.product_id AND store_id = p_store_id
    ) THEN
      FOR v_recipe_item IN
        SELECT pri.*, si.name as stock_name, si.unit
        FROM product_recipe_items pri
        JOIN stock_items si ON si.id = pri.stock_item_id
        WHERE pri.product_id = v_item.product_id
          AND pri.store_id = p_store_id
      LOOP
        IF v_product.pricing_type = 'weight' AND v_item.weight IS NOT NULL THEN
          v_quantity_to_deduct := (v_item.weight / 1000.0) * v_recipe_item.quantity_used;
        ELSE
          v_quantity_to_deduct := v_item.quantity * v_recipe_item.quantity_used;
        END IF;

        SELECT current_stock INTO v_current_stock
        FROM stock_items
        WHERE id = v_recipe_item.stock_item_id
          AND store_id = p_store_id
        FOR UPDATE;

        IF v_current_stock < v_quantity_to_deduct THEN
          RAISE EXCEPTION 'Stock validation failed for %', v_recipe_item.stock_name;
        END IF;

        v_new_stock := v_current_stock - v_quantity_to_deduct;

        UPDATE stock_items
        SET current_stock = v_new_stock
        WHERE id = v_recipe_item.stock_item_id;

        -- FIXED: Use correct stock_movements schema
        INSERT INTO stock_movements (
          store_id,
          stock_item_id,
          type,              -- FIXED: was movement_type
          quantity,          -- negative for deductions
          previous_stock,    -- ADDED: required field
          new_stock,         -- ADDED: required field
          reason,            -- FIXED: use reason instead of reference_type
          reference_id,
          created_at
        ) VALUES (
          p_store_id,
          v_recipe_item.stock_item_id,
          'sale',
          -v_quantity_to_deduct,
          v_current_stock,
          v_new_stock,
          'Sale transaction',
          v_sale_id,
          now()
        );
      END LOOP;

    ELSE
      SELECT * INTO v_stock_item
      FROM stock_items
      WHERE product_id = v_item.product_id
        AND store_id = p_store_id
      LIMIT 1;

      IF FOUND AND v_product.pricing_type = 'unit' THEN
        SELECT current_stock INTO v_current_stock
        FROM stock_items
        WHERE id = v_stock_item.id
          AND store_id = p_store_id
        FOR UPDATE;

        v_new_stock := v_current_stock - v_item.quantity;

        UPDATE stock_items
        SET current_stock = v_new_stock
        WHERE id = v_stock_item.id;

        -- FIXED: Use correct stock_movements schema
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
          v_stock_item.id,
          'sale',
          -v_item.quantity,
          v_current_stock,
          v_new_stock,
          'Sale transaction',
          v_sale_id,
          now()
        );
      END IF;
    END IF;

    v_items_processed := v_items_processed + 1;
  END LOOP;

  -- ============================================
  -- RETURN SUCCESS
  -- ============================================

  SELECT jsonb_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'items_processed', v_items_processed,
    'total_amount', p_total_amount
  ) INTO v_result;

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Sale transaction failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;
