/**
 * Hook to determine current seasonal theme
 * Only the user's own theme selection activates seasonal effects, never the date
 */

import { usePDMStore } from '@/stores/pdmStore'
import type { SeasonalTheme } from '../types'

export function useSeasonalTheme(): SeasonalTheme {
  const theme = usePDMStore((s) => s.theme)
  if (theme === 'christmas' || theme === 'halloween' || theme === 'weather') return theme
  return null
}
