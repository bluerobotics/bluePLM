/**
 * `terminal.*` keys, asserted to exist in all 7 locales. Follows `newKeys.test.ts` /
 * `resolveMovesKeys.test.ts`'s pattern: a missing key is not a missing translation, it is the
 * literal dotted key rendered on screen, since every call site here passes no fallback string.
 *
 * These two lines are the fix for the reconcile-hang incident
 * (`.cursor/plans/reconcile-hang-incident-report.md`): `Terminal.tsx` prints
 * `terminal.confirmationPending` in place of the ambiguous "Processing..." while a command it
 * ran is blocked on a `ctx.confirm()` dialog, and `terminal.confirmationCancelled` after Ctrl+C
 * declines that dialog from the terminal.
 */

import { describe, expect, it } from 'vitest'

import { getTranslation } from './index'
import type { Language } from './types'

const LOCALES: Language[] = ['en', 'de', 'es', 'fr', 'pt', 'zh-CN', 'zh-TW']

const PLAIN = [
  'terminal.confirmationPending',
  'terminal.confirmationCancelled',
  'terminal.cadPreviewModeHelp',
  'terminal.cadPreviewModeInvalid',
] as const

describe('terminal.* keys exist in every locale', () => {
  it.each(LOCALES)('%s resolves every key to a sentence rather than the key', (locale) => {
    for (const key of PLAIN) {
      const text = getTranslation(locale, key)
      expect(text, `${locale}: ${key}`).not.toBe(key)
      expect(text.length, `${locale}: ${key}`).toBeGreaterThan(0)
    }
  })

  it.each(LOCALES)('%s names every accepted cadPreviewMode value', (locale) => {
    for (const key of ['terminal.cadPreviewModeHelp', 'terminal.cadPreviewModeInvalid']) {
      const text = getTranslation(locale, key)
      expect(text).toContain('thumbnail')
      expect(text).toContain('edrawings')
      expect(text).toContain('edrawings-embedded')
    }
  })
})
