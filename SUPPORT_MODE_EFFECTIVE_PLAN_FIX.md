# FIX: Support Mode Effective Plan Implementation

## DIAGNÓSTICO

### Problema Observado
No support mode, o super_admin tinha:
- ✅ `effectiveUserRole = 'owner'` (correto - já funcionava)
- ❌ Plano comercial real da loja (errado - bloqueava features)

**Resultado:** Super admin em support mode era bloqueado por limites do plano (ex: Starter não permite /tables).

### Causa Raiz
A lógica de `effectivePlan` estava implementada, mas com dois problemas:

1. **effectivePlan.ts linha 13** - usava `isSystemAdmin` ao invés de `isSuperAdmin`
2. **Team.tsx linha 37-56** - buscava `store.plan` do banco ao invés de usar `effectivePlan` do AuthContext

---

## ARQUIVOS ALTERADOS

### 1. src/lib/effectivePlan.ts

**Problema:**
```typescript
export function getEffectivePlan(
  store: Store | null,
  isSystemAdmin: boolean,  // ← ERRADO: campo deprecated
  isSupportMode: boolean
): PlanName {
  if (isSystemAdmin && isSupportMode) {  // ← ERRADO
    return 'premium';
  }
```

**Correção:**
```typescript
export function getEffectivePlan(
  store: Store | null,
  isSuperAdmin: boolean,  // ← CORRETO: novo campo
  isSupportMode: boolean
): PlanName {
  if (isSuperAdmin && isSupportMode) {  // ← CORRETO
    return 'premium';
  }
```

**Linhas alteradas:** 8-14, 26-33

---

### 2. src/contexts/AuthContext.tsx

**Problema:**
```typescript
const effectivePlan = getEffectivePlan(store, isSystemAdmin, isSupportMode);
//                                             ^^^^^^^^^^^^^ ERRADO
```

**Correção:**
```typescript
const effectivePlan = getEffectivePlan(store, isSuperAdmin, isSupportMode);
//                                            ^^^^^^^^^^^^ CORRETO
```

**Linha alterada:** 1013

---

### 3. src/pages/Team.tsx

**Problema:**
```typescript
const { storeId, isOwner } = useAuth();  // ← não pegava effectivePlan
const [storePlan, setStorePlan] = useState<string>('starter');
const [userLimit, setUserLimit] = useState<number>(2);

useEffect(() => {
  if (storeId) {
    loadStoreInfo();  // ← buscava store.plan do banco
    loadTeamMembers();
  }
}, [storeId]);

const loadStoreInfo = async () => {
  const { data: store } = await supabase
    .from('stores')
    .select('plan')
    .eq('id', storeId)
    .single();

  const plan = store?.plan || 'starter';  // ← usava plano real
  setStorePlan(plan);

  const limits = getPlanLimits(plan);
  setUserLimit(limits.maxUsers);
};
```

**Correção:**
```typescript
const { storeId, isOwner, effectivePlan } = useAuth();  // ← pega effectivePlan
const [activeUserCount, setActiveUserCount] = useState<number>(0);

const planLimits = getPlanLimits(effectivePlan);  // ← usa effectivePlan direto
const userLimit = planLimits.maxUsers;

useEffect(() => {
  if (storeId) {
    loadTeamMembers();  // ← só carrega membros, não busca plano
  }
}, [storeId]);

// loadStoreInfo() REMOVIDO - não é mais necessário
```

**Linhas alteradas:** 21-57 (refatoração completa)

**Benefícios:**
- ✅ Eliminou state desnecessário (`storePlan`, `userLimit`)
- ✅ Eliminou função desnecessária (`loadStoreInfo`)
- ✅ Eliminou query desnecessária ao banco
- ✅ Usa `effectivePlan` do AuthContext (source of truth)

---

## PÁGINAS AUDITADAS

### ✅ Já Usavam effectivePlan (Corretas)
- **Tables.tsx linha 31, 39** - já usava `effectivePlan` do useAuth

### ✅ Não Precisam de effectivePlan
- **MySubscription.tsx** - exibe assinatura comercial REAL (não deve usar effectivePlan)
- **Admin.tsx** - página administrativa que mostra planos reais
- **Dashboard.tsx** - apenas exibe dados, sem validação de plano
- **Products.tsx** - sem validação de features por plano
- **Categories.tsx** - sem validação de features por plano
- **Reports.tsx** - sem validação de features por plano

### ✅ Corrigidas
- **Team.tsx** - agora usa `effectivePlan`

---

## LÓGICA effectivePlan - RESUMO

### AuthContext.tsx (linha 1013-1020)
```typescript
const effectivePlan = getEffectivePlan(store, isSuperAdmin, isSupportMode);

const effectiveUserRole: UserRole = (isSupportMode && supportSession && storeId)
  ? 'owner'
  : userRole;
```

### effectivePlan.ts (linha 8-24)
```typescript
export function getEffectivePlan(
  store: Store | null,
  isSuperAdmin: boolean,
  isSupportMode: boolean
): PlanName {
  // SUPPORT MODE OVERRIDE
  if (isSuperAdmin && isSupportMode) {
    return 'premium';  // ← Acesso total no modo suporte
  }

  // PLANO REAL DA LOJA
  const realPlan = (store?.plan_name || store?.plan || 'starter').toLowerCase();

  if (realPlan === 'pro' || realPlan === 'premium') {
    return realPlan as PlanName;
  }

  return 'starter';
}
```

### Regra de Negócio
```
SE super_admin EM support_mode:
  effectiveUserRole = 'owner'
  effectivePlan = 'premium'
  → Acesso TOTAL às features da loja para diagnóstico

SENÃO:
  effectiveUserRole = papel real do usuário (store_users.role)
  effectivePlan = plano comercial real da loja
  → Validação normal de permissões
```

---

## FEATURES VALIDADAS POR PLANO

### Mesas/Comandas (Tables)
- **Página:** `/app/tables`
- **Validação:** `planLimits.hasTablesFeature`
- **Planos:** Premium only
- **Status:** ✅ Usa `effectivePlan` (linha 39)

### Múltiplos Usuários (Team)
- **Página:** `/app/team`
- **Validação:** `planLimits.maxUsers`
- **Planos:**
  - Starter: 2 usuários
  - Pro: 5 usuários
  - Premium: 999 usuários
- **Status:** ✅ Usa `effectivePlan` (CORRIGIDO)

### Outras Features
- Categorias: sem limite por plano
- Produtos: sem limite por plano
- Relatórios: sem limite por plano
- Dashboard: sem limite por plano

---

## TESTE DE VALIDAÇÃO

### Antes do Fix
```
1. Login como super_admin ✅
2. Iniciar support mode em loja Starter ✅
3. Navegar para /app/tables ❌
   → "Recurso disponível apenas no plano Premium"
4. Navegar para /app/team ❌
   → Limite de 2 usuários (Starter)
```

### Depois do Fix
```
1. Login como super_admin ✅
2. Iniciar support mode em loja Starter ✅
3. effectivePlan calculado:
   - isSuperAdmin = true
   - isSupportMode = true
   - effectivePlan = 'premium' ✅
4. Navegar para /app/tables ✅
   → Acesso liberado (hasTablesFeature = true)
5. Navegar para /app/team ✅
   → Limite de 999 usuários (Premium)
6. Todas as features liberadas ✅
```

---

## CONFIRMAÇÕES OBRIGATÓRIAS

### ✅ Precisa deployar frontend?
**SIM**

Arquivos modificados:
- `src/lib/effectivePlan.ts` - lógica corrigida
- `src/contexts/AuthContext.tsx` - chamada corrigida
- `src/pages/Team.tsx` - refatorado para usar effectivePlan

Build passou com sucesso:
```
✓ built in 7.01s
dist/assets/index-DQN3YO03-1774739239301.js   656.40 kB
```

### ✅ Precisa migration?
**NÃO**

Nenhuma mudança no banco de dados.

### ✅ Precisa edge function?
**NÃO**

Apenas mudanças no frontend.

---

## ARQUIVOS MODIFICADOS - RESUMO

1. **src/lib/effectivePlan.ts** - parâmetro `isSystemAdmin` → `isSuperAdmin`
2. **src/contexts/AuthContext.tsx** - chamada com `isSuperAdmin`
3. **src/pages/Team.tsx** - refatorado para usar `effectivePlan` do AuthContext
4. **SUPPORT_MODE_EFFECTIVE_PLAN_FIX.md** - documentação completa

**Total:** 3 arquivos de código + 1 documento

---

## BENEFÍCIOS DA CORREÇÃO

### Funcional
1. ✅ Super admin em support mode tem acesso total às features
2. ✅ Validação de plano usa source of truth único (`effectivePlan`)
3. ✅ Consistência entre `effectiveUserRole` e `effectivePlan`

### Técnico
1. ✅ Eliminou queries desnecessárias ao banco (Team.tsx)
2. ✅ Eliminou state local redundante (storePlan, userLimit)
3. ✅ Code cleanup: removeu função `loadStoreInfo()`
4. ✅ Single source of truth: AuthContext

### Manutenção
1. ✅ Novas validações de plano só precisam usar `effectivePlan`
2. ✅ Support mode funciona automaticamente em novas features
3. ✅ Menos duplicação de lógica de plano

---

## PADRÃO RECOMENDADO

Para qualquer nova validação de features por plano:

```typescript
import { useAuth } from '../contexts/AuthContext';
import { getPlanLimits } from '../lib/planLimits';

function MyPage() {
  const { effectivePlan } = useAuth();  // ← Sempre usar effectivePlan

  const planLimits = getPlanLimits(effectivePlan);
  const hasFeature = planLimits.hasMyFeature;

  if (!hasFeature) {
    return <FeatureBlocked />;
  }

  // ... resto da página
}
```

**NUNCA fazer:**
```typescript
// ❌ ERRADO - buscar store.plan do banco
const { data: store } = await supabase.from('stores').select('plan').single();
const planLimits = getPlanLimits(store.plan);

// ❌ ERRADO - usar store.plan direto
const { store } = useAuth();
const planLimits = getPlanLimits(store.plan);
```

**SEMPRE fazer:**
```typescript
// ✅ CORRETO - usar effectivePlan do AuthContext
const { effectivePlan } = useAuth();
const planLimits = getPlanLimits(effectivePlan);
```

---

## CHECKLIST DE DEPLOY

- [x] effectivePlan.ts corrigido
- [x] AuthContext.tsx corrigido
- [x] Team.tsx refatorado
- [x] Build passou sem erros
- [x] Documentação completa
- [ ] **TODO:** Deploy do frontend para produção
- [ ] **TODO:** Testar support mode com loja Starter em produção
- [ ] **TODO:** Verificar acesso a /tables e /team em support mode
