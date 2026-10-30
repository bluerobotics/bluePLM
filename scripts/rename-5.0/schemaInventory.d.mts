export interface Where { file: string; line: number }
export interface Column extends Where {
  table: string
  name: string
  type: string
  def: string
  references: { table: string; column: string } | null
  unique: boolean
  primaryKey: boolean
  check: boolean
}
export interface Table extends Where { name: string; columns: Map<string, Column>; tableConstraints: { name: string | null; def: string }[]; published: boolean }
export interface Fn { name: string; args: string; signature: string; argText: string; returns: string; procedure: boolean; file: string; line: number; files: string[] }
export interface Inventory {
  tables: Map<string, Table>
  functions: Map<string, Fn>
  triggers: Map<string, Where & { name: string; table: string; fn: string; timing: string }>
  policies: Map<string, Where & { name: string; table: string; cmd: string; roles: string }>
  indexes: Map<string, Where & { name: string; table: string; unique: boolean; def: string }>
  constraints: Map<string, Where & { name: string; table: string; def: string }>
  types: Map<string, Where & { name: string; enum: boolean; values?: string[] }>
  views: Map<string, Where & { name: string; materialized: boolean }>
  sequences: Map<string, Where & { name: string }>
  publication: string[]
}
export const SCHEMA_FILES: string[]
export function argTypes(argText: string): string
export function readSchema(root: string, read?: (file: string) => string): { file: string; text: string }[]
export function inventory(files: { file: string; text: string }[]): Inventory
