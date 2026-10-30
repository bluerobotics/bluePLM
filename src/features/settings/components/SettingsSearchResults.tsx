import { useEffect, useRef } from 'react'
import { ChevronRight } from 'lucide-react'
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
          <mark key={i} className="bg-transparent font-semibold text-ui-fg">
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
        <div className="space-y-1 px-4 pb-12 pt-5">
          <div className="text-[16px] font-semibold text-ui-fg">
            {t('settings.searchNoResults', { query })}
          </div>
          <div className="text-[14px] text-ui-fg-secondary">
            {t('settings.searchNoResultsHint')}
          </div>
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
      <div className="px-4 pb-12 pt-5">
        <div className="flex items-baseline justify-between gap-4 pb-1">
          <h3 className="text-[16px] font-semibold leading-6 text-ui-fg">
            {hits.length === 1
              ? t('settings.searchResultCountOne')
              : t('settings.searchResultCount', { count: hits.length })}
          </h3>
          <span className="text-[13px] text-ui-fg-secondary">
            {t('settings.searchKeyboardHint')}
          </span>
        </div>

        <SettingsGroup>
          {groups.flatMap((group, g) =>
            group.settings.map((hit, i) => {
              const index = groupStarts[g] + i
              const isActive = index === activeIndex
              return (
                <div key={`${group.tab}:${hit.entry.label}:${i}`} className="py-1">
                  <button
                    ref={isActive ? activeRef : undefined}
                    type="button"
                    onMouseMove={() => {
                      if (!isActive) setActiveIndex(index)
                    }}
                    onClick={() => openSettingFromSearch(hit.entry.tab, hit.entry.label)}
                    className={`-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-lg px-2 py-2 text-left outline-none transition-colors ${
                      isActive ? 'bg-ui-hover' : ''
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] text-ui-fg">
                        <Highlighted text={hit.entry.label} positions={hit.labelPositions} />
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 truncate text-[13px] text-ui-fg-secondary">
                        <span>{group.category}</span>
                        <ChevronRight size={12} aria-hidden className="flex-shrink-0" />
                        <span>
                          <Highlighted text={group.tabLabel} positions={group.tabLabelPositions} />
                        </span>
                        {hit.matchedKeyword && hit.labelPositions.length === 0 && (
                          <span>
                            {' · '}
                            {t('settings.searchMatchedKeyword', { keyword: hit.matchedKeyword })}
                          </span>
                        )}
                      </span>
                    </span>
                    <ChevronRight
                      size={16}
                      aria-hidden
                      className={`flex-shrink-0 ${isActive ? 'text-ui-fg' : 'text-ui-fg-secondary'}`}
                    />
                  </button>
                </div>
              )
            }),
          )}
        </SettingsGroup>
      </div>
    </div>
  )
}
