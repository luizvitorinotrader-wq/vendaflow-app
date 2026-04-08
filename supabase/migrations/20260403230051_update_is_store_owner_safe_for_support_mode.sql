/*
  # Update is_store_owner_safe() for Support Mode

  1. Updates
    - Modify `is_store_owner_safe()` to recognize super_admin in support mode
    - Super admin with support_mode_store_id matching p_store_id → return true
    - Otherwise, check normal store_users ownership

  2. Security
    - Only super_admin with support_mode_store_id set can bypass store_users check
    - Normal users still require store_users.role = 'owner'
    - Multi-tenant isolation preserved
*/

CREATE OR REPLACE FUNCTION is_store_owner_safe(p_store_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_is_owner boolean;
  v_is_super_admin_in_support boolean;
BEGIN
  -- Check 1: Super admin in support mode for this store?
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'super_admin'
    AND support_mode_store_id = p_store_id
  ) INTO v_is_super_admin_in_support;

  IF v_is_super_admin_in_support THEN
    RETURN true;
  END IF;

  -- Check 2: Normal owner via store_users?
  SELECT EXISTS (
    SELECT 1 FROM store_users
    WHERE store_id = p_store_id
      AND user_id = auth.uid()
      AND role = 'owner'
      AND is_active = true
  ) INTO v_is_owner;

  RETURN COALESCE(v_is_owner, false);
END;
$$;

COMMENT ON FUNCTION is_store_owner_safe(uuid) IS
  'Returns true if user is owner of the store (via store_users) OR super_admin in support mode for this store. Used by RLS policies to avoid recursion.';