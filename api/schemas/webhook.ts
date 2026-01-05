/**
 * Webhook JSON Schema
 */

export const webhookSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    url: { type: 'string', format: 'uri' },
    events: { 
      type: 'array', 
      items: { 
        type: 'string',
        enum: ['file.checkout', 'file.checkin', 'file.sync', 'file.delete', 'file.restore', 'file.state_change', 'file.version']
      }
    },
    active: { type: 'boolean' },
    created_at: { type: 'string', format: 'date-time' }
  }
} as const
