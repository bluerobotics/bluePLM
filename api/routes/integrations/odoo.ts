/**
 * Odoo Integration Routes
 * 
 * Configuration, testing, and sync with Odoo ERP.
 */

import { FastifyPluginAsync, FastifyReply } from 'fastify'
import { normalizeOdooUrl, testOdooConnection, fetchOdooSuppliers } from '../../utils/index.js'

// Helper to send error responses without TypeScript complaining about schema types
function sendError(reply: FastifyReply, code: number, error: string, message?: string) {
  return reply.status(code).send(message ? { error, message } : { error })
}

const odooRoutes: FastifyPluginAsync = async (fastify) => {
  // Get Odoo integration settings
  fastify.get('/integrations/odoo', {
    schema: {
      description: 'Get Odoo integration settings',
      tags: ['Integrations'],
      security: [{ bearerAuth: [] }]
    },
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    if (!request.user) {
      return sendError(reply, 401, 'Unauthorized', 'Authentication required')
    }
    
    const { data, error } = await request.supabase!
      .from('organization_integrations')
      .select('*')
      .eq('org_id', request.user.org_id)
      .eq('integration_type', 'odoo')
      .single()
    
    if (error || !data) {
      return { configured: false }
    }
    
    return {
      configured: true,
      settings: {
        url: data.settings?.url,
        database: data.settings?.database,
        username: data.settings?.username
      },
      is_connected: data.is_connected,
      last_sync_at: data.last_sync_at,
      last_sync_status: data.last_sync_status,
      last_sync_count: data.last_sync_count,
      auto_sync: data.auto_sync
    }
  })

  // Configure Odoo integration
  fastify.post('/integrations/odoo', {
    schema: {
      description: 'Configure Odoo integration',
      tags: ['Integrations'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['url', 'database', 'username', 'api_key'],
        properties: {
          url: { type: 'string' },
          database: { type: 'string' },
          username: { type: 'string' },
          api_key: { type: 'string' },
          auto_sync: { type: 'boolean', default: false },
          skip_test: { type: 'boolean', default: false }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    if (!request.user || request.user.role !== 'admin') {
      return sendError(reply, 403, 'Forbidden', 'Only admins can configure integrations')
    }
    
    const { url, database, username, api_key, auto_sync, skip_test } = request.body as {
      url: string; database: string; username: string; api_key: string; auto_sync?: boolean; skip_test?: boolean
    }
    
    const normalizedUrl = normalizeOdooUrl(url)
    let isConnected = false
    let connectionError: string | null = null
    
    if (!skip_test) {
      const testResult = await testOdooConnection(normalizedUrl, database, username, api_key)
      isConnected = testResult.success
      connectionError = testResult.error || null
    }
    
    // Save/update saved config
    const { data: existingConfigs } = await request.supabase!
      .from('odoo_saved_configs')
      .select('id, url, database, username, api_key_encrypted')
      .eq('org_id', request.user.org_id)
      .eq('is_active', true)
    
    const matchingConfig = existingConfigs?.find(c => 
      c.url === normalizedUrl && c.database === database && 
      c.username === username && c.api_key_encrypted === api_key
    )
    
    let configId: string | null = matchingConfig?.id || null
    let configName: string | null = null
    
    if (!matchingConfig) {
      const baseName = normalizedUrl.replace(/^https?:\/\//, '').split('/')[0]
      const colors = ['#22c55e', '#3b82f6', '#8b5cf6', '#f97316', '#ec4899', '#06b6d4', '#eab308', '#ef4444']
      
      const { data: newConfig } = await request.supabase!
        .from('odoo_saved_configs')
        .insert({
          org_id: request.user.org_id,
          name: baseName,
          url: normalizedUrl,
          database,
          username,
          api_key_encrypted: api_key,
          color: colors[(existingConfigs?.length || 0) % colors.length],
          is_active: true,
          last_tested_at: !skip_test ? new Date().toISOString() : null,
          last_test_success: !skip_test ? isConnected : null,
          created_by: request.user.id,
          updated_by: request.user.id
        })
        .select('id, name')
        .single()
      
      if (newConfig) {
        configId = newConfig.id
        configName = newConfig.name
      }
    }
    
    const { error } = await request.supabase!
      .from('organization_integrations')
      .upsert({
        org_id: request.user.org_id,
        integration_type: 'odoo',
        settings: { url: normalizedUrl, database, username, config_id: configId, config_name: configName },
        credentials_encrypted: api_key,
        is_active: true,
        is_connected: isConnected,
        last_connected_at: isConnected ? new Date().toISOString() : null,
        last_error: connectionError,
        auto_sync: auto_sync || false,
        updated_by: request.user.id
      }, { onConflict: 'org_id,integration_type' })
    
    if (error) throw error
    
    return { 
      success: true, 
      message: isConnected ? 'Odoo integration connected!' : `Saved but connection failed: ${connectionError}`,
      new_config: configName ? { id: configId, name: configName } : undefined
    }
  })

  // Test Odoo connection
  fastify.post('/integrations/odoo/test', {
    schema: {
      description: 'Test Odoo connection',
      tags: ['Integrations'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['url', 'database', 'username', 'api_key'],
        properties: {
          url: { type: 'string' },
          database: { type: 'string' },
          username: { type: 'string' },
          api_key: { type: 'string' }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    const { url, database, username, api_key } = request.body as {
      url: string; database: string; username: string; api_key: string
    }
    
    const result = await testOdooConnection(url, database, username, api_key)
    
    if (!result.success) {
      return sendError(reply, 400, result.error || 'Connection test failed')
    }
    
    return { success: true, user_name: result.user_name, version: result.version }
  })

  // Sync suppliers from Odoo
  fastify.post('/integrations/odoo/sync/suppliers', {
    schema: {
      description: 'Sync suppliers from Odoo',
      tags: ['Integrations'],
      security: [{ bearerAuth: [] }]
    },
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    if (!request.user) {
      return sendError(reply, 401, 'Unauthorized')
    }
    if (request.user.role !== 'admin' && request.user.role !== 'engineer') {
      return sendError(reply, 403, 'Forbidden', 'Only admins and engineers can sync')
    }
    
    const { data: integration } = await request.supabase!
      .from('organization_integrations')
      .select('*')
      .eq('org_id', request.user.org_id)
      .eq('integration_type', 'odoo')
      .single()
    
    if (!integration) {
      return sendError(reply, 400, 'Not configured', 'Odoo integration not configured')
    }
    
    const odooSuppliers = await fetchOdooSuppliers(
      integration.settings.url,
      integration.settings.database,
      integration.settings.username,
      integration.credentials_encrypted
    )
    
    if (!odooSuppliers.success) {
      await request.supabase!
        .from('organization_integrations')
        .update({ is_connected: false, last_sync_at: new Date().toISOString(), last_sync_status: 'error', last_error: odooSuppliers.error })
        .eq('id', integration.id)
      return reply.status(400).send({ error: 'Sync failed', message: odooSuppliers.error, debug: odooSuppliers.debug })
    }
    
    const suppliers = odooSuppliers.suppliers || []
    let created = 0, updated = 0, errors = 0
    
    for (const odooSupplier of suppliers) {
      try {
        const { data: existing } = await request.supabase!
          .from('suppliers')
          .select('id')
          .eq('org_id', request.user.org_id)
          .eq('erp_id', String(odooSupplier.id))
          .single()
        
        const supplierData = {
          org_id: request.user.org_id,
          name: odooSupplier.name,
          code: odooSupplier.ref || null,
          contact_email: odooSupplier.email || null,
          contact_phone: odooSupplier.phone || odooSupplier.mobile || null,
          website: odooSupplier.website || null,
          address_line1: odooSupplier.street || null,
          city: odooSupplier.city || null,
          postal_code: odooSupplier.zip || null,
          country: (odooSupplier.country_id && Array.isArray(odooSupplier.country_id) ? odooSupplier.country_id[1] : null) || 'USA',
          is_active: odooSupplier.active !== false,
          is_approved: true,
          erp_id: String(odooSupplier.id),
          erp_synced_at: new Date().toISOString(),
          updated_by: request.user.id
        }
        
        if (existing) {
          await request.supabase!.from('suppliers').update(supplierData).eq('id', existing.id)
          updated++
        } else {
          await request.supabase!.from('suppliers').insert({ ...supplierData, created_by: request.user.id })
          created++
        }
      } catch {
        errors++
      }
    }
    
    await request.supabase!
      .from('organization_integrations')
      .update({
        is_connected: true,
        last_connected_at: new Date().toISOString(),
        last_error: null,
        last_sync_at: new Date().toISOString(),
        last_sync_status: errors > 0 ? 'partial' : 'success',
        last_sync_count: created + updated
      })
      .eq('id', integration.id)
    
    return { success: true, created, updated, errors, message: `Synced ${created + updated} suppliers from Odoo`, debug: odooSuppliers.debug }
  })

  // Disconnect Odoo integration
  fastify.delete('/integrations/odoo', {
    schema: { description: 'Disconnect Odoo integration', tags: ['Integrations'], security: [{ bearerAuth: [] }] },
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    if (!request.user || request.user.role !== 'admin') {
      return sendError(reply, 403, 'Forbidden', 'Only admins can disconnect integrations')
    }
    
    await request.supabase!
      .from('organization_integrations')
      .update({ is_active: false, is_connected: false, credentials_encrypted: null, updated_by: request.user.id })
      .eq('org_id', request.user.org_id)
      .eq('integration_type', 'odoo')
    
    return { success: true, message: 'Odoo integration disconnected' }
  })

  // List saved Odoo configurations
  fastify.get('/integrations/odoo/configs', {
    schema: { description: 'List all saved Odoo configurations', tags: ['Integrations'], security: [{ bearerAuth: [] }] },
    preHandler: fastify.authenticate
  }, async (request) => {
    const { data } = await request.supabase!
      .from('odoo_saved_configs')
      .select('id, name, description, url, database, username, color, is_active, last_tested_at, last_test_success, created_at')
      .eq('org_id', request.user!.org_id)
      .eq('is_active', true)
      .order('name')
    
    return { configs: data || [] }
  })

  // Get a single saved configuration
  fastify.get('/integrations/odoo/configs/:id', {
    schema: { description: 'Get a saved Odoo configuration', tags: ['Integrations'], security: [{ bearerAuth: [] }] },
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    if (request.user!.role !== 'admin') {
      return sendError(reply, 403, 'Forbidden', 'Only admins can access saved configurations')
    }
    
    const { id } = request.params as { id: string }
    const { data } = await request.supabase!.from('odoo_saved_configs').select('*').eq('id', id).eq('org_id', request.user!.org_id).single()
    
    if (!data) return sendError(reply, 404, 'Not found', 'Configuration not found')
    
    return { id: data.id, name: data.name, url: data.url, database: data.database, username: data.username, api_key: data.api_key_encrypted, color: data.color }
  })

  // Save a new Odoo configuration
  fastify.post('/integrations/odoo/configs', {
    schema: {
      description: 'Save a new Odoo configuration',
      tags: ['Integrations'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['name', 'url', 'database', 'username', 'api_key'],
        properties: {
          name: { type: 'string' }, url: { type: 'string' }, database: { type: 'string' },
          username: { type: 'string' }, api_key: { type: 'string' }, color: { type: 'string' }, skip_test: { type: 'boolean' }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    if (request.user!.role !== 'admin') {
      return sendError(reply, 403, 'Forbidden', 'Only admins can save configurations')
    }
    
    const { name, url, database, username, api_key, color, skip_test } = request.body as {
      name: string; url: string; database: string; username: string; api_key: string; color?: string; skip_test?: boolean
    }
    
    const normalizedUrl = normalizeOdooUrl(url)
    let testResult: { success: boolean; error?: string } = { success: false, error: '' }
    if (!skip_test) testResult = await testOdooConnection(normalizedUrl, database, username, api_key)
    
    const { data, error } = await request.supabase!
      .from('odoo_saved_configs')
      .insert({
        org_id: request.user!.org_id, name, url: normalizedUrl, database, username, api_key_encrypted: api_key, color,
        last_tested_at: !skip_test ? new Date().toISOString() : null,
        last_test_success: !skip_test ? testResult.success : null,
        created_by: request.user!.id, updated_by: request.user!.id
      })
      .select().single()
    
    if (error) {
      if (error.code === '23505') return sendError(reply, 409, 'Conflict', `Configuration "${name}" already exists`)
      throw error
    }
    
    return { success: true, config: data, connection_test: skip_test ? null : testResult }
  })

  // Update a saved configuration
  fastify.put('/integrations/odoo/configs/:id', {
    schema: { description: 'Update a saved Odoo configuration', tags: ['Integrations'], security: [{ bearerAuth: [] }] },
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    if (request.user!.role !== 'admin') return sendError(reply, 403, 'Forbidden')
    
    const { id } = request.params as { id: string }
    const body = request.body as Record<string, unknown>
    
    const updateData: Record<string, unknown> = { updated_by: request.user!.id }
    if (body.name) updateData.name = body.name
    if (body.url) updateData.url = normalizeOdooUrl(body.url as string)
    if (body.database) updateData.database = body.database
    if (body.username) updateData.username = body.username
    if (body.api_key) updateData.api_key_encrypted = body.api_key
    if (body.color !== undefined) updateData.color = body.color
    
    const { data } = await request.supabase!.from('odoo_saved_configs').update(updateData).eq('id', id).eq('org_id', request.user!.org_id).select().single()
    
    if (!data) return sendError(reply, 404, 'Not found')
    return { success: true, config: data }
  })

  // Delete a saved configuration
  fastify.delete('/integrations/odoo/configs/:id', {
    schema: { description: 'Delete a saved Odoo configuration', tags: ['Integrations'], security: [{ bearerAuth: [] }] },
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    if (request.user!.role !== 'admin') return sendError(reply, 403, 'Forbidden')
    
    const { id } = request.params as { id: string }
    await request.supabase!.from('odoo_saved_configs').delete().eq('id', id).eq('org_id', request.user!.org_id)
    
    return { success: true, message: 'Configuration deleted' }
  })

  // Activate a saved configuration
  fastify.post('/integrations/odoo/configs/:id/activate', {
    schema: { description: 'Activate a saved configuration', tags: ['Integrations'], security: [{ bearerAuth: [] }] },
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    if (request.user!.role !== 'admin') return sendError(reply, 403, 'Forbidden')
    
    const { id } = request.params as { id: string }
    const { data: config } = await request.supabase!.from('odoo_saved_configs').select('*').eq('id', id).eq('org_id', request.user!.org_id).single()
    
    if (!config) return sendError(reply, 404, 'Not found')
    
    const testResult = await testOdooConnection(config.url, config.database, config.username, config.api_key_encrypted)
    
    await request.supabase!
      .from('organization_integrations')
      .upsert({
        org_id: request.user!.org_id,
        integration_type: 'odoo',
        settings: { url: config.url, database: config.database, username: config.username, config_id: config.id, config_name: config.name },
        credentials_encrypted: config.api_key_encrypted,
        is_active: true,
        is_connected: testResult.success,
        last_connected_at: testResult.success ? new Date().toISOString() : null,
        last_error: testResult.error,
        updated_by: request.user!.id
      }, { onConflict: 'org_id,integration_type' })
    
    await request.supabase!.from('odoo_saved_configs').update({ last_tested_at: new Date().toISOString(), last_test_success: testResult.success }).eq('id', id)
    
    return { success: true, connected: testResult.success, config_name: config.name, message: testResult.success ? `Switched to "${config.name}" and connected!` : `Switched to "${config.name}" but connection failed` }
  })
}

export default odooRoutes
