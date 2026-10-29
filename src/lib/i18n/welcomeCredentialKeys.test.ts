import { describe, expect, it } from 'vitest'
import { en, de, es, fr, pt, zhCN, zhTW } from './locales'
import { flattenTranslations } from './utils'

const locales = { en, de, es, fr, pt, zhCN, zhTW }
const keys = [
  'credentialsRequired',
  'confirmEmail',
  'authenticationFailed',
  'phoneRequired',
  'sendCodeFailed',
  'codeRequired',
  'verificationFailed',
  'signedOutFromAnotherDevice',
] as const

describe('welcome credential messages', () => {
  it.each(Object.entries(locales))('provides every credential message in %s', (_name, locale) => {
    const messages = flattenTranslations(locale)
    for (const key of keys) expect(messages[`welcome.${key}`]).toBeTruthy()
  })
})
