/**
 * Common JSON Schemas
 * 
 * Error and user response schemas used across endpoints.
 */

export const errorSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' },
    message: { type: 'string' },
    details: { type: 'array', items: { type: 'object' } }
  }
} as const

export const userSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    email: { type: 'string', format: 'email' },
    full_name: { type: ['string', 'null'] },
    role: { type: 'string', enum: ['admin', 'engineer', 'viewer'] },
    org_id: { type: ['string', 'null'] }
  }
} as const
