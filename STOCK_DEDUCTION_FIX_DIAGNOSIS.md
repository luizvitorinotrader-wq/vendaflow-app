# Diagnóstico e Correção: Controle de Estoque

## ✅ 1. Correções Aplicadas no Frontend

### Arquivo: `src/components/StockDeductionConfig.tsx`

**Problema identificado:**
- Quando o checkbox "Controla estoque?" era marcado, o `stock_deduction_mode` permanecia como `'none'`
- O select mostrava visualmente `'by_quantity'` mas o formData não era atualizado
- Ao salvar, gravava `'none'` no banco, causando inconsistência

**Correções aplicadas:**

#### Mudança 1: Definir modo padrão ao marcar checkbox (linhas 27-37)
```typescript
const handleControlsStockChange = (checked: boolean) => {
  setControlsStock(checked);

  if (!checked) {
    onDeductionModeChange('none');
    onStockItemIdChange(null);
    onDeductionMultiplierChange(null);
  } else if (deductionMode === 'none') {
    // Define modo padrão apenas quando ativa controle pela primeira vez
    onDeductionModeChange('by_quantity');
  }
};
```

#### Mudança 2: Remover ternário do select (linha 92)
```typescript
// ANTES:
value={deductionMode === 'none' ? 'by_quantity' : deductionMode}

// DEPOIS:
value={deductionMode}
```

**Comportamento esperado após correção:**
1. Usuário marca "Controla estoque?" → `stock_deduction_mode` muda automaticamente para `'by_quantity'`
2. Usuário pode trocar livremente entre `by_quantity`, `by_weight`, `by_multiplier`
3. Select sempre reflete o valor real do formData
4. Ao salvar, o modo escolhido é gravado corretamente no banco

---

## 🔍 2. Auditoria: Por que produtos não geram movimentação de estoque?

### Schema da tabela `products` (confirmado no banco de produção)
✅ Todas as colunas necessárias existem:
- `stock_item_id` (uuid, nullable)
- `stock_deduction_mode` (text, default: 'none')
- `stock_deduction_multiplier` (numeric, nullable)
- `unit_multiplier` (numeric, nullable - legado)
- `pricing_type` (text, default: 'unit')
- `enforce_stock_control` (boolean, default: false)

### Lógica de baixa de estoque (função `complete_sale_transaction`)

A migration mais recente (`20260407093101_add_stock_deduction_architecture.sql`) implementa a seguinte lógica:

```sql
-- Linhas 239-266 da função complete_sale_transaction
IF v_stock_deduction_mode = 'none' THEN
  -- CAUSA 1: Modo configurado como "sem baixa"
  CONTINUE;

ELSIF v_stock_item_id IS NULL THEN
  -- CAUSA 2: Produto sem item de estoque vinculado
  RAISE NOTICE 'STOCK WARNING: Product has stock_deduction_mode=% but no stock_item_id';
  CONTINUE;

ELSIF v_stock_deduction_mode = 'by_quantity' THEN
  v_deduction_qty := v_quantity;

ELSIF v_stock_deduction_mode = 'by_weight' THEN
  IF v_weight IS NULL OR v_weight <= 0 THEN
    -- CAUSA 3: Modo "by_weight" mas sem peso informado
    RAISE EXCEPTION 'Weight required';
  END IF;
  v_deduction_qty := v_weight;

ELSIF v_stock_deduction_mode = 'by_multiplier' THEN
  IF v_stock_multiplier IS NULL OR v_stock_multiplier <= 0 THEN
    -- CAUSA 4: Modo "by_multiplier" mas sem multiplicador válido
    RAISE EXCEPTION 'Invalid stock_deduction_multiplier';
  END IF;
  v_deduction_qty := v_quantity * v_stock_multiplier;
```

### 🚨 Causas de produtos sem movimentação de estoque

| # | Causa | Descrição | Como Identificar |
|---|-------|-----------|------------------|
| 1 | **`stock_deduction_mode = 'none'`** | Produto configurado para não baixar estoque | Verificar coluna `stock_deduction_mode` |
| 2 | **`stock_item_id IS NULL`** | Produto sem item de estoque vinculado | Verificar coluna `stock_item_id` |
| 3 | **Modo `by_weight` sem peso** | Produto vendido por peso mas sem informar gramas no PDV | Verificar se `weight` foi informado na venda |
| 4 | **Modo `by_multiplier` sem multiplicador** | Produto com modo "by_multiplier" mas `stock_deduction_multiplier IS NULL` | Verificar coluna `stock_deduction_multiplier` |

### ⚠️ **PROBLEMA CRÍTICO IDENTIFICADO**

A migration mais recente usa campos **DIFERENTES** dos que existem na tabela `stock_movements`:

**Migration usa:**
- `movement_type` (linha 286, 296)

**Tabela real tem:**
- `type`

**Isso causa ERRO na execução da função!**

A função vai **FALHAR** ao tentar inserir em `stock_movements` porque o campo `movement_type` não existe.

---

## 🛠️ 3. Plano de Correção Completo

### ✅ Etapa 1: Frontend (CONCLUÍDO)
- [x] Corrigir `StockDeductionConfig.tsx` para definir modo padrão
- [x] Remover ternário do select
- [x] Build validado com sucesso

### 🔧 Etapa 2: Backend (NECESSÁRIO)

**Migration corretiva:** Atualizar a função `complete_sale_transaction` e `complete_tab_checkout` para usar o campo correto `type` ao invés de `movement_type`.

**Campos afetados na INSERT de stock_movements:**
- `movement_type` → deve ser `type`

**Ação necessária:**
Criar migration que:
1. Dropa as funções atuais
2. Recria com o nome de campo correto (`type` ao invés de `movement_type`)

---

## 📋 4. Instruções de Teste

### Teste 1: Verificar correção do select travado
1. Acessar `/app/products`
2. Criar novo produto ou editar existente
3. Marcar checkbox "Controla estoque?"
4. Verificar que o select de modo de baixa mostra "Pela quantidade vendida"
5. Trocar para "Pelo peso (em gramas)" ou "Por multiplicador"
6. Salvar e reabrir → deve manter a escolha feita

### Teste 2: Verificar baixa de estoque após correção do backend
1. Criar item de estoque (ex: "Polpa de Açaí")
2. Criar produto vinculado ao item de estoque
3. Configurar modo de baixa correto
4. Realizar venda do produto
5. Verificar em `/app/movements` se a movimentação foi registrada

---

## 🚀 5. Deploy Necessário

### Apenas Frontend (implementado)
- ✅ Deploy Vercel necessário
- ✅ Arquivos alterados: `src/components/StockDeductionConfig.tsx`
- ✅ Build validado com sucesso

### Backend (pendente correção)
- ⚠️ Migration SQL necessária para corrigir nome do campo
- ⚠️ Deploy Supabase necessário após criar migration
- ⚠️ CRÍTICO: Aplicar antes de testar baixa de estoque em produção

---

## 📊 6. Resumo Executivo

| Item | Status | Ação |
|------|--------|------|
| Schema `products` | ✅ OK | Todas as colunas existem corretamente |
| Frontend: Select travado | ✅ CORRIGIDO | Deploy Vercel necessário |
| Backend: Nome do campo | ❌ ERRO | Migration corretiva necessária |
| Teste de baixa de estoque | ⏸️ BLOQUEADO | Aguarda correção do backend |

**Próximos passos:**
1. ✅ Deploy do frontend no Vercel
2. ⚠️ Criar e aplicar migration SQL corretiva
3. ✅ Testar fluxo completo de baixa de estoque
