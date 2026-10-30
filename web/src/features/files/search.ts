// Search inside one vault by file name, part number or description.
import { escapeLikePattern } from '@/lib/utils/likePattern'

export const SEARCH_COLUMNS = ['file_name', 'part_number', 'description'] as const
export const SEARCH_LIMIT = 200
export const MIN_SEARCH_LENGTH = 2

/** Trim and collapse whitespace; `*` is dropped because PostgREST reads it as a wildcard. */
export function normalizeSearch(query: string | null | undefined): string {
  return (query ?? '').replace(/\*/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Quote a value for a PostgREST logic tree (`or=(...)`): backslash and `"` are escaped. */
function quoteForLogicTree(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * The `or` filter that matches `query` as a substring of any search column, or null when the
 * query is too short to search. The text is LIKE-escaped first (so `_` and `%` match literally),
 * then quoted, so commas, dots and parentheses in it cannot break out of the filter.
 */
export function buildSearchFilter(query: string | null | undefined): string | null {
  const text = normalizeSearch(query)
  if (text.length < MIN_SEARCH_LENGTH) return null
  const pattern = quoteForLogicTree(`*${escapeLikePattern(text)}*`)
  return SEARCH_COLUMNS.map((column) => `${column}.ilike.${pattern}`).join(',')
}
