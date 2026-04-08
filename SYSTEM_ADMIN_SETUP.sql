-- ================================================================
-- SYSTEM ADMIN SETUP SCRIPT
-- ================================================================
-- Use this script to configure system administrators after deployment
-- Run these commands in Supabase SQL Editor
-- ================================================================

-- ================================================================
-- 1. CHECK CURRENT STATUS
-- ================================================================

-- View all profiles and their system admin status
SELECT
  id,
  email,
  full_name,
  is_system_admin,
  store_id,
  created_at
FROM public.profiles
ORDER BY created_at DESC;

-- Count system admins
SELECT
  COUNT(*) FILTER (WHERE is_system_admin = true) as system_admins,
  COUNT(*) as total_users
FROM public.profiles;

-- ================================================================
-- 2. SET SYSTEM ADMIN (CHOOSE ONE METHOD)
-- ================================================================

-- Method A: Set by email (RECOMMENDED)
UPDATE public.profiles
SET is_system_admin = true
WHERE email = 'your-admin@email.com';  -- Replace with actual email

-- Method B: Set by user ID
UPDATE public.profiles
SET is_system_admin = true
WHERE id = 'user-uuid-here';  -- Replace with actual UUID

-- ================================================================
-- 3. VERIFY SYSTEM ADMIN WAS SET
-- ================================================================

-- List all system admins
SELECT
  id,
  email,
  full_name,
  is_system_admin,
  created_at
FROM public.profiles
WHERE is_system_admin = true;

-- ================================================================
-- 4. REMOVE SYSTEM ADMIN STATUS (IF NEEDED)
-- ================================================================

-- Remove by email
UPDATE public.profiles
SET is_system_admin = false
WHERE email = 'user@example.com';  -- Replace with actual email

-- Remove by ID
UPDATE public.profiles
SET is_system_admin = false
WHERE id = 'user-uuid-here';  -- Replace with actual UUID

-- ================================================================
-- 5. RESET ALL SYSTEM ADMINS (EMERGENCY ONLY)
-- ================================================================

-- WARNING: This removes system admin from ALL users
-- Uncomment only if you need to reset everything
-- UPDATE public.profiles SET is_system_admin = false;

-- ================================================================
-- 6. VERIFY STORE_USERS RECORDS
-- ================================================================

-- Check that all store owners have store_users records
SELECT
  s.id as store_id,
  s.name as store_name,
  s.owner_id,
  p.email as owner_email,
  su.role as store_role,
  su.is_active
FROM stores s
LEFT JOIN profiles p ON s.owner_id = p.id
LEFT JOIN store_users su ON su.store_id = s.id AND su.user_id = s.owner_id
ORDER BY s.created_at DESC;

-- Find stores where owner doesn't have store_users record (should be empty)
SELECT
  s.id as store_id,
  s.name as store_name,
  s.owner_id,
  p.email as owner_email
FROM stores s
JOIN profiles p ON s.owner_id = p.id
WHERE NOT EXISTS (
  SELECT 1 FROM store_users su
  WHERE su.store_id = s.id
  AND su.user_id = s.owner_id
);

-- ================================================================
-- 7. HELPFUL QUERIES
-- ================================================================

-- Get user's complete permission profile
SELECT
  p.id,
  p.email,
  p.full_name,
  p.is_system_admin,
  s.name as store_name,
  su.role as store_role,
  su.is_active as store_access_active
FROM profiles p
LEFT JOIN stores s ON p.store_id = s.id
LEFT JOIN store_users su ON su.user_id = p.id AND su.store_id = p.store_id
WHERE p.email = 'user@example.com';  -- Replace with actual email

-- List all users with their roles
SELECT
  p.email,
  p.full_name,
  CASE
    WHEN p.is_system_admin THEN 'System Admin'
    ELSE 'Regular User'
  END as global_role,
  s.name as store_name,
  su.role as store_role
FROM profiles p
LEFT JOIN stores s ON p.store_id = s.id
LEFT JOIN store_users su ON su.user_id = p.id AND su.store_id = p.store_id AND su.is_active = true
ORDER BY p.is_system_admin DESC, p.created_at DESC;

-- ================================================================
-- 8. NOTES
-- ================================================================

/*
IMPORTANT REMINDERS:

1. System Admin vs Store Admin:
   - System admin (is_system_admin = true) = Global SaaS admin
   - Store admin (store_users.role = 'admin') = Store-level admin only
   - These are COMPLETELY SEPARATE

2. Setting System Admin:
   - Only set is_system_admin = true for trusted platform administrators
   - System admins can access /app/admin and manage ALL stores
   - Store admins cannot access /app/admin

3. Store Roles:
   - admin: Full store management
   - manager: Operations management
   - attendant: Sales only (PDV)

4. Data Safety:
   - Never delete from profiles or store_users directly
   - Use is_active = false to deactivate users
   - Always verify queries in a transaction first

5. After Changes:
   - Users may need to log out and log back in
   - Frontend caches permissions during session
*/
