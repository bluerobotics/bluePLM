import { describe, expect, it } from 'vitest'

import { resolveCadPreviewVariant } from './cadPreviewVariant'

describe('CAD preview variant', () => {
  it('keeps the SolidWorks datacard unless embedded preview is selected', () => {
    expect(
      resolveCadPreviewVariant({
        mode: 'thumbnail',
        solidWorks: true,
        hasThumbnail: true,
        eDrawingsInstalled: true,
      }),
    ).toBe('datacard')
    expect(
      resolveCadPreviewVariant({
        mode: 'edrawings-embedded',
        solidWorks: true,
        hasThumbnail: false,
        eDrawingsInstalled: true,
      }),
    ).toBe('embedded')
  })

  it('selects the configured generic CAD fallback without hiding missing prerequisites', () => {
    expect(
      resolveCadPreviewVariant({
        mode: 'edrawings',
        solidWorks: false,
        hasThumbnail: false,
        eDrawingsInstalled: false,
      }),
    ).toBe('missing-edrawings')
    expect(
      resolveCadPreviewVariant({
        mode: 'thumbnail',
        solidWorks: false,
        hasThumbnail: true,
        eDrawingsInstalled: false,
      }),
    ).toBe('thumbnail')
    expect(
      resolveCadPreviewVariant({
        mode: 'thumbnail',
        solidWorks: false,
        hasThumbnail: false,
        eDrawingsInstalled: true,
      }),
    ).toBe('external-fallback')
    expect(
      resolveCadPreviewVariant({
        mode: 'thumbnail',
        solidWorks: false,
        hasThumbnail: false,
        eDrawingsInstalled: false,
      }),
    ).toBe('unavailable')
  })

  it('never selects the native host where embedded preview placement is unavailable', () => {
    expect(
      resolveCadPreviewVariant({
        mode: 'edrawings-embedded',
        solidWorks: false,
        hasThumbnail: true,
        eDrawingsInstalled: true,
        embeddedAvailable: false,
      }),
    ).toBe('external-fallback')
    expect(
      resolveCadPreviewVariant({
        mode: 'edrawings-embedded',
        solidWorks: true,
        hasThumbnail: true,
        eDrawingsInstalled: true,
        embeddedAvailable: false,
      }),
    ).toBe('datacard')
  })
})
