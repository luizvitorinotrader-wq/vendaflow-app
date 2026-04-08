# Lógica de Dedução de Estoque - Documentação Técnica

## Visão Geral

A dedução automática de estoque foi implementada no sistema PDV para atualizar corretamente os insumos (stock_items) após cada venda concluída.

## Fluxo de Execução

### 1. Venda Concluída
Quando uma venda é finalizada no PDV:
- Registro criado na tabela `sales`
- Itens salvos na tabela `sale_items`
- Entrada registrada na tabela `cash_entries`

### 2. Carregamento dos Itens da Venda
```typescript
const { data: savedSaleItems } = await supabase
  .from('sale_items')
  .select(`
    *,
    products (
      id,
      name,
      pricing_type
    )
  `)
  .eq('sale_id', sale.id);
```

### 3. Processamento de Cada Item Vendido

Para cada `sale_item`:

#### 3.1. Buscar Ficha Técnica (Receita)
```typescript
const { data: recipeItems } = await supabase
  .from('product_recipe_items')
  .select('*')
  .eq('product_id', saleItem.product_id)
  .eq('store_id', profile.store_id);
```

#### 3.2. Processar Cada Insumo da Receita
```typescript
for (const recipeItem of recipeItems) {
  // Buscar insumo no estoque usando stock_item_id
  const { data: stockItem } = await supabase
    .from('stock_items')
    .select('id, name, current_stock, unit')
    .eq('id', recipeItem.stock_item_id)
    .eq('store_id', profile.store_id)
    .maybeSingle();
}
```

## Regras de Dedução

### A) Produtos Unitários
**Fórmula:** `quantidade_vendida × quantity_used`

**Exemplos:**
- **Suco do Açaí 500ml** (vendido 2 unidades)
  - Receita: 3 unidades de Polpa de Açaí por unidade de produto
  - Dedução: `2 × 3 = 6 unidades`

- **Suco do Açaí 1000ml** (vendido 1 unidade)
  - Receita: 6 unidades de Polpa de Açaí por unidade de produto
  - Dedução: `1 × 6 = 6 unidades`

- **Batida de Açaí** (vendido 3 unidades)
  - Receita: 3 unidades de Polpa de Açaí por unidade de produto
  - Dedução: `3 × 3 = 9 unidades`

### B) Produtos por Peso
**Fórmula:** `(peso_em_gramas / 1000) × quantity_used`

**Exemplo:**
- **Açaí por Kg** (vendido 250g)
  - Receita: 1 kg de Açaí Batido por kg de produto
  - Cálculo: `(250 / 1000) × 1 = 0.250 kg`
  - Dedução: `0.250 kg` de Açaí Batido

- **Açaí por Kg** (vendido 500g)
  - Receita: 1 kg de Açaí Batido por kg de produto
  - Cálculo: `(500 / 1000) × 1 = 0.500 kg`
  - Dedução: `0.500 kg` de Açaí Batido

## Atualização do Estoque

```typescript
const previousStock = Number(stockItem.current_stock);
const newStock = Math.max(0, previousStock - quantityToDeduct);

await supabase
  .from('stock_items')
  .update({ current_stock: newStock })
  .eq('id', recipeItem.stock_item_id)
  .eq('store_id', profile.store_id);
```

**Importante:**
- ✅ Atualiza APENAS `stock_items.current_stock`
- ❌ NÃO atualiza `products.stock` ou `products.stock_quantity`
- ✅ Usa `stock_item_id` da tabela `product_recipe_items`
- ✅ Sempre filtra por `store_id`
- ✅ Nunca permite estoque negativo (Math.max(0, ...))

## Logs do Console

O sistema gera logs detalhados em português:

```
=== INICIANDO DEDUÇÃO DE ESTOQUE ===
Venda ID: abc123...
📋 3 item(ns) para processar

📦 Produto vendido: Açaí por Kg
   Tipo de precificação: weight
   Quantidade: 1 | Peso: 250g
   🔍 Produto por peso detectado
   ✅ Peso encontrado: 250g
   📏 Quantidade convertida para kg: 0.250 kg
✅ Ficha técnica encontrada: 1 insumo(s)

   🔸 Insumo encontrado: Açaí Batido
   📦 Estoque atual: 10.000 kg
   📊 Cálculo por peso: (250g / 1000) × 1 = 0.250
   📉 Estoque anterior: 10.000 kg
   ➖ Quantidade deduzida: 0.250 kg
   📈 Novo estoque: 9.750 kg
   🔄 Atualizando estoque do insumo "Açaí Batido" (ID: xxx)...
   ✅ Estoque de "Açaí Batido" atualizado com sucesso!
   ✅ Confirmação: 10.000 → 9.750 kg

📦 Produto vendido: Suco do Açaí 500ml
   Tipo de precificação: unit
   Quantidade: 2
✅ Ficha técnica encontrada: 1 insumo(s)

   🔸 Insumo encontrado: Polpa de Açaí
   📦 Estoque atual: 50.000 un
   📊 Cálculo unitário: 2 × 3 = 6.000
   📉 Estoque anterior: 50.000 un
   ➖ Quantidade deduzida: 6.000 un
   📈 Novo estoque: 44.000 un
   🔄 Atualizando estoque do insumo "Polpa de Açaí" (ID: xxx)...
   ✅ Estoque de "Polpa de Açaí" atualizado com sucesso!
   ✅ Confirmação: 50.000 → 44.000 un

=== DEDUÇÃO DE ESTOQUE CONCLUÍDA ===
```

## Mensagens de Erro

### Produto sem Ficha Técnica
```
⚠️  Sem ficha técnica para o produto "Nome do Produto"
```

### Peso Não Encontrado (Produto por Peso)
```
❌ Peso não encontrado no item de venda
⚠️  Produto por peso mas sem peso registrado - pulando dedução
```

### Insumo Não Encontrado
```
❌ Insumo não encontrado no estoque (stock_item_id: xxx)
```

### Erro ao Buscar Receita
```
❌ Erro ao buscar receita: [detalhes do erro]
```

### Erro ao Atualizar Estoque
```
❌ Erro ao atualizar estoque: [detalhes do erro]
❌ Detalhes: stock_item_id=xxx, store_id=xxx
```

## Tratamento de Erros

- A venda é **sempre concluída**, mesmo se houver erro na dedução de estoque
- Erros são logados no console mas não bloqueiam o processo
- Cada insumo é processado independentemente
- Se um insumo falhar, os demais continuam sendo processados

## Estrutura de Dados

### product_recipe_items
```sql
{
  id: uuid,
  store_id: uuid,
  product_id: uuid,
  stock_item_id: uuid,  -- ID do insumo no estoque
  quantity_used: decimal,  -- Quantidade usada por unidade/kg
  unit: text  -- 'kg', 'l', 'un'
}
```

### sale_items
```sql
{
  id: uuid,
  sale_id: uuid,
  product_id: uuid,
  quantity: integer,  -- Quantidade vendida
  weight: decimal,  -- Peso em gramas (para produtos por peso)
  unit_price: decimal,
  total_price: decimal
}
```

### stock_items
```sql
{
  id: uuid,
  store_id: uuid,
  name: text,
  current_stock: decimal,  -- Campo atualizado pela dedução
  unit: text
}
```

## Exemplos Práticos

### Exemplo 1: Venda de Açaí por Peso
**Venda:**
- Produto: Açaí por Kg
- Peso: 250g
- Quantidade: 1

**Receita:**
- Insumo: Açaí Batido
- quantity_used: 1
- unit: kg

**Resultado:**
- Deduzido: 0.250 kg de Açaí Batido

---

### Exemplo 2: Venda de Suco 500ml
**Venda:**
- Produto: Suco do Açaí 500ml
- Quantidade: 2

**Receita:**
- Insumo: Polpa de Açaí
- quantity_used: 3
- unit: un

**Resultado:**
- Deduzido: 6 unidades de Polpa de Açaí

---

### Exemplo 3: Venda Mista
**Venda contém:**
1. Açaí por Kg (500g)
2. Suco 1000ml (1 unidade)
3. Batida de Açaí (2 unidades)

**Deduções:**
1. Açaí Batido: -0.500 kg
2. Polpa de Açaí: -6 un (Suco 1000ml)
3. Polpa de Açaí: -6 un (Batida × 2)

**Total Polpa de Açaí:** -12 unidades
**Total Açaí Batido:** -0.500 kg

## Verificação

Para verificar se a dedução está funcionando:

1. Acesse a página "Estoque" e anote os valores atuais
2. Vá para o PDV e complete uma venda
3. Verifique o console do navegador (F12) para ver os logs
4. Retorne à página "Estoque" e confirme os novos valores
5. Compare com os valores esperados usando as fórmulas acima

## Requisitos Técnicos

✅ Autenticação obrigatória (RLS habilitado)
✅ Filtragem por store_id em todas as queries
✅ Uso de stock_item_id para localizar insumos
✅ Suporte a produtos por peso e unitários
✅ Logs detalhados em português
✅ Tratamento de erros robusto
✅ Não bloqueia a venda em caso de erro
✅ Nunca permite estoque negativo
