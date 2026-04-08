/*
  # Add category_id to products table

  1. Purpose
    - Enable optional relationship between products and product_categories
    - Maintain 100% backward compatibility with products.category (text)
    - Prepare for future gradual data migration

  2. Changes
    - Add column: `category_id` (uuid, nullable)
    - Add foreign key: products.category_id → product_categories.id (ON DELETE SET NULL)
    - Add index: idx_products_category_id for query optimization

  3. Compatibility
    - ✅ products.category (text) remains unchanged and operational
    - ✅ category_id defaults to NULL (no data migration yet)
    - ✅ Frontend/backend continue using category (text) without modifications
    - ✅ All existing queries, inserts, updates work identically
    - ✅ RLS policies inherited automatically (no new policies needed)

  4. Constraints
    - FK with ON DELETE SET NULL (safe: doesn't break products if category deleted)
    - Allows NULL permanently (not enforced)

  5. Performance
    - Single btree index on category_id for future use
    - No performance impact on existing queries (they don't use category_id)

  6. Migration Strategy
    - Phase 1 (this): Add structure (column + FK + index)
    - Phase 2 (future): Migrate data from category (text) to category_id
    - Phase 3 (future): Deprecate category (text) after validation
*/

-- Add category_id column (nullable, defaults to NULL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'category_id'
  ) THEN
    ALTER TABLE products 
    ADD COLUMN category_id uuid DEFAULT NULL;
  END IF;
END $$;

-- Add foreign key constraint (ON DELETE SET NULL for safety)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_products_category_id'
      AND table_name = 'products'
  ) THEN
    ALTER TABLE products
    ADD CONSTRAINT fk_products_category_id
    FOREIGN KEY (category_id)
    REFERENCES product_categories(id)
    ON DELETE SET NULL;
  END IF;
END $$;

-- Add index for category_id queries
CREATE INDEX IF NOT EXISTS idx_products_category_id
  ON products(category_id);

-- Add helpful comment
COMMENT ON COLUMN products.category_id IS 'Optional FK to product_categories. NULL allowed. Coexists with category (text) for backward compatibility.';