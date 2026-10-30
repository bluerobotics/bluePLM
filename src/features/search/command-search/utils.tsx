import { Folder, FileSpreadsheet, Presentation, FileText, HardDrive } from 'lucide-react'
import type { ParsedQuery, SearchFilter, FilterOption } from './types'
import { FILTER_OPTIONS } from './constants'

/**
 * Parse query string and extract filter prefix if present
 */
export function parseQuery(query: string, activeFilter: SearchFilter): ParsedQuery {
  const trimmedQuery = query.trim()
  for (const filter of FILTER_OPTIONS) {
    if (filter.prefix && trimmedQuery.toLowerCase().startsWith(filter.prefix)) {
      return {
        filter: filter.id,
        searchTerm: trimmedQuery.slice(filter.prefix.length).trim(),
      }
    }
  }
  return { filter: activeFilter, searchTerm: trimmedQuery }
}

/** What the file pane searches for: a bare term and one of the types the pane can filter on. */
export interface PaneSearch {
  query: string
  type: 'all' | 'files' | 'folders'
}

/**
 * The file pane search a parsed query stands for. The pane matches on name, description and part
 * number, so it gets the term without its prefix ("folder:bracket" searches folders for
 * "bracket", not for the literal text). Filters the pane cannot express - who has a file checked
 * out, a workflow state, Google Drive - leave the pane alone; their results show in the dropdown.
 */
export function toPaneSearch(parsed: ParsedQuery): PaneSearch {
  switch (parsed.filter) {
    case 'files':
    case 'folders':
      return { query: parsed.searchTerm, type: parsed.filter }
    case 'checked-out':
    case 'state':
    case 'drive':
      return { query: '', type: 'all' }
    default:
      return { query: parsed.searchTerm, type: 'all' }
  }
}

/**
 * The search box text for a pane search that changed elsewhere (a tab switch restoring its
 * search), so the box shows the same filter the pane is using.
 */
export function fromPaneSearch(query: string, type: PaneSearch['type']): string {
  if (!query) return ''
  const prefix = FILTER_OPTIONS.find((f) => f.id === type)?.prefix ?? ''
  return prefix + query
}

/**
 * Get the current filter option from parsed query filter
 */
export function getCurrentFilter(filterType: SearchFilter): FilterOption {
  return FILTER_OPTIONS.find((f) => f.id === filterType) || FILTER_OPTIONS[0]
}

/**
 * Get icon for Google Drive file type
 */
export function getDriveFileIcon(mimeType: string) {
  if (mimeType === 'application/vnd.google-apps.folder') {
    return <Folder size={16} className="text-plm-warning" />
  } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    return <FileSpreadsheet size={16} className="text-green-500" />
  } else if (mimeType === 'application/vnd.google-apps.presentation') {
    return <Presentation size={16} className="text-orange-400" />
  } else if (mimeType === 'application/vnd.google-apps.document') {
    return <FileText size={16} className="text-blue-400" />
  } else {
    return <HardDrive size={16} className="text-plm-fg-muted" />
  }
}

/**
 * Get workflow state indicator element
 */
export function getStateIndicator(
  workflowState?: { name: string; label: string | null; color: string } | null,
) {
  if (!workflowState) return null
  return (
    <span
      className="w-2 h-2 rounded-full"
      style={{ backgroundColor: workflowState.color }}
      title={workflowState.label || workflowState.name}
    />
  )
}

/**
 * Get available filters based on auth state
 */
export function getAvailableFilters(isGdriveConnected: boolean): FilterOption[] {
  return FILTER_OPTIONS.filter(
    (f) => !f.requiresAuth || (f.requiresAuth === 'gdrive' && isGdriveConnected),
  )
}
