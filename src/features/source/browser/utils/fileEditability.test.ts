import { describe, expect, it } from 'vitest'

import { getNoContentBlock } from './fileEditability'

describe('getNoContentBlock', () => {
  it('blocks a moved_away stub and names where the content went', () => {
    expect(
      getNoContentBlock({
        diffStatus: 'moved_away',
        movedToRelativePath: 'Assemblies/heatsink-top.sldprt',
      }),
    ).toEqual({
      kind: 'moved_away',
      movedToRelativePath: 'Assemblies/heatsink-top.sldprt',
    })
  })

  it('blocks a deleted ghost', () => {
    expect(getNoContentBlock({ diffStatus: 'deleted' })).toEqual({ kind: 'deleted' })
  })

  it('blocks a cloud-only row', () => {
    expect(getNoContentBlock({ diffStatus: 'cloud' })).toEqual({ kind: 'cloud' })
  })

  it.each([undefined, 'modified', 'added', 'moved', 'outdated'] as const)(
    'leaves a row with a file on disk alone (%s)',
    (diffStatus) => {
      expect(getNoContentBlock({ diffStatus })).toBeNull()
    },
  )
})
