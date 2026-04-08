/*
  # Arquitetura Genérica de Controle de Estoque

  ## Visão Geral
  Implementa um sistema de controle de estoque desacoplado do tipo de venda,
  permitindo configuração independente por produto.

  ## Mudanças

  1. Novos Campos em products
     - stock_deduction_mode: define como o estoque é baixado
     - stock_deduction_multiplier: fator de conversão para modo 'by_multiplier'

  2. Migração Automática de Dados Existentes
     - Analisa pricing_type + unit_multiplier + stock_item_id
     - Define automaticamente o modo de baixa adequado
     - Preserva 100% da lógica atual

  3. Constraints de Validação
     - Apenas valores válidos em stock_deduction_mode
     - Multiplier obrigatório quando modo = 'by_multiplier'

  ## Modos de Baixa

  - 'none': Não baixa estoque
  - 'by_quantity': Baixa pela quantidade vendida
  - 'by_weight': Baixa pelo peso (em gramas)
  - 'by_multiplier': Baixa por quantity × multiplier

  ## Compatibilidade
  - Mantém unit_multiplier (legado)
  - Mantém pricing_type (venda)
  - Não quebra fluxos existentes
*/

-- ============================================
-- ETAPA 1: Adicionar novos campos
-- ============================================

DO $$ 
BEGIN
  -- Adicionar stock_deduction_mode se não existir
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'stock_deduction_mode'
  ) THEN
    ALTER TABLE products 
    ADD COLUMN stock_deduction_mode TEXT NOT NULL DEFAULT 'none';
  END IF;

  -- Adicionar stock_deduction_multiplier se não existir
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'stock_deduction_multiplier'
  ) THEN
    ALTER TABLE products 
    ADD COLUMN stock_deduction_multiplier NUMERIC(10,4) NULL;
  END IF;
END $$;

-- ============================================
-- ETAPA 2: Adicionar constraints
-- ============================================

DO $$ 
BEGIN
  -- Constraint: apenas valores válidos
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valid_stock_deduction_mode'
  ) THEN
    ALTER TABLE products 
    ADD CONSTRAINT valid_stock_deduction_mode 
    CHECK (stock_deduction_mode IN ('none', 'by_quantity', 'by_weight', 'by_multiplier'));
  END IF;

  -- Constraint: multiplier obrigatório para modo by_multiplier
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valid_multiplier_for_mode'
  ) THEN
    ALTER TABLE products 
    ADD CONSTRAINT valid_multiplier_for_mode
    CHECK (
      (stock_deduction_mode != 'by_multiplier') OR 
      (stock_deduction_mode = 'by_multiplier' AND stock_deduction_multiplier > 0)
    );
  END IF;
END $$;

-- ============================================
-- ETAPA 3: Migração Automática de Dados
-- ============================================

-- Regra 1: Sem estoque vinculado → mode = 'none'
UPDATE products 
SET stock_deduction_mode = 'none'
WHERE stock_item_id IS NULL 
  AND stock_deduction_mode = 'none'; -- idempotente

-- Regra 2: Peso + estoque → mode = 'by_weight'
UPDATE products 
SET stock_deduction_mode = 'by_weight'
WHERE pricing_type = 'weight' 
  AND stock_item_id IS NOT NULL
  AND stock_deduction_mode = 'none'; -- só migra se ainda está em 'none'

-- Regra 3: Unitário + multiplicador → mode = 'by_multiplier'
UPDATE products 
SET 
  stock_deduction_mode = 'by_multiplier',
  stock_deduction_multiplier = unit_multiplier
WHERE pricing_type = 'unit' 
  AND stock_item_id IS NOT NULL
  AND unit_multiplier IS NOT NULL
  AND unit_multiplier > 0
  AND stock_deduction_mode = 'none'; -- só migra se ainda está em 'none'

-- Regra 4: Unitário sem multiplicador → mode = 'by_quantity'
UPDATE products 
SET stock_deduction_mode = 'by_quantity'
WHERE pricing_type = 'unit' 
  AND stock_item_id IS NOT NULL
  AND (unit_multiplier IS NULL OR unit_multiplier = 0)
  AND stock_deduction_mode = 'none'; -- só migra se ainda está em 'none'

-- ============================================
-- ETAPA 4: Criar índices para performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_products_stock_deduction_mode 
ON products(stock_deduction_mode) 
WHERE stock_deduction_mode != 'none';

-- ============================================
-- ETAPA 5: Dropar funções existentes
-- ============================================

DROP FUNCTION IF EXISTS complete_sale_transaction(UUID, NUMERIC, TEXT, JSONB, UUID);
DROP FUNCTION IF EXISTS complete_tab_checkout(UUID, UUID, TEXT, UUID, NUMERIC, TEXT, UUID);

-- ============================================
-- ETAPA 6: Criar complete_sale_transaction
-- ============================================

CREATE FUNCTION complete_sale_transaction(
  p_store_id UUID,
  p_total_amount NUMERIC,
  p_payment_method TEXT,
  p_items JSONB,
  p_cash_session_id UUID
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

    -- Record stock movement
    INSERT INTO stock_movements (
      store_id,
      stock_item_id,
      movement_type,
      quantity,
      reference_type,
      reference_id,
      previous_stock,
      new_stock,
      created_by
    ) VALUES (
      p_store_id,
      v_stock_item_id,
      'out',
      v_deduction_qty,
      'sale',
      v_sale_id,
      v_previous_stock,
      v_new_stock,
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

-- ============================================
-- ETAPA 7: Criar complete_tab_checkout
-- ============================================

CREATE FUNCTION complete_tab_checkout(
  p_tab_id UUID,
  p_store_id UUID,
  p_payment_method TEXT,
  p_cash_session_id UUID,
  p_discount NUMERIC DEFAULT 0,
  p_notes TEXT DEFAULT NULL,
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

    -- Record movement
    INSERT INTO stock_movements (
      store_id,
      stock_item_id,
      movement_type,
      quantity,
      reference_type,
      reference_id,
      previous_stock,
      new_stock,
      created_by
    ) VALUES (
      p_store_id,
      v_stock_item_id,
      'out',
      v_deduction_qty,
      'tab_checkout',
      v_sale_id,
      v_previous_stock,
      v_new_stock,
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

-- ============================================
-- ETAPA 8: Comentários e documentação
-- ============================================

COMMENT ON COLUMN products.stock_deduction_mode IS 
'Define como o estoque é baixado: none (sem baixa), by_quantity (pela quantidade), by_weight (pelo peso em gramas), by_multiplier (quantity × multiplier)';

COMMENT ON COLUMN products.stock_deduction_multiplier IS 
'Multiplicador usado quando stock_deduction_mode = by_multiplier. Ex: 1 açaí 500ml baixa 500g de polpa';

COMMENT ON COLUMN products.unit_multiplier IS 
'LEGADO: Mantido para compatibilidade. Novos produtos devem usar stock_deduction_mode';