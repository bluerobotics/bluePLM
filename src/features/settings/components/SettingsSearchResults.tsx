import { useEffect, useRef } from 'react'
import { ChevronRight, SearchX } from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'
import { useTranslation } from '@/lib/i18n'
import { highlightSegments } from '@/lib/fuzzySearch'
import { useSettingsSearch } from '../useSettingsSearch'
import { SettingsGroup } from './ui'

function Highlighted({ text, positions }: { text: string; positions: readonly number[] }) {
  return (
    <>
      {highlightSegments(text, positions).map((segment, i) =>
        segment.match ? (
          <mark key={i} className="bg-transparent text-plm-accent font-semibold">
            {segment.text}
          </mark>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </>
  )
}

/**
 * The main view while the settings search has a query: every matching setting, grouped by
 * its tab and ranked, updating on each keystroke. Opening one jumps to its panel and flashes it.
 */
export function SettingsSearchResults() {
  const { t } = useTranslation()
  const { query, groups, hits } = useSettingsSearch()
  const activeIndex = usePDMStore((s) => s.settingsSearchActiveIndex)
  const setActiveIndex = usePDMStore((s) => s.setSettingsSearchActiveIndex)
  const openSettingFromSearch = usePDMStore((s) => s.openSettingFromSearch)
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, query])

  if (hits.length === 0) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col items-center justify-center gap-1.5 py-24 text-plm-fg-muted">
          <SearchX size={20} className="mb-1 opacity-60" />
          <div className="text-[13px] font-medium text-plm-fg">
            {t('settings.searchNoResults', { query })}
          </div>
          <div className="text-[12px]">{t('settings.searchNoResultsHint')}</div>
        </div>
      </div>
    )
  }

  // Index of each group's first hit in the flat list the keyboard moves through.
  const groupStarts = groups.map((_, g) =>
    groups.slice(0, g).reduce((sum, prev) => sum + prev.settings.length, 0),
  )

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[860px] px-8 pb-16 pt-7">
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <span className="text-[13px] text-plm-fg-muted">
            {hits.length === 1
              ? t('settings.searchResultCountOne')
              : t('settings.searchResultCount', { count: hits.length })}
          </span>
          <span className="text-[12px] text-plm-fg-muted">{t('settings.searchKeyboardHint')}</span>
        </div>

        <div className="space-y-6">
          {groups.map((group, g) => (
            <section key={group.tab} className="space-y-2">
              <div className="flex items-center gap-1.5 text-[12px] text-plm-fg-muted">
                <span>{group.category}</span>
                <ChevronRight size={12} className="opacity-60" />
                <span className="text-[14px] font-semibold text-plm-fg">
                  <Highlighted text={group.tabLabel} positions={group.tabLabelPositions} />
                </span>
              </div>
              <SettingsGroup>
                {group.settings.map((hit, i) => {
                  const index = groupStarts[g] + i
                  const isActive = index === activeIndex
                  return (
                    <button
                      key={`${hit.entry.label}:${i}`}
                      ref={isActive ? activeRef : undefined}
                      type="button"
                      onMouseMove={() => {
                        if (!isActive) setActiveIndex(index)
                      }}
                      onClick={() => openSettingFromSearch(hit.entry.tab, hit.entry.label)}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[13px] outline-none transition-colors ${
                        isActive ? 'bg-plm-highlight text-plm-fg' : 'text-plm-fg-dim'
                      }`}
                    >
                      <span className="truncate">
                        <Highlighted text={hit.entry.label} positions={hit.labelPositions} />
                      </span>
                      <span className="flex flex-shrink-0 items-center gap-2">
                        {hit.matchedKeyword && hit.labelPositions.length === 0 && (
                          <span className="text-[12px] text-plm-fg-muted">
                            {t('settings.searchMatchedKeyword', { keyword: hit.matchedKeyword })}
                          </span>
                        )}
                        <ChevronRight
                          size={14}
                          className={isActive ? 'text-plm-accent' : 'text-plm-fg-muted/50'}
                        />
                      </span>
                    </button>
                  )
                })}
              </SettingsGroup>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
