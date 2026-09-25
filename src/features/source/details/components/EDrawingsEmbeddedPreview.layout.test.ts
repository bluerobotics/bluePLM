import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SOURCE_ROOT = join(process.cwd(), 'src', 'features', 'source', 'details')

describe('embedded eDrawings preview layout', () => {
  it('keeps a full-height host rectangle for the native preview window', () => {
    const source = readFileSync(join(SOURCE_ROOT, 'components', 'EDrawingsEmbeddedPreview.tsx'), 'utf8')

    expect(source).toMatch(/ref=\{host\}[^>]+className="[^"]*\bh-full\b[^"]*"/)
  })

  it.each(['.sldprt', '.sldasm'])('routes %s through the same embedded preview', (extension) => {
    const source = readFileSync(join(SOURCE_ROOT, 'DetailsPanel.tsx'), 'utf8')

    expect(source).toContain(`'${extension}'`)
    expect(source).toContain("cadPreviewMode === 'edrawings-embedded'")
    expect(source).toContain('<EDrawingsEmbeddedPreview')
  })
})
