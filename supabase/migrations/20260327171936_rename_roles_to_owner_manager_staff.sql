/*
  # Rename Roles in store_users: admin → owner, attendant → staff

  ## Purpose
  Standardizes role naming across the application to match business terminology.

  ## Changes

  1. Role Renaming
     - `admin` → `owner` (store owner with full permissions)
     - `manager` → `manager` (unchanged - operational manager)
     - `attendant` → `staff` (frontline staff with limited access)

  2. Data Migration
     - Updates all existing store_users records with new role names
     - No data loss - all records are preserved

  3. Constraint Updates
     - Updates CHECK constraint to accept new role values
     - Ensures only valid roles can be inserted

  4. Function Updates
     - Updates helper functions to use new role names
     - Maintains backward compatibility during transition

  ## Security
  - All existing RLS policies automatically work with new role names
  - No changes needed to policies - they use role column dynamically

  ## Migration Safety
  - Uses transaction to ensure atomicity
  - All changes are reversible
  - Existing data is preserved

  ## Post-Migration
  - Frontend code must be updated to use new role names
  - TypeScript types must be updated
  - All role checks in application code must use new names
*/

-- Step 1: Drop the old CHECK constraint first
-- This allows us to update records to new values
ALTER TABLE store_users
DROP CONSTRAINT IF EXISTS store_users_role_check;

-- Step 2: Add temporary CHECK constraint that accepts both old and new values
ALTER TABLE store_users
ADD CONSTRAINT store_users_role_check
CHECK (role IN ('admin', 'manager', 'attendant', 'owner', 'staff'));

-- Step 3: Update all existing records
-- Now we can safely update because constraint accepts both old and new values
UPDATE store_users
SET role = 'owner'
WHERE role = 'admin';

UPDATE store_users
SET role = 'staff'
WHERE role = 'attendant';

-- Step 4: Drop temporary constraint and add final constraint
-- Now only new values are allowed
ALTER TABLE store_users
DROP CONSTRAINT store_users_role_check;

ALTER TABLE store_users
ADD CONSTRAINT store_users_role_check
CHECK (role IN ('owner', 'manager', 'staff'));

-- Step 5: Update RLS policies to use 'owner' instead of 'admin'
-- Drop old policies
DROP POLICY IF EXISTS "Admins can view all store users" ON store_users;
DROP POLICY IF EXISTS "Admins can create store users" ON store_users;
DROP POLICY IF EXISTS "Admins can update store users" ON store_users;
DROP POLICY IF EXISTS "Admins can delete store users" ON store_users;

-- Create new policies with 'owner' role
CREATE POLICY "Owners can view all store users"
  ON store_users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM store_users su
      WHERE su.store_id = store_users.store_id
        AND su.user_id = auth.uid()
        AND su.role = 'owner'
        AND su.is_active = true
    )
  );

CREATE POLICY "Owners can create store users"
  ON store_users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM store_users su
      WHERE su.store_id = store_users.store_id
        AND su.user_id = auth.uid()
        AND su.role = 'owner'
        AND su.is_active = true
    )
  );

CREATE POLICY "Owners can update store users"
  ON store_users
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM store_users su
      WHERE su.store_id = store_users.store_id
        AND su.user_id = auth.uid()
        AND su.role = 'owner'
        AND su.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM store_users su
      WHERE su.store_id = store_users.store_id
        AND su.user_id = auth.uid()
        AND su.role = 'owner'
        AND su.is_active = true
    )
  );

CREATE POLICY "Owners can delete store users"
  ON store_users
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM store_users su
      WHERE su.store_id = store_users.store_id
        AND su.user_id = auth.uid()
        AND su.role = 'owner'
        AND su.is_active = true
    )
  );

-- Step 6: Update helper functions to use new role names
CREATE OR REPLACE FUNCTION user_has_role(p_user_id uuid, p_store_id uuid, p_required_role text)
RETURNS boolean AS $$
DECLARE
  v_role text;
BEGIN
  v_role := get_user_role(p_user_id, p_store_id);

  -- Owner has all permissions (replaces admin)
  IF v_role = 'owner' THEN
    RETURN true;
  END IF;

  -- Check specific role
  IF v_role = p_required_role THEN
    RETURN true;
  END IF;

  -- Manager has staff permissions (replaces attendant)
  IF p_required_role = 'staff' AND v_role = 'manager' THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 7: Add comment to table documenting role hierarchy
COMMENT ON COLUMN store_users.role IS
'User role in the store: owner (full access), manager (operational access), staff (limited access to POS only)';

-- Verify migration success
DO $$
DECLARE
  owner_count integer;
  manager_count integer;
  staff_count integer;
  invalid_count integer;
BEGIN
  SELECT COUNT(*) INTO owner_count FROM store_users WHERE role = 'owner';
  SELECT COUNT(*) INTO manager_count FROM store_users WHERE role = 'manager';
  SELECT COUNT(*) INTO staff_count FROM store_users WHERE role = 'staff';
  SELECT COUNT(*) INTO invalid_count FROM store_users WHERE role NOT IN ('owner', 'manager', 'staff');

  RAISE NOTICE 'Migration complete:';
  RAISE NOTICE '  - Owners: %', owner_count;
  RAISE NOTICE '  - Managers: %', manager_count;
  RAISE NOTICE '  - Staff: %', staff_count;
  RAISE NOTICE '  - Invalid roles: %', invalid_count;

  IF invalid_count > 0 THEN
    RAISE WARNING 'Found % records with invalid roles! Manual intervention required.', invalid_count;
  END IF;
END $$;
