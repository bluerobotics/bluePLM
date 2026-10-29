import { describe, expect, it } from 'vitest'

import { countByAction, toProfileActivity } from './profileActivity'

const base = { id: 'a1', action: 'checkout', created_at: '2026-10-29T14:03:00.000Z' }

describe('toProfileActivity', () => {
  it('takes the name and path from the joined file row', () => {
    const activity = toProfileActivity({
      ...base,
      details: { message: null },
      file: { file_name: 'BR-107599.SLDPRT', file_path: 'Products\\DORIS\\BR-107599.SLDPRT' },
    })
    expect(activity).toMatchObject({
      day: '2026-10-29',
      fileName: 'BR-107599.SLDPRT',
      filePath: 'Products/DORIS/BR-107599.SLDPRT',
      folderPath: 'Products/DORIS',
    })
  })

  it('falls back to details when the file no longer joins', () => {
    const activity = toProfileActivity({
      ...base,
      action: 'delete',
      file: null,
      details: { file_name: 'old.SLDASM', file_path: 'Archive/old.SLDASM' },
    })
    expect(activity.fileName).toBe('old.SLDASM')
    expect(activity.folderPath).toBe('Archive')
  })

  it('gives a root file an empty folder and a fileless row no path', () => {
    expect(
      toProfileActivity({ ...base, file: { file_name: null, file_path: 'top.pdf' } }),
    ).toMatchObject({ fileName: 'top.pdf', folderPath: '' })
    expect(toProfileActivity({ ...base, action: 'review_requested' })).toMatchObject({
      fileName: null,
      filePath: null,
      folderPath: null,
    })
  })
})

describe('countByAction', () => {
  it('orders actions by count', () => {
    const rows = ['checkin', 'checkout', 'checkout', 'create'].map((action, i) =>
      toProfileActivity({ ...base, id: String(i), action }),
    )
    expect(countByAction(rows)).toEqual([
      { action: 'checkout', count: 2 },
      { action: 'checkin', count: 1 },
      { action: 'create', count: 1 },
    ])
  })
})
