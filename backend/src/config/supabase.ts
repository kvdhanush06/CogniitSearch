import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';

function createSupabaseClient(): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: false,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
}

function createSupabaseAdminClient(): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
}

/** Public Supabase client using the anon key */
export const supabase: SupabaseClient = createSupabaseClient();

/** Admin Supabase client using the service role key — use for privileged operations only */
export const supabaseAdmin: SupabaseClient = createSupabaseAdminClient();
