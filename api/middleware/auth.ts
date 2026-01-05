/**
 * BluePLM API Authentication Middleware
 * 
 * Fastify plugin that validates JWT tokens and attaches user profile to requests.
 */

import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import fp from 'fastify-plugin'
import { createSupabaseClient } from '../src/infrastructure/supabase.js'
import type { UserProfile } from '../types.js'

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
    console.log('>>> [Auth] authenticate() ENTRY')
    
    try {
      const authHeader = request.headers.authorization
      console.log('>>> [Auth] Header:', authHeader ? authHeader.substring(0, 30) + '...' : 'NONE')
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('>>> [Auth] FAIL: Missing or invalid auth header')
        reply.code(401).send({ 
          error: 'Unauthorized',
          message: 'Missing or invalid Authorization header'
        })
        throw new Error('Auth: Missing header')
      }
      
      const token = authHeader.substring(7)
      
      if (!token || token === 'undefined' || token === 'null') {
        console.log('>>> [Auth] FAIL: Empty or invalid token string')
        reply.code(401).send({ 
          error: 'Unauthorized',
          message: 'Invalid or missing access token'
        })
        throw new Error('Auth: Invalid token string')
      }
      
      console.log('>>> [Auth] Verifying token with Supabase...')
      const supabase = createSupabaseClient(token)
      const { data: { user }, error } = await supabase.auth.getUser(token)
      
      if (error || !user) {
        console.log('>>> [Auth] FAIL: Token verification failed:', error?.message)
        reply.code(401).send({ 
          error: 'Invalid token',
          message: error?.message || 'Token verification failed',
          hint: 'Ensure API server SUPABASE_URL matches your app\'s Supabase project'
        })
        throw new Error('Auth: Token verification failed')
      }
      
      console.log('>>> [Auth] Token valid, looking up profile for user:', user.id)
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('id, email, role, org_id, full_name')
        .eq('id', user.id)
        .single()
      
      if (profileError || !profile) {
        console.log('>>> [Auth] FAIL: Profile lookup failed:', profileError?.message)
        reply.code(401).send({ 
          error: 'Profile not found',
          message: 'User profile does not exist'
        })
        throw new Error('Auth: Profile not found')
      }
      
      if (!profile.org_id) {
        console.log('>>> [Auth] FAIL: User has no organization:', profile.email)
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
      console.log('>>> [Auth] SUCCESS: Authenticated', profile.email)
      fastify.log.info({ msg: '>>> [Auth] Authenticated', email: profile.email })
    } catch (err) {
      // Re-throw to stop the request lifecycle
      console.log('>>> [Auth] Exception caught:', err instanceof Error ? err.message : err)
      throw err
    }
  })
}

// Wrap with fastify-plugin to make decorators available to parent scope
const authPlugin = fp(authPluginImpl, {
  name: 'auth-plugin'
})

export default authPlugin
