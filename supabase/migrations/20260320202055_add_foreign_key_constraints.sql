/*
  # Add Foreign Key Constraints

  1. Changes
    - Add FK constraint on cash_entries.reference_id → sales.id
    - Add FK constraint on stock_movements.reference_id → sales.id
    - Set appropriate ON DELETE SET NULL behaviors for data preservation

  2. Security
    - Maintains referential integrity
    - Prevents orphaned records
    - Allows historical data retention when sales are deleted
*/

-- Add FK for cash_entries.reference_id to sales
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'cash_entries_reference_id_fkey'
    AND table_name = 'cash_entries'
  ) THEN
    ALTER TABLE cash_entries
    ADD CONSTRAINT cash_entries_reference_id_fkey
    FOREIGN KEY (reference_id)
    REFERENCES sales(id)
    ON DELETE SET NULL;
  END IF;
END $$;

-- Add FK for stock_movements.reference_id to sales
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'stock_movements_reference_id_fkey'
    AND table_name = 'stock_movements'
  ) THEN
    ALTER TABLE stock_movements
    ADD CONSTRAINT stock_movements_reference_id_fkey
    FOREIGN KEY (reference_id)
    REFERENCES sales(id)
    ON DELETE SET NULL;
  END IF;
END $$;
