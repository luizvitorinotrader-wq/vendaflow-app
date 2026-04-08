/*
  # Migration 4A - Backfill de Categorias com Rastreabilidade Total

  1. Objetivo
    - Criar categorias estruturadas baseado em products.category (texto)
    - Rastreabilidade total via metadata (não timestamp)
    - Rollback seguro baseado em metadata.migration = '4a_backfill_categories'

  2. Estratégia de Matching
    - Normalização técnica: LOWER(TRIM(category)) para detectar duplicatas
    - Nome preservado: Primeira ocorrência alfabética do texto original
    - Case: Preservado conforme digitado pelo usuário

  3. Metadata de Rastreamento
    - migration: identificador único da migration
    - migration_timestamp: momento da execução
    - source_category_text: valor original de products.category
    - normalized_key: chave normalizada para matching futuro
    - product_count_at_creation: contagem de produtos no momento

  4. Segurança
    - Filtra por store_id (isolamento por loja)
    - Idempotente: ON CONFLICT DO NOTHING
    - Não modifica products.category_id (ainda NULL)
    - Rollback: DELETE WHERE metadata->>'migration' = '4a_backfill_categories'

  5. Dados Atuais (2026-03-25)
    - 8 categorias únicas detectadas
    - 0 conflitos de case/espaços
    - Loja 1: 3 categorias
    - Loja 2: 5 categorias

  6. Feature Flag
    - Nome: enable_product_categories
    - Status: is_enabled = false (permanece desabilitada até validação)
*/

-- Step 1: Criar categorias com metadata completa
DO $$
DECLARE
  v_migration_id text := '4a_backfill_categories';
  v_migration_timestamp timestamptz := NOW();
  v_total_created integer := 0;
  v_store_count integer := 0;
  rec RECORD;
BEGIN
  RAISE NOTICE '=== Migration 4A: Backfill de Categorias ===';
  RAISE NOTICE 'Timestamp: %', v_migration_timestamp;
  RAISE NOTICE '';
  
  -- Inserir categorias com metadata completa
  WITH unique_categories AS (
    SELECT 
      store_id,
      -- Preservar nome original (primeira ocorrência alfabética)
      (array_agg(category ORDER BY category))[1] as display_name,
      LOWER(TRIM(category)) as normalized_key,
      COUNT(*) as product_count,
      (ROW_NUMBER() OVER (PARTITION BY store_id ORDER BY LOWER(TRIM(category)))) - 1 as row_num
    FROM products
    WHERE category IS NOT NULL 
      AND TRIM(category) != ''
    GROUP BY store_id, LOWER(TRIM(category))
  )
  INSERT INTO product_categories (
    store_id, 
    name, 
    display_order, 
    metadata
  )
  SELECT 
    store_id,
    display_name,
    row_num * 10 as display_order,
    jsonb_build_object(
      'migration', v_migration_id,
      'migration_timestamp', v_migration_timestamp,
      'source_table', 'products.category',
      'source_category_text', display_name,
      'source_store_id', store_id::text,
      'normalized_key', normalized_key,
      'product_count_at_creation', product_count
    ) as metadata
  FROM unique_categories
  ON CONFLICT (store_id, name) DO NOTHING;
  
  GET DIAGNOSTICS v_total_created = ROW_COUNT;
  
  RAISE NOTICE 'Total de categorias criadas: %', v_total_created;
  RAISE NOTICE '';
  
  -- Relatório detalhado por loja
  FOR rec IN 
    SELECT 
      pc.store_id,
      s.name as store_name,
      COUNT(*) as categories_created,
      array_agg(pc.name ORDER BY pc.display_order) as category_names
    FROM product_categories pc
    LEFT JOIN stores s ON s.id = pc.store_id
    WHERE pc.metadata->>'migration' = v_migration_id
    GROUP BY pc.store_id, s.name
    ORDER BY pc.store_id
  LOOP
    RAISE NOTICE 'Loja: % (%)', rec.store_name, rec.store_id;
    RAISE NOTICE '  - Categorias criadas: %', rec.categories_created;
    RAISE NOTICE '  - Nomes: %', rec.category_names;
    RAISE NOTICE '';
  END LOOP;
  
  -- Verificação final
  SELECT COUNT(DISTINCT store_id) INTO v_store_count
  FROM product_categories
  WHERE metadata->>'migration' = v_migration_id;
  
  RAISE NOTICE 'Resumo Final:';
  RAISE NOTICE '  - Lojas afetadas: %', v_store_count;
  RAISE NOTICE '  - Total de categorias: %', v_total_created;
  RAISE NOTICE '';
  RAISE NOTICE '✅ Migration 4A concluída com sucesso';
  RAISE NOTICE '';
  RAISE NOTICE 'Próximo passo: Executar queries de validação antes de aplicar Migration 4B';
END $$;

-- Step 2: Comentários para documentação
COMMENT ON TABLE product_categories IS 'Categorias estruturadas de produtos. Migration 4A: backfill automático via metadata. Migration 4B: atualização de products.category_id.';
COMMENT ON COLUMN product_categories.metadata IS 'Rastreabilidade de migrations e operações. Migration 4A usa metadata.migration = "4a_backfill_categories" para rollback seguro.';