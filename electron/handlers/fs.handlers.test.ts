import crypto from 'crypto'
import fs from 'fs'
import http from 'http'
import type { AddressInfo } from 'net'
import os from 'os'
import path from 'path'

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// The file-system IPC handlers in fs.ts, run against a real temporary vault. Only the
// Electron surface (ipcMain, shell, dialog, nativeImage), the vault watcher and the
// SolidWorks lock lookup are faked; every read, write, hash, chmod, rename and delete is
// real. Assertions that depend on Windows' read-only attribute (a read-only file cannot be
// replaced or unlinked) run on Windows only: on Linux the mode bit is advisory for the
// owner's directory operations, and CI may run as root.

const { ipcHandlers, trashItemMock, execMock } = vi.hoisted(() => ({
  ipcHandlers: new Map<string, (...args: unknown[]) => unknown>(),
  trashItemMock: vi.fn(async (_targetPath: string): Promise<void> => {}),
  execMock: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, handler)
    },
    on: () => {},
    removeHandler: (channel: string) => {
      ipcHandlers.delete(channel)
    },
    removeListener: () => {},
  },
  shell: { trashItem: trashItemMock, openPath: async () => '', showItemInFolder: () => {} },
  dialog: {},
  nativeImage: { createFromDataURL: () => ({}) },
  BrowserWindow: class {},
}))

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  const mocked = { ...actual, exec: execMock }
  return { ...mocked, default: mocked }
})

vi.mock('./solidworks', () => ({
  findLockingProcessViaService: async () => null,
}))

vi.mock('./fsWatcher', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./fsWatcher')>()
  return { ...actual, createVaultWatcher: () => ({ close: async () => {} }) }
})

import { clearHashCache, registerFsHandlers } from './fs'

interface ScanEntry {
  relativePath: string
  isDirectory: boolean
  size: number
  modifiedTime: string
  hash?: string
}
type Result = { success: boolean; error?: string; [key: string]: unknown }

const isWindows = process.platform === 'win32'
const realRenameSync = fs.renameSync.bind(fs)
const realUnlinkSync = fs.unlinkSync.bind(fs)

let vault: string
let trashDir: string
let hashProgress: unknown[]

function invoke<T = Result>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = ipcHandlers.get(channel)
  if (!handler) throw new Error(`${channel} was never registered`)
  const event = {
    sender: {
      isDestroyed: () => false,
      send: (_channel: string, payload: unknown) => hashProgress.push(payload),
    },
  }
  return Promise.resolve(handler(event, ...args) as T)
}

function sha256(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex')
}

function put(relativePath: string, content: string): string {
  const full = path.join(vault, relativePath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
  return full
}

/** process.platform is a plain data property, so a spy cannot reach it. */
const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!
function stubPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { ...platformDescriptor, value: platform })
}
function restorePlatform(): void {
  Object.defineProperty(process, 'platform', platformDescriptor)
}

function makeTreeWritable(dir: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) makeTreeWritable(full)
    else fs.chmodSync(full, 0o666)
  }
}

function isReadOnly(filePath: string): boolean {
  return (fs.statSync(filePath).mode & 0o200) === 0
}

async function scan(): Promise<ScanEntry[]> {
  const result = await invoke<Result & { files: ScanEntry[] }>('fs:list-working-files')
  expect(result.success).toBe(true)
  return result.files
}

async function delta(changed: string[]): Promise<{ files: ScanEntry[]; wasFullScan: boolean }> {
  return invoke('fs:list-working-files-delta', changed)
}

function paths(files: ScanEntry[]): string[] {
  return files.map((file) => file.relativePath)
}

beforeAll(() => {
  registerFsHandlers({} as Electron.BrowserWindow, {
    log: () => {},
    logDebug: () => {},
    logError: () => {},
    logWarn: () => {},
    isFileBeingThumbnailed: () => false,
    thumbnailsInProgress: new Set(),
    restoreMainWindowFocus: () => {},
  })
})

beforeEach(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blueplm-fs-'))
  vault = path.join(root, 'vault')
  trashDir = path.join(root, 'trash')
  fs.mkdirSync(vault)
  fs.mkdirSync(trashDir)
  hashProgress = []
  clearHashCache()

  // The real shell.trashItem moves the item off disk; doing the same here is what lets
  // the tests tell a recycled file from one left behind.
  trashItemMock.mockReset()
  trashItemMock.mockImplementation(async (target: string) => {
    realRenameSync(target, path.join(trashDir, `${Date.now()}-${path.basename(target)}`))
  })
  execMock.mockReset()

  await expect(invoke('working-dir:set', vault)).resolves.toMatchObject({ success: true })
})

afterEach(async () => {
  vi.restoreAllMocks()
  restorePlatform()
  await invoke('working-dir:clear')
  const root = path.dirname(vault)
  // Clear read-only bits so the temp tree can be removed on Windows
  makeTreeWritable(root)
  fs.rmSync(root, { recursive: true, force: true })
})

describe('working directory and path guard', () => {
  it('refuses a working directory that does not exist', async () => {
    await expect(invoke('working-dir:set', path.join(vault, 'missing'))).resolves.toEqual({
      success: false,
      error: 'Path does not exist',
    })
  })

  it('refuses to read or write outside the vault, including through ..', async () => {
    const outside = path.join(path.dirname(vault), 'outside.txt')
    fs.writeFileSync(outside, 'secret')
    const sneaky = path.join(vault, '..', 'outside.txt')
    // A sibling whose name starts with the vault's name is outside it too
    const sibling = vault + '-other'
    fs.mkdirSync(sibling)

    for (const target of [outside, sneaky, path.join(sibling, 'x.txt')]) {
      await expect(invoke('fs:read-file', target)).resolves.toMatchObject({ success: false })
      await expect(
        invoke('fs:write-file', target, Buffer.from('x').toString('base64')),
      ).resolves.toMatchObject({ success: false, error: 'Path is outside the vault working directory' })
    }
    expect(fs.readFileSync(outside, 'utf8')).toBe('secret')
    expect(fs.existsSync(path.join(sibling, 'x.txt'))).toBe(false)
  })
})

describe('read, write and hash', () => {
  it('writes atomically, creating parents, and every hash path agrees', async () => {
    const target = path.join(vault, 'Parts', 'Sub', 'bracket.sldprt')
    const content = Buffer.from('solid bracket body')

    const written = await invoke('fs:write-file', target, content.toString('base64'))
    expect(written).toEqual({ success: true, hash: sha256(content), size: content.length })
    expect(fs.existsSync(target + '.tmp')).toBe(false)

    const read = await invoke<Result & { data: string; hash: string }>('fs:read-file', target)
    expect(Buffer.from(read.data, 'base64').equals(content)).toBe(true)
    expect(read.hash).toBe(sha256(content))
    await expect(invoke('fs:hash-file', target)).resolves.toEqual({
      success: true,
      hash: sha256(content),
      size: content.length,
    })
    await expect(invoke('fs:get-file-hash', target)).resolves.toMatchObject({
      success: true,
      hash: sha256(content),
    })
  })

  it('refuses empty data rather than truncating the file', async () => {
    const target = put('a.txt', 'keep me')
    await expect(invoke('fs:write-file', target, '')).resolves.toEqual({
      success: false,
      error: 'Missing file data',
    })
    expect(fs.readFileSync(target, 'utf8')).toBe('keep me')
  })

  it.runIf(isWindows)('cannot overwrite a read-only (checked-in) file and leaves it intact', async () => {
    const target = put('locked.sldprt', 'checked in')
    await invoke('fs:set-readonly', target, true)

    const result = await invoke('fs:write-file', target, Buffer.from('edit').toString('base64'))
    expect(result).toMatchObject({ success: false, error: `Permission denied: Cannot write to ${target}` })
    expect(fs.readFileSync(target, 'utf8')).toBe('checked in')
    expect(fs.existsSync(target + '.tmp')).toBe(false)
  })
})

describe('read-only bit', () => {
  it('sets and clears read-only on a file and reports it back', async () => {
    const target = put('part.sldprt', 'x')
    expect(await invoke('fs:is-readonly', target)).toEqual({ success: true, readonly: false })

    await expect(invoke('fs:set-readonly', target, true)).resolves.toEqual({ success: true })
    expect(await invoke('fs:is-readonly', target)).toEqual({ success: true, readonly: true })
    expect(isReadOnly(target)).toBe(true)

    await expect(invoke('fs:set-readonly', target, false)).resolves.toEqual({ success: true })
    expect(isReadOnly(target)).toBe(false)
  })

  it('treats directories as a no-op and reports a missing file per entry in a batch', async () => {
    const a = put('a.sldprt', 'a')
    const dir = path.join(vault, 'Folder')
    fs.mkdirSync(dir)
    const missing = path.join(vault, 'missing.sldprt')

    const result = await invoke<Result & { results: Result[] }>('fs:set-readonly-batch', [
      { path: a, readonly: true },
      { path: dir, readonly: true },
      { path: missing, readonly: true },
    ])
    expect(result.results.map((r) => r.success)).toEqual([true, true, false])
    expect(isReadOnly(a)).toBe(true)
    expect(isReadOnly(dir)).toBe(false)
  })

  it.runIf(isWindows)('a read-only file really refuses writes on Windows', async () => {
    const target = put('part.sldprt', 'x')
    await invoke('fs:set-readonly', target, true)
    expect(() => fs.writeFileSync(target, 'y')).toThrow(/EPERM/)
  })
})

describe('vault scan and hash stamps', () => {
  it('lists directories first with forward-slash paths and skips lock and temp files', async () => {
    put('Assemblies/top.sldasm', 'asm')
    put('Assemblies/~$top.sldasm', 'sw lock')
    put('Parts/a.sldprt', 'a')
    put('Parts/a.sldprt.download', 'partial')
    put('Parts/b.tmp', 'tmp')
    put('.hidden/c.txt', 'c')
    put('desktop.ini', 'shell')

    const files = await scan()
    expect(paths(files)).toEqual(['Assemblies', 'Parts', 'Assemblies/top.sldasm', 'Parts/a.sldprt'])
    expect(files.find((f) => f.relativePath === 'Parts/a.sldprt')).toMatchObject({
      isDirectory: false,
      size: 1,
    })
  })

  it('reuses a stamped hash only while size and mtime still match the file', async () => {
    const full = put('Parts/a.sldprt', 'version one')
    const [entry] = (await scan()).filter((f) => !f.isDirectory)
    const stat = fs.statSync(full)

    const stamped = await invoke<Result & { results: Array<{ relativePath: string; hash: string }> }>(
      'fs:compute-file-hashes',
      [{ path: full, relativePath: entry.relativePath, size: stat.size, mtime: stat.mtime.getTime() }],
    )
    expect(stamped.results).toEqual([{ relativePath: 'Parts/a.sldprt', hash: sha256('version one') }])
    expect(hashProgress).toEqual([{ processed: 1, total: 1, percent: 100 }])
    expect((await scan()).find((f) => f.relativePath === 'Parts/a.sldprt')?.hash).toBe(
      sha256('version one'),
    )

    // Same size, newer mtime: the stamp must not vouch for content it never hashed
    fs.writeFileSync(full, 'version two')
    fs.utimesSync(full, stat.atime, new Date(stat.mtime.getTime() + 5_000))
    expect((await scan()).find((f) => f.relativePath === 'Parts/a.sldprt')?.hash).toBeUndefined()

    // Different size, same mtime: equally stale
    fs.writeFileSync(full, 'version three, longer')
    fs.utimesSync(full, stat.atime, stat.mtime)
    expect((await scan()).find((f) => f.relativePath === 'Parts/a.sldprt')?.hash).toBeUndefined()
  })

  it('skips a file that vanished before it could be hashed', async () => {
    const result = await invoke<Result & { results: unknown[] }>('fs:compute-file-hashes', [
      { path: path.join(vault, 'gone.sldprt'), relativePath: 'gone.sldprt', size: 1, mtime: 1 },
    ])
    expect(result).toMatchObject({ success: true, results: [] })
  })

  it('patches only the changed paths into the cached scan', async () => {
    put('Parts/a.sldprt', 'a')
    const b = put('Parts/b.sldprt', 'b')
    await scan()

    fs.unlinkSync(b)
    put('Parts/c.sldprt', 'c')
    put('New/Deep/d.sldprt', 'd')

    const result = await delta(['Parts/b.sldprt', 'Parts\\c.sldprt', 'New'])
    expect(result.wasFullScan).toBe(false)
    expect(paths(result.files)).toEqual([
      'New',
      'New/Deep',
      'Parts',
      'New/Deep/d.sldprt',
      'Parts/a.sldprt',
      'Parts/c.sldprt',
    ])
  })

  it('drops a removed directory and everything beneath it from the cached scan', async () => {
    put('Old/x.sldprt', 'x')
    put('Old/Sub/y.sldprt', 'y')
    put('Keep/z.sldprt', 'z')
    await scan()

    fs.rmSync(path.join(vault, 'Old'), { recursive: true })
    const result = await delta(['Old'])
    expect(paths(result.files)).toEqual(['Keep', 'Keep/z.sldprt'])
  })

  // The 2026-10-26 Explorer move: the delta loads named only the destination, the source stayed
  // in the scan, and inode rename detection could not see the move until a full scan.
  it('drops the source of a move when only the destination was reported', async () => {
    const source = put('dev/bearing.sldasm', 'asm')
    put('dev/keep.sldprt', 'keep')
    await scan()

    fs.mkdirSync(path.join(vault, 'dev', 'New Folder'))
    realRenameSync(source, path.join(vault, 'dev', 'New Folder', 'bearing.sldasm'))

    const result = await delta(['dev/New Folder/bearing.sldasm'])
    expect(result.wasFullScan).toBe(false)
    expect(paths(result.files)).not.toContain('dev/bearing.sldasm')
    expect(paths(result.files)).toContain('dev/New Folder/bearing.sldasm')
    expect(paths(result.files)).toContain('dev/keep.sldprt')
  })

  it('keeps a source path that something new has taken since the move', async () => {
    const source = put('dev/bearing.sldasm', 'asm')
    await scan()

    realRenameSync(source, path.join(vault, 'bearing.sldasm'))
    put('dev/bearing.sldasm', 'resaved')

    const result = await delta(['bearing.sldasm'])
    expect(paths(result.files)).toEqual(expect.arrayContaining(['bearing.sldasm', 'dev/bearing.sldasm']))
  })
})

describe('copy and move', () => {
  it('copies over a read-only destination and leaves the copy writable, the source untouched', async () => {
    const source = put('src.sldprt', 'new content')
    const dest = put('Dest/src.sldprt', 'old content')
    await invoke('fs:set-readonly', source, true)
    await invoke('fs:set-readonly', dest, true)

    await expect(invoke('fs:copy-file', source, dest)).resolves.toEqual({ success: true, fileCount: 1 })
    expect(fs.readFileSync(dest, 'utf8')).toBe('new content')
    expect(isReadOnly(dest)).toBe(false)
    expect(isReadOnly(source)).toBe(true)
  })

  it('treats copying a file onto itself (in any case) as a skip', async () => {
    const source = put('Part.sldprt', 'x')
    const sameFile = isWindows ? source.toUpperCase() : source
    await expect(invoke('fs:copy-file', source, sameFile)).resolves.toEqual({
      success: true,
      fileCount: 0,
      skipped: true,
    })
  })

  it('copies a folder tree and makes the scan rediscover it', async () => {
    put('Proj/a.sldprt', 'a')
    put('Proj/Sub/b.sldprt', 'b')
    await scan()

    await expect(
      invoke('fs:copy-file', path.join(vault, 'Proj'), path.join(vault, 'Proj Copy')),
    ).resolves.toEqual({ success: true, fileCount: 2 })

    // The copy suppressed its own watcher events, so only a rebuilt scan can find it
    const result = await delta(['Proj Copy'])
    expect(paths(result.files)).toContain('Proj Copy/Sub/b.sldprt')
  })

  it('moves a file, creating the destination folder', async () => {
    const source = put('a.sldprt', 'a')
    const dest = path.join(vault, 'Moved', 'a.sldprt')
    await expect(invoke('fs:move-file', source, dest)).resolves.toEqual({ success: true, fileCount: 1 })
    expect(fs.existsSync(source)).toBe(false)
    expect(fs.readFileSync(dest, 'utf8')).toBe('a')
  })

  it('refuses to move a folder into itself or its own subfolder', async () => {
    put('Proj/a.sldprt', 'a')
    const source = path.join(vault, 'Proj')
    for (const dest of [source, path.join(source, 'Sub')]) {
      await expect(invoke('fs:move-file', source, dest)).resolves.toEqual({
        success: false,
        error: 'Cannot move a folder into itself or a subfolder',
      })
    }
    expect(fs.existsSync(path.join(source, 'a.sldprt'))).toBe(true)
  })

  it('falls back to copy and delete when a rename across volumes is refused', async () => {
    const source = put('a.sldprt', 'a')
    const dest = path.join(vault, 'Other', 'a.sldprt')
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw Object.assign(new Error('EXDEV: cross-device link not permitted'), { code: 'EXDEV' })
    })

    await expect(invoke('fs:move-file', source, dest)).resolves.toEqual({ success: true, fileCount: 1 })
    expect(fs.existsSync(source)).toBe(false)
    expect(fs.readFileSync(dest, 'utf8')).toBe('a')
  })

  it('does not leave a duplicate behind when the fallback cannot remove the source', async () => {
    const source = put('a.sldprt', 'a')
    const dest = path.join(vault, 'Other', 'a.sldprt')
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw Object.assign(new Error('EXDEV: cross-device link not permitted'), { code: 'EXDEV' })
    })
    vi.spyOn(fs, 'unlinkSync').mockImplementation((target) => {
      if (path.resolve(String(target)) === path.resolve(source)) {
        throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' })
      }
      realUnlinkSync(target)
    })

    const result = await invoke('fs:move-file', source, dest)
    expect(result.success).toBe(false)
    expect(fs.readFileSync(source, 'utf8')).toBe('a')
    expect(fs.existsSync(dest)).toBe(false)
  })
})

describe('rename', () => {
  it('renames a file and reports one file', async () => {
    const oldPath = put('old.sldprt', 'x')
    const newPath = path.join(vault, 'new.sldprt')
    await expect(invoke('fs:rename', oldPath, newPath)).resolves.toEqual({ success: true, fileCount: 1 })
    expect(fs.existsSync(newPath)).toBe(true)
  })

  it('reports a locked folder rename as a failure with lock details', async () => {
    put('Locked/a.sldprt', 'a')
    const oldPath = path.join(vault, 'Locked')
    const newPath = path.join(vault, 'Renamed')
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' })
    })
    stubPlatform('linux')

    const result = await invoke('fs:rename', oldPath, newPath)
    expect(result).toMatchObject({ success: false, lockInfo: expect.any(String) })
    expect(fs.existsSync(path.join(oldPath, 'a.sldprt'))).toBe(true)
  }, 15_000)

  it('rediscovers a folder that the Windows Move-Item fallback renamed', async () => {
    put('Locked/a.sldprt', 'a')
    put('Locked/Sub/b.sldprt', 'b')
    const oldPath = path.join(vault, 'Locked')
    const newPath = path.join(vault, 'Renamed')
    await scan()

    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' })
    })
    stubPlatform('win32')
    // PowerShell's Move-Item gets through where Node's rename was refused
    execMock.mockImplementation(
      (_command: string, _options: unknown, callback: (error: Error | null, out: object) => void) => {
        realRenameSync(oldPath, newPath)
        callback(null, { stdout: '', stderr: '' })
      },
    )

    await expect(invoke('fs:rename', oldPath, newPath)).resolves.toEqual({ success: true, fileCount: 2 })
    expect(execMock).toHaveBeenCalledTimes(1)
    vi.restoreAllMocks()
    restorePlatform()

    // The handler moved a subtree behind the watcher's back: the next delta must see it
    const result = await delta(['Locked'])
    expect(paths(result.files)).toEqual(['Renamed', 'Renamed/Sub', 'Renamed/a.sldprt', 'Renamed/Sub/b.sldprt'])
  }, 15_000)
})

describe('delete and the recycle bin', () => {
  it('recycles a file and drops it from the cached scan', async () => {
    const target = put('a.sldprt', 'a')
    put('b.sldprt', 'b')
    await scan()

    await expect(invoke('fs:delete', target)).resolves.toEqual({ success: true })
    expect(trashItemMock).toHaveBeenCalledWith(target)
    expect(fs.existsSync(target)).toBe(false)
    expect(paths((await delta(['b.sldprt'])).files)).toEqual(['b.sldprt'])
  })

  it('falls back to a permanent delete for a user delete the recycle bin refused', async () => {
    const target = put('a.sldprt', 'a')
    await invoke('fs:set-readonly', target, true)
    trashItemMock.mockRejectedValue(new Error('Recycle Bin unavailable'))

    await expect(invoke('fs:delete', target)).resolves.toEqual({ success: true })
    expect(fs.existsSync(target)).toBe(false)
  })

  it('leaves the file on disk when an automatic delete cannot recycle it', async () => {
    const target = put('orphan.sldprt', 'still here')
    trashItemMock.mockRejectedValue(new Error('Recycle Bin unavailable'))

    const result = await invoke('fs:delete', target, true)
    expect(result).toMatchObject({ success: false, skipped: true })
    expect(fs.readFileSync(target, 'utf8')).toBe('still here')
  })

  it('reports a path that does not exist', async () => {
    await expect(invoke('fs:delete', path.join(vault, 'nope'))).resolves.toEqual({
      success: false,
      error: 'Path does not exist',
    })
  })

  it('batch: recycles, counts an already-gone path as done, and keeps what it could not recycle', async () => {
    const a = put('a.sldprt', 'a')
    const b = put('b.sldprt', 'b')
    const gone = path.join(vault, 'gone.sldprt')
    trashItemMock.mockImplementation(async (target: string) => {
      if (target === b) throw new Error('Recycle Bin unavailable')
      realRenameSync(target, path.join(trashDir, path.basename(target)))
    })

    const result = await invoke<Result & { results: Result[]; summary: Record<string, number> }>(
      'fs:delete-batch',
      [a, gone, b],
      true,
      true,
    )
    expect(result.results.map((r) => [r.success, r.skipped ?? false])).toEqual([
      [true, false],
      [true, false],
      [false, true],
    ])
    expect(result.summary).toMatchObject({ total: 3, succeeded: 2, failed: 1, skipped: 1 })
    expect(fs.existsSync(a)).toBe(false)
    expect(fs.existsSync(b)).toBe(true)
  })

  it('batch: an automatic caller can never permanently delete', async () => {
    const target = put('a.sldprt', 'a')
    const result = await invoke<Result & { results: Result[] }>('fs:delete-batch', [target], false, true)
    expect(result.results[0]).toMatchObject({ success: false, skipped: true })
    expect(fs.existsSync(target)).toBe(true)
    expect(trashItemMock).not.toHaveBeenCalled()
  })

  it('batch: a user permanent delete removes files and folders', async () => {
    const file = put('a.sldprt', 'a')
    put('Folder/b.sldprt', 'b')
    const folder = path.join(vault, 'Folder')
    const result = await invoke('fs:delete-batch', [file, folder], false, false)
    expect(result.success).toBe(true)
    expect(fs.existsSync(file) || fs.existsSync(folder)).toBe(false)
    expect(trashItemMock).not.toHaveBeenCalled()
  })
})

describe('download', () => {
  let server: http.Server
  let baseUrl: string
  const body = Buffer.from('downloaded part body')

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      if (request.url === '/redirect') {
        response.writeHead(302, { location: `${baseUrl}/file` })
        response.end()
        return
      }
      response.writeHead(200, { 'content-length': String(body.length) })
      response.end(body)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    return () => new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('downloads through a redirect and verifies the expected hash', async () => {
    const dest = path.join(vault, 'Parts', 'down.sldprt')
    const result = await invoke('fs:download-url', `${baseUrl}/redirect`, dest, sha256(body))
    expect(result).toEqual({ success: true, hash: sha256(body), size: body.length })
    expect(fs.readFileSync(dest).equals(body)).toBe(true)
    expect(fs.existsSync(dest + '.download')).toBe(false)
  })

  it('discards a download whose hash does not match and keeps the old file', async () => {
    const dest = put('down.sldprt', 'previous version')
    const result = await invoke('fs:download-url', `${baseUrl}/file`, dest, sha256('something else'))
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/hash mismatch/) })
    expect(fs.readFileSync(dest, 'utf8')).toBe('previous version')
    expect(fs.existsSync(dest + '.download')).toBe(false)
  })

  it('replaces a read-only local copy (get latest over a checked-in file)', async () => {
    const dest = put('down.sldprt', 'previous version')
    await invoke('fs:set-readonly', dest, true)
    const result = await invoke('fs:download-url', `${baseUrl}/file`, dest, sha256(body))
    expect(result).toMatchObject({ success: true })
    expect(fs.readFileSync(dest).equals(body)).toBe(true)
  })

  it('sweeps orphaned .download temp files when a vault is opened', async () => {
    const other = fs.mkdtempSync(path.join(path.dirname(vault), 'vault2-'))
    const orphan = path.join(other, 'Parts', 'half.sldprt.download')
    fs.mkdirSync(path.dirname(orphan), { recursive: true })
    fs.writeFileSync(orphan, 'partial')

    await invoke('working-dir:set', other)
    await vi.waitFor(() => expect(fs.existsSync(orphan)).toBe(false))
  })
})
