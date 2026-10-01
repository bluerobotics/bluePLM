import { describe, expect, it } from 'vitest'

import { getTranslation } from './index'
import { settingsPageTranslations } from './locales/settingsPages'
import { flattenTranslations } from './utils'

const LOCALES = ['en', 'de', 'fr', 'es', 'pt', 'zh-CN', 'zh-TW'] as const
const englishKeys = Object.keys(flattenTranslations(settingsPageTranslations.en)).sort()

describe('settings page translations', () => {
  it.each(LOCALES)('keeps the complete settings page key set for %s', (locale) => {
    const translations = flattenTranslations(settingsPageTranslations[locale])

    expect(Object.keys(translations).sort()).toEqual(englishKeys)
    for (const key of englishKeys) {
      expect(translations[key]?.trim(), `${locale}:${key}`).not.toBe('')
      expect(getTranslation(locale, `settingsPages.${key}`)).not.toBe(`settingsPages.${key}`)
    }
  })
})
