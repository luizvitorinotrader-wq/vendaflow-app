/*
  # Add switch_support_store Audit Type

  ## Overview
  Updates or creates super_admin_audit_log table with support for
  'switch_support_store' action type.

  ## Changes
  - Creates table if not exists
  - Updates CHECK constraint to include all audit types including 'switch_support_store'

  ## Security
  - RLS enabled on table
  - Only super_admin can SELECT/INSERT
*/

-- Create table if not exists
CREATE TABLE IF NOT EXISTS super_admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  admin_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  admin_email text NOT NULL,
  action_type text NOT NULL,
  old_value text,
  new_value text,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Drop existing constraint if exists
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'super_admin_audit_log_action_type_check'
  ) THEN
    ALTER TABLE super_admin_audit_log
      DROP CONSTRAINT super_admin_audit_log_action_type_check;
  END IF;
END $$;

-- Add new constraint with all action types
ALTER TABLE super_admin_audit_log
  ADD CONSTRAINT super_admin_audit_log_action_type_check
  CHECK (
    action_type IN (
      'block_store',
      'unblock_store',
      'change_plan',
      'change_subscription_status',
      'extend_trial',
      'cancel_trial',
      'user_limit_reached',
      'start_support_mode',
      'end_support_mode',
      'switch_support_store'
    )
  );

-- Enable RLS
ALTER TABLE super_admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Super admins can view audit logs" ON super_admin_audit_log;
CREATE POLICY "Super admins can view audit logs"
  ON super_admin_audit_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "Super admins can create audit logs" ON super_admin_audit_log;
CREATE POLICY "Super admins can create audit logs"
  ON super_admin_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_super_admin_audit_log_store_id 
  ON super_admin_audit_log(store_id);

CREATE INDEX IF NOT EXISTS idx_super_admin_audit_log_created_at 
  ON super_admin_audit_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_super_admin_audit_log_admin_user_id 
  ON super_admin_audit_log(admin_user_id);

-- Update comment
COMMENT ON COLUMN super_admin_audit_log.action_type IS 
  'Type of administrative action: block_store, unblock_store, change_plan, change_subscription_status, extend_trial, cancel_trial, user_limit_reached, start_support_mode, end_support_mode, switch_support_store';
