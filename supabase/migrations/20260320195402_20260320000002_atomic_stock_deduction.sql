/*
  # Atomic Stock Deduction Function
  
  1. New Functions
    - `deduct_stock_atomic` - Deducts stock atomically with row lock
  
  2. Changes
    - Prevents race conditions in stock deduction
    - Creates stock movement record atomically
    - Validates sufficient stock before deduction
    - Uses SELECT FOR UPDATE to lock rows during transaction
  
  3. Security
    - Function validates store_id to prevent cross-store modifications
    - Raises exceptions on insufficient stock or missing items
    - Atomic operation ensures data consistency
*/

CREATE OR REPLACE FUNCTION deduct_stock_atomic(
  p_stock_item_id uuid,
  p_store_id uuid,
  p_quantity numeric,
  p_sale_id uuid,
  p_product_name text
) RETURNS void AS $$
DECLARE
  v_current_stock numeric;
BEGIN
  -- Lock the row to prevent concurrent modifications
  SELECT current_stock INTO v_current_stock
  FROM stock_items
  WHERE id = p_stock_item_id 
    AND store_id = p_store_id
  FOR UPDATE;
  
  -- Check if row exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock item not found';
  END IF;
  
  -- Check if sufficient stock
  IF v_current_stock < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock for %. Available: %, Required: %', 
      p_product_name, v_current_stock, p_quantity;
  END IF;
  
  -- Update stock atomically
  UPDATE stock_items 
  SET current_stock = current_stock - p_quantity,
      updated_at = now()
  WHERE id = p_stock_item_id;
  
  -- Create stock movement record
  INSERT INTO stock_movements (
    store_id,
    stock_item_id,
    movement_type,
    quantity,
    reference_id,
    reference_type,
    created_at
  ) VALUES (
    p_store_id,
    p_stock_item_id,
    'sale',
    -p_quantity,
    p_sale_id,
    'sale',
    now()
  );
END;
$$ LANGUAGE plpgsql;