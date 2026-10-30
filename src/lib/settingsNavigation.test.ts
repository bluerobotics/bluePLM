import { describe, expect, it, vi } from 'vitest'
import { SETTINGS_TABS } from '@/types/settings'
import {
  applySettingsNavigationEvent,
  registerSettingsNavigationListener,
} from './settingsNavigation'

describe('settings navigation events', () => {
  it.each(SETTINGS_TABS)('opens the settings modal on %s', (tab) => {
    const actions = { openSettings: vi.fn() }
    expect(
      applySettingsNavigationEvent(
        new CustomEvent('navigate-settings-tab', { detail: tab }),
        actions,
      ),
    ).toBe(true)
    expect(actions.openSettings).toHaveBeenCalledWith(tab)
  })

  it.each(['unknown', null, 42])('ignores invalid tab %s', (tab) => {
    const actions = { openSettings: vi.fn() }
    expect(
      applySettingsNavigationEvent(
        new CustomEvent('navigate-settings-tab', { detail: tab }),
        actions,
      ),
    ).toBe(false)
    expect(actions.openSettings).not.toHaveBeenCalled()
  })

  it('registers and disposes the listener', () => {
    const target = new EventTarget() as unknown as Window
    const actions = { openSettings: vi.fn() }
    const dispose = registerSettingsNavigationListener(target, actions)
    target.dispatchEvent(new CustomEvent('navigate-settings-tab', { detail: 'export' }))
    expect(actions.openSettings).toHaveBeenCalledWith('export')
    dispose()
    target.dispatchEvent(new CustomEvent('navigate-settings-tab', { detail: 'export' }))
    expect(actions.openSettings).toHaveBeenCalledTimes(1)
  })
})
