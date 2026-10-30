import { useRef } from 'react'
import { Search, X } from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'
import { useTranslation } from '@/lib/i18n'
import { FIELD_CLASS } from '@/components/core/ui'
import { useShortcuts } from '@/lib/keybindings'
import { useSettingsSearch } from '../useSettingsSearch'

/**
 * The search box at the top of the settings navigation. Typing filters live: the main view shows
 * the matching settings and the navigation narrows to their tabs. Arrow keys move through the
 * results, Enter opens the highlighted one, Escape clears. Ctrl/Cmd+F (`settings.focusSearch`)
 * focuses the box.
 */
export function SettingsSearchBox() {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const query = usePDMStore((s) => s.settingsSearchQuery)
  const setQuery = usePDMStore((s) => s.setSettingsSearchQuery)
  const activeIndex = usePDMStore((s) => s.settingsSearchActiveIndex)
  const setActiveIndex = usePDMStore((s) => s.setSettingsSearchActiveIndex)
  const openSettingFromSearch = usePDMStore((s) => s.openSettingFromSearch)
  const { hits } = useSettingsSearch()

  useShortcuts('settings', {
    'settings.focusSearch': () => {
      inputRef.current?.focus()
      inputRef.current?.select()
    },
  })

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (query) {
        e.preventDefault()
        e.stopPropagation()
        setQuery('')
      } else {
        inputRef.current?.blur()
      }
      return
    }
    if (hits.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((activeIndex + 1) % hits.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((activeIndex - 1 + hits.length) % hits.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const hit = hits[Math.min(activeIndex, hits.length - 1)]
      openSettingFromSearch(hit.entry.tab, hit.entry.label)
      inputRef.current?.blur()
    }
  }

  return (
    <div className="px-[17px] pt-4">
      <div className="relative flex items-center">
        <Search
          size={16}
          strokeWidth={1.75}
          className="pointer-events-none absolute left-2.5 text-ui-fg-secondary"
          aria-hidden
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('settings.searchPlaceholder')}
          aria-label={t('settings.searchPlaceholder')}
          spellCheck={false}
          autoComplete="off"
          className={`${FIELD_CLASS} h-7 bg-ui-search pl-[34px] pr-7`}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              inputRef.current?.focus()
            }}
            title={t('settings.searchClear')}
            aria-label={t('settings.searchClear')}
            className="absolute right-1.5 rounded p-1 text-ui-fg-secondary hover:bg-ui-hover hover:text-ui-fg"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  )
}
