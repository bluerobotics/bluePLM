import { Folder, Globe } from 'lucide-react'
import type { FiltersDropdownProps, SearchScope } from './types'

const SCOPE_OPTIONS: { id: SearchScope; label: string; icon: React.ReactNode }[] = [
  { id: 'current-folder', label: 'Current folder', icon: <Folder size={14} /> },
  { id: 'all-folders', label: 'All folders', icon: <Globe size={14} /> },
]

/**
 * Dropdown menu displaying scope toggle and all available search filters
 */
export function FiltersDropdown({
  filters,
  currentFilter,
  onSelect,
  searchScope,
  onScopeChange,
}: FiltersDropdownProps) {
  return (
    <div className="absolute top-full left-0 mt-1 w-64 bg-plm-bg border border-plm-border rounded-lg shadow-2xl z-[60] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
      <div className="p-2 border-b border-plm-border">
        <div className="text-[10px] uppercase tracking-wider text-plm-fg-muted font-medium mb-2">
          Scope
        </div>
        <div className="flex items-center gap-1">
          {SCOPE_OPTIONS.map((scope) => (
            <button
              key={scope.id}
              onClick={() => onScopeChange(scope.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                searchScope === scope.id
                  ? 'bg-plm-accent/20 text-plm-accent border border-plm-accent/50'
                  : 'bg-plm-bg-lighter text-plm-fg-muted border border-plm-border hover:text-plm-fg hover:border-plm-fg-muted'
              }`}
            >
              {scope.icon}
              <span>{scope.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="px-2 pt-2 pb-1">
        <div className="text-[10px] uppercase tracking-wider text-plm-fg-muted font-medium">
          Filter
        </div>
      </div>
      <div className="p-1 max-h-64 overflow-y-auto">
        {filters.map((filter) => (
          <button
            key={filter.id}
            onClick={() => onSelect(filter.id)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors ${
              currentFilter === filter.id
                ? 'bg-plm-accent/20 text-plm-accent'
                : 'text-plm-fg hover:bg-plm-bg-lighter'
            }`}
          >
            <span className={currentFilter === filter.id ? 'text-plm-accent' : 'text-plm-fg-muted'}>
              {filter.icon}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{filter.label}</div>
              <div className="text-xs text-plm-fg-muted truncate">{filter.description}</div>
            </div>
            {filter.prefix && (
              <code className="text-[10px] px-1.5 py-0.5 bg-plm-bg-light border border-plm-border rounded font-mono">
                {filter.prefix}
              </code>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
