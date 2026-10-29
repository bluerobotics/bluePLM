import { fuzzySearch, type FuzzyField } from '@/lib/fuzzySearch'
import type { SettingsTab } from '@/types/settings'
import type { SettingsCatalog, SettingsSection } from './settingsCatalog'

/** One searchable row: a settings tab itself, or one setting inside it. */
export interface SettingsSearchEntry {
  tab: SettingsTab
  tabLabel: string
  category: string
  /** The setting's rendered English label; for a tab entry, the tab label. */
  label: string
  keywords: readonly string[]
  tabKeywords: readonly string[]
  isTab: boolean
}

export interface SettingsSearchHit {
  entry: SettingsSearchEntry
  score: number
  /** Matched character indices in `entry.label`. */
  labelPositions: number[]
  /** A keyword that matched, shown so a synonym hit does not look unexplained. */
  matchedKeyword: string | null
}

export interface SettingsSearchGroup {
  tab: SettingsTab
  tabLabel: string
  category: string
  score: number
  /** Matched character indices in `tabLabel`, when the tab name itself matched. */
  tabLabelPositions: number[]
  settings: SettingsSearchHit[]
}

const FIELDS: readonly FuzzyField<SettingsSearchEntry>[] = [
  { get: (e) => e.label, weight: 1 },
  { get: (e) => e.keywords, weight: 0.8 },
  // A tab's name finds every setting in it, ranked below a direct label hit.
  { get: (e) => e.tabLabel, weight: 0.55 },
  { get: (e) => e.category, weight: 0.35 },
  { get: (e) => e.tabKeywords, weight: 0.45 },
]

export function buildSettingsSearchIndex(
  sections: readonly SettingsSection[],
  catalog: SettingsCatalog,
): SettingsSearchEntry[] {
  const index: SettingsSearchEntry[] = []
  for (const section of sections) {
    for (const item of section.items) {
      const tabKeywords = item.keywords ?? []
      const base = { tab: item.id, tabLabel: item.label, category: section.category, tabKeywords }
      index.push({ ...base, label: item.label, keywords: tabKeywords, isTab: true })
      for (const setting of catalog[item.id] ?? []) {
        index.push({ ...base, label: setting.label, keywords: setting.keywords ?? [], isTab: false })
      }
    }
  }
  return index
}

/**
 * Rank every setting against `query` and group the hits by tab. Groups are ordered by their
 * best hit (a tab-name match counts), settings within a group by their own score.
 */
export function searchSettings(
  index: readonly SettingsSearchEntry[],
  query: string,
): SettingsSearchGroup[] {
  const groups = new Map<SettingsTab, SettingsSearchGroup>()
  const tabHits = new Map<SettingsTab, SettingsSearchHit>()

  for (const result of fuzzySearch(index, query, FIELDS)) {
    const entry = result.item
    let group = groups.get(entry.tab)
    if (!group) {
      group = {
        tab: entry.tab,
        tabLabel: entry.tabLabel,
        category: entry.category,
        score: result.score,
        tabLabelPositions: [],
        settings: [],
      }
      groups.set(entry.tab, group)
    }
    const labelHit = result.hits.find((h) => h.field === 0)
    const tabHit = result.hits.find((h) => h.field === 2)

    const keywordHit = result.hits.find((h) => h.field === 1)
    const hit: SettingsSearchHit = {
      entry,
      score: result.score,
      labelPositions: labelHit?.positions ?? [],
      matchedKeyword: keywordHit ? (entry.keywords[keywordHit.index] ?? null) : null,
    }

    if (entry.isTab) {
      group.tabLabelPositions = labelHit?.positions ?? tabHit?.positions ?? []
      tabHits.set(entry.tab, hit)
      continue
    }
    if (tabHit && group.tabLabelPositions.length === 0) {
      group.tabLabelPositions = tabHit.positions
    }
    group.settings.push(hit)
  }

  // A tab that matched by name but has no matching setting is offered as a row of its own, so
  // every group has something to open and to reach with the keyboard.
  for (const group of groups.values()) {
    const tabHit = tabHits.get(group.tab)
    if (group.settings.length === 0 && tabHit) group.settings.push(tabHit)
  }

  return [...groups.values()]
}

/** Every hit in display order, for keyboard navigation across groups. */
export function flattenSettingsSearch(groups: readonly SettingsSearchGroup[]): SettingsSearchHit[] {
  return groups.flatMap((g) => g.settings)
}
