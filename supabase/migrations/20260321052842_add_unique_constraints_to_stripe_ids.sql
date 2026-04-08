/*
  # Add Unique Constraints to Stripe IDs

  ## Summary
  Prevents duplicate Stripe billing relationships by enforcing uniqueness on Stripe customer and subscription IDs.

  ## Changes Made
  
  ### 1. Unique Constraints
  - Added UNIQUE constraint on `stripe_customer_id` (nullable-safe)
  - Added UNIQUE constraint on `stripe_subscription_id` (nullable-safe)
  
  ### 2. Indexes Created
  - `idx_stores_stripe_customer_id` - Speeds up customer ID lookups
  - `idx_stores_stripe_subscription_id` - Speeds up subscription ID lookups
  
  ## Security & Data Safety
  - Constraints only apply to non-NULL values (multiple stores can have NULL)
  - No data is modified or deleted
  - Pre-flight check confirmed zero duplicate records exist
  - Compatible with existing subscription flow
  
  ## Impact
  - **Prevents:** Multiple stores sharing the same Stripe customer
  - **Prevents:** Multiple stores sharing the same Stripe subscription
  - **Allows:** Multiple stores with NULL Stripe IDs (pre-subscription state)
  
  ## Notes
  - PostgreSQL UNIQUE constraints naturally ignore NULL values
  - Indexes improve webhook performance when updating by Stripe ID
  - Migration is idempotent (safe to re-run)
*/

-- Create unique constraint on stripe_customer_id
-- This prevents multiple stores from sharing the same Stripe customer
-- NULL values are allowed (stores without Stripe customers yet)
ALTER TABLE stores 
ADD CONSTRAINT unique_stripe_customer_id 
UNIQUE (stripe_customer_id);

-- Create unique constraint on stripe_subscription_id
-- This prevents multiple stores from sharing the same Stripe subscription
-- NULL values are allowed (stores without active subscriptions)
ALTER TABLE stores 
ADD CONSTRAINT unique_stripe_subscription_id 
UNIQUE (stripe_subscription_id);

-- Create index on stripe_customer_id for faster lookups
-- Improves performance when webhooks update stores by customer ID
CREATE INDEX IF NOT EXISTS idx_stores_stripe_customer_id 
ON stores(stripe_customer_id) 
WHERE stripe_customer_id IS NOT NULL;

-- Create index on stripe_subscription_id for faster lookups
-- Improves performance when webhooks update stores by subscription ID
CREATE INDEX IF NOT EXISTS idx_stores_stripe_subscription_id 
ON stores(stripe_subscription_id) 
WHERE stripe_subscription_id IS NOT NULL;
