export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type ProductWithCategory = Database['public']['Tables']['products']['Row'] & {
  category_structured?: Database['public']['Tables']['product_categories']['Row'] | null;
};

export type CategoryOption = {
  id: string;
  name: string;
};

export interface Database {
  public: {
    Tables: {
      plans: {
        Row: {
          id: string
          name: string
          display_name: string
          price_monthly: number
          description: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          display_name: string
          price_monthly: number
          description?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          display_name?: string
          price_monthly?: number
          description?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          store_id: string | null
          role: 'super_admin' | 'owner' | 'manager' | 'cashier'
          is_system_admin: boolean
          created_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          store_id?: string | null
          role?: 'super_admin' | 'owner' | 'manager' | 'cashier'
          is_system_admin?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          store_id?: string | null
          role?: 'super_admin' | 'owner' | 'manager' | 'cashier'
          is_system_admin?: boolean
          created_at?: string
        }
      }
      stores: {
        Row: {
          id: string
          name: string
          owner_id: string
          phone: string | null
          address: string | null
          plan: 'starter' | 'pro' | 'premium'
          trial_ends_at: string
          status: 'active' | 'inactive' | 'trial'
          subscription_status: 'trial' | 'active' | 'cancelled' | 'overdue'
          subscription_ends_at: string | null
          is_blocked: boolean
          plan_name: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          owner_id: string
          phone?: string | null
          address?: string | null
          plan?: 'starter' | 'professional' | 'premium'
          trial_ends_at?: string
          status?: 'active' | 'inactive' | 'trial'
          subscription_status?: 'trial' | 'active' | 'cancelled' | 'overdue'
          subscription_ends_at?: string | null
          is_blocked?: boolean
          plan_name?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          owner_id?: string
          phone?: string | null
          address?: string | null
          plan?: 'starter' | 'professional' | 'premium'
          trial_ends_at?: string
          status?: 'active' | 'inactive' | 'trial'
          subscription_status?: 'trial' | 'active' | 'cancelled' | 'overdue'
          subscription_ends_at?: string | null
          is_blocked?: boolean
          plan_name?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          created_at?: string
        }
      }
      products: {
        Row: {
          id: string
          store_id: string
          name: string
          /**
           * @deprecated LEGACY FIELD - DO NOT USE
           * This field will be removed in a future migration.
           * Use category_id + join with product_categories instead.
           * @see product_categories table
           */
          category: string
          category_id: string | null
          price: number
          cost: number
          stock_quantity: number
          min_stock: number
          active: boolean
          pricing_type: 'unit' | 'weight'
          price_per_kg: number | null
          stock_item_id: string | null
          /**
           * @deprecated LEGACY FIELD - Use stock_deduction_mode + stock_deduction_multiplier instead
           */
          unit_multiplier: number | null
          stock_deduction_mode: 'none' | 'by_quantity' | 'by_weight' | 'by_multiplier'
          stock_deduction_multiplier: number | null
          created_at: string
        }
        Insert: {
          id?: string
          store_id: string
          name: string
          /**
           * @deprecated LEGACY FIELD - DO NOT USE
           * This field will be removed in a future migration.
           * Use category_id instead.
           */
          category?: string
          category_id?: string | null
          price?: number
          cost?: number
          stock_quantity?: number
          min_stock?: number
          active?: boolean
          pricing_type?: 'unit' | 'weight'
          price_per_kg?: number | null
          stock_item_id?: string | null
          /**
           * @deprecated LEGACY FIELD - Use stock_deduction_mode + stock_deduction_multiplier instead
           */
          unit_multiplier?: number | null
          stock_deduction_mode?: 'none' | 'by_quantity' | 'by_weight' | 'by_multiplier'
          stock_deduction_multiplier?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          name?: string
          /**
           * @deprecated LEGACY FIELD - DO NOT USE
           * This field will be removed in a future migration.
           * Use category_id instead.
           */
          category?: string
          category_id?: string | null
          price?: number
          cost?: number
          stock_quantity?: number
          min_stock?: number
          active?: boolean
          pricing_type?: 'unit' | 'weight'
          price_per_kg?: number | null
          stock_item_id?: string | null
          /**
           * @deprecated LEGACY FIELD - Use stock_deduction_mode + stock_deduction_multiplier instead
           */
          unit_multiplier?: number | null
          stock_deduction_mode?: 'none' | 'by_quantity' | 'by_weight' | 'by_multiplier'
          stock_deduction_multiplier?: number | null
          created_at?: string
        }
      }
      product_categories: {
        Row: {
          id: string
          store_id: string
          name: string
          description: string | null
          display_order: number
          is_active: boolean
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          store_id: string
          name: string
          description?: string | null
          display_order?: number
          is_active?: boolean
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          name?: string
          description?: string | null
          display_order?: number
          is_active?: boolean
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
      }
      feature_flags: {
        Row: {
          id: string
          feature_name: string
          store_id: string | null
          is_enabled: boolean
          enabled_at: string | null
          disabled_at: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          feature_name: string
          store_id?: string | null
          is_enabled?: boolean
          enabled_at?: string | null
          disabled_at?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          feature_name?: string
          store_id?: string | null
          is_enabled?: boolean
          enabled_at?: string | null
          disabled_at?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
      }
      store_users: {
        Row: {
          id: string
          store_id: string
          user_id: string
          role: 'owner' | 'manager' | 'staff'
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          store_id: string
          user_id: string
          role: 'owner' | 'manager' | 'staff'
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          user_id?: string
          role?: 'owner' | 'manager' | 'staff'
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      tables: {
        Row: {
          id: string
          store_id: string
          table_number: string
          status: 'available' | 'occupied' | 'reserved'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          store_id: string
          table_number: string
          status?: 'available' | 'occupied' | 'reserved'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          table_number?: string
          status?: 'available' | 'occupied' | 'reserved'
          created_at?: string
          updated_at?: string
        }
      }
      tabs: {
        Row: {
          id: string
          store_id: string
          table_id: string | null
          customer_name: string | null
          status: 'open' | 'closed'
          total_amount: number
          opened_at: string
          closed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          store_id: string
          table_id?: string | null
          customer_name?: string | null
          status?: 'open' | 'closed'
          total_amount?: number
          opened_at?: string
          closed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          table_id?: string | null
          customer_name?: string | null
          status?: 'open' | 'closed'
          total_amount?: number
          opened_at?: string
          closed_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      tab_items: {
        Row: {
          id: string
          tab_id: string
          product_id: string
          quantity: number
          unit_price: number
          total_price: number
          weight: number | null
          created_at: string
        }
        Insert: {
          id?: string
          tab_id: string
          product_id: string
          quantity?: number
          unit_price: number
          total_price: number
          weight?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          tab_id?: string
          product_id?: string
          quantity?: number
          unit_price?: number
          total_price?: number
          weight?: number | null
          created_at?: string
        }
      }
      sales: {
        Row: {
          id: string
          store_id: string
          customer_id: string | null
          total_amount: number
          payment_method: 'cash' | 'credit' | 'debit' | 'pix'
          created_at: string
        }
        Insert: {
          id?: string
          store_id: string
          customer_id?: string | null
          total_amount?: number
          payment_method: 'cash' | 'credit' | 'debit' | 'pix'
          created_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          customer_id?: string | null
          total_amount?: number
          payment_method?: 'cash' | 'credit' | 'debit' | 'pix'
          created_at?: string
        }
      }
      sale_items: {
        Row: {
          id: string
          sale_id: string
          product_id: string
          quantity: number
          unit_price: number
          total_price: number
          weight: number | null
          created_at: string
        }
        Insert: {
          id?: string
          sale_id: string
          product_id: string
          quantity?: number
          unit_price: number
          total_price: number
          weight?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          sale_id?: string
          product_id?: string
          quantity?: number
          unit_price?: number
          total_price?: number
          weight?: number | null
          created_at?: string
        }
      }
      stock_items: {
        Row: {
          id: string
          store_id: string
          name: string
          unit: 'kg' | 'l' | 'un'
          current_stock: number
          min_stock: number
          created_at: string
        }
        Insert: {
          id?: string
          store_id: string
          name: string
          unit: 'kg' | 'l' | 'un'
          current_stock?: number
          min_stock?: number
          created_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          name?: string
          unit?: 'kg' | 'l' | 'un'
          current_stock?: number
          min_stock?: number
          created_at?: string
        }
      }
      cash_entries: {
        Row: {
          id: string
          store_id: string
          type: 'entry' | 'exit'
          amount: number
          description: string
          category: 'sale' | 'expense' | 'withdrawal' | 'supply' | 'other'
          created_at: string
        }
        Insert: {
          id?: string
          store_id: string
          type: 'entry' | 'exit'
          amount: number
          description: string
          category: 'sale' | 'expense' | 'withdrawal' | 'supply' | 'other'
          created_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          type?: 'entry' | 'exit'
          amount?: number
          description?: string
          category?: 'sale' | 'expense' | 'withdrawal' | 'supply' | 'other'
          created_at?: string
        }
      }
      customers: {
        Row: {
          id: string
          store_id: string
          name: string
          phone: string | null
          notes: string | null
          loyalty_points: number
          created_at: string
        }
        Insert: {
          id?: string
          store_id: string
          name: string
          phone?: string | null
          notes?: string | null
          loyalty_points?: number
          created_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          name?: string
          phone?: string | null
          notes?: string | null
          loyalty_points?: number
          created_at?: string
        }
      }
      loyalty_transactions: {
        Row: {
          id: string
          store_id: string
          customer_id: string
          sale_id: string | null
          points: number
          type: 'earned' | 'redeemed'
          created_at: string
        }
        Insert: {
          id?: string
          store_id: string
          customer_id: string
          sale_id?: string | null
          points: number
          type: 'earned' | 'redeemed'
          created_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          customer_id?: string
          sale_id?: string | null
          points?: number
          type?: 'earned' | 'redeemed'
          created_at?: string
        }
      }
      subscriptions: {
        Row: {
          id: string
          store_id: string
          plan: 'starter' | 'pro' | 'premium'
          status: 'active' | 'cancelled' | 'expired'
          starts_at: string
          ends_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          store_id: string
          plan: 'starter' | 'pro' | 'premium'
          status?: 'active' | 'cancelled' | 'expired'
          starts_at?: string
          ends_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          plan?: 'starter' | 'professional' | 'premium'
          status?: 'active' | 'cancelled' | 'expired'
          starts_at?: string
          ends_at?: string | null
          created_at?: string
        }
      }
      cash_sessions: {
        Row: {
          id: string
          store_id: string
          opened_by: string | null
          opening_amount: number
          opened_at: string
          closed_at: string | null
          closing_amount_reported: number | null
          expected_amount: number | null
          difference_amount: number | null
          status: 'open' | 'closed'
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          store_id: string
          opened_by?: string | null
          opening_amount?: number
          opened_at?: string
          closed_at?: string | null
          closing_amount_reported?: number | null
          expected_amount?: number | null
          difference_amount?: number | null
          status?: 'open' | 'closed'
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          opened_by?: string | null
          opening_amount?: number
          opened_at?: string
          closed_at?: string | null
          closing_amount_reported?: number | null
          expected_amount?: number | null
          difference_amount?: number | null
          status?: 'open' | 'closed'
          notes?: string | null
          created_at?: string
        }
      }
      product_recipe_items: {
        Row: {
          id: string
          store_id: string
          product_id: string
          stock_item_id: string
          quantity_used: number
          unit: 'kg' | 'l' | 'un'
          created_at: string
        }
        Insert: {
          id?: string
          store_id: string
          product_id: string
          stock_item_id: string
          quantity_used?: number
          unit?: 'kg' | 'l' | 'un'
          created_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          product_id?: string
          stock_item_id?: string
          quantity_used?: number
          unit?: 'kg' | 'l' | 'un'
          created_at?: string
        }
      }
      stock_movements: {
        Row: {
          id: string
          store_id: string
          stock_item_id: string
          type: 'sale' | 'adjustment' | 'supply' | 'loss'
          quantity: number
          previous_stock: number
          new_stock: number
          reason: string
          reference_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          store_id: string
          stock_item_id: string
          type: 'sale' | 'adjustment' | 'supply' | 'loss'
          quantity: number
          previous_stock: number
          new_stock: number
          reason: string
          reference_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          stock_item_id?: string
          type?: 'sale' | 'adjustment' | 'supply' | 'loss'
          quantity?: number
          previous_stock?: number
          new_stock?: number
          reason?: string
          reference_id?: string | null
          created_at?: string
        }
      }
    }
  }
}
