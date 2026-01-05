/**
 * Authentication Routes
 * 
 * Login, token refresh, and user invite endpoints.
 */

import { FastifyPluginAsync, FastifyReply } from 'fastify'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseClient } from '../src/infrastructure/supabase.js'
import { env } from '../src/config/env.js'

// Destructure for backwards compatibility
const { SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_KEY } = env
import { schemas } from '../schemas/index.js'

// Helper to send error responses without TypeScript complaining about schema types
function sendError(reply: FastifyReply, code: number, error: string, message: string) {
  return reply.status(code).send({ error, message })
}

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Get current user info
  fastify.get('/auth/me', {
    schema: {
      description: 'Get current user info',
      tags: ['Auth'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            user: schemas.user,
            org_id: { type: 'string' }
          }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request) => ({
    user: request.user,
    org_id: request.user!.org_id
  }))
  
  // Login with email and password
  fastify.post('/auth/login', {
    schema: {
      description: 'Login with email and password',
      tags: ['Auth'],
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 1 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            access_token: { type: 'string' },
            refresh_token: { type: 'string' },
            expires_at: { type: 'integer' },
            user: schemas.user
          }
        }
      }
    }
  }, async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string }
    const supabase = createSupabaseClient()
    
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    
    if (error) {
      return sendError(reply, 401, 'Login failed', error.message)
    }
    
    const { data: profile } = await supabase
      .from('users')
      .select('id, email, role, org_id, full_name')
      .eq('id', data.user.id)
      .single()
    
    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      user: profile
    }
  })
  
  // Refresh access token
  fastify.post('/auth/refresh', {
    schema: {
      description: 'Refresh access token',
      tags: ['Auth'],
      body: {
        type: 'object',
        required: ['refresh_token'],
        properties: {
          refresh_token: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { refresh_token } = request.body as { refresh_token: string }
    const supabase = createSupabaseClient()
    
    const { data, error } = await supabase.auth.refreshSession({ refresh_token })
    
    if (error) {
      return reply.code(401).send({ error: 'Refresh failed', message: error.message })
    }
    
    return {
      access_token: data.session!.access_token,
      refresh_token: data.session!.refresh_token,
      expires_at: data.session!.expires_at
    }
  })
  
  // Invite user by email (admin only)
  fastify.post('/auth/invite', {
    schema: {
      description: 'Invite a user by email. Requires admin role. Creates pending org member and sends invite email. Use resend=true to resend an invite.',
      tags: ['Auth'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' },
          full_name: { type: 'string' },
          team_ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
          vault_ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
          workflow_role_ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
          notes: { type: 'string' },
          resend: { type: 'boolean', description: 'If true, resends invite for existing pending member' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            pending_member_id: { type: 'string' }
          }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    const user = request.user!
    
    // Check admin permission
    if (user.role !== 'admin') {
      return sendError(reply, 403, 'Forbidden', 'Admin role required')
    }
    
    if (!SUPABASE_SERVICE_KEY) {
      return sendError(reply, 500, 'Configuration error', 'Service key not configured')
    }
    
    const { email, full_name, team_ids, vault_ids, workflow_role_ids, notes, resend } = request.body as {
      email: string
      full_name?: string
      team_ids?: string[]
      vault_ids?: string[]
      workflow_role_ids?: string[]
      notes?: string
      resend?: boolean
    }
    
    const normalizedEmail = email.toLowerCase().trim()
    
    // Create admin client for invite
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
    
    // Check if user already exists in auth.users
    const { data: existingAuthUsers } = await adminClient.auth.admin.listUsers()
    const existingAuthUser = existingAuthUsers?.users?.find(u => u.email?.toLowerCase() === normalizedEmail)
    
    // Check if user exists in our users table (fully registered)
    const { data: existingUsers } = await adminClient
      .from('users')
      .select('id, org_id')
      .ilike('email', normalizedEmail)
    
    const existingUser = existingUsers?.[0]
    
    if (existingUser) {
      if (existingUser.org_id === user.org_id) {
        return sendError(reply, 409, 'Conflict', 'User is already a member of your organization')
      } else if (existingUser.org_id) {
        return sendError(reply, 409, 'Conflict', 'User belongs to a different organization')
      }
    }
    
    // If user exists in auth but hasn't completed signup, delete and re-invite
    if (existingAuthUser && !existingUser) {
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(existingAuthUser.id)
      if (deleteError) {
        fastify.log.warn({ email: normalizedEmail, error: deleteError }, 'Failed to delete stale auth user')
      }
    }
    
    let pendingMemberId: string | null = null
    
    // If resending, verify pending member exists for this org
    if (resend) {
      const { data: existingPending, error: checkError } = await adminClient
        .from('pending_org_members')
        .select('id')
        .eq('org_id', user.org_id)
        .eq('email', normalizedEmail)
        .single()
      
      if (checkError || !existingPending) {
        return sendError(reply, 404, 'Not found', 'No pending member found with this email')
      }
      pendingMemberId = existingPending.id
    } else {
      // Delete any existing pending record for this email/org
      await adminClient
        .from('pending_org_members')
        .delete()
        .eq('org_id', user.org_id)
        .ilike('email', normalizedEmail)
      
      // Create pending org member record
      const { data: pendingMember, error: pendingError } = await adminClient
        .from('pending_org_members')
        .insert({
          org_id: user.org_id,
          email: normalizedEmail,
          full_name: full_name || null,
          role: 'viewer',
          team_ids: team_ids || [],
          vault_ids: vault_ids || [],
          workflow_role_ids: workflow_role_ids || [],
          notes: notes || null,
          created_by: user.id
        })
        .select('id')
        .single()
      
      if (pendingError) {
        if (pendingError.code === '23505') {
          return sendError(reply, 409, 'Conflict', 'User with this email already exists or is pending')
        }
        throw pendingError
      }
      pendingMemberId = pendingMember.id
    }
    
    // Get organization name and slug for invite email
    const { data: org } = await adminClient
      .from('organizations')
      .select('name, slug')
      .eq('id', user.org_id)
      .single()
    
    // Generate organization code for the invite
    const orgCodePayload = {
      v: 1,
      u: SUPABASE_URL,
      k: SUPABASE_KEY,
      s: org?.slug || ''
    }
    const orgCodeBase64 = Buffer.from(JSON.stringify(orgCodePayload)).toString('base64')
    const orgCodeChunks = orgCodeBase64.match(/.{1,4}/g) || []
    const orgCode = 'PDM-' + orgCodeChunks.join('-')
    
    // If user already has an auth account, return org code for manual sharing
    if (existingAuthUser) {
      return {
        success: true,
        message: `${normalizedEmail} already has an account. Share this org code with them to rejoin:`,
        pending_member_id: pendingMemberId,
        org_code: orgCode,
        existing_user: true
      }
    }
    
    // Send invite email using Supabase Auth (only for NEW users)
    const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(normalizedEmail, {
      data: {
        org_name: org?.name || 'your organization',
        invited_by: user.full_name || user.email,
        org_code: orgCode
      },
      redirectTo: 'https://blueplm.io/downloads'
    })
    
    if (inviteError) {
      fastify.log.warn({ email: normalizedEmail, error: inviteError }, 'Failed to send invite email, but pending member created')
      return {
        success: true,
        message: `Invite created for ${normalizedEmail}. Email delivery failed but they can sign in manually.`,
        pending_member_id: pendingMemberId
      }
    }
    
    return {
      success: true,
      message: resend ? `Invite email resent to ${normalizedEmail}` : `Invite email sent to ${normalizedEmail}`,
      pending_member_id: pendingMemberId
    }
  })
}

export default authRoutes
