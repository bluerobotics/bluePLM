/**
 * Hook to determine current seasonal theme
 * Supports manual selection and automatic date-based activation
 */

import { useMemo } from 'react'
import { usePDMStore } from '@/stores/pdmStore'
import type { SeasonalTheme } from '../types'
import { CHRISTMAS_DATE_RANGE, HALLOWEEN_DATE_RANGE } from '../constants'

function isDateInRange(
  date: Date,
  range: { start: { month: number; day: number }; end: { month: number; day: number } }
): boolean {
  const month = date.getMonth() + 1
  const day = date.getDate()
  
  if (range.start.month <= range.end.month) {
    return (
      (month > range.start.month || (month === range.start.month && day >= range.start.day)) &&
      (month < range.end.month || (month === range.end.month && day <= range.end.day))
    )
  }
  // Handle year wrap (e.g., Dec-Jan)
  return (
    month > range.start.month || 
    (month === range.start.month && day >= range.start.day) ||
    month < range.end.month || 
    (month === range.end.month && day <= range.end.day)
  )
}

export function useSeasonalTheme(): SeasonalTheme {
  const theme = usePDMStore(s => s.theme)
  const autoApply = usePDMStore(s => s.autoApplySeasonalThemes)
  
  return useMemo(() => {
    // Manual theme selection takes priority
    if (theme === 'christmas') return 'christmas'
    if (theme === 'halloween') return 'halloween'
    if (theme === 'weather') return 'weather'
    
    // Auto-apply based on date
    if (autoApply) {
      const now = new Date()
      if (isDateInRange(now, CHRISTMAS_DATE_RANGE)) return 'christmas'
      if (isDateInRange(now, HALLOWEEN_DATE_RANGE)) return 'halloween'
    }
    
    return null
  }, [theme, autoApply])
}
