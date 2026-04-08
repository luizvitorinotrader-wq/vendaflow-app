/*
  # Add cash_session_id to cash_entries

  1. Changes
    - Add cash_session_id column to cash_entries table
    - Create foreign key constraint to cash_sessions(id)
    - Create index for performance optimization

  2. Details
    - Column type: uuid (nullable for backward compatibility)
    - FK constraint: ON DELETE SET NULL (preserves entries if session deleted)
    - Index: speeds up queries filtering by cash_session_id
    - Existing entries: will have NULL cash_session_id (backward compatible)
    - New entries: will populate cash_session_id via complete_sale_transaction

  3. Security
    - No RLS changes needed (inherits existing cash_entries policies)
    - FK ensures referential integrity
*/

-- Add cash_session_id column to cash_entries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cash_entries' AND column_name = 'cash_session_id'
  ) THEN
    ALTER TABLE cash_entries 
    ADD COLUMN cash_session_id uuid REFERENCES cash_sessions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create index for performance on cash_session_id lookups
CREATE INDEX IF NOT EXISTS idx_cash_entries_cash_session_id 
ON cash_entries(cash_session_id);
