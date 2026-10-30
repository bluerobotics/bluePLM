// Vault-relative path helpers for the folder browser.
//
// The `files` table has no parent-folder column: a file's folder is the part of `file_path`
// before its last `/`. These helpers turn a folder path into the LIKE patterns that select one
// folder level, and turn the rows that come back into breadcrumbs and child-folder names.
// Paths are compared case-insensitively, the way the vault's unique index
// (`vault_id, LOWER(file_path)`) compares them.
import { escapeLikePattern } from '@/lib/utils/likePattern'

/** Trim separators and turn backslashes into `/`; the vault root is ''. */
export function normalizeFolderPath(path: string | null | undefined): string {
  if (!path) return ''
  return path
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part !== '' && part !== '.')
    .join('/')
}

export function joinPath(folder: string, name: string): string {
  const base = normalizeFolderPath(folder)
  return base ? `${base}/${name}` : name
}

/** The folder a file path sits in ('' for a file at the vault root). */
export function parentFolder(filePath: string): string {
  const normalized = normalizeFolderPath(filePath)
  const index = normalized.lastIndexOf('/')
  return index < 0 ? '' : normalized.slice(0, index)
}

export interface Crumb {
  name: string
  /** Folder path of this crumb; '' is the vault root. */
  path: string
}

/** Breadcrumbs below the vault root, outermost first: `A/B` → [A, A/B]. */
export function breadcrumbs(folder: string): Crumb[] {
  const parts = normalizeFolderPath(folder).split('/').filter(Boolean)
  return parts.map((name, index) => ({ name, path: parts.slice(0, index + 1).join('/') }))
}

/**
 * ILIKE patterns for one folder level. `direct` matches everything below the folder, and
 * `nested` matches everything below one of its subfolders, so the folder's own files are
 * `direct AND NOT nested`. PostgREST reads `*` as the LIKE wildcard; the folder name is escaped
 * so `_` and `%` in a real folder name stay literal.
 */
export function folderPatterns(folder: string): { direct: string; nested: string } {
  const base = normalizeFolderPath(folder)
  if (!base) return { direct: '*', nested: '*/*' }
  const escaped = escapeLikePattern(base)
  return { direct: `${escaped}/*`, nested: `${escaped}/*/*` }
}

/** ILIKE pattern for everything below `folder/sub`. */
export function subtreePattern(folder: string, sub: string): string {
  return `${escapeLikePattern(joinPath(folder, sub))}/*`
}

/**
 * The name of the child folder of `folder` that `path` lies in, or null when `path` is not
 * below a child folder (it is the folder itself, a file directly in it, or elsewhere).
 * `path` is a file path, or a folder path when `isFolder` is set.
 */
export function childFolderName(folder: string, path: string, isFolder = false): string | null {
  const base = normalizeFolderPath(folder)
  const target = normalizeFolderPath(path)
  let rest: string
  if (base) {
    if (target.length <= base.length + 1) return null
    if (target.slice(0, base.length + 1).toLowerCase() !== `${base}/`.toLowerCase()) return null
    rest = target.slice(base.length + 1)
  } else {
    rest = target
  }
  const slash = rest.indexOf('/')
  if (slash < 0) return isFolder && rest ? rest : null
  return rest.slice(0, slash) || null
}

/** Add `name` to `into` unless a case-insensitive match is already there (first spelling wins). */
export function addFolderName(into: Map<string, string>, name: string): boolean {
  const key = name.toLowerCase()
  if (into.has(key)) return false
  into.set(key, name)
  return true
}
