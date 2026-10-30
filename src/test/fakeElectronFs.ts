/**
 * The file-system half of the fake `window.electronAPI`: create, rename, move, copy, delete and
 * the Recycle Bin, over the same `FakeDisk` the SolidWorks fake reads. Merged into the fake by
 * `createFakeElectron`.
 *
 * Semantics follow `electron/handlers/fs.ts` where they decide an outcome:
 * - `renameItem` / `moveFile` replace an existing file target (Windows `MoveFileEx` with
 *   REPLACE_EXISTING, which is what `fs.renameSync` does) and refuse a directory onto an existing
 *   directory; a case-only rename of the same path succeeds.
 * - `copyFile` onto itself is a skipped no-op; copies are writable.
 * - `deleteItem` / `deleteBatch` with `isAutomatic` leave a file on disk (`skipped`) when the
 *   Recycle Bin refuses it; an explicit delete falls back to a permanent delete.
 * - `trashEmptyDirs` only removes directories with nothing in them.
 *
 * `downloadUrl` resolves a URL through `resolveDownload`, which the harness points at the fake
 * Supabase storage, and verifies the expected hash the way the real handler does.
 */
import type { DiskEntry, FakeDisk } from './fakeElectron'

type ElectronAPI = NonNullable<Window['electronAPI']>

export interface FakeFsOptions {
  /** The vault root, for `listWorkingFiles` and `relativePath`. */
  workingDir: () => string | null
  /** Bytes behind a signed URL from the fake storage, or null when there is no such object. */
  resolveDownload: (url: string) => string | null
}

const extensionOf = (path: string) => {
  const name = path.slice(path.lastIndexOf('\\') + 1)
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? '' : name.slice(dot).toLowerCase()
}

const norm = (path: string) => path.replace(/\//g, '\\')

export function createFakeFsApi(disk: FakeDisk, options: FakeFsOptions): Partial<ElectronAPI> {
  const trashOne = (path: string, isAutomatic: boolean) => {
    if (!disk.exists(path)) return { path, success: false, error: 'Path does not exist' }
    if (disk.recycleBinUnavailable) {
      if (isAutomatic) return { path, success: true, skipped: true }
      disk.removeTree(path)
      return { path, success: true }
    }
    const files: DiskEntry[] = disk.removeTree(path)
    disk.recycleBin.push({ path, files })
    return { path, success: true }
  }

  const summary = (results: Array<{ success: boolean; skipped?: boolean }>) => ({
    total: results.length,
    succeeded: results.filter((r) => r.success && !r.skipped).length,
    failed: results.filter((r) => !r.success).length,
    skipped: results.filter((r) => r.skipped).length,
    duration: 0,
  })

  const list = (root: string) => {
    const prefix = `${norm(root).toLowerCase()}\\`
    const files: Array<{
      name: string
      path: string
      relativePath: string
      isDirectory: boolean
      extension: string
      size: number
      modifiedTime: string
      hash?: string
      ino?: number
    }> = []
    const folders = new Map<string, string>()
    const addFolders = (relativePath: string) => {
      const parts = relativePath.split('/')
      for (let i = 1; i < parts.length; i++) {
        const folder = parts.slice(0, i).join('/')
        if (!folders.has(folder.toLowerCase())) folders.set(folder.toLowerCase(), folder)
      }
    }
    for (const entry of disk.all()) {
      if (!entry.path.toLowerCase().startsWith(prefix)) continue
      const relativePath = entry.path.slice(prefix.length).replace(/\\/g, '/')
      addFolders(relativePath)
      files.push({
        name: relativePath.split('/').pop()!,
        path: entry.path,
        relativePath,
        isDirectory: false,
        extension: extensionOf(entry.path),
        size: disk.bytes(entry.path).length,
        modifiedTime: new Date(entry.mtimeMs).toISOString(),
        hash: disk.hash(entry.path),
        ino: entry.ino,
      })
    }
    for (const dir of disk.dirs()) {
      if (!dir.toLowerCase().startsWith(prefix)) continue
      const relativePath = dir.slice(prefix.length).replace(/\\/g, '/')
      addFolders(`${relativePath}/x`)
    }
    for (const folder of folders.values()) {
      files.push({
        name: folder.split('/').pop()!,
        path: `${norm(root)}\\${folder.replace(/\//g, '\\')}`,
        relativePath: folder,
        isDirectory: true,
        extension: '',
        size: 0,
        modifiedTime: new Date(disk.clock).toISOString(),
      })
    }
    return files
  }

  const api: Partial<ElectronAPI> = {
    async getPlatform() {
      return 'win32'
    },
    async setWorkingDir(path) {
      return { success: true, path }
    },
    getPathForFile(file: File) {
      return (file as File & { path?: string }).path ?? ''
    },
    async createFolder(path) {
      disk.mkdir(norm(path))
      return { success: true }
    },
    async isDirectory(path) {
      return { success: true, isDirectory: disk.isDir(path) }
    },
    async isDirEmpty(path) {
      if (!disk.isDir(path)) return { success: false, error: 'ENOENT' }
      const k = `${norm(path).toLowerCase()}\\`
      const nonEmpty =
        disk.filesUnder(path).length > 0 || disk.dirs().some((d) => d.toLowerCase().startsWith(k))
      return { success: true, empty: !nonEmpty }
    },
    async fileExists(path) {
      return disk.exists(path)
    },
    async statFile(path) {
      const entry = disk.get(path)
      if (entry) {
        return {
          success: true,
          size: disk.bytes(path).length,
          modifiedTime: new Date(entry.mtimeMs).toISOString(),
          isDirectory: false,
        }
      }
      if (disk.isDir(path)) return { success: true, size: 0, isDirectory: true }
      return { success: false, error: 'ENOENT' }
    },
    async renameItem(oldPath, newPath) {
      return api.moveFile!(oldPath, newPath)
    },
    async moveFile(sourcePath, destPath) {
      if (!disk.exists(sourcePath)) return { success: false, error: `ENOENT: ${sourcePath}` }
      const sameKey = norm(sourcePath).toLowerCase() === norm(destPath).toLowerCase()
      const srcLower = `${norm(sourcePath).toLowerCase()}\\`
      if (disk.isDir(sourcePath) && norm(destPath).toLowerCase().startsWith(srcLower)) {
        return { success: false, error: 'Cannot move a folder into itself or a subfolder' }
      }
      if (!sameKey && disk.isDir(destPath)) {
        return { success: false, error: `EPERM: operation not permitted, rename '${sourcePath}'` }
      }
      if (!sameKey && disk.get(destPath)) disk.remove(destPath)
      const fileCount = disk.move(norm(sourcePath), norm(destPath))
      return { success: true, fileCount }
    },
    async copyFile(sourcePath, destPath) {
      if (norm(sourcePath).toLowerCase() === norm(destPath).toLowerCase()) {
        return { success: true, fileCount: 0 }
      }
      if (!disk.exists(sourcePath)) return { success: false, error: `ENOENT: ${sourcePath}` }
      return { success: true, fileCount: disk.copy(norm(sourcePath), norm(destPath)) }
    },
    async deleteItem(path, isAutomatic = false) {
      const { success, error, skipped } = trashOne(path, isAutomatic)
      return { success, error, skipped }
    },
    async deleteBatch(paths, useTrash = true, isAutomatic = false) {
      const results = paths.map((path) => {
        if (useTrash) return trashOne(path, isAutomatic)
        if (!disk.exists(path)) return { path, success: false, error: 'Path does not exist' }
        disk.removeTree(path)
        return { path, success: true }
      })
      return { success: results.every((r) => r.success), results, summary: summary(results) }
    },
    async trashEmptyDirs(paths) {
      const results = paths.map((path) => {
        const k = `${norm(path).toLowerCase()}\\`
        const empty =
          disk.isDir(path) &&
          disk.filesUnder(path).length === 0 &&
          !disk.dirs().some((d) => d.toLowerCase().startsWith(k))
        // electron/handlers/emptyDirs.ts: a directory left on disk is `success: false, skipped: true`.
        if (!empty) return { path, success: false, skipped: true }
        if (disk.recycleBinUnavailable) return { path, success: false, skipped: true }
        disk.removeTree(path)
        disk.recycleBin.push({ path, files: [] })
        return { path, success: true }
      })
      return { success: true, results, summary: summary(results) }
    },
    async writeFile(path, base64Data) {
      const body = Buffer.from(base64Data, 'base64').toString('utf8')
      disk.writeBytes(norm(path), body).readonly = false
      return { success: true, size: body.length, hash: disk.hash(path) }
    },
    async downloadUrl(url, destPath, expectedHash) {
      const body = options.resolveDownload(url)
      if (body === null) return { success: false, error: `404: ${url}` }
      const existing = disk.get(destPath)
      if (existing?.readonly) return { success: false, error: `EPERM: ${destPath} is read-only` }
      const entry = disk.writeBytes(norm(destPath), body)
      entry.readonly = false
      const hash = disk.hash(entry.path)
      if (expectedHash && hash !== expectedHash) {
        disk.remove(entry.path)
        return { success: false, error: `Hash mismatch for ${destPath}` }
      }
      return { success: true, size: body.length, hash }
    },
    async listWorkingFiles() {
      const root = options.workingDir()
      if (!root) return { success: false, error: 'No working directory' }
      return { success: true, files: list(root) }
    },
    async listDirFiles(dirPath) {
      return { success: true, files: list(dirPath) }
    },
    async computeFileHashes(files) {
      return {
        success: true,
        results: files
          .filter((f) => disk.get(f.path))
          .map((f) => ({ relativePath: f.relativePath, hash: disk.hash(f.path) })),
      }
    },
    async checkFolderLocks(folderPath) {
      return { lockedFiles: [], totalFiles: disk.filesUnder(folderPath).length }
    },
    async openFile() {
      return { success: true }
    },
    async showInExplorer() {
      return { success: true }
    },
    async openInExplorer() {
      return { success: true }
    },
    startDrag() {},
    async releaseHandles() {
      return { success: true }
    },
    async cancelPreviewsForFolder() {
      return { cancelledCount: 0, activeCount: 0, activePaths: [] }
    },
    async cancelPreviews() {
      return { cancelledCount: 0 }
    },
    async invalidateScanCache() {
      return { success: true }
    },
  }
  return api
}
