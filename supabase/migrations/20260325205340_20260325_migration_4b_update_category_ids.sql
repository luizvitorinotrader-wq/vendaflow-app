/*
  # Migration 4B - Atualização de products.category_id

  1. Objetivo
    - Atualizar products.category_id baseado em product_categories
    - Manter products.category intacto (fonte-da-verdade)
    - Garantir isolamento por loja

  2. Estratégia de Matching
    - JOIN: products.store_id + LOWER(TRIM(products.category)) = product_categories.(store_id + normalized_key)
    - Isolamento por loja garantido
    - Normalização idêntica à Migration 4A

  3. Rastreabilidade
    - product_categories.metadata contém informações de origem
    - Rollback: UPDATE products SET category_id = NULL (simples e direto)

  4. Segurança
    - Apenas produtos com match válido são atualizados
    - Produtos sem match permanecem com category_id NULL
    - FK products.category_id → product_categories.id garante integridade

  5. Dados Esperados (2026-03-25)
    - 36 produtos a serem atualizados
    - 100% de match esperado (diagnóstico pré-4B confirmou)
    - Loja 1: 3 produtos
    - Loja 2: 33 produtos

  6. Feature Flag
    - Nome: enable_product_categories
    - Status: is_enabled = false (permanece desabilitada até validação completa)
*/

-- Step 1: Atualizar products.category_id
DO $$
DECLARE
  v_migration_id text := '4b_update_category_ids';
  v_migration_timestamp timestamptz := NOW();
  v_total_updated integer := 0;
  v_total_null_before integer := 0;
  v_total_null_after integer := 0;
  v_total_products integer := 0;
  rec RECORD;
BEGIN
  RAISE NOTICE '=== Migration 4B: Atualização de category_id ===';
  RAISE NOTICE 'Timestamp: %', v_migration_timestamp;
  RAISE NOTICE '';
  
  -- Contagem inicial
  SELECT COUNT(*) INTO v_total_products FROM products;
  SELECT COUNT(*) INTO v_total_null_before FROM products WHERE category_id IS NULL;
  
  RAISE NOTICE 'Estado inicial:';
  RAISE NOTICE '  Total de produtos: %', v_total_products;
  RAISE NOTICE '  Produtos com category_id NULL: %', v_total_null_before;
  RAISE NOTICE '  Produtos com category_id preenchido: %', v_total_products - v_total_null_before;
  RAISE NOTICE '';
  
  -- Atualizar products.category_id
  WITH matched_categories AS (
    SELECT 
      p.id as product_id,
      pc.id as category_id
    FROM products p
    JOIN product_categories pc 
      ON p.store_id = pc.store_id 
      AND LOWER(TRIM(p.category)) = (pc.metadata->>'normalized_key')
    WHERE p.category IS NOT NULL
      AND TRIM(p.category) != ''
      AND pc.metadata->>'migration' = '4a_backfill_categories'
  )
  UPDATE products p
  SET category_id = mc.category_id
  FROM matched_categories mc
  WHERE p.id = mc.product_id;
  
  GET DIAGNOSTICS v_total_updated = ROW_COUNT;
  
  RAISE NOTICE 'Atualização concluída:';
  RAISE NOTICE '  Produtos atualizados: %', v_total_updated;
  RAISE NOTICE '';
  
  -- Verificação final
  SELECT COUNT(*) INTO v_total_null_after FROM products WHERE category_id IS NULL;
  
  RAISE NOTICE 'Estado final:';
  RAISE NOTICE '  Produtos com category_id NULL: %', v_total_null_after;
  RAISE NOTICE '  Produtos com category_id preenchido: %', v_total_products - v_total_null_after;
  RAISE NOTICE '';
  
  -- Relatório por loja
  FOR rec IN 
    SELECT 
      s.name as store_name,
      COUNT(*) as total_products,
      COUNT(p.category_id) as products_with_category_id,
      COUNT(*) - COUNT(p.category_id) as products_null_category_id
    FROM products p
    JOIN stores s ON s.id = p.store_id
    GROUP BY s.name
    ORDER BY s.name
  LOOP
    RAISE NOTICE 'Loja: %', rec.store_name;
    RAISE NOTICE '  Total de produtos: %', rec.total_products;
    RAISE NOTICE '  Com category_id: %', rec.products_with_category_id;
    RAISE NOTICE '  Sem category_id: %', rec.products_null_category_id;
    RAISE NOTICE '';
  END LOOP;
  
  -- Validação de integridade
  IF v_total_updated != (v_total_products - v_total_null_after) THEN
    RAISE WARNING 'ATENÇÃO: Discrepância detectada entre produtos atualizados e produtos com category_id';
  ELSE
    RAISE NOTICE '✅ Migration 4B concluída com sucesso';
    RAISE NOTICE '';
    RAISE NOTICE 'Próximo passo: Executar validações pós-4B';
  END IF;
END $$;

-- Step 2: Comentários para documentação
COMMENT ON COLUMN products.category_id IS 'FK para product_categories. Migration 4B: atualizado via matching com normalized_key. Rollback: UPDATE SET category_id = NULL.';