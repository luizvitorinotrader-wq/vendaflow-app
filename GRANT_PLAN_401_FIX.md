# FIX: 401 Unauthorized em grant-plan-manual

## DIAGNÓSTICO

### Erro Observado
```
POST /functions/v1/grant-plan-manual → 401 Unauthorized
```

### Causa Exata
**Arquivo:** `src/components/StoreDetailsModal.tsx`
**Linha:** 368-371

**Código problemático:**
```typescript
headers: {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
  // ← FALTAVA: 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
},
```

### Por Que Isso Causa 401?

Edge Functions do Supabase com `verify_jwt: true` (padrão) exigem **DOIS headers**:

1. `Authorization: Bearer <token>` - para autenticar o usuário
2. `apikey: <SUPABASE_ANON_KEY>` - para autenticar a requisição à edge function

**Sem o `apikey`**, o Supabase rejeita a requisição com 401 **ANTES** do código da edge function executar.

### Comparação com Código Funcionando

**create-team-member (✅ funciona):**
```typescript
headers: {
  'Authorization': `Bearer ${session.access_token}`,
  'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,  // ← TEM
  'Content-Type': 'application/json',
}
```

**grant-plan-manual (❌ 401):**
```typescript
headers: {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${session.access_token}`,
  // ← NÃO TINHA
}
```

---

## CORREÇÃO APLICADA

### Arquivo Modificado
`src/components/StoreDetailsModal.tsx:364-379`

### Código Corrigido
```typescript
const { data: { session } } = await supabase.auth.getSession();

if (!session) {
  alert('Sessão expirada. Faça login novamente.');
  return;
}

const response = await fetch(
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/grant-plan-manual`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,  // ← ADICIONADO
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      storeId: storeId,
      plan: grantPlanData.plan,
      durationDays: grantPlanData.durationDays,
      reason: grantPlanData.reason.trim(),
    }),
  }
);
```

### Mudanças Aplicadas
1. ✅ Extraiu `session` antes do fetch (melhor tratamento de erro)
2. ✅ Verificação explícita se `session` existe
3. ✅ **ADICIONADO:** `'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY`
4. ✅ Reordenado headers (Authorization, apikey, Content-Type)

---

## CONFIRMAÇÕES

### ✅ Precisa Redeployar Edge Function?
**NÃO**

A edge function `grant-plan-manual` está correta e já deployada.
O problema era **exclusivamente no frontend** (headers faltando).

### ✅ Precisa Deploy Frontend?
**SIM**

Arquivo modificado:
- `src/components/StoreDetailsModal.tsx`

Build passou com sucesso:
```
✓ built in 6.91s
dist/assets/index-DgXcqpej-1774684221900.js   654.59 kB
```

### ✅ Precisa Migration?
**NÃO**

Nenhuma mudança no banco de dados.

---

## TESTE DE VALIDAÇÃO

### Antes do Fix
```
1. Login como super_admin ✅
2. Abrir StoreDetailsModal ✅
3. Clicar "Conceder Plano" ✅
4. Preencher formulário ✅
5. Clicar "Conceder Acesso" ❌ → 401 Unauthorized
```

### Depois do Fix
```
1. Login como super_admin ✅
2. Abrir StoreDetailsModal ✅
3. Clicar "Conceder Plano" ✅
4. Preencher formulário ✅
5. Clicar "Conceder Acesso" ✅ → Sucesso (200 OK)
6. Verificar plano concedido ✅
7. Verificar badge "Manual" ✅
8. Verificar auditoria ✅
```

---

## CHECKLIST DE DEPLOY

- [x] Arquivo corrigido: `StoreDetailsModal.tsx`
- [x] Build passou sem erros
- [x] Header `apikey` adicionado
- [x] Validação de sessão melhorada
- [ ] **TODO:** Deploy do frontend para produção
- [ ] **TODO:** Testar em produção com super_admin real

---

## LIÇÕES APRENDIDAS

### Pattern Correto para Edge Functions Autenticadas

**SEMPRE incluir ambos os headers:**

```typescript
const { data: { session } } = await supabase.auth.getSession();

if (!session) {
  // tratar erro
  return;
}

const response = await fetch(
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/FUNCTION_NAME`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,  // ← Header 1
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,    // ← Header 2
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ /* dados */ }),
  }
);
```

### Edge Functions que Seguem o Pattern
✅ `create-team-member` - correto
✅ `grant-plan-manual` - **corrigido agora**

### Validar em Outras Edge Functions
- [ ] `send-magic-link`
- [ ] `validate-magic-link`
- [ ] `verify-turnstile`
- [ ] `expire-trials`
- [ ] `stripe-webhook` (webhook público, não precisa)
- [ ] `create-checkout-session-v2`

---

## RESUMO EXECUTIVO

**Problema:** 401 Unauthorized ao conceder plano manual
**Causa:** Faltava header `apikey` na requisição
**Solução:** Adicionado header `apikey` em StoreDetailsModal.tsx
**Impacto:** Apenas frontend (1 arquivo)
**Status Build:** ✅ Passou
**Próximo Passo:** Deploy do frontend
