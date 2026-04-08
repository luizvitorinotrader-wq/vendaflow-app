/*
  # Fix Store Users RLS Error 500

  ## Problem
  Multiple issues causing 500 errors on store_users queries:
  
  1. **Duplicate Policies**
     - "Users can view own store access" (auth.uid() = user_id)
     - "store_users_select_own" (user_id = auth.uid())
     - Both policies active causing conflicts
  
  2. **Recursive Policy Checks**
     - Owner policies use EXISTS with SELECT on store_users itself
     - This creates recursive RLS evaluation causing 500 errors
     - Example: Query on store_users triggers policy that queries store_users again
  
  3. **is_active Filter Conflicts**
     - Policy had is_active = true in USING clause
     - Query also filters by is_active = true
     - Double filtering can cause evaluation errors

  ## Solution
  
  1. Drop all existing store_users policies
  2. Create single, simple SELECT policy without recursion
  3. Create SECURITY DEFINER function to check owner status safely
  4. Recreate owner management policies using safe function
  5. Remove is_active from SELECT policy (let query handle it)

  ## Security
  - Users can view their own store_users records
  - Owners can manage all store_users in their stores
  - SECURITY DEFINER function bypasses RLS to prevent recursion
  - All policies remain restrictive and secure
*/

-- ================================================
-- 1. DROP ALL EXISTING POLICIES
-- ================================================

DROP POLICY IF EXISTS "Users can view own store access" ON store_users;
DROP POLICY IF EXISTS "store_users_select_own" ON store_users;
DROP POLICY IF EXISTS "Owners can view all store users" ON store_users;
DROP POLICY IF EXISTS "Owners can create store users" ON store_users;
DROP POLICY IF EXISTS "Owners can update store users" ON store_users;
DROP POLICY IF EXISTS "Owners can delete store users" ON store_users;
DROP POLICY IF EXISTS "Admins can view all store users" ON store_users;
DROP POLICY IF EXISTS "Admins can create store users" ON store_users;
DROP POLICY IF EXISTS "Admins can update store users" ON store_users;
DROP POLICY IF EXISTS "Admins can delete store users" ON store_users;

-- ================================================
-- 2. CREATE SAFE HELPER FUNCTION
-- ================================================

-- This function uses SECURITY DEFINER to bypass RLS
-- Prevents recursive policy evaluation
CREATE OR REPLACE FUNCTION is_store_owner_safe(p_store_id uuid)
RETURNS boolean AS $$
DECLARE
  v_is_owner boolean;
BEGIN
  -- Direct query without RLS recursion
  SELECT EXISTS (
    SELECT 1 FROM store_users
    WHERE store_id = p_store_id
      AND user_id = auth.uid()
      AND role = 'owner'
      AND is_active = true
  ) INTO v_is_owner;
  
  RETURN COALESCE(v_is_owner, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION is_store_owner_safe(uuid) IS 
  'Safely checks if current user is owner of given store. Uses SECURITY DEFINER to avoid RLS recursion.';

-- ================================================
-- 3. CREATE SIMPLE, NON-RECURSIVE SELECT POLICY
-- ================================================

-- Policy 1: Users can view their own store_users records
-- Note: Removed is_active filter - let the query handle it
CREATE POLICY "Users can view own store membership"
  ON store_users
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
  );

-- Policy 2: Owners can view all store users in their store
CREATE POLICY "Owners can view all store members"
  ON store_users
  FOR SELECT
  TO authenticated
  USING (
    is_store_owner_safe(store_id)
  );

-- ================================================
-- 4. CREATE OWNER MANAGEMENT POLICIES
-- ================================================

-- Policy 3: Owners can create store users
CREATE POLICY "Owners can add store members"
  ON store_users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_store_owner_safe(store_id)
  );

-- Policy 4: Owners can update store users
CREATE POLICY "Owners can update store members"
  ON store_users
  FOR UPDATE
  TO authenticated
  USING (
    is_store_owner_safe(store_id)
  )
  WITH CHECK (
    is_store_owner_safe(store_id)
  );

-- Policy 5: Owners can delete store users
CREATE POLICY "Owners can remove store members"
  ON store_users
  FOR DELETE
  TO authenticated
  USING (
    is_store_owner_safe(store_id)
  );

-- ================================================
-- 5. VERIFY RLS IS ENABLED
-- ================================================

-- Ensure RLS is enabled (should already be, but verify)
ALTER TABLE store_users ENABLE ROW LEVEL SECURITY;

-- ================================================
-- 6. VALIDATION
-- ================================================

-- Verify policies are correctly created
DO $$
DECLARE
  policy_count integer;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'store_users';
  
  IF policy_count = 5 THEN
    RAISE NOTICE '✅ All 5 store_users policies created successfully';
  ELSE
    RAISE WARNING '⚠️ Expected 5 policies, found %', policy_count;
  END IF;
END $$;
