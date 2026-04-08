/*
  # Adicionar suporte a peso em tab_items

  1. Alterações
    - Adiciona campo `weight` (numeric, nullable) em tab_items
    - Permite vendas por peso em comandas/mesas
    - Compatible com produtos pricing_type='weight'

  2. Regras
    - weight IS NULL para produtos unitários
    - weight em gramas para produtos por peso
    - CHECK constraint: se preenchido, deve ser > 0

  3. Uso
    - Usado na função complete_tab_checkout para baixa de estoque
    - Mesma lógica do PDV (complete_sale_transaction)
*/

-- Adicionar campo weight
ALTER TABLE tab_items
ADD COLUMN IF NOT EXISTS weight numeric
CHECK (weight IS NULL OR weight > 0);

-- Adicionar comentário
COMMENT ON COLUMN tab_items.weight IS
'Weight in grams for weight-based products. NULL for unit-based products. Used for stock deduction.';

-- Criar índice para queries de estoque
CREATE INDEX IF NOT EXISTS idx_tab_items_weight ON tab_items(weight) WHERE weight IS NOT NULL;
