/*
 * Manual Windows integration check for the optional eDrawings embedding path.
 * Requires eDrawings and a local CAD sample below C:\BluePLM.
 */
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const resultPath = path.join(os.tmpdir(), 'BluePLM-eDrawings-preview-test-result.json')
const checkpointPath = path.join(os.tmpdir(), 'BluePLM-eDrawings-preview-test-checkpoint.json')
fs.rmSync(resultPath, { force: true })
fs.rmSync(checkpointPath, { force: true })

function checkpoint(stage) {
  fs.writeFileSync(checkpointPath, JSON.stringify({ stage, at: new Date().toISOString() }))
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
  const sample = requestedSample || findCadFile('C:\\BluePLM')
  if (!sample) throw new Error('No local CAD sample found below C:\\BluePLM.')
  if (!fs.existsSync(sample)) throw new Error(`CAD sample does not exist: ${sample}`)

  const window = new BrowserWindow({
    show:
      process.env.BLUEPLM_SHOW_PREVIEW_TEST === '1' ||
      process.env.BLUEPLM_PREVIEW_TEST_MINIMIZE === '1',
    width: 960,
    height: 640,
  })
  await window.loadURL('data:text/html,<body style="margin:0;background:#000;color:#fff"><main>BluePLM eDrawings integration check</main></body>')
  checkpoint('window-loaded')

  const addon = require(path.join(__dirname, '..', 'resources', 'bin', 'win32', 'edrawings_preview.node'))
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
  checkpoint('before-load-file')
  if (!preview.loadFile(sample, host) || !preview.show()) {
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
      error: preview.lastError(),
    }
    fs.writeFileSync(resultPath, JSON.stringify(result))
    checkpoint('result-written')
    preview.destroy()
    window.destroy()
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
  const sampleVisualState = () => {
    const visual = preview.getVisualState()
    // A valid eDrawings viewport includes its grey scene background and model.
    // A near-uniform white capture is the .NET error/loading surface that the
    // former one-shot check incorrectly accepted as a successful preview.
    const { suspiciousWhiteDialog, rendered } = isRenderedVisual(visual)
    if (rendered || Date.now() >= deadline) {
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
