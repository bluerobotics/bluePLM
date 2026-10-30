/**
 * Supabase Client Factory
 *
 * Provides functions for creating Supabase clients with different authentication contexts.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { env } from '../config/env.js'

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
  }

  if (accessToken) {
    options.global = {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_KEY, options)
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
    throw new Error('Supabase admin not configured. Set SUPABASE_SERVICE_KEY environment variable.')
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * Check database connectivity.
 *
 * Never reads a table with the anon key: 5.0 revokes anon's table grants (security baseline I6). With the service
 * key configured it calls `schema_release_version()`, a round trip through PostgREST to Postgres that reads no
 * table; without it, it asks the auth service, which shares the same database, for its own health.
 */
export async function checkDatabaseHealth(): Promise<{
  status: 'healthy' | 'unhealthy'
  latencyMs?: number
  error?: string
}> {
  const start = Date.now()
  try {
    if (env.SUPABASE_SERVICE_KEY) {
      const { error } = await createSupabaseAdminClient().rpc('schema_release_version')
      if (error) return { status: 'unhealthy', error: error.message }
    } else {
      const response = await fetch(`${env.SUPABASE_URL}/auth/v1/health`, {
        headers: { apikey: env.SUPABASE_KEY },
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) return { status: 'unhealthy', error: `auth health ${response.status}` }
    }
    return { status: 'healthy', latencyMs: Date.now() - start }
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
