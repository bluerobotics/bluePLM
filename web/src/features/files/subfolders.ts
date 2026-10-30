// Finding the child folders of one folder without loading the whole vault.
//
// Child folders are implied by file paths (the `folders` table only records folders created
// explicitly, often empty ones). Loading every path below the vault root would be the whole
// vault, so the browser asks in rounds: "a page of paths below a subfolder I do not know yet".
// Each round excludes the subfolders already found, so every row it returns names a new one,
// and one big subfolder costs one row instead of all of its files. When the exclusion list
// gets long enough to threaten the URL length, the remaining rows are paged instead.
import { addFolderName, childFolderName } from './paths'

/** Excluding more subfolders than this per request would make the query string too long. */
export const MAX_EXCLUDED_SUBFOLDERS = 120
export const ROUND_SIZE = 1000
/** Hard stop so a misbehaving backend cannot keep the loop running. */
export const MAX_ROUNDS = 200

export interface SubfolderPageRequest {
  /** Child folder names whose subtrees the request must leave out. */
  excluded: string[]
  /** Row offset when paging with a frozen exclusion list; 0 otherwise. */
  offset: number
  limit: number
}

/** Returns the file paths of one page of rows below `folder`'s subfolders. */
export type SubfolderPageFetcher = (request: SubfolderPageRequest) => Promise<string[]>

export interface SubfolderResult {
  names: string[]
  /** True when the round limit stopped the search before it was exhaustive. */
  truncated: boolean
}

export async function discoverSubfolders(
  folder: string,
  seedNames: string[],
  fetchPage: SubfolderPageFetcher,
): Promise<SubfolderResult> {
  const found = new Map<string, string>()
  for (const name of seedNames) addFolderName(found, name)

  let excluded = [...found.values()]
  let frozen = excluded.length >= MAX_EXCLUDED_SUBFOLDERS
  if (frozen) excluded = excluded.slice(0, MAX_EXCLUDED_SUBFOLDERS)
  let offset = 0

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const paths = await fetchPage({ excluded, offset: frozen ? offset : 0, limit: ROUND_SIZE })
    if (paths.length === 0) return { names: [...found.values()], truncated: false }

    let added = 0
    for (const path of paths) {
      const name = childFolderName(folder, path)
      if (name && addFolderName(found, name)) added++
    }

    if (frozen) {
      if (paths.length < ROUND_SIZE) return { names: [...found.values()], truncated: false }
      offset += paths.length
      continue
    }
    // Every returned row lies outside the excluded subtrees, so a round that adds nothing means
    // the backend ignored the filter; stop rather than loop.
    if (added === 0) return { names: [...found.values()], truncated: false }
    excluded = [...found.values()]
    if (excluded.length >= MAX_EXCLUDED_SUBFOLDERS) {
      excluded = excluded.slice(0, MAX_EXCLUDED_SUBFOLDERS)
      frozen = true
      offset = 0
    }
  }
  return { names: [...found.values()], truncated: true }
}
