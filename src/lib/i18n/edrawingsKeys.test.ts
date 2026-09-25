import { describe, expect, it } from 'vitest'
import { de } from './locales/de'
import { en } from './locales/en'
import { es } from './locales/es'
import { fr } from './locales/fr'
import { pt } from './locales/pt'
import { zhCN } from './locales/zhCN'
import { zhTW } from './locales/zhTW'
import type { TranslationDict } from './types'

const locales = { en, de, es, fr, pt, zhCN, zhTW }
const requiredKeys = [
  'previewMode',
  'embeddedThumbnail',
  'embeddedThumbnailDescription',
  'externalEDrawings',
  'externalEDrawingsDescription',
  'embeddedEDrawings',
  'embeddedEDrawingsAvailable',
  'embeddedEDrawingsUnavailable',
  'previewStarting',
  'previewStartFailed',
  'previewUnavailable',
  'openInEDrawings',
] as const

function solidworksSettings(locale: TranslationDict): Record<string, string> {
  const settings = locale.solidworksSettings
  if (!settings || typeof settings === 'string') {
    throw new Error('solidworksSettings must be a translation group')
  }
  return settings as Record<string, string>
}

describe('eDrawings translations', () => {
  it.each(Object.entries(locales))('%s defines every user-facing preview string', (_, locale) => {
    const settings = solidworksSettings(locale)
    for (const key of requiredKeys) {
      expect(settings[key], key).toBeTypeOf('string')
      expect(settings[key], key).not.toHaveLength(0)
    }
  })

  it.each(Object.entries(locales).filter(([language]) => language !== 'en'))(
    '%s does not fall back to English for the new preview states',
    (_, locale) => {
      const settings = solidworksSettings(locale)
      const english = solidworksSettings(en)
      for (const key of [
        'previewStarting',
        'previewStartFailed',
        'previewUnavailable',
        'openInEDrawings',
      ]) {
        expect(settings[key], key).not.toBe(english[key])
      }
    },
  )
})
