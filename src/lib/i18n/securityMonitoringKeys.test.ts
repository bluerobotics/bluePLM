/**
 * Every `securityMonitoring.*` key (Settings > Security Monitoring and the sign-up refusals, schema
 * 502) resolves in all 7 locales, and each translation takes the same `{{placeholders}}` as the
 * English one. Same pattern as `dbUpgradeKeys.test.ts`.
 */
import { describe, expect, it } from 'vitest'

import { getTranslation } from './index'
import { securityMonitoringStrings } from './locales/securityMonitoring'
import type { Language } from './types'

const LOCALES: Language[] = ['en', 'de', 'es', 'fr', 'pt', 'zh-CN', 'zh-TW']

const KEYS: string[] = Object.entries(securityMonitoringStrings.en).flatMap(([key, value]) =>
  typeof value === 'string'
    ? [`securityMonitoring.${key}`]
    : Object.keys(value).map((sub) => `securityMonitoring.${key}.${sub}`),
)

const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()

describe('securityMonitoring.* keys exist in every locale', () => {
  it('has keys to check', () => {
    expect(KEYS.length).toBeGreaterThan(25)
    expect(KEYS).toContain('securityMonitoring.signup.notInvited')
  })

  it.each(LOCALES)('%s resolves every key with the English placeholders', (locale) => {
    for (const key of KEYS) {
      const english = getTranslation('en', key)
      const text = getTranslation(locale, key)
      expect(text, `${locale}: ${key}`).not.toBe(key)
      expect(text.length, `${locale}: ${key}`).toBeGreaterThan(0)
      expect(placeholders(text), `${locale}: ${key}`).toEqual(placeholders(english))
    }
  })

  it('every locale defines every key itself rather than falling back to English', () => {
    for (const [locale, dict] of Object.entries(securityMonitoringStrings)) {
      for (const [key, value] of Object.entries(securityMonitoringStrings.en)) {
        const own = dict[key]
        expect(own, `${locale}: ${key}`).toBeDefined()
        if (typeof value !== 'string') {
          expect(Object.keys(own as Record<string, string>).sort(), `${locale}: ${key}`).toEqual(
            Object.keys(value).sort(),
          )
        }
      }
    }
  })
})
