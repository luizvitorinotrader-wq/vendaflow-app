/*
  # Add missing fields to cash_entries table

  1. Changes
    - Add `payment_method` column to cash_entries
      - Type: text (nullable)
      - Valid values: 'cash', 'credit', 'debit', 'pix'
    - Add `reference_id` column to cash_entries
      - Type: uuid (nullable)
      - References the related sale, expense, or other transaction
    - Add `status` column to cash_entries
      - Type: text with default 'completed'
      - Valid values: 'pending', 'completed', 'cancelled'

  2. Notes
    - These fields are optional to maintain backward compatibility
    - payment_method helps track which payment type was used
    - reference_id links cash entries to sales or other transactions
    - status allows tracking entry completion state
*/

-- Add payment_method column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cash_entries' AND column_name = 'payment_method'
  ) THEN
    ALTER TABLE cash_entries 
    ADD COLUMN payment_method text CHECK (payment_method IN ('cash', 'credit', 'debit', 'pix') OR payment_method IS NULL);
  END IF;
END $$;

-- Add reference_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cash_entries' AND column_name = 'reference_id'
  ) THEN
    ALTER TABLE cash_entries 
    ADD COLUMN reference_id uuid;
  END IF;
END $$;

-- Add status column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cash_entries' AND column_name = 'status'
  ) THEN
    ALTER TABLE cash_entries 
    ADD COLUMN status text DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'cancelled'));
  END IF;
END $$;

-- Create index on reference_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_cash_entries_reference_id ON cash_entries(reference_id);

-- Create index on payment_method for reporting
CREATE INDEX IF NOT EXISTS idx_cash_entries_payment_method ON cash_entries(payment_method);
