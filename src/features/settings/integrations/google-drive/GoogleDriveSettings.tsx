import { useState, useEffect, useRef } from 'react'
import { Loader2, Check, Eye, EyeOff } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { Badge, Button, Callout, Switch, TextInput } from '@/components/core/ui'
import {
  SettingRow,
  SettingsGroup,
  SettingsPage,
  SettingsSection,
} from '@/features/settings/components/ui'
import { log } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import { usePDMStore } from '@/stores/pdmStore'

export function GoogleDriveSettings() {
  const { organization, addToast, getEffectiveRole } = usePDMStore(
    useShallow((s) => ({
      organization: s.organization,
      addToast: s.addToast,
      getEffectiveRole: s.getEffectiveRole,
    })),
  )
  const isAdmin = getEffectiveRole() === 'admin'

  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [inspectionTemplateFolderId, setInspectionTemplateFolderId] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showSecret, setShowSecret] = useState(false)

  // Track if we're currently saving to avoid overwriting with stale realtime data
  const savingRef = useRef(false)

  useEffect(() => {
    loadSettings()
  }, [organization?.id])

  const loadSettings = async () => {
    if (!organization?.id) return

    setIsLoading(true)
    try {
      const { data, error } = await (supabase.rpc as any)('org_get_google_drive_settings', { // TODO: type this
        p_org_id: organization.id,
      })

      if (error) {
        log.error('[GoogleDrive]', 'Error loading settings', { error })
        return
      }

      if (data && Array.isArray(data) && data.length > 0) {
        const settings = data[0] as {
          client_id?: string
          client_secret?: string
          is_enabled?: boolean
          inspection_template_folder_id?: string
        }
        setClientId(settings.client_id || '')
        setClientSecret(settings.client_secret || '')
        setEnabled(settings.is_enabled || false)
        setInspectionTemplateFolderId(settings.inspection_template_folder_id || '')
      }
    } catch (error) {
      log.error('[GoogleDrive]', 'Error loading settings', { error: error })
    } finally {
      setIsLoading(false)
    }
  }

  // Sync with realtime organization changes (when another admin updates settings)
  useEffect(() => {
    // Skip if we're currently saving (to avoid overwriting our own changes)
    if (savingRef.current) return
    // Skip if still loading initial data
    if (isLoading) return

    // Sync Google Drive fields from realtime organization object
    const org = organization as any // TODO: type this
    if (org) {
      if (org.is_google_drive_enabled !== undefined) {
        setEnabled(org.is_google_drive_enabled)
      }
      if (org.google_drive_client_id !== undefined) {
        setClientId(org.google_drive_client_id || '')
      }
      if (org.google_drive_client_secret !== undefined) {
        setClientSecret(org.google_drive_client_secret || '')
      }
      if (org.google_drive_inspection_template_folder_id !== undefined) {
        setInspectionTemplateFolderId(org.google_drive_inspection_template_folder_id || '')
      }
    }
  }, [
    isLoading,
    (organization as any)?.is_google_drive_enabled, // TODO: type this
    (organization as any)?.google_drive_client_id, // TODO: type this
    (organization as any)?.google_drive_client_secret, // TODO: type this
    (organization as any)?.google_drive_inspection_template_folder_id, // TODO: type this
  ])

  const saveSettings = async () => {
    if (!organization?.id || !isAdmin) return

    setIsSaving(true)
    savingRef.current = true
    try {
      const { error } = await (supabase.rpc as any)('org_update_google_drive_settings', { // TODO: type this
        p_org_id: organization.id,
        p_client_id: clientId || null,
        p_client_secret: clientSecret || null,
        p_enabled: enabled,
        p_inspection_template_folder_id: inspectionTemplateFolderId.trim() || null,
      })

      if (error) {
        log.error('[GoogleDrive]', 'Error saving settings', { error })
        addToast('error', 'Failed to save: ' + error.message)
        return
      }

      addToast('success', 'Google Drive settings saved')
    } catch (error) {
      log.error('[GoogleDrive]', 'Error saving settings', { error: error })
      addToast('error', 'Failed to save Google Drive settings')
    } finally {
      setIsSaving(false)
      // Small delay before allowing realtime sync again to let the update propagate
      setTimeout(() => {
        savingRef.current = false
      }, 1000)
    }
  }

  const configured = enabled && clientId.trim() !== '' && clientSecret.trim() !== ''

  return (
    <SettingsPage>
      {!isAdmin && (
        <Callout tone="info">Only administrators can edit integration settings.</Callout>
      )}

      <SettingsSection>
        <SettingsGroup>
          <SettingRow
            label="Enable Google Drive"
            description="Allow org members to connect their Google Drive"
            htmlFor="google-drive-enabled"
            badge={
              isLoading ? (
                <Loader2 size={12} className="animate-spin text-plm-fg-muted" />
              ) : configured ? (
                <Badge tone="success">Configured</Badge>
              ) : enabled ? (
                <Badge tone="warning">Needs credentials</Badge>
              ) : (
                <Badge>Off</Badge>
              )
            }
          >
            <Switch
              id="google-drive-enabled"
              checked={enabled}
              onChange={(next) => isAdmin && setEnabled(next)}
              disabled={!isAdmin}
            />
          </SettingRow>
        </SettingsGroup>
      </SettingsSection>

      {enabled && (
        <SettingsSection title="OAuth credentials">
          <SettingsGroup>
            <SettingRow label="Client ID" htmlFor="google-drive-client-id" stacked>
              <TextInput
                id="google-drive-client-id"
                type="text"
                value={clientId}
                onChange={(e) => isAdmin && setClientId(e.target.value)}
                placeholder="xxxxxxx.apps.googleusercontent.com"
                readOnly={!isAdmin}
                className="font-mono"
              />
            </SettingRow>
            <SettingRow label="Client Secret" htmlFor="google-drive-client-secret" stacked>
              <div className="relative">
                <TextInput
                  id="google-drive-client-secret"
                  type={showSecret ? 'text' : 'password'}
                  value={clientSecret}
                  onChange={(e) => isAdmin && setClientSecret(e.target.value)}
                  placeholder="GOCSPX-xxxxxxxxxxxx"
                  readOnly={!isAdmin}
                  className="pr-9 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  aria-label={showSecret ? 'Hide secret' : 'Show secret'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-plm-fg-muted hover:text-plm-fg"
                >
                  {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </SettingRow>
            <SettingRow
              label="Inspection template folder ID"
              htmlFor="google-drive-inspection-folder"
              stacked
              description={
                <>
                  Google Sheets in this folder appear in the "Generate template" dropdown on the
                  inspection tab. Use tokens like {'{{BR_NUMBER}}'}, {'{{PART_PREVIEW}}'} and{' '}
                  {'{{INSPECTION_TABLE}}'} in your templates. Paste the folder ID from its Drive URL
                  (the part after <span className="font-mono">/folders/</span>).
                </>
              }
            >
              <TextInput
                id="google-drive-inspection-folder"
                type="text"
                value={inspectionTemplateFolderId}
                onChange={(e) => isAdmin && setInspectionTemplateFolderId(e.target.value)}
                placeholder="Google Drive folder ID containing inspection template sheets"
                readOnly={!isAdmin}
                className="font-mono"
              />
            </SettingRow>
          </SettingsGroup>

          <Callout tone="info" title="Setup instructions">
            <ol className="mt-1 list-decimal list-inside space-y-0.5">
              <li>
                Go to{' '}
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-plm-accent hover:underline"
                >
                  Google Cloud Console
                </a>
              </li>
              <li>Create or select a project</li>
              <li>Enable the Google Drive API and the Google Sheets API</li>
              <li>Create OAuth 2.0 credentials (Desktop app type)</li>
              <li>Copy the Client ID and Client Secret here</li>
            </ol>
          </Callout>
        </SettingsSection>
      )}

      {/* Outside the credentials section, so turning Google Drive off can be saved too */}
      {isAdmin && (
        <div className="flex justify-end">
          <Button variant="primary" onClick={saveSettings} loading={isSaving} icon={<Check size={14} />}>
            Save Google Drive Settings
          </Button>
        </div>
      )}
    </SettingsPage>
  )
}
