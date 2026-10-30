/**
 * Utils Barrel Export
 */

// Error responses
export { sendError, ErrorCode } from './errors.js'

// Crypto utilities
export { computeHash, generateWebhookSecret, signWebhookPayload } from './crypto.js'

// Odoo integration (supplier sync). The read-only guarded wrapper
// (odooReadOnlyCall) left with the Customers extension, its only user.
export { normalizeOdooUrl, testOdooConnection, fetchOdooSuppliers } from './odoo.js'

// Webhooks
export { webhooks, triggerWebhooks } from './webhooks.js'
