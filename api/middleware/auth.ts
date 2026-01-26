/**
 * BluePLM API Authentication Middleware
 * 
 * Fastify plugin that validates JWT tokens and attaches user profile to requests.
 * 
 * Security note: Verbose logging is disabled by default. Do not log tokens,
 * full user IDs, or email addresses in production.
 */

import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import fp from 'fastify-plugin'
import { createSupabaseClient } from '../src/infrastructure/supabase.js'
import type { UserProfile } from '../types.js'

/**
 * Truncate a UUID for safe logging (shows first 8 characters)
 */
function truncateId(id: string): string {
  return id.length > 8 ? `${id.substring(0, 8)}...` : id
}

const authPluginImpl: FastifyPluginAsync = async (fastify) => {
  // Decorate request with user, supabase client, and access token
  fastify.decorateRequest('user', null)
  fastify.decorateRequest('supabase', null)
  fastify.decorateRequest('accessToken', null)
  
  // Add authenticate method to fastify instance
  fastify.decorate('authenticate', async function(
    request: FastifyRequest, 
    reply: FastifyReply
  ): Promise<void> {
    try {
      const authHeader = request.headers.authorization
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        fastify.log.warn('[Auth] Missing or invalid auth header')
        reply.code(401).send({ 
          error: 'Unauthorized',
          message: 'Missing or invalid Authorization header'
        })
        throw new Error('Auth: Missing header')
      }
      
      const token = authHeader.substring(7)
      
      if (!token || token === 'undefined' || token === 'null') {
        fastify.log.warn('[Auth] Empty or invalid token string')
        reply.code(401).send({ 
          error: 'Unauthorized',
          message: 'Invalid or missing access token'
        })
        throw new Error('Auth: Invalid token string')
      }
      
      const supabase = createSupabaseClient(token)
      const { data: { user }, error } = await supabase.auth.getUser(token)
      
      if (error || !user) {
        fastify.log.warn('[Auth] Token verification failed')
        reply.code(401).send({ 
          error: 'Invalid token',
          message: error?.message || 'Token verification failed',
          hint: 'Ensure API server SUPABASE_URL matches your app\'s Supabase project'
        })
        throw new Error('Auth: Token verification failed')
      }
      
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('id, email, role, org_id, full_name')
        .eq('id', user.id)
        .single()
      
      if (profileError || !profile) {
        fastify.log.warn({ msg: '[Auth] Profile lookup failed', userId: truncateId(user.id) })
        reply.code(401).send({ 
          error: 'Profile not found',
          message: 'User profile does not exist'
        })
        throw new Error('Auth: Profile not found')
      }
      
      if (!profile.org_id) {
        fastify.log.warn({ msg: '[Auth] User has no organization', userId: truncateId(user.id) })
        reply.code(403).send({ 
          error: 'No organization',
          message: 'User is not a member of any organization'
        })
        throw new Error('Auth: No organization')
      }
      
      // Success - set user on request
      request.user = profile as UserProfile
      request.supabase = supabase
      request.accessToken = token
      
      // Log success with minimal info (no email, truncated ID)
      fastify.log.debug({ msg: '[Auth] Authenticated', userId: truncateId(profile.id) })
    } catch (err) {
      // Re-throw to stop the request lifecycle (error already logged above)
      throw err
    }
  })
}

// Wrap with fastify-plugin to make decorators available to parent scope
const authPlugin = fp(authPluginImpl, {
  name: 'auth-plugin'
})

export default authPlugin
