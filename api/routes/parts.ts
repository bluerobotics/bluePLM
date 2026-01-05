/**
 * Parts & BOM Routes
 * 
 * ERP integration endpoints for parts and bill of materials.
 */

import { FastifyPluginAsync } from 'fastify'

const partsRoutes: FastifyPluginAsync = async (fastify) => {
  // List parts (files with part numbers)
  fastify.get('/parts', {
    schema: {
      description: 'List parts (files with part numbers). Ideal for ERP integration.',
      tags: ['ERP'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          vault_id: { type: 'string', format: 'uuid' },
          state: { type: 'string', enum: ['not_tracked', 'wip', 'in_review', 'released', 'obsolete'] },
          released_only: { type: 'boolean', description: 'Only return released parts' },
          search: { type: 'string', description: 'Search by part number' },
          limit: { type: 'integer', default: 100 },
          offset: { type: 'integer', default: 0 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            parts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  part_number: { type: 'string' },
                  file_name: { type: 'string' },
                  file_path: { type: 'string' },
                  description: { type: ['string', 'null'] },
                  revision: { type: 'string' },
                  version: { type: 'integer' },
                  state: { type: 'string' },
                  file_type: { type: 'string' }
                }
              }
            },
            count: { type: 'integer' }
          }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request) => {
    const { vault_id, state, released_only, search, limit = 100, offset = 0 } = 
      request.query as Record<string, string | number | boolean | undefined>
    
    let query = request.supabase!
      .from('files')
      .select('id, part_number, file_name, file_path, description, revision, version, state, file_type')
      .eq('org_id', request.user!.org_id)
      .is('deleted_at', null)
      .not('part_number', 'is', null)
      .order('part_number')
      .range(offset as number, (offset as number) + (limit as number) - 1)
    
    if (vault_id) query = query.eq('vault_id', vault_id)
    if (state) query = query.eq('state', state)
    if (released_only) query = query.eq('state', 'released')
    if (search) query = query.ilike('part_number', `%${search}%`)
    
    const { data, error } = await query
    if (error) throw error
    
    return { parts: data, count: data?.length || 0 }
  })
  
  // Get Bill of Materials for an assembly
  fastify.get('/bom/:id', {
    schema: {
      description: 'Get Bill of Materials for an assembly. Returns all child components.',
      tags: ['ERP'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } }
      },
      querystring: {
        type: 'object',
        properties: {
          recursive: { type: 'boolean', description: 'Include nested sub-assemblies', default: false },
          released_only: { type: 'boolean', description: 'Only include released components' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            assembly: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                part_number: { type: ['string', 'null'] },
                file_name: { type: 'string' },
                revision: { type: 'string' },
                state: { type: 'string' }
              }
            },
            components: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  part_number: { type: ['string', 'null'] },
                  file_name: { type: 'string' },
                  file_path: { type: 'string' },
                  revision: { type: 'string' },
                  state: { type: 'string' },
                  quantity: { type: 'integer' }
                }
              }
            },
            total_components: { type: 'integer' }
          }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request) => {
    const { id } = request.params as { id: string }
    const { released_only } = request.query as { recursive?: boolean; released_only?: boolean }
    
    // Get the assembly
    const { data: assembly, error: assemblyError } = await request.supabase!
      .from('files')
      .select('id, part_number, file_name, file_path, revision, state, file_type')
      .eq('id', id)
      .eq('org_id', request.user!.org_id)
      .single()
    
    if (assemblyError) throw assemblyError
    if (!assembly) {
      const error = new Error('Assembly not found') as Error & { statusCode: number }
      error.statusCode = 404
      throw error
    }
    
    // Get child components from file_references
    const query = request.supabase!
      .from('file_references')
      .select(`
        quantity,
        child:files!child_file_id(
          id, part_number, file_name, file_path, revision, state, file_type
        )
      `)
      .eq('parent_file_id', id)
    
    const { data: refs, error: refsError } = await query
    if (refsError) throw refsError
    
    let components = (refs || [])
      .filter(r => r.child)
      .map(r => ({
        ...(r.child as object),
        quantity: r.quantity || 1
      }))
    
    if (released_only) {
      components = components.filter((c: any) => c.state === 'released')
    }
    
    return {
      assembly: {
        id: assembly.id,
        part_number: assembly.part_number,
        file_name: assembly.file_name,
        revision: assembly.revision,
        state: assembly.state
      },
      components,
      total_components: components.length
    }
  })
}

export default partsRoutes
