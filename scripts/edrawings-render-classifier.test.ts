import { describe, expect, it } from 'vitest'

// eslint-disable-next-line @typescript-eslint/no-require-imports -- The smoke harness runs in Electron CommonJS.
const { classifyRenderedVisual } = require('./edrawings-render-classifier.cjs') as {
  classifyRenderedVisual: (visual: Record<string, number | boolean>) => string
}

const visual = (values: Partial<Record<string, number | boolean>> = {}) => ({
  available: true,
  nearBlackRatio: 0,
  brightRatio: 0,
  averageLuminance: 126,
  luminanceVariance: 4_500,
  ...values,
})

describe('eDrawings render classifier', () => {
  it('identifies a nearly uniform black viewport', () => {
    expect(classifyRenderedVisual(visual({ nearBlackRatio: 0.99, averageLuminance: 5, luminanceVariance: 2 }))).toBe('black')
  })

  it('identifies a black-majority viewport despite bright or varied pixels', () => {
    expect(classifyRenderedVisual(visual({ nearBlackRatio: 0.9, averageLuminance: 40, luminanceVariance: 5_000 }))).toBe('black')
  })

  it('identifies a uniform dark gray viewport independently of brightness ratio', () => {
    expect(classifyRenderedVisual(visual({ averageLuminance: 50, luminanceVariance: 12 }))).toBe('flat-gray')
  })

  it('identifies a uniform mid-gray viewport independently of brightness ratio', () => {
    expect(classifyRenderedVisual(visual({ averageLuminance: 128, luminanceVariance: 80 }))).toBe('flat-gray')
  })

  it('identifies a nearly uniform white viewport', () => {
    expect(classifyRenderedVisual(visual({ brightRatio: 0.99, averageLuminance: 245, luminanceVariance: 10 }))).toBe('flat-white')
  })

  it('preserves a varied model or mixed viewport', () => {
    expect(classifyRenderedVisual(visual())).toBe('model-or-mixed')
  })
})
