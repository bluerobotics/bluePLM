/**
 * Extension HTTP Request Logger
 * 
 * Logs all HTTP requests made by extension handlers for security auditing.
 * 
 * @module extensions/http-logger
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * HTTP log entry structure.
 */
export interface HttpLogEntry {
  org_id: string
  extension_id: string
  method: string
  url: string
  status: number
  duration_ms: number
  request_size: number
  response_size: number
  error?: string
}

/**
 * Log an HTTP request made by an extension.
 * 
 * This is a fire-and-forget operation - errors are logged but don't
 * affect the extension handler.
 */
export async function logHttpRequest(
  supabase: SupabaseClient,
  entry: HttpLogEntry
): Promise<void> {
  try {
    await supabase
      .from('extension_http_log')
      .insert({
        ...entry,
        timestamp: new Date().toISOString()
      })
  } catch (error) {
    // Log errors but don't throw - logging is best-effort
    console.error('[ExtensionHttpLogger] Failed to log request:', error)
  }
}

/**
 * Get HTTP logs for an extension.
 * 
 * @param supabase - Supabase client
 * @param orgId - Organization ID
 * @param extensionId - Extension ID
 * @param limit - Maximum number of entries to return
 * @returns Array of log entries
 */
export async function getHttpLogs(
  supabase: SupabaseClient,
  orgId: string,
  extensionId: string,
  limit = 100
): Promise<HttpLogEntry[]> {
  const { data, error } = await supabase
    .from('extension_http_log')
    .select('*')
    .eq('org_id', orgId)
    .eq('extension_id', extensionId)
    .order('timestamp', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`Failed to get HTTP logs: ${error.message}`)
  }

  return data ?? []
}

/**
 * Delete old HTTP logs for an extension.
 * 
 * @param supabase - Supabase client
 * @param orgId - Organization ID
 * @param extensionId - Extension ID
 * @param olderThanDays - Delete logs older than this many days
 */
export async function cleanupHttpLogs(
  supabase: SupabaseClient,
  orgId: string,
  extensionId: string,
  olderThanDays = 30
): Promise<void> {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

  await supabase
    .from('extension_http_log')
    .delete()
    .eq('org_id', orgId)
    .eq('extension_id', extensionId)
    .lt('timestamp', cutoffDate.toISOString())
}
