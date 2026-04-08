/*
  # Add weight-based pricing to products

  1. Changes to products table
    - Add `pricing_type` column - either 'unit' or 'weight'
    - Add `price_per_kg` column - price per kilogram for weight-based products
    
  2. Notes
    - Default pricing_type is 'unit' for existing products
    - price_per_kg is nullable (only used when pricing_type = 'weight')
    - Existing products remain unchanged with unit pricing
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'pricing_type'
  ) THEN
    ALTER TABLE products ADD COLUMN pricing_type text DEFAULT 'unit' CHECK (pricing_type IN ('unit', 'weight'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'price_per_kg'
  ) THEN
    ALTER TABLE products ADD COLUMN price_per_kg decimal(10, 2);
  END IF;
END $$;
