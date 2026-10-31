/**
 * Admin switch: the organization's release pipeline (release.yml migrate-db) upgrades the database,
 * instead of an admin from the app. Stored in organization.settings.schema_upgrades.
 */
import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Switch } from '@/components/core/ui'
import { t } from '@/lib/i18n'
import { log } from '@/lib/logger'
import { schemaUpgradesByRelease } from '@/lib/schemaUpgrades'
import { supabase } from '@/lib/supabase'
import { usePDMStore } from '@/stores/pdmStore'
import type { OrgSettings } from '@/types/pdm'

import { SettingRow } from '../components/ui'

export function SchemaUpgradesSetting() {
  const { organization, setOrganization, addToast } = usePDMStore(
    useShallow((s) => ({
      organization: s.organization,
      setOrganization: s.setOrganization,
      addToast: s.addToast,
    })),
  )
  const [saving, setSaving] = useState(false)
  const byRelease = schemaUpgradesByRelease(organization)

  const save = async (checked: boolean) => {
    if (!organization) return
    setSaving(true)
    try {
      // Read the current settings first so a concurrent change to another key is not overwritten.
      const { data: current } = await supabase
        .from('organization')
        .select('settings')
        .eq('id', organization.id)
        .single()
      const base = (current?.settings ?? organization.settings ?? {}) as OrgSettings
      const settings: OrgSettings = { ...base, schema_upgrades: checked ? 'release' : 'in_app' }
      const { data, error } = await supabase
        .from('organization')
        .update({ settings: settings as never })
        .eq('id', organization.id)
        .select('settings')
        .single()
      if (error) throw error
      if (!data) throw new Error('no row updated')
      setOrganization({ ...organization, settings })
    } catch (error) {
      log.error('[DbUpgrade]', 'Saving the schema upgrade setting failed', { error })
      addToast(
        'error',
        t('dbUpgrade.settingSaveFailed', {
          message: error instanceof Error ? error.message : String(error),
        }),
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingRow
      label={t('dbUpgrade.settingReleaseLabel')}
      htmlFor="schema-upgrades-by-release"
      description={t('dbUpgrade.settingReleaseHelp')}
    >
      <Switch
        id="schema-upgrades-by-release"
        checked={byRelease}
        disabled={saving || !organization}
        onChange={(checked) => void save(checked)}
      />
    </SettingRow>
  )
}
