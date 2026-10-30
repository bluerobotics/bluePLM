import type { Inventory } from './schemaInventory.mjs'
export interface NamingViolation { kind: string; name: string; file?: string; line?: number; rule: string }
export const RESERVED: Set<string>
export const VERBS: Set<string>
export const KEPT_PREFIXES: string[]
export const EXCEPTIONS: { tables: Set<string>; policyTables: Set<string>; functions: Set<string>; columns: Set<string> }
export function looksPlural(name: string): boolean
export function checkNaming(inv: Inventory): NamingViolation[]
