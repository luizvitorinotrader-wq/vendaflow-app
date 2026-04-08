/*
  # Adicionar controle futuro de estoque em products

  1. Alterações
    - Adiciona campo `enforce_stock_control` (boolean, default false)
    - Preparação para bloqueio de vendas sem estoque (Fase Futura)

  2. Comportamento Atual (DEFAULT false)
    - false: permite estoque negativo (comportamento atual)
    - Vendas nunca são bloqueadas por falta de estoque

  3. Comportamento Futuro (quando ativado)
    - true: bloquear venda se estoque insuficiente
    - Validação será implementada em complete_sale_transaction e complete_tab_checkout

  4. Uso
    - Por padrão, todos os produtos permitem estoque negativo
    - Lojista poderá ativar controle produto por produto no futuro
*/

-- Adicionar campo
ALTER TABLE products
ADD COLUMN IF NOT EXISTS enforce_stock_control boolean
DEFAULT false NOT NULL;

-- Adicionar comentário
COMMENT ON COLUMN products.enforce_stock_control IS
'When true, sales will be blocked if stock is insufficient. Default false allows negative stock. Feature for future implementation.';

-- Criar índice parcial para produtos com controle ativo
CREATE INDEX IF NOT EXISTS idx_products_enforce_stock
ON products(enforce_stock_control)
WHERE enforce_stock_control = true;
