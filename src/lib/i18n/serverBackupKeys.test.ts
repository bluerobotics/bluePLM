/**
 * Every key the server backup section reads from `serverBackup.*`, asserted to exist
 * in all 7 locales. Same pattern as `resolveMovesKeys.test.ts`: a missing key renders
 * as the literal dotted key, not as English.
 */

import { describe, expect, it } from 'vitest'

import { getTranslation } from './index'
import type { Language } from './types'

const LOCALES: Language[] = ['en', 'de', 'es', 'fr', 'pt', 'zh-CN', 'zh-TW']

const KEYS = [
  'serverBackup.runLocationLabel',
  'serverBackup.runLocationServer',
  'serverBackup.runLocationServerHint',
  'serverBackup.runLocationDesktop',
  'serverBackup.runLocationDesktopHint',
  'serverBackup.title',
  'serverBackup.workerOnline',
  'serverBackup.workerOffline',
  'serverBackup.workerStale',
  'serverBackup.nextRun',
  'serverBackup.scheduleOff',
  'serverBackup.running',
  'serverBackup.backupRequested',
  'serverBackup.testRequested',
  'serverBackup.backupNow',
  'serverBackup.testBackup',
  'serverBackup.testQuick',
  'serverBackup.testQuickHint',
  'serverBackup.testSample',
  'serverBackup.testSampleHint',
  'serverBackup.testFull',
  'serverBackup.testFullHint',
  'serverBackup.requestFailed',
  'serverBackup.backupRequestSent',
  'serverBackup.testRequestSent',
  'serverBackup.recentRuns',
  'serverBackup.noRuns',
  'serverBackup.kindBackup',
  'serverBackup.kindVerify',
  'serverBackup.triggerScheduled',
  'serverBackup.triggerManual',
  'serverBackup.statusCompleted',
  'serverBackup.statusWarning',
  'serverBackup.statusFailed',
  'serverBackup.statusRunning',
  'serverBackup.backupSummary',
  'serverBackup.verifySummary',
  'serverBackup.lastGood',
  'serverBackup.lastGoodNever',
  'serverBackup.staleWarning',
  'serverBackup.lastTest',
  'serverBackup.lastTestPassed',
  'serverBackup.lastTestFailed',
  'serverBackup.restoreHint',
  'serverBackup.adminOnly',
  'serverBackup.progressReadingDatabase',
  'serverBackup.progressUploading',
  'serverBackup.progressChecking',
  'serverBackup.statusInterrupted',
  'serverBackup.interruptedDetail',
  'serverBackup.howToRestore',
  'serverBackup.fullTestSchedule',
] as const

describe('serverBackup.* keys exist in every locale', () => {
  it.each(LOCALES)('%s resolves every key to a sentence rather than the key', (locale) => {
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
