/*
  # Create Super Admin Role - Multi-Tenant Separation

  1. Changes to `profiles` table
    - Add `super_admin` to role enum
    - Migrate existing `admin` role to `owner` (store admin)
    - Add CHECK constraint: super_admin must have NULL store_id
    - Add CHECK constraint: non-super_admin must have store_id
  
  2. Security
    - Maintain existing RLS policies
    - Add policy for super_admin global access
  
  3. Backward Compatibility
    - Existing users with role=admin → migrated to role=owner
    - Existing users (owner/manager/cashier) remain unchanged
    - is_system_admin column remains for transition period
  
  4. Important Notes
    - super_admin role = platform administrator (access all stores)
    - owner/manager/cashier roles = store users (single store access)
    - store_id = NULL → must be super_admin
    - store_id != NULL → cannot be super_admin
*/

-- Step 1: Migrate existing 'admin' role to 'owner' (they are store admins, not platform super admins)
UPDATE profiles 
SET role = 'owner' 
WHERE role = 'admin';

-- Step 2: Drop existing role constraint if exists
DO $$
BEGIN
  ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- Step 3: Add super_admin to role type
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('super_admin', 'owner', 'manager', 'cashier'));

-- Step 4: Add validation constraints
-- Constraint 1: super_admin must have NULL store_id
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS check_super_admin_no_store;
ALTER TABLE profiles ADD CONSTRAINT check_super_admin_no_store
  CHECK (
    (role = 'super_admin' AND store_id IS NULL) OR 
    (role != 'super_admin')
  );

-- Constraint 2: non-super_admin must have store_id
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS check_store_user_has_store;
ALTER TABLE profiles ADD CONSTRAINT check_store_user_has_store
  CHECK (
    (role = 'super_admin') OR 
    (role != 'super_admin' AND store_id IS NOT NULL)
  );

-- Step 5: Update existing RLS policy for profiles viewing
DROP POLICY IF EXISTS "Super admins can view all profiles" ON profiles;
CREATE POLICY "Super admins can view all profiles"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (
    -- Super admin sees everything
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'super_admin'
    )
    -- Regular users see their own profile
    OR auth.uid() = id
  );

-- Step 6: Add RLS policy for super_admin to view all stores
DROP POLICY IF EXISTS "Super admins can view all stores" ON stores;
CREATE POLICY "Super admins can view all stores"
  ON stores
  FOR SELECT
  TO authenticated
  USING (
    -- Super admin sees all stores
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
    -- Store owner sees their store
    OR owner_id = auth.uid()
    -- Store users see their store
    OR id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Step 7: Update products policy for super_admin
DROP POLICY IF EXISTS "Super admins can view all products" ON products;
CREATE POLICY "Super admins can view all products"
  ON products
  FOR SELECT
  TO authenticated
  USING (
    -- Super admin sees all products
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
    -- Regular users see their store's products
    OR store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Step 8: Update sales policy for super_admin
DROP POLICY IF EXISTS "Super admins can view all sales" ON sales;
CREATE POLICY "Super admins can view all sales"
  ON sales
  FOR SELECT
  TO authenticated
  USING (
    -- Super admin sees all sales
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
    -- Regular users see their store's sales
    OR store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Step 9: Add helper function to check if user is super_admin
CREATE OR REPLACE FUNCTION is_super_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = user_id
    AND role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 10: Add helper function to get user's effective store_id
CREATE OR REPLACE FUNCTION get_user_store_id(user_id UUID)
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT store_id FROM profiles WHERE id = user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 11: Add comment for documentation
COMMENT ON CONSTRAINT check_super_admin_no_store ON profiles IS 
  'Ensures super_admin role has NULL store_id (platform-wide access)';
COMMENT ON CONSTRAINT check_store_user_has_store ON profiles IS 
  'Ensures non-super_admin roles have store_id (single-tenant isolation)';
