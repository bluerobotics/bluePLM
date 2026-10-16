import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { NativePreviewContextMenuBackdrop } from '../../browser/components/ContextMenu/NativePreviewContextMenuBackdrop'

import {
  CONTEXT_MENU_CLOSE_EVENT,
  CONTEXT_MENU_OPEN_EVENT,
  createNativePreviewVisibilityController,
  notifyNativePreviewContextMenu,
  observeNativePreviewOverlays,
} from './nativePreviewOverlay'

interface FakeRectangle {
  width: number
  height: number
}

interface FakeElementOptions {
  rectangles?: FakeRectangle[]
  marker?: string
  renderedMarkup?: string
  role?: string
  className?: string
  ariaLive?: string
  hidden?: boolean
  ariaHidden?: string
}

class FakeElement {
  readonly hidden: boolean

  constructor(private readonly options: FakeElementOptions = {}) {
    this.hidden = options.hidden ?? false
  }
  contains() {
    return false
  }
  getClientRects() {
    return this.options.rectangles ?? []
  }
  getAttribute(name: string) {
    if (name === 'aria-hidden') return this.options.ariaHidden ?? null
    return null
  }
  matches(selector: string) {
    if (
      this.options.renderedMarkup?.includes('data-native-preview-overlay=') &&
      selector.includes('[data-native-preview-overlay]')
    ) {
      return true
    }
    if (this.options.marker && selector.includes('[data-native-preview-overlay]')) return true
    if (this.options.role && selector.includes(`[role="${this.options.role}"]`)) return true
    if (
      this.options.marker === 'radix' &&
      selector.includes('[data-radix-popper-content-wrapper]')
    ) {
      return true
    }
    return false
  }
}

function stubOverlayDom(initialOverlays: FakeElementOptions[]) {
  const host = new FakeElement()
  let overlays = initialOverlays.map((options) => new FakeElement(options))
  let reportMutation: () => void = () => undefined
  let nextFrame = 1
  const animationFrames = new Map<number, () => void>()

  class FakeMutationObserver {
    constructor(callback: () => void) {
      reportMutation = callback
    }
    observe() {}
    disconnect() {}
  }

  vi.stubGlobal('HTMLElement', FakeElement)
  vi.stubGlobal('MutationObserver', FakeMutationObserver)
  vi.stubGlobal('document', {
    body: {},
    querySelectorAll: (selector: string) => overlays.filter((element) => element.matches(selector)),
  })
  vi.stubGlobal('window', {
    getComputedStyle: () => ({ display: 'flex', visibility: 'visible' }),
    requestAnimationFrame: (callback: () => void) => {
      const frame = nextFrame++
      animationFrames.set(frame, callback)
      return frame
    },
    cancelAnimationFrame: (frame: number) => animationFrames.delete(frame),
  })

  return {
    host: host as unknown as HTMLElement,
    replaceOverlays(options: FakeElementOptions[]) {
      overlays = options.map((overlayOptions) => new FakeElement(overlayOptions))
      reportMutation()
    },
    reportMutation,
    flushAnimationFrame() {
      const pending = [...animationFrames.values()]
      animationFrames.clear()
      pending.forEach((callback) => callback())
    },
  }
}

const VISIBLE_RECTANGLE = [{ width: 640, height: 480 }]

describe('native preview context-menu seam', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('keeps a loaded preview visible beside a persistent zero-area portal root', () => {
    const { host } = stubOverlayDom([
      { marker: 'modal', rectangles: [{ width: 0, height: 0 }] },
    ])
    let nativeVisible = true
    const hide = vi.fn(() => {
      nativeVisible = false
    })
    const show = vi.fn(() => {
      nativeVisible = true
    })
    const visibility = createNativePreviewVisibilityController({ hide, show })
    const stopObserving = observeNativePreviewOverlays(host, visibility.setOverlayCount)

    visibility.setReady(true)

    expect(nativeVisible).toBe(true)
    expect(hide).not.toHaveBeenCalled()
    expect(show).toHaveBeenCalledTimes(1)
    stopObserving()
  })

  it('hides for a positive-area portal overlay and restores after it is removed', () => {
    const overlayDom = stubOverlayDom([{ marker: 'modal', rectangles: VISIBLE_RECTANGLE }])
    let nativeVisible = true
    const hide = vi.fn(() => {
      nativeVisible = false
    })
    const show = vi.fn(() => {
      nativeVisible = true
    })
    const visibility = createNativePreviewVisibilityController({ hide, show })
    const stopObserving = observeNativePreviewOverlays(overlayDom.host, visibility.setOverlayCount)

    visibility.setReady(true)

    expect(nativeVisible).toBe(false)
    expect(hide).toHaveBeenCalledTimes(1)
    expect(show).not.toHaveBeenCalled()

    overlayDom.replaceOverlays([])
    overlayDom.flushAnimationFrame()

    expect(nativeVisible).toBe(true)
    expect(show).toHaveBeenCalledTimes(1)
    stopObserving()
  })

  it.each([
    ['modal', { role: 'dialog', rectangles: VISIBLE_RECTANGLE }],
    ['dropdown', { role: 'listbox', rectangles: VISIBLE_RECTANGLE }],
    ['toast', { marker: 'toast', rectangles: VISIBLE_RECTANGLE }],
    ['DOM tooltip', { role: 'tooltip', rectangles: VISIBLE_RECTANGLE }],
    ['drag overlay', { marker: 'drag', rectangles: VISIBLE_RECTANGLE }],
  ] satisfies [string, FakeElementOptions][])('detects a visible %s', (_name, overlay) => {
    const overlayDom = stubOverlayDom([overlay])
    const onOverlayCountChange = vi.fn()
    const stopObserving = observeNativePreviewOverlays(
      overlayDom.host,
      onOverlayCountChange,
    )

    expect(onOverlayCountChange).toHaveBeenCalledWith(1)
    stopObserving()
  })

  it('marks source-browser overlays that coexist with the details preview', () => {
    const sourceRoot = join(__dirname, '..', '..')
    const fileTree = readFileSync(join(sourceRoot, 'explorer', 'FileTree.tsx'), 'utf8')
    const cardFields = readFileSync(
      join(sourceRoot, 'browser', 'components', 'Toolbar', 'CardViewFieldsPopover.tsx'),
      'utf8',
    )
    const cardTooltip = readFileSync(
      join(sourceRoot, 'browser', 'components', 'FileGrid', 'FileCardMetadata.tsx'),
      'utf8',
    )

    expect(fileTree).toContain('data-native-preview-overlay="context-menu"')
    expect(fileTree.match(/data-native-preview-overlay="modal"/g)).toHaveLength(3)
    expect(cardFields).toContain('data-native-preview-overlay="dropdown"')
    expect(cardTooltip).toContain('data-native-preview-overlay="tooltip"')
  })

  it('keeps a replacement preview hidden under an already-open file context menu', () => {
    const renderedBackdrop = renderToStaticMarkup(
      createElement(NativePreviewContextMenuBackdrop, { onClose: vi.fn() }),
    )

    const overlayDom = stubOverlayDom([
      { renderedMarkup: renderedBackdrop, rectangles: VISIBLE_RECTANGLE },
    ])
    const hide = vi.fn()
    const show = vi.fn()
    const controller = createNativePreviewVisibilityController({ hide, show })
    const stopObserving = observeNativePreviewOverlays(overlayDom.host, controller.setOverlayCount)

    controller.setReady(true)

    expect(hide).toHaveBeenCalledTimes(1)
    expect(show).not.toHaveBeenCalled()

    overlayDom.replaceOverlays([])
    overlayDom.flushAnimationFrame()

    expect(show).toHaveBeenCalledTimes(1)
    stopObserving()
  })

  it('ignores a permanent non-overlay with z-50 and aria-live', () => {
    const overlayDom = stubOverlayDom([
      {
        className: 'fixed z-50',
        ariaLive: 'polite',
        rectangles: VISIBLE_RECTANGLE,
      },
    ])
    const onOverlayCountChange = vi.fn()
    const stopObserving = observeNativePreviewOverlays(
      overlayDom.host,
      onOverlayCountChange,
    )

    expect(onOverlayCountChange).toHaveBeenCalledWith(0)
    stopObserving()
  })

  it('keeps the preview hidden until overlapping observed overlays are both removed', () => {
    const overlayDom = stubOverlayDom([
      { role: 'dialog', rectangles: VISIBLE_RECTANGLE },
      { marker: 'toast', rectangles: VISIBLE_RECTANGLE },
    ])
    const hide = vi.fn()
    const show = vi.fn()
    const controller = createNativePreviewVisibilityController({ hide, show })
    const stopObserving = observeNativePreviewOverlays(
      overlayDom.host,
      controller.setOverlayCount,
    )

    controller.setReady(true)
    overlayDom.replaceOverlays([{ marker: 'toast', rectangles: VISIBLE_RECTANGLE }])
    overlayDom.flushAnimationFrame()

    expect(show).not.toHaveBeenCalled()

    overlayDom.replaceOverlays([])
    overlayDom.flushAnimationFrame()

    expect(hide).toHaveBeenCalled()
    expect(show).toHaveBeenCalledTimes(1)
    stopObserving()
  })

  it('coalesces mutation bursts into one report and cancels a pending report on cleanup', () => {
    const overlayDom = stubOverlayDom([])
    const onOverlayCountChange = vi.fn()
    const stopObserving = observeNativePreviewOverlays(
      overlayDom.host,
      onOverlayCountChange,
    )

    overlayDom.replaceOverlays([{ marker: 'toast', rectangles: VISIBLE_RECTANGLE }])
    overlayDom.reportMutation()
    overlayDom.reportMutation()

    expect(onOverlayCountChange).toHaveBeenCalledTimes(1)
    overlayDom.flushAnimationFrame()
    expect(onOverlayCountChange).toHaveBeenCalledTimes(2)
    expect(onOverlayCountChange).toHaveBeenLastCalledWith(1)

    overlayDom.replaceOverlays([])
    stopObserving()
    overlayDom.flushAnimationFrame()
    expect(onOverlayCountChange).toHaveBeenCalledTimes(2)
  })

  it('emits a hide event before the menu and a restore event after it closes', () => {
    vi.stubGlobal('window', new EventTarget())
    const events: string[] = []
    const onOpen = () => events.push('open')
    const onClose = () => events.push('close')
    window.addEventListener(CONTEXT_MENU_OPEN_EVENT, onOpen)
    window.addEventListener(CONTEXT_MENU_CLOSE_EVENT, onClose)

    notifyNativePreviewContextMenu(true)
    notifyNativePreviewContextMenu(false)

    expect(events).toEqual(['open', 'close'])
    window.removeEventListener(CONTEXT_MENU_OPEN_EVENT, onOpen)
    window.removeEventListener(CONTEXT_MENU_CLOSE_EVENT, onClose)
  })

  it('hides and restores the native preview for actual menu state transitions', () => {
    const hide = vi.fn()
    const show = vi.fn()
    const controller = createNativePreviewVisibilityController({ hide, show })

    controller.setContextMenuOpen(true)
    controller.setReady(true)
    expect(hide).toHaveBeenCalledTimes(1)
    expect(show).not.toHaveBeenCalled()

    controller.setContextMenuOpen(false)
    expect(show).toHaveBeenCalledTimes(1)
    controller.setContextMenuOpen(true)
    controller.setContextMenuOpen(false)
    expect(hide).toHaveBeenCalledTimes(2)
    expect(show).toHaveBeenCalledTimes(2)
  })

  it('never shows while a menu opened during native startup', () => {
    const calls: string[] = []
    const controller = createNativePreviewVisibilityController({
      hide: () => calls.push('hide'),
      show: () => calls.push('show'),
    })

    controller.setContextMenuOpen(true)
    controller.setReady(true)

    expect(calls).toEqual(['hide'])
  })

  it('never shows when a portal overlay opens during a slow native load', async () => {
    const overlayDom = stubOverlayDom([])
    let finishLoad!: () => void
    const loading = new Promise<void>((resolve) => {
      finishLoad = resolve
    })
    const hide = vi.fn()
    const show = vi.fn()
    const controller = createNativePreviewVisibilityController({ hide, show })
    const stopObserving = observeNativePreviewOverlays(overlayDom.host, controller.setOverlayCount)
    const completeStartup = loading.then(() => controller.setReady(true))

    overlayDom.replaceOverlays([{ marker: 'modal', rectangles: VISIBLE_RECTANGLE }])
    overlayDom.flushAnimationFrame()
    finishLoad()
    await completeStartup

    expect(hide).toHaveBeenCalledTimes(1)
    expect(show).not.toHaveBeenCalled()
    stopObserving()
  })

  it('keeps the native preview hidden until every simultaneous overlay closes', () => {
    const hide = vi.fn()
    const show = vi.fn()
    const controller = createNativePreviewVisibilityController({ hide, show })

    controller.setOverlayCount(2)
    controller.setReady(true)
    controller.setOverlayCount(1)

    expect(show).not.toHaveBeenCalled()
    expect(hide).toHaveBeenCalledTimes(2)

    controller.setOverlayCount(0)

    expect(show).toHaveBeenCalledTimes(1)
  })

  it('does not issue visibility IPC again when an observed DOM mutation leaves the overlay count unchanged', () => {
    const hide = vi.fn()
    const show = vi.fn()
    const controller = createNativePreviewVisibilityController({ hide, show })

    controller.setReady(true)
    controller.setOverlayCount(0)
    controller.setOverlayCount(0)
    controller.setOverlayCount(1)
    controller.setOverlayCount(1)

    expect(show).toHaveBeenCalledTimes(1)
    expect(hide).toHaveBeenCalledTimes(1)
  })

  it('does not show when the menu reopens during asynchronous preparation', async () => {
    let resolvePreparation!: () => void
    const preparation = new Promise<void>((resolve) => {
      resolvePreparation = resolve
    })
    const show = vi.fn()
    const hide = vi.fn()
    const controller = createNativePreviewVisibilityController({
      prepareShow: () => preparation,
      hide,
      show,
    })

    controller.setReady(true)
    controller.setContextMenuOpen(true)
    resolvePreparation()
    await Promise.resolve()

    expect(show).not.toHaveBeenCalled()
    expect(hide).toHaveBeenCalled()
  })

  it('invalidates preparation when the preview is disposed', async () => {
    let resolvePreparation!: () => void
    const preparation = new Promise<void>((resolve) => {
      resolvePreparation = resolve
    })
    const show = vi.fn()
    const controller = createNativePreviewVisibilityController({
      prepareShow: () => preparation,
      hide: vi.fn(),
      show,
    })

    controller.setReady(true)
    controller.setReady(false)
    resolvePreparation()
    await Promise.resolve()

    expect(show).not.toHaveBeenCalled()
  })

  it('hides after a stale show promise resolves', async () => {
    let resolveShow!: () => void
    const showPromise = new Promise<void>((resolve) => {
      resolveShow = resolve
    })
    const show = vi.fn(() => showPromise)
    const hide = vi.fn()
    const controller = createNativePreviewVisibilityController({ hide, show })

    controller.setReady(true)
    controller.setContextMenuOpen(true)
    resolveShow()
    await Promise.resolve()

    expect(hide).toHaveBeenCalled()
  })

  it('waits for a delayed hide before restoring after a persistent menu and independent overlays close', async () => {
    let resolveHide!: () => void
    const hidden = new Promise<void>((resolve) => {
      resolveHide = resolve
    })
    const hide = vi.fn(() => hidden)
    const show = vi.fn()
    const controller = createNativePreviewVisibilityController({ hide, show })

    controller.setReady(true)
    show.mockClear()
    controller.setContextMenuOpen(true)
    controller.setOverlayCount(2)
    controller.setOverlayCount(1)
    controller.setOverlayCount(0)

    expect(show).not.toHaveBeenCalled()

    controller.setContextMenuOpen(false)

    expect(show).not.toHaveBeenCalled()

    resolveHide()
    await Promise.resolve()

    expect(show).toHaveBeenCalledTimes(1)
  })

  it('does not send duplicate hides while one delayed hide already covers additional overlays', () => {
    const hidden = new Promise<void>(() => undefined)
    const hide = vi.fn(() => hidden)
    const controller = createNativePreviewVisibilityController({ hide, show: vi.fn() })

    controller.setReady(true)
    controller.setOverlayCount(1)
    controller.setOverlayCount(2)

    expect(hide).toHaveBeenCalledTimes(1)
  })

  it('does not start another hide after a resolved hide while the menu remains open', async () => {
    const nextHide = new Promise<void>(() => undefined)
    const hide = vi.fn().mockResolvedValueOnce(undefined).mockReturnValueOnce(nextHide)
    const controller = createNativePreviewVisibilityController({ hide, show: vi.fn() })

    controller.setContextMenuOpen(true)
    controller.setReady(true)
    await Promise.resolve()

    expect(hide).toHaveBeenCalledTimes(1)
  })

  it('does not resynchronize visibility after setReady(false) during a delayed hide', async () => {
    let resolveHide!: () => void
    const hidden = new Promise<void>((resolve) => {
      resolveHide = resolve
    })
    const hide = vi.fn(() => hidden)
    const show = vi.fn()
    const controller = createNativePreviewVisibilityController({ hide, show })

    controller.setContextMenuOpen(true)
    controller.setReady(true)
    controller.setReady(false)
    resolveHide()
    await Promise.resolve()

    expect(hide).toHaveBeenCalledTimes(1)
    expect(show).not.toHaveBeenCalled()
  })

  it('keeps the newer preview visible when an older show resolves after the menu closes', async () => {
    let resolveShowA!: () => void
    let resolveShowB!: () => void
    const showA = new Promise<void>((resolve) => {
      resolveShowA = resolve
    })
    const showB = new Promise<void>((resolve) => {
      resolveShowB = resolve
    })
    let nativeVisible = false
    const show = vi
      .fn()
      .mockImplementationOnce(() => {
        nativeVisible = true
        return showA
      })
      .mockImplementationOnce(() => {
        nativeVisible = true
        return showB
      })
    const hide = vi.fn(() => {
      nativeVisible = false
    })
    const controller = createNativePreviewVisibilityController({ hide, show })

    controller.setReady(true)
    controller.setContextMenuOpen(true)
    controller.setContextMenuOpen(false)
    resolveShowB()
    await Promise.resolve()
    expect(nativeVisible).toBe(true)

    resolveShowA()
    await Promise.resolve()

    expect(nativeVisible).toBe(true)
    expect(hide).toHaveBeenCalledTimes(1)
  })

  it('keeps the newer preview visible when an older show rejects after the menu closes', async () => {
    let rejectShowA!: (reason: Error) => void
    const showA = new Promise<void>((_, reject) => {
      rejectShowA = reject
    })
    let nativeVisible = false
    const show = vi
      .fn()
      .mockImplementationOnce(() => {
        nativeVisible = true
        return showA
      })
      .mockImplementationOnce(() => {
        nativeVisible = true
      })
    const hide = vi.fn(() => {
      nativeVisible = false
    })
    const controller = createNativePreviewVisibilityController({ hide, show })

    controller.setReady(true)
    controller.setContextMenuOpen(true)
    controller.setContextMenuOpen(false)
    rejectShowA(new Error('show A failed'))
    await Promise.resolve()

    expect(nativeVisible).toBe(true)
    expect(hide).toHaveBeenCalledTimes(1)
  })
})
