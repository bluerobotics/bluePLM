/**
 * Extension Network API Implementation
 * 
 * Provides sandboxed network operations for extensions.
 * All requests are logged and subject to declared domain restrictions.
 * 
 * @module extensions/api/network
 */

import type {
  NetworkAPI,
  FetchOptions,
  FetchResponse,
  HttpMethod,
} from './types'
import { checkPermission } from './permissions'

// ============================================
// IPC Channel Constants
// ============================================

/**
 * IPC channels used by the Network API.
 */
export const NETWORK_IPC_CHANNELS = {
  CALL_ORG_API: 'extension:network:callOrgApi',
  CALL_STORE_API: 'extension:network:callStoreApi',
  FETCH: 'extension:network:fetch',
} as const

// ============================================
// Configuration
// ============================================

/**
 * Default timeout for network requests (30 seconds).
 */
const DEFAULT_TIMEOUT_MS = 30000

/**
 * Maximum request body size (1MB).
 */
const MAX_REQUEST_SIZE = 1024 * 1024

// ============================================
// Helper Functions
// ============================================

/**
 * Send an IPC message to the main process.
 */
async function sendIPC<T>(channel: string, ...args: unknown[]): Promise<T> {
  if (typeof window !== 'undefined' && (window as any).__extensionIPC) {
    return (window as any).__extensionIPC.invoke(channel, ...args)
  }
  throw new Error(`IPC not available: ${channel}`)
}

/**
 * Serialize request body for IPC transmission.
 */
function serializeBody(body: unknown): string | undefined {
  if (body === undefined) return undefined
  if (typeof body === 'string') return body
  return JSON.stringify(body)
}

/**
 * Check if a URL domain is in the allowed list.
 */
function isDomainAllowed(url: string, allowedDomains: string[]): boolean {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    
    return allowedDomains.some((domain) => {
      const normalizedDomain = domain.toLowerCase()
      // Exact match or subdomain match
      return hostname === normalizedDomain || 
             hostname.endsWith('.' + normalizedDomain)
    })
  } catch {
    return false
  }
}

/**
 * Validate request size.
 */
function validateRequestSize(body: string | undefined): void {
  if (body && body.length > MAX_REQUEST_SIZE) {
    throw new Error(`Request body exceeds maximum size of ${MAX_REQUEST_SIZE} bytes`)
  }
}

// ============================================
// Network API Implementation
// ============================================

/**
 * Create the Network API implementation for an extension.
 * 
 * @param extensionId - The ID of the extension using this API
 * @param grantedPermissions - Permissions granted to the extension
 * @param allowedDomains - List of allowed external domains
 * @returns Object containing all network methods
 * 
 * @example
 * ```typescript
 * const network = createNetworkAPI('my-extension', ['network:orgApi'], ['api.example.com'])
 * const response = await network.callOrgApi<DataType>('/my-endpoint', { method: 'POST' })
 * ```
 */
export function createNetworkAPI(
  extensionId: string,
  grantedPermissions: string[],
  allowedDomains: string[] = []
): NetworkAPI {
  /**
   * Call the organization's API server.
   */
  async function callOrgApi<T>(
    endpoint: string,
    options: FetchOptions = {}
  ): Promise<FetchResponse<T>> {
    checkPermission(extensionId, 'callOrgApi', grantedPermissions)
    
    const method: HttpMethod = options.method || 'GET'
    const body = serializeBody(options.body)
    validateRequestSize(body)
    
    const timeout = options.timeout || DEFAULT_TIMEOUT_MS
    
    const result = await sendIPC<FetchResponse<T>>(
      NETWORK_IPC_CHANNELS.CALL_ORG_API,
      {
        extensionId,
        endpoint,
        method,
        headers: options.headers,
        body,
        timeout,
      }
    )
    
    return result
  }

  /**
   * Call the Extension Store API.
   */
  async function callStoreApi<T>(endpoint: string): Promise<FetchResponse<T>> {
    checkPermission(extensionId, 'callStoreApi', grantedPermissions)
    
    const result = await sendIPC<FetchResponse<T>>(
      NETWORK_IPC_CHANNELS.CALL_STORE_API,
      {
        extensionId,
        endpoint,
      }
    )
    
    return result
  }

  /**
   * Make an HTTP request to an external URL.
   */
  async function fetchExternal<T>(
    url: string,
    options: FetchOptions = {}
  ): Promise<FetchResponse<T>> {
    checkPermission(extensionId, 'fetch', grantedPermissions)
    
    // Validate domain is allowed
    if (!isDomainAllowed(url, allowedDomains)) {
      throw new Error(
        `Domain not allowed. Extension '${extensionId}' can only access: ${
          allowedDomains.join(', ') || '(none declared)'
        }`
      )
    }
    
    const method: HttpMethod = options.method || 'GET'
    const body = serializeBody(options.body)
    validateRequestSize(body)
    
    const timeout = options.timeout || DEFAULT_TIMEOUT_MS
    
    const result = await sendIPC<FetchResponse<T>>(
      NETWORK_IPC_CHANNELS.FETCH,
      {
        extensionId,
        url,
        method,
        headers: options.headers,
        body,
        timeout,
      }
    )
    
    return result
  }

  return {
    callOrgApi,
    callStoreApi,
    fetch: fetchExternal,
  }
}

// ============================================
// Response Helpers
// ============================================

/**
 * Check if a response indicates success (2xx status).
 */
export function isSuccessResponse(response: FetchResponse): boolean {
  return response.status >= 200 && response.status < 300
}

/**
 * Create an error from a failed response.
 */
export function createResponseError(response: FetchResponse): Error {
  const error = new Error(`HTTP ${response.status}: ${response.statusText}`)
  ;(error as any).response = response
  return error
}

// ============================================
// Export Types
// ============================================

export type { NetworkAPI, FetchOptions, FetchResponse, HttpMethod }
