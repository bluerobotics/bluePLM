/**
 * Extension System Types for API Server
 * 
 * Server-side type definitions for extension sandbox execution.
 * These complement the client-side types in src/lib/extensions/types.ts
 * 
 * @module extensions/types
 */

// Re-export relevant types from client-side definitions
// Note: In production, these would be imported from a shared package
export type ExtensionCategory = 'sandboxed' | 'native'

export type ServerPermission =
  | 'storage:database'
  | 'secrets:read'
  | 'secrets:write'
  | 'http:fetch'
  | `http:domain:${string}`

export interface ApiRouteContribution {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  handler: string
  public?: boolean
  rateLimit?: number
}

export interface ExtensionPermissions {
  client?: string[]
  server?: ServerPermission[]
}

export interface ExtensionContributions {
  views?: unknown[]
  commands?: unknown[]
  settings?: unknown[]
  apiRoutes?: ApiRouteContribution[]
  configuration?: unknown
}

export interface ExtensionManifest {
  id: string
  name: string
  version: string
  publisher: string
  description?: string
  icon?: string
  repository?: string
  license: string
  category?: ExtensionCategory
  engines: { blueplm: string }
  main?: string
  serverMain?: string
  activationEvents: string[]
  contributes: ExtensionContributions
  permissions: ExtensionPermissions
}

// ═══════════════════════════════════════════════════════════════════════════════
// INSTALLED EXTENSION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Installed extension record from database.
 */
export interface InstalledExtension {
  org_id: string
  extension_id: string
  version: string
  installed_at: string
  installed_by: string
  pinned_version: string | null
  enabled: boolean
  manifest: ExtensionManifest
  handlers: Record<string, string>
  allowed_domains: string[]
}

// ═══════════════════════════════════════════════════════════════════════════════
// REQUEST CONTEXT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * HTTP request context for extension handlers.
 */
export interface ExtensionRequestContext {
  method: string
  path: string
  body: unknown
  headers: Record<string, string>
  query: Record<string, string>
  params: Record<string, string>
}

/**
 * User context for authenticated requests.
 */
export interface ExtensionUserContext {
  id: string
  email: string
  orgId: string
  role: string
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTENSION STORAGE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extension storage record.
 */
export interface ExtensionStorageRecord {
  org_id: string
  extension_id: string
  key: string
  value: unknown
  updated_at: string
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTENSION SECRETS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extension secret record (encrypted value not exposed).
 */
export interface ExtensionSecretRecord {
  org_id: string
  extension_id: string
  name: string
  created_at: string
  updated_at: string
}

/**
 * Secret access audit log entry.
 */
export interface SecretAccessLog {
  id: string
  org_id: string
  extension_id: string
  secret_name: string
  action: 'read' | 'write' | 'delete'
  accessed_by: string
  accessed_at: string
}

// ═══════════════════════════════════════════════════════════════════════════════
// RATE LIMITING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Rate limit configuration.
 */
export interface RateLimitConfig {
  /** Requests per minute. Default: 100 */
  requestsPerMinute: number
  /** Maximum request body size in bytes. Default: 1MB */
  requestSizeBytes: number
}

/**
 * Rate limit check result.
 */
export interface RateLimitResult {
  /** Whether request is allowed */
  allowed: boolean
  /** Remaining requests in current window */
  remaining: number
  /** Seconds until rate limit resets */
  resetIn: number
  /** Retry-After header value (if rate limited) */
  retryAfter?: number
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTENSION CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extension configuration per org.
 */
export interface ExtensionConfig {
  org_id: string
  extension_id: string
  config: Record<string, unknown>
  updated_at: string
  updated_by: string
}

// ═══════════════════════════════════════════════════════════════════════════════
// HTTP LOG
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * HTTP request log entry for extension activity.
 */
export interface ExtensionHttpLog {
  id: string
  org_id: string
  extension_id: string
  timestamp: string
  method: string
  url: string
  status: number
  duration_ms: number
  request_size: number
  response_size: number
  error?: string
}

// ═══════════════════════════════════════════════════════════════════════════════
// INSTALL REQUEST
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extension install request body.
 */
export interface InstallExtensionRequest {
  extensionId: string
  version: string
  manifest: ExtensionManifest
  handlers: Record<string, string>
  allowedDomains: string[]
}

/**
 * Extension uninstall request body.
 */
export interface UninstallExtensionRequest {
  extensionId: string
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTENSION STATS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extension usage statistics.
 */
export interface ExtensionStats {
  extension_id: string
  total_requests: number
  successful_requests: number
  failed_requests: number
  avg_response_time_ms: number
  storage_keys_count: number
  secrets_count: number
  last_request_at: string | null
}
