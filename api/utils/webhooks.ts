/**
 * Webhook Utility Functions
 */

import type { FastifyInstance } from 'fastify'
import type { Webhook, WebhookEvent, WebhookPayload } from '../types.js'
import { signWebhookPayload } from './crypto.js'

// In-memory webhook store (in production, use database)
export const webhooks: Map<string, Webhook[]> = new Map()

function isPrivateUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString)
    const hostname = parsed.hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true
    if (hostname === '[::1]') return true
    const parts = hostname.split('.')
    if (parts[0] === '10') return true
    if (parts[0] === '172') {
      const second = parseInt(parts[1], 10)
      if (second >= 16 && second <= 31) return true
    }
    if (parts[0] === '192' && parts[1] === '168') return true
    if (parts[0] === '169' && parts[1] === '254') return true
    if (hostname.endsWith('.internal') || hostname.endsWith('.local')) return true
    return false
  } catch {
    return true
  }
}

/**
 * Trigger webhooks for an event
 */
export async function triggerWebhooks(
  orgId: string,
  event: WebhookEvent,
  data: WebhookPayload['data'],
  log: FastifyInstance['log'],
): Promise<void> {
  const orgWebhooks = webhooks.get(orgId) || []
  const activeWebhooks = orgWebhooks.filter((w) => w.active && w.events.includes(event))

  if (activeWebhooks.length === 0) return

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    org_id: orgId,
    data,
  }

  const payloadString = JSON.stringify(payload)

  for (const webhook of activeWebhooks) {
    if (isPrivateUrl(webhook.url)) {
      log.warn(
        { webhookId: webhook.id, url: webhook.url },
        'Blocked webhook to private/internal URL',
      )
      continue
    }

    try {
      const signature = signWebhookPayload(payloadString, webhook.secret)

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BluePLM-Signature': signature,
          'X-BluePLM-Event': event,
        },
        body: payloadString,
        signal: AbortSignal.timeout(10000), // 10s timeout
      })

      if (!response.ok) {
        log.warn({ webhookId: webhook.id, status: response.status }, 'Webhook delivery failed')
      }
    } catch (error) {
      log.error({ webhookId: webhook.id, error: error }, 'Webhook delivery error')
    }
  }
}
