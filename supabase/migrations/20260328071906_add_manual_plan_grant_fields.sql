/*
  # Add Manual Plan Grant Fields to Stores

  1. Overview
    - Adds fields to track manually granted plans by super admins
    - Enables admin to grant access without Stripe integration
    - Maintains full auditability of manual grants

  2. New Columns
    - `access_mode` (text) - Differentiates between 'paid' (Stripe) and 'manual' (admin granted)
    - `granted_by` (uuid) - References the super admin who granted access
    - `granted_at` (timestamptz) - Timestamp when access was granted
    - `grant_reason` (text) - Free text explanation for the grant

  3. Default Values
    - `access_mode` defaults to 'paid' for existing stores
    - Other fields are NULL for non-manually-granted stores

  4. Security
    - No changes to RLS policies (existing policies sufficient)
    - Super admin access controlled at application level
*/

-- Add manual plan grant tracking fields
DO $$
BEGIN
  -- Add access_mode column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stores' AND column_name = 'access_mode'
  ) THEN
    ALTER TABLE stores ADD COLUMN access_mode TEXT DEFAULT 'paid';
  END IF;

  -- Add granted_by column (references profiles.id of super admin)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stores' AND column_name = 'granted_by'
  ) THEN
    ALTER TABLE stores ADD COLUMN granted_by UUID NULL;
  END IF;

  -- Add granted_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stores' AND column_name = 'granted_at'
  ) THEN
    ALTER TABLE stores ADD COLUMN granted_at TIMESTAMPTZ NULL;
  END IF;

  -- Add grant_reason column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stores' AND column_name = 'grant_reason'
  ) THEN
    ALTER TABLE stores ADD COLUMN grant_reason TEXT NULL;
  END IF;
END $$;

-- Add foreign key constraint for granted_by
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'stores_granted_by_fkey'
  ) THEN
    ALTER TABLE stores
      ADD CONSTRAINT stores_granted_by_fkey
      FOREIGN KEY (granted_by)
      REFERENCES profiles(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Add check constraint for access_mode values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'stores_access_mode_check'
  ) THEN
    ALTER TABLE stores
      ADD CONSTRAINT stores_access_mode_check
      CHECK (access_mode IN ('paid', 'manual'));
  END IF;
END $$;

-- Create index for granted_by lookups
CREATE INDEX IF NOT EXISTS idx_stores_granted_by ON stores(granted_by) WHERE granted_by IS NOT NULL;

-- Create index for access_mode filtering
CREATE INDEX IF NOT EXISTS idx_stores_access_mode ON stores(access_mode);
