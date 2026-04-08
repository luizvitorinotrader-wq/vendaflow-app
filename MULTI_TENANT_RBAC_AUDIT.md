# AUDITORIA COMPLETA: MULTI-TENANT, RBAC E STORE CONTEXT

**Data:** 2026-04-03
**Status:** 🔴 BLOQUEADORES CRÍTICOS IDENTIFICADOS
**Prioridade:** MÁXIMA - Support Mode não funciona

---

## SUMÁRIO EXECUTIVO

### 🚨 PROBLEMAS BLOQUEADORES

1. **Support Mode completamente quebrado**
   - RLS policies não consideram `support_mode`
   - Super admin não consegue acessar dados da loja target
   - Edge functions rejeitam super admin em support mode

2. **Inconsistência de roles no database**
   - Migrations usam `'admin'`, código usa `'owner'`
   - Possível corrupção de dados em `store_users`

3. **RLS incompatível com arquitetura multi-tenant**
   - Policies usam `profiles.store_id` (NULL para super_admin)
   - Super admin não tem registro em `store_users`

---

## 1. SOURCE OF TRUTH DE ROLES

### ARQUITETURA ATUAL (Como Deveria Funcionar)

#### **Três Sistemas de Roles:**

**1. profiles.role (Super Admin Global)**
```sql
-- Valores possíveis:
'super_admin' -- Acesso global à plataforma (sem store_id)
'owner'       -- LEGADO (não usar)
'manager'     -- LEGADO (não usar)
'cashier'     -- LEGADO (não usar)
```

**2. profiles.is_system_admin (DEPRECATED)**
```sql
-- Campo booleano LEGADO
-- Usado antes de profiles.role = 'super_admin'
-- DEVE ser descontinuado
```

**3. store_users.role (SOURCE OF TRUTH para permissões de loja)**
```sql
-- Valores possíveis:
'owner'   -- Total controle da loja
'manager' -- Permissões intermediárias
'staff'   -- Permissões básicas
```

### FLUXO DE ROLES NO AUTHCONTEXT

```typescript
// 1. Detecção de super_admin
const isSuperAdminUser = data.role === 'super_admin';
setIsSuperAdmin(isSuperAdminUser);

// 2. Detecção de system_admin (LEGACY)
const isSystemAdminUser = data.is_system_admin || false;
setIsSystemAdmin(isSystemAdminUser);

// 3. Support mode override
if (isSuperAdminUser && activeSupportSession) {
  setUserRole('owner'); // Super admin em support mode age como owner
}

// 4. Fetch role from store_users
const { data } = await supabase
  .from('store_users')
  .select('role')
  .eq('user_id', userId)
  .eq('store_id', currentStoreId)
  .eq('is_active', true)
  .maybeSingle();

setUserRole(data?.role || null);

// 5. Effective role calculation
const effectiveUserRole = (isSupportMode && supportSession && storeId)
  ? 'owner'  // Super admin em support mode = owner
  : userRole; // Senão, usa role do store_users
```

### 🔴 PROBLEMAS IDENTIFICADOS

#### **P1: Nomenclatura Confusa em RoleGuard.tsx**
```typescript
// src/components/RoleGuard.tsx:6
type UserRole = 'admin' | 'manager' | 'attendant'; // ❌ ERRADO
```

**Problema:**
- Usa `'admin'` ao invés de `'owner'`
- Usa `'attendant'` ao invés de `'staff'`
- Não é usado ativamente, mas pode causar confusão

**Impacto:** BAIXO (código não usado)

---

#### **P2: Migration Inconsistency (CRÍTICO)**

**Migration 1:** `20260321170433_create_store_users_rbac_table.sql`
```sql
-- Linha 45
CHECK (role IN ('admin', 'manager', 'attendant'))
```

**Migration 2:** `20260327171936_rename_roles_to_owner_manager_staff.sql`
```sql
-- Deveria renomear 'admin' → 'owner' e 'attendant' → 'staff'
-- Mas migration pode não ter sido aplicada corretamente
```

**Problema:**
- Database pode ter `role = 'admin'` em `store_users`
- Código frontend espera `role = 'owner'`
- **MISMATCH CRÍTICO**

**Impacto:** CRÍTICO

**Como verificar:**
```sql
SELECT DISTINCT role FROM store_users;
```

**Esperado:** `'owner', 'manager', 'staff'`
**Se aparecer:** `'admin', 'attendant'` → **CORRUPÇÃO DE DADOS**

---

#### **P3: Edge Function vs Database Mismatch**

**Edge Function:** `supabase/functions/create-team-member/index.ts:95`
```typescript
if (storeUser.role !== 'owner') {
  return new Response(
    JSON.stringify({ error: 'Only store owners can create team members' }),
    { status: 403 }
  );
}
```

**Database constraint:**
```sql
CHECK (role IN ('admin', 'manager', 'attendant')) -- ❌ 'admin', não 'owner'
```

**Problema:**
- Edge function verifica `'owner'`
- Database aceita `'admin'`
- Se database tiver `'admin'`, edge function rejeita SEMPRE

**Impacto:** BLOQUEADOR (criar team members não funciona)

---

## 2. STORE CONTEXT (storeId)

### ARQUITETURA ATUAL (Como Deveria Funcionar)

#### **Fontes de storeId (em ordem de prioridade):**

```typescript
// 1. Support Mode (super_admin acessando outra loja)
if (activeSupportSession) {
  currentStoreId = activeSupportSession.target_store_id;
}

// 2. Usuário normal
else if (profile.store_id) {
  currentStoreId = profile.store_id;
}

// 3. Super Admin sem support mode
else {
  currentStoreId = null; // Correto, super_admin não tem loja
}

// Propagação global:
setStoreId(currentStoreId);
```

#### **Consumo nos Components:**

```typescript
const { storeId } = useAuth();

useEffect(() => {
  if (storeId) {
    loadData();
  }
}, [storeId]); // ✅ SEMPRE tem storeId nas dependencies
```

### ✅ VERIFICAÇÕES REALIZADAS

#### **useEffect Dependencies:**

| Component | storeId em dependencies? | Status |
|-----------|--------------------------|--------|
| Tables.tsx | ✅ Sim | OK |
| Team.tsx | ✅ Sim | OK |
| Categories.tsx | ✅ Sim | OK |
| Stock.tsx | ✅ Sim | OK |
| Products.tsx | ✅ Sim | OK |

**Conclusão:** Todos os componentes críticos têm `storeId` nas dependencies.

---

#### **Queries com store_id:**

| Component | Query filtra por store_id? | Status |
|-----------|----------------------------|--------|
| Tables.tsx | ✅ `.eq('store_id', storeId)` | OK |
| Team.tsx | ✅ `.eq('store_id', storeId)` | OK |
| Categories.tsx | ✅ `.eq('store_id', storeId)` | OK |
| Stock.tsx | ✅ `.eq('store_id', storeId)` | OK |
| Products.tsx | ✅ `.eq('store_id', storeId)` | OK |

**Conclusão:** Todas as queries filtram corretamente por `store_id` no frontend.

---

## 3. SUPPORT MODE

### ARQUITETURA ATUAL

#### **Fluxo Completo:**

**1. Início (SuperAdmin.tsx):**
```typescript
const handleAccessStore = async (storeId: string) => {
  await startSupportMode(storeId);
  navigate('/app/dashboard');
};
```

**2. Criação da Sessão (AuthContext.tsx):**
```typescript
const startSupportMode = async (targetStoreId: string) => {
  // Criar registro em admin_support_sessions
  const { data: sessionData } = await supabase
    .from('admin_support_sessions')
    .insert({
      admin_user_id: user.id,
      target_store_id: targetStoreId,
      is_active: true,
    })
    .select()
    .single();

  // Buscar loja alvo
  const { data: targetStore } = await supabase
    .from('stores')
    .select('*')
    .eq('id', targetStoreId)
    .maybeSingle();

  // Atualizar estados
  setSupportSession(sessionData);
  setIsSupportMode(true);
  setStore(targetStore);
  setStoreId(targetStoreId); // ✅ storeId propagado
  setHasValidStore(true);
  setUserRole(null); // ⚠️ Define como null (mas effectiveUserRole corrige)
};
```

**3. Cálculo de Effective Role:**
```typescript
const effectiveUserRole: UserRole = (isSupportMode && supportSession && storeId)
  ? 'owner'  // ✅ Super admin em support mode = owner
  : userRole;
```

**4. Fim (AuthContext.tsx):**
```typescript
const endSupportMode = async () => {
  // Marcar sessão como encerrada
  await supabase
    .from('admin_support_sessions')
    .update({
      is_active: false,
      ended_at: new Date().toISOString(),
    })
    .eq('id', supportSession.id);

  // Limpar estados
  setSupportSession(null);
  setIsSupportMode(false);
  await fetchProfile(user.id);
  window.location.href = '/app/super-admin';
};
```

### 🔴 PROBLEMAS IDENTIFICADOS

#### **P7: Inconsistência em userRole**

**continueProfileSetup (AuthContext.tsx:309-311):**
```typescript
if (isSuperAdminUser && activeSupportSession) {
  setUserRole('owner'); // ✅ Define como owner
}
```

**startSupportMode (AuthContext.tsx:951):**
```typescript
setUserRole(null); // ❌ Define como null
```

**Problema:**
- `fetchProfile` define como `'owner'`
- `startSupportMode` define como `null`
- Comportamento inconsistente

**Impacto:** MÉDIO (funciona porque `effectiveUserRole` corrige)

---

#### **P9: RLS NÃO CONSIDERA SUPPORT MODE (BLOQUEADOR)**

**Todas as tabelas usam esta policy:**
```sql
CREATE POLICY "Users can view products from their store"
  ON products FOR SELECT
  USING (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );
```

**Problema:**
1. Super admin tem `profiles.store_id = NULL`
2. Policy verifica `profiles.store_id`
3. `NULL IN (SELECT ...)` sempre retorna `FALSE`
4. **Super admin em support mode NÃO consegue acessar NENHUM dado**

**Tabelas afetadas:**
- ❌ products
- ❌ stock_items
- ❌ tables
- ❌ product_categories
- ❌ cash_sessions
- ❌ cash_entries
- ❌ sales
- ❌ sale_items
- ❌ customers

**Impacto:** 🔴 **BLOQUEADOR CRÍTICO** - Support mode completamente quebrado

---

#### **P11: Super Admin Vê TODOS os Dados (Vazamento)**

**Migration `20260327042300` adiciona:**
```sql
CREATE POLICY "Super admins can view all products"
  ON products FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );
```

**Problema:**
- Policy permite super admin ver **TODOS** os produtos de **TODAS** as lojas
- Em support mode, queremos ver apenas a loja target
- **Vazamento de dados entre lojas**

**Impacto:** ALTO (violação de multi-tenancy)

---

#### **P12: is_store_owner_safe Não Funciona para Super Admin**

**Migration `20260327182338`:**
```sql
CREATE OR REPLACE FUNCTION is_store_owner_safe(p_store_id uuid)
RETURNS boolean AS $$
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM store_users
    WHERE store_id = p_store_id
      AND user_id = auth.uid()
      AND role = 'owner'
      AND is_active = true
  ) INTO v_is_owner;

  RETURN COALESCE(v_is_owner, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

**Problema:**
- Função busca em `store_users`
- Super admin **NÃO tem registro** em `store_users`
- Retorna `FALSE` sempre para super admin
- **Super admin em support mode não consegue gerenciar equipe**

**Impacto:** 🔴 **BLOQUEADOR** - Team management quebrado em support mode

---

## 4. RLS vs FRONTEND

### POLÍTICAS RLS ATUAIS

**Pattern usado em TODAS as tabelas:**
```sql
CREATE POLICY "Users can view X from their store"
  ON <table_name> FOR SELECT
  USING (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );
```

### 🔴 PROBLEMA CRÍTICO

**Frontend:**
```typescript
const { storeId } = useAuth(); // Pode ser support_mode store ou profile.store_id

await supabase
  .from('products')
  .select('*')
  .eq('store_id', storeId); // ✅ Filtra corretamente
```

**RLS:**
```sql
USING (
  store_id IN (
    SELECT store_id FROM profiles WHERE id = auth.uid()
  )
);
-- ❌ Sempre usa profiles.store_id (NULL para super_admin)
```

**Consequência:**
- Frontend filtra corretamente
- **RLS bloqueia TUDO** para super admin em support mode
- Queries retornam array vazio
- Support mode não funciona

---

## 5. EDGE FUNCTIONS

### create-team-member

**Autenticação:**
```typescript
// ✅ Valida Authorization header corretamente
const authHeader = req.headers.get("Authorization");
const token = authHeader?.replace("Bearer ", "");
const { data: { user }, error } = await supabaseClient.auth.getUser(token);
```

**storeId:**
```typescript
// ❌ PROBLEMA: Não considera support mode
const { data: profile } = await supabaseClient
  .from("profiles")
  .select("store_id")
  .eq("id", user.id)
  .single();

const storeId = profile.store_id; // NULL para super_admin
```

**Role check:**
```typescript
// ❌ PROBLEMA: Super admin não tem registro em store_users
const { data: storeUser } = await supabaseClient
  .from("store_users")
  .select("role, is_active")
  .eq("store_id", storeId)
  .eq("user_id", user.id)
  .eq("is_active", true)
  .single();

if (storeUser.role !== 'owner') {
  return error 403; // Super admin sempre rejeita aqui
}
```

**Impacto:** 🔴 **BLOQUEADOR** - Super admin não pode criar team members

---

## 6. COMPONENTES CRÍTICOS

### RoleGuard.tsx

**✅ Usa effectiveUserRole:**
```typescript
const { effectiveUserRole, isSuperAdmin, isSupportMode, loading } = useAuth();
```

**⚠️ allowedRoles não é usado:**
```typescript
// Component aceita allowedRoles, mas nenhuma rota passa esse prop
// Verificação de permissões é feita diretamente nos components
```

---

### permissions.ts

**✅ Funções corretas:**
```typescript
export function canManageTeam(role: UserRole | null): boolean {
  return role === 'owner';
}
```

**✅ Components usam effectiveUserRole:**
```typescript
// Team.tsx
const { isOwner } = useAuth(); // isOwner = effectiveUserRole === 'owner'

if (!isOwner) {
  return <div>Apenas proprietários podem acessar</div>;
}
```

**❌ Categories.tsx sem verificação:**
```typescript
// Qualquer usuário pode criar/editar categorias
// FALTA verificação de permissões
```

---

## 7. RESUMO DE PROBLEMAS

| ID | Problema | Severidade | Impacto | Componente |
|----|----------|------------|---------|------------|
| P1 | Nomenclatura de roles em RoleGuard | BAIXA | Confusão futura | RoleGuard.tsx |
| P2 | Migration inconsistency (admin vs owner) | 🔴 CRÍTICA | Database pode ter roles errados | Migrations |
| P3 | Edge function usa 'owner' mas DB pode ter 'admin' | 🔴 CRÍTICA | Criar team members falha | create-team-member |
| P7 | startSupportMode define userRole=null | MÉDIA | Confusão, mas funciona | AuthContext |
| P9 | **RLS não considera support mode** | 🔴 **BLOQUEADOR** | **Support mode não funciona** | Todas as tabelas |
| P10 | **RLS usa profiles.store_id (NULL para super_admin)** | 🔴 **BLOQUEADOR** | **Super admin não vê dados** | Todas as policies |
| P11 | Super admin vê TODOS os dados | 🟡 ALTA | Vazamento de dados entre lojas | RLS policies |
| P12 | **is_store_owner_safe não funciona para super_admin** | 🔴 **BLOQUEADOR** | **Não gerencia equipe** | store_users RLS |
| P13 | **Edge function rejeita super_admin** | 🔴 **BLOQUEADOR** | **Não cria team members** | create-team-member |
| P14 | Categories sem verificação de permissões | MÉDIA | Qualquer user pode editar | Categories.tsx |

---

## 8. PLANO DE CORREÇÃO (PRIORIZADO)

### 🔴 PRIORIDADE 1: BLOQUEADORES (Support Mode)

#### **1.1. Adicionar support_mode_store_id em profiles**

**Migration:**
```sql
-- Adicionar coluna temporária para support mode
ALTER TABLE profiles
ADD COLUMN support_mode_store_id UUID REFERENCES stores(id) ON DELETE SET NULL;

COMMENT ON COLUMN profiles.support_mode_store_id IS
  'Temporary store_id when super_admin is in support mode. NULL when not in support mode.';

-- Index para performance
CREATE INDEX idx_profiles_support_mode_store_id
ON profiles(support_mode_store_id)
WHERE support_mode_store_id IS NOT NULL;
```

---

#### **1.2. Criar função helper get_effective_store_id()**

**Migration:**
```sql
CREATE OR REPLACE FUNCTION get_effective_store_id()
RETURNS UUID AS $$
DECLARE
  v_support_store_id UUID;
  v_store_id UUID;
BEGIN
  -- Pegar support_mode_store_id se existir
  SELECT support_mode_store_id INTO v_support_store_id
  FROM profiles
  WHERE id = auth.uid();

  -- Se em support mode, retorna support_mode_store_id
  IF v_support_store_id IS NOT NULL THEN
    RETURN v_support_store_id;
  END IF;

  -- Senão, retorna store_id normal
  SELECT store_id INTO v_store_id
  FROM profiles
  WHERE id = auth.uid();

  RETURN v_store_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_effective_store_id() IS
  'Returns the effective store_id for the current user, considering support mode';
```

---

#### **1.3. Atualizar TODAS as RLS policies**

**Pattern antigo:**
```sql
CREATE POLICY "Users can view products from their store"
  ON products FOR SELECT
  USING (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );
```

**Pattern novo:**
```sql
DROP POLICY "Users can view products from their store" ON products;

CREATE POLICY "Users can view products from their store"
  ON products FOR SELECT
  USING (
    store_id = get_effective_store_id()
  );
```

**Aplicar em:**
- products
- stock_items
- tables
- tabs
- product_categories
- cash_sessions
- cash_entries
- sales
- sale_items
- customers
- stock_movements

**Migration completa:**
```sql
-- products
DROP POLICY IF EXISTS "Users can view products from their store" ON products;
DROP POLICY IF EXISTS "Super admins can view all products" ON products;

CREATE POLICY "Users can view products from their store"
  ON products FOR SELECT
  USING (store_id = get_effective_store_id());

-- Repetir para INSERT, UPDATE, DELETE de cada tabela
-- ...
```

---

#### **1.4. Atualizar is_store_owner_safe()**

**Migration:**
```sql
CREATE OR REPLACE FUNCTION is_store_owner_safe(p_store_id uuid)
RETURNS boolean AS $$
DECLARE
  v_is_owner boolean;
  v_is_super_admin_in_support boolean;
BEGIN
  -- Check 1: Super admin em support mode para esta loja?
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'super_admin'
    AND support_mode_store_id = p_store_id
  ) INTO v_is_super_admin_in_support;

  IF v_is_super_admin_in_support THEN
    RETURN true;
  END IF;

  -- Check 2: Owner normal via store_users?
  SELECT EXISTS (
    SELECT 1 FROM store_users
    WHERE store_id = p_store_id
      AND user_id = auth.uid()
      AND role = 'owner'
      AND is_active = true
  ) INTO v_is_owner;

  RETURN COALESCE(v_is_owner, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

---

#### **1.5. Atualizar AuthContext.startSupportMode**

**Arquivo:** `src/contexts/AuthContext.tsx`

**Adicionar após criar sessão:**
```typescript
const startSupportMode = async (targetStoreId: string) => {
  // ... criar sessão (existente)

  // NOVO: Atualizar support_mode_store_id no banco
  const { error: profileUpdateError } = await supabase
    .from('profiles')
    .update({ support_mode_store_id: targetStoreId })
    .eq('id', user.id);

  if (profileUpdateError) {
    logger.error('❌ [startSupportMode] Erro ao atualizar profile:', profileUpdateError);
    throw profileUpdateError;
  }

  logger.log('✅ [startSupportMode] support_mode_store_id atualizado no banco');

  // ... resto do código (existente)
};
```

---

#### **1.6. Atualizar AuthContext.endSupportMode**

**Arquivo:** `src/contexts/AuthContext.tsx`

**Adicionar após marcar sessão como encerrada:**
```typescript
const endSupportMode = async () => {
  // ... marcar sessão como encerrada (existente)

  // NOVO: Limpar support_mode_store_id no banco
  const { error: profileUpdateError } = await supabase
    .from('profiles')
    .update({ support_mode_store_id: null })
    .eq('id', user.id);

  if (profileUpdateError) {
    logger.error('❌ [endSupportMode] Erro ao limpar profile:', profileUpdateError);
    // Não lançar erro, continuar com limpeza
  }

  logger.log('✅ [endSupportMode] support_mode_store_id limpo no banco');

  // ... resto do código (existente)
};
```

---

#### **1.7. Atualizar Edge Function create-team-member**

**Arquivo:** `supabase/functions/create-team-member/index.ts`

**Substituir linhas 68-103:**
```typescript
// Buscar profile com support mode
const { data: profile, error: profileError } = await supabaseClient
  .from("profiles")
  .select("store_id, support_mode_store_id, role")
  .eq("id", user.id)
  .single();

if (profileError) {
  logger.error("Error fetching profile:", profileError);
  return new Response(
    JSON.stringify({ error: "Failed to fetch user profile" }),
    { status: 500, headers: corsHeaders }
  );
}

// Effective store_id (considera support mode)
const storeId = profile.support_mode_store_id || profile.store_id;

if (!storeId) {
  return new Response(
    JSON.stringify({ error: "User does not belong to a store" }),
    { status: 400, headers: corsHeaders }
  );
}

// Verificar permissões
const isSuperAdminInSupport =
  profile.role === 'super_admin' &&
  profile.support_mode_store_id === storeId;

let hasPermission = false;

if (isSuperAdminInSupport) {
  // Super admin em support mode = owner
  hasPermission = true;
  logger.log("Super admin in support mode - permission granted");
} else {
  // Verificar se é owner via store_users
  const { data: storeUser, error: storeUserError } = await supabaseClient
    .from("store_users")
    .select("role")
    .eq("store_id", storeId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (storeUserError) {
    logger.error("Error fetching store user:", storeUserError);
    return new Response(
      JSON.stringify({ error: "Failed to verify permissions" }),
      { status: 500, headers: corsHeaders }
    );
  }

  hasPermission = storeUser?.role === 'owner';
}

if (!hasPermission) {
  return new Response(
    JSON.stringify({ error: "Only store owners can create team members" }),
    { status: 403, headers: corsHeaders }
  );
}

logger.log("Permission verified - proceeding with team member creation");
```

---

### 🟡 PRIORIDADE 2: CRÍTICOS (Data Integrity)

#### **2.1. Verificar e corrigir roles no database**

**SQL para executar:**
```sql
-- 1. Verificar roles atuais em store_users
SELECT DISTINCT role FROM store_users;

-- 2. Se encontrar 'admin' ou 'attendant', corrigir
UPDATE store_users SET role = 'owner' WHERE role = 'admin';
UPDATE store_users SET role = 'staff' WHERE role = 'attendant';

-- 3. Atualizar constraint
ALTER TABLE store_users DROP CONSTRAINT IF EXISTS store_users_role_check;
ALTER TABLE store_users ADD CONSTRAINT store_users_role_check
  CHECK (role IN ('owner', 'manager', 'staff'));

-- 4. Verificar profiles.role
SELECT DISTINCT role FROM profiles;

-- 5. Corrigir profiles se necessário
UPDATE profiles SET role = 'owner' WHERE role = 'admin' AND store_id IS NOT NULL;

-- 6. Auditar super_admins
SELECT id, email, store_id, role, is_system_admin
FROM profiles
WHERE role = 'super_admin' OR is_system_admin = true;

-- 7. Garantir que super_admin tem store_id = NULL
UPDATE profiles
SET store_id = NULL
WHERE role = 'super_admin' AND store_id IS NOT NULL;
```

---

#### **2.2. Criar migration de verificação**

**Migration:**
```sql
/*
  # Fix role inconsistencies

  1. Data Fixes
    - Rename 'admin' → 'owner' in store_users
    - Rename 'attendant' → 'staff' in store_users
    - Fix profiles.role for consistency
    - Ensure super_admin has store_id = NULL

  2. Constraints
    - Update role check constraint
    - Add validation for super_admin
*/

-- Fix store_users roles
UPDATE store_users SET role = 'owner' WHERE role = 'admin';
UPDATE store_users SET role = 'staff' WHERE role = 'attendant';

-- Update constraint
ALTER TABLE store_users DROP CONSTRAINT IF EXISTS store_users_role_check;
ALTER TABLE store_users ADD CONSTRAINT store_users_role_check
  CHECK (role IN ('owner', 'manager', 'staff'));

-- Fix profiles.role
UPDATE profiles SET role = 'owner' WHERE role = 'admin' AND store_id IS NOT NULL;

-- Ensure super_admin consistency
UPDATE profiles
SET store_id = NULL
WHERE role = 'super_admin' AND store_id IS NOT NULL;

-- Add constraint: super_admin must have store_id = NULL
ALTER TABLE profiles ADD CONSTRAINT profiles_super_admin_no_store
  CHECK (
    (role = 'super_admin' AND store_id IS NULL) OR
    (role != 'super_admin')
  );
```

---

### 🟢 PRIORIDADE 3: MELHORIAS (Code Quality)

#### **3.1. Deprecar is_system_admin**

**Migration:**
```sql
-- Adicionar warning comment
COMMENT ON COLUMN profiles.is_system_admin IS
  'DEPRECATED: Use profiles.role = ''super_admin'' instead. This column will be removed in a future version.';
```

**AuthContext.tsx:**
```typescript
// Linha 164: Adicionar deprecation warning
const isSystemAdminUser = data.is_system_admin || false;
if (isSystemAdminUser && !isSuperAdminUser) {
  console.warn('⚠️ DEPRECATED: is_system_admin is deprecated. Use role="super_admin" instead.');
}
setIsSystemAdmin(isSystemAdminUser);
```

---

#### **3.2. Padronizar nomenclatura em RoleGuard**

**Arquivo:** `src/components/RoleGuard.tsx`

**Substituir linha 6:**
```typescript
// Antes:
type UserRole = 'admin' | 'manager' | 'attendant';

// Depois:
type UserRole = 'owner' | 'manager' | 'staff';
```

---

#### **3.3. Adicionar permissões em Categories**

**Arquivo:** `src/pages/Categories.tsx`

**Adicionar no início do component:**
```typescript
const { effectiveUserRole } = useAuth();
const canManage = effectiveUserRole === 'owner' || effectiveUserRole === 'manager';

if (!canManage) {
  return (
    <div className="p-6">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-yellow-800">
          Apenas proprietários e gerentes podem gerenciar categorias.
        </p>
      </div>
    </div>
  );
}
```

---

#### **3.4. Centralizar role logic**

**Criar novo arquivo:** `src/hooks/usePermissions.ts`

```typescript
import { useAuth } from '../contexts/AuthContext';

export function usePermissions() {
  const { effectiveUserRole, isSuperAdmin, isSupportMode } = useAuth();

  return {
    // Team management
    canManageTeam: effectiveUserRole === 'owner',
    canInviteUsers: effectiveUserRole === 'owner',
    canRemoveUsers: effectiveUserRole === 'owner',

    // Products & Categories
    canManageProducts: effectiveUserRole === 'owner' || effectiveUserRole === 'manager',
    canManageCategories: effectiveUserRole === 'owner' || effectiveUserRole === 'manager',

    // Stock
    canManageStock: effectiveUserRole === 'owner' || effectiveUserRole === 'manager',
    canAdjustStock: effectiveUserRole === 'owner' || effectiveUserRole === 'manager',

    // Sales
    canMakeSales: true, // Todos podem fazer vendas
    canViewSales: true,
    canCancelSales: effectiveUserRole === 'owner' || effectiveUserRole === 'manager',

    // Cash
    canOpenCash: effectiveUserRole === 'owner' || effectiveUserRole === 'manager',
    canCloseCash: effectiveUserRole === 'owner' || effectiveUserRole === 'manager',

    // Reports
    canViewReports: effectiveUserRole === 'owner' || effectiveUserRole === 'manager',
    canViewDetailedReports: effectiveUserRole === 'owner',

    // Super Admin
    isSuperAdmin,
    isSupportMode,
  };
}
```

**Usar nos components:**
```typescript
const { canManageTeam, canManageProducts } = usePermissions();

if (!canManageTeam) {
  return <AccessDenied />;
}
```

---

## ORDEM DE EXECUÇÃO

### Fase 1: Preparação (Database)
1. Executar SQL de verificação de roles (2.1)
2. Aplicar migration de correção de roles (2.2)
3. Verificar se todos os roles estão corretos

### Fase 2: Support Mode (Backend)
1. Criar migration para support_mode_store_id (1.1)
2. Criar função get_effective_store_id() (1.2)
3. Atualizar is_store_owner_safe() (1.4)
4. Atualizar TODAS as RLS policies (1.3)

### Fase 3: Support Mode (Frontend)
1. Atualizar AuthContext.startSupportMode (1.5)
2. Atualizar AuthContext.endSupportMode (1.6)
3. Atualizar Edge Function create-team-member (1.7)

### Fase 4: Melhorias
1. Adicionar deprecation warning (3.1)
2. Padronizar RoleGuard (3.2)
3. Adicionar permissões em Categories (3.3)
4. Criar hook usePermissions (3.4)

### Fase 5: Testes
1. Testar login como super_admin
2. Iniciar support mode
3. Verificar acesso a todas as páginas
4. Verificar criação de team members
5. Verificar queries retornam dados corretos
6. Encerrar support mode
7. Verificar estado limpo

---

## CONCLUSÕES

### ESTADO ATUAL

**Support Mode:** 🔴 **COMPLETAMENTE QUEBRADO**
- RLS bloqueia super_admin em support mode
- Edge functions rejeitam super_admin
- Nenhuma funcionalidade funciona

**Multi-Tenancy:** 🟡 **PARCIALMENTE FUNCIONAL**
- Usuários normais funcionam corretamente
- Frontend filtra dados corretamente
- RLS funciona para usuários normais

**RBAC:** 🟡 **PARCIALMENTE FUNCIONAL**
- Roles podem estar inconsistentes no database
- effectiveUserRole calculado corretamente no frontend
- Falta centralização de permissões

### APÓS CORREÇÕES

**Support Mode:** ✅ **TOTALMENTE FUNCIONAL**
- RLS considera support_mode_store_id
- Edge functions detectam support mode
- Super admin tem acesso total à loja target

**Multi-Tenancy:** ✅ **TOTALMENTE FUNCIONAL**
- get_effective_store_id() garante isolamento
- Nenhum vazamento de dados entre lojas
- Performance otimizada

**RBAC:** ✅ **TOTALMENTE FUNCIONAL**
- Roles consistentes no database
- Permissões centralizadas
- Fácil manutenção

---

## RISCOS E MITIGAÇÕES

### Risco 1: Downtime durante migration de RLS

**Mitigação:**
- Executar migrations fora do horário de pico
- Testar em ambiente de staging primeiro
- Ter rollback plan preparado

### Risco 2: Usuários perderem acesso durante update

**Mitigação:**
- Notificar usuários antes
- Janela de manutenção curta (< 5 minutos)
- Monitorar logs após deploy

### Risco 3: support_mode_store_id não ser limpo

**Mitigação:**
- Adicionar job de limpeza automática:
```sql
-- Limpar support_mode_store_id órfãos
UPDATE profiles
SET support_mode_store_id = NULL
WHERE support_mode_store_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM admin_support_sessions
  WHERE admin_user_id = profiles.id
  AND is_active = true
);
```

---

## MÉTRICAS DE SUCESSO

Após implementação, validar:

✅ Super admin consegue iniciar support mode
✅ Todas as páginas carregam dados da loja target
✅ Super admin pode criar/editar team members
✅ Super admin pode gerenciar produtos/categorias
✅ Super admin pode ver vendas/relatórios
✅ Encerrar support mode limpa todos os estados
✅ Nenhum vazamento de dados entre lojas
✅ Performance não degradou
✅ Logs de auditoria registram todas as ações

---

**FIM DA AUDITORIA**
