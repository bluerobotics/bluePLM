/**
 * Google Drive Extension - Server Types
 * 
 * Type definitions for the server-side handlers.
 * These handlers run in a V8 isolate sandbox on the organization's API server.
 * 
 * Note: These types are copied from the API runtime types to avoid import issues
 * during app compilation. The actual implementation is provided by the API sandbox.
 * 
 * @module extensions/google-drive/server/types
 */

/**
 * HTTP request context available to extension handlers.
 */
export interface ExtensionRequestContext {
  /** HTTP method */
  method: string
  /** Request path */
  path: string
  /** Query parameters */
  query: Record<string, string>
  /** Request headers */
  headers: Record<string, string>
  /** Request body (parsed) */
  body: unknown
}

/**
 * Authenticated user context.
 */
export interface ExtensionUserContext {
  /** User ID */
  id: string
  /** User email */
  email: string
  /** Organization ID */
  orgId: string
  /** User role */
  role: string
}

/**
 * Extension handler response.
 */
export interface ExtensionResponse {
  type: 'json' | 'error' | 'redirect'
  data?: unknown
  message?: string
  url?: string
  status: number
}

/**
 * Server-side API available to extension handlers.
 * 
 * This is the primary interface extension code uses in sandbox execution.
 */
export interface ExtensionServerAPI {
  /**
   * Extension-scoped key-value storage.
   * Persisted to org's Supabase database.
   */
  storage: {
    get<T>(key: string): Promise<T | undefined>
    set<T>(key: string, value: T): Promise<void>
    delete(key: string): Promise<void>
    list(prefix?: string): Promise<string[]>
  }

  /**
   * Encrypted secrets storage.
   * Limited to 50 secrets, 10KB each. All access is audited.
   */
  secrets: {
    get(name: string): Promise<string | undefined>
    set(name: string, value: string): Promise<void>
    delete(name: string): Promise<void>
  }

  /**
   * HTTP client for external API calls.
   * Domain-restricted based on extension permissions.
   */
  http: {
    fetch(url: string, options?: RequestInit): Promise<Response>
  }

  /**
   * Current HTTP request context.
   */
  request: ExtensionRequestContext

  /**
   * Authenticated user context (null for public endpoints).
   */
  user: ExtensionUserContext | null

  /**
   * Response helpers for handler return values.
   */
  response: {
    json(data: unknown, status?: number): ExtensionResponse
    error(message: string, status?: number): ExtensionResponse
    redirect(url: string, status?: number): ExtensionResponse
  }
}
