import { useEffect, useRef } from 'react'
import { ChevronRight, SearchX } from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'
import { useTranslation } from '@/lib/i18n'
import { highlightSegments } from '@/lib/fuzzySearch'
import { useSettingsSearch } from '../useSettingsSearch'

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
      <div className="flex-1 overflow-y-auto bg-plm-bg">
        <div className="flex flex-col items-center justify-center gap-2 py-24 text-plm-fg-muted">
          <SearchX size={28} className="opacity-60" />
          <div className="text-sm text-plm-fg">{t('settings.searchNoResults', { query })}</div>
          <div className="text-xs">{t('settings.searchNoResultsHint')}</div>
        </div>
      </div>
    )
  }

  // Index of each group's first hit in the flat list the keyboard moves through.
  const groupStarts = groups.map((_, g) =>
    groups.slice(0, g).reduce((sum, prev) => sum + prev.settings.length, 0),
  )

  return (
    <div className="flex-1 overflow-y-auto bg-plm-bg">
      <div className="max-w-3xl mx-auto p-6">
        <div className="flex items-baseline justify-between mb-4">
          <span className="text-sm text-plm-fg-muted">
            {hits.length === 1
              ? t('settings.searchResultCountOne')
              : t('settings.searchResultCount', { count: hits.length })}
          </span>
          <span className="text-xs text-plm-fg-muted/70">{t('settings.searchKeyboardHint')}</span>
        </div>

        <div className="flex flex-col gap-4">
          {groups.map((group, g) => (
            <section key={group.tab}>
              <div className="flex items-center gap-1 px-2 mb-1 text-[12px] font-mono uppercase text-plm-fg-muted/60">
                <span>{group.category}</span>
                <ChevronRight size={12} />
                <span className="normal-case font-sans text-[13px] text-plm-fg-dim">
                  <Highlighted text={group.tabLabel} positions={group.tabLabelPositions} />
                </span>
              </div>
              <div className="rounded-lg border border-plm-border/60 bg-plm-sidebar/40 overflow-hidden">
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
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-[13px] border-b border-plm-border/40 last:border-b-0 outline-none transition-colors ${
                        isActive ? 'bg-plm-highlight text-plm-fg' : 'text-plm-fg-dim'
                      }`}
                    >
                      <span className="truncate">
                        <Highlighted text={hit.entry.label} positions={hit.labelPositions} />
                      </span>
                      <span className="flex items-center gap-2 flex-shrink-0">
                        {hit.matchedKeyword && hit.labelPositions.length === 0 && (
                          <span className="text-[11px] text-plm-fg-muted">
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
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
