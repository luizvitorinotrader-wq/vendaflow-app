/*
  # Fix Store Users RLS Recursion

  ## Problem
  Current RLS policies on store_users cause 500 errors due to recursive self-reference
  in policy conditions.

  ## Solution
  1. Drop existing problematic policies
  2. Create SECURITY DEFINER helper function to check admin status
  3. Recreate policies using the helper function to avoid recursion

  ## Changes
  - Drop all existing store_users policies
  - Create `is_store_admin(p_store_id)` helper function
  - Recreate safe RLS policies without recursion
  
  ## Security
  - Users can view their own active store_users record
  - Admins can manage all store_users in their store
  - Helper function uses SECURITY DEFINER to bypass RLS during check
*/

-- Drop existing policies that cause recursion
DROP POLICY IF EXISTS "Users can view own store access" ON store_users;
DROP POLICY IF EXISTS "Admins can view all store users" ON store_users;
DROP POLICY IF EXISTS "Admins can create store users" ON store_users;
DROP POLICY IF EXISTS "Admins can update store users" ON store_users;
DROP POLICY IF EXISTS "Admins can delete store users" ON store_users;

-- Create SECURITY DEFINER helper function to check admin status
-- This bypasses RLS to avoid recursion
CREATE OR REPLACE FUNCTION is_store_admin(p_store_id uuid)
RETURNS boolean AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM store_users
    WHERE store_id = p_store_id
      AND user_id = auth.uid()
      AND role = 'admin'
      AND is_active = true
  ) INTO v_is_admin;
  
  RETURN v_is_admin;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policy 1: Users can view their own active store_users record
CREATE POLICY "Users can view own store access"
  ON store_users
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id 
    AND is_active = true
  );

-- Policy 2: Admins can view all store_users in their store
CREATE POLICY "Admins can view all store users"
  ON store_users
  FOR SELECT
  TO authenticated
  USING (
    is_store_admin(store_id)
  );

-- Policy 3: Admins can insert store_users
CREATE POLICY "Admins can create store users"
  ON store_users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_store_admin(store_id)
  );

-- Policy 4: Admins can update store_users
CREATE POLICY "Admins can update store users"
  ON store_users
  FOR UPDATE
  TO authenticated
  USING (
    is_store_admin(store_id)
  )
  WITH CHECK (
    is_store_admin(store_id)
  );

-- Policy 5: Admins can delete store_users
CREATE POLICY "Admins can delete store users"
  ON store_users
  FOR DELETE
  TO authenticated
  USING (
    is_store_admin(store_id)
  );
