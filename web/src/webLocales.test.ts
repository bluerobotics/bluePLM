// Every BluePLM Web locale carries exactly the English keys. English (web/src/i18n/locales/en/*) is
// the source; a key another locale has and English lacks is dead or misspelt.
import { describe, expect, it } from 'vitest'
import { WEB_LANGUAGES, WEB_LOCALES, flatten } from '@web/i18n'

const english = flatten(WEB_LOCALES.en)
const englishKeys = Object.keys(english)
const others = WEB_LANGUAGES.filter((language) => language !== 'en')

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((match) => match[1]).sort()
}

describe('BluePLM Web locales', () => {
  it('has English strings for every key', () => {
    expect(englishKeys.length).toBeGreaterThan(0)
    const empty = englishKeys.filter((key) => typeof english[key] !== 'string' || english[key].trim() === '')
    expect(empty).toEqual([])
  })

  it.each(others)('%s has no key English lacks', (language) => {
    const keys = Object.keys(flatten(WEB_LOCALES[language]))
    expect(keys.filter((key) => !(key in english))).toEqual([])
  })
})

// Every other locale carries every English key with the same placeholders (plan: blueplm-web.plan.md,
// "Strings"). A key missing at runtime still falls back to English, but the test refuses it.
describe('BluePLM Web locales are complete', () => {
  it.each(others)('%s has every English key', (language) => {
    const translated = flatten(WEB_LOCALES[language])
    expect(englishKeys.filter((key) => !(key in translated))).toEqual([])
  })

  it.each(others)('%s keeps the English placeholders', (language) => {
    const translated = flatten(WEB_LOCALES[language])
    const mismatched = englishKeys.filter(
      (key) => key in translated && placeholders(translated[key]).join() !== placeholders(english[key]).join(),
    )
    expect(mismatched).toEqual([])
  })
})
