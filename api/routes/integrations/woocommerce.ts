/**
 * WooCommerce Integration Routes
 * 
 * Configuration, testing, and sync with WooCommerce.
 */

import { FastifyPluginAsync, FastifyReply } from 'fastify'
import { normalizeWooCommerceUrl, testWooCommerceConnection } from '../../utils/index.js'

// Helper to send error responses without TypeScript complaining about schema types
function sendError(reply: FastifyReply, code: number, error: string, message?: string) {
  return reply.status(code).send(message ? { error, message } : { error })
}

const woocommerceRoutes: FastifyPluginAsync = async (fastify) => {
  // Get WooCommerce integration settings
  fastify.get('/integrations/woocommerce', {
    schema: { description: 'Get WooCommerce integration settings', tags: ['Integrations'], security: [{ bearerAuth: [] }] },
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    if (!request.user) return sendError(reply, 401, 'Unauthorized')
    
    const { data } = await request.supabase!
      .from('organization_integrations')
      .select('*')
      .eq('org_id', request.user.org_id)
      .eq('integration_type', 'woocommerce')
      .single()
    
    if (!data) return { configured: false }
    
    return {
      configured: true,
      settings: { store_url: data.settings?.store_url, store_name: data.settings?.store_name, config_id: data.settings?.config_id, config_name: data.settings?.config_name },
      is_connected: data.is_connected,
      wc_version: data.settings?.wc_version,
      last_sync_at: data.last_sync_at,
      last_sync_status: data.last_sync_status,
      products_synced: data.last_sync_count,
      auto_sync: data.auto_sync
    }
  })

  // Configure WooCommerce integration
  fastify.post('/integrations/woocommerce', {
    schema: {
      description: 'Configure WooCommerce integration',
      tags: ['Integrations'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['store_url', 'consumer_key', 'consumer_secret'],
        properties: {
          store_url: { type: 'string' },
          consumer_key: { type: 'string' },
          consumer_secret: { type: 'string' },
          sync_settings: { type: 'object' },
          auto_sync: { type: 'boolean' },
          skip_test: { type: 'boolean' }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    if (!request.user || request.user.role !== 'admin') {
      return sendError(reply, 403, 'Forbidden', 'Only admins can configure integrations')
    }
    
    const { store_url, consumer_key, consumer_secret, sync_settings, auto_sync, skip_test } = request.body as {
      store_url: string; consumer_key: string; consumer_secret: string; sync_settings?: Record<string, unknown>; auto_sync?: boolean; skip_test?: boolean
    }
    
    const normalizedUrl = normalizeWooCommerceUrl(store_url)
    let isConnected = false, connectionError: string | null = null, storeName: string | null = null, wcVersion: string | null = null
    
    if (!skip_test) {
      const testResult = await testWooCommerceConnection(normalizedUrl, consumer_key, consumer_secret)
      isConnected = testResult.success
      connectionError = testResult.error || null
      storeName = testResult.store_name || null
      wcVersion = testResult.version || null
    }
    
    // Check for existing config
    const { data: existingConfigs } = await request.supabase!
      .from('woocommerce_saved_configs')
      .select('id, store_url, consumer_key_encrypted')
      .eq('org_id', request.user.org_id)
      .eq('is_active', true)
    
    const matchingConfig = existingConfigs?.find(c => c.store_url === normalizedUrl && c.consumer_key_encrypted === consumer_key)
    
    let configId: string | null = matchingConfig?.id || null
    let configName: string | null = null
    
    if (!matchingConfig) {
      const baseName = storeName || normalizedUrl.replace(/^https?:\/\//, '').split('/')[0]
      const colors = ['#96588a', '#3b82f6', '#22c55e', '#f97316', '#ec4899']
      
      const { data: newConfig } = await request.supabase!
        .from('woocommerce_saved_configs')
        .insert({
          org_id: request.user.org_id,
          name: baseName,
          store_url: normalizedUrl,
          store_name: storeName,
          consumer_key_encrypted: consumer_key,
          consumer_secret_encrypted: consumer_secret,
          color: colors[(existingConfigs?.length || 0) % colors.length],
          sync_settings: sync_settings || {},
          is_active: true,
          wc_version: wcVersion,
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
        integration_type: 'woocommerce',
        settings: { store_url: normalizedUrl, store_name: storeName, wc_version: wcVersion, config_id: configId, config_name: configName, sync_settings },
        credentials_encrypted: JSON.stringify({ consumer_key, consumer_secret }),
        is_active: true,
        is_connected: isConnected,
        last_connected_at: isConnected ? new Date().toISOString() : null,
        last_error: connectionError,
        auto_sync: auto_sync || false,
        updated_by: request.user.id
      }, { onConflict: 'org_id,integration_type' })
    
    if (error) throw error
    
    return { success: true, message: isConnected ? 'WooCommerce connected!' : `Saved but connection failed: ${connectionError}`, new_config: configName ? { id: configId, name: configName } : undefined }
  })

  // Test WooCommerce connection
  fastify.post('/integrations/woocommerce/test', {
    schema: {
      description: 'Test WooCommerce connection',
      tags: ['Integrations'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['store_url', 'consumer_key', 'consumer_secret'],
        properties: { store_url: { type: 'string' }, consumer_key: { type: 'string' }, consumer_secret: { type: 'string' } }
      }
    },
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    const { store_url, consumer_key, consumer_secret } = request.body as { store_url: string; consumer_key: string; consumer_secret: string }
    
    const result = await testWooCommerceConnection(store_url, consumer_key, consumer_secret)
    
    if (!result.success) return sendError(reply, 400, result.error || 'Connection test failed')
    return { success: true, store_name: result.store_name, version: result.version }
  })

  // Sync products to WooCommerce (placeholder)
  fastify.post('/integrations/woocommerce/sync/products', {
    schema: { description: 'Sync products to WooCommerce', tags: ['Integrations'], security: [{ bearerAuth: [] }] },
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    if (!request.user || (request.user.role !== 'admin' && request.user.role !== 'engineer')) {
      return sendError(reply, 403, 'Forbidden')
    }
    
    const { data: integration } = await request.supabase!
      .from('organization_integrations')
      .select('*')
      .eq('org_id', request.user.org_id)
      .eq('integration_type', 'woocommerce')
      .single()
    
    if (!integration) return sendError(reply, 400, 'Not configured')
    
    return { success: true, created: 0, updated: 0, skipped: 0, errors: 0, message: 'Product sync not yet implemented - coming soon!' }
  })

  // Disconnect WooCommerce integration
  fastify.delete('/integrations/woocommerce', {
    schema: { description: 'Disconnect WooCommerce integration', tags: ['Integrations'], security: [{ bearerAuth: [] }] },
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    if (!request.user || request.user.role !== 'admin') {
      return sendError(reply, 403, 'Forbidden')
    }
    
    await request.supabase!
      .from('organization_integrations')
      .update({ is_active: false, is_connected: false, credentials_encrypted: null, updated_by: request.user.id })
      .eq('org_id', request.user.org_id)
      .eq('integration_type', 'woocommerce')
    
    return { success: true, message: 'WooCommerce integration disconnected' }
  })

  // List saved WooCommerce configurations
  fastify.get('/integrations/woocommerce/configs', {
    schema: { description: 'List saved WooCommerce configurations', tags: ['Integrations'], security: [{ bearerAuth: [] }] },
    preHandler: fastify.authenticate
  }, async (request) => {
    const { data } = await request.supabase!
      .from('woocommerce_saved_configs')
      .select('id, name, description, store_url, store_name, color, is_active, last_tested_at, last_test_success, created_at')
      .eq('org_id', request.user!.org_id)
      .eq('is_active', true)
      .order('name')
    
    return { configs: data || [] }
  })

  // Get a single saved configuration
  fastify.get('/integrations/woocommerce/configs/:id', {
    schema: { description: 'Get a saved WooCommerce configuration', tags: ['Integrations'], security: [{ bearerAuth: [] }] },
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    if (request.user!.role !== 'admin') return sendError(reply, 403, 'Forbidden')
    
    const { id } = request.params as { id: string }
    const { data } = await request.supabase!.from('woocommerce_saved_configs').select('*').eq('id', id).eq('org_id', request.user!.org_id).single()
    
    if (!data) return sendError(reply, 404, 'Not found')
    
    return { id: data.id, name: data.name, store_url: data.store_url, store_name: data.store_name, consumer_key: data.consumer_key_encrypted, consumer_secret: data.consumer_secret_encrypted, color: data.color }
  })

  // Save a new WooCommerce configuration
  fastify.post('/integrations/woocommerce/configs', {
    schema: {
      description: 'Save a new WooCommerce configuration',
      tags: ['Integrations'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['name', 'store_url', 'consumer_key', 'consumer_secret'],
        properties: { name: { type: 'string' }, store_url: { type: 'string' }, consumer_key: { type: 'string' }, consumer_secret: { type: 'string' }, color: { type: 'string' }, skip_test: { type: 'boolean' } }
      }
    },
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    if (request.user!.role !== 'admin') return sendError(reply, 403, 'Forbidden')
    
    const { name, store_url, consumer_key, consumer_secret, color, skip_test } = request.body as { name: string; store_url: string; consumer_key: string; consumer_secret: string; color?: string; skip_test?: boolean }
    
    const normalizedUrl = normalizeWooCommerceUrl(store_url)
    let testResult: { success: boolean; error?: string; store_name?: string; version?: string } = { success: false, error: '', store_name: '', version: '' }
    if (!skip_test) testResult = await testWooCommerceConnection(normalizedUrl, consumer_key, consumer_secret)
    
    const { data, error } = await request.supabase!
      .from('woocommerce_saved_configs')
      .insert({
        org_id: request.user!.org_id, name, store_url: normalizedUrl, store_name: testResult.store_name,
        consumer_key_encrypted: consumer_key, consumer_secret_encrypted: consumer_secret, color, wc_version: testResult.version,
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
  fastify.put('/integrations/woocommerce/configs/:id', {
    schema: { description: 'Update a saved WooCommerce configuration', tags: ['Integrations'], security: [{ bearerAuth: [] }] },
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    if (request.user!.role !== 'admin') return sendError(reply, 403, 'Forbidden')
    
    const { id } = request.params as { id: string }
    const body = request.body as Record<string, unknown>
    
    const updateData: Record<string, unknown> = { updated_by: request.user!.id }
    if (body.name) updateData.name = body.name
    if (body.store_url) updateData.store_url = normalizeWooCommerceUrl(body.store_url as string)
    if (body.consumer_key) updateData.consumer_key_encrypted = body.consumer_key
    if (body.consumer_secret) updateData.consumer_secret_encrypted = body.consumer_secret
    if (body.color !== undefined) updateData.color = body.color
    
    const { data } = await request.supabase!.from('woocommerce_saved_configs').update(updateData).eq('id', id).eq('org_id', request.user!.org_id).select().single()
    
    if (!data) return sendError(reply, 404, 'Not found')
    return { success: true, config: data }
  })

  // Delete a saved configuration
  fastify.delete('/integrations/woocommerce/configs/:id', {
    schema: { description: 'Delete a saved WooCommerce configuration', tags: ['Integrations'], security: [{ bearerAuth: [] }] },
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    if (request.user!.role !== 'admin') return sendError(reply, 403, 'Forbidden')
    
    const { id } = request.params as { id: string }
    await request.supabase!.from('woocommerce_saved_configs').delete().eq('id', id).eq('org_id', request.user!.org_id)
    
    return { success: true, message: 'Configuration deleted' }
  })

  // Activate a saved configuration
  fastify.post('/integrations/woocommerce/configs/:id/activate', {
    schema: { description: 'Activate a saved configuration', tags: ['Integrations'], security: [{ bearerAuth: [] }] },
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    if (request.user!.role !== 'admin') return sendError(reply, 403, 'Forbidden')
    
    const { id } = request.params as { id: string }
    const { data: config } = await request.supabase!.from('woocommerce_saved_configs').select('*').eq('id', id).eq('org_id', request.user!.org_id).single()
    
    if (!config) return sendError(reply, 404, 'Not found')
    
    const testResult = await testWooCommerceConnection(config.store_url, config.consumer_key_encrypted, config.consumer_secret_encrypted)
    
    await request.supabase!
      .from('organization_integrations')
      .upsert({
        org_id: request.user!.org_id,
        integration_type: 'woocommerce',
        settings: { store_url: config.store_url, store_name: testResult.store_name || config.store_name, config_id: config.id, config_name: config.name },
        credentials_encrypted: JSON.stringify({ consumer_key: config.consumer_key_encrypted, consumer_secret: config.consumer_secret_encrypted }),
        is_active: true,
        is_connected: testResult.success,
        last_connected_at: testResult.success ? new Date().toISOString() : null,
        last_error: testResult.error,
        updated_by: request.user!.id
      }, { onConflict: 'org_id,integration_type' })
    
    await request.supabase!.from('woocommerce_saved_configs').update({ last_tested_at: new Date().toISOString(), last_test_success: testResult.success, store_name: testResult.store_name || config.store_name, wc_version: testResult.version || config.wc_version }).eq('id', id)
    
    return { success: true, connected: testResult.success, config_name: config.name, message: testResult.success ? `Switched to "${config.name}" and connected!` : `Switched to "${config.name}" but connection failed` }
  })
}

export default woocommerceRoutes
