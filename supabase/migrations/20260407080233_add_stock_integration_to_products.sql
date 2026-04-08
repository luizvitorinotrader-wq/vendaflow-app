/*
  # Integração Vendas → Estoque (Açaí Simplificada)

  ## Resumo
  Adiciona suporte para baixa automática de estoque em vendas usando lógica simplificada
  de conversão unitária, focada exclusivamente no produto Açaí.

  ## Alterações na Tabela `products`
  - Adiciona `stock_item_id` (uuid, nullable, FK to stock_items)
    - Vincula produto de venda ao item de estoque
    - Se NULL → não realiza baixa automática
    - Se preenchido → baixa estoque conforme regras de conversão

  ## Alterações na Tabela `stock_movements`
  - Adiciona `reference_type` (text, nullable)
    - Valores permitidos: 'sale', 'tab_checkout', 'adjustment', 'supply', 'loss'
    - Identifica tipo de operação que gerou a movimentação
  - Adiciona `created_by` (uuid, nullable, FK to auth.users)
    - Rastreabilidade: quem executou a movimentação

  ## Regras de Negócio
  1. Se `product.stock_item_id` IS NULL → nenhuma baixa de estoque
  2. Se `product.pricing_type = 'weight'` → baixar `sale_item.weight` gramas
  3. Se `product.pricing_type = 'unit'` AND `product.unit_multiplier` IS NOT NULL
     → baixar `(sale_item.quantity × product.unit_multiplier)` gramas
  4. Se `product.pricing_type = 'unit'` AND `product.unit_multiplier` IS NULL
     → nenhuma baixa de estoque
  5. PERMITIR ESTOQUE NEGATIVO (não bloquear vendas)

  ## Exemplo de Uso
  
  ### Item de Estoque
  ```
  stock_items:
    id: abc-123
    name: "Açaí Base"
    unit: "g"
    current_stock: 10000 (10kg)
  ```

  ### Produtos de Venda
  ```
  products:
    1. Açaí Self-Service
       - pricing_type: 'weight'
       - stock_item_id: abc-123
       - unit_multiplier: NULL
       
    2. Açaí 300ml
       - pricing_type: 'unit'
       - price: 12.00
       - stock_item_id: abc-123
       - unit_multiplier: 300
       
    3. Açaí 500ml
       - pricing_type: 'unit'
       - price: 18.00
       - stock_item_id: abc-123
       - unit_multiplier: 500
       
    4. Açaí 1L
       - pricing_type: 'unit'
       - price: 30.00
       - stock_item_id: abc-123
       - unit_multiplier: 1000
  ```

  ### Cenário de Venda
  ```
  Venda:
    - 1× Açaí Self-Service 450g → baixa 450g
    - 2× Açaí 500ml → baixa 2 × 500 = 1000g
  
  Total baixado: 1450g
  Estoque final: 10000 - 1450 = 8550g
  ```

  ## Segurança
  - Sem alterações em RLS
  - FK constraints garantem integridade referencial
  - Índices criados para performance

  ## Notas Importantes
  1. Vendas NÃO serão bloqueadas por estoque insuficiente
  2. Sistema permite estoque negativo
  3. Produtos sem stock_item_id continuam funcionando normalmente
  4. Log será gerado quando stock_item_id for NULL (não quebra venda)
*/

-- ============================================
-- 1. ADD STOCK_ITEM_ID TO PRODUCTS
-- ============================================

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS stock_item_id uuid 
REFERENCES stock_items(id) ON DELETE SET NULL;

COMMENT ON COLUMN products.stock_item_id IS 
'Foreign key to stock_items. When set, sales will automatically deduct from this stock item based on pricing_type and unit_multiplier.';

-- ============================================
-- 2. ADD REFERENCE_TYPE TO STOCK_MOVEMENTS
-- ============================================

ALTER TABLE stock_movements 
ADD COLUMN IF NOT EXISTS reference_type text 
CHECK (reference_type IN ('sale', 'tab_checkout', 'adjustment', 'supply', 'loss'));

COMMENT ON COLUMN stock_movements.reference_type IS 
'Type of operation that generated this stock movement: sale (PDV), tab_checkout (comandas), adjustment (manual), supply (entrada), loss (perda).';

-- ============================================
-- 3. ADD CREATED_BY TO STOCK_MOVEMENTS
-- ============================================

ALTER TABLE stock_movements 
ADD COLUMN IF NOT EXISTS created_by uuid 
REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN stock_movements.created_by IS 
'User who performed the operation that generated this stock movement. NULL for system-generated movements.';

-- ============================================
-- 4. CREATE INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_products_stock_item_id 
ON products(stock_item_id) 
WHERE stock_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_reference_type 
ON stock_movements(reference_type) 
WHERE reference_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_created_by 
ON stock_movements(created_by) 
WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_store_reference 
ON stock_movements(store_id, reference_id, reference_type);
