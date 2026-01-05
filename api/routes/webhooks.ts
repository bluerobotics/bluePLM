/**
 * Webhook Routes
 * 
 * Webhook management for event notifications.
 */

import { FastifyPluginAsync } from 'fastify'
import crypto from 'crypto'
import { schemas } from '../schemas/index.js'
import { webhooks, generateWebhookSecret } from '../utils/index.js'
import type { Webhook, WebhookEvent } from '../types.js'

const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  // List webhooks
  fastify.get('/webhooks', {
    schema: {
      description: 'List webhooks',
      tags: ['Webhooks'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            webhooks: { type: 'array', items: schemas.webhook }
          }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request) => {
    const orgWebhooks = webhooks.get(request.user!.org_id!) || []
    // Return without secrets
    return { 
      webhooks: orgWebhooks.map(w => ({
        id: w.id,
        url: w.url,
        events: w.events,
        active: w.active,
        created_at: w.created_at
      }))
    }
  })
  
  // Create a webhook
  fastify.post('/webhooks', {
    schema: {
      description: 'Create a webhook',
      tags: ['Webhooks'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['url', 'events'],
        properties: {
          url: { type: 'string', format: 'uri' },
          events: { 
            type: 'array',
            items: { 
              type: 'string',
              enum: ['file.checkout', 'file.checkin', 'file.sync', 'file.delete', 'file.restore', 'file.state_change', 'file.version']
            },
            minItems: 1
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            webhook: schemas.webhook,
            secret: { type: 'string', description: 'Webhook secret (only shown once)' }
          }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request) => {
    const { url, events } = request.body as { url: string; events: WebhookEvent[] }
    
    // Only admins can create webhooks
    if (request.user!.role !== 'admin') {
      throw { statusCode: 403, message: 'Only admins can create webhooks' }
    }
    
    const webhook: Webhook = {
      id: crypto.randomUUID(),
      org_id: request.user!.org_id!,
      url,
      secret: generateWebhookSecret(),
      events,
      active: true,
      created_at: new Date().toISOString(),
      created_by: request.user!.id
    }
    
    const orgWebhooks = webhooks.get(request.user!.org_id!) || []
    orgWebhooks.push(webhook)
    webhooks.set(request.user!.org_id!, orgWebhooks)
    
    return { 
      success: true,
      webhook: {
        id: webhook.id,
        url: webhook.url,
        events: webhook.events,
        active: webhook.active,
        created_at: webhook.created_at
      },
      secret: webhook.secret // Only returned on creation
    }
  })
  
  // Delete a webhook
  fastify.delete('/webhooks/:id', {
    schema: {
      description: 'Delete a webhook',
      tags: ['Webhooks'],
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
      return reply.code(403).send({ error: 'Forbidden', message: 'Only admins can delete webhooks' })
    }
    
    const orgWebhooks = webhooks.get(request.user!.org_id!) || []
    const index = orgWebhooks.findIndex(w => w.id === id)
    
    if (index === -1) {
      return reply.code(404).send({ error: 'Not found', message: 'Webhook not found' })
    }
    
    orgWebhooks.splice(index, 1)
    webhooks.set(request.user!.org_id!, orgWebhooks)
    
    return { success: true }
  })
  
  // Update a webhook
  fastify.patch('/webhooks/:id', {
    schema: {
      description: 'Update a webhook',
      tags: ['Webhooks'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } }
      },
      body: {
        type: 'object',
        properties: {
          url: { type: 'string', format: 'uri' },
          events: { 
            type: 'array',
            items: { type: 'string' }
          },
          active: { type: 'boolean' }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const updates = request.body as Partial<Webhook>
    
    if (request.user!.role !== 'admin') {
      return reply.code(403).send({ error: 'Forbidden', message: 'Only admins can update webhooks' })
    }
    
    const orgWebhooks = webhooks.get(request.user!.org_id!) || []
    const webhook = orgWebhooks.find(w => w.id === id)
    
    if (!webhook) {
      return reply.code(404).send({ error: 'Not found', message: 'Webhook not found' })
    }
    
    if (updates.url) webhook.url = updates.url
    if (updates.events) webhook.events = updates.events as WebhookEvent[]
    if (updates.active !== undefined) webhook.active = updates.active
    
    return { 
      success: true,
      webhook: {
        id: webhook.id,
        url: webhook.url,
        events: webhook.events,
        active: webhook.active,
        created_at: webhook.created_at
      }
    }
  })
}

export default webhookRoutes
