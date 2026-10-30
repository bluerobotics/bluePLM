export interface RenameLookups {
  isTable(name: string): boolean
  columnKeepers: Map<string, Set<string>>
  relations: Map<string, string>
  functions: Map<string, string>
  objects: Map<string, string>
  policies: Map<string, { table: string; to: string }[]>
  globalColumns: Map<string, string>
  tableColumns: Map<string, Map<string, string>>
  scopedColumns: Map<string, Set<string>>
  oldTableOf(name: string): string
  columnFor(table: string, column: string): string | undefined
}
export function buildLookups(map: unknown): RenameLookups
export function loadLookups(mapPath: string): RenameLookups
