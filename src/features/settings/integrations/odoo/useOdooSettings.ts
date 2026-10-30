import { useState, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { log } from '@/lib/logger'
import { usePDMStore } from '@/stores/pdmStore'

import {
  CONFIG_COLORS,
  apiKeyPayload,
  getApiUrl,
  getAuthToken,
  sameConnection,
  type ConnectionIdentity,
  type OdooSettingsData,
  type SavedConfig,
} from './odooTypes'

/** State and server calls behind the Odoo settings page (moved out of OdooSettings.tsx). */
export function useOdooSettings() {
  const { organization, addToast, getEffectiveRole } = usePDMStore(
    useShallow((s) => ({
      organization: s.organization,
      addToast: s.addToast,
      getEffectiveRole: s.getEffectiveRole,
    })),
  )
  const isAdmin = getEffectiveRole() === 'admin'

  const apiUrl = getApiUrl(organization)

  // Current active settings
  const [settings, setSettings] = useState<OdooSettingsData | null>(null)

  // Form fields
  const [url, setUrl] = useState('')
  const [database, setDatabase] = useState('')
  const [username, setUsername] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  // The key never comes back from the API, so the form tracks only whether one
  // is stored. An empty field then means "keep it" rather than "clear it".
  const [hasStoredKey, setHasStoredKey] = useState(false)
  // Which connection that stored key belongs to, so an edit to the url,
  // database or username can retire it.
  const [storedKeyConnection, setStoredKeyConnection] = useState<ConnectionIdentity | null>(null)

  // Saved connections
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([])
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [configName, setConfigName] = useState('')
  const [configDescription, setConfigDescription] = useState('')
  const [configColor, setConfigColor] = useState(CONFIG_COLORS[0].value)
  const [editingConfig, setEditingConfig] = useState<SavedConfig | null>(null)

  // Loading states
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isSavingConfig, setIsSavingConfig] = useState(false)
  const [isLoadingConfigs, setIsLoadingConfigs] = useState(false)
  const [activatingConfigId, setActivatingConfigId] = useState<string | null>(null)

  // UI state
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [apiServerOnline, setApiServerOnline] = useState<boolean | null>(null)
  // Server-side misconfiguration that an admin has to fix, kept out of a toast
  // because it names the environment variable to set.
  const [setupError, setSetupError] = useState<string | null>(null)

  // Delete/Disconnect confirmation state
  const [deletingConfig, setDeletingConfig] = useState<SavedConfig | null>(null)
  const [isDeletingConfig, setIsDeletingConfig] = useState(false)
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)

  const storedKeyApplies =
    hasStoredKey && sameConnection(storedKeyConnection, { url, database, username })

  // A new connection has nothing on file, so it must carry a key. An edit may
  // leave the field alone and keep the one already stored, but only while it
  // still points at the server that key was saved for.
  const apiKeyRequired = !editingConfig || !storedKeyApplies

  useEffect(() => {
    loadSettings()
    loadSavedConfigs()
  }, [])

  const checkApiServer = async () => {
    if (!apiUrl) {
      setApiServerOnline(false)
      return false
    }
    try {
      const response = await fetch(`${apiUrl}/health`, {
        signal: AbortSignal.timeout(3000),
      })
      setApiServerOnline(response.ok)
      return response.ok
    } catch {
      setApiServerOnline(false)
      return false
    }
  }

  const loadSettings = async () => {
    setIsLoading(true)
    if (!apiUrl) {
      setApiServerOnline(false)
      setIsLoading(false)
      return
    }
    try {
      const token = await getAuthToken()
      if (!token) {
        log.warn('[OdooSettings]', 'No auth token available')
        setIsLoading(false)
        return
      }

      const response = await fetch(`${apiUrl}/integrations/odoo`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(5000),
      })

      setApiServerOnline(true)

      if (response.ok) {
        const data = await response.json()
        setSettings(data)
        setHasStoredKey(Boolean(data.has_api_key))
        if (data.configured && data.settings) {
          setUrl(data.settings.url || '')
          setDatabase(data.settings.database || '')
          setUsername(data.settings.username || '')
          setStoredKeyConnection({
            url: data.settings.url || '',
            database: data.settings.database || '',
            username: data.settings.username || '',
          })
        }
      }
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        setApiServerOnline(false)
      }
      log.error('[OdooSettings]', 'Failed to load Odoo settings', { error: error })
    } finally {
      setIsLoading(false)
    }
  }

  const loadSavedConfigs = async () => {
    setIsLoadingConfigs(true)
    if (!apiUrl) {
      setIsLoadingConfigs(false)
      return
    }
    try {
      const token = await getAuthToken()
      if (!token) return

      const response = await fetch(`${apiUrl}/integrations/odoo/configs`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      })

      if (response.ok) {
        const data = await response.json()
        setSavedConfigs(data.configs || [])
      }
    } catch (error) {
      log.error('[OdooSettings]', 'Failed to load saved connections', { error: error })
    } finally {
      setIsLoadingConfigs(false)
    }
  }

  const handleTest = async () => {
    if (!apiUrl) {
      addToast('error', 'API server not configured. Go to Settings > REST API.')
      return
    }
    if (!url || !database || !username || !apiKey) {
      addToast(
        'warning',
        storedKeyApplies && !apiKey
          ? 'Enter the API key to test it directly, or use Save & Test to test the saved one.'
          : 'Please fill in all Odoo fields',
      )
      return
    }

    const token = await getAuthToken()
    if (!token) {
      addToast('error', 'Session expired. Please log in again.')
      return
    }

    setIsTesting(true)
    setTestResult(null)

    try {
      const response = await fetch(`${apiUrl}/integrations/odoo/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url, database, username, api_key: apiKey }),
        signal: AbortSignal.timeout(15000),
      })

      const data = await response.json()

      if (response.ok) {
        setTestResult({
          success: true,
          message: `Connected! User: ${data.user_name}, Odoo ${data.version}`,
        })
      } else {
        setTestResult({
          success: false,
          message: data.message || data.error || 'Connection failed',
        })
      }
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        setApiServerOnline(false)
        setTestResult({
          success: false,
          message: 'API server is offline. Run "npm run api" locally.',
        })
      } else {
        setTestResult({ success: false, message: String(error) })
      }
    } finally {
      setIsTesting(false)
    }
  }

  const handleSave = async (skipTest: boolean = false) => {
    if (!apiUrl) {
      addToast('error', 'API server not configured. Go to Settings > REST API.')
      return
    }
    if (!url || !database || !username || (!apiKey && !storedKeyApplies)) {
      addToast('warning', 'Please fill in all Odoo fields')
      return
    }

    const token = await getAuthToken()
    if (!token) {
      addToast('error', 'Session expired. Please log in again.')
      return
    }

    setIsSaving(true)

    try {
      const response = await fetch(`${apiUrl}/integrations/odoo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          url,
          database,
          username,
          ...apiKeyPayload(apiKey),
          skip_test: skipTest,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        if (data.connection_error) {
          addToast('warning', `Saved! But connection failed: ${data.connection_error}`)
        } else {
          addToast('success', data.message || 'Odoo credentials saved!')
        }
        setSetupError(null)
        // The key is stored now; showing it as saved beats leaving it in a box
        // where a later save would send it again.
        setApiKey('')
        loadSettings()
        // Always refresh saved configs list (new config may have been auto-created)
        loadSavedConfigs()
      } else {
        if (response.status === 401) {
          addToast('error', `Auth failed: ${data.message || 'Check API server Supabase config'}`)
        } else if (response.status === 503) {
          setSetupError(data.message || 'The API cannot store credentials right now.')
          addToast('error', 'Credentials could not be stored - see the note above the form.')
        } else {
          addToast('error', data.message || data.error || 'Failed to save connection')
        }
      }
    } catch (error) {
      log.error('[OdooSettings]', 'Error', { error: error })
      addToast('error', `Error: ${error}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveConfig = async (andConnect: boolean = true) => {
    if (!apiUrl) {
      addToast('error', 'API server not configured. Go to Settings > REST API.')
      return
    }
    if (!configName.trim()) {
      addToast('warning', 'Please enter a connection name')
      return
    }
    if (!url || !database || !username || (!apiKey && apiKeyRequired)) {
      addToast('warning', 'Please fill in all Odoo fields first')
      return
    }

    const token = await getAuthToken()
    if (!token) {
      addToast('error', 'Session expired. Please log in again.')
      return
    }

    setIsSavingConfig(true)

    try {
      const endpoint = editingConfig
        ? `${apiUrl}/integrations/odoo/configs/${editingConfig.id}`
        : `${apiUrl}/integrations/odoo/configs`

      const method = editingConfig ? 'PUT' : 'POST'

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: configName.trim(),
          description: configDescription.trim() || null,
          url,
          database,
          username,
          ...apiKeyPayload(apiKey),
          color: configColor,
          skip_test: !andConnect, // Skip connection test when just saving
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setSetupError(null)
        setApiKey('')
        setHasStoredKey(true)
        const configId = data.config?.id || editingConfig?.id

        // Only activate if andConnect is true
        if (andConnect && configId) {
          try {
            const activateResponse = await fetch(
              `${apiUrl}/integrations/odoo/configs/${configId}/activate`,
              {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
              },
            )
            const activateData = await activateResponse.json()

            if (activateResponse.ok) {
              addToast(
                activateData.connected ? 'success' : 'warning',
                activateData.connected
                  ? `"${configName}" saved and connected!`
                  : `"${configName}" saved but connection failed: ${activateData.message}`,
              )
              loadSettings()
            } else {
              if (activateResponse.status === 503) setSetupError(activateData.message)
              addToast('warning', `Connection saved but activation failed: ${activateData.message}`)
            }
          } catch {
            addToast('warning', 'Connection saved but failed to activate')
          }
        } else {
          addToast('success', data.message || `Connection "${configName}" saved!`)
        }

        setShowSaveDialog(false)
        setConfigName('')
        setConfigDescription('')
        setConfigColor(CONFIG_COLORS[0].value)
        setEditingConfig(null)
        loadSavedConfigs()
      } else if (response.status === 503) {
        setSetupError(data.message || 'The API cannot store credentials right now.')
        addToast('error', 'Credentials could not be stored - see the message below.')
      } else {
        addToast('error', data.message || 'Failed to save connection')
      }
    } catch (error) {
      addToast('error', `Error: ${error}`)
    } finally {
      setIsSavingConfig(false)
    }
  }

  const handleLoadConfig = async (config: SavedConfig) => {
    if (!apiUrl) {
      addToast('error', 'API server not configured. Go to Settings > REST API.')
      return
    }
    const token = await getAuthToken()
    if (!token) {
      addToast('error', 'Session expired. Please log in again.')
      return
    }

    try {
      // Connection details only - the API never returns the key itself
      const response = await fetch(`${apiUrl}/integrations/odoo/configs/${config.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.ok) {
        const data = await response.json()
        setUrl(data.url)
        setDatabase(data.database)
        setUsername(data.username)
        // The key stays on the server. An empty field with has_api_key set
        // shows as already saved and is left untouched on the next save.
        setApiKey('')
        setHasStoredKey(Boolean(data.has_api_key))
        setStoredKeyConnection({
          url: data.url,
          database: data.database,
          username: data.username,
        })
        addToast('info', `Loaded "${config.name}" - click Save & Test to activate`)
      } else {
        addToast('error', 'Failed to load connection')
      }
    } catch (error) {
      addToast('error', `Error: ${error}`)
    }
  }

  const handleActivateConfig = async (config: SavedConfig) => {
    if (!apiUrl) {
      addToast('error', 'API server not configured. Go to Settings > REST API.')
      return
    }
    const token = await getAuthToken()
    if (!token) {
      addToast('error', 'Session expired. Please log in again.')
      return
    }

    setActivatingConfigId(config.id)

    try {
      const response = await fetch(`${apiUrl}/integrations/odoo/configs/${config.id}/activate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })

      const data = await response.json()

      if (response.ok) {
        addToast(data.connected ? 'success' : 'warning', data.message)
        loadSettings()
        loadSavedConfigs()
      } else {
        addToast('error', data.message || 'Failed to activate connection')
      }
    } catch (error) {
      addToast('error', `Error: ${error}`)
    } finally {
      setActivatingConfigId(null)
    }
  }

  const handleDeleteConfig = async () => {
    if (!deletingConfig) return
    if (!apiUrl) {
      addToast('error', 'API server not configured. Go to Settings > REST API.')
      setDeletingConfig(null)
      return
    }

    const token = await getAuthToken()
    if (!token) {
      addToast('error', 'Session expired. Please log in again.')
      setDeletingConfig(null)
      return
    }

    setIsDeletingConfig(true)
    try {
      const response = await fetch(`${apiUrl}/integrations/odoo/configs/${deletingConfig.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.ok) {
        addToast('info', `Deleted "${deletingConfig.name}"`)
        loadSavedConfigs()
      } else {
        addToast('error', 'Failed to delete connection')
      }
    } catch (error) {
      addToast('error', `Error: ${error}`)
    } finally {
      setIsDeletingConfig(false)
      setDeletingConfig(null)
    }
  }

  const handleEditConfig = (config: SavedConfig) => {
    setEditingConfig(config)
    setConfigName(config.name)
    setConfigDescription(config.description || '')
    setConfigColor(config.color || CONFIG_COLORS[0].value)
    // Load the config values into form
    handleLoadConfig(config).then(() => {
      setShowSaveDialog(true)
    })
  }

  const handleSync = async () => {
    if (!apiUrl) {
      addToast('error', 'API server not configured. Go to Settings > REST API.')
      return
    }
    const token = await getAuthToken()
    if (!token) {
      addToast('error', 'Session expired. Please log in again.')
      return
    }

    setIsSyncing(true)

    try {
      const response = await fetch(`${apiUrl}/integrations/odoo/sync/suppliers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })

      const data = await response.json()

      if (response.ok) {
        addToast(
          'success',
          `Synced ${data.created} new, ${data.updated} updated suppliers from Odoo`,
        )
        loadSettings()
      } else {
        addToast('error', data.message || data.error || 'Sync failed')
      }
    } catch (error) {
      addToast('error', `Sync error: ${error}`)
    } finally {
      setIsSyncing(false)
    }
  }

  const handleDisconnect = async () => {
    if (!apiUrl) {
      addToast('error', 'API server not configured. Go to Settings > REST API.')
      setShowDisconnectDialog(false)
      return
    }
    const token = await getAuthToken()
    if (!token) {
      addToast('error', 'Session expired. Please log in again.')
      setShowDisconnectDialog(false)
      return
    }

    setIsDisconnecting(true)
    try {
      const response = await fetch(`${apiUrl}/integrations/odoo`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.ok) {
        addToast('info', 'Odoo integration disconnected')
        setSettings(null)
        setUrl('')
        setDatabase('')
        setUsername('')
        setApiKey('')
        setHasStoredKey(false)
        setTestResult(null)
      }
    } catch (error) {
      addToast('error', `Error: ${error}`)
    } finally {
      setIsDisconnecting(false)
      setShowDisconnectDialog(false)
    }
  }

  const openNewConnection = () => {
    setEditingConfig(null)
    setConfigName('')
    setConfigDescription('')
    setConfigColor(CONFIG_COLORS[0].value)
    // Clear form for new config
    setUrl('')
    setDatabase('')
    setUsername('')
    setApiKey('')
    setHasStoredKey(false)
    setTestResult(null)
    setShowSaveDialog(true)
  }

  const closeSaveDialog = () => {
    setShowSaveDialog(false)
    setEditingConfig(null)
  }

  return {
    isAdmin,
    settings,
    url,
    setUrl,
    database,
    setDatabase,
    username,
    setUsername,
    apiKey,
    setApiKey,
    showApiKey,
    setShowApiKey,
    hasStoredKey,
    storedKeyApplies,
    apiKeyRequired,
    savedConfigs,
    showSaveDialog,
    configName,
    setConfigName,
    configDescription,
    setConfigDescription,
    configColor,
    setConfigColor,
    editingConfig,
    isLoading,
    isSaving,
    isTesting,
    isSyncing,
    isSavingConfig,
    isLoadingConfigs,
    activatingConfigId,
    testResult,
    apiServerOnline,
    setupError,
    deletingConfig,
    setDeletingConfig,
    isDeletingConfig,
    showDisconnectDialog,
    setShowDisconnectDialog,
    isDisconnecting,
    checkApiServer,
    handleTest,
    handleSave,
    handleSaveConfig,
    handleLoadConfig,
    handleActivateConfig,
    handleDeleteConfig,
    handleEditConfig,
    handleSync,
    handleDisconnect,
    openNewConnection,
    closeSaveDialog,
  }
}

export type OdooSettingsState = ReturnType<typeof useOdooSettings>
