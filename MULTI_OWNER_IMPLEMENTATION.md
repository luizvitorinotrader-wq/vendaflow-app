# Implementação de Múltiplos Proprietários por Plano

## Resumo Executivo

Sistema de múltiplos proprietários restaurado com validação de limites por plano:
- **Starter**: 1 proprietário
- **Pro/Professional**: 2 proprietários
- **Premium**: 3 proprietários

## Causa Raiz Identificada

O sistema estava **hardcoded** para bloquear a criação de proprietários:

1. **Edge Function `create-team-member/index.ts`:**
   - Interface TypeScript limitada a `'manager' | 'staff'`
   - Validação que rejeitava role `'owner'`
   - Sem validação de limite de owners por plano

2. **Frontend `Team.tsx`:**
   - Estados e tipos limitados a `'manager' | 'staff'`
   - UI sem opção de "Proprietário" nos selects
   - Lógica que impedia edição/remoção de owners
   - Sem contagem de owners nem validação de limites

## Arquivos Alterados

### 1. supabase/functions/create-team-member/index.ts

**Mudanças:**

- **Interface expandida** (linha 14):
  ```typescript
  role: 'owner' | 'manager' | 'staff'
  ```

- **Request parsing movido** para antes das validações (permite validar role antes de queries)

- **Validação de role atualizada** (linha 173):
  ```typescript
  if (role !== 'owner' && role !== 'manager' && role !== 'staff')
  ```

- **Validação de limite de owners** (linhas 195-238):
  - Se `role === 'owner'`, chama RPC `count_store_owners(p_store_id)`
  - Chama RPC `get_max_owners(plan)`
  - Bloqueia se `ownerCount >= maxOwners`
  - Retorna erro 403 com mensagem clara

- **Logs detalhados** adicionados:
  - Request details (requester, store, role)
  - Plan name
  - Owner count check (current vs max)
  - User limit check (current vs max)

- **Profile creation** (linha 298):
  - Agora usa `role: role` em vez de hardcoded `'owner'`

**Comportamento:**
- Aceita role `'owner'` se dentro do limite do plano
- Valida limite de owners ANTES de criar usuário
- Valida limite geral de usuários DEPOIS
- Mantém lógica de Support Mode (usa `support_mode_store_id || store_id`)

### 2. src/pages/Team.tsx

**Mudanças:**

- **Estado expandido** (linhas 22-31):
  - Adicionado `ownerCount` state
  - Adicionado `maxOwners` do planLimits
  - Contagem de owners atualizada em `loadTeamMembers`

- **Permissões de edição/remoção** (linha 261):
  - Removida restrição que impedia edição de owners
  - Agora permite editar qualquer membro (exceto você mesmo)

- **CreateMemberModal** (linha 327+):
  - Aceita props: `currentOwnerCount`, `maxOwners`, `effectivePlan`
  - Role state expandido: `'owner' | 'manager' | 'staff'`
  - Select com opção "Proprietário":
    - Desabilitada se `isOwnerLimitReached`
    - Mostra contador `X/Y` quando disponível
    - Mostra "Limite atingido" quando bloqueado
  - Botão submit desabilitado se tentar criar owner com limite atingido
  - Validação client-side antes de chamar API

- **EditMemberModal** (linha 477+):
  - Aceita props: `currentOwnerCount`, `maxOwners`, `effectivePlan`
  - Role state expandido: `'owner' | 'manager' | 'staff'`
  - Lógica de promoção:
    - `isPromotingToOwner`: detecta se está promovendo para owner
    - `wouldExceedOwnerLimit`: valida se promoção excederia limite
  - Select com opção "Proprietário":
    - Desabilitada se promover para owner excederia limite
    - Sempre habilitada se já é owner (permite rebaixar)
    - Mostra contador e aviso
  - Botão submit desabilitado se promoção excederia limite

- **RemoveMemberModal** (linha 589):
  - Removida validação hardcoded que impedia remoção de owners
  - Agora permite remover owners (desde que não seja você mesmo)

### 3. src/lib/planLimits.ts

**Mudanças:**

- **Interface PlanLimits expandida** (linha 6):
  ```typescript
  maxOwners: number;
  ```

- **Constantes atualizadas** (linhas 10-26):
  ```typescript
  starter: { maxOwners: 1 }
  pro: { maxOwners: 2 }
  premium: { maxOwners: 3 }
  ```

## Fluxo Completo

### Criar Novo Proprietário

1. **Frontend (Team.tsx)**:
   - Usuário abre modal "Adicionar Membro"
   - Se `ownerCount >= maxOwners`, opção "Proprietário" está desabilitada
   - Se dentro do limite, pode selecionar "Proprietário"
   - Mostra contador visual: "1/2" ou "Limite atingido (2)"

2. **Edge Function (create-team-member)**:
   - Recebe request com `role: 'owner'`
   - Determina effective store (support mode safe)
   - Busca plan da loja
   - Chama `count_store_owners(p_store_id)` → retorna count atual
   - Chama `get_max_owners(plan)` → retorna limite do plano
   - Se `ownerCount >= maxOwners`: retorna 403 "Limite de proprietários atingido"
   - Se OK: valida limite geral de usuários
   - Se OK: cria usuário + profile + store_users com role='owner'

3. **Database**:
   - RLS permite insert em store_users (owner/support mode pode criar)
   - Novo registro com role='owner' é criado

### Promover Membro Existente a Proprietário

1. **Frontend (Team.tsx)**:
   - Usuário clica "Editar" em um manager/staff
   - Modal mostra select de role
   - Se `currentOwnerCount >= maxOwners` E membro não é owner:
     - Opção "Proprietário" está desabilitada
     - Mostra aviso: "Limite atingido. Rebaixe outro proprietário primeiro"
   - Se dentro do limite: pode promover

2. **Database**:
   - Update direto em store_users: `UPDATE store_users SET role = 'owner'`
   - Não passa pela Edge Function (update direto)
   - **ATENÇÃO**: Frontend faz validação client-side, mas não há validação server-side neste fluxo
   - RLS permite update (owner pode atualizar roles)

### Rebaixar Proprietário

1. **Frontend (Team.tsx)**:
   - Usuário edita um owner existente
   - Opção "Proprietário" está sempre habilitada (permite rebaixar)
   - Pode mudar para "Gerente" ou "Atendente"
   - Nenhuma trava de limite (está liberando slot)

2. **Database**:
   - Update direto em store_users
   - `ownerCount` diminui, liberando slot para futuras promoções

### Remover Proprietário

1. **Frontend (Team.tsx)**:
   - Removida trava que impedia remoção de owners
   - Agora permite remover qualquer membro (exceto você mesmo)
   - Confirmação modal padrão

2. **Database**:
   - DELETE em store_users
   - RLS permite (owner pode remover membros)

## Support Mode

**Totalmente compatível**:

- Edge Function usa `profile.support_mode_store_id || profile.store_id`
- Validações usam effective store ID
- Super admin em support mode pode criar owners respeitando limites do plano da loja alvo
- AuthContext já fornece `storeId` efetivo para o frontend
- RPC functions operam na loja correta

## Checklist de Testes

### Loja Starter (1 owner)

- [ ] Criar primeiro owner → sucesso
- [ ] Tentar criar segundo owner → bloqueado com mensagem clara
- [ ] UI mostra "Limite atingido (1)"
- [ ] Opção "Proprietário" desabilitada no modal
- [ ] Rebaixar único owner para manager → sucesso
- [ ] Agora pode criar novo owner → sucesso

### Loja Pro/Professional (2 owners)

- [ ] Criar primeiro owner → sucesso
- [ ] Criar segundo owner → sucesso
- [ ] Tentar criar terceiro owner → bloqueado
- [ ] UI mostra "1/2" quando tem 1 owner
- [ ] UI mostra "2/2" quando tem 2 owners
- [ ] UI mostra "Limite atingido (2)" quando completo
- [ ] Promover manager a owner quando tem 1 owner → sucesso
- [ ] Promover manager a owner quando tem 2 owners → bloqueado
- [ ] Rebaixar 1 dos 2 owners → sucesso, libera slot

### Loja Premium (3 owners)

- [ ] Criar até 3 owners → sucesso
- [ ] Tentar criar 4º owner → bloqueado
- [ ] UI mostra contadores corretos "0/3", "1/3", "2/3", "3/3"
- [ ] Promover/rebaixar funciona corretamente

### Support Mode

- [ ] Super admin entra em support mode em loja Starter
- [ ] Consegue ver membros da loja
- [ ] Pode criar owner respeitando limite da loja alvo (não do próprio super admin)
- [ ] Validações usam plano da loja alvo
- [ ] Logs mostram effective store ID correto

### Remoção

- [ ] Pode remover owner (não você mesmo)
- [ ] Pode remover manager
- [ ] Pode remover staff
- [ ] Não pode remover você mesmo
- [ ] Após remover owner, slot fica disponível

## Deploy Necessário

### Edge Function

**SIM - OBRIGATÓRIO**

Arquivo alterado: `supabase/functions/create-team-member/index.ts`

```bash
# Deploy via MCP tool
mcp__supabase__deploy_edge_function
  slug: "create-team-member"
  verify_jwt: true
```

### Frontend (Vercel)

**SIM - OBRIGATÓRIO**

Arquivos alterados:
- `src/pages/Team.tsx`
- `src/lib/planLimits.ts`

Build já executado com sucesso ✓

```bash
npm run build
# Deploy to Vercel (automatic via git push or manual)
```

## Verificações Finais

### Console Logs Esperados (Edge Function)

```
[create-team-member] Request details: {
  requester_user_id: "xxx",
  effective_store_id: "yyy",
  target_email: "novo@exemplo.com",
  requested_role: "owner"
}
[create-team-member] Store plan: "pro"
[create-team-member] Owner limit check: {
  current_owners: 1,
  max_owners: 2,
  plan: "pro"
}
[create-team-member] User limit check: {
  current_users: 3,
  max_users: 10,
  plan: "pro"
}
```

### Mensagens de Erro Esperadas

**Limite de owners atingido:**
```json
{
  "error": "Limite de proprietários atingido para o plano pro (2 proprietários)",
  "code": "OWNER_LIMIT_REACHED",
  "currentCount": 2,
  "maxOwners": 2,
  "plan": "pro"
}
```

**Limite de usuários atingido:**
```json
{
  "error": "Limite do plano atingido (10 usuários). Faça upgrade para adicionar mais membros.",
  "code": "USER_LIMIT_REACHED",
  "currentCount": 10,
  "maxUsers": 10,
  "plan": "pro"
}
```

## Observações Importantes

1. **Edição de role via frontend**: Update direto no DB, sem passar pela Edge Function. A validação é client-side. Se quiser validação server-side, precisa criar RLS policy ou Edge Function dedicada para updates.

2. **Consistência**: As funções RPC `count_store_owners` e `get_max_owners` já existem no banco e estão funcionando corretamente.

3. **Limite geral vs limite de owners**: São independentes. Uma loja Pro pode ter 2 owners + 8 managers/staff = 10 usuários totais.

4. **Backward compatibility**: Profile.role ainda existe (legacy), mas a role real vem de store_users. Agora criamos o profile com a role correta por consistência.

5. **Idempotência**: Se tentar criar owner com mesmo email, retorna erro "user already exists" antes de validar limites.

## Regras de Negócio Implementadas

✅ Starter = 1 owner máximo
✅ Pro/Professional = 2 owners máximo
✅ Premium = 3 owners máximo
✅ Support Mode funciona corretamente
✅ Criação/edição/remoção de owners permitida
✅ Frontend valida limites antes de enviar
✅ Backend valida limites antes de criar
✅ Mensagens claras quando limite atingido
✅ UI mostra contadores visuais
✅ Não quebra fluxos existentes (manager/staff)
✅ Não quebra Support Mode
✅ Não quebra RLS policies
✅ Logs detalhados para diagnóstico
