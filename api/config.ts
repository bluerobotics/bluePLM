/**
 * BluePLM API Configuration
 * 
 * Environment variables, constants, and factory functions.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load version from API's own package.json
const packageJsonPath = path.join(__dirname, 'package.json')
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))

// ============================================
// Configuration Constants
// ============================================

export const API_VERSION = packageJson.version || '0.0.0'
export const PORT = parseInt(process.env.API_PORT || process.env.PORT || '3001', 10)
export const HOST = process.env.API_HOST || '0.0.0.0' // 0.0.0.0 for cloud deployment
export const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
export const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
export const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '' // For signed URLs
export const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '100', 10)
export const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10)
export const SIGNED_URL_EXPIRY = 3600 // 1 hour

// CORS origins - configure via CORS_ORIGINS env var (comma-separated)
export const CORS_ORIGINS = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : true // Allow all in dev

// ============================================
// Supabase Client Factory
// ============================================

/**
 * Creates a Supabase client, optionally with a user's access token for RLS.
 * 
 * @param accessToken - User's JWT access token (optional)
 * @returns Configured SupabaseClient
 * @throws Error if SUPABASE_URL or SUPABASE_KEY are not configured
 */
export function createSupabaseClient(accessToken?: string): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Supabase not configured. Set SUPABASE_URL and SUPABASE_KEY environment variables.')
  }
  
  const options: Parameters<typeof createClient>[2] = {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
  
  if (accessToken) {
    options.global = {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  }
  
  return createClient(SUPABASE_URL, SUPABASE_KEY, options)
}

/**
 * Creates a Supabase admin client using the service role key.
 * Use this for operations that bypass RLS (e.g., signed URLs).
 * 
 * @returns SupabaseClient with service role privileges
 * @throws Error if SUPABASE_SERVICE_KEY is not configured
 */
export function createSupabaseAdminClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Supabase admin not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables.')
  }
  
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}
