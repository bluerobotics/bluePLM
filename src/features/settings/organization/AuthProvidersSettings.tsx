import { useState, useEffect, useRef, type ReactNode } from 'react'
import { Loader2, Mail, Phone, Save } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { Button, Callout, Switch } from '@/components/core/ui'
import { log } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import { usePDMStore } from '@/stores/pdmStore'
import { DEFAULT_AUTH_PROVIDERS, type AuthProviderSettings } from '@/types/pdm'

import { SettingRow, SettingsGroup, SettingsPage, SettingsSection } from '../components/ui'

// Google icon component
function GoogleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

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
    return <div className="text-center py-12 text-plm-fg-muted">No organization connected</div>
  }

  if (!isAdmin) {
    return (
      <div className="text-center py-12 text-plm-fg-muted">
        Only administrators can manage authentication settings
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-plm-fg-muted" size={20} />
      </div>
    )
  }

  const providers: { key: 'google' | 'email' | 'phone'; label: string; icon: ReactNode }[] = [
    { key: 'google', label: 'Google Account', icon: <GoogleIcon size={16} /> },
    { key: 'email', label: 'Email & Password', icon: <Mail size={16} /> },
    { key: 'phone', label: 'Phone Number (SMS)', icon: <Phone size={16} /> },
  ]

  const renderProviders = (accountType: 'users' | 'suppliers') => (
    <SettingsGroup>
      {providers.map((provider) => {
        const id = `auth-${accountType}-${provider.key}`
        return (
          <SettingRow
            key={provider.key}
            htmlFor={id}
            label={
              <span className="flex items-center gap-2.5">
                <span className="text-plm-fg-muted">{provider.icon}</span>
                {provider.label}
              </span>
            }
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

      <Callout title="Security Note">
        Disabling a sign-in method will prevent new sign-ins using that method. Existing users who
        have already signed in will not be affected until their session expires.
      </Callout>

      <div className="flex justify-end">
        <Button variant="primary" loading={saving} icon={<Save size={14} />} onClick={handleSave}>
          Save Settings
        </Button>
      </div>
    </SettingsPage>
  )
}
