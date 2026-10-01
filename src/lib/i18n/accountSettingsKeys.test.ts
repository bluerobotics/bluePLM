import { describe, expect, it } from 'vitest'

import { getTranslation } from './index'

const LOCALES = ['en', 'de', 'fr', 'es', 'pt', 'zh-CN', 'zh-TW'] as const
const PLAIN_KEYS = [
  'accountSettings.notSignedIn',
  'accountSettings.profile',
  'accountSettings.noName',
  'accountSettings.role',
  'accountSettings.sessions',
  'accountSettings.sessionsDescription',
  'accountSettings.loadingSessions',
  'accountSettings.noActiveSessions',
  'accountSettings.thisDevice',
  'accountSettings.unknown',
  'accountSettings.justNow',
  'accountSettings.signOut',
  'accountSettings.signOutDevice',
] as const

describe('account settings translations', () => {
  it.each(LOCALES)('defines every account setting key for %s', (locale) => {
    for (const key of PLAIN_KEYS) {
      const value = getTranslation(locale, key)
      expect(value, `${locale}:${key}`).not.toBe(key)
      expect(value.trim(), `${locale}:${key}`).not.toBe('')
    }
  })

  it.each(LOCALES)('interpolates relative session time for %s', (locale) => {
    const value = getTranslation(locale, 'accountSettings.minutesAgo', { count: 12 })
    expect(value).toContain('12')
    expect(value).not.toContain('{{count}}')
  })
})
