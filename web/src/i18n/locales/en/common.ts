import type { TranslationValue } from '@/lib/i18n/types'

export const common: Record<string, TranslationValue> = {
  loading: 'Loading…',
  retry: 'Retry',
  cancel: 'Cancel',
  save: 'Save',
  close: 'Close',
  back: 'Back',
  search: 'Search',
  noResults: 'Nothing found',
  unknownError: 'Something went wrong',
  errorWithMessage: 'Something went wrong: {{message}}',
  notFound: 'Not found',
  notFoundBody: 'This page does not exist, or you do not have access to it.',
  forbidden: 'Only administrators can open this page.',
}
