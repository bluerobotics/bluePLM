/**
 * Supplier JSON Schemas
 */

export const supplierSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    code: { type: ['string', 'null'] },
    contact_name: { type: ['string', 'null'] },
    contact_email: { type: ['string', 'null'] },
    contact_phone: { type: ['string', 'null'] },
    website: { type: ['string', 'null'] },
    address_line1: { type: ['string', 'null'] },
    city: { type: ['string', 'null'] },
    state: { type: ['string', 'null'] },
    postal_code: { type: ['string', 'null'] },
    country: { type: 'string' },
    payment_terms: { type: ['string', 'null'] },
    default_lead_time_days: { type: ['integer', 'null'] },
    min_order_value: { type: ['number', 'null'] },
    currency: { type: 'string' },
    is_active: { type: 'boolean' },
    is_approved: { type: 'boolean' },
    notes: { type: ['string', 'null'] },
    erp_id: { type: ['string', 'null'] }
  }
} as const

export const partSupplierSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    file_id: { type: 'string', format: 'uuid' },
    supplier_id: { type: 'string', format: 'uuid' },
    supplier_part_number: { type: ['string', 'null'] },
    supplier_description: { type: ['string', 'null'] },
    supplier_url: { type: ['string', 'null'] },
    unit_price: { type: ['number', 'null'] },
    currency: { type: 'string' },
    price_unit: { type: 'string' },
    price_breaks: { 
      type: 'array',
      items: {
        type: 'object',
        properties: {
          qty: { type: 'integer' },
          price: { type: 'number' }
        }
      }
    },
    min_order_qty: { type: 'integer' },
    order_multiple: { type: 'integer' },
    lead_time_days: { type: ['integer', 'null'] },
    is_preferred: { type: 'boolean' },
    is_active: { type: 'boolean' },
    is_qualified: { type: 'boolean' },
    notes: { type: ['string', 'null'] }
  }
} as const
