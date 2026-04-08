# VendaFlow - Plano Fase D2: Remoção Definitiva do Campo Legacy

**Status**: Não iniciado (aguardando conclusão da Fase D1)
**Objetivo**: Remover completamente a coluna `products.category` do banco de dados
**Pré-requisito**: Fase D1 concluída e deployada em produção com sucesso

---

## Contexto

Após a Fase D1, o sistema:
- ✅ Não lê mais `products.category` no frontend
- ✅ Não escreve mais `products.category` no frontend
- ✅ Usa apenas `category_id` com join em `product_categories`
- ⚠️ A coluna `category` ainda existe no banco como legacy

A Fase D2 remove permanentemente a coluna `category` da tabela `products`.

---

## Pré-Condições Obrigatórias

### 1. Validação em Produção (Mínimo 7 dias)
- [ ] Fase D1 rodando em produção sem erros
- [ ] Todos os produtos têm `category_id` preenchido
- [ ] Nenhum erro de join com `product_categories`
- [ ] Vendas funcionando normalmente
- [ ] PDV funcionando normalmente
- [ ] Relatórios funcionando normalmente

### 2. Auditoria Final do Backend
- [ ] Verificar se alguma Edge Function usa `products.category`
- [ ] Verificar se algum RPC usa `products.category`
- [ ] Verificar se alguma trigger usa `products.category`
- [ ] Verificar se alguma view usa `products.category`

### 3. Backup Completo
- [ ] Backup completo do banco de dados
- [ ] Backup específico da tabela `products` com coluna `category`
- [ ] Teste de restore do backup
- [ ] Documentar procedimento de rollback

---

## Fase D2.1: Auditoria Backend

### Edge Functions
```bash
# Buscar uso de .category em edge functions
grep -r "\.category" supabase/functions/
grep -r "category:" supabase/functions/
```

**Arquivos a verificar:**
- `supabase/functions/create-checkout-session-v2/index.ts`
- `supabase/functions/stripe-webhook/index.ts`
- Outros edge functions relacionados a produtos

### RPCs (Remote Procedure Calls)
```sql
-- Listar todas as functions que referenciam products.category
SELECT
  n.nspname as schema,
  p.proname as function_name,
  pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE pg_get_functiondef(p.oid) ILIKE '%products.category%'
  AND n.nspname = 'public';
```

**RPCs conhecidos a verificar:**
- `complete_sale_transaction` ✅ (não usa category)
- `complete_tab_checkout` ✅ (não usa category)
- Outros RPCs customizados

### Triggers e Views
```sql
-- Verificar triggers
SELECT
  trigger_name,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE action_statement ILIKE '%category%'
  AND event_object_table = 'products';

-- Verificar views
SELECT
  table_name,
  view_definition
FROM information_schema.views
WHERE view_definition ILIKE '%products.category%'
  AND table_schema = 'public';
```

### Policies RLS
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
```

---

## Fase D2.2: Migration de Remoção

### Migration File: `remove_products_category_column.sql`

```sql
/*
  # Remove legacy products.category column

  1. Changes
    - DROP COLUMN products.category (text field - no longer used)

  2. Validation
    - All products must have category_id populated
    - System has been running on category_id for minimum 7 days
    - No backend code references products.category

  3. Rollback
    - Restore from backup if needed
    - Re-add column: ALTER TABLE products ADD COLUMN category text;

  4. Notes
    - This is a DESTRUCTIVE operation
    - Data in category column will be PERMANENTLY LOST
    - Only proceed after thorough validation
*/

-- SAFETY CHECK: Ensure all products have category_id
DO $$
DECLARE
  products_without_category_id INTEGER;
BEGIN
  SELECT COUNT(*) INTO products_without_category_id
  FROM products
  WHERE category_id IS NULL;

  IF products_without_category_id > 0 THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: % products without category_id. Fix data before proceeding.', products_without_category_id;
  END IF;

  RAISE NOTICE 'Safety check passed: All products have category_id';
END $$;

-- DROP the legacy category column
ALTER TABLE products DROP COLUMN IF EXISTS category;

-- Verify column was removed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'products'
    AND column_name = 'category'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: Column products.category still exists';
  END IF;

  RAISE NOTICE 'Migration successful: products.category column removed';
END $$;
```

### Validações Pré-Migration

**Checklist obrigatório antes de executar migration:**

1. **Dados**
   ```sql
   -- Verificar que 100% dos produtos têm category_id
   SELECT
     COUNT(*) as total_products,
     COUNT(category_id) as products_with_category_id,
     COUNT(*) - COUNT(category_id) as products_missing_category_id
   FROM products;
   ```
   ✅ `products_missing_category_id` DEVE SER 0

2. **Produção rodando stable**
   - [ ] Zero erros relacionados a categoria nos últimos 7 dias
   - [ ] Vendas funcionando normalmente
   - [ ] Nenhum uso de `products.category` nos logs

3. **Backup confirmado**
   - [ ] Backup manual executado e verificado
   - [ ] Procedimento de restore testado

---

## Fase D2.3: Plano de Rollback

### Se algo der errado APÓS a migration

#### Cenário 1: Descoberto código que ainda usa `category`

**Solução:**
1. Re-adicionar coluna temporariamente:
   ```sql
   ALTER TABLE products ADD COLUMN category text;
   ```

2. Popular com dados do `product_categories`:
   ```sql
   UPDATE products p
   SET category = pc.name
   FROM product_categories pc
   WHERE p.category_id = pc.id;
   ```

3. Corrigir código que usa `category`

4. Voltar para Fase D2.1 (auditoria)

#### Cenário 2: Dados perdidos necessários

**Solução:**
1. Restore completo do backup:
   ```bash
   # Restaurar da snapshot Supabase
   # Ou usar backup SQL manual
   psql -h <host> -U postgres -d postgres < backup_pre_d2.sql
   ```

2. Análise de root cause

3. Correção do problema

4. Restart da Fase D2 após correção

#### Cenário 3: Performance degradada

**Observação:** Remoção de coluna não deve degradar performance.

**Se ocorrer:**
1. Verificar se há índices quebrados
2. Executar `VACUUM ANALYZE products;`
3. Se persistir, investigar queries específicas

---

## Fase D2.4: Validação Pós-Migration

### Testes Obrigatórios (Após aplicar migration)

1. **Produtos**
   - [ ] Listar produtos funciona
   - [ ] Criar novo produto funciona
   - [ ] Editar produto existente funciona
   - [ ] Excluir produto funciona
   - [ ] Categorias aparecem corretamente via join

2. **PDV**
   - [ ] Produtos aparecem com categorias
   - [ ] Filtros de categoria funcionam
   - [ ] Venda pode ser concluída
   - [ ] Carrinho funciona normalmente

3. **Relatórios**
   - [ ] Relatórios de produtos funcionam
   - [ ] Filtros por categoria funcionam
   - [ ] Dados estão corretos

4. **Queries de Validação**
   ```sql
   -- Verificar estrutura da tabela
   SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_name = 'products'
   ORDER BY ordinal_position;

   -- Deve retornar category_id mas NÃO category

   -- Verificar joins funcionando
   SELECT
     p.id,
     p.name,
     p.category_id,
     pc.name as category_name
   FROM products p
   LEFT JOIN product_categories pc ON p.category_id = pc.id
   LIMIT 10;
   ```

---

## Riscos e Mitigações

### Riscos Identificados

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Código backend usa `category` | Baixa | Alto | Auditoria D2.1 completa |
| Dados perdidos necessários | Baixa | Crítico | Backup completo + validação |
| Frontend quebra em edge case | Média | Médio | Testes E2E completos |
| Migration falha parcialmente | Baixa | Alto | Transaction + rollback |
| Performance degradada | Muito Baixa | Médio | VACUUM ANALYZE |

### Estratégia de Deploy

**Recomendado: Deploy Gradual**

1. **Staging primeiro** (obrigatório)
   - Aplicar migration em ambiente de staging
   - Rodar testes completos por 24h
   - Validar todos os fluxos

2. **Produção fora de horário de pico**
   - Executar migration em horário de baixo tráfego
   - Manter equipe disponível para rollback
   - Monitorar logs em tempo real

3. **Rollback preparado**
   - Script de rollback testado e pronto
   - Backup confirmado
   - Procedimento documentado

---

## Checklist Final Fase D2

### Antes de Iniciar
- [ ] Fase D1 em produção por mínimo 7 dias
- [ ] Zero erros relacionados a categoria
- [ ] Auditoria backend completa (D2.1)
- [ ] Backup completo verificado
- [ ] Procedimento de rollback testado
- [ ] 100% produtos têm category_id

### Durante Execução
- [ ] Migration executada em staging primeiro
- [ ] Testes completos em staging (24h mínimo)
- [ ] Aprovação para produção
- [ ] Migration executada em produção
- [ ] Monitoramento ativo durante 1h pós-deploy

### Após Execução
- [ ] Testes de validação D2.4 completos
- [ ] Produtos funcionando
- [ ] PDV funcionando
- [ ] Vendas funcionando
- [ ] Relatórios funcionando
- [ ] Performance normal
- [ ] Logs sem erros
- [ ] Documentação atualizada

---

## Timeline Recomendado

```
Fase D1 Deploy
    ↓
    7+ dias em produção (validação)
    ↓
D2.1: Auditoria Backend (1-2 dias)
    ↓
D2.2: Preparação Migration (1 dia)
    ↓
D2.2: Backup + Validação (1 dia)
    ↓
D2.2: Deploy Staging (1 dia)
    ↓
    24h monitoramento staging
    ↓
D2.2: Deploy Produção (1 dia)
    ↓
D2.4: Validação Pós-Deploy (1 dia)
    ↓
    7 dias monitoramento
    ↓
FASE D2 COMPLETA
```

**Total estimado: ~3 semanas após D1**

---

## Próximos Passos (Após D2)

Após remover `products.category`, considerar:

1. **Fase E: Otimização**
   - Adicionar índices em `category_id` se necessário
   - Otimizar queries de join
   - Cache de categorias no frontend

2. **Fase F: Features**
   - Ordenação customizada de categorias no PDV
   - Cores/ícones por categoria
   - Categorias hierárquicas (subcategorias)

3. **Documentação**
   - Atualizar documentação técnica
   - Remover referências a campo `category` legado
   - Documentar arquitetura final

---

## Responsáveis

- **Execução**: Dev Team
- **Aprovação Migration**: Tech Lead
- **Backup**: DevOps/DBA
- **Validação**: QA + Product
- **Rollback**: Dev Team + DevOps

---

## Notas Importantes

⚠️ **CRÍTICO**: Esta é uma operação DESTRUTIVA e IRREVERSÍVEL (sem backup)

⚠️ **IMPORTANTE**: Não pular etapas de validação

⚠️ **OBRIGATÓRIO**: Backup completo antes de qualquer operação

✅ **BOM SABER**: A coluna category não tem foreign keys, então a remoção é "limpa"

✅ **BOM SABER**: Não há impacto em vendas já realizadas (não usam category)

---

**Última atualização**: 2026-03-26
**Versão**: 1.0
**Status**: Rascunho (aguardando D1)
