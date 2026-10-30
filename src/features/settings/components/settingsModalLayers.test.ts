// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { hasLayerAboveSettings, SETTINGS_MODAL_LAYER_ATTR } from './settingsModalLayers'

function mountSettingsModal(): HTMLElement {
  const overlay = document.createElement('div')
  overlay.className = 'fixed inset-0'
  overlay.setAttribute(SETTINGS_MODAL_LAYER_ATTR, '')
  overlay.setAttribute('data-native-preview-overlay', 'modal')
  const panel = document.createElement('div')
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'true')
  panel.setAttribute(SETTINGS_MODAL_LAYER_ATTR, '')
  overlay.appendChild(panel)
  document.body.appendChild(overlay)
  return panel
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('hasLayerAboveSettings', () => {
  it('ignores the settings modal itself', () => {
    mountSettingsModal()
    expect(hasLayerAboveSettings()).toBe(false)
  })

  it('sees a dialog opened from inside a settings page', () => {
    const panel = mountSettingsModal()
    const confirm = document.createElement('div')
    confirm.className = 'fixed inset-0 z-50'
    panel.appendChild(confirm)
    expect(hasLayerAboveSettings()).toBe(true)
  })

  it('sees a dialog portaled to the body', () => {
    mountSettingsModal()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.appendChild(dialog)
    expect(hasLayerAboveSettings()).toBe(true)
  })

  it('skips full-screen layers that ignore the pointer', () => {
    mountSettingsModal()
    const snow = document.createElement('div')
    snow.className = 'fixed inset-0'
    snow.style.pointerEvents = 'none'
    document.body.appendChild(snow)
    expect(hasLayerAboveSettings()).toBe(false)
  })

  it('skips an ancestor that contains the modal', () => {
    const root = document.createElement('div')
    root.className = 'fixed inset-0'
    document.body.appendChild(root)
    const overlay = document.createElement('div')
    overlay.setAttribute(SETTINGS_MODAL_LAYER_ATTR, '')
    root.appendChild(overlay)
    expect(hasLayerAboveSettings()).toBe(false)
  })
})
