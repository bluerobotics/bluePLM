import { describe, expect, it } from 'vitest'
import {
  formatBytes,
  isSortKey,
  nextSort,
  safeColor,
  sortFiles,
  sortFolders,
  stateLabel,
  userName,
  type FileListRow,
} from './listing'

function row(overrides: Partial<FileListRow>): FileListRow {
  return {
    id: overrides.file_name ?? 'id',
    vault_id: 'v',
    file_name: 'a.sldprt',
    file_path: 'a.sldprt',
    extension: '.sldprt',
    file_type: 'part',
    part_number: null,
    description: null,
    revision: '',
    version: 1,
    state: null,
    file_size: 0,
    content_hash: null,
    updated_at: null,
    checked_out_by: null,
    checked_out_at: null,
    checked_out_user: null,
    workflow_state: null,
    ...overrides,
  }
}

const names = (rows: FileListRow[]) => rows.map((r) => r.file_name)

describe('sortFiles', () => {
  it('sorts names naturally and case-insensitively', () => {
    const rows = [row({ file_name: 'part10' }), row({ file_name: 'Part2' }), row({ file_name: 'part1' })]
    expect(names(sortFiles(rows, { key: 'name', direction: 'asc' }))).toEqual(['part1', 'Part2', 'part10'])
    expect(names(sortFiles(rows, { key: 'name', direction: 'desc' }))).toEqual(['part10', 'Part2', 'part1'])
  })

  it('puts missing values last in both directions and breaks ties by name', () => {
    const rows = [
      row({ file_name: 'c', part_number: null }),
      row({ file_name: 'b', part_number: 'BR-2' }),
      row({ file_name: 'a', part_number: 'BR-10' }),
      row({ file_name: 'd', part_number: '  ' }),
    ]
    expect(names(sortFiles(rows, { key: 'partNumber', direction: 'asc' }))).toEqual(['b', 'a', 'c', 'd'])
    expect(names(sortFiles(rows, { key: 'partNumber', direction: 'desc' }))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('sorts numbers and dates numerically', () => {
    const rows = [
      row({ file_name: 'x', version: 10, updated_at: '2026-01-02T00:00:00Z', file_size: 900 }),
      row({ file_name: 'y', version: 9, updated_at: '2026-01-10T00:00:00Z', file_size: 10000 }),
    ]
    expect(names(sortFiles(rows, { key: 'version', direction: 'asc' }))).toEqual(['y', 'x'])
    expect(names(sortFiles(rows, { key: 'modified', direction: 'desc' }))).toEqual(['y', 'x'])
    expect(names(sortFiles(rows, { key: 'size', direction: 'asc' }))).toEqual(['x', 'y'])
  })

  it('sorts by checked-out user and state label', () => {
    const rows = [
      row({ file_name: 'free' }),
      row({ file_name: 'zed', checked_out_by: 'u2', checked_out_user: { email: 'z@x', full_name: 'Zed' } }),
      row({ file_name: 'amy', checked_out_by: 'u1', checked_out_user: { email: 'a@x', full_name: 'Amy' } }),
    ]
    expect(names(sortFiles(rows, { key: 'checkedOutBy', direction: 'asc' }))).toEqual(['amy', 'zed', 'free'])
    const states = [
      row({ file_name: 'r', workflow_state: { name: 'released', label: 'Released', color: null } }),
      row({ file_name: 'w', state: 'WIP' }),
    ]
    expect(names(sortFiles(states, { key: 'state', direction: 'asc' }))).toEqual(['r', 'w'])
  })

  it('does not mutate its input', () => {
    const rows = [row({ file_name: 'b' }), row({ file_name: 'a' })]
    sortFiles(rows, { key: 'name', direction: 'asc' })
    expect(names(rows)).toEqual(['b', 'a'])
  })
})

describe('sortFolders / nextSort / isSortKey', () => {
  it('follows the direction only when sorting by name', () => {
    expect(sortFolders(['b', 'A', 'c'], { key: 'name', direction: 'desc' })).toEqual(['c', 'b', 'A'])
    expect(sortFolders(['b', 'A', 'c'], { key: 'size', direction: 'desc' })).toEqual(['A', 'b', 'c'])
  })
  it('flips the current column and starts others ascending', () => {
    expect(nextSort({ key: 'name', direction: 'asc' }, 'name')).toEqual({ key: 'name', direction: 'desc' })
    expect(nextSort({ key: 'name', direction: 'desc' }, 'size')).toEqual({ key: 'size', direction: 'asc' })
  })
  it('recognizes sort keys', () => {
    expect(isSortKey('revision')).toBe(true)
    expect(isSortKey('file_name')).toBe(false)
    expect(isSortKey(null)).toBe(false)
  })
})

describe('labels and formatting', () => {
  it('prefers the workflow label, then its name, then the legacy state', () => {
    expect(stateLabel({ workflow_state: { name: 'rel', label: 'Released', color: null }, state: 'WIP' })).toBe('Released')
    expect(stateLabel({ workflow_state: { name: 'rel', label: null, color: null }, state: 'WIP' })).toBe('rel')
    expect(stateLabel({ workflow_state: null, state: 'WIP' })).toBe('WIP')
    expect(stateLabel({ workflow_state: null, state: null })).toBeNull()
  })
  it('names users by full name, then email', () => {
    expect(userName({ email: 'a@b', full_name: 'Ann' })).toBe('Ann')
    expect(userName({ email: 'a@b', full_name: ' ' })).toBe('a@b')
    expect(userName(null)).toBeNull()
  })
  it('passes only hex colours', () => {
    expect(safeColor('#22c55e')).toBe('#22c55e')
    expect(safeColor('#abc')).toBe('#abc')
    expect(safeColor('red; background: url(x)')).toBeNull()
    expect(safeColor('url(javascript:1)')).toBeNull()
    expect(safeColor(null)).toBeNull()
  })
  it('formats byte sizes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(250 * 1024 * 1024)).toBe('250 MB')
    expect(formatBytes(null)).toBe('')
    expect(formatBytes(-1)).toBe('')
  })
})
