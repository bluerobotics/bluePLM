/**
 * Supplier Routes
 * 
 * Supplier management and part-supplier linking with costing.
 */

import { FastifyPluginAsync, FastifyReply } from 'fastify'
import { schemas } from '../schemas/index.js'
import type { Supplier, PartSupplier, PriceBreak } from '../types.js'

// Helper to send error responses without TypeScript complaining about schema types
function sendError(reply: FastifyReply, code: number, error: string, message: string) {
  return reply.status(code).send({ error, message })
}

const supplierRoutes: FastifyPluginAsync = async (fastify) => {
  // List all suppliers
  fastify.get('/suppliers', {
    schema: {
      description: 'List all suppliers in the organization',
      tags: ['Suppliers'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          active_only: { type: 'boolean', description: 'Only return active suppliers' },
          approved_only: { type: 'boolean', description: 'Only return approved suppliers' },
          search: { type: 'string', description: 'Search by name or code' },
          limit: { type: 'integer', default: 100 },
          offset: { type: 'integer', default: 0 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            suppliers: { type: 'array', items: schemas.supplier },
            count: { type: 'integer' }
          }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request) => {
    const { active_only, approved_only, search, limit = 100, offset = 0 } = 
      request.query as Record<string, string | number | boolean | undefined>
    
    let query = request.supabase!
      .from('suppliers')
      .select('*')
      .eq('org_id', request.user!.org_id)
      .order('name')
      .range(offset as number, (offset as number) + (limit as number) - 1)
    
    if (active_only) query = query.eq('is_active', true)
    if (approved_only) query = query.eq('is_approved', true)
    if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`)
    
    const { data, error } = await query
    if (error) throw error
    
    return { suppliers: data, count: data?.length || 0 }
  })
  
  // Get supplier by ID
  fastify.get('/suppliers/:id', {
    schema: {
      description: 'Get supplier by ID',
      tags: ['Suppliers'],
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
      .from('suppliers')
      .select('*')
      .eq('id', id)
      .eq('org_id', request.user!.org_id)
      .single()
    
    if (error) throw error
    if (!data) return sendError(reply, 404, 'Not found', 'Supplier not found')
    
    return { supplier: data }
  })
  
  // Create a new supplier
  fastify.post('/suppliers', {
    schema: {
      description: 'Create a new supplier',
      tags: ['Suppliers'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          code: { type: 'string' },
          contact_name: { type: 'string' },
          contact_email: { type: 'string' },
          contact_phone: { type: 'string' },
          website: { type: 'string' },
          address_line1: { type: 'string' },
          address_line2: { type: 'string' },
          city: { type: 'string' },
          state: { type: 'string' },
          postal_code: { type: 'string' },
          country: { type: 'string' },
          payment_terms: { type: 'string' },
          default_lead_time_days: { type: 'integer' },
          min_order_value: { type: 'number' },
          currency: { type: 'string' },
          shipping_account: { type: 'string' },
          is_approved: { type: 'boolean' },
          notes: { type: 'string' },
          erp_id: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            supplier: schemas.supplier
          }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request) => {
    if (request.user!.role === 'viewer') {
      const error = new Error('Viewers cannot create suppliers') as Error & { statusCode: number }
      error.statusCode = 403
      throw error
    }
    
    const body = request.body as Partial<Supplier>
    
    const { data, error } = await request.supabase!
      .from('suppliers')
      .insert({
        ...body,
        org_id: request.user!.org_id,
        created_by: request.user!.id,
        updated_by: request.user!.id
      })
      .select()
      .single()
    
    if (error) throw error
    return { success: true, supplier: data }
  })
  
  // Update a supplier
  fastify.patch('/suppliers/:id', {
    schema: {
      description: 'Update a supplier',
      tags: ['Suppliers'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } }
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          code: { type: 'string' },
          contact_name: { type: 'string' },
          contact_email: { type: 'string' },
          contact_phone: { type: 'string' },
          website: { type: 'string' },
          address_line1: { type: 'string' },
          address_line2: { type: 'string' },
          city: { type: 'string' },
          state: { type: 'string' },
          postal_code: { type: 'string' },
          country: { type: 'string' },
          payment_terms: { type: 'string' },
          default_lead_time_days: { type: 'integer' },
          min_order_value: { type: 'number' },
          currency: { type: 'string' },
          shipping_account: { type: 'string' },
          is_active: { type: 'boolean' },
          is_approved: { type: 'boolean' },
          notes: { type: 'string' },
          erp_id: { type: 'string' }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    
    if (request.user!.role === 'viewer') {
      return sendError(reply, 403, 'Forbidden', 'Viewers cannot update suppliers')
    }
    
    const body = request.body as Partial<Supplier>
    
    const { data, error } = await request.supabase!
      .from('suppliers')
      .update({
        ...body,
        updated_at: new Date().toISOString(),
        updated_by: request.user!.id
      })
      .eq('id', id)
      .eq('org_id', request.user!.org_id)
      .select()
      .single()
    
    if (error) throw error
    if (!data) return sendError(reply, 404, 'Not found', 'Supplier not found')
    
    return { success: true, supplier: data }
  })
  
  // Delete a supplier (admin only)
  fastify.delete('/suppliers/:id', {
    schema: {
      description: 'Delete a supplier (admin only)',
      tags: ['Suppliers'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } }
      }
    },
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    
    if (request.user!.role !== 'admin') {
      return sendError(reply, 403, 'Forbidden', 'Only admins can delete suppliers')
    }
    
    const { error } = await request.supabase!
      .from('suppliers')
      .delete()
      .eq('id', id)
      .eq('org_id', request.user!.org_id)
    
    if (error) throw error
    return { success: true }
  })
  
  // Get all suppliers and pricing for a part
  fastify.get('/files/:id/suppliers', {
    schema: {
      description: 'Get all suppliers and pricing for a part',
      tags: ['Suppliers'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } }
      }
    },
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    
    // Get file info
    const { data: file, error: fileError } = await request.supabase!
      .from('files')
      .select('id, file_name, part_number')
      .eq('id', id)
      .eq('org_id', request.user!.org_id)
      .single()
    
    if (fileError) throw fileError
    if (!file) return sendError(reply, 404, 'Not found', 'File not found')
    
    // Get suppliers for this part
    const { data: partSuppliers, error } = await request.supabase!
      .from('part_suppliers')
      .select(`
        id, supplier_part_number, supplier_description, supplier_url,
        unit_price, currency, price_unit, price_breaks,
        min_order_qty, order_multiple, lead_time_days,
        is_preferred, is_active, is_qualified, notes,
        supplier:suppliers(*)
      `)
      .eq('file_id', id)
      .eq('is_active', true)
      .order('is_preferred', { ascending: false })
    
    if (error) throw error
    
    return {
      file_id: file.id,
      part_number: file.part_number,
      file_name: file.file_name,
      suppliers: partSuppliers
    }
  })
  
  // Link a supplier to a part with pricing info
  fastify.post('/files/:id/suppliers', {
    schema: {
      description: 'Link a supplier to a part with pricing info',
      tags: ['Suppliers'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } }
      },
      body: {
        type: 'object',
        required: ['supplier_id'],
        properties: {
          supplier_id: { type: 'string', format: 'uuid' },
          supplier_part_number: { type: 'string' },
          supplier_description: { type: 'string' },
          supplier_url: { type: 'string' },
          unit_price: { type: 'number' },
          currency: { type: 'string' },
          price_unit: { type: 'string' },
          price_breaks: { 
            type: 'array',
            items: {
              type: 'object',
              properties: {
                qty: { type: 'integer' },
                price: { type: 'number' }
              }
            }
          },
          min_order_qty: { type: 'integer' },
          order_multiple: { type: 'integer' },
          lead_time_days: { type: 'integer' },
          is_preferred: { type: 'boolean' },
          notes: { type: 'string' }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    
    if (request.user!.role === 'viewer') {
      return sendError(reply, 403, 'Forbidden', 'Viewers cannot link suppliers')
    }
    
    const body = request.body as Partial<PartSupplier> & { supplier_id: string }
    
    // Verify file exists
    const { data: file } = await request.supabase!
      .from('files')
      .select('id')
      .eq('id', id)
      .eq('org_id', request.user!.org_id)
      .single()
    
    if (!file) return sendError(reply, 404, 'Not found', 'File not found')
    
    // If marking as preferred, unmark others
    if (body.is_preferred) {
      await request.supabase!
        .from('part_suppliers')
        .update({ is_preferred: false })
        .eq('file_id', id)
    }
    
    const { data, error } = await request.supabase!
      .from('part_suppliers')
      .insert({
        ...body,
        org_id: request.user!.org_id,
        file_id: id,
        created_by: request.user!.id,
        updated_by: request.user!.id
      })
      .select(`
        *,
        supplier:suppliers(*)
      `)
      .single()
    
    if (error) throw error
    return { success: true, part_supplier: data }
  })
  
  // Update supplier pricing/info for a part
  fastify.patch('/files/:id/suppliers/:supplierId', {
    schema: {
      description: 'Update supplier pricing/info for a part',
      tags: ['Suppliers'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { 
          id: { type: 'string', format: 'uuid' },
          supplierId: { type: 'string', format: 'uuid' }
        }
      },
      body: {
        type: 'object',
        properties: {
          supplier_part_number: { type: 'string' },
          supplier_description: { type: 'string' },
          supplier_url: { type: 'string' },
          unit_price: { type: 'number' },
          currency: { type: 'string' },
          price_unit: { type: 'string' },
          price_breaks: { 
            type: 'array',
            items: {
              type: 'object',
              properties: {
                qty: { type: 'integer' },
                price: { type: 'number' }
              }
            }
          },
          min_order_qty: { type: 'integer' },
          order_multiple: { type: 'integer' },
          lead_time_days: { type: 'integer' },
          is_preferred: { type: 'boolean' },
          is_active: { type: 'boolean' },
          is_qualified: { type: 'boolean' },
          notes: { type: 'string' }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    const { id, supplierId } = request.params as { id: string; supplierId: string }
    
    if (request.user!.role === 'viewer') {
      return sendError(reply, 403, 'Forbidden', 'Viewers cannot update supplier info')
    }
    
    const body = request.body as Partial<PartSupplier>
    
    // If marking as preferred, unmark others
    if (body.is_preferred) {
      await request.supabase!
        .from('part_suppliers')
        .update({ is_preferred: false })
        .eq('file_id', id)
        .neq('supplier_id', supplierId)
    }
    
    const { data, error } = await request.supabase!
      .from('part_suppliers')
      .update({
        ...body,
        updated_at: new Date().toISOString(),
        updated_by: request.user!.id,
        last_price_update: body.unit_price !== undefined ? new Date().toISOString() : undefined
      })
      .eq('file_id', id)
      .eq('supplier_id', supplierId)
      .eq('org_id', request.user!.org_id)
      .select(`
        *,
        supplier:suppliers(*)
      `)
      .single()
    
    if (error) throw error
    if (!data) return sendError(reply, 404, 'Not found', 'Part-supplier link not found')
    
    return { success: true, part_supplier: data }
  })
  
  // Remove supplier from a part
  fastify.delete('/files/:id/suppliers/:supplierId', {
    schema: {
      description: 'Remove supplier from a part',
      tags: ['Suppliers'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { 
          id: { type: 'string', format: 'uuid' },
          supplierId: { type: 'string', format: 'uuid' }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    const { id, supplierId } = request.params as { id: string; supplierId: string }
    
    if (request.user!.role === 'viewer') {
      return sendError(reply, 403, 'Forbidden', 'Viewers cannot remove suppliers')
    }
    
    const { error } = await request.supabase!
      .from('part_suppliers')
      .delete()
      .eq('file_id', id)
      .eq('supplier_id', supplierId)
      .eq('org_id', request.user!.org_id)
    
    if (error) throw error
    return { success: true }
  })
  
  // Get complete costing info for a part
  fastify.get('/parts/:id/costing', {
    schema: {
      description: 'Get complete costing info for a part including all suppliers and volume pricing',
      tags: ['ERP', 'Suppliers'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } }
      },
      querystring: {
        type: 'object',
        properties: {
          quantity: { type: 'integer', default: 1, description: 'Quantity to calculate pricing for' }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { quantity = 1 } = request.query as { quantity?: number }
    
    // Get part info
    const { data: part, error: partError } = await request.supabase!
      .from('files')
      .select('id, part_number, file_name, description, revision, state')
      .eq('id', id)
      .eq('org_id', request.user!.org_id)
      .single()
    
    if (partError) throw partError
    if (!part) return sendError(reply, 404, 'Not found', 'Part not found')
    
    // Get all suppliers with pricing
    const { data: partSuppliers, error } = await request.supabase!
      .from('part_suppliers')
      .select(`
        supplier_id, supplier_part_number, unit_price, currency,
        price_breaks, lead_time_days, is_preferred,
        supplier:suppliers(id, name, code, default_lead_time_days)
      `)
      .eq('file_id', id)
      .eq('is_active', true)
    
    if (error) throw error
    
    // Calculate prices at quantity
    const suppliersWithPricing = (partSuppliers || []).map((ps: any) => {
      let effectivePrice = ps.unit_price
      
      // Check price breaks for volume pricing
      if (ps.price_breaks && Array.isArray(ps.price_breaks) && ps.price_breaks.length > 0) {
        const sortedBreaks = [...ps.price_breaks].sort((a: PriceBreak, b: PriceBreak) => b.qty - a.qty)
        for (const pb of sortedBreaks) {
          if (quantity >= pb.qty) {
            effectivePrice = pb.price
            break
          }
        }
      }
      
      return {
        supplier_id: ps.supplier_id,
        supplier_name: ps.supplier?.name,
        supplier_code: ps.supplier?.code,
        supplier_part_number: ps.supplier_part_number,
        unit_price: effectivePrice,
        total_price: effectivePrice ? effectivePrice * quantity : null,
        currency: ps.currency,
        lead_time_days: ps.lead_time_days || ps.supplier?.default_lead_time_days,
        is_preferred: ps.is_preferred,
        price_breaks: ps.price_breaks || []
      }
    })
    
    // Find preferred and lowest cost
    const preferred = suppliersWithPricing.find((s: any) => s.is_preferred)
    const withPrices = suppliersWithPricing.filter((s: any) => s.unit_price !== null)
    const lowest = withPrices.length > 0 
      ? withPrices.reduce((min: any, s: any) => s.unit_price < min.unit_price ? s : min)
      : null
    
    return {
      part: {
        id: part.id,
        part_number: part.part_number,
        file_name: part.file_name,
        description: part.description,
        revision: part.revision,
        state: part.state
      },
      quantity,
      preferred_supplier: preferred || null,
      lowest_cost: lowest,
      all_suppliers: suppliersWithPricing
    }
  })
  
  // List all parts available from a specific supplier
  fastify.get('/suppliers/:id/parts', {
    schema: {
      description: 'List all parts available from a specific supplier',
      tags: ['Suppliers', 'ERP'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } }
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 100 },
          offset: { type: 'integer', default: 0 }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { limit = 100, offset = 0 } = request.query as { limit?: number; offset?: number }
    
    // Verify supplier exists
    const { data: supplier, error: supplierError } = await request.supabase!
      .from('suppliers')
      .select('id, name, code')
      .eq('id', id)
      .eq('org_id', request.user!.org_id)
      .single()
    
    if (supplierError) throw supplierError
    if (!supplier) return sendError(reply, 404, 'Not found', 'Supplier not found')
    
    // Get parts from this supplier
    const { data, error } = await request.supabase!
      .from('part_suppliers')
      .select(`
        supplier_part_number, unit_price, currency, lead_time_days, is_preferred,
        file:files(id, part_number, file_name, description, revision, state, file_type)
      `)
      .eq('supplier_id', id)
      .eq('is_active', true)
      .range(offset, offset + limit - 1)
    
    if (error) throw error
    
    return {
      supplier,
      parts: data,
      count: data?.length || 0
    }
  })
}

export default supplierRoutes
