/*
  # Create RBAC System - Store Users Table

  ## Purpose
  Implements Role-Based Access Control (RBAC) for multi-tenant store management.
  
  ## New Tables
  
  ### store_users
  - `id` (uuid, primary key) - Unique identifier
  - `store_id` (uuid, not null) - Reference to stores table
  - `user_id` (uuid, not null) - Reference to auth.users
  - `role` (text, not null) - User role: 'admin', 'manager', 'attendant'
  - `is_active` (boolean, default true) - Whether user access is active
  - `created_at` (timestamptz, default now()) - Record creation timestamp
  - `updated_at` (timestamptz, default now()) - Record update timestamp
  
  ## Constraints
  - Unique constraint on (store_id, user_id) - One role per user per store
  - Foreign key to stores(id) with CASCADE delete
  - Foreign key to auth.users(id) with CASCADE delete
  - Check constraint on role values
  
  ## Indexes
  - Index on store_id for fast store queries
  - Index on user_id for fast user queries
  - Composite index on (store_id, user_id) for lookups
  
  ## Security
  - Enable RLS on store_users table
  - Users can view their own store_users record
  - Only admins can manage store_users
  
  ## Migration Strategy
  - Migrate existing store owners to store_users as 'admin'
  - Use profiles.store_id and stores.owner_id to create initial records
  - Safe for existing users - no data loss
*/

-- Create store_users table
CREATE TABLE IF NOT EXISTS store_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'manager', 'attendant')),
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  
  -- Constraints
  CONSTRAINT store_users_store_id_user_id_unique UNIQUE (store_id, user_id),
  CONSTRAINT store_users_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  CONSTRAINT store_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS store_users_store_id_idx ON store_users(store_id);
CREATE INDEX IF NOT EXISTS store_users_user_id_idx ON store_users(user_id);
CREATE INDEX IF NOT EXISTS store_users_store_user_lookup_idx ON store_users(store_id, user_id);
CREATE INDEX IF NOT EXISTS store_users_role_idx ON store_users(role);

-- Enable RLS
ALTER TABLE store_users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own store_users record
CREATE POLICY "Users can view own store access"
  ON store_users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Admins can view all store_users in their store
CREATE POLICY "Admins can view all store users"
  ON store_users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM store_users su
      WHERE su.store_id = store_users.store_id
        AND su.user_id = auth.uid()
        AND su.role = 'admin'
        AND su.is_active = true
    )
  );

-- Policy: Admins can insert store_users
CREATE POLICY "Admins can create store users"
  ON store_users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM store_users su
      WHERE su.store_id = store_users.store_id
        AND su.user_id = auth.uid()
        AND su.role = 'admin'
        AND su.is_active = true
    )
  );

-- Policy: Admins can update store_users
CREATE POLICY "Admins can update store users"
  ON store_users
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM store_users su
      WHERE su.store_id = store_users.store_id
        AND su.user_id = auth.uid()
        AND su.role = 'admin'
        AND su.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM store_users su
      WHERE su.store_id = store_users.store_id
        AND su.user_id = auth.uid()
        AND su.role = 'admin'
        AND su.is_active = true
    )
  );

-- Policy: Admins can delete store_users (deactivate)
CREATE POLICY "Admins can delete store users"
  ON store_users
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM store_users su
      WHERE su.store_id = store_users.store_id
        AND su.user_id = auth.uid()
        AND su.role = 'admin'
        AND su.is_active = true
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_store_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER store_users_updated_at_trigger
  BEFORE UPDATE ON store_users
  FOR EACH ROW
  EXECUTE FUNCTION update_store_users_updated_at();

-- Migrate existing store owners to store_users as 'admin'
-- This ensures backward compatibility
DO $$
DECLARE
  store_record RECORD;
BEGIN
  -- Insert admin records for all existing stores
  FOR store_record IN 
    SELECT DISTINCT s.id as store_id, s.owner_id as user_id
    FROM stores s
    WHERE s.owner_id IS NOT NULL
  LOOP
    -- Insert if not exists
    INSERT INTO store_users (store_id, user_id, role, is_active)
    VALUES (store_record.store_id, store_record.user_id, 'admin', true)
    ON CONFLICT (store_id, user_id) DO NOTHING;
  END LOOP;
  
  RAISE NOTICE 'Migrated existing store owners to store_users as admin';
END $$;

-- Helper function: Get user role in a store
CREATE OR REPLACE FUNCTION get_user_role(p_user_id uuid, p_store_id uuid)
RETURNS text AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role
  FROM store_users
  WHERE user_id = p_user_id
    AND store_id = p_store_id
    AND is_active = true;
  
  RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: Check if user has role in store
CREATE OR REPLACE FUNCTION user_has_role(p_user_id uuid, p_store_id uuid, p_required_role text)
RETURNS boolean AS $$
DECLARE
  v_role text;
BEGIN
  v_role := get_user_role(p_user_id, p_store_id);
  
  -- Admin has all permissions
  IF v_role = 'admin' THEN
    RETURN true;
  END IF;
  
  -- Check specific role
  IF v_role = p_required_role THEN
    RETURN true;
  END IF;
  
  -- Manager has attendant permissions
  IF p_required_role = 'attendant' AND v_role = 'manager' THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: Check if user belongs to store
CREATE OR REPLACE FUNCTION user_belongs_to_store(p_user_id uuid, p_store_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM store_users
    WHERE user_id = p_user_id
      AND store_id = p_store_id
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: Get user's store role
CREATE OR REPLACE FUNCTION get_current_user_role(p_store_id uuid)
RETURNS text AS $$
BEGIN
  RETURN get_user_role(auth.uid(), p_store_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
