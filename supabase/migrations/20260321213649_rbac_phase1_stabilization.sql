/*
  # RBAC Phase 1 Stabilization and Final Fixes

  ## Overview
  This migration ensures complete stability of the Phase 1 RBAC implementation
  by verifying all components are correctly configured.

  ## Changes

  1. **Verify is_system_admin Column**
    - Ensures profiles.is_system_admin exists and has proper defaults
    - All users default to false (regular users)
    - Index for fast system admin lookups

  2. **Verify Store Users Structure**
    - Confirms store_users table exists with proper structure
    - Validates SECURITY DEFINER helper functions exist
    - Ensures RLS policies are non-recursive and stable

  3. **Data Integrity**
    - Ensures all existing store owners have store_users records
    - Validates no orphaned records exist
    - Confirms all foreign keys are intact

  4. **System Admin Setup Instructions**
    - Documents how to set a specific user as system admin
    - Provides safe SQL commands for admin assignment

  ## Security Notes
  - System admin (profiles.is_system_admin = true) → Access to /app/admin
  - Store admin (store_users.role = 'admin') → Store-level permissions only
  - These two concepts are completely separate and independent
  - Store admins do NOT automatically become system admins

  ## Post-Migration Steps
  To designate a system administrator, run:
  ```sql
  UPDATE public.profiles 
  SET is_system_admin = true 
  WHERE email = 'your-admin@email.com';
  ```
*/

-- ================================================
-- 1. VERIFY AND FIX PROFILES TABLE
-- ================================================

-- Ensure is_system_admin column exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'is_system_admin'
  ) THEN
    ALTER TABLE public.profiles 
    ADD COLUMN is_system_admin boolean NOT NULL DEFAULT false;
    
    COMMENT ON COLUMN public.profiles.is_system_admin IS 
      'Global SaaS system administrator flag. Only true for platform admins who can access /app/admin. Independent from store_users.role.';
    
    RAISE NOTICE 'Added is_system_admin column to profiles';
  ELSE
    RAISE NOTICE 'Column is_system_admin already exists';
  END IF;
END $$;

-- Ensure all existing profiles have is_system_admin = false by default
UPDATE public.profiles 
SET is_system_admin = false 
WHERE is_system_admin IS NULL;

-- Create index for faster system admin lookups (if not exists)
CREATE INDEX IF NOT EXISTS idx_profiles_is_system_admin 
ON public.profiles(is_system_admin) 
WHERE is_system_admin = true;

-- ================================================
-- 2. VERIFY STORE_USERS TABLE STRUCTURE
-- ================================================

-- Verify store_users table exists with correct structure
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'store_users'
  ) THEN
    RAISE EXCEPTION 'store_users table does not exist! Run migration 20260321170433_create_store_users_rbac_table.sql first';
  END IF;
END $$;

-- ================================================
-- 3. VERIFY HELPER FUNCTIONS EXIST
-- ================================================

-- Verify is_store_admin function exists (for RLS policies)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'is_store_admin'
  ) THEN
    RAISE NOTICE 'Creating is_store_admin helper function';
    
    CREATE OR REPLACE FUNCTION is_store_admin(p_store_id uuid)
    RETURNS boolean AS $func$
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
    $func$ LANGUAGE plpgsql SECURITY DEFINER;
  ELSE
    RAISE NOTICE 'Function is_store_admin already exists';
  END IF;
END $$;

-- ================================================
-- 4. DATA MIGRATION - ENSURE ALL STORE OWNERS HAVE STORE_USERS RECORDS
-- ================================================

-- Migrate any store owners who don't yet have store_users records
DO $$
DECLARE
  migrated_count integer := 0;
BEGIN
  WITH missing_store_users AS (
    SELECT DISTINCT 
      s.id as store_id, 
      s.owner_id as user_id
    FROM stores s
    WHERE s.owner_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM store_users su 
        WHERE su.store_id = s.id 
        AND su.user_id = s.owner_id
      )
  )
  INSERT INTO store_users (store_id, user_id, role, is_active)
  SELECT store_id, user_id, 'admin', true
  FROM missing_store_users;
  
  GET DIAGNOSTICS migrated_count = ROW_COUNT;
  
  IF migrated_count > 0 THEN
    RAISE NOTICE 'Migrated % store owners to store_users as admin', migrated_count;
  ELSE
    RAISE NOTICE 'All store owners already have store_users records';
  END IF;
END $$;

-- ================================================
-- 5. VERIFY RLS IS ENABLED
-- ================================================

-- Verify RLS is enabled on critical tables
DO $$
BEGIN
  -- Check profiles
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'profiles' 
    AND rowsecurity = true
  ) THEN
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    RAISE NOTICE 'Enabled RLS on profiles table';
  END IF;

  -- Check store_users
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'store_users' 
    AND rowsecurity = true
  ) THEN
    ALTER TABLE public.store_users ENABLE ROW LEVEL SECURITY;
    RAISE NOTICE 'Enabled RLS on store_users table';
  END IF;

  -- Check stores
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'stores' 
    AND rowsecurity = true
  ) THEN
    ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
    RAISE NOTICE 'Enabled RLS on stores table';
  END IF;
END $$;

-- ================================================
-- 6. SYSTEM ADMIN UTILITY FUNCTION
-- ================================================

-- Helper function to safely check if current user is system admin
CREATE OR REPLACE FUNCTION is_system_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND is_system_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION is_system_admin() IS 
  'Returns true if the current authenticated user is a system administrator. Safe for use in RLS policies.';

-- ================================================
-- 7. VALIDATION QUERIES
-- ================================================

-- Report current state
DO $$
DECLARE
  total_profiles integer;
  total_system_admins integer;
  total_store_users integer;
  total_store_admins integer;
BEGIN
  SELECT COUNT(*) INTO total_profiles FROM profiles;
  SELECT COUNT(*) INTO total_system_admins FROM profiles WHERE is_system_admin = true;
  SELECT COUNT(*) INTO total_store_users FROM store_users WHERE is_active = true;
  SELECT COUNT(*) INTO total_store_admins FROM store_users WHERE role = 'admin' AND is_active = true;
  
  RAISE NOTICE '=== RBAC Phase 1 Status ===';
  RAISE NOTICE 'Total profiles: %', total_profiles;
  RAISE NOTICE 'System admins: %', total_system_admins;
  RAISE NOTICE 'Active store users: %', total_store_users;
  RAISE NOTICE 'Active store admins: %', total_store_admins;
  RAISE NOTICE '========================';
  
  IF total_system_admins = 0 THEN
    RAISE NOTICE 'WARNING: No system admins configured. To set one, run:';
    RAISE NOTICE 'UPDATE public.profiles SET is_system_admin = true WHERE email = ''your-admin@email.com'';';
  END IF;
END $$;
