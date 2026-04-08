/*
  # Create stock_movements table for tracking stock history

  1. New Tables
    - `stock_movements`
      - `id` (uuid, primary key) - Unique identifier for the movement
      - `store_id` (uuid, foreign key) - Reference to the store
      - `stock_item_id` (uuid, foreign key) - Reference to the stock item
      - `type` (text) - Type of movement: 'sale', 'adjustment', 'supply', 'loss'
      - `quantity` (numeric) - Amount of stock moved (positive for additions, negative for deductions)
      - `previous_stock` (numeric) - Stock level before the movement
      - `new_stock` (numeric) - Stock level after the movement
      - `reason` (text) - Human-readable reason for the movement
      - `reference_id` (uuid, nullable) - Reference to related record (e.g., sale_id)
      - `created_at` (timestamptz) - Timestamp of the movement
  
  2. Security
    - Enable RLS on `stock_movements` table
    - Add policy for authenticated users to read movements from their store
    - Add policy for authenticated users to insert movements to their store
*/

CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  stock_item_id uuid NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('sale', 'adjustment', 'supply', 'loss')),
  quantity numeric NOT NULL,
  previous_stock numeric NOT NULL DEFAULT 0,
  new_stock numeric NOT NULL DEFAULT 0,
  reason text NOT NULL,
  reference_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view stock movements from their store
CREATE POLICY "Users can view stock movements from their store"
  ON stock_movements
  FOR SELECT
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Policy: Users can insert stock movements to their store
CREATE POLICY "Users can insert stock movements to their store"
  ON stock_movements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_stock_movements_store_id ON stock_movements(store_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_stock_item_id ON stock_movements(stock_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference_id ON stock_movements(reference_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(created_at DESC);