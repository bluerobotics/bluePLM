import type { RenameLookups } from './maps.mjs'
export interface RenameResult {
  text: string
  counts: Record<string, number>
  changes: number
  ambiguous: { line: number; token: string; reason: string }[]
}
export function renameSql(src: string, L: RenameLookups, opts?: { triggerTables?: Map<string, Set<string>> }): RenameResult
export function triggerTablesFromMap(map: unknown): Map<string, Set<string>>
