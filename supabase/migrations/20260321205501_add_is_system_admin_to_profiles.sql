/*
  # Add System Admin Flag to Profiles

  ## Overview
  This migration separates "system admin" (global SaaS admin) from "store admin" (per-store admin role).
  
  ## Changes
  
  1. **New Column**
    - `profiles.is_system_admin` (boolean, NOT NULL, default false)
    - This flag identifies the global SaaS administrator(s)
  
  2. **Separation of Concerns**
    - `profiles.is_system_admin = true` → Global SaaS admin with access to /app/admin
    - `store_users.role = 'admin'` → Store-level admin only (no global access)
    - These two concepts are now completely independent
  
  3. **Security**
    - Only one specific user should have is_system_admin = true
    - All other users default to false
    - Existing data remains intact
  
  4. **Important Notes**
    - The `profiles.role` column is no longer used for system admin detection
    - Store admins (via store_users.role) do NOT automatically become system admins
    - System admin status must be explicitly granted via is_system_admin flag
*/

-- Add is_system_admin column to profiles table
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
    
    -- Add comment for documentation
    COMMENT ON COLUMN public.profiles.is_system_admin IS 'Global SaaS system administrator flag. Only true for platform admins who can access /app/admin. Independent from store_users.role.';
  END IF;
END $$;

-- Create index for faster system admin lookups
CREATE INDEX IF NOT EXISTS idx_profiles_is_system_admin 
ON public.profiles(is_system_admin) 
WHERE is_system_admin = true;

-- Note: To set a specific user as system admin, run:
-- UPDATE public.profiles SET is_system_admin = true WHERE email = 'your-admin@email.com';