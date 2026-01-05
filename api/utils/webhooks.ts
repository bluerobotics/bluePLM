/**
 * Webhook Utility Functions
 */

import type { FastifyInstance } from 'fastify'
import type { Webhook, WebhookEvent, WebhookPayload } from '../types.js'
import { signWebhookPayload } from './crypto.js'

// In-memory webhook store (in production, use database)
export const webhooks: Map<string, Webhook[]> = new Map()

/**
 * Trigger webhooks for an event
 */
export async function triggerWebhooks(
  orgId: string, 
  event: WebhookEvent, 
  data: WebhookPayload['data'],
  log: FastifyInstance['log']
): Promise<void> {
  const orgWebhooks = webhooks.get(orgId) || []
  const activeWebhooks = orgWebhooks.filter(w => w.active && w.events.includes(event))
  
  if (activeWebhooks.length === 0) return
  
  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    org_id: orgId,
    data
  }
  
  const payloadString = JSON.stringify(payload)
  
  for (const webhook of activeWebhooks) {
    try {
      const signature = signWebhookPayload(payloadString, webhook.secret)
      
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BluePLM-Signature': signature,
          'X-BluePLM-Event': event
        },
        body: payloadString,
        signal: AbortSignal.timeout(10000) // 10s timeout
      })
      
      if (!response.ok) {
        log.warn({ webhookId: webhook.id, status: response.status }, 'Webhook delivery failed')
      }
    } catch (err) {
      log.error({ webhookId: webhook.id, error: err }, 'Webhook delivery error')
    }
  }
}
