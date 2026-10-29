import { describe, expect, it } from 'vitest'

import type { VaultAuditFinding } from '@/types/vaultAudit'

import { flattenGroups, groupRowsByFile, rowsInDisplayOrder } from './vaultAuditGroups'
import type { VaultAuditFindingRow } from './vaultAuditRows'

function rowOf(
  id: string,
  fileId: string,
  state: Partial<Pick<VaultAuditFindingRow, 'selectable' | 'selected' | 'settled'>> = {},
): VaultAuditFindingRow {
  const finding = {
    id,
    fileId,
    relativePath: `Folder\\${fileId}.SLDPRT`,
  } as VaultAuditFinding
  return {
    id,
    finding,
    action: { kind: 'write-to-file', available: true },
    selectionId: fileId,
    selectable: state.selectable ?? true,
    selected: state.selected ?? false,
    settled: state.settled ?? false,
    availability: null,
    conflict: null,
  } as VaultAuditFindingRow
}

describe('groupRowsByFile', () => {
  // Sorting by field interleaves files. Each file still appears once, where its first row was.
  it('orders files by their first row and keeps row order inside each file', () => {
    const rows = [rowOf('a1', 'A'), rowOf('b1', 'B'), rowOf('a2', 'A'), rowOf('c1', 'C')]
    const groups = groupRowsByFile(rows)

    expect(groups.map((group) => group.fileId)).toEqual(['A', 'B', 'C'])
    expect(groups[0]?.rows.map((row) => row.id)).toEqual(['a1', 'a2'])
    expect(rowsInDisplayOrder(groups).map((row) => row.id)).toEqual(['a1', 'a2', 'b1', 'c1'])
  })

  it('counts selected rows only among the ones a tick can reach', () => {
    const [group] = groupRowsByFile([
      rowOf('a1', 'A', { selected: true }),
      rowOf('a2', 'A', { selectable: false, selected: true }),
      rowOf('a3', 'A', { selectable: false, settled: true }),
    ])

    expect(group?.selectableCount).toBe(1)
    expect(group?.selectedCount).toBe(1)
    expect(group?.settledCount).toBe(1)
  })
})

describe('flattenGroups', () => {
  it('keeps a collapsed file heading and drops its values', () => {
    const groups = groupRowsByFile([rowOf('a1', 'A'), rowOf('a2', 'A'), rowOf('b1', 'B')])
    const items = flattenGroups(groups, new Set(['A']))

    expect(items.map((item) => item.key)).toEqual(['file:A', 'file:B', 'b1'])
    expect(items[0]).toMatchObject({ kind: 'file', collapsed: true })
  })
})
