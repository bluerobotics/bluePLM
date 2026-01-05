/**
 * JSON Schema Barrel Export
 * 
 * Re-exports all schemas as a single `schemas` object for backwards compatibility
 * with the original server.ts structure.
 */

import { errorSchema, userSchema } from './common.js'
import { fileSchema } from './file.js'
import { vaultSchema } from './vault.js'
import { webhookSchema } from './webhook.js'
import { supplierSchema, partSupplierSchema } from './supplier.js'

// Named exports for individual schema imports
export { errorSchema, userSchema } from './common.js'
export { fileSchema } from './file.js'
export { vaultSchema } from './vault.js'
export { webhookSchema } from './webhook.js'
export { supplierSchema, partSupplierSchema } from './supplier.js'

// Combined schemas object for backwards compatibility
export const schemas = {
  error: errorSchema,
  user: userSchema,
  file: fileSchema,
  vault: vaultSchema,
  webhook: webhookSchema,
  supplier: supplierSchema,
  partSupplier: partSupplierSchema
} as const
