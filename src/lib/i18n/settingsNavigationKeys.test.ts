import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

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

const ITEM_DESIGNATION_SETTINGS_KEYS = [
  'itemDesignationSettings.title',
  'itemDesignationSettings.description',
  'itemDesignationSettings.add',
  'itemDesignationSettings.name',
  'itemDesignationSettings.none',
  'itemDesignationSettings.deleteConfirm',
  'itemDesignationSettings.noPermission',
  'itemDesignationSettings.saveFailed',
  'itemDesignationSettings.deleteFailed',
] as const

const RECOVERY_CODE_KEYS = [
  'recoveryCodes.loadFailed',
  'recoveryCodes.generateFailed',
  'recoveryCodes.copyFailed',
  'recoveryCodes.confirmWrittenDown',
  'recoveryCodes.revoked',
  'recoveryCodes.revokeFailed',
  'recoveryCodes.deleted',
  'recoveryCodes.deleteFailed',
  'recoveryCodes.statusUsed',
  'recoveryCodes.statusRevoked',
  'recoveryCodes.statusExpired',
  'recoveryCodes.statusActive',
  'recoveryCodes.unknownDate',
  'recoveryCodes.adminOnly',
  'recoveryCodes.title',
  'recoveryCodes.subtitle',
  'recoveryCodes.generateCode',
  'recoveryCodes.securityTitle',
  'recoveryCodes.securityDescription',
  'recoveryCodes.emptyTitle',
  'recoveryCodes.emptyDescription',
  'recoveryCodes.createdAt',
  'recoveryCodes.expiresAt',
  'recoveryCodes.usedAt',
  'recoveryCodes.revokedAt',
  'recoveryCodes.revoke',
  'recoveryCodes.generateDialogTitle',
  'recoveryCodes.generateDialogSubtitle',
  'recoveryCodes.oneTimeWarning',
  'recoveryCodes.descriptionOptional',
  'recoveryCodes.descriptionPlaceholder',
  'recoveryCodes.descriptionHelp',
  'recoveryCodes.expiresIn',
  'recoveryCodes.days',
  'recoveryCodes.months',
  'recoveryCodes.years',
  'recoveryCodes.generating',
  'recoveryCodes.writeDownTitle',
  'recoveryCodes.onlyTimeShown',
  'recoveryCodes.yourCode',
  'recoveryCodes.copyToClipboard',
  'recoveryCodes.nextStepsTitle',
  'recoveryCodes.nextStepWrite',
  'recoveryCodes.nextStepStore',
  'recoveryCodes.nextStepTell',
  'recoveryCodes.nextStepAvoidDigital',
  'recoveryCodes.useTitle',
  'recoveryCodes.useDescription',
  'recoveryCodes.acknowledgement',
  'recoveryCodes.doneClose',
  'recoveryCodes.confirmSaved',
  'recoveryCodes.revokeDialogTitle',
  'recoveryCodes.revokeDialogSubtitle',
  'recoveryCodes.revokeConfirmNamed',
  'recoveryCodes.revokeConfirm',
  'recoveryCodes.reasonOptional',
  'recoveryCodes.reasonPlaceholder',
  'recoveryCodes.revoking',
  'recoveryCodes.revokeCode',
] as const

const DELETE_ACCOUNT_KEYS = [
  'deleteAccount.notSignedIn',
  'deleteAccount.failed',
  'deleteAccount.unexpectedError',
  'deleteAccount.deleted',
  'deleteAccount.title',
  'deleteAccount.subtitle',
  'deleteAccount.whatHappens',
  'deleteAccount.profileDeleted',
  'deleteAccount.removedFromOrganization',
  'deleteAccount.teamMembershipsRemoved',
  'deleteAccount.sessionsTerminated',
  'deleteAccount.checkoutsReleased',
  'deleteAccount.auditHistoryPreserved',
  'deleteAccount.irreversible',
  'deleteAccount.irreversibleDescription',
  'deleteAccount.requestDelete',
  'deleteAccount.confirmPrefix',
  'deleteAccount.confirmSuffix',
  'deleteAccount.confirmPlaceholder',
  'deleteAccount.deleting',
  'deleteAccount.deletePermanently',
] as const

describe('settings navigation translations', () => {
  it.each([
    ['en', 'en.ts'],
    ['de', 'de.ts'],
    ['fr', 'fr.ts'],
    ['es', 'es.ts'],
    ['pt', 'pt.ts'],
    ['zh-CN', 'zhCN.ts'],
    ['zh-TW', 'zhTW.ts'],
  ] as const)('defines account settings only once for %s', (_locale, fileName) => {
    const source = readFileSync(new URL(`./locales/${fileName}`, import.meta.url), 'utf8')
    expect(source.match(/^  accountSettings: \{/gm)).toHaveLength(1)
  })

  it.each(LOCALES)('defines every navigation and status key for %s', (locale) => {
    for (const key of SETTINGS_NAVIGATION_KEYS) {
      const value = getTranslation(locale, key)
      expect(value, `${locale}:${key}`).not.toBe(key)
      expect(value.trim(), `${locale}:${key}`).not.toBe('')
    }
  })
  it.each(LOCALES)('defines every item designation settings key for %s', (locale) => {
    for (const key of ITEM_DESIGNATION_SETTINGS_KEYS) {
      const value = getTranslation(locale, key)
      expect(value, `${locale}:${key}`).not.toBe(key)
      expect(value.trim(), `${locale}:${key}`).not.toBe('')
    }
  })

  it.each(LOCALES)('defines every recovery code key for %s', (locale) => {
    for (const key of RECOVERY_CODE_KEYS) {
      const value = getTranslation(locale, key, {
        error: 'ERR',
        date: 'DATE',
        count: 2,
        description: 'DESC',
      })
      expect(value, `${locale}:${key}`).not.toBe(key)
      expect(value.trim(), `${locale}:${key}`).not.toBe('')
      expect(value, `${locale}:${key}`).not.toContain('{{')
    }
  })

  it.each(LOCALES)('defines every account deletion key for %s', (locale) => {
    for (const key of DELETE_ACCOUNT_KEYS) {
      const value = getTranslation(locale, key, { error: 'ERR', value: 'VALUE' })
      expect(value, `${locale}:${key}`).not.toBe(key)
      expect(value.trim(), `${locale}:${key}`).not.toBe('')
      expect(value, `${locale}:${key}`).not.toContain('{{')
    }
  })
})
