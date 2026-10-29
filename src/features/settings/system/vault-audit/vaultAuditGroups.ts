/**
 * The findings list as a file browser: one heading row per file, its values underneath.
 *
 * The flat table repeated the path on every value and gave each value a sliver of width, so a
 * file with six findings read as six unrelated rows and no description fitted. Grouping puts the
 * file once, where the reader looks for it, and leaves the value rows the full width.
 *
 * Pure, so the order a shift-click range follows and the per-file tick state can be pinned in a
 * test. Files keep the order their first row has in the sorted list, and rows keep their order
 * within a file, so sorting by field or resolution still means something inside each file.
 */

import type { VaultAuditFindingRow } from './vaultAuditRows'

export interface VaultAuditFileGroup {
  fileId: string
  relativePath: string
  rows: VaultAuditFindingRow[]
  /** Rows a tick can still reach. Conflict and settled rows are not among them. */
  selectableCount: number
  selectedCount: number
  settledCount: number
}

export type VaultAuditListItem =
  | { kind: 'file'; key: string; group: VaultAuditFileGroup; collapsed: boolean }
  | { kind: 'value'; key: string; row: VaultAuditFindingRow; group: VaultAuditFileGroup }

export function groupRowsByFile(rows: readonly VaultAuditFindingRow[]): VaultAuditFileGroup[] {
  const groups = new Map<string, VaultAuditFileGroup>()

  for (const row of rows) {
    const { fileId, relativePath } = row.finding
    let group = groups.get(fileId)
    if (!group) {
      group = {
        fileId,
        relativePath,
        rows: [],
        selectableCount: 0,
        selectedCount: 0,
        settledCount: 0,
      }
      groups.set(fileId, group)
    }
    group.rows.push(row)
    if (row.selectable) group.selectableCount += 1
    if (row.selectable && row.selected) group.selectedCount += 1
    if (row.settled) group.settledCount += 1
  }

  return [...groups.values()]
}

/** The rows the virtual list draws: every file heading, and the values of the expanded ones. */
export function flattenGroups(
  groups: readonly VaultAuditFileGroup[],
  collapsed: ReadonlySet<string>,
): VaultAuditListItem[] {
  const items: VaultAuditListItem[] = []
  for (const group of groups) {
    const isCollapsed = collapsed.has(group.fileId)
    items.push({ kind: 'file', key: `file:${group.fileId}`, group, collapsed: isCollapsed })
    if (isCollapsed) continue
    for (const row of group.rows) items.push({ kind: 'value', key: row.id, row, group })
  }
  return items
}

/** The rows a list displays, in display order, which is the order a shift-click range spans. */
export function rowsInDisplayOrder(groups: readonly VaultAuditFileGroup[]): VaultAuditFindingRow[] {
  return groups.flatMap((group) => group.rows)
}
