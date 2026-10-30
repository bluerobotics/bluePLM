import { describe, expect, it } from 'vitest'
import { settingsCatalog, settingsSections } from './settingsCatalog'
import { buildSettingsSearchIndex, flattenSettingsSearch, searchSettings } from './settingsSearch'

const index = buildSettingsSearchIndex(settingsSections(), settingsCatalog)
const search = (q: string) => searchSettings(index, q)
const top = (q: string) => flattenSettingsSearch(search(q))[0]?.entry

describe('settings catalog', () => {
  it('only lists settings for tabs the navigation has', () => {
    const tabs = new Set(settingsSections().flatMap((s) => s.items.map((i) => i.id)))
    for (const tab of Object.keys(settingsCatalog)) expect(tabs.has(tab as never)).toBe(true)
  })

  it('has no duplicate label within a tab and no HTML entities', () => {
    for (const [tab, entries] of Object.entries(settingsCatalog)) {
      const labels = (entries ?? []).map((e) => e.label)
      expect(new Set(labels).size, tab).toBe(labels.length)
      for (const label of labels) expect(label).not.toMatch(/&\w+;/)
    }
  })
})

describe('searchSettings', () => {
  it('finds an individual setting by its label', () => {
    expect(top('dark')).toMatchObject({ tab: 'appearance', label: 'Dark' })
    expect(top('keepout')).toMatchObject({ tab: 'serialization', label: 'Keepout Zones' })
  })

  it('finds settings by abbreviation, typo and synonym', () => {
    expect(top('autodl')?.label).toMatch(/^auto-download/i)
    expect(top('seiral')?.tab).toBe('serialization')
    expect(top('hotkeys')?.tab).toBe('keybindings')
  })

  it('matches multi-word queries across label and tab', () => {
    expect(top('solidworks thumbnail')).toMatchObject({ tab: 'solidworks' })
    expect(top('rfq logo')).toMatchObject({ tab: 'rfq', label: 'Show company logo' })
  })

  it('lists every setting of a tab whose name matches, under one group', () => {
    const groups = search('serialization')
    expect(groups[0].tab).toBe('serialization')
    expect(groups[0].tabLabelPositions.length).toBeGreaterThan(0)
    expect(groups[0].settings.length).toBe(settingsCatalog.serialization!.length)
  })

  it('offers a tab with no catalogued setting as its own row', () => {
    const groups = search('item designations')
    const group = groups.find((g) => g.tab === 'item-designations')!
    expect(group.settings.length).toBeGreaterThan(0)
  })

  it('returns nothing for nonsense', () => {
    expect(search('qzxv')).toEqual([])
  })

  it('leaves admin-only tabs out when the index is built without them', () => {
    const sections = settingsSections().map((s) => ({
      ...s,
      items: s.items.filter((i) => i.id !== 'recovery-codes'),
    }))
    const groups = searchSettings(buildSettingsSearchIndex(sections, settingsCatalog), 'recovery')
    expect(groups.some((g) => g.tab === 'recovery-codes')).toBe(false)
  })
})
