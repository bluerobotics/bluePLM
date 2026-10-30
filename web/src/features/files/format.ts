import { getLanguage } from '@web/i18n'

/** A timestamp in the user's language, or '' when missing or unreadable. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(getLanguage(), { dateStyle: 'medium', timeStyle: 'short' }).format(date)
  } catch {
    return date.toISOString()
  }
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(getLanguage(), { dateStyle: 'medium' }).format(date)
  } catch {
    return date.toISOString().slice(0, 10)
  }
}
