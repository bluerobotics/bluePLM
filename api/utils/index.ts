/**
 * Utils Barrel Export
 */

// Crypto utilities
export { computeHash, generateWebhookSecret, signWebhookPayload } from './crypto.js'

// File utilities
export { getFileTypeFromExtension } from './files.js'

// Odoo integration
export { 
  odooXmlRpc,
  normalizeOdooUrl, 
  testOdooConnection, 
  fetchOdooSuppliers,
  getLastXmlResponses,
  clearLastXmlResponses
} from './odoo.js'

// Webhooks
export { webhooks, triggerWebhooks } from './webhooks.js'
