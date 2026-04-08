/*
  # Create Super Admin Audit Log Table

  1. New Tables
    - `super_admin_audit_log`
      - `id` (uuid, primary key) - Unique identifier
      - `store_id` (uuid, foreign key) - Store affected by the action
      - `admin_user_id` (uuid, foreign key) - Super admin who performed the action
      - `admin_email` (text) - Email of the admin (denormalized for audit trail)
      - `action_type` (text) - Type of action (block_store, unblock_store, change_plan, change_subscription_status)
      - `old_value` (text) - Previous value before change
      - `new_value` (text) - New value after change
      - `notes` (text, nullable) - Optional notes/reason for the action
      - `created_at` (timestamptz) - When the action was performed

  2. Security
    - Enable RLS on `super_admin_audit_log` table
    - Only super_admin can SELECT audit logs
    - Only super_admin can INSERT audit logs (via application code)
    - NO UPDATE or DELETE allowed (immutable audit trail)

  3. Indexes
    - Index on store_id for fast lookup of store history
    - Index on created_at for chronological queries
    - Index on admin_user_id for admin activity tracking

  4. Important Notes
    - Audit log is immutable (no updates or deletes)
    - Provides complete trail of all super_admin actions
    - Essential for compliance and security investigation
*/

-- Create the audit log table
CREATE TABLE IF NOT EXISTS super_admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  admin_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  admin_email text NOT NULL,
  action_type text NOT NULL CHECK (
    action_type IN (
      'block_store',
      'unblock_store',
      'change_plan',
      'change_subscription_status',
      'extend_trial',
      'cancel_trial'
    )
  ),
  old_value text,
  new_value text,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE super_admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Policy: Only super_admin can SELECT audit logs
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

-- Policy: Only super_admin can INSERT audit logs
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

-- NO UPDATE or DELETE policies (immutable audit trail)

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_super_admin_audit_log_store_id 
  ON super_admin_audit_log(store_id);

CREATE INDEX IF NOT EXISTS idx_super_admin_audit_log_created_at 
  ON super_admin_audit_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_super_admin_audit_log_admin_user_id 
  ON super_admin_audit_log(admin_user_id);

-- Add comments for documentation
COMMENT ON TABLE super_admin_audit_log IS 
  'Immutable audit trail of all super_admin actions on stores. No updates or deletes allowed.';

COMMENT ON COLUMN super_admin_audit_log.action_type IS 
  'Type of administrative action performed: block_store, unblock_store, change_plan, change_subscription_status, extend_trial, cancel_trial';

COMMENT ON COLUMN super_admin_audit_log.old_value IS 
  'Value before the change (e.g., previous plan name, previous blocked status)';

COMMENT ON COLUMN super_admin_audit_log.new_value IS 
  'Value after the change (e.g., new plan name, new blocked status)';
