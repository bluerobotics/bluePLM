/**
 * JSON Schema Barrel Export
 *
 * Re-exports all schemas as a single `schemas` object for backwards compatibility
 * with the original server.ts structure.
 */

import { errorSchema, userSchema } from './common.js'
import { webhookSchema } from './webhook.js'

// Named exports for individual schema imports
export { errorSchema, userSchema } from './common.js'
export { webhookSchema } from './webhook.js'

// Combined schemas object for backwards compatibility
export const schemas = {
  error: errorSchema,
  user: userSchema,
  webhook: webhookSchema,
} as const
