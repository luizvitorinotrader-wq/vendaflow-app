/*
  # Integração Completa de Comandas com Estoque

  ## Resumo
  Atualiza complete_tab_checkout para realizar baixa automática de estoque
  usando a MESMA lógica implementada no PDV (complete_sale_transaction).

  ## Mudanças Principais
  1. v_sale_id criado ANTES da lógica de estoque (usado como reference_id)
  2. Baixa de estoque usando FOR UPDATE (lock)
  3. Produtos pricing_type='weight' DEVEM ter weight válido (raise error se NULL)
  4. Registra movimentações em stock_movements
  5. Permite estoque negativo (nunca bloqueia vendas)

  ## Lógica de Baixa de Estoque

  Para cada item da comanda:

  1. Se product.stock_item_id IS NULL → ignora (não baixa)
  2. Se pricing_type = 'weight':
     - EXIGE weight > 0 (RAISE EXCEPTION se NULL)
     - Baixa tab_item.weight gramas
  3. Se pricing_type = 'unit' AND unit_multiplier IS NOT NULL:
     - Baixa (quantity × unit_multiplier) gramas
  4. Se pricing_type = 'unit' AND unit_multiplier IS NULL → ignora
  5. SEMPRE permite estoque negativo (log NOTICE, mas não bloqueia)

  ## Colunas de stock_movements
  - store_id
  - stock_item_id
  - type = 'sale'
  - quantity (negativo)
  - previous_stock
  - new_stock
  - reason = "Comanda Mesa X: [produto]"
  - reference_id = v_sale_id
  - created_at

  ## Segurança
  - Transação atômica: qualquer erro = rollback total
  - RLS policies mantidas
  - RBAC validation (admin/manager)
  - Support Mode compatível (via store_users)
*/

-- ================================================
-- DROP OLD FUNCTION
-- ================================================

DROP FUNCTION IF EXISTS complete_tab_checkout(uuid, uuid, text, uuid, numeric, text, uuid);

-- ================================================
-- CREATE UPDATED FUNCTION WITH STOCK INTEGRATION
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
  v_user_id uuid;
  v_quantity_to_deduct numeric;
  v_current_stock numeric;
  v_stock_deductions_count integer := 0;
BEGIN
  -- Set user ID (support mode compatible)
  v_user_id := COALESCE(p_closed_by_user_id, auth.uid());

  -- ================================================
  -- 1. VALIDATE USER ROLE (RBAC)
  -- ================================================

  SELECT su.role INTO v_user_role
  FROM store_users su
  WHERE su.user_id = v_user_id
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
    RAISE EXCEPTION 'Invalid payment method. Must be cash, credit, debit, or pix';
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

  IF p_discount < 0 THEN
    RAISE EXCEPTION 'Discount cannot be negative';
  END IF;

  IF p_discount > v_calculated_total THEN
    RAISE EXCEPTION 'Discount cannot exceed total';
  END IF;

  v_final_total := v_calculated_total - p_discount;

  IF v_final_total < 0 THEN
    v_final_total := 0;
  END IF;

  -- ================================================
  -- 8. CREATE SALE (BEFORE STOCK DEDUCTION)
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
  END LOOP;

  -- ================================================
  -- 10. STOCK DEDUCTION LOGIC (IDENTICAL TO PDV)
  -- ================================================

  FOR v_item_record IN
    SELECT product_id, quantity, weight
    FROM tab_items
    WHERE tab_id = p_tab_id
  LOOP
    SELECT * INTO v_product_record
    FROM products
    WHERE id = v_item_record.product_id AND store_id = p_store_id;

    IF NOT FOUND THEN
      RAISE WARNING 'Product not found. Skipping stock deduction.';
      CONTINUE;
    END IF;

    IF v_product_record.stock_item_id IS NULL THEN
      RAISE NOTICE 'Product has no stock_item_id. Skipping stock deduction.';
      CONTINUE;
    END IF;

    v_quantity_to_deduct := 0;

    IF v_product_record.pricing_type = 'weight' THEN
      IF v_item_record.weight IS NULL OR v_item_record.weight <= 0 THEN
        RAISE EXCEPTION 'Product is weight-based but tab_item has no valid weight. Cannot complete checkout.';
      END IF;
      v_quantity_to_deduct := v_item_record.weight;

    ELSIF v_product_record.pricing_type = 'unit' AND v_product_record.unit_multiplier IS NOT NULL THEN
      v_quantity_to_deduct := v_item_record.quantity * v_product_record.unit_multiplier;

    ELSE
      RAISE NOTICE 'Product has no unit_multiplier. Skipping stock deduction.';
      CONTINUE;
    END IF;

    SELECT current_stock INTO v_current_stock
    FROM stock_items
    WHERE id = v_product_record.stock_item_id
      AND store_id = p_store_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE WARNING 'Stock item not found for product. Skipping deduction.';
      CONTINUE;
    END IF;

    IF v_current_stock < v_quantity_to_deduct THEN
      RAISE NOTICE 'Stock will go negative. Current: %, Deducting: %', v_current_stock, v_quantity_to_deduct;
    END IF;

    UPDATE stock_items
    SET current_stock = current_stock - v_quantity_to_deduct
    WHERE id = v_product_record.stock_item_id;

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
      v_product_record.stock_item_id,
      'sale',
      -v_quantity_to_deduct,
      v_current_stock,
      v_current_stock - v_quantity_to_deduct,
      'Comanda Mesa ' || v_table_record.number || ': ' || v_product_record.name,
      v_sale_id,
      now()
    );

    v_stock_deductions_count := v_stock_deductions_count + 1;
  END LOOP;

  -- ================================================
  -- 11. CREATE CASH ENTRY
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
  -- 12. CLOSE THE TAB
  -- ================================================

  UPDATE tabs
  SET status = 'closed',
      closed_at = now(),
      notes = COALESCE(notes || E'\n' || p_notes, p_notes),
      updated_at = now()
  WHERE id = p_tab_id;

  -- ================================================
  -- 13. FREE THE TABLE
  -- ================================================

  UPDATE tables
  SET status = 'free',
      updated_at = now()
  WHERE id = v_tab_record.table_id;

  -- ================================================
  -- 14. RETURN SUCCESS RESULT
  -- ================================================

  RETURN json_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'tab_id', p_tab_id,
    'table_id', v_tab_record.table_id,
    'final_total', v_final_total,
    'payment_method', p_payment_method,
    'cash_entry_id', v_cash_entry_id,
    'stock_deductions', v_stock_deductions_count
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Tab checkout failed: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION complete_tab_checkout(uuid, uuid, text, uuid, numeric, text, uuid) TO authenticated;

COMMENT ON FUNCTION complete_tab_checkout IS
'Atomically closes a tab/comanda and creates all related financial and operational records.
Performs complete validation, stock deduction (identical to PDV logic), and ensures rollback safety.
Only admin and manager roles can execute. Allows negative stock (never blocks sales).';
