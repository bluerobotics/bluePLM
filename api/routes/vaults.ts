/**
 * Vault Routes
 * 
 * Vault listing and status endpoints.
 */

import { FastifyPluginAsync } from 'fastify'
import { schemas } from '../schemas/index.js'

const vaultRoutes: FastifyPluginAsync = async (fastify) => {
  // List organization vaults
  fastify.get('/vaults', {
    schema: {
      description: 'List organization vaults',
      tags: ['Vaults'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            vaults: { type: 'array', items: schemas.vault }
          }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request) => {
    const { data, error } = await request.supabase!
      .from('vaults')
      .select('*')
      .eq('org_id', request.user!.org_id)
      .order('name')
    
    if (error) throw error
    return { vaults: data }
  })
  
  // Get vault by ID
  fastify.get('/vaults/:id', {
    schema: {
      description: 'Get vault by ID',
      tags: ['Vaults'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } }
      }
    },
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    
    const { data, error } = await request.supabase!
      .from('vaults')
      .select('*')
      .eq('id', id)
      .eq('org_id', request.user!.org_id)
      .single()
    
    if (error) throw error
    if (!data) return reply.code(404).send({ error: 'Not found', message: 'Vault not found' })
    
    return { vault: data }
  })
  
  // Get vault status summary
  fastify.get('/vaults/:id/status', {
    schema: {
      description: 'Get vault status summary',
      tags: ['Vaults'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } }
      }
    },
    preHandler: fastify.authenticate
  }, async (request) => {
    const { id } = request.params as { id: string }
    
    const { data: files, error } = await request.supabase!
      .from('files')
      .select('state, checked_out_by')
      .eq('vault_id', id)
      .eq('org_id', request.user!.org_id)
      .is('deleted_at', null)
    
    if (error) throw error
    
    const status = {
      total: files?.length || 0,
      checked_out: files?.filter(f => f.checked_out_by).length || 0,
      checked_out_by_me: files?.filter(f => f.checked_out_by === request.user!.id).length || 0,
      by_state: {} as Record<string, number>
    }
    
    for (const file of files || []) {
      const state = file.state || 'not_tracked'
      status.by_state[state] = (status.by_state[state] || 0) + 1
    }
    
    return { status }
  })
}

export default vaultRoutes
