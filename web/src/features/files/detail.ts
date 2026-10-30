// Pure mapping for the file detail page: references (contains / where-used / drawings) and
// custom properties.
import { compareText } from './listing'

export interface ReferencedFile {
  id: string
  file_name: string
  file_path: string
  vault_id: string | null
  part_number: string | null
  description: string | null
  revision: string | null
  state: string | null
  deleted_at: string | null
}

/** A `file_references` row with the file on the other end embedded as `other`. */
export interface ReferenceRow {
  id: string
  reference_type: string | null
  quantity: number | null
  configuration: string | null
  other: ReferencedFile | null
}

export interface ReferenceItem {
  file: ReferencedFile
  referenceType: string
  quantity: number
  configurations: string[]
}

export function isDrawingName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.slddrw')
}

/**
 * One entry per referenced file: rows for several configurations of the same file are merged
 * (their configurations listed, the largest quantity kept), and deleted files are dropped.
 */
export function groupReferences(rows: readonly ReferenceRow[]): ReferenceItem[] {
  const byFile = new Map<string, ReferenceItem>()
  for (const row of rows) {
    const file = row.other
    if (!file || file.deleted_at) continue
    const existing = byFile.get(file.id)
    const configuration = row.configuration?.trim() || null
    const quantity = row.quantity && row.quantity > 0 ? row.quantity : 1
    if (existing) {
      if (configuration && !existing.configurations.includes(configuration)) existing.configurations.push(configuration)
      existing.quantity = Math.max(existing.quantity, quantity)
      continue
    }
    byFile.set(file.id, {
      file,
      referenceType: row.reference_type || 'component',
      quantity,
      configurations: configuration ? [configuration] : [],
    })
  }
  return [...byFile.values()].sort((a, b) => compareText(a.file.file_name, b.file.file_name))
}

/** Where-used rows split into drawings of this file and the other parents (assemblies, links). */
export function splitWhereUsed(items: readonly ReferenceItem[]): { drawings: ReferenceItem[]; parents: ReferenceItem[] } {
  const drawings: ReferenceItem[] = []
  const parents: ReferenceItem[] = []
  for (const item of items) (isDrawingName(item.file.file_name) ? drawings : parents).push(item)
  return { drawings, parents }
}

export interface MetadataColumn {
  name: string
  label: string
  sort_order: number
}

export interface PropertyRow {
  key: string
  label: string
  value: string
}

/** Render a stored JSON value as plain text; empty values are skipped (null). */
export function propertyText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value.trim() ? value : null
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    const json = JSON.stringify(value)
    return json && json !== '{}' && json !== '[]' ? json : null
  } catch {
    return null
  }
}

/**
 * Custom properties in the organization's column order (file_metadata_columns), then any other
 * stored keys alphabetically. Values are text; nothing here is ever rendered as HTML.
 */
export function customPropertyRows(
  properties: unknown,
  columns: readonly MetadataColumn[],
): PropertyRow[] {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return []
  const entries = Object.entries(properties as Record<string, unknown>)
  const columnByName = new Map(columns.map((column) => [column.name.toLowerCase(), column]))
  const rows: Array<PropertyRow & { order: number }> = []
  for (const [key, raw] of entries) {
    const value = propertyText(raw)
    if (value === null) continue
    const column = columnByName.get(key.toLowerCase())
    rows.push({
      key,
      label: column?.label?.trim() || key,
      value,
      order: column ? column.sort_order : Number.POSITIVE_INFINITY,
    })
  }
  rows.sort((a, b) => (a.order !== b.order ? (a.order < b.order ? -1 : 1) : compareText(a.label, b.label)))
  return rows.map(({ key, label, value }) => ({ key, label, value }))
}
