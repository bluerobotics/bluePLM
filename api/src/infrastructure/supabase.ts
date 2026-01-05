/**
 * Supabase Client Factory
 *
 * Provides functions for creating Supabase clients with different authentication contexts.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

/**
 * Creates a Supabase client, optionally with a user's access token for RLS.
 *
 * @param accessToken - User's JWT access token (optional)
 * @returns Configured SupabaseClient
 */
export function createSupabaseClient(accessToken?: string): SupabaseClient {
  const options: Parameters<typeof createClient>[2] = {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  };

  if (accessToken) {
    options.global = {
      headers: { Authorization: `Bearer ${accessToken}` },
    };
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_KEY, options);
}

/**
 * Creates a Supabase admin client using the service role key.
 * Use this for operations that bypass RLS (e.g., signed URLs).
 *
 * @returns SupabaseClient with service role privileges
 * @throws Error if SUPABASE_SERVICE_KEY is not configured
 */
export function createSupabaseAdminClient(): SupabaseClient {
  if (!env.SUPABASE_SERVICE_KEY) {
    throw new Error(
      'Supabase admin not configured. Set SUPABASE_SERVICE_KEY environment variable.'
    );
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Check database connectivity by running a simple query
 */
export async function checkDatabaseHealth(): Promise<{
  status: 'healthy' | 'unhealthy';
  latencyMs?: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    const client = createSupabaseClient();
    const { error } = await client.from('organizations').select('id').limit(1);
    if (error) {
      return { status: 'unhealthy', error: error.message };
    }
    return { status: 'healthy', latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: 'unhealthy',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
