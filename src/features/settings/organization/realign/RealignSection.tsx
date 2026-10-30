// src/features/settings/organization/realign/RealignSection.tsx
import { useState } from 'react'

import { Button } from '@/components/core/ui'
import { t } from '@/lib/i18n'

import { SettingRow, SettingsGroup, SettingsSection } from '../../components/ui'
import { RealignDialog } from './RealignDialog'

/**
 * The whole "Re-align with server" surface inside the Vaults settings page is this one section:
 * a heading, a description, and a button that opens `RealignDialog`. All state, analysis and
 * markup live in this folder on purpose, so the Vaults page grows by one import and one render
 * call only.
 */
export function RealignSection() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  return (
    <SettingsSection title={t('realign.section.heading')}>
      <SettingsGroup>
        <SettingRow
          label={t('realign.section.title')}
          description={t('realign.section.description')}
        >
          <Button onClick={() => setIsDialogOpen(true)}>{t('realign.section.button')}</Button>
        </SettingRow>
      </SettingsGroup>

      <RealignDialog isOpen={isDialogOpen} onClose={() => setIsDialogOpen(false)} />
    </SettingsSection>
  )
}
