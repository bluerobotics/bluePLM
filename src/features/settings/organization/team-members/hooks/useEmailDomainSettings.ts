import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { log } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import { usePDMStore } from '@/stores/pdmStore'
import type { Json } from '@/types/supabase'

/** The organization's allowed email domains and whether joining is restricted to them. */
export function useEmailDomainSettings() {
  const { organization, addToast } = usePDMStore(
    useShallow((s) => ({ organization: s.organization, addToast: s.addToast })),
  )

  // Track if we're currently saving to avoid overwriting with stale realtime data
  const savingRef = useRef(false)

  const [emailDomains, setEmailDomains] = useState<string[]>([])
  const [enforceEmailDomain, setEnforceEmailDomain] = useState(false)
  const [newDomain, setNewDomain] = useState('')
  const [savingDomains, setSavingDomains] = useState(false)
  const [loadingEmailSettings, setLoadingEmailSettings] = useState(true)

  const handleAddDomain = async () => {
    const domain = newDomain.trim().toLowerCase()
    if (!domain || !organization?.id) return

    // Validate domain format
    if (!/^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i.test(domain)) {
      addToast('error', 'Invalid domain format')
      return
    }

    // Check if already exists
    if (emailDomains.includes(domain)) {
      addToast('error', 'Domain already added')
      return
    }

    setSavingDomains(true)
    savingRef.current = true
    const newDomains = [...emailDomains, domain]

    try {
      const { error } = await supabase
        .from('organization')
        .update({ email_domains: newDomains })
        .eq('id', organization.id)

      if (error) throw error

      setEmailDomains(newDomains)
      setNewDomain('')
      addToast('success', `Added @${domain}`)
    } catch (error) {
      log.error('[TeamMembers]', 'Failed to add domain', { error: error })
      addToast('error', 'Failed to add domain')
    } finally {
      setSavingDomains(false)
      setTimeout(() => {
        savingRef.current = false
      }, 1000)
    }
  }

  const handleRemoveDomain = async (idx: number, domain: string) => {
    if (!organization?.id) return

    const newDomains = emailDomains.filter((_, i) => i !== idx)
    setEmailDomains(newDomains)
    savingRef.current = true

    try {
      const { error } = await supabase
        .from('organization')
        .update({ email_domains: newDomains })
        .eq('id', organization.id)

      if (error) throw error
      addToast('success', `Removed @${domain}`)
    } catch (error) {
      log.error('[TeamMembers]', 'Failed to remove domain', { error: error })
      setEmailDomains(emailDomains) // Revert
      addToast('error', 'Failed to remove domain')
    } finally {
      setTimeout(() => {
        savingRef.current = false
      }, 1000)
    }
  }

  const handleToggleEnforcement = async () => {
    if (!organization?.id) return

    const newValue = !enforceEmailDomain
    setEnforceEmailDomain(newValue)
    savingRef.current = true

    try {
      // Fetch current settings from database first to avoid overwriting other fields
      const { data: currentOrg } = await supabase
        .from('organization')
        .select('settings')
        .eq('id', organization.id)
        .single()

      const currentSettings = (currentOrg?.settings || organization?.settings || {}) as Record<
        string,
        Json | undefined
      >
      const newSettings: Json = { ...currentSettings, enforce_email_domain: newValue }

      const { error } = await supabase
        .from('organization')
        .update({ settings: newSettings })
        .eq('id', organization.id)

      if (error) throw error
      addToast(
        'success',
        newValue ? 'Email domain enforcement enabled' : 'Email domain enforcement disabled',
      )
    } catch (error) {
      log.error('[TeamMembers]', 'Failed to update enforcement setting', { error: error })
      setEnforceEmailDomain(!newValue) // Revert
      addToast('error', 'Failed to update setting')
    } finally {
      setTimeout(() => {
        savingRef.current = false
      }, 1000)
    }
  }

  // Load email domain settings
  useEffect(() => {
    if (!organization?.id) return

    const loadEmailSettings = async () => {
      setLoadingEmailSettings(true)
      try {
        const { data, error } = await supabase
          .from('organization')
          .select('email_domains, settings')
          .eq('id', organization.id)
          .single()

        if (error) throw error

        setEmailDomains(data?.email_domains || [])
        const settings = (data?.settings || {}) as { enforce_email_domain?: boolean }
        setEnforceEmailDomain(settings.enforce_email_domain ?? false)
      } catch (error) {
        log.error('[TeamMembers]', 'Failed to load email domain settings', { error: error })
      } finally {
        setLoadingEmailSettings(false)
      }
    }

    loadEmailSettings()
  }, [organization?.id])

  // Sync with realtime organization changes (when another admin updates settings)
  const orgEmailDomains = organization?.email_domains
  const orgEnforce = organization?.settings?.enforce_email_domain
  useEffect(() => {
    // Skip if we're currently saving (to avoid overwriting our own changes)
    if (savingRef.current) return
    // Skip if still loading initial data
    if (loadingEmailSettings) return

    if (orgEmailDomains) {
      setEmailDomains(orgEmailDomains)
    }
    if (orgEnforce !== undefined) {
      setEnforceEmailDomain(orgEnforce)
    }
  }, [loadingEmailSettings, orgEmailDomains, orgEnforce])

  return {
    emailDomains,
    enforceEmailDomain,
    newDomain,
    setNewDomain,
    savingDomains,
    handleAddDomain,
    handleRemoveDomain,
    handleToggleEnforcement,
  }
}
