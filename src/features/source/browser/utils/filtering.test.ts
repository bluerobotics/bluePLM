/**
 * `getSearchScore` normally ranks filename matches above everything else. The exception is an
 * item-number query - a run of six or more digits, like `100234` or `BR-100234` - where a match
 * on the item/part number should outrank a filename-only match, since the user is clearly
 * searching by number, not by name.
 */

import { describe, expect, it } from 'vitest'

import type { LocalFile } from '@/stores/pdmStore'
import type { PDMFile } from '@/types/pdm'

import { getSearchScore, looksLikeItemNumber } from './filtering'

function localFile(
  name: string,
  overrides: { partNumber?: string } & Partial<LocalFile> = {},
): LocalFile {
  const { partNumber, ...rest } = overrides
  return {
    name,
    path: `C:\\vault\\${name}`,
    relativePath: name,
    isDirectory: false,
    extension: `.${name.split('.').pop()}`,
    size: 1,
    modifiedTime: 'now',
    ...(partNumber ? { pdmData: { part_number: partNumber } as PDMFile } : {}),
    ...rest,
  } as LocalFile
}

describe('looksLikeItemNumber', () => {
  it('matches a bare six-digit run', () => {
    expect(looksLikeItemNumber('100234')).toBe(true)
  })

  it('matches a six-digit run inside a prefixed number', () => {
    expect(looksLikeItemNumber('br-100234')).toBe(true)
  })

  it('does not match a plain name', () => {
    expect(looksLikeItemNumber('bracket')).toBe(false)
  })

  it('does not match a run shorter than six digits', () => {
    expect(looksLikeItemNumber('12345')).toBe(false)
  })
})

describe('getSearchScore - item-number queries', () => {
  it('ranks an item-number match above a filename-only match for a bare number', () => {
    const filenameHit = localFile('BR-100234-obsolete.sldprt', { partNumber: 'BR-999999' })
    const itemNumberHit = localFile('bracket.sldprt', { partNumber: 'BR-100234' })

    expect(getSearchScore(itemNumberHit, '100234')).toBeGreaterThan(
      getSearchScore(filenameHit, '100234'),
    )
  })

  it('ranks an item-number match above a filename-only match for a prefixed number', () => {
    const filenameHit = localFile('BR-100234-obsolete.sldprt', { partNumber: 'BR-999999' })
    const itemNumberHit = localFile('bracket.sldprt', { partNumber: 'BR-100234' })

    expect(getSearchScore(itemNumberHit, 'BR-100234')).toBeGreaterThan(
      getSearchScore(filenameHit, 'BR-100234'),
    )
  })
})

describe('getSearchScore - plain-name queries unchanged', () => {
  it('still ranks a filename match above an item-number match', () => {
    const filenameHit = localFile('bracket.sldprt', { partNumber: 'WIDGET-1' })
    const itemNumberHit = localFile('widget.sldprt', { partNumber: 'BRACKET-1' })

    expect(getSearchScore(filenameHit, 'bracket')).toBeGreaterThan(
      getSearchScore(itemNumberHit, 'bracket'),
    )
  })
})
