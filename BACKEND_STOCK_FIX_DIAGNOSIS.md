# 🔍 Diagnóstico Completo: Schema stock_movements vs Funções RPC

## 📊 Schema Real da Tabela `stock_movements`

**Confirmado no banco de produção via information_schema:**

| Campo | Tipo | Nullable | Default | Notas |
|-------|------|----------|---------|-------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `store_id` | uuid | NO | null | FK → stores(id) |
| `stock_item_id` | uuid | NO | null | FK → stock_items(id) |
| **`type`** | text | NO | null | ✅ **ESTE É O CAMPO CORRETO** |
| `quantity` | numeric | NO | null | ✅ |
| `previous_stock` | numeric | NO | 0 | ✅ |
| `new_stock` | numeric | NO | 0 | ✅ |
| `reason` | text | NO | null | ✅ |
| `reference_id` | uuid | YES | null | ✅ |
| `created_at` | timestamptz | NO | now() | ✅ |
| `reference_type` | text | YES | null | ✅ |
| `created_by` | uuid | YES | null | ✅ |

**IMPORTANTE:**
- ❌ Campo `movement_type` **NÃO EXISTE**
- ✅ Campo correto é `type`

---

## 🚨 Funções RPC Quebradas (Confirmado no Banco)

### Função: `complete_sale_transaction`

**Status:** ❌ **QUEBRADA**

**Problema:** Linha do INSERT em stock_movements usa:
```sql
INSERT INTO stock_movements (
  store_id,
  stock_item_id,
  movement_type,  -- ❌ CAMPO NÃO EXISTE
  quantity,
  reference_type,
  reference_id,
  previous_stock,
  new_stock,
  created_by
) VALUES (
  p_store_id,
  v_stock_item_id,
  'out',          -- Tentando inserir em campo inexistente
  ...
```

**Erro esperado ao vender produto:**
```
ERROR: column "movement_type" of relation "stock_movements" does not exist
```

---

### Função: `complete_tab_checkout`

**Status:** ❌ **QUEBRADA**

**Problema:** Exatamente o mesmo erro:
```sql
INSERT INTO stock_movements (
  store_id,
  stock_item_id,
  movement_type,  -- ❌ CAMPO NÃO EXISTE
  quantity,
  reference_type,
  reference_id,
  previous_stock,
  new_stock,
  created_by
) VALUES (
  p_store_id,
  v_stock_item_id,
  'out',          -- Tentando inserir em campo inexistente
  ...
```

---

### Função: `deduct_stock_atomic`

**Status:** ❌ **QUEBRADA** (mas não está em uso atualmente)

**Problema:** Também usa `movement_type`:
```sql
INSERT INTO stock_movements (
  store_id,
  stock_item_id,
  movement_type,  -- ❌ CAMPO NÃO EXISTE
  quantity,
  reference_id,
  reference_type,
  created_at
) VALUES (...)
```

---

## 📁 Migrations Afetadas

### Migration Principal (Mais Recente):
**Arquivo:** `20260407093101_add_stock_deduction_architecture.sql`

**Problemas encontrados:**

#### Linha 283-303 (função `complete_sale_transaction`)
```sql
INSERT INTO stock_movements (
  store_id,
  stock_item_id,
  movement_type,    -- ❌ ERRO: deve ser "type"
  quantity,
  reference_type,
  reference_id,
  previous_stock,
  new_stock,
  created_by
) VALUES (
  p_store_id,
  v_stock_item_id,
  'out',            -- ❌ Valor correto, mas campo errado
  v_deduction_qty,
  'sale',
  v_sale_id,
  v_previous_stock,
  v_new_stock,
  v_user_id
);
```

#### Linha 486-507 (função `complete_tab_checkout`)
```sql
INSERT INTO stock_movements (
  store_id,
  stock_item_id,
  movement_type,    -- ❌ ERRO: deve ser "type"
  quantity,
  reference_type,
  reference_id,
  previous_stock,
  new_stock,
  created_by
) VALUES (
  p_store_id,
  v_stock_item_id,
  'out',            -- ❌ Valor correto, mas campo errado
  v_deduction_qty,
  'tab_checkout',
  v_sale_id,
  v_previous_stock,
  v_new_stock,
  v_user_id
);
```

---

### Migrations Antigas (Já Substituídas, mas com mesmo erro):
- `20260320195402_20260320000002_atomic_stock_deduction.sql`
- `20260321062242_atomic_sale_transaction.sql`
- `20260325235247_fix_complete_sale_transaction_cash_entries.sql`
- `20260325235345_fix_complete_sale_remove_updated_at.sql`
- `20260325235429_fix_complete_sale_stock_movements_schema.sql`

**Nota:** Essas migrations antigas foram sobrescritas pela mais recente, mas documentam o histórico do problema.

---

## 🔧 Mapeamento Correto de Campos

### ✅ Schema Correto vs ❌ Uso Incorreto Atual

| Função Atual Usa | Schema Real Tem | Correção Necessária |
|------------------|-----------------|---------------------|
| `movement_type` | `type` | Substituir `movement_type` → `type` |
| `quantity` | `quantity` | ✅ OK |
| `previous_stock` | `previous_stock` | ✅ OK |
| `new_stock` | `new_stock` | ✅ OK |
| `reference_type` | `reference_type` | ✅ OK |
| `reference_id` | `reference_id` | ✅ OK |
| `created_by` | `created_by` | ✅ OK |
| `store_id` | `store_id` | ✅ OK |
| `stock_item_id` | `stock_item_id` | ✅ OK |

**NOTA IMPORTANTE:** O campo `reason` existe na tabela mas **NÃO está sendo preenchido** pelas funções atuais!

---

## 📋 Plano de Correção

### Etapa 1: Criar Migration Corretiva
**Arquivo:** `20260407_fix_stock_movements_field_name.sql`

**Ações:**
1. Dropar funções atuais quebradas:
   - `complete_sale_transaction`
   - `complete_tab_checkout`
   - `deduct_stock_atomic` (opcional, pois não está em uso)

2. Recriar funções com correções:
   - Substituir `movement_type` por `type`
   - Adicionar campo `reason` nos INSERTs

### Etapa 2: Validar Schema Final
- Confirmar todos os campos estão corretos
- Validar constraints e foreign keys

### Etapa 3: Testar em Produção
- Realizar venda no PDV
- Realizar checkout de comanda
- Verificar movimentações em `/app/movements`

---

## ✅ Lista de Verificação de Correção

### Campos que serão corrigidos:
- [x] `movement_type` → `type` (3 funções)
- [x] Adicionar campo `reason` nos INSERTs

### Funções que serão corrigidas:
- [ ] `complete_sale_transaction`
- [ ] `complete_tab_checkout`
- [ ] `deduct_stock_atomic` (opcional)

### Testes pós-correção:
- [ ] Venda no PDV gera movimentação
- [ ] Checkout de comanda gera movimentação
- [ ] Campo `type` gravado corretamente ('sale', 'tab_checkout')
- [ ] Campo `reason` preenchido com descrição legível

---

## 🎯 Resumo Executivo

**Problema:** Funções RPC usam campo `movement_type` que não existe na tabela `stock_movements`.

**Impacto:** 100% das vendas com produtos configurados para baixar estoque FALHAM ao tentar gravar movimentação.

**Causa Raiz:** Migration `20260407093101` criou funções com nome de campo incorreto.

**Solução:** Migration corretiva substituindo `movement_type` → `type` em 3 funções.

**Complexidade:** Baixa (apenas renomear campo + adicionar `reason`)

**Risco:** Baixíssimo (correção pontual, sem mudança de lógica)

**Deploy necessário:** Supabase (aplicar migration)

---

## ⏭️ Próximo Passo

**AGUARDANDO CONFIRMAÇÃO DO USUÁRIO** para:
1. Criar migration corretiva
2. Aplicar no banco de dados
3. Validar correção
