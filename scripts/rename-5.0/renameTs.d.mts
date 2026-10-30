import type { RenameLookups } from './maps.mjs'
import type { RenameResult } from './renameSql.mjs'
export function renameTs(src: string, L: RenameLookups, opts?: { file?: string }): RenameResult
export function renameGeneratedTypes(src: string, L: RenameLookups): RenameResult
