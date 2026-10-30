import { describe, expect, it } from 'vitest'
import { parseChangeControlRoute, paths } from './routes'

describe('parseChangeControlRoute', () => {
  it.each([
    [[], { page: 'ecoList' }],
    [['new'], { page: 'ecoNew' }],
    [['abc'], { page: 'ecoDetail', id: 'abc' }],
    [['abc', 'edit'], { page: 'ecoEdit', id: 'abc' }],
    [['deviations'], { page: 'deviationList' }],
    [['deviations', 'new'], { page: 'deviationNew' }],
    [['deviations', 'd1'], { page: 'deviationDetail', id: 'd1' }],
    [['deviations', 'd1', 'edit'], { page: 'deviationEdit', id: 'd1' }],
    [['abc', 'other'], { page: 'notFound' }],
    [['new', 'x'], { page: 'notFound' }],
    [['abc', 'edit', 'x'], { page: 'notFound' }],
    [['deviations', 'new', 'x'], { page: 'notFound' }],
    [['deviations', 'd1', 'x'], { page: 'notFound' }],
    [['deviations', 'd1', 'edit', 'x'], { page: 'notFound' }],
  ])('%j', (segments, expected) => {
    expect(parseChangeControlRoute(segments)).toEqual(expected)
  })

  it('round-trips the paths it builds', () => {
    const segs = (path: string) => path.split('/').filter(Boolean).slice(1).map(decodeURIComponent)
    expect(parseChangeControlRoute(segs(paths.eco('e/1')))).toEqual({ page: 'ecoDetail', id: 'e/1' })
    expect(parseChangeControlRoute(segs(paths.deviationEdit('d1')))).toEqual({ page: 'deviationEdit', id: 'd1' })
    expect(paths.file('f1')).toBe('/file/f1')
  })
})
