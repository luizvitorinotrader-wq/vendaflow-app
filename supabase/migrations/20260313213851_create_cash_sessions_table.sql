/*
  # Create Cash Sessions Table

  1. New Tables
    - `cash_sessions`
      - `id` (uuid, primary key)
      - `store_id` (uuid, foreign key to stores)
      - `opened_by` (uuid, foreign key to auth.users)
      - `opening_amount` (numeric, initial cash amount)
      - `opened_at` (timestamptz, when session opened)
      - `closing_amount` (numeric, final counted cash amount)
      - `expected_amount` (numeric, calculated expected amount)
      - `difference_amount` (numeric, difference between closing and expected)
      - `closed_at` (timestamptz, when session closed)
      - `status` (text, either 'open' or 'closed')
      - `notes` (text, optional observations)
      - `created_at` (timestamptz, record creation timestamp)

  2. Security
    - Enable RLS on `cash_sessions` table
    - Add policy for authenticated users to read their store's cash sessions
    - Add policy for authenticated users to insert cash sessions for their store
    - Add policy for authenticated users to update their store's cash sessions

  3. Constraints
    - Only one open cash session per store at a time
    - Status must be either 'open' or 'closed'
*/

CREATE TABLE IF NOT EXISTS cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  opened_by uuid NOT NULL REFERENCES auth.users(id),
  opening_amount numeric(10,2) NOT NULL DEFAULT 0,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closing_amount numeric(10,2),
  expected_amount numeric(10,2),
  difference_amount numeric(10,2),
  closed_at timestamptz,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_cash_sessions_store_status ON cash_sessions(store_id, status);

-- Add unique constraint to ensure only one open session per store
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_session_per_store 
  ON cash_sessions(store_id) 
  WHERE status = 'open';

-- Enable RLS
ALTER TABLE cash_sessions ENABLE ROW LEVEL SECURITY;

-- Policy for users to read their store's cash sessions
CREATE POLICY "Users can read own store cash sessions"
  ON cash_sessions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.store_id = cash_sessions.store_id
    )
  );

-- Policy for users to insert cash sessions for their store
CREATE POLICY "Users can insert cash sessions for own store"
  ON cash_sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.store_id = cash_sessions.store_id
    )
  );

-- Policy for users to update their store's cash sessions
CREATE POLICY "Users can update own store cash sessions"
  ON cash_sessions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.store_id = cash_sessions.store_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.store_id = cash_sessions.store_id
    )
  );