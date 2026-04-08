/*
  # Atualizar complete_sale_transaction - Lógica Simplificada de Estoque

  ## Resumo
  Substitui a lógica complexa de fichas técnicas por uma abordagem simplificada
  focada em conversão direta unitária para o produto Açaí.

  ## Mudanças
  - Remove dependência de product_recipe_items (ficha técnica)
  - Implementa lógica simplificada via stock_item_id + unit_multiplier
  - Permite estoque negativo (não bloqueia vendas)
  - Adiciona log quando produto não tem stock_item_id vinculado
  - Corrige uso de campos (type, reference_type, created_by)

  ## Lógica de Baixa de Estoque
  
  Para cada item vendido:
  
  1. Se product.stock_item_id IS NULL → ignora (não baixa)
  2. Se pricing_type = 'weight' → baixa sale_item.weight gramas
  3. Se pricing_type = 'unit' AND unit_multiplier IS NOT NULL
     → baixa (sale_item.quantity × unit_multiplier) gramas
  4. Se pricing_type = 'unit' AND unit_multiplier IS NULL → ignora
  5. SEMPRE permite estoque negativo (nunca RAISE EXCEPTION)

  ## Exemplo Prático
  ```
  Venda:
    - 1× Açaí Self-Service 350g → baixa 350g
    - 2× Açaí 500ml → baixa 2 × 500 = 1000g
  
  Total baixado: 1350g do item "Açaí Base"
  ```

  ## Segurança
  - Mantém validações de usuário, loja, sessão de caixa
  - Mantém atomicidade da transação
  - Não bloqueia vendas por falta de estoque
*/

-- ============================================
-- DROP OLD FUNCTION
-- ============================================

DROP FUNCTION IF EXISTS complete_sale_transaction(uuid, numeric, text, jsonb, uuid);

-- ============================================
-- CREATE UPDATED FUNCTION
-- ============================================

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
  v_stock_item record;
  v_quantity_to_deduct numeric;
  v_current_stock numeric;
  v_items_processed integer := 0;
  v_stock_deductions_count integer := 0;
  v_result jsonb;
  v_user_id uuid;
BEGIN
  -- ============================================
  -- VALIDATION PHASE
  -- ============================================

  -- Get current user
  v_user_id := auth.uid();

  -- Validate payment method
  IF p_payment_method NOT IN ('cash', 'credit', 'debit', 'pix') THEN
    RAISE EXCEPTION 'Invalid payment method: %', p_payment_method;
  END IF;

  -- Validate items array is not empty
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Sale must contain at least one item';
  END IF;

  -- Validate cash session exists and is open
  IF NOT EXISTS (
    SELECT 1 FROM cash_sessions
    WHERE id = p_cash_session_id
      AND store_id = p_store_id
      AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Cash session not found or not open';
  END IF;

  -- ============================================
  -- SALE CREATION PHASE
  -- ============================================

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

  -- ============================================
  -- STOCK DEDUCTION PHASE (SIMPLIFIED LOGIC)
  -- ============================================

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
    product_id uuid,
    quantity numeric,
    unit_price numeric,
    weight numeric
  )
  LOOP
    -- Get product details
    SELECT * INTO v_product
    FROM products
    WHERE id = v_item.product_id 
      AND store_id = p_store_id;

    IF NOT FOUND THEN
      RAISE WARNING 'Product not found: %. Skipping stock deduction.', v_item.product_id;
      CONTINUE;
    END IF;

    -- Check if product has stock_item_id linked
    IF v_product.stock_item_id IS NULL THEN
      RAISE NOTICE 'Product "%" (id: %) has no stock_item_id. Skipping stock deduction.', 
        v_product.name, v_product.id;
      CONTINUE;
    END IF;

    -- ============================================
    -- CALCULATE QUANTITY TO DEDUCT (IN GRAMS)
    -- ============================================

    v_quantity_to_deduct := 0;

    IF v_product.pricing_type = 'weight' THEN
      -- Weight-based product: deduct exact weight sold
      IF v_item.weight IS NULL OR v_item.weight <= 0 THEN
        RAISE WARNING 'Product "%" is weight-based but no valid weight provided. Skipping.', v_product.name;
        CONTINUE;
      END IF;
      v_quantity_to_deduct := v_item.weight;

    ELSIF v_product.pricing_type = 'unit' AND v_product.unit_multiplier IS NOT NULL THEN
      -- Unit-based product with conversion: quantity × multiplier
      v_quantity_to_deduct := v_item.quantity * v_product.unit_multiplier;

    ELSE
      -- Unit-based without conversion: skip
      RAISE NOTICE 'Product "%" has no unit_multiplier. Skipping stock deduction.', v_product.name;
      CONTINUE;
    END IF;

    -- ============================================
    -- DEDUCT STOCK (ALLOW NEGATIVE)
    -- ============================================

    -- Lock stock item row for update
    SELECT current_stock INTO v_current_stock
    FROM stock_items
    WHERE id = v_product.stock_item_id
      AND store_id = p_store_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE WARNING 'Stock item not found for product "%". Skipping deduction.', v_product.name;
      CONTINUE;
    END IF;

    -- Log if stock will go negative (but don't block)
    IF v_current_stock < v_quantity_to_deduct THEN
      RAISE NOTICE 'Stock for product "%" will go negative. Current: %g, Deducting: %g', 
        v_product.name, v_current_stock, v_quantity_to_deduct;
    END IF;

    -- Deduct stock (ALWAYS, even if negative)
    UPDATE stock_items
    SET current_stock = current_stock - v_quantity_to_deduct
    WHERE id = v_product.stock_item_id;

    -- Create stock movement record
    INSERT INTO stock_movements (
      store_id,
      stock_item_id,
      type,
      quantity,
      previous_stock,
      new_stock,
      reason,
      reference_id,
      reference_type,
      created_by,
      created_at
    ) VALUES (
      p_store_id,
      v_product.stock_item_id,
      'sale',
      -v_quantity_to_deduct,
      v_current_stock,
      v_current_stock - v_quantity_to_deduct,
      'Venda PDV: ' || v_product.name,
      v_sale_id,
      'sale',
      v_user_id,
      now()
    );

    v_stock_deductions_count := v_stock_deductions_count + 1;
    v_items_processed := v_items_processed + 1;
  END LOOP;

  -- ============================================
  -- RETURN SUCCESS
  -- ============================================

  SELECT jsonb_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'items_processed', v_items_processed,
    'stock_deductions', v_stock_deductions_count,
    'total_amount', p_total_amount
  ) INTO v_result;

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    -- PostgreSQL automatically rolls back the entire transaction
    RAISE EXCEPTION 'Sale transaction failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- GRANT EXECUTE PERMISSION
-- ============================================

GRANT EXECUTE ON FUNCTION complete_sale_transaction(uuid, numeric, text, jsonb, uuid) TO authenticated;

-- ============================================
-- ADD COMMENT
-- ============================================

COMMENT ON FUNCTION complete_sale_transaction IS 
'Atomically creates sale, sale items, cash entry, and deducts stock using simplified conversion logic. 
Allows negative stock and never blocks sales due to insufficient inventory.';
