/**
 * Every `dbUpgrade.*` key (the 5.0 database upgrade and forced update screens) resolves in all 7
 * locales, and each translation takes the same `{{placeholders}}` as the English one. Same pattern
 * as `resolveMovesKeys.test.ts`: a missing key renders as the dotted key on a blocking screen.
 */
import { describe, expect, it } from 'vitest'

import { getTranslation } from './index'
import { dbUpgradeStrings } from './locales/dbUpgrade'
import type { Language } from './types'

const LOCALES: Language[] = ['en', 'de', 'es', 'fr', 'pt', 'zh-CN', 'zh-TW']

const KEYS: string[] = Object.entries(dbUpgradeStrings.en).flatMap(([key, value]) =>
  typeof value === 'string'
    ? [`dbUpgrade.${key}`]
    : Object.keys(value).map((sub) => `dbUpgrade.${key}.${sub}`),
)

const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()

describe('dbUpgrade.* keys exist in every locale', () => {
  it('has keys to check', () => {
    expect(KEYS.length).toBeGreaterThan(50)
    expect(KEYS).toContain('dbUpgrade.error.transactionPooler')
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
    for (const [locale, dict] of Object.entries(dbUpgradeStrings)) {
      for (const [key, value] of Object.entries(dbUpgradeStrings.en)) {
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
