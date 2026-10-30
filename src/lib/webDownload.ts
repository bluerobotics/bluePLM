/**
 * Browser downloads of vault files, for BluePLM Web.
 *
 * The web has no vault folder, so "download" means the browser saves the file. One file goes
 * through a short-lived signed URL that answers as an attachment under the file's real name
 * (storage objects are named by content hash). Several files are fetched and saved as one zip,
 * paths kept relative to their common folder, so the browser shows one download instead of asking
 * to allow many. Nothing is written to a working copy: no read-only bit, no sync index, no store
 * update; rows stay `cloud`.
 */

import { getDownloadUrl } from './storage'
import { saveBlobAs, saveUrlAs } from './browserDownload'

/** Signed URLs for a browser download live this long. The browser starts at once. */
export const WEB_DOWNLOAD_URL_TTL_SECONDS = 300

/**
 * Limits of one zip. The zip is built in the browser's memory, so a selection above either is
 * refused as a whole rather than failing part way.
 */
export const WEB_DOWNLOAD_MAX_FILES = 2000
export const WEB_DOWNLOAD_MAX_BYTES = 2 * 1024 ** 3

/** Files fetched at once while building a zip. */
const WEB_ZIP_CONCURRENCY = 4

export interface WebDownloadItem {
  /** File name to save as. */
  name: string
  /** Storage key of the bytes. */
  contentHash: string
  /** Vault-relative path: the path inside the zip, and for logs and errors. */
  relativePath: string
  /** Bytes, when the row knows them. */
  size: number
}

/** The fields of a store row the plan reads. */
export interface WebDownloadSource {
  name: string
  relativePath: string
  isDirectory: boolean
  size?: number
  pdmData?: { content_hash?: string | null; file_size?: number | null } | null
}

export type WebDownloadPlan =
  | { kind: 'empty'; skippedNoHash: number }
  | { kind: 'too-many'; count: number; max: number }
  | { kind: 'too-large'; bytes: number; maxBytes: number }
  | { kind: 'download'; items: WebDownloadItem[]; skippedNoHash: number }

/**
 * What a browser download of these cloud files does. Folders are never downloaded as such (there
 * is nowhere to create them); callers pass the files a selection resolves to. Files without a
 * content hash have no bytes to fetch and are counted, not failed. Duplicates by path collapse.
 */
export function planWebDownload(
  cloudFiles: readonly WebDownloadSource[],
  max: number = WEB_DOWNLOAD_MAX_FILES,
  maxBytes: number = WEB_DOWNLOAD_MAX_BYTES,
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
      size: file.pdmData?.file_size ?? file.size ?? 0,
    })
  }
  const items = [...byPath.values()]
  if (items.length === 0) return { kind: 'empty', skippedNoHash }
  if (items.length > max) return { kind: 'too-many', count: items.length, max }
  const bytes = items.reduce((sum, item) => sum + item.size, 0)
  if (items.length > 1 && bytes > maxBytes) return { kind: 'too-large', bytes, maxBytes }
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

/**
 * Paths inside the zip and its name: relative to the deepest folder every item shares, named after
 * that folder (`Parts.zip`), or `BluePLM files.zip` when the items share none.
 */
export function zipLayout(items: readonly Pick<WebDownloadItem, 'relativePath'>[]): {
  zipName: string
  entries: string[]
} {
  const dirs = items.map((item) => item.relativePath.split('/').slice(0, -1))
  let common = dirs[0] ?? []
  for (const dir of dirs.slice(1)) {
    let i = 0
    while (i < common.length && i < dir.length && common[i].toLowerCase() === dir[i].toLowerCase()) i++
    common = common.slice(0, i)
  }
  const prefix = common.length
  const entries = items.map((item) => item.relativePath.split('/').slice(prefix).join('/'))
  const zipName = `${common.length > 0 ? common[common.length - 1] : 'BluePLM files'}.zip`
  return { zipName, entries }
}

/** Fetch one stored file's bytes through a short-lived signed URL. */
async function fetchStoredFile(orgId: string, contentHash: string): Promise<Blob> {
  const { url, error } = await getDownloadUrl(orgId, contentHash, WEB_DOWNLOAD_URL_TTL_SECONDS)
  if (error || !url) throw new Error(error || 'No download URL')
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Storage answered ${response.status}`)
  return response.blob()
}

/**
 * Save the planned items: one file directly, several as one zip. A file that cannot be fetched is
 * left out of the zip and reported; the zip still saves when at least one file made it in.
 */
export async function saveItemsInBrowser(
  orgId: string,
  items: readonly WebDownloadItem[],
  onProgress?: (done: number) => void,
  isCancelled: () => boolean = () => false,
): Promise<{ succeeded: number; failures: Array<{ name: string; error: string }>; cancelled: boolean }> {
  if (items.length === 1) {
    const result = await saveStoredFileInBrowser(orgId, items[0].contentHash, items[0].name)
    onProgress?.(1)
    return result.success
      ? { succeeded: 1, failures: [], cancelled: false }
      : { succeeded: 0, failures: [{ name: items[0].name, error: result.error }], cancelled: false }
  }

  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const { zipName, entries } = zipLayout(items)
  const failures: Array<{ name: string; error: string }> = []
  let succeeded = 0
  let done = 0
  let next = 0
  const worker = async () => {
    while (next < items.length && !isCancelled()) {
      const index = next++
      const item = items[index]
      try {
        zip.file(entries[index], await fetchStoredFile(orgId, item.contentHash))
        succeeded++
      } catch (error) {
        failures.push({ name: item.name, error: error instanceof Error ? error.message : String(error) })
      }
      onProgress?.(++done)
    }
  }
  await Promise.all(Array.from({ length: Math.min(WEB_ZIP_CONCURRENCY, items.length) }, worker))
  if (isCancelled()) return { succeeded: 0, failures, cancelled: true }
  if (succeeded > 0) {
    // CAD files barely compress, so store them: the zip builds fast and peaks at one copy in memory.
    saveBlobAs(zipName, await zip.generateAsync({ type: 'blob', compression: 'STORE' }))
  }
  return { succeeded, failures, cancelled: false }
}
