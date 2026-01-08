/**
 * Extension Request Router
 * 
 * Routes incoming HTTP requests to the appropriate extension handler
 * and executes them in the V8 sandbox.
 * 
 * @module extensions/router
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { FastifyRequest, FastifyReply } from 'fastify'
import { getIsolatePool, type SandboxResult } from './sandbox.js'
import { createExtensionRuntime } from './runtime.js'
import { getLoader, type LoadedHandler } from './loader.js'
import { checkRateLimit, getRateLimitHeaders } from './ratelimit.js'
import { env } from '../config/env.js'
import type { ExtensionRequestContext, ExtensionUserContext } from './types.js'

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTER OPTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extension router configuration.
 */
export interface RouterOptions {
  /** Encryption key for secrets. Falls back to env.EXTENSION_ENCRYPTION_KEY */
  encryptionKey?: string
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Route an extension request to its handler.
 * 
 * @param request - Fastify request
 * @param reply - Fastify reply
 * @param supabase - Supabase client
 * @param orgId - Organization ID
 * @param user - Authenticated user (null for public endpoints)
 * @param options - Router options
 */
export async function routeExtensionRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  supabase: SupabaseClient,
  orgId: string,
  user: ExtensionUserContext | null,
  options: RouterOptions = {}
): Promise<void> {
  const startTime = Date.now()
  
  // Parse the extension path: /extensions/{extensionId}/{path}
  const pathMatch = request.url.match(/^\/extensions\/([^/?]+)(?:\/([^?]*))?/)
  
  if (!pathMatch) {
    reply.code(404).send({
      error: 'Not Found',
      message: 'Invalid extension path'
    })
    return
  }

  const [, extensionId, handlerPath = ''] = pathMatch

  // Get loader and ensure extensions are loaded
  const loader = getLoader(supabase, orgId)
  if (!loader.isLoaded()) {
    await loader.loadAll()
  }

  // Find the handler
  const handler = loader.getHandler(request.method, extensionId, handlerPath)
  
  if (!handler) {
    reply.code(404).send({
      error: 'Not Found',
      message: `No handler found for ${request.method} /extensions/${extensionId}/${handlerPath}`
    })
    return
  }

  // Check authentication for non-public endpoints
  if (!handler.public && !user) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Authentication required for this endpoint'
    })
    return
  }

  // Check rate limit
  const bodySize = request.headers['content-length'] 
    ? parseInt(request.headers['content-length'], 10) 
    : 0
  
  const rateLimitResult = checkRateLimit(orgId, extensionId, bodySize)
  const rateLimitHeaders = getRateLimitHeaders(rateLimitResult)
  
  // Set rate limit headers
  for (const [key, value] of Object.entries(rateLimitHeaders)) {
    reply.header(key, value)
  }

  if (!rateLimitResult.allowed) {
    reply.code(429).send({
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Retry after ${rateLimitResult.retryAfter} seconds.`,
      retryAfter: rateLimitResult.retryAfter
    })
    return
  }

  // Execute the handler
  const result = await executeHandler(
    handler,
    request,
    supabase,
    orgId,
    user,
    options
  )

  // Send response
  const executionTime = Date.now() - startTime
  reply.header('X-Extension-Execution-Time', String(executionTime))

  if (result.success && result.response) {
    const { status, headers, body } = result.response
    
    for (const [key, value] of Object.entries(headers)) {
      reply.header(key, value)
    }
    
    reply.code(status).send(body)
  } else {
    const status = result.errorCode === 'TIMEOUT' ? 504 :
                   result.errorCode === 'MEMORY_EXCEEDED' ? 503 : 500
    
    reply.code(status).send({
      error: result.errorCode ?? 'EXECUTION_ERROR',
      message: result.error ?? 'Handler execution failed'
    })
  }
}

/**
 * Execute an extension handler in the sandbox.
 */
async function executeHandler(
  handler: LoadedHandler,
  request: FastifyRequest,
  supabase: SupabaseClient,
  orgId: string,
  user: ExtensionUserContext | null,
  options: RouterOptions
): Promise<SandboxResult> {
  // Build request context
  const requestContext: ExtensionRequestContext = {
    method: request.method,
    path: request.url,
    body: request.body,
    headers: Object.fromEntries(
      Object.entries(request.headers)
        .filter(([, v]) => typeof v === 'string')
        .map(([k, v]) => [k, v as string])
    ),
    query: request.query as Record<string, string>,
    params: request.params as Record<string, string>
  }

  // Get encryption key
  const encryptionKey = options.encryptionKey ?? 
    (env as Record<string, unknown>).EXTENSION_ENCRYPTION_KEY as string ??
    'default-key-change-in-production'

  // Create runtime API
  const apiCallable = createExtensionRuntime({
    orgId,
    extensionId: handler.extensionId,
    manifest: handler.manifest,
    supabase,
    request: requestContext,
    user,
    encryptionKey
  })

  // Execute in sandbox
  const pool = getIsolatePool()
  return pool.execute(
    handler.extensionId,
    handler.code,
    apiCallable as unknown as import('./runtime.js').ExtensionServerAPI,
    handler.manifest
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// FASTIFY PLUGIN HELPER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a Fastify route handler for extension requests.
 * 
 * @param authenticate - Authentication function
 * @param options - Router options
 */
export function createExtensionRouteHandler(
  authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>,
  options: RouterOptions = {}
) {
  return async function extensionRouteHandler(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    // Try to authenticate (may be optional for public endpoints)
    let user: ExtensionUserContext | null = null
    
    try {
      await authenticate(request, reply)
      
      if (request.user) {
        user = {
          id: request.user.id,
          email: request.user.email,
          orgId: request.user.org_id!,
          role: request.user.role
        }
      }
    } catch {
      // Authentication failed - will be handled by route if required
    }

    if (!request.user && !user) {
      // No authenticated user - check if this is a public endpoint
      // The router will handle auth check for non-public endpoints
    }

    const orgId = user?.orgId ?? (request.headers['x-org-id'] as string)
    
    if (!orgId) {
      reply.code(400).send({
        error: 'Bad Request',
        message: 'Organization ID required'
      })
      return
    }

    const supabase = request.supabase ?? (await import('../infrastructure/supabase.js')).createSupabaseClient()

    await routeExtensionRequest(
      request,
      reply,
      supabase,
      orgId,
      user,
      options
    )
  }
}
