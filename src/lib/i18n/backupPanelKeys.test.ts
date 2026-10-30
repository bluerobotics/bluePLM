/**
 * Every key the backup page reads from `backupPanel.*`, asserted to exist in all 7 locales and
 * to keep the English text's interpolations. Same pattern as `serverBackupKeys.test.ts`.
 */

import { describe, expect, it } from 'vitest'

import { getTranslation } from './index'
import type { Language } from './types'

const LOCALES: Language[] = ['en', 'de', 'es', 'fr', 'pt', 'zh-CN', 'zh-TW']

const KEYS = [
  'backupPanel.title',
  'backupPanel.refresh',
  'backupPanel.notConfigured',
  'backupPanel.notConfiguredAdmin',
  'backupPanel.notConfiguredMember',
  'backupPanel.openSettings',
  'backupPanel.healthy',
  'backupPanel.attention',
  'backupPanel.runsOnServer',
  'backupPanel.runsOnComputer',
  'backupPanel.runsOnNobody',
  'backupPanel.thisComputer',
  'backupPanel.lastBackup',
  'backupPanel.nextBackup',
  'backupPanel.never',
  'backupPanel.notScheduled',
  'backupPanel.reasonWorkerOffline',
  'backupPanel.reasonNoComputer',
  'backupPanel.reasonComputerOffline',
  'backupPanel.reasonNeverBackedUp',
  'backupPanel.reasonStale',
  'backupPanel.reasonNoSchedule',
  'backupPanel.adminChooses',
  'backupPanel.online',
  'backupPanel.offline',
  'backupPanel.lastSeen',
  'backupPanel.noComputer',
  'backupPanel.takeOver',
  'backupPanel.useThisComputer',
  'backupPanel.release',
  'backupPanel.noVaultsSelected',
  'backupPanel.computerOffline',
  'backupPanel.requestBackup',
  'backupPanel.backupRunning',
  'backupPanel.backupRequestedBy',
  'backupPanel.nowServer',
  'backupPanel.nowDesktop',
  'backupPanel.restoreHintServer',
  'backupPanel.rateLimited',
  'backupPanel.firstBackupRunning',
  'backupPanel.inProgress',
  'backupPanel.selected',
  'backupPanel.desktopSnapshots',
] as const

describe('backupPanel.* keys exist in every locale', () => {
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
