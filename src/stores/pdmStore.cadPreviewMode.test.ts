import { describe, expect, it } from 'vitest'

import { usePDMStore } from './pdmStore'

function restoreCadPreviewMode(cadPreviewMode: unknown) {
  const merge = usePDMStore.persist.getOptions().merge
  if (!merge) throw new Error('PDM store requires a persistence merge handler')

  return merge({ cadPreviewMode }, usePDMStore.getState()).cadPreviewMode
}

describe('persisted CAD preview mode', () => {
  it.each(['thumbnail', 'edrawings', 'edrawings-embedded'] as const)(
    'retains the valid %s mode after hydration',
    (cadPreviewMode) => {
      expect(restoreCadPreviewMode(cadPreviewMode)).toBe(cadPreviewMode)
    },
  )

  it.each([undefined, null, 'not-a-preview-mode', 1, {}])(
    'falls back to thumbnail for invalid persisted mode %j',
    (cadPreviewMode) => {
      expect(restoreCadPreviewMode(cadPreviewMode)).toBe('thumbnail')
    },
  )
})
