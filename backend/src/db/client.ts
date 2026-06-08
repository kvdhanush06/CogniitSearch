import { type SupabaseClient } from '@supabase/supabase-js';
import { supabase, supabaseAdmin } from '../config/supabase.js';

export type DatabaseClient = SupabaseClient;

export const TABLES = {
  USERS: 'users',
  CONVERSATIONS: 'conversations',
  MESSAGES: 'messages',
  SOURCES: 'sources',
} as const;

export type TableName = (typeof TABLES)[keyof typeof TABLES];

/**
 * Returns the admin Supabase client for privileged server-side operations.
 */
export function getClient(): DatabaseClient {
  return supabaseAdmin;
}

/**
 * Returns the public (anon) Supabase client for operations scoped to user auth.
 */
export function getPublicClient(): DatabaseClient {
  return supabase;
}

export { supabase, supabaseAdmin };
