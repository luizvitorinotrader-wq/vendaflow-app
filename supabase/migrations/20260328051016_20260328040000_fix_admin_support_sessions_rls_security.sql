/*
  # Fix RLS Security for admin_support_sessions

  ## Critical Security Fix
  
  **PROBLEMA DETECTADO:**
  As políticas RLS atuais permitem que QUALQUER usuário autenticado crie/atualize sessões de suporte.
  
  **SOLUÇÃO:**
  Restringir acesso exclusivamente a super_admins (profiles.role = 'super_admin').
  
  ## Changes
  
  1. DROP políticas inseguras existentes
  2. CREATE políticas restritas a super_admin apenas
     - SELECT: apenas super_admins
     - INSERT: apenas super_admins
     - UPDATE: apenas super_admins (suas próprias sessões)
  
  ## Security Validation
  
  - ✅ Owner/Manager/Staff: BLOQUEADOS de criar sessões
  - ✅ Owner/Manager/Staff: BLOQUEADOS de atualizar sessões
  - ✅ Owner/Manager/Staff: BLOQUEADOS de ver sessões
  - ✅ Super Admin: PERMITIDO criar/atualizar/ver suas sessões
  
  ## Rollback
  
  Se necessário reverter (NÃO RECOMENDADO):
  ```sql
  DROP POLICY IF EXISTS "super_admins_can_select_support_sessions" ON admin_support_sessions;
  DROP POLICY IF EXISTS "super_admins_can_insert_support_sessions" ON admin_support_sessions;
  DROP POLICY IF EXISTS "super_admins_can_update_own_sessions" ON admin_support_sessions;
  
  -- Recriar políticas antigas (INSEGURAS - não usar em produção)
  CREATE POLICY "admin_support_sessions_select" ON admin_support_sessions FOR SELECT TO authenticated USING (true);
  CREATE POLICY "admin_support_sessions_insert" ON admin_support_sessions FOR INSERT TO authenticated WITH CHECK (true);
  CREATE POLICY "admin_support_sessions_update" ON admin_support_sessions FOR UPDATE TO authenticated USING (true);
  ```
*/

-- Drop existing insecure policies
DROP POLICY IF EXISTS "admin_support_sessions_select" ON admin_support_sessions;
DROP POLICY IF EXISTS "admin_support_sessions_insert" ON admin_support_sessions;
DROP POLICY IF EXISTS "admin_support_sessions_update" ON admin_support_sessions;

-- Create secure policies for super_admin only

-- SELECT: Only super_admins can view support sessions
CREATE POLICY "super_admins_can_select_support_sessions"
  ON admin_support_sessions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- INSERT: Only super_admins can create support sessions
CREATE POLICY "super_admins_can_insert_support_sessions"
  ON admin_support_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
    AND admin_user_id = auth.uid()
  );

-- UPDATE: Only super_admins can update their own sessions
CREATE POLICY "super_admins_can_update_own_sessions"
  ON admin_support_sessions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
    AND admin_user_id = auth.uid()
  )
  WITH CHECK (
    admin_user_id = auth.uid()
  );

-- Verification query (run after migration)
-- SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'admin_support_sessions';
