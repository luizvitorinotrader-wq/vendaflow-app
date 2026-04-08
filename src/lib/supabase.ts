import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { env } from './env';

if (import.meta.env.DEV) {
  console.log('🔧 Initializing Supabase client with URL:', env.supabaseUrl);
}

export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
