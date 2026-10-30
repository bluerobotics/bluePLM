/**
 * Browser downloads of vault files, for BluePLM Web.
 *
 * The web has no vault folder, so "download" means the browser saves the file: a short-lived
 * signed URL that answers as an attachment under the file's real name (storage objects are named
 * by content hash), handed to the browser's own download. Nothing is written to a working copy,
 * so there is no read-only bit, no sync index and no store update: the row stays `cloud`.
 */

import { getDownloadUrl } from './storage'
import { saveUrlAs } from './browserDownload'

/** Signed URLs for a browser download live this long. The browser starts at once. */
export const WEB_DOWNLOAD_URL_TTL_SECONDS = 300

/**
 * Most files one browser download may save. Each file is its own browser download, so a large
 * folder would bury the user in save prompts; above this the download is refused as a whole.
 */
export const WEB_DOWNLOAD_MAX_FILES = 50

/** Pause between browser downloads, so the browser does not drop a rapid burst of them. */
const WEB_DOWNLOAD_SPACING_MS = 250

export interface WebDownloadItem {
  /** File name to save as. */
  name: string
  /** Storage key of the bytes. */
  contentHash: string
  /** Vault-relative path, for logs and errors. */
  relativePath: string
}

/** The fields of a store row the plan reads. */
export interface WebDownloadSource {
  name: string
  relativePath: string
  isDirectory: boolean
  pdmData?: { content_hash?: string | null } | null
}

export type WebDownloadPlan =
  | { kind: 'empty'; skippedNoHash: number }
  | { kind: 'too-many'; count: number; max: number }
  | { kind: 'download'; items: WebDownloadItem[]; skippedNoHash: number }

/**
 * What a browser download of these cloud files does. Folders are never downloaded as such (there
 * is nowhere to create them); callers pass the files a selection resolves to. Files without a
 * content hash have no bytes to fetch and are counted, not failed. Duplicates by path collapse.
 */
export function planWebDownload(
  cloudFiles: readonly WebDownloadSource[],
  max: number = WEB_DOWNLOAD_MAX_FILES,
): WebDownloadPlan {
  const byPath = new Map<string, WebDownloadItem>()
  let skippedNoHash = 0
  for (const file of cloudFiles) {
    if (file.isDirectory) continue
    const contentHash = file.pdmData?.content_hash
    if (!contentHash) {
      skippedNoHash++
      continue
    }
    byPath.set(file.relativePath.toLowerCase(), {
      name: file.name,
      contentHash,
      relativePath: file.relativePath,
    })
  }
  const items = [...byPath.values()]
  if (items.length === 0) return { kind: 'empty', skippedNoHash }
  if (items.length > max) return { kind: 'too-many', count: items.length, max }
  return { kind: 'download', items, skippedNoHash }
}

/** Save one stored file through the browser under `fileName`. */
export async function saveStoredFileInBrowser(
  orgId: string,
  contentHash: string,
  fileName: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const { url, error } = await getDownloadUrl(orgId, contentHash, WEB_DOWNLOAD_URL_TTL_SECONDS, {
    downloadName: fileName,
  })
  if (error || !url) return { success: false, error: error || 'No download URL' }
  saveUrlAs(url, fileName)
  return { success: true }
}

/** Save each planned item in turn, spaced so the browser keeps every download. */
export async function saveItemsInBrowser(
  orgId: string,
  items: readonly WebDownloadItem[],
  onProgress?: (done: number) => void,
): Promise<{ succeeded: number; failures: Array<{ name: string; error: string }> }> {
  let succeeded = 0
  const failures: Array<{ name: string; error: string }> = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, WEB_DOWNLOAD_SPACING_MS))
    const result = await saveStoredFileInBrowser(orgId, item.contentHash, item.name)
    if (result.success) succeeded++
    else failures.push({ name: item.name, error: result.error })
    onProgress?.(i + 1)
  }
  return { succeeded, failures }
}
