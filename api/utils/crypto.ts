/**
 * Cryptographic Utility Functions
 */

import crypto from 'crypto'

/**
 * Compute SHA-256 hash of content
 */
export function computeHash(content: Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex')
}

/**
 * Generate a random webhook secret
 */
export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Sign a webhook payload with HMAC-SHA256
 */
export function signWebhookPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}
