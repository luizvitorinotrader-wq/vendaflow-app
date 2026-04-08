/*
  # Create admin support sessions table

  1. New Tables
    - `admin_support_sessions`
      - `id` (uuid, primary key) - Unique identifier for the support session
      - `admin_user_id` (uuid, not null) - ID of the admin user accessing the store
      - `target_store_id` (uuid, not null) - ID of the store being accessed in support mode
      - `is_active` (boolean, default true) - Whether the support session is currently active
      - `created_at` (timestamptz, default now()) - When the support session was created
      - `ended_at` (timestamptz, nullable) - When the support session was ended

  2. Security
    - Enable RLS on `admin_support_sessions` table
    - Add policy for authenticated admin users to manage their own support sessions
    - Add policy for admin users to read all support sessions

  3. Indexes
    - Index on admin_user_id for fast lookups
    - Index on target_store_id for auditing
    - Index on is_active for filtering active sessions
*/

CREATE TABLE IF NOT EXISTS admin_support_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  ended_at timestamptz
);

ALTER TABLE admin_support_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can insert their own support sessions"
  ON admin_support_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = admin_user_id
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admin users can update their own support sessions"
  ON admin_support_sessions
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = admin_user_id
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    auth.uid() = admin_user_id
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admin users can read all support sessions"
  ON admin_support_sessions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_admin_support_sessions_admin_user_id ON admin_support_sessions(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_support_sessions_target_store_id ON admin_support_sessions(target_store_id);
CREATE INDEX IF NOT EXISTS idx_admin_support_sessions_is_active ON admin_support_sessions(is_active);
