/*
  # Create Plans Table

  1. New Tables
    - `plans`
      - `id` (uuid, primary key)
      - `name` (text, unique) - Plan identifier: 'starter', 'professional', 'premium'
      - `display_name` (text) - Human-readable plan name
      - `price_monthly` (numeric) - Monthly price in BRL
      - `description` (text, optional) - Plan description
      - `is_active` (boolean) - Whether plan is available for new subscriptions
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `plans` table
    - Add policy for authenticated users to read plans
    - Only super_admin can modify plans

  3. Initial Data
    - Insert starter, professional, and premium plans with current pricing

  4. Notes
    - This table is the single source of truth for plan pricing
    - stores.plan field remains as enum for schema safety
    - MRR calculation will join stores with plans to get price_monthly
*/

-- Create plans table
CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  display_name text NOT NULL,
  price_monthly numeric(10, 2) NOT NULL CHECK (price_monthly >= 0),
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

-- Policy: authenticated users can read all plans
CREATE POLICY "Authenticated users can read plans"
  ON plans
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: super_admin can insert plans
CREATE POLICY "Super admin can insert plans"
  ON plans
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_system_admin = true
    )
  );

-- Policy: super_admin can update plans
CREATE POLICY "Super admin can update plans"
  ON plans
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_system_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_system_admin = true
    )
  );

-- Policy: super_admin can delete plans
CREATE POLICY "Super admin can delete plans"
  ON plans
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_system_admin = true
    )
  );

-- Create index on name for faster lookups
CREATE INDEX IF NOT EXISTS idx_plans_name ON plans(name);

-- Create index on is_active for filtering active plans
CREATE INDEX IF NOT EXISTS idx_plans_is_active ON plans(is_active) WHERE is_active = true;

-- Insert initial plans
INSERT INTO plans (name, display_name, price_monthly, description, is_active) VALUES
  ('starter', 'Starter', 49.90, 'Ideal para pequenos negócios', true),
  ('professional', 'Professional', 99.90, 'Para negócios em crescimento', true),
  ('premium', 'Premium', 199.90, 'Solução completa para empresas', true)
ON CONFLICT (name) DO NOTHING;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER plans_updated_at
  BEFORE UPDATE ON plans
  FOR EACH ROW
  EXECUTE FUNCTION update_plans_updated_at();

-- Add comment
COMMENT ON TABLE plans IS
'Plan pricing and configuration table. Single source of truth for plan pricing used in MRR calculations.';