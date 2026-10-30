import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasDesktop } from '@/lib/platform'
import { computeDeniedModules, DESKTOP_ONLY_MODULES, MODULES } from '@/types/modules'
import type { SettingsTab } from '@/types/settings'
import {
  isDesktopOnlySettingsTab,
  isSettingsTabAvailable,
  settingsCatalog,
  settingsCatalogFor,
  settingsSections,
} from '@/features/settings/settingsCatalog'
import { buildSettingsSearchIndex, searchSettings } from '@/features/settings/settingsSearch'

// Pins what BluePLM Web (no Electron bridge) hides and what the desktop app keeps. Desktop
// behaviour must not change, so every "web" assertion has a desktop counterpart.

function stubHost(desktop: boolean): void {
  vi.stubGlobal('window', desktop ? { electronAPI: {} } : {})
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const WEB_HIDDEN_TABS: readonly SettingsTab[] = [
  'preferences',
  'supabase',
  'backup',
  'extension-store',
  'solidworks',
  'performance',
  'logs',
  'dev-tools',
  'about',
]

function visibleTabs(isAdmin: boolean): SettingsTab[] {
  const desktop = hasDesktop()
  return settingsSections().flatMap((s) =>
    s.items.filter((i) => isSettingsTabAvailable(i, isAdmin, desktop)).map((i) => i.id),
  )
}

describe('hasDesktop', () => {
  it('is false without the Electron bridge and true with it', () => {
    stubHost(false)
    expect(hasDesktop()).toBe(false)
    stubHost(true)
    expect(hasDesktop()).toBe(true)
  })
})

describe('modules on the web', () => {
  it('marks exactly Pending Changes, Google Drive and Terminal as desktop-only', () => {
    expect([...DESKTOP_ONLY_MODULES].sort()).toEqual(['google-drive', 'pending', 'terminal'])
  })

  it('denies the desktop-only modules on the web and nothing extra on the desktop', () => {
    stubHost(false)
    const web = computeDeniedModules([], true, hasDesktop())
    for (const id of DESKTOP_ONLY_MODULES) expect(web.has(id)).toBe(true)
    // Server-side modules stay available.
    for (const id of ['explorer', 'history', 'reviews', 'trash', 'eco', 'settings'] as const) {
      expect(web.has(id)).toBe(false)
    }

    stubHost(true)
    expect(computeDeniedModules([], true, hasDesktop()).size).toBe(0)
  })

  it('keeps admin denials and the workflows switch on both hosts', () => {
    for (const desktop of [false, true]) {
      const denied = computeDeniedModules(['eco'], false, desktop)
      expect(denied.has('eco')).toBe(true)
      expect(denied.has('workflows')).toBe(true)
    }
  })

  it('only marks modules that exist', () => {
    const ids = new Set(MODULES.map((m) => m.id))
    for (const id of DESKTOP_ONLY_MODULES) expect(ids.has(id)).toBe(true)
  })
})

describe('settings tabs on the web', () => {
  it('hides the desktop-only tabs on the web, for admins too', () => {
    stubHost(false)
    const tabs = visibleTabs(true)
    for (const tab of WEB_HIDDEN_TABS) expect(tabs, tab).not.toContain(tab)
    for (const tab of ['profile', 'appearance', 'sessions', 'team-members', 'metadata-columns'] as const) {
      expect(tabs).toContain(tab)
    }
  })

  it('shows every tab on the desktop for an admin', () => {
    stubHost(true)
    const all = settingsSections().flatMap((s) => s.items.map((i) => i.id))
    expect(visibleTabs(true)).toEqual(all)
  })

  it('names the same tabs desktop-only as the navigation hides', () => {
    for (const tab of WEB_HIDDEN_TABS) expect(isDesktopOnlySettingsTab(tab)).toBe(true)
    expect(isDesktopOnlySettingsTab('profile')).toBe(false)
  })

  it('keeps the search consistent with the navigation', () => {
    const webSections = settingsSections().map((s) => ({
      ...s,
      items: s.items.filter((i) => isSettingsTabAvailable(i, true, false)),
    }))
    const webIndex = buildSettingsSearchIndex(webSections, settingsCatalogFor(false))
    expect(searchSettings(webIndex, 'solidworks').some((g) => g.tab === 'solidworks')).toBe(false)
    // Desktop-only settings are left out, while the web keeps the ones that apply there.
    const updates = searchSettings(webIndex, 'Check for Updates')
    const labels = updates.flatMap((g) => g.settings.map((h) => h.entry.label))
    expect(labels).not.toContain('Check for Updates')
    const webPrefs = (settingsCatalogFor(false).preferences ?? []).map((e) => e.label)
    expect(webPrefs).not.toContain('Application Updates')
    expect(searchSettings(webIndex, 'dark mode').some((g) => g.tab === 'appearance')).toBe(true)

    expect(settingsCatalogFor(true)).toBe(settingsCatalog)
  })
})
