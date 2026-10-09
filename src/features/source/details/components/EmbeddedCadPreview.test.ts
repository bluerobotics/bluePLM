import { describe, expect, it } from 'vitest'

import {
  hasLocalCadPreviewContent,
  supportsSolidWorksDatacard,
} from './cadPreviewCapabilities'

describe('embedded CAD preview availability', () => {
  it.each(['cloud', 'moved_away'] as const)(
    'does not start a native preview for a %s file without local content',
    (diffStatus) => {
      expect(hasLocalCadPreviewContent(diffStatus)).toBe(false)
    },
  )

  it.each([undefined, 'added', 'modified', 'moved'] as const)(
    'allows a native preview for %s local content',
    (diffStatus) => {
      expect(hasLocalCadPreviewContent(diffStatus)).toBe(true)
    },
  )
})

describe('SolidWorks datacard capability', () => {
  it.each(['.sldprt', '.sldasm', '.slddrw', '.SLDPRT'])(
    'shows the datacard for %s',
    (extension) => {
      expect(supportsSolidWorksDatacard(extension)).toBe(true)
    },
  )

  it.each(['.step', '.stp', '.stl', '.iges', '.igs', undefined])(
    'does not show the datacard for %s',
    (extension) => {
      expect(supportsSolidWorksDatacard(extension)).toBe(false)
    },
  )
})
