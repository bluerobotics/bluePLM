/**
 * Every key the damaged-files section and downloads read from `damagedFiles.*`, asserted to exist in all 7 locales and
 * to keep the English text's interpolations. Same pattern as `serverBackupKeys.test.ts`.
 */

import { describe, expect, it } from 'vitest'

import { getTranslation } from './index'
import type { Language } from './types'

const LOCALES: Language[] = ['en', 'de', 'es', 'fr', 'pt', 'zh-CN', 'zh-TW']

const KEYS = [
  'damagedFiles.title',
  'damagedFiles.none',
  'damagedFiles.showClosed',
  'damagedFiles.hideClosed',
  'damagedFiles.kindDamaged',
  'damagedFiles.kindMissing',
  'damagedFiles.foundOn',
  'damagedFiles.status_open',
  'damagedFiles.status_repaired',
  'damagedFiles.status_unrecoverable',
  'damagedFiles.status_accepted',
  'damagedFiles.version',
  'damagedFiles.current',
  'damagedFiles.deleted',
  'damagedFiles.checkedIn',
  'damagedFiles.noRefs',
  'damagedFiles.expected',
  'damagedFiles.actual',
  'damagedFiles.resolved',
  'damagedFiles.checkBackup',
  'damagedFiles.restore',
  'damagedFiles.backupLacks',
  'damagedFiles.useLocal',
  'damagedFiles.localMissing',
  'damagedFiles.localNoMatch',
  'damagedFiles.uploadDone',
  'damagedFiles.restoreDone',
  'damagedFiles.rollBack',
  'damagedFiles.rollbackDone',
  'damagedFiles.markUnrecoverable',
  'damagedFiles.accept',
  'damagedFiles.unrecoverableHint',
  'damagedFiles.acceptHint',
  'damagedFiles.notePlaceholder',
  'damagedFiles.confirm',
  'damagedFiles.cancel',
  'damagedFiles.decisionSaved',
  'damagedFiles.downloadRefused',
  'damagedFiles.downloadDamaged',
] as const

describe('damagedFiles.* keys exist in every locale', () => {
  it.each(LOCALES)('%s resolves every key to text rather than the key', (locale) => {
    for (const key of KEYS) {
      const text = getTranslation(locale, key)
      expect(text, `${locale}: ${key}`).not.toBe(key)
      expect(text.length, `${locale}: ${key}`).toBeGreaterThan(0)
    }
  })

  it.each(LOCALES)('%s keeps every interpolation the English text has', (locale) => {
    for (const key of KEYS) {
      const params = getTranslation('en', key).match(/\{\{\w+\}\}/g) ?? []
      for (const param of params) expect(getTranslation(locale, key), `${locale}: ${key}`).toContain(param)
    }
  })
})
