/**
 * Activity Routes
 * 
 * Activity feed and checkout listing endpoints.
 */

import { FastifyPluginAsync } from 'fastify'

const activityRoutes: FastifyPluginAsync = async (fastify) => {
  // Get recent activity
  fastify.get('/activity', {
    schema: {
      description: 'Get recent activity',
      tags: ['Activity'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          file_id: { type: 'string', format: 'uuid' },
          limit: { type: 'integer', default: 50 }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request) => {
    const { file_id, limit = 50 } = request.query as { file_id?: string; limit?: number }
    
    let query = request.supabase!
      .from('activity')
      .select(`
        *,
        file:files(file_name, file_path),
        user:users(email, full_name)
      `)
      .eq('org_id', request.user!.org_id)
      .order('created_at', { ascending: false })
      .limit(limit)
    
    if (file_id) query = query.eq('file_id', file_id)
    
    const { data, error } = await query
    if (error) throw error
    
    return { activity: data }
  })

  // List checked out files
  fastify.get('/checkouts', {
    schema: {
      description: 'List checked out files',
      tags: ['Files'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          mine_only: { type: 'boolean' }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request) => {
    const { mine_only } = request.query as { mine_only?: boolean }
    
    let query = request.supabase!
      .from('files')
      .select(`
        id, file_path, file_name, checked_out_at, lock_message,
        checked_out_user:users!checked_out_by(id, email, full_name)
      `)
      .eq('org_id', request.user!.org_id)
      .not('checked_out_by', 'is', null)
      .order('checked_out_at', { ascending: false })
    
    if (mine_only) {
      query = query.eq('checked_out_by', request.user!.id)
    }
    
    const { data, error } = await query
    if (error) throw error
    
    return { checkouts: data }
  })
}

export default activityRoutes
