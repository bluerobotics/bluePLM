/* global __dirname, clearInterval, console, process, require, setInterval, setTimeout */
/* eslint-disable @typescript-eslint/no-require-imports -- This manual Electron smoke loads the runtime-only native CommonJS addon. */
/*
 * Manual Windows integration check for the optional eDrawings embedding path.
 * Requires eDrawings and a local CAD sample below C:\BluePLM.
 */
const { app, BrowserWindow } = require('electron')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { classifyRenderedVisual } = require('./edrawings-render-classifier.cjs')

const artifactDirectory = process.env.BLUEPLM_PREVIEW_TEST_ARTIFACT_DIR
const legacyArtifactPaths = [
  path.join(os.tmpdir(), 'BluePLM-eDrawings-preview-test-result.json'),
  path.join(os.tmpdir(), 'BluePLM-eDrawings-preview-test-checkpoint.json'),
]

for (const legacyArtifactPath of legacyArtifactPaths) {
  fs.rmSync(legacyArtifactPath, { force: true })
}

function writeArtifact(name, value) {
  if (!artifactDirectory) return
  fs.mkdirSync(artifactDirectory, { recursive: true })
  fs.writeFileSync(path.join(artifactDirectory, name), JSON.stringify(value))
}

function checkpoint(stage) {
  writeArtifact('checkpoint.json', { stage, at: new Date().toISOString() })
}

function listPreviewHostProcessIds() {
  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      '(Get-Process -Name "BluePLM.EDrawingsPreviewHost" -ErrorAction SilentlyContinue).Id -join ","',
    ],
    { encoding: 'utf8', windowsHide: true },
  )
  if (result.status !== 0) throw new Error(result.stderr || 'Could not query preview host processes.')
  return result.stdout
    .trim()
    .split(',')
    .filter(Boolean)
    .map(value => Number.parseInt(value, 10))
}

function hasExclusiveFileAccess(filePath) {
  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      '$stream=[IO.File]::Open($env:BLUEPLM_LOCK_PROBE_FILE,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);$stream.Dispose()',
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, BLUEPLM_LOCK_PROBE_FILE: filePath },
      windowsHide: true,
    },
  )
  return result.status === 0
}

async function waitForNoNewPreviewHosts(baselineProcessIds, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const remaining = listPreviewHostProcessIds().filter(id => !baselineProcessIds.includes(id))
    if (remaining.length === 0) return []
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  return listPreviewHostProcessIds().filter(id => !baselineProcessIds.includes(id))
}

function findCadFile(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      const nested = findCadFile(entryPath)
      if (nested) return nested
    } else if (/\.(sldprt|sldasm|step|stp)$/i.test(entry.name)) {
      return entryPath
    }
  }
  return null
}

app.whenReady().then(async () => {
  checkpoint('app-ready')
  const requestedSample = process.env.BLUEPLM_PREVIEW_TEST_FILE
  const expectedErrorCode = process.env.BLUEPLM_PREVIEW_TEST_EXPECT_ERROR_CODE
  const sample = requestedSample || findCadFile('C:\\BluePLM')
  if (!sample) throw new Error('No local CAD sample found below C:\\BluePLM.')
  if (!expectedErrorCode && !fs.existsSync(sample)) throw new Error(`CAD sample does not exist: ${sample}`)

  const window = new BrowserWindow({
    // GetVisualState samples desktop pixels, so a hidden owner makes the
    // render assertion meaningless. CI can opt out explicitly if it only
    // needs the protocol check.
    show:
      process.env.BLUEPLM_SHOW_PREVIEW_TEST !== '0' ||
      process.env.BLUEPLM_PREVIEW_TEST_MINIMIZE === '1',
    width: 960,
    height: 640,
  })
  await window.loadURL('data:text/html,<body style="margin:0;background:#000;color:#fff"><main>BluePLM eDrawings integration check</main></body>')
  checkpoint('window-loaded')

  const addon = require(path.join(__dirname, '..', 'resources', 'bin', 'win32', 'edrawings_preview.node'))
  if (typeof addon.isAvailable !== 'function' || !addon.isAvailable()) {
    throw new Error('The eDrawings ActiveX registration is unavailable.')
  }
  const host = path.join(
    __dirname,
    '..',
    'edrawings-preview-host',
    'publish',
    'win-x64',
    'BluePLM.EDrawingsPreviewHost.exe',
  )
  const preview = new addon.EDrawingsPreview()
  checkpoint('before-attach')
  if (!preview.attachToWindow(window.getNativeWindowHandle())) {
    throw new Error(preview.lastError())
  }
  checkpoint('after-attach')
  // Production first reports the final panel geometry and then starts the
  // host. Keeping the same order prevents a 1×1 ActiveX render surface.
  checkpoint('before-initial-bounds')
  if (!preview.setBounds(0, 0, 960, 640)) {
    throw new Error(preview.lastError() || 'Could not size the embedded preview.')
  }
  checkpoint('after-initial-bounds')
  if (process.env.BLUEPLM_PREVIEW_TEST_FAST_NAVIGATION === '1') {
    const baselineProcessIds = listPreviewHostProcessIds()
    const loadAttempts = []
    for (let index = 0; index < 5; index += 1) {
      loadAttempts.push(preview.loadFile(sample, host))
      await new Promise(resolve => setTimeout(resolve, 40))
    }
    const loadResults = await Promise.all(loadAttempts)
    const exclusiveFileAccessWhileLoaded = hasExclusiveFileAccess(sample)
    preview.destroy()
    window.destroy()
    const orphanProcessIds = await waitForNoNewPreviewHosts(baselineProcessIds)
    const result = {
      sample,
      loadResults,
      exclusiveFileAccessWhileLoaded,
      baselineProcessIds,
      orphanProcessIds,
    }
    writeArtifact('result.json', result)
    console.log(JSON.stringify(result))
    const finalLoad = loadResults.at(-1)
    app.exit(finalLoad?.accepted && finalLoad?.ready && orphanProcessIds.length === 0 ? 0 : 1)
    return
  }
  checkpoint('before-load-file')
  let mainLoopTicksDuringLoad = 0
  const loadStartedAt = Date.now()
  const mainLoopTicker = setInterval(() => {
    mainLoopTicksDuringLoad += 1
  }, 10)
  let loaded
  try {
    loaded = await preview.loadFile(sample, host)
  } finally {
    clearInterval(mainLoopTicker)
  }
  const loadDurationMs = Date.now() - loadStartedAt
  if (expectedErrorCode) {
    const result = {
      sample,
      loaded,
      expectedErrorCode,
      loadDurationMs,
      mainLoopTicksDuringLoad,
      windowState: preview.getWindowState(),
      error: preview.lastError(),
    }
    checkpoint('expected-error-written')
    preview.destroy()
    result.destroyedWindowState = preview.getWindowState()
    window.destroy()
    writeArtifact('result.json', result)
    console.log(JSON.stringify(result))
    app.exit(loaded.errorCode === expectedErrorCode ? 0 : 1)
    return
  }
  if (!loaded.accepted || !loaded.ready || !preview.show()) {
    throw new Error(preview.lastError() || 'Could not size or show the embedded preview.')
  }
  checkpoint('after-load-and-show')

  const durationMs = Number.parseInt(process.env.BLUEPLM_PREVIEW_TEST_DURATION_MS ?? '60000', 10)
  const timeoutMs = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 60000
  const deadline = Date.now() + timeoutMs
  const finish = (rendered, visual, suspiciousWhiteDialog, lifecycle) => {
    checkpoint('before-visual-sample')
    const result = {
      sample,
      loaded: preview.isLoaded(),
      rendered,
      suspiciousWhiteDialog,
      visual,
      lifecycle,
      windowState: preview.getWindowState(),
      loadDurationMs,
      mainLoopTicksDuringLoad,
      error: preview.lastError(),
    }
    checkpoint('result-written')
    preview.destroy()
    result.destroyedWindowState = preview.getWindowState()
    window.destroy()
    writeArtifact('result.json', result)
    console.log(JSON.stringify(result))
    app.exit(rendered ? 0 : 1)
  }
  const isRenderedVisual = (visual) => {
    const suspiciousWhiteDialog = visual.brightRatio > 0.9 && visual.luminanceVariance < 1000
    return {
      suspiciousWhiteDialog,
      rendered:
        visual.available &&
        !suspiciousWhiteDialog &&
        (visual.brightRatio > 0.1 || visual.luminanceVariance > 30),
    }
  }
  const verifyMinimizeLifecycle = (visual, suspiciousWhiteDialog) => {
    const before = preview.getWindowState()
    // Mirror the production owner lifecycle.  Win32 owned windows do not
    // reliably inherit Electron's minimize state across processes, so BluePLM
    // deliberately drives visibility on the owner events.
    window.on('minimize', () => preview.hide())
    window.on('restore', () => preview.show())
    window.once('minimize', () => {
      setTimeout(() => {
        const minimized = preview.getWindowState()
        const hiddenWithOwner = minimized.exists && minimized.visible === false
        window.once('restore', () => {
          setTimeout(() => {
            const restored = preview.getWindowState()
            const restoredWithOwner = restored.exists && restored.visible === true
            finish(hiddenWithOwner && restoredWithOwner, visual, suspiciousWhiteDialog, {
              before,
              minimized,
              restored,
              hiddenWithOwner,
              restoredWithOwner,
            })
          }, 750)
        })
        window.restore()
      }, 750)
    })
    window.minimize()
  }
  const verifyHiddenBoundsLifecycle = (visual, suspiciousWhiteDialog) => {
    const shown = preview.getWindowState()
    const visibleBounds = preview.setBounds(8, 8, 944, 624)
    setTimeout(() => {
      const afterVisibleBounds = preview.getWindowState()
      const hidden = () => {
        const afterHide = preview.getWindowState()
        const bounded = preview.setBounds(0, 0, 960, 640)
        setTimeout(() => {
          const afterBounds = preview.getWindowState()
          const remainsHidden =
            shown.exists && shown.visible === true &&
            visibleBounds && afterVisibleBounds.exists && afterVisibleBounds.visible === true &&
            afterHide.exists && afterHide.visible === false &&
            bounded && afterBounds.exists && afterBounds.visible === false
          finish(remainsHidden, visual, suspiciousWhiteDialog, {
            shown,
            visibleBounds,
            afterVisibleBounds,
            afterHide,
            bounded,
            afterBounds,
            remainsHidden,
          })
        }, 750)
      }
      if (!visibleBounds || !preview.hide()) {
        finish(false, visual, suspiciousWhiteDialog, { shown, visibleBounds, afterVisibleBounds })
        return
      }
      // Hide and bounds placement are asynchronous Win32 operations.  Sample
      // between them and after the bounds request so the assertion observes the
      // production Show -> Hide -> SetBounds sequence rather than call order.
      setTimeout(hidden, 750)
    }, 750)
  }
  const verifyRenderTimeline = () => {
    const requestedInterval = Number.parseInt(process.env.BLUEPLM_PREVIEW_TEST_TIMELINE_INTERVAL_MS ?? '4000', 10)
    const intervalMs = Number.isFinite(requestedInterval) && requestedInterval > 0 ? requestedInterval : 4000
    const samples = []
    const capture = () => {
      const visual = preview.getVisualState()
      const windowState = preview.getWindowState()
      samples.push({
        elapsedMs: samples.length * intervalMs,
        visual,
        windowVisible: windowState.visible,
        ownedByHost: windowState.ownedByHost,
        topmost: windowState.topmost,
        classification: classifyRenderedVisual(visual),
      })
      if (samples.length === 8) {
        const stable = samples.every((sample) =>
          sample.windowVisible === true &&
          sample.ownedByHost === true &&
          sample.topmost === false &&
          sample.classification === 'model-or-mixed',
        )
        finish(stable, visual, false, { renderTimeline: samples, stable })
        return
      }
      const inset = samples.length % 2 === 0 ? 0 : 8
      if (!preview.setBounds(inset, inset, 960 - inset * 2, 640 - inset * 2)) {
        finish(false, visual, false, { renderTimeline: samples, boundsUpdateFailed: true })
        return
      }
      setTimeout(capture, intervalMs)
    }
    capture()
  }
  const sampleVisualState = () => {
    const visual = preview.getVisualState()
    // A valid eDrawings viewport includes its grey scene background and model.
    // A near-uniform white capture is the .NET error/loading surface that the
    // former one-shot check incorrectly accepted as a successful preview.
    const { suspiciousWhiteDialog, rendered } = isRenderedVisual(visual)
    if (rendered || Date.now() >= deadline) {
      if (rendered && process.env.BLUEPLM_PREVIEW_TEST_RENDER_TIMELINE === '1') {
        verifyRenderTimeline()
        return
      }
      if (rendered && process.env.BLUEPLM_PREVIEW_TEST_VISIBILITY_RACE === '1') {
        verifyHiddenBoundsLifecycle(visual, suspiciousWhiteDialog)
        return
      }
      if (rendered && process.env.BLUEPLM_PREVIEW_TEST_MINIMIZE === '1') {
        verifyMinimizeLifecycle(visual, suspiciousWhiteDialog)
        return
      }
      finish(rendered, visual, suspiciousWhiteDialog, undefined)
      return
    }
    setTimeout(sampleVisualState, 2000)
  }
  setTimeout(sampleVisualState, 2000)
}).catch((error) => {
  console.error(error.stack || String(error))
  app.exitCode = 1
  app.quit()
})
