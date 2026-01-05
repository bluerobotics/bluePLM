/**
 * Vault JSON Schema
 */

export const vaultSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    org_id: { type: 'string', format: 'uuid' }
  }
} as const
