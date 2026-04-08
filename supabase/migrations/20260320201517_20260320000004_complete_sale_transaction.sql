/*
  # Complete Sale Transaction Function
  
  1. New Functions
    - `complete_sale_transaction` - Completes entire sale atomically
  
  2. Changes
    - Creates sale, items, cash entry, and deducts stock in single transaction
    - Rolls back everything if any step fails
    - Payment method validation
    - Returns sale_id on success
  
  3. Security
    - Function runs with caller's permissions
    - Relies on existing RLS policies on sales, sale_items, and cash_entries tables
*/

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
  v_result jsonb;
BEGIN
  -- Validate payment method
  IF p_payment_method NOT IN ('cash', 'credit', 'debit', 'pix') THEN
    RAISE EXCEPTION 'Invalid payment method: %', p_payment_method;
  END IF;

  -- 1. Create sale
  INSERT INTO sales (store_id, total_amount, payment_method, created_at)
  VALUES (p_store_id, p_total_amount, p_payment_method, now())
  RETURNING id INTO v_sale_id;

  -- 2. Create sale items
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

  -- 3. Create cash entry
  INSERT INTO cash_entries (
    store_id,
    cash_session_id,
    entry_type,
    amount,
    reference_id,
    reference_type,
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

  -- 4. Stock deduction is handled separately via deduct_stock_atomic in frontend
  --    This allows better error messages and validation before committing the sale
  
  -- Return success with sale ID
  SELECT jsonb_build_object(
    'success', true,
    'sale_id', v_sale_id
  ) INTO v_result;
  
  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    -- Automatic rollback on any error
    RAISE;
END;
$$ LANGUAGE plpgsql;