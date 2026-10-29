import { describe, expect, it } from 'vitest'

import { getTranslation } from './index'
import { en, de, fr, es, pt, zhCN, zhTW } from './locales'
import type { TranslationDict } from './types'
import { flattenTranslations } from './utils'

const LOCALES = ['en', 'de', 'fr', 'es', 'pt', 'zh-CN', 'zh-TW'] as const
const dictionaries = { en, de, fr, es, pt, 'zh-CN': zhCN, 'zh-TW': zhTW }
const englishKeys = Object.keys(flattenTranslations(en.settingsPages as TranslationDict)).sort()

describe('settings page translations', () => {
  it.each(LOCALES)('keeps the complete settings page key set for %s', (locale) => {
    const translations = flattenTranslations(dictionaries[locale].settingsPages as TranslationDict)

    expect(Object.keys(translations).sort()).toEqual(englishKeys)
    for (const key of englishKeys) {
      expect(translations[key]?.trim(), `${locale}:${key}`).not.toBe('')
      const tokens = (value: string) =>
        [...value.matchAll(/\{\{[^{}]+\}\}/g)].map((m) => m[0]).sort()
      const english = flattenTranslations(en.settingsPages as TranslationDict)[key]
      expect(tokens(translations[key]), `${locale}:${key}: interpolation`).toEqual(tokens(english))
      expect(getTranslation(locale, `settingsPages.${key}`)).not.toBe(`settingsPages.${key}`)
    }
  })
})
