// RFQ PDF Generation Utility
// Generates a professional PDF document for RFQs

import { buildRFQHtml, type RFQPdfDocumentInput } from './rfqPdfDocument'
export type { AddressInfo, OrgBranding } from './rfqPdfDocument'
import { log } from './logger'
import { saveBlobAs } from './browserDownload'

interface RFQPdfOptions extends RFQPdfDocumentInput {
  outputPath?: string // If provided, saves directly to this path without showing dialog
}

// Generate and save RFQ as PDF
export async function generateRFQPdf(
  options: RFQPdfOptions,
): Promise<{ success: boolean; path?: string; error?: string }> {
  const html = buildRFQHtml(options)

  // Check if we're in Electron
  const api = window.electronAPI
  if (api) {
    let outputPath: string

    // If outputPath is provided, save directly without dialog
    if (options.outputPath) {
      outputPath = options.outputPath
      // Ensure .pdf extension
      if (!outputPath.toLowerCase().endsWith('.pdf')) {
        outputPath += '.pdf'
      }
    } else {
      // Use Electron's save dialog - default to PDF
      const defaultName = `${options.rfq.rfq_number}.pdf`

      const saveResult = await api.showSaveDialog(defaultName)

      if (!saveResult.success || !saveResult.path) {
        // User cancelled
        return { success: false, error: 'Cancelled' }
      }

      // Ensure .pdf extension
      outputPath = saveResult.path
      if (!outputPath.toLowerCase().endsWith('.pdf')) {
        outputPath += '.pdf'
      }
    }

    // Generate PDF using Electron's printToPDF
    const pdfResult = await api.generatePdfFromHtml(html, outputPath)

    if (!pdfResult.success) {
      log.error('[RFQ PDF]', 'Failed to generate PDF', { error: pdfResult.error })
      throw new Error(pdfResult.error || 'Failed to generate PDF')
    }

    // Only open the PDF if it was saved via dialog (user interaction)
    if (!options.outputPath) {
      await api.openFile(outputPath)
    }

    return { success: true, path: outputPath }
  } else {
    // Fallback for browser environment - still saves HTML
    // (PDF generation requires Electron)
    saveBlobAs(`${options.rfq.rfq_number}.html`, new Blob([html], { type: 'text/html' }))

    return { success: true }
  }
}

// Generate and download RFQ as HTML (fallback when PDF generation is not available)
export function downloadRFQHtml(options: RFQPdfOptions): void {
  const html = buildRFQHtml(options)
  saveBlobAs(`${options.rfq.rfq_number}.html`, new Blob([html], { type: 'text/html' }))
}
