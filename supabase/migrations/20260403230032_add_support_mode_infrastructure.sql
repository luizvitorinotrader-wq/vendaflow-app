/*
  # Add Support Mode Infrastructure

  1. New Column
    - `profiles.support_mode_store_id` (uuid, nullable)
      - Used ONLY when super_admin is in support mode
      - References stores(id)
      - NULL when not in support mode or for normal users

  2. Security Function
    - `get_effective_store_id()` - Returns the correct store_id considering support mode
      - If super_admin AND support_mode_store_id IS NOT NULL → return support_mode_store_id
      - Otherwise → return profiles.store_id
      - SECURITY DEFINER to ensure consistent behavior across RLS policies

  3. Constraints
    - Only super_admin can have support_mode_store_id set
    - Index for performance when checking support mode

  4. Security Notes
    - Normal users cannot use support_mode_store_id to access other stores
    - Field is only effective when profile.role = 'super_admin'
    - Multi-tenant isolation is preserved
*/

-- Add support_mode_store_id column to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS support_mode_store_id UUID REFERENCES stores(id) ON DELETE SET NULL;

COMMENT ON COLUMN profiles.support_mode_store_id IS
  'Temporary store_id when super_admin is in support mode. NULL when not in support mode. Only valid for role = super_admin.';

-- Create index for performance (only where not null)
CREATE INDEX IF NOT EXISTS idx_profiles_support_mode_store_id
ON profiles(support_mode_store_id)
WHERE support_mode_store_id IS NOT NULL;

-- Add constraint: only super_admin can have support_mode_store_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_support_mode_only_for_super_admin'
  ) THEN
    ALTER TABLE profiles
    ADD CONSTRAINT profiles_support_mode_only_for_super_admin
    CHECK (
      (support_mode_store_id IS NULL) OR
      (support_mode_store_id IS NOT NULL AND role = 'super_admin')
    );
  END IF;
END $$;

-- Create security function to get effective store_id
CREATE OR REPLACE FUNCTION get_effective_store_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_profile RECORD;
BEGIN
  -- Get profile data
  SELECT role, support_mode_store_id, store_id
  INTO v_profile
  FROM profiles
  WHERE id = auth.uid();

  -- If no profile found, return NULL
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- If super_admin in support mode, return support_mode_store_id
  IF v_profile.role = 'super_admin' AND v_profile.support_mode_store_id IS NOT NULL THEN
    RETURN v_profile.support_mode_store_id;
  END IF;

  -- Otherwise, return normal store_id
  RETURN v_profile.store_id;
END;
$$;

COMMENT ON FUNCTION get_effective_store_id() IS
  'Returns the effective store_id for the current user, considering support mode. Only super_admin can override via support_mode_store_id.';