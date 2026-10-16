import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ChildProcess } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: false },
  BrowserWindow: class {},
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  shell: { openPath: vi.fn() },
}))

import {
  ipcMain,
  shell,
  type BrowserWindow,
  type IpcMainInvokeEvent,
} from 'electron'

import {
  createEDrawingsPreviewController,
  findEDrawingsExecutable,
  getEDrawingsNativeModuleCandidates,
  getEDrawingsPreviewHostCandidates,
  openEDrawingsFileExternally,
  type EDrawingsExternalOpenDependencies,
  registerEDrawingsHandlers,
  type NativeEDrawingsLoadResult,
  type NativeEDrawingsPreview,
  type PreviewOwner,
  validateEDrawingsPreviewFile,
  unregisterEDrawingsHandlers,
} from './edrawings'

class FakePreview implements NativeEDrawingsPreview {
  attachCalls = 0
  destroyCalls = 0
  hideCalls = 0
  loadCalls = 0
  setBoundsCalls = 0
  showCalls = 0
  loaded = false
  loadResult: Promise<NativeEDrawingsLoadResult> = Promise.resolve({ accepted: true, ready: true })

  attachToWindow(): boolean {
    this.attachCalls += 1
    return true
  }

  async loadFile(): Promise<NativeEDrawingsLoadResult> {
    this.loadCalls += 1
    const result = await this.loadResult
    this.loaded = result.accepted && result.ready
    return result
  }

  setBounds(): boolean {
    this.setBoundsCalls += 1
    return true
  }

  show(): boolean {
    this.showCalls += 1
    return true
  }

  hide(): boolean {
    this.hideCalls += 1
    return true
  }

  destroy(): boolean {
    this.destroyCalls += 1
    this.loaded = false
    return true
  }

  isLoaded(): boolean {
    return this.loaded
  }

  lastError(): string {
    return 'native failure'
  }
}

class FakeOwner extends EventEmitter implements PreviewOwner {
  private readonly rendererEvents = new EventEmitter()
  private windowDestroyed = false
  private webContentsDestroyed = false
  webContents: PreviewOwner['webContents']

  constructor(id: number) {
    super()
    this.webContents = {
      id,
      isDestroyed: () => this.webContentsDestroyed,
      on: (event, listener) => this.rendererEvents.on(event, listener),
      removeListener: (event, listener) => {
        if (this.webContentsDestroyed) throw new Error('Object has been destroyed')
        return this.rendererEvents.removeListener(event, listener)
      },
    }
  }

  getNativeWindowHandle(): Buffer {
    return Buffer.from([1, 2, 3, 4])
  }

  isDestroyed(): boolean {
    return this.windowDestroyed
  }

  isMinimized(): boolean {
    return false
  }

  isVisible(): boolean {
    return true
  }

  emitRendererLifecycle(
    event: 'render-process-gone' | 'did-start-navigation',
    navigationDetails = { isMainFrame: true, isSameDocument: false },
  ): void {
    this.rendererEvents.emit(event, navigationDetails)
  }

  destroyWindow(): void {
    this.windowDestroyed = true
    this.webContentsDestroyed = true
  }
}

function createController(previews: FakePreview[]) {
  let nextId = 0
  return createEDrawingsPreviewController({
    createPreview: () => previews.shift() ?? null,
    createSessionId: () => `session-${++nextId}`,
    getPreviewHostPath: () => 'C:\\resources\\BluePLM.EDrawingsPreviewHost.exe',
    validateFile: (filePath) =>
      typeof filePath === 'string'
        ? { success: true, filePath }
        : { success: false, errorCode: 'preview-file-invalid' },
    logWarn: vi.fn(),
  })
}

type ExternalOpenHandler = (event: IpcMainInvokeEvent, filePath: unknown) => Promise<unknown>

function registerExternalOpenHandler(vaultRoot: string) {
  vi.mocked(ipcMain.handle).mockClear()
  const owner = new FakeOwner(17)
  registerEDrawingsHandlers(owner as unknown as BrowserWindow, {
    getWorkingDirectory: () => vaultRoot,
    logWarn: vi.fn(),
  })
  const handler = vi.mocked(ipcMain.handle).mock.calls.find(
    ([channel]) => channel === 'edrawings:open-file',
  )?.[1]
  if (!handler) throw new Error('expected external eDrawings handler')
  return { owner, handler: handler as unknown as ExternalOpenHandler }
}

afterEach(() => {
  unregisterEDrawingsHandlers()
  vi.mocked(ipcMain.handle).mockClear()
  vi.mocked(shell.openPath).mockClear()
})

describe('findEDrawingsExecutable', () => {
  it('finds the current Common Files eDrawings year layout', () => {
    const expected = 'C:\\Program Files\\Common Files\\eDrawings2026\\eDrawings.exe'
    expect(findEDrawingsExecutable({
      exists: (candidate) => candidate === expected,
      listDirectories: (parent) => parent === 'C:\\Program Files\\Common Files' ? ['eDrawings2026'] : [],
    })).toBe(expected)
  })

  it('continues to support the historic SOLIDWORKS Corp layout', () => {
    const expected = 'C:\\Program Files\\SOLIDWORKS Corp\\eDrawings\\eDrawings.exe'
    expect(findEDrawingsExecutable({
      exists: (candidate) => candidate === expected,
      listDirectories: () => [],
    })).toBe(expected)
  })
})

describe('embedded eDrawings preview controller', () => {
  it('binds every operation to the creating renderer and cannot let a stale session destroy a successor', async () => {
    const previewA = new FakePreview()
    const previewB = new FakePreview()
    const controller = createController([previewA, previewB])
    const owner = new FakeOwner(17)

    const createdA = controller.create(owner, 17)
    expect(createdA).toEqual({ success: true, sessionId: 'session-1' })
    if (!createdA.success) throw new Error('expected preview session A')
    expect(await controller.attach(createdA.sessionId, 17)).toEqual({ success: true })
    await expect(controller.load(createdA.sessionId, 17, 'C:\\vault\\part.sldprt')).resolves.toEqual({
      success: true,
      accepted: true,
      ready: true,
    })
    expect(await controller.hide(createdA.sessionId, 18)).toMatchObject({ success: false })
    expect(previewA.hideCalls).toBe(0)

    const createdB = controller.create(owner, 17)
    expect(createdB).toEqual({ success: true, sessionId: 'session-2' })
    if (!createdB.success) throw new Error('expected preview session B')
    expect(previewA.destroyCalls).toBe(1)
    expect(await controller.destroy(createdA.sessionId, 17)).toMatchObject({ success: false })
    expect(previewB.destroyCalls).toBe(0)
  })

  it.each(['render-process-gone', 'did-start-navigation'] as const)(
    'does not let stale owner %s cleanup destroy its successor',
    async (event) => {
      const previewA = new FakePreview()
      const previewB = new FakePreview()
      const controller = createController([previewA, previewB])
      const ownerA = new FakeOwner(17)
      const ownerB = new FakeOwner(18)
      const createdA = controller.create(ownerA, 17)
      if (!createdA.success) throw new Error('expected preview session A')
      const createdB = controller.create(ownerB, 18)
      if (!createdB.success) throw new Error('expected preview session B')

      ownerA.emitRendererLifecycle(event)

      expect(previewA.destroyCalls).toBe(1)
      expect(previewB.destroyCalls).toBe(0)
      await expect(controller.attach(createdB.sessionId, 18)).resolves.toEqual({ success: true })
      expect(previewB.attachCalls).toBe(1)
    },
  )

  it('returns stale when a delayed older load resolves after a newer session supersedes it', async () => {
    let resolveLoad: (result: NativeEDrawingsLoadResult) => void = () => undefined
    const previewA = new FakePreview()
    previewA.loadResult = new Promise<NativeEDrawingsLoadResult>((resolve) => {
      resolveLoad = resolve
    })
    const previewB = new FakePreview()
    const controller = createController([previewA, previewB])
    const owner = new FakeOwner(17)
    const createdA = controller.create(owner, 17)
    if (!createdA.success) throw new Error('expected preview session A')
    const loadingA = controller.load(createdA.sessionId, 17, 'C:\\vault\\part.sldprt')

    const createdB = controller.create(owner, 17)
    if (!createdB.success) throw new Error('expected preview session B')
    resolveLoad({ accepted: true, ready: true })

    await expect(loadingA).resolves.toMatchObject({ success: false })
    expect(previewA.destroyCalls).toBe(1)
    expect(await controller.attach(createdB.sessionId, 17)).toEqual({ success: true })
    expect(previewB.attachCalls).toBe(1)
  })

  it('reports ready only after the native host has completed loading', async () => {
    const preview = new FakePreview()
    preview.loadResult = Promise.resolve({ accepted: true, ready: true })
    const controller = createController([preview])
    const owner = new FakeOwner(17)
    const created = controller.create(owner, 17)
    if (!created.success) throw new Error('expected preview session')

    await expect(controller.load(created.sessionId, 17, 'C:\\vault\\part.sldprt')).resolves.toEqual({
      success: true,
      accepted: true,
      ready: true,
    })
  })

  it('reports a host exit after ready through the session-bound status API', async () => {
    const preview = new FakePreview()
    const controller = createController([preview])
    const owner = new FakeOwner(17)
    const created = controller.create(owner, 17)
    if (!created.success) throw new Error('expected preview session')

    await expect(controller.load(created.sessionId, 17, 'C:\\vault\\part.sldprt')).resolves.toEqual(
      {
        success: true,
        accepted: true,
        ready: true,
      },
    )
    await expect(controller.status(created.sessionId, 17)).resolves.toEqual({ success: true })

    preview.loaded = false

    await expect(controller.status(created.sessionId, 17)).resolves.toEqual({
      success: false,
      errorCode: 'preview-host-exited',
    })
    await expect(controller.show(created.sessionId, 17)).resolves.toEqual({
      success: false,
      errorCode: 'preview-host-exited',
    })
    expect(preview.showCalls).toBe(0)
  })

  it('passes through a native host completion failure code', async () => {
    const preview = new FakePreview()
    preview.loadResult = Promise.resolve({
      accepted: false,
      ready: false,
      errorCode: 'preview-host-timeout',
    })
    const controller = createController([preview])
    const owner = new FakeOwner(17)
    const created = controller.create(owner, 17)
    if (!created.success) throw new Error('expected preview session')

    await expect(controller.load(created.sessionId, 17, 'C:\\vault\\part.sldprt')).resolves.toEqual({
      success: false,
      errorCode: 'preview-host-timeout',
    })
  })

  it('rejects an accepted native response without an explicit ready confirmation', async () => {
    const preview = new FakePreview()
    preview.loadResult = Promise.resolve({
      accepted: true,
      ready: false,
    } as unknown as NativeEDrawingsLoadResult)
    const controller = createController([preview])
    const owner = new FakeOwner(17)
    const created = controller.create(owner, 17)
    if (!created.success) throw new Error('expected preview session')

    await expect(controller.load(created.sessionId, 17, 'C:\\vault\\part.sldprt')).resolves.toEqual({
      success: false,
      errorCode: 'preview-document-load-failed',
    })
  })

  it('cannot show a superseded preview after its bounds await yields', async () => {
    const previewA = new FakePreview()
    const previewB = new FakePreview()
    const controller = createController([previewA, previewB])
    const owner = new FakeOwner(17)
    const createdA = controller.create(owner, 17)
    if (!createdA.success) throw new Error('expected preview session A')

    const showingA = controller.show(createdA.sessionId, 17)
    const createdB = controller.create(owner, 17)
    if (!createdB.success) throw new Error('expected preview session B')

    await expect(showingA).resolves.toEqual({
      success: false,
      errorCode: 'preview-session-not-active',
    })
    expect(previewA.showCalls).toBe(0)
    expect(await controller.attach(createdB.sessionId, 17)).toEqual({ success: true })
  })

  it('does not request a show after a hidden overlay receives an owner move', async () => {
    const preview = new FakePreview()
    const controller = createController([preview])
    const owner = new FakeOwner(17)
    const created = controller.create(owner, 17)
    if (!created.success) throw new Error('expected preview session')

    await expect(controller.hide(created.sessionId, 17)).resolves.toEqual({ success: true })
    owner.emit('move')
    await Promise.resolve()

    expect(preview.hideCalls).toBe(1)
    expect(preview.setBoundsCalls).toBe(1)
    expect(preview.showCalls).toBe(0)
  })

  it('destroys the preview when the renderer process is gone', async () => {
    const preview = new FakePreview()
    const controller = createController([preview])
    const owner = new FakeOwner(17)
    const created = controller.create(owner, 17)
    if (!created.success) throw new Error('expected preview session')

    owner.emitRendererLifecycle('render-process-gone')

    expect(preview.destroyCalls).toBe(1)
    await expect(controller.show(created.sessionId, 17)).resolves.toMatchObject({ success: false })
  })

  it.each([
    {
      navigation: 'a subframe cross-document navigation',
      details: { isMainFrame: false, isSameDocument: false },
      destroys: false,
    },
    {
      navigation: 'a same-document main-frame navigation',
      details: { isMainFrame: true, isSameDocument: true },
      destroys: false,
    },
    {
      navigation: 'a cross-document main-frame navigation',
      details: { isMainFrame: true, isSameDocument: false },
      destroys: true,
    },
  ])(
    'destroys the preview only for $navigation',
    async ({ details, destroys }) => {
      const preview = new FakePreview()
      const controller = createController([preview])
      const owner = new FakeOwner(17)
      const created = controller.create(owner, 17)
      if (!created.success) throw new Error('expected preview session')

      owner.emitRendererLifecycle('did-start-navigation', details)

      expect(preview.destroyCalls).toBe(destroys ? 1 : 0)
      await expect(controller.show(created.sessionId, 17)).resolves.toMatchObject({
        success: !destroys,
      })
    },
  )

  it('destroys the preview when its owning window closes', async () => {
    const preview = new FakePreview()
    const controller = createController([preview])
    const owner = new FakeOwner(17)
    const created = controller.create(owner, 17)
    if (!created.success) throw new Error('expected preview session')

    owner.emit('closed')

    expect(preview.destroyCalls).toBe(1)
    await expect(controller.hide(created.sessionId, 17)).resolves.toMatchObject({ success: false })
  })

  it('cleans up after closed when the BrowserWindow and webContents are already destroyed', () => {
    const preview = new FakePreview()
    const controller = createController([preview])
    const owner = new FakeOwner(17)
    const created = controller.create(owner, 17)
    if (!created.success) throw new Error('expected preview session')

    owner.destroyWindow()

    expect(() => owner.emit('closed')).not.toThrow()
    expect(preview.destroyCalls).toBe(1)
    expect(() => controller.cleanup()).not.toThrow()
    expect(preview.destroyCalls).toBe(1)
  })
})

describe('external eDrawings opening', () => {
  it('treats a nonempty shell fallback result as a failed launch', async () => {
    const logWarn = vi.fn()
    const openPath = vi.fn().mockResolvedValue('No application is associated with this file')
    const result = await openEDrawingsFileExternally('C:\\vault\\part.sldprt', {
      findExecutable: () => null,
      openPath,
      spawnProcess: vi.fn() as unknown as EDrawingsExternalOpenDependencies['spawnProcess'],
      logWarn,
    })

    expect(result).toBeNull()
    expect(logWarn).toHaveBeenCalledWith('[eDrawings] External shell fallback failed', {
      error: 'No application is associated with this file',
    })
  })

  it('reports an asynchronous child-process spawn error instead of claiming success', async () => {
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() }) as unknown as ChildProcess
    const logWarn = vi.fn()
    const opening = openEDrawingsFileExternally('C:\\vault\\part.sldprt', {
      findExecutable: () => 'C:\\Program Files\\eDrawings.exe',
      openPath: vi.fn(),
      spawnProcess: vi.fn(
        () => child,
      ) as unknown as EDrawingsExternalOpenDependencies['spawnProcess'],
      logWarn,
    })

    child.emit('error', new Error('spawn ENOENT'))

    await expect(opening).resolves.toBeNull()
    expect(child.unref).not.toHaveBeenCalled()
    expect(logWarn).toHaveBeenCalledWith('[eDrawings] Failed to start the external viewer', {
      error: 'Error: spawn ENOENT',
    })
  })

  it('waits for the child-process spawn event before reporting viewer success', async () => {
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() }) as unknown as ChildProcess
    const opening = openEDrawingsFileExternally('C:\\vault\\part.sldprt', {
      findExecutable: () => 'C:\\Program Files\\eDrawings.exe',
      openPath: vi.fn(),
      spawnProcess: vi.fn(
        () => child,
      ) as unknown as EDrawingsExternalOpenDependencies['spawnProcess'],
      logWarn: vi.fn(),
    })

    child.emit('spawn')

    await expect(opening).resolves.toBe('viewer')
    expect(child.unref).toHaveBeenCalledOnce()
  })

  it('validates the owning renderer and canonical vault CAD path before external fallback', async () => {
    const vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blueplm-edrawings-vault-'))
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blueplm-edrawings-outside-'))
    const allowedFile = path.join(vaultRoot, 'part.sldprt')
    const outsideFile = path.join(outsideRoot, 'part.sldprt')
    const unsupportedFile = path.join(vaultRoot, 'notes.txt')
    fs.writeFileSync(allowedFile, '')
    fs.writeFileSync(outsideFile, '')
    fs.writeFileSync(unsupportedFile, '')

    try {
      const { owner, handler } = registerExternalOpenHandler(vaultRoot)
      const foreignOwner = new FakeOwner(18)
      const invoke = (sender: FakeOwner['webContents'], filePath: unknown) =>
        handler({ sender } as unknown as IpcMainInvokeEvent, filePath)

      await expect(invoke(foreignOwner.webContents, allowedFile)).resolves.toEqual({
        success: false,
        errorCode: 'external-open-failed',
      })
      await expect(invoke(owner.webContents, '\\\\server\\vault\\part.sldprt')).resolves.toEqual({
        success: false,
        errorCode: 'external-open-failed',
      })
      await expect(invoke(owner.webContents, outsideFile)).resolves.toEqual({
        success: false,
        errorCode: 'external-open-failed',
      })
      await expect(invoke(owner.webContents, unsupportedFile)).resolves.toEqual({
        success: false,
        errorCode: 'external-open-failed',
      })
      expect(shell.openPath).not.toHaveBeenCalled()
    } finally {
      fs.rmSync(vaultRoot, { recursive: true, force: true })
      fs.rmSync(outsideRoot, { recursive: true, force: true })
    }
  })
})

describe('embedded eDrawings resource and file validation', () => {
  it('resolves packaged native resources only from process.resourcesPath', () => {
    const root = path.parse(process.cwd()).root
    const packaged = {
      isPackaged: true,
      resourcesPath: path.join(root, 'app', 'resources'),
      cwd: path.join(root, 'workspace'),
    }

    expect(getEDrawingsNativeModuleCandidates(packaged)).toEqual([
      path.join(packaged.resourcesPath, 'bin', 'edrawings_preview.node'),
    ])
    expect(getEDrawingsPreviewHostCandidates(packaged)).toEqual([
      path.join(
        packaged.resourcesPath,
        'bin',
        'edrawings-preview-host',
        'BluePLM.EDrawingsPreviewHost.exe',
      ),
    ])
  })

  it('keeps development-only cwd fallbacks outside packaged resolution', () => {
    const root = path.parse(process.cwd()).root
    const cwd = path.join(root, 'workspace')
    const candidates = getEDrawingsNativeModuleCandidates({
      isPackaged: false,
      resourcesPath: path.join(root, 'app', 'resources'),
      cwd,
    })
    expect(candidates).toContain(
      path.join(cwd, 'native', 'build', 'Release', 'edrawings_preview.node'),
    )
  })

  it('rejects manipulated renderer paths before the native host can read them', () => {
    const vaultRoot = path.resolve('vault')
    const inside = path.join(vaultRoot, 'parts', 'frame.sldprt')
    const neighbor = `${vaultRoot}-neighbor${path.sep}frame.sldprt`
    const symlink = path.join(vaultRoot, 'links', 'outside.sldprt')
    const dependencies = {
      realpath: (candidate: string) => candidate === symlink ? neighbor : candidate,
      isFile: (candidate: string) => candidate === inside || candidate === neighbor,
    }

    expect(validateEDrawingsPreviewFile(inside, vaultRoot, dependencies)).toMatchObject({
      success: true,
      filePath: inside,
    })
    expect(validateEDrawingsPreviewFile('\\\\server\\vault\\frame.sldprt', vaultRoot, dependencies))
      .toMatchObject({ success: false })
    expect(validateEDrawingsPreviewFile(`${vaultRoot}${path.sep}parts${path.sep}..${path.sep}frame.sldprt`, vaultRoot, dependencies))
      .toMatchObject({ success: false })
    expect(validateEDrawingsPreviewFile(neighbor, vaultRoot, dependencies)).toMatchObject({ success: false })
    expect(validateEDrawingsPreviewFile(symlink, vaultRoot, dependencies)).toMatchObject({ success: false })
    expect(validateEDrawingsPreviewFile(path.join(vaultRoot, 'notes.txt'), vaultRoot, dependencies))
      .toMatchObject({ success: false })
  })

  it.each(['.step', '.stp', '.stl', '.iges', '.igs'])(
    'accepts the externally documented eDrawings CAD format %s exposed by the UI',
    (extension) => {
      const vaultRoot = path.resolve('vault')
      const filePath = path.join(vaultRoot, `model${extension}`)
      const dependencies = {
        realpath: (candidate: string) => candidate,
        isFile: (candidate: string) => candidate === filePath,
      }

      expect(validateEDrawingsPreviewFile(filePath, vaultRoot, dependencies)).toEqual({
        success: true,
        filePath,
      })
    },
  )

  it('rejects a UNC vault root before resolving it from the main process', () => {
    const realpath = vi.fn((candidate: string) => candidate)

    expect(
      validateEDrawingsPreviewFile(
        'C:\\vault\\part.sldprt',
        '\\\\server\\vault',
        { realpath, isFile: () => true },
      ),
    ).toEqual({ success: false, errorCode: 'preview-vault-not-local' })
    expect(realpath).not.toHaveBeenCalled()
  })
})
