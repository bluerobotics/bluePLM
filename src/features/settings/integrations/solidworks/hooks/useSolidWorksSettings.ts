import { useState, useEffect, useCallback } from 'react'
import { log } from '@/lib/logger'
import { usePDMStore } from '@/stores/pdmStore'
import { supabase } from '@/lib/supabase'
import { useSolidWorksStatus } from '@/hooks/useSolidWorksStatus'

// Supabase v2 type inference incomplete for SolidWorks settings
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

/**
 * Hook to manage SolidWorks service control (start/stop)
 * 
 * Status polling is now handled by useSolidWorksStatus hook to avoid
 * duplicate polling and reduce service load.
 */
export function useSolidWorksServiceControl() {
  const [isStarting, setIsStarting] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const { addToast, organization, autoStartSolidworksService } = usePDMStore()
  
  // Use consolidated status hook
  const { status, refreshStatus } = useSolidWorksStatus()
  
  // Get DM license key from organization settings
  const dmLicenseKey = organization?.settings?.solidworks_dm_license_key

  const startService = useCallback(async () => {
    setIsStarting(true)
    try {
      const result = await window.electronAPI?.solidworks?.startService(dmLicenseKey || undefined)
      if (result?.success) {
        addToast('success', 'SolidWorks service started')
        // Refresh status to pick up the change
        await refreshStatus()
      } else {
        addToast('error', result?.error || 'Failed to start SolidWorks service')
      }
    } catch (err) {
      addToast('error', `Failed to start service: ${err}`)
    } finally {
      setIsStarting(false)
    }
  }, [addToast, dmLicenseKey, refreshStatus])

  const stopService = useCallback(async () => {
    setIsStopping(true)
    try {
      const result = await window.electronAPI?.solidworks?.stopService()
      if (result?.success) {
        addToast('info', 'SolidWorks service stopped')
        // Refresh status to pick up the change
        await refreshStatus()
      } else {
        addToast('error', 'Failed to stop SolidWorks service')
      }
    } catch (err) {
      addToast('error', `Failed to stop service: ${err}`)
    } finally {
      setIsStopping(false)
    }
  }, [addToast, refreshStatus])

  // Determine if we should show error state (auto-start enabled but not running with error)
  const hasError = autoStartSolidworksService && !status.running && !!status.error

  return { status, isStarting, isStopping, startService, stopService, checkStatus: refreshStatus, hasError }
}

/**
 * Overall status type for the SolidWorks service
 */
export type OverallStatus = 'online' | 'partial' | 'offline' | 'stopped'

/**
 * Template folder settings type
 */
export interface TemplateSettings {
  documentTemplates?: string
  sheetFormats?: string
  bomTemplates?: string
  customPropertyFolders?: string
  promptForTemplate?: boolean
  lastPushedAt?: string
  lastPushedBy?: string
}

/**
 * Shared hook for SolidWorks settings state and actions
 * Used across all tabs to share common state and functionality
 */
export function useSolidWorksSettings() {
  const {
    organization,
    setOrganization,
    addToast,
    cadPreviewMode,
    setCadPreviewMode,
    solidworksPath,
    setSolidworksPath,
    autoStartSolidworksService,
    setAutoStartSolidworksService,
    hideSolidworksTempFiles,
    setHideSolidworksTempFiles,
    ignoreSolidworksTempFiles,
    setIgnoreSolidworksTempFiles,
    autoRefreshMetadataOnSave,
    setAutoRefreshMetadataOnSave,
    vaultPath,
    user,
    files,
    getEffectiveRole
  } = usePDMStore()
  
  const serviceControl = useSolidWorksServiceControl()
  const { status } = serviceControl
  const isAdmin = getEffectiveRole() === 'admin'
  
  // DM License Key state
  const [dmLicenseKeyInput, setDmLicenseKeyInput] = useState(organization?.settings?.solidworks_dm_license_key || '')
  const [isSavingLicenseKey, setIsSavingLicenseKey] = useState(false)
  const [showLicenseKey, setShowLicenseKey] = useState(false)
  
  // Vault metadata sync state
  const [isSyncingMetadata, setIsSyncingMetadata] = useState(false)
  const [lastMetadataSyncResult, setLastMetadataSyncResult] = useState<{ updated: number; unchanged: number; failed: number } | null>(null)
  
  // Template folder state
  const orgTemplates = organization?.settings?.solidworks_templates as TemplateSettings | undefined
  
  const [templateDocuments, setTemplateDocuments] = useState(orgTemplates?.documentTemplates || '')
  const [templateSheetFormats, setTemplateSheetFormats] = useState(orgTemplates?.sheetFormats || '')
  const [templateBom, setTemplateBom] = useState(orgTemplates?.bomTemplates || '')
  const [templateCustomProperty, setTemplateCustomProperty] = useState(orgTemplates?.customPropertyFolders || '')
  const [promptForTemplate, setPromptForTemplate] = useState(orgTemplates?.promptForTemplate ?? false)
  const [isSavingTemplates, setIsSavingTemplates] = useState(false)
  const [isPushingTemplates, setIsPushingTemplates] = useState(false)
  const [isApplyingTemplates, setIsApplyingTemplates] = useState(false)
  const [installedSwVersions, setInstalledSwVersions] = useState<string[]>([])
  
  // Load installed SOLIDWORKS versions on mount
  useEffect(() => {
    window.electronAPI?.solidworks?.getInstalledVersions?.().then(result => {
      if (result?.success && result.versions) {
        setInstalledSwVersions(result.versions.map(v => v.version))
      }
    }).catch(() => {})
  }, [])
  
  // Update template state when organization changes
  useEffect(() => {
    const templates = organization?.settings?.solidworks_templates as TemplateSettings | undefined
    setTemplateDocuments(templates?.documentTemplates || '')
    setTemplateSheetFormats(templates?.sheetFormats || '')
    setTemplateBom(templates?.bomTemplates || '')
    setTemplateCustomProperty(templates?.customPropertyFolders || '')
    setPromptForTemplate(templates?.promptForTemplate ?? false)
  }, [organization?.settings?.solidworks_templates])
  
  // Update DM license key when organization changes
  useEffect(() => {
    setDmLicenseKeyInput(organization?.settings?.solidworks_dm_license_key || '')
  }, [organization?.settings?.solidworks_dm_license_key])
  
  const hasUnsavedTemplates = 
    templateDocuments !== (orgTemplates?.documentTemplates || '') ||
    templateSheetFormats !== (orgTemplates?.sheetFormats || '') ||
    templateBom !== (orgTemplates?.bomTemplates || '') ||
    templateCustomProperty !== (orgTemplates?.customPropertyFolders || '') ||
    promptForTemplate !== (orgTemplates?.promptForTemplate ?? false)
  
  const hasUnsavedLicenseKey = dmLicenseKeyInput !== (organization?.settings?.solidworks_dm_license_key || '')
  
  // Get synced SolidWorks files
  const swExtensions = ['.sldprt', '.sldasm', '.slddrw']
  const syncedSwFiles = files.filter(f => 
    !f.isDirectory && 
    f.pdmData?.id && 
    swExtensions.includes(f.extension.toLowerCase())
  )

  // ============================================
  // License Key Handlers
  // ============================================

  const handleSaveLicenseKey = useCallback(async () => {
    const logInfo = (msg: string) => window.electronAPI?.log?.('info', `[SWSettings] ${msg}`)
    const logError = (msg: string) => window.electronAPI?.log?.('error', `[SWSettings] ${msg}`)
    
    logInfo('handleSaveLicenseKey called')
    logInfo(`organization: ${organization?.id}`)
    logInfo(`dmLicenseKeyInput length: ${dmLicenseKeyInput?.length}`)
    logInfo(`status.running: ${status.running}`)
    
    if (!organization) {
      logInfo('No organization, aborting')
      return
    }
    setIsSavingLicenseKey(true)
    try {
      const newKey = dmLicenseKeyInput || null
      logInfo(`newKey: ${newKey ? `${newKey.length} chars` : 'null'}`)
      
      // Fetch current settings from database first to avoid overwriting other fields
      logInfo('Fetching current org settings...')
      const { data: currentOrg, error: fetchError } = await db
        .from('organizations')
        .select('settings')
        .eq('id', organization.id)
        .single()
      
      if (fetchError) {
        logError(`Failed to fetch current settings: ${JSON.stringify(fetchError)}`)
      }
      logInfo(`Current settings keys: ${Object.keys(currentOrg?.settings || {}).join(', ')}`)
      
      const currentSettings = currentOrg?.settings || organization.settings || {}
      const newSettings = { ...currentSettings, solidworks_dm_license_key: newKey }
      logInfo(`New settings keys: ${Object.keys(newSettings).join(', ')}`)
      logInfo(`solidworks_dm_license_key in new settings: ${newSettings.solidworks_dm_license_key ? 'present' : 'null'}`)
      
      logInfo('Updating organization settings in DB...')
      const { data: updateResult, error } = await db
        .from('organizations')
        .update({ settings: newSettings })
        .eq('id', organization.id)
        .select('settings')
        .single()
      
      if (error) {
        logError(`DB update error: ${JSON.stringify(error)}`)
        throw error
      }
      
      // Verify the update actually worked (RLS can silently block updates)
      if (!updateResult) {
        logError('Update returned no data - likely blocked by RLS. Are you an admin?')
        throw new Error('Update failed - you may not have permission to modify organization settings')
      }
      
      // Verify the key was actually saved
      if (newKey && updateResult.settings?.solidworks_dm_license_key !== newKey) {
        logError(`Key mismatch after save! Expected: ${newKey?.length} chars, got: ${updateResult.settings?.solidworks_dm_license_key?.length || 0} chars`)
        throw new Error('License key was not saved correctly')
      }
      
      logInfo('DB update successful - verified key in response')
      
      setOrganization({
        ...organization,
        settings: newSettings
      })
      logInfo('Local organization state updated')
      
      // If service is running and we have a new key, send it to the service
      logInfo(`Checking if should send to service: newKey=${!!newKey}, status.running=${status.running}`)
      if (newKey && status.running) {
        logInfo('Sending license key to running service...')
        logInfo(`Key prefix: ${newKey.substring(0, 30)}...`)
        const result = await window.electronAPI?.solidworks?.startService(newKey)
        logInfo(`setDmLicense result: ${JSON.stringify(result)}`)
        if (result?.success) {
          addToast('success', 'Document Manager license key saved and applied')
          // Refresh status to pick up the change
          serviceControl.checkStatus()
        } else {
          addToast('warning', `License key saved but failed to apply: ${result?.error || 'Unknown error'}`)
        }
      } else {
        logInfo(`Not sending to service - newKey: ${!!newKey}, running: ${status.running}`)
        addToast('success', 'Document Manager license key saved')
      }
    } catch (err) {
      log.error('[SWSettings]', 'Save license key failed', { error: err })
      addToast('error', 'Failed to save license key')
    } finally {
      setIsSavingLicenseKey(false)
    }
  }, [organization, dmLicenseKeyInput, status.running, setOrganization, addToast, serviceControl])
  
  const handleClearLicenseKey = useCallback(async () => {
    if (!organization) return
    setIsSavingLicenseKey(true)
    try {
      // Fetch current settings from database first to avoid overwriting other fields
      const { data: currentOrg } = await db
        .from('organizations')
        .select('settings')
        .eq('id', organization.id)
        .single()
      
      const currentSettings = currentOrg?.settings || organization.settings || {}
      const newSettings = { ...currentSettings, solidworks_dm_license_key: null }
      
      const { data: updateResult, error } = await db
        .from('organizations')
        .update({ settings: newSettings })
        .eq('id', organization.id)
        .select('settings')
        .single()
      
      if (error) throw error
      
      // Verify the update actually worked (RLS can silently block updates)
      if (!updateResult) {
        throw new Error('Update failed - you may not have permission to modify organization settings')
      }
      
      setOrganization({
        ...organization,
        settings: newSettings
      })
      setDmLicenseKeyInput('')
      addToast('success', 'Document Manager license key cleared')
    } catch (err) {
      log.error('[SWSettings]', 'Clear license key failed', { error: err })
      addToast('error', err instanceof Error ? err.message : 'Failed to clear license key')
    } finally {
      setIsSavingLicenseKey(false)
    }
  }, [organization, setOrganization, addToast])

  // ============================================
  // Template Folder Handlers
  // ============================================

  const handleSaveTemplates = useCallback(async () => {
    if (!organization) return
    setIsSavingTemplates(true)
    try {
      const currentSettings = organization.settings || {}
      const newTemplates: TemplateSettings = {
        documentTemplates: templateDocuments || undefined,
        sheetFormats: templateSheetFormats || undefined,
        bomTemplates: templateBom || undefined,
        customPropertyFolders: templateCustomProperty || undefined,
        promptForTemplate: promptForTemplate,
        // Keep existing push info
        lastPushedAt: orgTemplates?.lastPushedAt,
        lastPushedBy: orgTemplates?.lastPushedBy
      }
      
      const newSettings = { ...currentSettings, solidworks_templates: newTemplates }
      
      const { data: updateResult, error } = await db
        .from('organizations')
        .update({ settings: newSettings })
        .eq('id', organization.id)
        .select('settings')
        .single()
      
      if (error) throw error
      if (!updateResult) throw new Error('Update failed - you may not have permission')
      
      setOrganization({ ...organization, settings: newSettings })
      addToast('success', 'Template folder settings saved')
    } catch (err) {
      log.error('[SWSettings]', 'Save templates failed', { error: err })
      addToast('error', err instanceof Error ? err.message : 'Failed to save template settings')
    } finally {
      setIsSavingTemplates(false)
    }
  }, [organization, templateDocuments, templateSheetFormats, templateBom, templateCustomProperty, promptForTemplate, orgTemplates, setOrganization, addToast])

  const handlePushTemplates = useCallback(async () => {
    if (!organization || !user) return
    setIsPushingTemplates(true)
    try {
      const currentSettings = organization.settings || {}
      const newTemplates: TemplateSettings = {
        documentTemplates: templateDocuments || undefined,
        sheetFormats: templateSheetFormats || undefined,
        bomTemplates: templateBom || undefined,
        customPropertyFolders: templateCustomProperty || undefined,
        promptForTemplate: promptForTemplate,
        // Update push timestamp to trigger realtime push
        lastPushedAt: new Date().toISOString(),
        lastPushedBy: user.id
      }
      
      const newSettings = { ...currentSettings, solidworks_templates: newTemplates }
      
      const { data: updateResult, error } = await db
        .from('organizations')
        .update({ settings: newSettings })
        .eq('id', organization.id)
        .select('settings')
        .single()
      
      if (error) throw error
      if (!updateResult) throw new Error('Update failed - you may not have permission')
      
      setOrganization({ ...organization, settings: newSettings })
      addToast('success', 'Template folders pushed to all users')
    } catch (err) {
      log.error('[SWSettings]', 'Push templates failed', { error: err })
      addToast('error', err instanceof Error ? err.message : 'Failed to push template settings')
    } finally {
      setIsPushingTemplates(false)
    }
  }, [organization, user, templateDocuments, templateSheetFormats, templateBom, templateCustomProperty, promptForTemplate, setOrganization, addToast])

  const handleApplyTemplates = useCallback(async () => {
    if (!vaultPath) {
      addToast('error', 'No vault selected. Select a vault first.')
      return
    }
    
    // Check if any path-based settings are configured, or promptForTemplate is being set
    const hasPathSettings = templateDocuments || templateSheetFormats || templateBom || templateCustomProperty
    if (!hasPathSettings && !promptForTemplate) {
      addToast('info', 'No template settings configured')
      return
    }
    
    setIsApplyingTemplates(true)
    try {
      const settings: { 
        documentTemplates?: string
        sheetFormats?: string
        bomTemplates?: string
        customPropertyFolders?: string
        promptForTemplate?: boolean 
      } = {}
      
      // Build absolute paths from vault root + relative paths
      if (templateDocuments) {
        settings.documentTemplates = `${vaultPath}\\${templateDocuments.replace(/\//g, '\\')}`
      }
      if (templateSheetFormats) {
        settings.sheetFormats = `${vaultPath}\\${templateSheetFormats.replace(/\//g, '\\')}`
      }
      if (templateBom) {
        settings.bomTemplates = `${vaultPath}\\${templateBom.replace(/\//g, '\\')}`
      }
      if (templateCustomProperty) {
        settings.customPropertyFolders = `${vaultPath}\\${templateCustomProperty.replace(/\//g, '\\')}`
      }
      
      // Always include the promptForTemplate setting
      settings.promptForTemplate = promptForTemplate
      
      const result = await window.electronAPI?.solidworks?.setFileLocations(settings)
      
      if (result?.success && result.updatedVersions?.length) {
        addToast('success', `Applied to SOLIDWORKS (${result.updatedVersions.join(', ')})`)
      } else if (result?.error) {
        addToast('error', result.error)
      } else {
        addToast('warning', 'No SOLIDWORKS installations found to update')
      }
    } catch (err) {
      log.error('[SWSettings]', 'Apply templates failed', { error: err })
      addToast('error', err instanceof Error ? err.message : 'Failed to apply template settings')
    } finally {
      setIsApplyingTemplates(false)
    }
  }, [vaultPath, templateDocuments, templateSheetFormats, templateBom, templateCustomProperty, promptForTemplate, addToast])

  // ============================================
  // Overall Status Helpers
  // ============================================

  // Compute overall integration status:
  // Green: Both SW API and DM API are up
  // Yellow: SW API is down (no SW installed), but DM API is up  
  // Red: DM API is down
  const getOverallStatus = useCallback((): OverallStatus => {
    if (!status.running) return 'stopped'
    if (status.dmApiAvailable) {
      return status.swInstalled ? 'online' : 'partial'
    }
    return 'offline'
  }, [status])

  const overallStatus = getOverallStatus()
  
  const overallStatusConfig: Record<OverallStatus, { color: string; textColor: string; label: string; description: string }> = {
    online: { color: 'bg-green-500', textColor: 'text-green-400', label: 'Fully Connected', description: 'Both SolidWorks API and Document Manager API are available' },
    partial: { color: 'bg-yellow-500', textColor: 'text-yellow-400', label: 'Partial', description: 'Document Manager API is available, but SolidWorks is not installed' },
    offline: { color: 'bg-red-500', textColor: 'text-red-400', label: 'Limited', description: 'Document Manager API is not available' },
    stopped: { color: 'bg-plm-fg-dim', textColor: 'text-plm-fg-dim', label: 'Stopped', description: 'Service is not running' },
  }

  return {
    // Service control
    ...serviceControl,
    
    // Organization & user context
    organization,
    user,
    isAdmin,
    vaultPath,
    addToast,
    
    // Settings preferences
    cadPreviewMode,
    setCadPreviewMode,
    solidworksPath,
    setSolidworksPath,
    autoStartSolidworksService,
    setAutoStartSolidworksService,
    hideSolidworksTempFiles,
    setHideSolidworksTempFiles,
    ignoreSolidworksTempFiles,
    setIgnoreSolidworksTempFiles,
    autoRefreshMetadataOnSave,
    setAutoRefreshMetadataOnSave,
    
    // DM License key
    dmLicenseKeyInput,
    setDmLicenseKeyInput,
    isSavingLicenseKey,
    showLicenseKey,
    setShowLicenseKey,
    hasUnsavedLicenseKey,
    handleSaveLicenseKey,
    handleClearLicenseKey,
    
    // Metadata sync
    syncedSwFiles,
    isSyncingMetadata,
    setIsSyncingMetadata,
    lastMetadataSyncResult,
    setLastMetadataSyncResult,
    
    // Templates
    orgTemplates,
    templateDocuments,
    setTemplateDocuments,
    templateSheetFormats,
    setTemplateSheetFormats,
    templateBom,
    setTemplateBom,
    templateCustomProperty,
    setTemplateCustomProperty,
    promptForTemplate,
    setPromptForTemplate,
    isSavingTemplates,
    isPushingTemplates,
    isApplyingTemplates,
    installedSwVersions,
    hasUnsavedTemplates,
    handleSaveTemplates,
    handlePushTemplates,
    handleApplyTemplates,
    
    // Overall status
    overallStatus,
    overallStatusConfig,
  }
}
