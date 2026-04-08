# 🔬 DIAGNÓSTICO TÉCNICO: Conflito de Arquiteturas de Estoque

**Data:** 2026-04-07
**Status:** PROBLEMA IDENTIFICADO - DUAS ARQUITETURAS COEXISTINDO

---

## 🚨 PROBLEMA REPORTADO

### Sintoma Observado

Produtos só baixam estoque quando possuem **receita/ficha técnica configurada**.

Se não tiver receita:
- ❌ Não baixa estoque
- ❌ Não grava movimentação

A arquitetura de **baixa simples** (`stock_deduction_mode`, `stock_item_id`, `stock_deduction_multiplier`) parece não estar governando o fluxo real.

---

## 🔍 AUDITORIA TÉCNICA COMPLETA

### 1. Funções RPC Ativas no Banco

#### `complete_sale_transaction` (Função ATIVA em Produção)

**Versão atual:** `20260407080326_update_complete_sale_transaction_simplified.sql`

**Verificação:**
```sql
SELECT
  CASE
    WHEN pg_get_functiondef(p.oid) ILIKE '%product_recipe_items%' THEN 'USA RECEITA'
    ELSE 'NÃO USA RECEITA'
  END as uses_recipe,
  CASE
    WHEN pg_get_functiondef(p.oid) ILIKE '%stock_deduction_mode%' THEN 'USA BAIXA SIMPLES'
    ELSE 'NÃO USA BAIXA SIMPLES'
  END as uses_simple_stock
FROM pg_proc p
WHERE p.proname = 'complete_sale_transaction';
```

**Resultado:**
```
uses_recipe: NÃO USA RECEITA
uses_simple_stock: USA BAIXA SIMPLES
```

#### `complete_tab_checkout` (Função ATIVA em Produção)

**Verificação análoga:**
```
uses_recipe: NÃO USA RECEITA
uses_simple_stock: USA BAIXA SIMPLES
```

---

### 2. Motor Real Atual (Versão em Produção)

#### 📄 Arquivo: `complete_sale_transaction`
**Migration:** `20260407080326_update_complete_sale_transaction_simplified.sql`

**Lógica de Baixa de Estoque (linhas 139-248):**

```sql
FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(...)
LOOP
  -- Get product details
  SELECT * INTO v_product
  FROM products
  WHERE id = v_item.product_id;

  -- 1. Verifica se produto tem stock_item_id vinculado
  IF v_product.stock_item_id IS NULL THEN
    RAISE NOTICE 'Product has no stock_item_id. Skipping stock deduction.';
    CONTINUE;  -- ⚠️ PULA A BAIXA DE ESTOQUE
  END IF;

  -- 2. Calcula quantidade a deduzir baseado em unit_multiplier
  IF v_product.pricing_type = 'weight' THEN
    v_quantity_to_deduct := v_item.weight;
  ELSIF v_product.pricing_type = 'unit' AND v_product.unit_multiplier IS NOT NULL THEN
    v_quantity_to_deduct := v_item.quantity * v_product.unit_multiplier;
  ELSE
    RAISE NOTICE 'Product has no unit_multiplier. Skipping stock deduction.';
    CONTINUE;  -- ⚠️ PULA A BAIXA DE ESTOQUE
  END IF;

  -- 3. Deduz estoque
  UPDATE stock_items
  SET current_stock = current_stock - v_quantity_to_deduct
  WHERE id = v_product.stock_item_id;

  -- 4. Cria movimentação
  INSERT INTO stock_movements (...) VALUES (...);
END LOOP;
```

**Observação Crítica:**

A função **NÃO USA** `stock_deduction_mode` e `stock_deduction_multiplier`.

Ela usa a **arquitetura antiga**:
- ✅ `stock_item_id`
- ✅ `unit_multiplier` (legado)
- ❌ `stock_deduction_mode` (ignorado)
- ❌ `stock_deduction_multiplier` (ignorado)

---

### 3. Versão Correta Substituída

#### 📄 Arquivo: `20260407093101_add_stock_deduction_architecture.sql`

Esta migration **CRIOU** a versão correta das funções (linhas 135-555) que:

1. ✅ Usa `stock_deduction_mode`
2. ✅ Usa `stock_deduction_multiplier`
3. ✅ Implementa 4 modos: `none`, `by_quantity`, `by_weight`, `by_multiplier`

**Exemplo da lógica correta (linhas 239-266):**

```sql
-- Stock deduction logic based on mode
IF v_stock_deduction_mode = 'none' THEN
  CONTINUE;

ELSIF v_stock_item_id IS NULL THEN
  RAISE NOTICE 'Product has stock_deduction_mode=% but no stock_item_id configured.';
  CONTINUE;

ELSIF v_stock_deduction_mode = 'by_quantity' THEN
  v_deduction_qty := v_quantity;

ELSIF v_stock_deduction_mode = 'by_weight' THEN
  IF v_weight IS NULL OR v_weight <= 0 THEN
    RAISE EXCEPTION 'Weight required for product with stock_deduction_mode = by_weight';
  END IF;
  v_deduction_qty := v_weight;

ELSIF v_stock_deduction_mode = 'by_multiplier' THEN
  IF v_stock_multiplier IS NULL OR v_stock_multiplier <= 0 THEN
    RAISE EXCEPTION 'Invalid stock_deduction_multiplier for product';
  END IF;
  v_deduction_qty := v_quantity * v_stock_multiplier;  -- ✅ USA CAMPO CORRETO

ELSE
  RAISE EXCEPTION 'Invalid stock_deduction_mode';
END IF;
```

---

### 4. Linha do Tempo das Migrations

#### Ordem Cronológica (verificada em produção)

| Data | Migration | Ação |
|------|-----------|------|
| 2026-03-21 | `atomic_sale_transaction.sql` | Cria versão com **product_recipe_items** |
| 2026-04-07 07:52 | `add_unit_multiplier_to_products.sql` | Adiciona campo `unit_multiplier` |
| 2026-04-07 07:56 | `update_complete_sale_transaction_with_unit_multiplier.sql` | Atualiza função (?) |
| 2026-04-07 08:02 | `add_stock_integration_to_products.sql` | Adiciona `stock_item_id` |
| 2026-04-07 08:03 | **`update_complete_sale_transaction_simplified.sql`** | ⚠️ **SUBSTITUI** função com lógica antiga |
| 2026-04-07 08:19 | `add_enforce_stock_control_to_products.sql` | Adiciona campo |
| 2026-04-07 09:31 | **`add_stock_deduction_architecture.sql`** | ✅ **CRIA** versão correta mas... |

**🚨 PROBLEMA IDENTIFICADO:**

A migration `update_complete_sale_transaction_simplified.sql` (08:03) **SUBSTITUIU** a função.

Depois, a migration `add_stock_deduction_architecture.sql` (09:31) **TENTOU SUBSTITUIR** novamente, mas...

**A última migration aplicada não substituiu a função anterior!**

Verificação:
```sql
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p
WHERE p.proname = 'complete_sale_transaction'
```

**Resultado:** Código da versão de 08:03 (simplificada) ainda está ativa.

---

## �� CAUSA RAIZ IDENTIFICADA

### Problema Principal

**A função RPC em produção está usando a ARQUITETURA ANTIGA:**

1. ✅ Verifica `stock_item_id`
2. ✅ Usa `unit_multiplier` (campo legado)
3. ❌ **IGNORA** `stock_deduction_mode`
4. ❌ **IGNORA** `stock_deduction_multiplier`

### Por Que Isso Aconteceu?

**Sequência de eventos:**

1. **2026-04-07 08:03** - Migration `update_complete_sale_transaction_simplified.sql` substitui função com lógica antiga
2. **2026-04-07 09:31** - Migration `add_stock_deduction_architecture.sql` tenta substituir com lógica nova
3. ⚠️ **Algo deu errado** - A versão nova não foi aplicada corretamente

**Hipóteses:**

1. **DROP FUNCTION falhou silenciosamente** (migration linha 137):
   ```sql
   DROP FUNCTION IF EXISTS complete_sale_transaction(UUID, NUMERIC, TEXT, JSONB, UUID);
   ```

2. **Assinatura da função mudou** e o DROP não encontrou a função para dropar

3. **Migration parcialmente aplicada** - campos criados, função não substituída

---

## 📋 VERIFICAÇÃO: Assinatura das Funções

### Versão em Produção (ATIVA)

```sql
complete_sale_transaction(
  p_store_id uuid,
  p_total_amount numeric,
  p_payment_method text,
  p_items jsonb,
  p_cash_session_id uuid
)
```

### Versão Correta (NÃO ATIVA)

```sql
complete_sale_transaction(
  p_store_id UUID,
  p_total_amount NUMERIC,
  p_payment_method TEXT,
  p_items JSONB,
  p_cash_session_id UUID
)
```

**Observação:** Assinaturas são idênticas (case-insensitive).

O problema **NÃO é** assinatura incompatível.

---

## 🔬 DIAGNÓSTICO: Por Que Parece Usar Receita?

### Hipótese do Usuário

"Produto só baixa estoque quando tem receita configurada."

### Análise Técnica

**A função ATUAL não usa `product_recipe_items`.**

**Possível explicação:**

1. Usuário configurou produtos com **receita** (`product_recipe_items`)
2. Ao configurar receita, também configurou `stock_item_id` no produto
3. A função atual **EXIGE** `stock_item_id` para baixar estoque
4. Logo, produtos **SEM receita** = produtos **SEM stock_item_id** = **SEM baixa de estoque**

**Correlação observada:**
- Produtos com receita → têm `stock_item_id` → baixam estoque ✅
- Produtos sem receita → não têm `stock_item_id` → não baixam estoque ❌

**Causa real:**
- Não é a receita que causa a baixa
- É o campo `stock_item_id` que está faltando

---

## 🧪 TESTE DE VALIDAÇÃO

### Para Confirmar o Diagnóstico

Execute este teste:

**1. Criar produto SEM receita mas COM stock_item_id:**

```sql
INSERT INTO products (store_id, name, price, stock_item_id, unit_multiplier)
VALUES (
  'uuid-da-loja',
  'Produto Teste',
  10.00,
  'uuid-de-um-stock-item',  -- ✅ TEM stock_item_id
  500                        -- ✅ TEM unit_multiplier
);
```

**2. Vender este produto**

**3. Verificar stock_movements:**

```sql
SELECT * FROM stock_movements
WHERE reference_type = 'sale'
ORDER BY created_at DESC
LIMIT 1;
```

**Resultado Esperado:**

Se o diagnóstico estiver correto:
- ✅ Estoque será baixado
- ✅ Movimentação será criada
- ✅ Mesmo SEM receita configurada

---

## 📊 TABELAS RELEVANTES

### 1. `products`

**Campos usados pela função atual:**
```sql
- stock_item_id         -- ✅ OBRIGATÓRIO para baixar estoque
- pricing_type          -- ✅ Usado (weight vs unit)
- unit_multiplier       -- ✅ Usado para cálculo
- stock_deduction_mode  -- ❌ IGNORADO (deveria ser usado)
```

### 2. `product_recipe_items`

**Status:** ❌ **NÃO USADO** pela função atual

**Estrutura:**
```sql
- product_id
- stock_item_id
- quantity_used
- unit
```

**Uso esperado:** Sistema de fichas técnicas para produtos compostos.

**Uso real:** Nenhum (função não consulta esta tabela).

### 3. `stock_items`

**Usado para:**
- ✅ Deduzir estoque (`current_stock`)
- ✅ Validar existência do item

### 4. `stock_movements`

**Usado para:**
- ✅ Registrar histórico de movimentações
- ✅ Auditoria (previous_stock, new_stock, reason)

---

## 🎯 PRECEDÊNCIA REAL ATUAL

### Motor de Baixa de Estoque (em produção)

```
┌─────────────────────────────────────────┐
│ Para cada item vendido:                 │
│                                         │
│ 1. ❓ Produto tem stock_item_id?        │
│    └─ NÃO → SKIP (não baixa estoque)   │
│    └─ SIM → continua                   │
│                                         │
│ 2. ❓ pricing_type?                     │
│    └─ weight → baixa sale_item.weight  │
│    └─ unit → vai para (3)              │
│                                         │
│ 3. ❓ Tem unit_multiplier?              │
│    └─ NÃO → SKIP (não baixa estoque)   │
│    └─ SIM → baixa qty × multiplier     │
│                                         │
│ 4. ✅ Deduz estoque em stock_items      │
│                                         │
│ 5. ✅ Cria registro em stock_movements  │
└─────────────────────────────────────────┘
```

### Campos IGNORADOS

```
❌ stock_deduction_mode
❌ stock_deduction_multiplier
❌ enforce_stock_control
❌ product_recipe_items (tabela inteira)
```

### Relação com Receita

```
product_recipe_items → NÃO USADO
(correlação observada é acidental via stock_item_id)
```

---

## 💡 RECOMENDAÇÃO TÉCNICA PARA SAAS MULTI-NEGÓCIO

### Arquitetura Ideal

#### Opção 1: Unificação Completa (RECOMENDADO)

**Usar apenas a arquitetura de baixa simples para todos os casos:**

```typescript
interface Product {
  stock_item_id: string | null;           // FK para stock_items
  stock_deduction_mode: 'none' | 'by_quantity' | 'by_weight' | 'by_multiplier';
  stock_deduction_multiplier: number | null;
  enforce_stock_control: boolean;
}
```

**Casos de uso:**

| Tipo de Produto | Configuração |
|----------------|--------------|
| Produto unitário sem conversão | `mode: 'by_quantity'`, `multiplier: null` |
| Produto unitário com conversão | `mode: 'by_multiplier'`, `multiplier: 500` |
| Produto a peso | `mode: 'by_weight'`, `multiplier: null` |
| Produto sem estoque | `mode: 'none'`, `stock_item_id: null` |

**Vantagens:**
- ✅ Uma única lógica de baixa
- ✅ Simples de entender
- ✅ Fácil de manter
- ✅ Flexível para qualquer tipo de negócio
- ✅ Sem duplicação de código

**Desvantagens:**
- ❌ Não suporta produtos compostos (receitas)

---

#### Opção 2: Dupla Arquitetura com Precedência (COMPLEXO)

**Manter ambas arquiteturas com regra de precedência clara:**

```sql
-- Regra de precedência:
1. Se EXISTS(product_recipe_items WHERE product_id = X)
   → Usar lógica de receita (baixa múltiplos insumos)

2. Senão, se stock_deduction_mode != 'none'
   → Usar lógica de baixa simples

3. Senão
   → Não baixar estoque
```

**Casos de uso:**

| Tipo de Produto | Método |
|----------------|--------|
| Açaí preparado (polpa + xarope + granola) | Receita |
| Açaí 500ml (só polpa) | Baixa simples |
| Produto sem estoque | `mode: 'none'` |

**Vantagens:**
- ✅ Suporta produtos compostos
- ✅ Suporta produtos simples
- ✅ Flexibilidade máxima

**Desvantagens:**
- ❌ Duas lógicas para manter
- ❌ Mais complexo
- ❌ Maior risco de bugs
- ❌ Confusão sobre qual usar

---

#### Opção 3: Só Receita para Tudo (NÃO RECOMENDADO)

**Usar apenas `product_recipe_items` mesmo para produtos simples:**

```sql
-- Produto simples = receita com 1 item
INSERT INTO product_recipe_items (product_id, stock_item_id, quantity_used)
VALUES ('acai-500ml', 'polpa-acai', 500);
```

**Vantagens:**
- ✅ Uma única lógica
- ✅ Suporta tudo

**Desvantagens:**
- ❌ Overkill para produtos simples
- ❌ Mais dados no banco
- ❌ UX ruim (forçar receita para produto simples)

---

### 🏆 RECOMENDAÇÃO FINAL

**Para um SaaS multi-negócio, recomendo OPÇÃO 1: Unificação Completa**

**Motivo:**
- Maioria dos negócios vende produtos simples (unitários ou peso)
- Poucos negócios precisam de fichas técnicas complexas
- Simplicidade > Flexibilidade neste caso
- Facilita onboarding de novos clientes

**Se precisar de receitas no futuro:**
- Implementar como feature separada opcional
- Usar flag `uses_recipe: boolean` no produto
- Ativar lógica de receita apenas quando necessário

---

## 📝 PLANO DE CORREÇÃO RESUMIDO

### Objetivo

Substituir a função em produção pela versão correta que usa `stock_deduction_mode`.

### Etapas

#### 1. Criar Migration de Correção

**Arquivo:** `20260407_fix_stock_deduction_functions.sql`

```sql
-- 1. DROP explícito com assinatura exata
DROP FUNCTION IF EXISTS complete_sale_transaction(uuid, numeric, text, jsonb, uuid);
DROP FUNCTION IF EXISTS complete_tab_checkout(uuid, uuid, text, uuid, numeric, text, uuid);

-- 2. Copiar código das funções corretas de:
--    supabase/migrations/20260407093101_add_stock_deduction_architecture.sql
--    (linhas 142-335 e 340-555)

-- 3. CREATE OR REPLACE FUNCTION complete_sale_transaction...
-- 4. CREATE OR REPLACE FUNCTION complete_tab_checkout...
```

#### 2. Aplicar Migration

```bash
supabase db push
```

#### 3. Validar em Produção

```sql
-- Verificar que funções usam stock_deduction_mode
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p
WHERE p.proname IN ('complete_sale_transaction', 'complete_tab_checkout');
```

#### 4. Migrar Dados Existentes

```sql
-- Copiar unit_multiplier → stock_deduction_multiplier
UPDATE products
SET
  stock_deduction_mode = 'by_multiplier',
  stock_deduction_multiplier = unit_multiplier
WHERE unit_multiplier IS NOT NULL
  AND stock_item_id IS NOT NULL
  AND pricing_type = 'unit';

-- Produtos a peso
UPDATE products
SET stock_deduction_mode = 'by_weight'
WHERE pricing_type = 'weight'
  AND stock_item_id IS NOT NULL;

-- Produtos sem estoque
UPDATE products
SET stock_deduction_mode = 'none'
WHERE stock_item_id IS NULL;
```

#### 5. Testar

1. Vender produto com `mode: 'by_multiplier'`
2. Vender produto com `mode: 'by_weight'`
3. Vender produto com `mode: 'by_quantity'`
4. Vender produto com `mode: 'none'`
5. Verificar `stock_movements` em todos os casos

#### 6. Deprecar Campos Antigos (Opcional)

```sql
-- Depois de validar que tudo funciona:
ALTER TABLE products DROP COLUMN unit_multiplier;
ALTER TABLE products DROP COLUMN stock_quantity;
```

---

## 📚 ARQUIVOS AFETADOS

### Migrations a Revisar

1. `20260321062242_atomic_sale_transaction.sql` - Versão com receita
2. `20260407080326_update_complete_sale_transaction_simplified.sql` - Versão simplificada (PROBLEMA)
3. `20260407093101_add_stock_deduction_architecture.sql` - Versão correta (NÃO ATIVA)

### Funções a Substituir

1. `complete_sale_transaction` - Vendas PDV
2. `complete_tab_checkout` - Fechamento de comandas

### Frontend (SEM ALTERAÇÃO)

O frontend já chama `complete_sale_transaction` corretamente:

```typescript
// src/pages/PDV.tsx:336
const { data: saleResult, error: saleError } = await supabase.rpc(
  'complete_sale_transaction',
  {
    p_store_id: storeId,
    p_total_amount: total,
    p_payment_method: paymentMethod,
    p_items: saleItemsData,
    p_cash_session_id: currentSession.id
  }
);
```

**Nenhuma alteração necessária no frontend.**

---

## ✅ RESUMO EXECUTIVO

### Diagnóstico

A função `complete_sale_transaction` em produção está usando a **arquitetura antiga** (`unit_multiplier`).

A **arquitetura nova** (`stock_deduction_mode`, `stock_deduction_multiplier`) **existe no schema** mas **não está sendo usada pelas funções RPC**.

### Causa Raiz

Migration `update_complete_sale_transaction_simplified.sql` (08:03) substituiu a função.

Migration posterior `add_stock_deduction_architecture.sql` (09:31) **tentou** substituir mas **falhou** em aplicar a versão correta.

### Motor Real

```
✅ Verifica stock_item_id (obrigatório)
✅ Usa unit_multiplier para cálculo
❌ IGNORA stock_deduction_mode
❌ IGNORA stock_deduction_multiplier
❌ NÃO USA product_recipe_items
```

### Regra Recomendada

**Unificação Completa:** Usar apenas arquitetura de baixa simples (`stock_deduction_mode`) para todos os produtos.

### Plano de Correção

1. Criar migration que DROP + CREATE funções corretas
2. Aplicar migration
3. Migrar dados (`unit_multiplier` → `stock_deduction_multiplier`)
4. Validar
5. Deprecar campos antigos

---

**Análise concluída. Aguardando confirmação para aplicar correção.**
