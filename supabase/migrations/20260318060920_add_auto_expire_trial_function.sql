/*
  # Auto-Expire Trial Subscriptions Function

  1. New Function
    - `check_and_expire_trials()` - Automatically updates trial subscriptions that have expired
    
  2. Behavior
    - Runs on each authentication check
    - Updates `subscription_status` from 'trial' to 'overdue' when `trial_ends_at < now()`
    - Only affects stores that haven't been manually blocked
    
  3. Security
    - Function runs with definer privileges to bypass RLS
    - Only updates subscription_status, doesn't modify other fields
*/

-- Create function to auto-expire trials
CREATE OR REPLACE FUNCTION check_and_expire_trials()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE stores
  SET subscription_status = 'overdue'
  WHERE subscription_status = 'trial'
    AND trial_ends_at < now()
    AND is_blocked = false;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION check_and_expire_trials() TO authenticated;
