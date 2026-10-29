import { describe, expect, it } from 'vitest'

import { getTranslation } from './index'

const LOCALES = ['en', 'de', 'fr', 'es', 'pt', 'zh-CN', 'zh-TW'] as const
const SETTINGS_NAVIGATION_KEYS = [
  'settings.navigation',
  'settings.account',
  'settings.profile',
  'settings.preferences',
  'settings.keybindings',
  'settings.sidebar',
  'settings.deleteAccount',
  'settings.organization',
  'settings.supabase',
  'settings.backups',
  'settings.vaults',
  'settings.membersAndTeams',
  'settings.moduleAccess',
  'settings.companyProfile',
  'settings.signInMethods',
  'settings.serialization',
  'settings.exportOptions',
  'settings.fileMetadata',
  'settings.itemDesignations',
  'settings.rfqSettings',
  'settings.recoveryCodes',
  'settings.extensions',
  'settings.extensionStore',
  'settings.solidworks',
  'settings.googleDrive',
  'settings.odooErp',
  'settings.restApi',
  'settings.webhooks',
  'settings.system',
  'settings.performance',
  'settings.logs',
  'settings.devTools',
  'settings.about',
  'settings.connected',
  'settings.partiallyConnected',
  'settings.offline',
  'settings.notConfigured',
  'settings.comingSoon',
  'settings.checkingStatus',
  'settings.backupsWorking',
  'settings.needsAttention',
  'settings.backupFailed',
] as const

describe('settings navigation translations', () => {
  it.each(LOCALES)('defines every navigation and status key for %s', (locale) => {
    for (const key of SETTINGS_NAVIGATION_KEYS) {
      const value = getTranslation(locale, key)
      expect(value, `${locale}:${key}`).not.toBe(key)
      expect(value.trim(), `${locale}:${key}`).not.toBe('')
    }
  })
})
