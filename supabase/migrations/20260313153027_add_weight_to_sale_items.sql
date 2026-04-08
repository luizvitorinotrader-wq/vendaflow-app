/*
  # Add weight field to sale_items table

  1. Changes
    - Add `weight` column to `sale_items` table to track weight-based product sales
    - This field stores the weight in grams for products sold by weight (e.g., Açaí por Kg)
    - Nullable field as only weight-based products will have this value

  2. Notes
    - Weight is stored in grams (numeric) for precision
    - Regular unit-based products will have NULL in this field
    - This enables proper stock deduction for weight-based recipes
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'weight'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN weight numeric(10, 2) NULL;
  END IF;
END $$;