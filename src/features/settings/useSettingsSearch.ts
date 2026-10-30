import { useMemo } from 'react'
import { usePDMStore } from '@/stores/pdmStore'
import { hasDesktop } from '@/lib/platform'
import { isSettingsTabAvailable, settingsCatalogFor, settingsSections } from './settingsCatalog'
import {
  buildSettingsSearchIndex,
  flattenSettingsSearch,
  searchSettings,
  type SettingsSearchGroup,
  type SettingsSearchHit,
} from './settingsSearch'

interface SettingsSearchState {
  query: string
  groups: SettingsSearchGroup[]
  hits: SettingsSearchHit[]
}

// The sidebar and the results view both read the same search on every keystroke; one cached
// result keeps that to a single pass.
let cache: { key: string; value: SettingsSearchState } | null = null

function runSearch(query: string, isAdmin: boolean, desktop: boolean): SettingsSearchState {
  const key = `${isAdmin ? 1 : 0}${desktop ? 1 : 0}\u0000${query}`
  if (cache?.key === key) return cache.value
  const sections = settingsSections().map((section) => ({
    ...section,
    items: section.items.filter((item) => isSettingsTabAvailable(item, isAdmin, desktop)),
  }))
  const groups = query.trim()
    ? searchSettings(buildSettingsSearchIndex(sections, settingsCatalogFor(desktop)), query)
    : []
  const value = { query: query.trim(), groups, hits: flattenSettingsSearch(groups) }
  cache = { key, value }
  return value
}

/** The live settings search: the trimmed query, hits grouped by tab, and the flat hit list. */
export function useSettingsSearch(): SettingsSearchState {
  const query = usePDMStore((s) => s.settingsSearchQuery)
  const isAdmin = usePDMStore((s) => s.getEffectiveRole() === 'admin')
  const desktop = hasDesktop()
  return useMemo(() => runSearch(query, isAdmin, desktop), [query, isAdmin, desktop])
}
