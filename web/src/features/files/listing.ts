// Row shapes for the folder browser and file detail, and the pure mapping and sorting over them.

export interface UserRef {
  id?: string
  email: string | null
  full_name: string | null
}

export interface WorkflowStateRef {
  name: string
  label: string | null
  color: string | null
}

/** A `files` row as the browser selects it (see FILE_LIST_COLUMNS in api.ts). */
export interface FileListRow {
  id: string
  vault_id: string | null
  file_name: string
  file_path: string
  extension: string
  file_type: string
  part_number: string | null
  description: string | null
  revision: string
  version: number
  state: string | null
  file_size: number | null
  content_hash: string | null
  updated_at: string | null
  checked_out_by: string | null
  checked_out_at: string | null
  checked_out_user: UserRef | null
  workflow_state: WorkflowStateRef | null
}

export type SortKey =
  | 'name'
  | 'partNumber'
  | 'description'
  | 'revision'
  | 'version'
  | 'state'
  | 'checkedOutBy'
  | 'modified'
  | 'size'

export const SORT_KEYS: readonly SortKey[] = [
  'name',
  'partNumber',
  'description',
  'revision',
  'version',
  'state',
  'checkedOutBy',
  'modified',
  'size',
]

export type SortDirection = 'asc' | 'desc'

export interface SortState {
  key: SortKey
  direction: SortDirection
}

export function isSortKey(value: string | null | undefined): value is SortKey {
  return !!value && (SORT_KEYS as readonly string[]).includes(value)
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Natural, case-insensitive text order (`Part2` before `Part10`). */
export function compareText(a: string, b: string): number {
  return collator.compare(a, b)
}

export function userName(user: UserRef | null | undefined): string | null {
  if (!user) return null
  return user.full_name?.trim() || user.email?.trim() || null
}

/** The state shown for a file: its workflow state's label, else its name, else the legacy column. */
export function stateLabel(row: { workflow_state: WorkflowStateRef | null; state: string | null }): string | null {
  const ws = row.workflow_state
  return ws?.label?.trim() || ws?.name?.trim() || row.state?.trim() || null
}

/** Only `#rgb` / `#rrggbb` colours from the database reach a style attribute. */
export function safeColor(value: string | null | undefined): string | null {
  if (!value) return null
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim()) ? value.trim() : null
}

/** Sort value for one key; null sorts after every value whatever the direction. */
function sortValue(row: FileListRow, key: SortKey): string | number | null {
  switch (key) {
    case 'name':
      return row.file_name
    case 'partNumber':
      return row.part_number?.trim() || null
    case 'description':
      return row.description?.trim() || null
    case 'revision':
      return row.revision?.trim() || null
    case 'version':
      return row.version
    case 'state':
      return stateLabel(row)
    case 'checkedOutBy':
      return row.checked_out_by ? (userName(row.checked_out_user) ?? '') : null
    case 'modified': {
      const time = row.updated_at ? Date.parse(row.updated_at) : NaN
      return Number.isNaN(time) ? null : time
    }
    case 'size':
      return row.file_size ?? null
  }
}

export function sortFiles(rows: readonly FileListRow[], sort: SortState): FileListRow[] {
  const factor = sort.direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const va = sortValue(a, sort.key)
    const vb = sortValue(b, sort.key)
    if (va === null || vb === null) {
      if (va === null && vb !== null) return 1
      if (vb === null && va !== null) return -1
    } else {
      const diff = typeof va === 'number' && typeof vb === 'number' ? va - vb : compareText(String(va), String(vb))
      if (diff !== 0) return diff * factor
    }
    // Ties (and two missing values) fall back to the name, always ascending, then the id.
    return compareText(a.file_name, b.file_name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  })
}

/** Folders sort by name; they follow the direction only when the list is sorted by name. */
export function sortFolders(names: readonly string[], sort: SortState): string[] {
  const factor = sort.key === 'name' && sort.direction === 'desc' ? -1 : 1
  return [...names].sort((a, b) => compareText(a, b) * factor)
}

/** Clicking the current column flips it; another column starts ascending. */
export function nextSort(current: SortState, key: SortKey): SortState {
  if (current.key === key) return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
  return { key, direction: 'asc' }
}

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return ''
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024
    unit++
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1
  return `${value.toFixed(digits)} ${SIZE_UNITS[unit]}`
}
