import { useState, useEffect, useRef } from 'react'
import { Loader2, Save } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { Button, Switch } from '@/components/core/ui'
import { log } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import { usePDMStore } from '@/stores/pdmStore'
import { DEFAULT_AUTH_PROVIDERS, type AuthProviderSettings } from '@/types/pdm'

import { SettingRow, SettingsGroup, SettingsPage, SettingsSection } from '../components/ui'

export function AuthProvidersSettings() {
  const { organization, addToast, getEffectiveRole } = usePDMStore(
    useShallow((s) => ({
      organization: s.organization,
      addToast: s.addToast,
      getEffectiveRole: s.getEffectiveRole,
    })),
  )
  const isAdmin = getEffectiveRole() === 'admin'
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Track if we're currently saving to avoid overwriting with stale realtime data
  const savingRef = useRef(false)

  const [settings, setSettings] = useState<AuthProviderSettings>(DEFAULT_AUTH_PROVIDERS)

  // Load current settings
  useEffect(() => {
    if (!organization?.id) return

    const loadSettings = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('organization')
          .select('auth_providers')
          .eq('id', organization.id)
          .single()

        if (error) throw error

        // Merge with defaults to ensure all fields exist
        const authProviders = data?.auth_providers as AuthProviderSettings | null
        setSettings({
          users: {
            google: authProviders?.users?.google ?? true,
            email: authProviders?.users?.email ?? true,
            phone: authProviders?.users?.phone ?? true,
          },
          suppliers: {
            google: authProviders?.suppliers?.google ?? true,
            email: authProviders?.suppliers?.email ?? true,
            phone: authProviders?.suppliers?.phone ?? true,
          },
        })
      } catch (error) {
        log.error('[AuthProviders]', 'Failed to load auth provider settings', { error: error })
        addToast('error', 'Failed to load authentication settings')
      } finally {
        setLoading(false)
      }
    }

    loadSettings()
  }, [organization?.id])

  // Sync with realtime organization changes
  useEffect(() => {
    if (savingRef.current || loading) return

    if (organization?.auth_providers) {
      const authProviders = organization.auth_providers
      setSettings({
        users: {
          google: authProviders?.users?.google ?? true,
          email: authProviders?.users?.email ?? true,
          phone: authProviders?.users?.phone ?? true,
        },
        suppliers: {
          google: authProviders?.suppliers?.google ?? true,
          email: authProviders?.suppliers?.email ?? true,
          phone: authProviders?.suppliers?.phone ?? true,
        },
      })
    }
  }, [organization?.auth_providers])

  // Save settings
  const handleSave = async () => {
    if (!organization?.id) return

    // Validate: at least one provider must be enabled for each category
    if (!settings.users.google && !settings.users.email && !settings.users.phone) {
      addToast('error', 'At least one sign-in method must be enabled for users')
      return
    }
    if (!settings.suppliers.google && !settings.suppliers.email && !settings.suppliers.phone) {
      addToast('error', 'At least one sign-in method must be enabled for suppliers')
      return
    }

    setSaving(true)
    savingRef.current = true
    try {
      const { error } = await supabase
        .from('organization')
        .update({ auth_providers: JSON.parse(JSON.stringify(settings)) })
        .eq('id', organization.id)

      if (error) throw error
      addToast('success', 'Authentication settings saved')
    } catch (error) {
      log.error('[AuthProviders]', 'Failed to save auth provider settings', { error: error })
      addToast('error', 'Failed to save authentication settings')
    } finally {
      setSaving(false)
      setTimeout(() => {
        savingRef.current = false
      }, 1000)
    }
  }

  // Update a provider setting
  const updateProvider = (
    accountType: 'users' | 'suppliers',
    provider: 'google' | 'email' | 'phone',
    enabled: boolean,
  ) => {
    setSettings((prev) => ({
      ...prev,
      [accountType]: {
        ...prev[accountType],
        [provider]: enabled,
      },
    }))
  }

  if (!organization) {
    return <div className="py-12 text-center text-[14px] text-ui-fg-secondary">No organization connected</div>
  }

  if (!isAdmin) {
    return (
      <div className="py-12 text-center text-[14px] text-ui-fg-secondary">
        Only administrators can manage authentication settings
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-ui-fg-secondary" size={20} />
      </div>
    )
  }

  const providers: { key: 'google' | 'email' | 'phone'; label: string }[] = [
    { key: 'google', label: 'Google Account' },
    { key: 'email', label: 'Email & Password' },
    { key: 'phone', label: 'Phone Number (SMS)' },
  ]

  const renderProviders = (accountType: 'users' | 'suppliers') => (
    <SettingsGroup>
      {providers.map((provider) => {
        const id = `auth-${accountType}-${provider.key}`
        return (
          <SettingRow
            key={provider.key}
            htmlFor={id}
            label={provider.label}
          >
            <Switch
              id={id}
              checked={settings[accountType][provider.key]}
              onChange={(enabled) => updateProvider(accountType, provider.key, enabled)}
            />
          </SettingRow>
        )
      })}
    </SettingsGroup>
  )

  return (
    <SettingsPage>
      <SettingsSection
        title="Team Members"
        description="Choose which sign-in methods your team members can use to access BluePLM."
      >
        {renderProviders('users')}
      </SettingsSection>

      <SettingsSection
        title="Suppliers"
        description="Choose which sign-in methods your suppliers and external partners can use."
      >
        {renderProviders('suppliers')}
      </SettingsSection>

      <div className="flex items-start justify-between gap-12">
        <p className="text-[14px] leading-[1.4] text-ui-fg-secondary">
          Disabling a sign-in method will prevent new sign-ins using that method. Existing users who
          have already signed in will not be affected until their session expires.
        </p>
        <Button variant="primary" loading={saving} icon={<Save size={14} />} onClick={handleSave}>
          Save settings
        </Button>
      </div>
    </SettingsPage>
  )
}
