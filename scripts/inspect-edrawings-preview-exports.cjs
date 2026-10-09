/* global __dirname, console, process, require */
/* eslint-disable @typescript-eslint/no-require-imports -- Loads the runtime-only native CommonJS addon. */
const { app } = require('electron')
const path = require('node:path')

const expectedMode = process.argv[2]
if (expectedMode !== 'production' && expectedMode !== 'verify') {
  throw new Error('Expected either production or verify as the export mode.')
}

app.whenReady()
  .then(() => {
    const addon = require(path.join(
      __dirname,
      '..',
      'resources',
      'bin',
      'win32',
      'edrawings_preview.node',
    ))
    const preview = new addon.EDrawingsPreview()
    const productionMethods = [
      'attachToWindow',
      'loadFile',
      'setBounds',
      'show',
      'hide',
      'destroy',
      'isLoaded',
      'lastError',
    ]
    const missingProductionMethods = productionMethods.filter(
      method => typeof preview[method] !== 'function',
    )
    if (missingProductionMethods.length > 0) {
      throw new Error(
        `${expectedMode} addon is missing production exports: ${missingProductionMethods.join(', ')}`,
      )
    }
    const hasVisualState = typeof preview.getVisualState === 'function'
    const hasWindowState = typeof preview.getWindowState === 'function'
    const diagnosticsExpected = expectedMode === 'verify'

    if (hasVisualState !== diagnosticsExpected || hasWindowState !== diagnosticsExpected) {
      throw new Error(
        `${expectedMode} addon export mismatch: getVisualState=${hasVisualState}, getWindowState=${hasWindowState}`,
      )
    }
    console.log(`[eDrawings] ${expectedMode} addon exports are correctly gated.`)
    app.exit(0)
  })
  .catch(error => {
    console.error(error.stack || String(error))
    app.exit(1)
  })
