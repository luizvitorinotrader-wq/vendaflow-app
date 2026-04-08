/*
  # Add Stock Constraints

  1. Changes
    - Add CHECK constraint to prevent negative stock
    - Add CHECK constraint to prevent negative minimum stock
    - Add CHECK constraint to prevent negative prices
    - Add CHECK constraint to prevent negative quantities in sales
    - Add CHECK constraint to prevent negative weights in sales

  2. Security
    - Database-level validation ensures data integrity
    - Prevents race conditions from creating invalid states
*/

-- Prevent negative stock
ALTER TABLE stock_items
ADD CONSTRAINT stock_items_non_negative_stock
CHECK (current_stock >= 0);

-- Prevent negative minimum stock
ALTER TABLE stock_items
ADD CONSTRAINT stock_items_non_negative_min_stock
CHECK (min_stock >= 0);

-- Prevent negative sale totals
ALTER TABLE sales
ADD CONSTRAINT sales_positive_total
CHECK (total_amount > 0);

-- Prevent negative sale item quantities
ALTER TABLE sale_items
ADD CONSTRAINT sale_items_positive_quantity
CHECK (quantity > 0);

-- Prevent negative sale item weights
ALTER TABLE sale_items
ADD CONSTRAINT sale_items_non_negative_weight
CHECK (weight IS NULL OR weight > 0);

-- Prevent negative product prices
ALTER TABLE products
ADD CONSTRAINT products_non_negative_price
CHECK (price >= 0);