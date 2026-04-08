/*
  # Add start_support_mode and end_support_mode to audit log action types

  1. Changes
    - Extend CHECK constraint on super_admin_audit_log.action_type
    - Add 'start_support_mode' and 'end_support_mode' as valid action types
    - Allows auditing when super_admin enters/exits support mode for a store

  2. Important Notes
    - This change is backwards compatible
    - Existing audit logs remain valid
    - New action types enable tracking of support mode sessions
*/

-- Drop the existing constraint
ALTER TABLE super_admin_audit_log
DROP CONSTRAINT IF EXISTS super_admin_audit_log_action_type_check;

-- Add new constraint with support mode action types
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
    'end_support_mode'
  )
);

-- Add comment
COMMENT ON CONSTRAINT super_admin_audit_log_action_type_check
ON super_admin_audit_log IS
'Allowed action types: block_store, unblock_store, change_plan, change_subscription_status, extend_trial, cancel_trial, user_limit_reached, start_support_mode, end_support_mode';
