/*
  # Create Feature Flags Infrastructure

  1. Purpose
    - Enable gradual rollout of multi-niche features
    - Provide instant non-destructive rollback capability
    - Support both global and store-specific feature toggles

  2. New Tables
    - `feature_flags`
      - `id` (uuid, primary key)
      - `store_id` (uuid, nullable) - NULL = global flag
      - `feature_name` (text) - unique identifier for feature
      - `is_enabled` (boolean) - current state
      - `enabled_at` (timestamptz) - when feature was enabled
      - `disabled_at` (timestamptz) - when feature was disabled
      - `metadata` (jsonb) - additional configuration
      - `created_at`, `updated_at` (timestamptz)

  3. Uniqueness Strategy
    - Global flags (store_id IS NULL): unique on feature_name only
    - Store-specific flags: unique on (store_id, feature_name) pair
    - Implemented via partial unique indexes (PostgreSQL best practice)

  4. Security
    - Enable RLS on `feature_flags` table
    - Users can view flags for their store + global flags
    - Only system admins can modify flags (via profiles.is_system_admin)

  5. Initial Seeds
    - 3 global flags for multi-niche system (all disabled by default)
*/

-- Create feature_flags table
CREATE TABLE IF NOT EXISTS feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  
  feature_name text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  
  enabled_at timestamptz,
  disabled_at timestamptz,
  
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Constraints
  CHECK (feature_name != ''),
  CHECK (metadata IS NOT NULL)
);

-- Partial unique index for GLOBAL flags (store_id IS NULL)
-- Ensures only ONE global flag per feature_name
CREATE UNIQUE INDEX IF NOT EXISTS idx_feature_flags_global_unique
  ON feature_flags(feature_name)
  WHERE store_id IS NULL;

-- Partial unique index for STORE-SPECIFIC flags (store_id IS NOT NULL)
-- Ensures only ONE flag per (store_id, feature_name) combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_feature_flags_store_unique
  ON feature_flags(store_id, feature_name)
  WHERE store_id IS NOT NULL;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_feature_flags_store_lookup
  ON feature_flags(store_id)
  WHERE store_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_feature_flags_feature_enabled
  ON feature_flags(feature_name, is_enabled);

-- Enable RLS
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- RLS Policy: SELECT
-- Users can view:
--   1. Global flags (store_id IS NULL) - visible to all authenticated users
--   2. Flags for their own store (via profiles.store_id)
CREATE POLICY "Users can view feature flags for own store"
  ON feature_flags FOR SELECT
  TO authenticated
  USING (
    store_id IS NULL
    OR
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

-- RLS Policy: INSERT/UPDATE/DELETE
-- Only system admins can manage feature flags
-- Uses profiles.is_system_admin (verified to exist in schema)
CREATE POLICY "Only system admins can manage feature flags"
  ON feature_flags FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND is_system_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND is_system_admin = true
    )
  );

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_feature_flags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER feature_flags_updated_at
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION update_feature_flags_updated_at();

-- Seed global feature flags (all disabled by default)
-- Protected by idx_feature_flags_global_unique
INSERT INTO feature_flags (store_id, feature_name, is_enabled, metadata) VALUES
  (NULL, 'enable_multi_niche_system', false, '{"description": "Master toggle for entire multi-niche system", "phase": 1}'::jsonb),
  (NULL, 'enable_product_categories', false, '{"description": "Structured product categories per store", "phase": 1}'::jsonb),
  (NULL, 'enable_product_addons', false, '{"description": "Product customization and addons", "phase": 2}'::jsonb)
ON CONFLICT (feature_name) WHERE store_id IS NULL DO NOTHING;

-- Add helpful comments
COMMENT ON TABLE feature_flags IS 'Feature toggles for gradual rollout and instant rollback';
COMMENT ON COLUMN feature_flags.store_id IS 'NULL = global flag affecting all stores';
COMMENT ON COLUMN feature_flags.feature_name IS 'Unique identifier for the feature (e.g., enable_multi_niche_system)';
COMMENT ON COLUMN feature_flags.is_enabled IS 'Current state of the feature';
COMMENT ON COLUMN feature_flags.metadata IS 'Additional configuration and context (JSONB)';