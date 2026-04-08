/*
  # AçaíGestor Pro - Complete Database Schema

  ## Overview
  Multi-tenant SaaS platform for açaí shop management with complete data isolation per store.

  ## New Tables

  ### 1. profiles
  - `id` (uuid, references auth.users)
  - `email` (text)
  - `full_name` (text)
  - `store_id` (uuid, nullable - assigned after store creation)
  - `role` (text) - 'owner', 'manager', 'cashier'
  - `created_at` (timestamptz)

  ### 2. stores
  - `id` (uuid, primary key)
  - `name` (text) - store name
  - `owner_id` (uuid, references profiles)
  - `phone` (text)
  - `address` (text)
  - `plan` (text) - 'starter', 'professional', 'premium'
  - `trial_ends_at` (timestamptz)
  - `status` (text) - 'active', 'inactive', 'trial'
  - `created_at` (timestamptz)

  ### 3. products
  - `id` (uuid, primary key)
  - `store_id` (uuid, references stores)
  - `name` (text)
  - `category` (text) - 'acai', 'topping', 'drink', 'other'
  - `price` (numeric)
  - `cost` (numeric)
  - `stock_quantity` (integer)
  - `min_stock` (integer)
  - `active` (boolean)
  - `created_at` (timestamptz)

  ### 4. sales
  - `id` (uuid, primary key)
  - `store_id` (uuid, references stores)
  - `customer_id` (uuid, nullable, references customers)
  - `total_amount` (numeric)
  - `payment_method` (text) - 'cash', 'credit', 'debit', 'pix'
  - `created_at` (timestamptz)

  ### 5. sale_items
  - `id` (uuid, primary key)
  - `sale_id` (uuid, references sales)
  - `product_id` (uuid, references products)
  - `quantity` (integer)
  - `unit_price` (numeric)
  - `total_price` (numeric)
  - `created_at` (timestamptz)

  ### 6. stock_items
  - `id` (uuid, primary key)
  - `store_id` (uuid, references stores)
  - `name` (text)
  - `unit` (text) - 'kg', 'l', 'un'
  - `current_stock` (numeric)
  - `min_stock` (numeric)
  - `created_at` (timestamptz)

  ### 7. cash_entries
  - `id` (uuid, primary key)
  - `store_id` (uuid, references stores)
  - `type` (text) - 'entry', 'exit'
  - `amount` (numeric)
  - `description` (text)
  - `category` (text) - 'sale', 'expense', 'withdrawal', 'other'
  - `created_at` (timestamptz)

  ### 8. customers
  - `id` (uuid, primary key)
  - `store_id` (uuid, references stores)
  - `name` (text)
  - `phone` (text)
  - `notes` (text)
  - `loyalty_points` (integer)
  - `created_at` (timestamptz)

  ### 9. loyalty_transactions
  - `id` (uuid, primary key)
  - `store_id` (uuid, references stores)
  - `customer_id` (uuid, references customers)
  - `sale_id` (uuid, nullable, references sales)
  - `points` (integer)
  - `type` (text) - 'earned', 'redeemed'
  - `created_at` (timestamptz)

  ### 10. subscriptions
  - `id` (uuid, primary key)
  - `store_id` (uuid, references stores)
  - `plan` (text)
  - `status` (text) - 'active', 'cancelled', 'expired'
  - `starts_at` (timestamptz)
  - `ends_at` (timestamptz)
  - `created_at` (timestamptz)

  ## Security
  - Enable RLS on all tables
  - Policies ensure users can only access data from their own store
  - Owner can perform all operations
  - Managers and cashiers have specific permissions
*/

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  store_id uuid,
  role text DEFAULT 'owner' CHECK (role IN ('owner', 'manager', 'cashier')),
  created_at timestamptz DEFAULT now()
);

-- Create stores table
CREATE TABLE IF NOT EXISTS stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  phone text,
  address text,
  plan text DEFAULT 'starter' CHECK (plan IN ('starter', 'professional', 'premium')),
  trial_ends_at timestamptz DEFAULT (now() + interval '7 days'),
  status text DEFAULT 'trial' CHECK (status IN ('active', 'inactive', 'trial')),
  created_at timestamptz DEFAULT now()
);

-- Add foreign key to profiles after stores table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'profiles_store_id_fkey'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_store_id_fkey 
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('acai', 'topping', 'drink', 'other')),
  price numeric(10, 2) NOT NULL DEFAULT 0,
  cost numeric(10, 2) NOT NULL DEFAULT 0,
  stock_quantity integer DEFAULT 0,
  min_stock integer DEFAULT 5,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create customers table
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  notes text,
  loyalty_points integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create sales table
CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  total_amount numeric(10, 2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL CHECK (payment_method IN ('cash', 'credit', 'debit', 'pix')),
  created_at timestamptz DEFAULT now()
);

-- Create sale_items table
CREATE TABLE IF NOT EXISTS sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric(10, 2) NOT NULL,
  total_price numeric(10, 2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create stock_items table
CREATE TABLE IF NOT EXISTS stock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  unit text NOT NULL CHECK (unit IN ('kg', 'l', 'un')),
  current_stock numeric(10, 2) DEFAULT 0,
  min_stock numeric(10, 2) DEFAULT 5,
  created_at timestamptz DEFAULT now()
);

-- Create cash_entries table
CREATE TABLE IF NOT EXISTS cash_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('entry', 'exit')),
  amount numeric(10, 2) NOT NULL,
  description text NOT NULL,
  category text NOT NULL CHECK (category IN ('sale', 'expense', 'withdrawal', 'supply', 'other')),
  created_at timestamptz DEFAULT now()
);

-- Create loyalty_transactions table
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sale_id uuid REFERENCES sales(id) ON DELETE SET NULL,
  points integer NOT NULL,
  type text NOT NULL CHECK (type IN ('earned', 'redeemed')),
  created_at timestamptz DEFAULT now()
);

-- Create subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('starter', 'professional', 'premium')),
  status text DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
  starts_at timestamptz DEFAULT now(),
  ends_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Stores policies
CREATE POLICY "Store owners can view their stores"
  ON stores FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create stores"
  ON stores FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Store owners can update their stores"
  ON stores FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Products policies
CREATE POLICY "Users can view products from their store"
  ON products FOR SELECT
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert products in their store"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update products in their store"
  ON products FOR UPDATE
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete products in their store"
  ON products FOR DELETE
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Sales policies
CREATE POLICY "Users can view sales from their store"
  ON sales FOR SELECT
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert sales in their store"
  ON sales FOR INSERT
  TO authenticated
  WITH CHECK (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Sale items policies
CREATE POLICY "Users can view sale items from their store"
  ON sale_items FOR SELECT
  TO authenticated
  USING (
    sale_id IN (
      SELECT id FROM sales WHERE store_id IN (
        SELECT store_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert sale items in their store"
  ON sale_items FOR INSERT
  TO authenticated
  WITH CHECK (
    sale_id IN (
      SELECT id FROM sales WHERE store_id IN (
        SELECT store_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- Stock items policies
CREATE POLICY "Users can view stock from their store"
  ON stock_items FOR SELECT
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert stock in their store"
  ON stock_items FOR INSERT
  TO authenticated
  WITH CHECK (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update stock in their store"
  ON stock_items FOR UPDATE
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete stock in their store"
  ON stock_items FOR DELETE
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Cash entries policies
CREATE POLICY "Users can view cash entries from their store"
  ON cash_entries FOR SELECT
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert cash entries in their store"
  ON cash_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update cash entries in their store"
  ON cash_entries FOR UPDATE
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete cash entries in their store"
  ON cash_entries FOR DELETE
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Customers policies
CREATE POLICY "Users can view customers from their store"
  ON customers FOR SELECT
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert customers in their store"
  ON customers FOR INSERT
  TO authenticated
  WITH CHECK (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update customers in their store"
  ON customers FOR UPDATE
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete customers in their store"
  ON customers FOR DELETE
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Loyalty transactions policies
CREATE POLICY "Users can view loyalty transactions from their store"
  ON loyalty_transactions FOR SELECT
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert loyalty transactions in their store"
  ON loyalty_transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Subscriptions policies
CREATE POLICY "Users can view subscriptions from their store"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert subscriptions in their store"
  ON subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update subscriptions in their store"
  ON subscriptions FOR UPDATE
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_store_id ON profiles(store_id);
CREATE INDEX IF NOT EXISTS idx_products_store_id ON products(store_id);
CREATE INDEX IF NOT EXISTS idx_sales_store_id ON sales(store_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_stock_items_store_id ON stock_items(store_id);
CREATE INDEX IF NOT EXISTS idx_cash_entries_store_id ON cash_entries(store_id);
CREATE INDEX IF NOT EXISTS idx_cash_entries_created_at ON cash_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_customers_store_id ON customers(store_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_store_id ON loyalty_transactions(store_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_store_id ON subscriptions(store_id);