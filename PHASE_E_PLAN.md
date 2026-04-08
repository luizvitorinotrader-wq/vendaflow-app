# VendaFlow - Plano Fase E: Renomeação do Campo Legacy para category_legacy

**Status**: Não iniciado (aguardando conclusão da Fase D2)
**Objetivo**: Renomear `products.category` para `products.category_legacy` sem remoção
**Pré-requisito**: Fase D2 concluída e deployada em produção com sucesso

---

## Contexto

Após a Fase D2, o sistema:
- ✅ Não lê `products.category` no frontend
- ✅ Não escreve `products.category` no frontend
- ✅ Usa apenas `category_id` com join em `product_categories`
- ✅ Tipagem TypeScript marca `category` como `@deprecated`
- ⚠️ A coluna `category` ainda existe no banco (não removida)

A Fase E é uma alternativa **mais segura** à remoção completa da coluna proposta na Fase D2 do plano anterior.

**Por que renomear ao invés de remover?**

1. **Preservação de dados históricos**: Mantém dados para análise futura ou auditoria
2. **Rollback mais seguro**: Caso algo dê errado, basta renomear de volta
3. **Menor risco**: Operação reversível vs. perda permanente de dados
4. **Compatibilidade temporária**: Permite período de observação antes de remoção final

---

## Estratégia: Rename vs. Drop

### Opção A: Renomear (RECOMENDADO)

**Vantagens:**
- ✅ Dados preservados
- ✅ Rollback trivial (rename de volta)
- ✅ Zero risco de perda de dados
- ✅ Permite análise futura
- ✅ Operação rápida

**Desvantagens:**
- ⚠️ Coluna continua ocupando espaço no banco
- ⚠️ Ainda aparece em schema exports
- ⚠️ Precisará ser removida eventualmente (Fase F)

### Opção B: Remover (ARRISCADO)

**Vantagens:**
- ✅ Schema mais limpo
- ✅ Menos espaço em disco
- ✅ "Finaliza" a migração completamente

**Desvantagens:**
- ❌ Dados perdidos permanentemente (sem backup)
- ❌ Rollback complexo (restore de backup)
- ❌ Risco alto se houver código não auditado
- ❌ Irreversível

### Decisão: RENOMEAR (Fase E) → REMOVER (Fase F - futuro distante)

A Fase E implementa **renomeação segura**. A Fase F (futura, 3-6 meses depois) pode implementar remoção definitiva se necessário.

---

## Pré-Condições Obrigatórias

### 1. Validação em Produção (Mínimo 14 dias)
- [ ] Fase D2 rodando em produção sem erros
- [ ] Zero referências a `products.category` em logs
- [ ] Vendas funcionando normalmente
- [ ] PDV funcionando normalmente
- [ ] Relatórios funcionando normalmente
- [ ] 100% produtos têm `category_id` preenchido

### 2. Auditoria Final Completa
- [ ] Frontend: Zero referências a `.category` (exceto tipos deprecados)
- [ ] Backend: Zero referências a `products.category`
- [ ] Edge Functions: Zero referências
- [ ] RPCs: Zero referências
- [ ] Triggers: Zero referências
- [ ] Views: Zero referências
- [ ] Policies RLS: Zero referências

### 3. Backup Completo
- [ ] Backup completo do banco de dados
- [ ] Backup específico da tabela `products`
- [ ] Teste de restore do backup
- [ ] Documentar procedimento de rollback

---

## Fase E.1: Auditoria Final Pré-Rename

### Verificação de Código Frontend

```bash
# Buscar qualquer uso de .category (exceto @deprecated em types)
grep -r "\.category[^_]" src/ --include="*.tsx" --include="*.ts" | grep -v "@deprecated" | grep -v "database.types.ts"

# Resultado esperado: ZERO ocorrências
```

### Verificação de Edge Functions

```bash
# Buscar em todas edge functions
grep -r "category" supabase/functions/ --include="*.ts"

# Verificar se algum resultado referencia products.category
```

### Verificação de RPCs

```sql
-- Buscar RPCs que referenciam products.category
SELECT
  n.nspname as schema,
  p.proname as function_name,
  pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE pg_get_functiondef(p.oid) ILIKE '%products.category%'
  AND n.nspname = 'public';

-- Resultado esperado: ZERO linhas
```

**RPCs críticos a verificar:**
- ✅ `complete_sale_transaction` - não usa category
- ✅ `complete_tab_checkout` - não usa category

### Verificação de Triggers

```sql
-- Verificar triggers que referenciam category
SELECT
  trigger_name,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE action_statement ILIKE '%category%'
  AND event_object_table = 'products';

-- Resultado esperado: ZERO linhas
```

### Verificação de Views

```sql
-- Verificar views que referenciam products.category
SELECT
  table_name,
  view_definition
FROM information_schema.views
WHERE view_definition ILIKE '%products.category%'
  AND table_schema = 'public';

-- Resultado esperado: ZERO linhas
```

### Verificação de Policies RLS

```sql
-- Verificar policies que referenciam category
SELECT
  schemaname,
  tablename,
  policyname,
  pg_get_expr(qual, (schemaname||'.'||tablename)::regclass) as using_expression,
  pg_get_expr(with_check, (schemaname||'.'||tablename)::regclass) as with_check_expression
FROM pg_policies
WHERE tablename = 'products'
  AND (
    pg_get_expr(qual, (schemaname||'.'||tablename)::regclass) ILIKE '%category%'
    OR pg_get_expr(with_check, (schemaname||'.'||tablename)::regclass) ILIKE '%category%'
  );

-- Resultado esperado: ZERO linhas
```

### Verificação de Dados

```sql
-- Verificar distribuição de category_id
SELECT
  COUNT(*) as total_products,
  COUNT(category_id) as products_with_category_id,
  COUNT(*) - COUNT(category_id) as products_missing_category_id,
  ROUND(COUNT(category_id)::numeric / COUNT(*)::numeric * 100, 2) as percentage_with_id
FROM products;

-- Expectativa: 100% ou muito próximo
```

---

## Fase E.2: Migration de Renomeação

### Migration File: `rename_products_category_to_legacy.sql`

```sql
/*
  # Rename products.category to products.category_legacy

  1. Purpose
    - Mark the legacy text category field as deprecated via naming
    - Preserve historical data for future analysis
    - Make it explicit that this field should NOT be used
    - Prepare for eventual removal in Phase F (6+ months)

  2. Changes
    - RENAME COLUMN products.category → products.category_legacy

  3. Data Preservation
    - All existing data is preserved
    - No data loss
    - Column type unchanged (text)
    - Nullability unchanged

  4. Validation
    - All products must have category_id populated
    - System running on category_id for minimum 14 days
    - Zero backend references to products.category

  5. Rollback
    - Simple: RENAME COLUMN products.category_legacy → products.category
    - No data loss in rollback scenario
    - Can be executed immediately if issues detected

  6. Notes
    - This is a NON-DESTRUCTIVE operation
    - Data is fully preserved
    - Schema change only
    - Column still occupies disk space
*/

-- ================================================
-- SAFETY CHECKS
-- ================================================

-- 1. Ensure all products have category_id
DO $$
DECLARE
  products_without_category_id INTEGER;
  total_products INTEGER;
  percentage_with_id NUMERIC;
BEGIN
  SELECT
    COUNT(*),
    COUNT(category_id),
    ROUND(COUNT(category_id)::numeric / COUNT(*)::numeric * 100, 2)
  INTO
    total_products,
    products_without_category_id,
    percentage_with_id
  FROM products;

  products_without_category_id := total_products - products_without_category_id;

  IF products_without_category_id > 0 THEN
    RAISE WARNING 'Found % products without category_id (%.2f%% coverage)',
      products_without_category_id,
      percentage_with_id;

    -- Allow if coverage is above 95%
    IF percentage_with_id < 95.0 THEN
      RAISE EXCEPTION 'MIGRATION ABORTED: Only %.2f%% products have category_id. Minimum 95%% required.',
        percentage_with_id;
    END IF;
  END IF;

  RAISE NOTICE 'Safety check passed: %.2f%% products have category_id', percentage_with_id;
END $$;

-- 2. Verify column exists before rename
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'products'
    AND column_name = 'category'
  ) THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: Column products.category does not exist';
  END IF;

  RAISE NOTICE 'Column products.category exists';
END $$;

-- 3. Verify target column name is free
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'products'
    AND column_name = 'category_legacy'
  ) THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: Column products.category_legacy already exists';
  END IF;

  RAISE NOTICE 'Target column name is available';
END $$;

-- ================================================
-- RENAME OPERATION
-- ================================================

-- Rename the column
ALTER TABLE products
RENAME COLUMN category TO category_legacy;

-- Add comment to make it explicit
COMMENT ON COLUMN products.category_legacy IS
  'LEGACY FIELD - DO NOT USE. Deprecated field kept for historical data. Use category_id instead. Scheduled for removal in Phase F.';

-- ================================================
-- POST-RENAME VALIDATION
-- ================================================

-- Verify rename was successful
DO $$
BEGIN
  -- Old column should NOT exist
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'products'
    AND column_name = 'category'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: Column products.category still exists';
  END IF;

  -- New column SHOULD exist
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'products'
    AND column_name = 'category_legacy'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: Column products.category_legacy does not exist';
  END IF;

  RAISE NOTICE 'Migration successful: products.category renamed to products.category_legacy';
END $$;

-- Verify data integrity (sample check)
DO $$
DECLARE
  legacy_count INTEGER;
  total_count INTEGER;
BEGIN
  SELECT
    COUNT(*),
    COUNT(category_legacy)
  INTO
    total_count,
    legacy_count
  FROM products;

  RAISE NOTICE 'Data verification: % total products, % have legacy category data',
    total_count,
    legacy_count;
END $$;
```

---

## Fase E.3: Atualização de Types TypeScript

Após a migration, atualizar `database.types.ts`:

```typescript
products: {
  Row: {
    id: string
    store_id: string
    name: string
    /**
     * @deprecated LEGACY FIELD - RENAMED TO category_legacy
     * This field has been renamed and will be removed in Phase F.
     * DO NOT USE. Use category_id + join with product_categories instead.
     * @see product_categories table
     */
    category_legacy: string | null
    category_id: string | null
    price: number
    cost: number
    stock_quantity: number
    min_stock: number
    active: boolean
    pricing_type: 'unit' | 'weight'
    price_per_kg: number | null
    created_at: string
  }
  Insert: {
    id?: string
    store_id: string
    name: string
    /**
     * @deprecated LEGACY FIELD - DO NOT USE
     * Use category_id instead.
     */
    category_legacy?: string | null
    category_id?: string | null
    price?: number
    cost?: number
    stock_quantity?: number
    min_stock?: number
    active?: boolean
    pricing_type?: 'unit' | 'weight'
    price_per_kg?: number | null
    created_at?: string
  }
  Update: {
    id?: string
    store_id?: string
    name?: string
    /**
     * @deprecated LEGACY FIELD - DO NOT USE
     * Use category_id instead.
     */
    category_legacy?: string | null
    category_id?: string | null
    price?: number
    cost?: number
    stock_quantity?: number
    min_stock?: number
    active?: boolean
    pricing_type?: 'unit' | 'weight'
    price_per_kg?: number | null
    created_at?: string
  }
}
```

---

## Fase E.4: Plano de Rollback

### Cenário 1: Descoberto código que usa `category` APÓS rename

**Probabilidade:** Muito Baixa (auditoria completa executada)

**Solução:**

1. Executar rollback imediato:
   ```sql
   ALTER TABLE products
   RENAME COLUMN category_legacy TO category;
   ```

2. Localizar e corrigir código que usa `category`

3. Re-auditar completamente (Fase E.1)

4. Aguardar mais 14 dias de validação

5. Tentar Fase E novamente

### Cenário 2: Migration falha parcialmente

**Probabilidade:** Muito Baixa (operação atômica)

**Solução:**

1. Verificar estado da tabela:
   ```sql
   SELECT column_name
   FROM information_schema.columns
   WHERE table_name = 'products'
   AND column_name IN ('category', 'category_legacy');
   ```

2. Se ambas existirem: Erro de constraint, remover a duplicada

3. Se nenhuma existir: Restore de backup

4. Se só `category` existir: Migration não executou, pode re-executar

5. Se só `category_legacy` existir: Migration sucesso, não há problema

### Cenário 3: TypeScript quebra após update de types

**Probabilidade:** Baixa

**Solução:**

1. Se erro de compilação: Localizar código que usa `.category`

2. Substituir por `.category_id` + join

3. Não fazer rollback de migration, apenas corrigir código

4. Build deve passar após correções

---

## Fase E.5: Validação Pós-Migration

### Testes Obrigatórios

1. **Schema**
   ```sql
   -- Verificar que category_legacy existe
   SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_name = 'products'
   AND column_name = 'category_legacy';

   -- Verificar que category NÃO existe
   SELECT COUNT(*)
   FROM information_schema.columns
   WHERE table_name = 'products'
   AND column_name = 'category';
   -- Deve retornar 0
   ```

2. **Dados**
   ```sql
   -- Verificar integridade dos dados
   SELECT
     COUNT(*) as total,
     COUNT(category_legacy) as with_legacy_data,
     COUNT(category_id) as with_category_id
   FROM products
   LIMIT 10;
   ```

3. **Frontend**
   - [ ] Build do TypeScript passa sem erros
   - [ ] Produtos listam corretamente
   - [ ] PDV funciona normalmente
   - [ ] Vendas funcionam
   - [ ] Nenhum erro de "category is not defined"

4. **Backend**
   - [ ] RPCs funcionam normalmente
   - [ ] Edge Functions funcionam
   - [ ] Vendas registram corretamente

---

## Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Código não auditado usa `category` | Muito Baixa | Médio | Auditoria E.1 completa + 14 dias validação |
| TypeScript quebra | Baixa | Baixo | Update types + compilação |
| Migration falha | Muito Baixa | Baixo | Operação atômica + rollback trivial |
| Dados perdidos | Zero | - | Rename não perde dados |
| Performance degradada | Zero | - | Rename é operação de metadata |

---

## Timeline Recomendado

```
Fase D2 Deploy
    ↓
    14+ dias em produção (validação estendida)
    ↓
E.1: Auditoria Final (2 dias)
    ↓
E.2: Preparação Migration (1 dia)
    ↓
E.2: Backup + Validação (1 dia)
    ↓
E.2: Deploy Staging (1 dia)
    ↓
    48h monitoramento staging
    ↓
E.2: Deploy Produção (1 dia)
    ↓
E.3: Update Types Frontend (1 dia)
    ↓
E.5: Validação Pós-Deploy (1 dia)
    ↓
    30 dias monitoramento
    ↓
FASE E COMPLETA
```

**Total estimado: ~6 semanas após D2**

---

## Fase F (Futura): Remoção Definitiva

**Quando considerar Fase F:**
- Mínimo 6 meses após Fase E
- Zero acessos a `category_legacy` em logs
- Análise de dados históricos concluída (se necessário)
- Espaço em disco se tornar problema crítico

**Fase F:**
```sql
-- Migration futura (6+ meses)
ALTER TABLE products DROP COLUMN category_legacy;
```

**Por que esperar 6 meses?**
1. Permite análise de dados históricos se necessário
2. Margem de segurança para descobrir código legado
3. Período de auditoria e compliance
4. Baixo custo de manter coluna vazia

---

## Checklist Final Fase E

### Antes de Iniciar
- [ ] Fase D2 em produção por mínimo 14 dias
- [ ] Zero referências a `products.category` no código
- [ ] Auditoria E.1 completa
- [ ] Backup completo verificado
- [ ] 95%+ produtos têm category_id
- [ ] Procedimento de rollback documentado

### Durante Execução
- [ ] Migration executada em staging primeiro
- [ ] Testes completos em staging (48h mínimo)
- [ ] Aprovação para produção
- [ ] Migration executada em produção
- [ ] Types TypeScript atualizados
- [ ] Build frontend passa

### Após Execução
- [ ] Schema validado (E.5)
- [ ] Dados íntegros (E.5)
- [ ] Frontend funciona (E.5)
- [ ] Backend funciona (E.5)
- [ ] Vendas funcionam (E.5)
- [ ] Performance normal
- [ ] Logs sem erros
- [ ] Documentação atualizada

---

## Comparação: Fase E (Rename) vs. Fase D2 Original (Drop)

| Aspecto | Fase E (Rename) | Fase D2 Original (Drop) |
|---------|-----------------|-------------------------|
| **Risco de perda de dados** | Zero | Alto |
| **Reversibilidade** | Trivial (1 comando) | Complexa (restore backup) |
| **Tempo de rollback** | Segundos | Minutos/Horas |
| **Preservação histórica** | Sim | Não |
| **Schema final** | Coluna _legacy | Sem coluna |
| **Espaço em disco** | Mantém | Libera |
| **Complexidade** | Baixa | Alta |
| **Recomendado para** | Primeira remoção | Limpeza final (6+ meses) |

**Recomendação:** Executar Fase E primeiro. Considerar Fase F (drop) apenas após 6+ meses.

---

## Responsáveis

- **Execução**: Dev Team
- **Aprovação Migration**: Tech Lead
- **Backup**: DevOps/DBA
- **Validação**: QA + Product
- **Rollback**: Dev Team + DevOps

---

## Notas Importantes

✅ **SEGURO**: Esta é uma operação REVERSÍVEL e NÃO-DESTRUTIVA

✅ **IMPORTANTE**: Rename é operação de metadata, muito rápida

✅ **OBRIGATÓRIO**: Backup completo antes de qualquer operação

✅ **BOM SABER**: Rename não afeta índices ou constraints

✅ **BOM SABER**: Não há impacto em vendas já realizadas

⚠️ **ATENÇÃO**: TypeScript types devem ser atualizados após migration

---

**Última atualização**: 2026-03-26
**Versão**: 1.0
**Status**: Rascunho (aguardando D2)
