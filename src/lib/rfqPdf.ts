// RFQ PDF Generation Utility
// Generates a professional PDF document for RFQs

import type { RFQ, RFQItem } from '@/types/rfq'

export interface OrgBranding {
  name: string
  logo_url?: string | null
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  country?: string | null
  phone?: string | null
  website?: string | null
  contact_email?: string | null
  rfq_settings?: {
    default_payment_terms?: string
    default_incoterms?: string
    show_revision_column?: boolean
    show_material_column?: boolean
    show_finish_column?: boolean
    show_notes_column?: boolean
    terms_and_conditions?: string
    footer_text?: string
  }
}

interface RFQPdfOptions {
  rfq: RFQ
  items: RFQItem[]
  org: OrgBranding
}

// Generate HTML content for the RFQ
function generateRFQHtml({ rfq, items, org }: RFQPdfOptions): string {
  const settings = org.rfq_settings || {}
  
  // Build address string
  const addressParts = [
    org.address_line1,
    org.address_line2,
    [org.city, org.state, org.postal_code].filter(Boolean).join(', '),
    org.country
  ].filter(Boolean)
  
  // Build item rows
  const itemRows = items.map((item, idx) => {
    const cells = [
      `<td class="line-num">${idx + 1}</td>`,
      `<td class="part-num">${escapeHtml(item.part_number)}</td>`,
      `<td class="desc">${escapeHtml(item.description || '-')}</td>`,
    ]
    
    if (settings.show_revision_column !== false) {
      cells.push(`<td class="rev">${escapeHtml(item.revision || '-')}</td>`)
    }
    
    cells.push(`<td class="qty">${item.quantity} ${item.unit || 'ea'}</td>`)
    
    if (settings.show_material_column !== false) {
      cells.push(`<td class="material">${escapeHtml(item.material || '-')}</td>`)
    }
    
    if (settings.show_finish_column !== false) {
      cells.push(`<td class="finish">${escapeHtml(item.finish || '-')}</td>`)
    }
    
    if (settings.show_notes_column !== false) {
      cells.push(`<td class="notes">${escapeHtml(item.notes || '-')}</td>`)
    }
    
    return `<tr>${cells.join('')}</tr>`
  }).join('\n')
  
  // Build header cells
  const headerCells = [
    '<th>#</th>',
    '<th>Part Number</th>',
    '<th>Description</th>',
  ]
  
  if (settings.show_revision_column !== false) {
    headerCells.push('<th>Rev</th>')
  }
  
  headerCells.push('<th>Quantity</th>')
  
  if (settings.show_material_column !== false) {
    headerCells.push('<th>Material</th>')
  }
  
  if (settings.show_finish_column !== false) {
    headerCells.push('<th>Finish</th>')
  }
  
  if (settings.show_notes_column !== false) {
    headerCells.push('<th>Notes</th>')
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>RFQ ${rfq.rfq_number}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 11px;
      color: #1a1a1a;
      line-height: 1.4;
      padding: 40px;
      max-width: 1000px;
      margin: 0 auto;
    }
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #0066cc;
    }
    
    .company-info {
      flex: 1;
    }
    
    .company-name {
      font-size: 20px;
      font-weight: 700;
      color: #0066cc;
      margin-bottom: 8px;
    }
    
    .company-address {
      color: #666;
      font-size: 10px;
      line-height: 1.5;
    }
    
    .company-contact {
      margin-top: 8px;
      color: #666;
      font-size: 10px;
    }
    
    .rfq-title {
      text-align: right;
    }
    
    .rfq-number {
      font-size: 24px;
      font-weight: 700;
      color: #1a1a1a;
    }
    
    .rfq-label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .logo {
      max-height: 60px;
      max-width: 200px;
      margin-bottom: 10px;
    }
    
    .meta-section {
      display: flex;
      gap: 40px;
      margin-bottom: 25px;
      padding: 15px;
      background: #f8f9fa;
      border-radius: 6px;
    }
    
    .meta-group {
      flex: 1;
    }
    
    .meta-label {
      font-size: 9px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 3px;
    }
    
    .meta-value {
      font-size: 12px;
      font-weight: 500;
    }
    
    .section-title {
      font-size: 14px;
      font-weight: 600;
      color: #1a1a1a;
      margin-bottom: 12px;
      padding-bottom: 6px;
      border-bottom: 1px solid #ddd;
    }
    
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 25px;
    }
    
    .items-table th {
      background: #0066cc;
      color: white;
      padding: 10px 8px;
      text-align: left;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .items-table td {
      padding: 10px 8px;
      border-bottom: 1px solid #e5e5e5;
      vertical-align: top;
    }
    
    .items-table tr:nth-child(even) {
      background: #fafafa;
    }
    
    .items-table tr:hover {
      background: #f0f7ff;
    }
    
    .line-num {
      width: 30px;
      text-align: center;
      color: #999;
    }
    
    .part-num {
      font-weight: 600;
      color: #0066cc;
    }
    
    .qty {
      text-align: center;
      font-weight: 500;
    }
    
    .rev {
      text-align: center;
    }
    
    .notes-section {
      margin-bottom: 25px;
    }
    
    .notes-content {
      padding: 15px;
      background: #fffbeb;
      border-left: 3px solid #f59e0b;
      border-radius: 0 6px 6px 0;
      font-size: 11px;
    }
    
    .terms-section {
      margin-bottom: 25px;
    }
    
    .terms-content {
      padding: 15px;
      background: #f8f9fa;
      border-radius: 6px;
      font-size: 10px;
      color: #666;
      white-space: pre-wrap;
    }
    
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      text-align: center;
      font-size: 9px;
      color: #999;
    }
    
    .signature-section {
      margin-top: 40px;
      display: flex;
      justify-content: space-between;
      gap: 60px;
    }
    
    .signature-box {
      flex: 1;
      border-top: 1px solid #333;
      padding-top: 8px;
    }
    
    .signature-label {
      font-size: 10px;
      color: #666;
    }
    
    @media print {
      body {
        padding: 20px;
      }
      
      .items-table {
        page-break-inside: auto;
      }
      
      .items-table tr {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="company-info">
      ${org.logo_url ? `<img src="${org.logo_url}" class="logo" alt="${escapeHtml(org.name)}" />` : ''}
      <div class="company-name">${escapeHtml(org.name)}</div>
      ${addressParts.length > 0 ? `
        <div class="company-address">
          ${addressParts.map(p => escapeHtml(p!)).join('<br>')}
        </div>
      ` : ''}
      ${(org.phone || org.contact_email || org.website) ? `
        <div class="company-contact">
          ${[
            org.phone ? `Tel: ${escapeHtml(org.phone)}` : '',
            org.contact_email ? `Email: ${escapeHtml(org.contact_email)}` : '',
            org.website ? escapeHtml(org.website) : ''
          ].filter(Boolean).join(' • ')}
        </div>
      ` : ''}
    </div>
    <div class="rfq-title">
      <div class="rfq-label">Request for Quote</div>
      <div class="rfq-number">${escapeHtml(rfq.rfq_number)}</div>
    </div>
  </div>
  
  <div class="meta-section">
    <div class="meta-group">
      <div class="meta-label">RFQ Title</div>
      <div class="meta-value">${escapeHtml(rfq.title)}</div>
    </div>
    <div class="meta-group">
      <div class="meta-label">Date Issued</div>
      <div class="meta-value">${new Date().toLocaleDateString()}</div>
    </div>
    ${rfq.due_date ? `
      <div class="meta-group">
        <div class="meta-label">Quote Due By</div>
        <div class="meta-value">${new Date(rfq.due_date).toLocaleDateString()}</div>
      </div>
    ` : ''}
    ${rfq.required_date ? `
      <div class="meta-group">
        <div class="meta-label">Delivery Required</div>
        <div class="meta-value">${new Date(rfq.required_date).toLocaleDateString()}</div>
      </div>
    ` : ''}
  </div>
  
  ${rfq.description ? `
    <div class="notes-section">
      <div class="section-title">Project Description</div>
      <div class="notes-content">${escapeHtml(rfq.description)}</div>
    </div>
  ` : ''}
  
  <div class="section-title">Items (${items.length})</div>
  <table class="items-table">
    <thead>
      <tr>
        ${headerCells.join('\n        ')}
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>
  
  ${rfq.supplier_notes ? `
    <div class="notes-section">
      <div class="section-title">Notes to Supplier</div>
      <div class="notes-content">${escapeHtml(rfq.supplier_notes)}</div>
    </div>
  ` : ''}
  
  ${settings.terms_and_conditions ? `
    <div class="terms-section">
      <div class="section-title">Terms and Conditions</div>
      <div class="terms-content">${escapeHtml(settings.terms_and_conditions)}</div>
    </div>
  ` : ''}
  
  <div class="signature-section">
    <div class="signature-box">
      <div class="signature-label">Supplier Signature / Date</div>
    </div>
    <div class="signature-box">
      <div class="signature-label">Print Name / Title</div>
    </div>
  </div>
  
  <div class="footer">
    ${settings.footer_text ? escapeHtml(settings.footer_text) : `Generated by BluePDM • ${new Date().toLocaleString()}`}
  </div>
</body>
</html>
`
}

// Helper to escape HTML
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Generate and open RFQ as PDF (saves HTML and opens in browser for printing)
export async function generateRFQPdf(options: RFQPdfOptions): Promise<void> {
  const html = generateRFQHtml(options)
  
  // Check if we're in Electron
  const api = window.electronAPI
  if (api) {
    // Use Electron's save dialog
    const defaultName = `${options.rfq.rfq_number}.html`
    const saveResult = await api.showSaveDialog(defaultName)
    
    if (!saveResult.success || !saveResult.path) {
      // User cancelled
      return
    }
    
    // Convert HTML to base64 for the writeFile API
    const base64Data = btoa(unescape(encodeURIComponent(html)))
    const writeResult = await api.writeFile(saveResult.path, base64Data)
    
    if (!writeResult.success) {
      throw new Error(writeResult.error || 'Failed to save file')
    }
    
    // Open the saved file in the default browser
    await api.openFile(saveResult.path)
  } else {
    // Fallback for browser environment
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    
    const a = document.createElement('a')
    a.href = url
    a.download = `${options.rfq.rfq_number}.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
}

// Generate and download RFQ as HTML (can be converted to PDF later)
export function downloadRFQHtml(options: RFQPdfOptions): void {
  const html = generateRFQHtml(options)
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  
  const a = document.createElement('a')
  a.href = url
  a.download = `${options.rfq.rfq_number}.html`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

