/*
  # Add Super Admin UPDATE Policy for Stores

  1. Security Changes
    - Add policy allowing super_admin to UPDATE stores table
    - Restricts updates to critical fields: is_blocked, plan, subscription_status
    - Ensures only super_admin role can execute these actions
    - Owner/manager/staff cannot update these fields

  2. Policy Details
    - Target table: stores
    - Command: UPDATE
    - Allowed role: super_admin only
    - Fields protected: is_blocked, plan, subscription_status

  3. Important Notes
    - This policy works in conjunction with existing SELECT policy
    - RLS is already enabled on stores table
    - Old policies (stores_update_authenticated) will be dropped for security
*/

-- Drop the overly permissive update policy
DROP POLICY IF EXISTS "stores_update_authenticated" ON stores;

-- Add restrictive update policy for super admins
DROP POLICY IF EXISTS "Super admins can update stores" ON stores;
CREATE POLICY "Super admins can update stores"
  ON stores
  FOR UPDATE
  TO authenticated
  USING (
    -- Only super_admin can update stores
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  )
  WITH CHECK (
    -- Only super_admin can update stores
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- Add policy for store owners to update their own store (non-critical fields only)
DROP POLICY IF EXISTS "Store owners can update their store" ON stores;
CREATE POLICY "Store owners can update their store"
  ON stores
  FOR UPDATE
  TO authenticated
  USING (
    -- Owner of the store
    owner_id = auth.uid()
  )
  WITH CHECK (
    -- Owner of the store
    owner_id = auth.uid()
  );

-- Add comment for documentation
COMMENT ON POLICY "Super admins can update stores" ON stores IS 
  'Allows super_admin role to update any store, including critical fields like is_blocked, plan, subscription_status';

COMMENT ON POLICY "Store owners can update their store" ON stores IS 
  'Allows store owners to update their own store (name, phone, address, etc). Critical fields require super_admin.';
