import { describe, expect, it, vi } from 'vitest'

import {
  createPreviewSessionController,
  createPreviewSessionLifecycle,
  observePreviewHealth,
  PREVIEW_HEALTH_CHECK_INTERVAL_MS,
  schedulePreviewStart,
  type EDrawingsPreviewApi,
} from './previewSessionLifecycle'

type CreateResult = Awaited<ReturnType<EDrawingsPreviewApi['createEDrawingsPreview']>>
type LoadResult = Awaited<ReturnType<EDrawingsPreviewApi['loadEDrawingsFile']>>

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('embedded eDrawings preview session lifecycle', () => {
  it('propagates a host exit after ready and stops checking after cleanup', async () => {
    vi.useFakeTimers()
    const check = vi
      .fn()
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValue({ success: false, errorCode: 'preview-host-exited' })
    const onFailure = vi.fn()
    const stop = observePreviewHealth(check, onFailure, vi.fn())

    await vi.advanceTimersByTimeAsync(PREVIEW_HEALTH_CHECK_INTERVAL_MS)
    expect(onFailure).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(PREVIEW_HEALTH_CHECK_INTERVAL_MS)
    expect(onFailure).toHaveBeenCalledWith('preview-host-exited')

    stop()
    await vi.advanceTimersByTimeAsync(PREVIEW_HEALTH_CHECK_INTERVAL_MS)
    expect(check).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('debounces rapid selection and only starts the final preview', async () => {
    vi.useFakeTimers()
    const startFirst = vi.fn()
    const startFinal = vi.fn()

    const cancelFirst = schedulePreviewStart(startFirst)
    cancelFirst()
    schedulePreviewStart(startFinal)

    await vi.advanceTimersByTimeAsync(119)
    expect(startFirst).not.toHaveBeenCalled()
    expect(startFinal).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(startFirst).not.toHaveBeenCalled()
    expect(startFinal).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it('cleans up a scheduled preview before unmount', async () => {
    vi.useFakeTimers()
    const start = vi.fn()

    const cancel = schedulePreviewStart(start)
    cancel()
    await vi.runAllTimersAsync()

    expect(start).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('rejects a session created after its component unmounts while retaining its token for cleanup', () => {
    const lifecycle = createPreviewSessionLifecycle()

    lifecycle.dispose()
    lifecycle.registerSession('preview-a')

    expect(lifecycle.isActive('preview-a')).toBe(false)
    expect(lifecycle.sessionId).toBe('preview-a')
  })

  it('does not let a stale preview session become active after a newer panel starts', () => {
    const previewA = createPreviewSessionLifecycle()
    previewA.registerSession('preview-a')
    previewA.dispose()

    const previewB = createPreviewSessionLifecycle()
    previewB.registerSession('preview-b')

    expect(previewA.isActive('preview-a')).toBe(false)
    expect(previewB.isActive('preview-b')).toBe(true)
    expect(previewB.isActive('preview-a')).toBe(false)
  })

  it('keeps delayed A token-bound while B progresses, then destroys both sessions after unmount', async () => {
    const createA = deferred<CreateResult>()
    const createB = deferred<CreateResult>()
    const loadB = deferred<LoadResult>()
    const api = {
      createEDrawingsPreview: vi.fn()
        .mockReturnValueOnce(createA.promise)
        .mockReturnValueOnce(createB.promise),
      attachEDrawingsPreview: vi.fn().mockResolvedValue({ success: true }),
      loadEDrawingsFile: vi.fn().mockReturnValue(loadB.promise),
      getEDrawingsPreviewStatus: vi.fn().mockResolvedValue({ success: true }),
      setEDrawingsBounds: vi.fn().mockResolvedValue({ success: true }),
      showEDrawingsPreview: vi.fn().mockResolvedValue({ success: true }),
      hideEDrawingsPreview: vi.fn().mockResolvedValue({ success: true }),
      destroyEDrawingsPreview: vi.fn().mockResolvedValue({ success: true }),
    } satisfies EDrawingsPreviewApi

    const previewA = createPreviewSessionController(api)
    const pendingCreateA = previewA.create()
    previewA.dispose()

    const previewB = createPreviewSessionController(api)
    const pendingCreateB = previewB.create()
    createB.resolve({ success: true, sessionId: 'preview-b' })
    await pendingCreateB

    await previewB.attach()
    await previewB.status()
    await previewB.setBounds(1, 2, 3, 4)
    await previewB.show()
    await previewB.hide()

    const pendingLoadB = previewB.load('C:\\vault\\part.sldprt')
    previewB.dispose()
    loadB.resolve({ success: true, accepted: true, ready: true })
    expect(await pendingLoadB).toBeUndefined()

    createA.resolve({ success: true, sessionId: 'preview-a' })
    await pendingCreateA
    expect(previewA.isActive('preview-a')).toBe(false)

    await previewA.destroy()
    await previewB.destroy()

    expect(api.attachEDrawingsPreview).toHaveBeenCalledWith('preview-b')
    expect(api.getEDrawingsPreviewStatus).toHaveBeenCalledWith('preview-b')
    expect(api.setEDrawingsBounds).toHaveBeenCalledWith('preview-b', 1, 2, 3, 4)
    expect(api.showEDrawingsPreview).toHaveBeenCalledWith('preview-b')
    expect(api.hideEDrawingsPreview).toHaveBeenCalledWith('preview-b')
    expect(api.loadEDrawingsFile).toHaveBeenCalledWith('preview-b', 'C:\\vault\\part.sldprt')
    expect(api.destroyEDrawingsPreview).toHaveBeenCalledWith('preview-a')
    expect(api.destroyEDrawingsPreview).toHaveBeenCalledWith('preview-b')
  })
})
