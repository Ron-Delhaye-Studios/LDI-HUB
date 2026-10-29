import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey } from './public-config';

// Browser-only client. Do not use these session helpers to authorize server work.
let client: SupabaseClient | undefined;
export function getSupabase() {
  client ??= createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}
