/*
  # Add Subscription Control Fields to Stores Table

  ## Changes
  
  1. New Columns Added to `stores` table:
    - `subscription_status` (text) - Subscription status: 'trial', 'active', 'cancelled', 'overdue'
    - `subscription_ends_at` (timestamptz) - When the paid subscription expires
    - `is_blocked` (boolean) - Manual block flag for administrative purposes
    - `plan_name` (text) - Human-readable plan name
  
  2. Default Values:
    - `subscription_status` defaults to 'trial' for new stores
    - `is_blocked` defaults to false
    - `trial_ends_at` defaults to 7 days from creation if not specified
  
  ## Business Logic
  
  Access is allowed when:
  - subscription_status = 'active'
  - OR subscription_status = 'trial' AND trial_ends_at >= now()
  
  Access is blocked when:
  - is_blocked = true
  - OR subscription_status = 'cancelled'
  - OR subscription_status = 'overdue'
  - OR subscription_status = 'trial' AND trial_ends_at < now()
*/

-- Add subscription control columns to stores table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stores' AND column_name = 'subscription_status'
  ) THEN
    ALTER TABLE stores ADD COLUMN subscription_status text DEFAULT 'trial';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stores' AND column_name = 'subscription_ends_at'
  ) THEN
    ALTER TABLE stores ADD COLUMN subscription_ends_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stores' AND column_name = 'is_blocked'
  ) THEN
    ALTER TABLE stores ADD COLUMN is_blocked boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stores' AND column_name = 'plan_name'
  ) THEN
    ALTER TABLE stores ADD COLUMN plan_name text;
  END IF;
END $$;

-- Update existing stores to have a trial period if trial_ends_at is null
UPDATE stores 
SET trial_ends_at = created_at + interval '7 days'
WHERE trial_ends_at IS NULL;

-- Update plan_name based on existing plan values
UPDATE stores 
SET plan_name = CASE 
  WHEN plan = 'starter' THEN 'Plano Starter'
  WHEN plan = 'professional' THEN 'Plano Profissional'
  WHEN plan = 'premium' THEN 'Plano Premium'
  ELSE 'Plano ' || plan
END
WHERE plan_name IS NULL AND plan IS NOT NULL;