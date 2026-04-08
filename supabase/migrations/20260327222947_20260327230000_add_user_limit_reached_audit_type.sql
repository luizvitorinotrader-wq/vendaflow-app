/*
  # Add user_limit_reached to super_admin_audit_log action types

  1. Changes
    - Extend CHECK constraint on super_admin_audit_log.action_type
    - Add 'user_limit_reached' as valid action type
    - Allows auditing when user creation is blocked due to plan limits

  2. Important Notes
    - This change is backwards compatible
    - Existing audit logs remain valid
    - New action type enables tracking of blocked user creation attempts
*/

-- Drop the existing constraint
ALTER TABLE super_admin_audit_log 
DROP CONSTRAINT IF EXISTS super_admin_audit_log_action_type_check;

-- Add new constraint with additional action type
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
    'user_limit_reached'
  )
);

-- Add comment
COMMENT ON CONSTRAINT super_admin_audit_log_action_type_check 
ON super_admin_audit_log IS 
'Allowed action types: block_store, unblock_store, change_plan, change_subscription_status, extend_trial, cancel_trial, user_limit_reached';
