/*
  # Create product_recipe_items table for automatic stock consumption

  1. New Tables
    - `product_recipe_items`
      - `id` (uuid, primary key)
      - `store_id` (uuid, foreign key to stores)
      - `product_id` (uuid, foreign key to products)
      - `stock_item_id` (uuid, foreign key to stock_items)
      - `quantity_used` (decimal) - amount of stock item used per unit/kg of product
      - `unit` (text) - unit of measurement (kg, l, un)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `product_recipe_items` table
    - Add policies for authenticated users to manage their store's recipe items
    - Only users from the same store can view and modify recipe items

  3. Important Notes
    - Links products to stock items for automatic consumption
    - quantity_used represents amount consumed per product unit (or per kg for weight-based products)
    - When a sale is completed, the system uses this table to automatically reduce stock_items.current_stock
*/

CREATE TABLE IF NOT EXISTS product_recipe_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  stock_item_id uuid NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  quantity_used decimal NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'un',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_recipe_items_store_id ON product_recipe_items(store_id);
CREATE INDEX IF NOT EXISTS idx_product_recipe_items_product_id ON product_recipe_items(product_id);
CREATE INDEX IF NOT EXISTS idx_product_recipe_items_stock_item_id ON product_recipe_items(stock_item_id);

ALTER TABLE product_recipe_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view recipe items from their store"
  ON product_recipe_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.store_id = product_recipe_items.store_id
    )
  );

CREATE POLICY "Users can insert recipe items for their store"
  ON product_recipe_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.store_id = product_recipe_items.store_id
    )
  );

CREATE POLICY "Users can update recipe items from their store"
  ON product_recipe_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.store_id = product_recipe_items.store_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.store_id = product_recipe_items.store_id
    )
  );

CREATE POLICY "Users can delete recipe items from their store"
  ON product_recipe_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.store_id = product_recipe_items.store_id
    )
  );
