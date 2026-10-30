import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RFQ, RFQItem } from '@/types/rfq'
import { downloadRFQHtml, generateRFQPdf } from './rfqPdf'
import { buildRFQHtml } from './rfqPdfDocument'

const rfq: RFQ = {
  id: 'rfq-1',
  org_id: 'org-1',
  rfq_number: 'RFQ-1042',
  title: 'Precision bracket',
  description: 'Quote the listed machined component.',
  status: 'ready',
  due_date: '2026-10-30T00:00:00.000Z',
  required_date: '2026-11-07T00:00:00.000Z',
  valid_until: '2026-11-20T00:00:00.000Z',
  is_samples_required: true,
  is_first_article_required: false,
  is_quality_report_required: true,
  is_partial_quote_allowed: false,
  is_release_files_generated: false,
  release_files_generated_at: null,
  release_folder_path: null,
  billing_address_id: 'billing-1',
  shipping_address_id: 'shipping-1',
  shipping_address: null,
  shipping_notes: null,
  incoterms: 'DAP',
  internal_notes: 'Internal review complete.',
  supplier_notes: 'Include material certificate.',
  created_at: '2026-10-17T09:30:00.000Z',
  created_by: 'user-1',
  updated_at: '2026-10-17T09:30:00.000Z',
  updated_by: null,
  sent_at: null,
  sent_by: null,
  completed_at: null,
}

const items: RFQItem[] = [
  {
    id: 'item-1',
    rfq_id: 'rfq-1',
    line_number: 1,
    file_id: 'file-1',
    part_number: 'BRK-204',
    description: 'Mounting bracket',
    revision: 'B',
    quantity: 25,
    unit: 'pcs',
    material: '6061-T6 Aluminum',
    finish: 'Clear anodize',
    tolerance_class: 'ISO 2768-m',
    special_requirements: 'Deburr all edges.',
    sw_configuration: null,
    step_file_path: null,
    pdf_file_path: null,
    step_file_generated: false,
    pdf_file_generated: false,
    step_file_size: null,
    pdf_file_size: null,
    step_storage_path: null,
    pdf_storage_path: null,
    attachments: [],
    notes: 'Keep flatness within drawing tolerance.',
    created_at: '2026-10-17T09:30:00.000Z',
    updated_at: '2026-10-17T09:30:00.000Z',
    file: {
      id: 'file-1',
      file_name: 'BRK-204.SLDPRT',
      file_path: 'vault/BRK-204.SLDPRT',
      part_number: 'BRK-204',
      description: 'Mounting bracket',
      revision: 'B',
      version: 3,
      file_type: 'part',
      extension: 'SLDPRT',
    },
  },
]

const org = {
  name: 'Blue Example Manufacturing',
  logo_url: null,
  address_line1: '100 Industrial Way',
  address_line2: null,
  city: 'Springfield',
  state: 'Ohio',
  postal_code: '45502',
  country: 'USA',
  phone: '+1 555 0100',
  website: 'https://example.invalid',
  contact_email: 'purchasing@example.invalid',
  billing_address: {
    label: 'Billing',
    attention_to: 'Accounts Payable',
    address_line1: '100 Industrial Way',
    address_line2: null,
    city: 'Springfield',
    state: 'Ohio',
    postal_code: '45502',
    country: 'USA',
    phone: '+1 555 0100',
  },
  shipping_address: {
    label: 'Receiving',
    attention_to: 'Dock 4',
    address_line1: '200 Receiving Road',
    address_line2: null,
    city: 'Springfield',
    state: 'Ohio',
    postal_code: '45503',
    country: 'USA',
    phone: '+1 555 0199',
  },
  rfq_settings: {
    default_payment_terms: 'Net 30',
    default_incoterms: 'DAP',
    show_revision_column: true,
    show_material_column: true,
    show_finish_column: true,
    show_notes_column: true,
    terms_and_conditions: 'Pricing must remain valid for 30 days.',
    footer_text: 'Thank you for your quotation.',
  },
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('RFQ PDF document extraction baseline', () => {
  it.each([
    {
      name: 'legacy address and optional columns disabled',
      rfq,
      items,
      org: {
        ...org,
        billing_address: null,
        shipping_address: null,
        rfq_settings: {
          ...org.rfq_settings,
          show_revision_column: false,
          show_material_column: false,
          show_finish_column: false,
          show_notes_column: false,
        },
      },
    },
    {
      name: 'logo and decimal quantity',
      rfq,
      items: [{ ...items[0], quantity: 2.5, unit: 'kg' }],
      org: { ...org, logo_url: 'https://example.invalid/logo.png' },
    },
    {
      name: 'shipping only and no optional dates',
      rfq: { ...rfq, due_date: null, required_date: null, valid_until: null },
      items,
      org: { ...org, billing_address: null, address_line1: null },
    },
  ])('captures formatter markup: $name', ({ rfq, items, org }) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-18T12:00:00.000Z'))
    vi.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(function (this: Date) {
      return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC' }).format(this)
    })
    vi.spyOn(Date.prototype, 'toLocaleString').mockImplementation(function (this: Date) {
      return new Intl.DateTimeFormat('en-US', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'UTC',
      }).format(this)
    })
    expect(JSON.stringify(buildRFQHtml({ rfq, items, org }))).toMatchSnapshot()
  })

  it('captures the existing renderer formatter markup for a fixed RFQ fixture', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-18T12:00:00.000Z'))
    vi.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(function (this: Date) {
      return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC' }).format(this)
    })
    vi.spyOn(Date.prototype, 'toLocaleString').mockImplementation(function (this: Date) {
      return new Intl.DateTimeFormat('en-US', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'UTC',
      }).format(this)
    })

    let capturedHtml = ''
    vi.stubGlobal('window', {
      electronAPI: {
        generatePdfFromHtml: vi.fn(async (html: string) => {
          capturedHtml = html
          return { success: true }
        }),
      },
    })

    const result = await generateRFQPdf({ rfq, items, org, outputPath: 'fixture.pdf' })

    expect(result).toEqual({ success: true, path: 'fixture.pdf' })
    expect(capturedHtml).toBe(buildRFQHtml({ rfq, items, org }))
    expect(capturedHtml).toMatchSnapshot()
  })

  it('keeps both existing HTML fallback paths on the same document bytes', async () => {
    const builtHtml = buildRFQHtml({ rfq, items, org })
    const blobHtml: string[] = []
    const anchor = { href: '', download: '', click: vi.fn() }
    const NativeBlob = Blob
    class CapturedBlob extends NativeBlob {
      constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options)
        blobHtml.push(String(parts[0]))
      }
    }
    const urlApi = {
      createObjectURL: vi.fn(() => 'blob:rfq-fixture'),
      revokeObjectURL: vi.fn(),
    }
    const documentApi = {
      createElement: vi.fn(() => anchor),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
    }
    vi.stubGlobal('window', {})
    vi.stubGlobal('Blob', CapturedBlob)
    vi.stubGlobal('URL', urlApi)
    vi.stubGlobal('document', documentApi)

    const result = await generateRFQPdf({ rfq, items, org })
    expect(result).toEqual({ success: true })
    expect(blobHtml[0]).toBe(builtHtml)
    expect(anchor.download).toBe('RFQ-1042.html')

    blobHtml.length = 0
    downloadRFQHtml({ rfq, items, org })
    expect(blobHtml[0]).toBe(builtHtml)
    expect(anchor.download).toBe('RFQ-1042.html')
  })
})
