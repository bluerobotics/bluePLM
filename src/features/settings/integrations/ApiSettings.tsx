import { useState, useEffect } from 'react'
import {
  Shield,
  RefreshCw,
  Eye,
  EyeOff,
  Copy,
  Check,
  Clock,
  Trash2,
  ExternalLink,
  Edit2,
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { Badge, Button, Callout, TextInput } from '@/components/core/ui'
import {
  SettingRow,
  SettingsGroup,
  SettingsPage,
  SettingsSection,
} from '@/features/settings/components/ui'
import { usePDMStore } from '@/stores/pdmStore'
import { supabase } from '@/lib/supabase'
import { copyToClipboard } from '@/lib/clipboard'
import {
  checkApiCompatibility,
  EXPECTED_API_VERSION,
  type ApiVersionCheckResult,
} from '@/lib/apiVersion'
import { log } from '@/lib/logger'

// Supabase v2 type inference incomplete for API key operations
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any // TODO: type this

interface ApiCallRecord {
  id: string
  timestamp: Date
  method: string
  endpoint: string
  status: number
  duration: number
}

const API_HISTORY_KEY = 'blueplm_api_history'

export function ApiSettings() {
  const {
    organization,
    setOrganization,
    addToast,
    getEffectiveRole,
    apiServerUrl,
    setApiServerUrl,
  } = usePDMStore(
    useShallow((s) => ({
      organization: s.organization,
      setOrganization: s.setOrganization,
      addToast: s.addToast,
      getEffectiveRole: s.getEffectiveRole,
      apiServerUrl: s.apiServerUrl,
      setApiServerUrl: s.setApiServerUrl,
    })),
  )
  const isAdmin = getEffectiveRole() === 'admin'

  const [apiToken, setApiToken] = useState<string | null>(null)
  const [showToken, setShowToken] = useState(false)
  const [tokenCopied, setTokenCopied] = useState(false)
  // Use store-backed URL for reliable persistence across app updates
  const apiUrl = apiServerUrl || ''
  const setApiUrl = (url: string) => setApiServerUrl(url || null)
  const [editingApiUrl, setEditingApiUrl] = useState(false)
  const [apiUrlInput, setApiUrlInput] = useState('')
  // Start with 'checking' if we have a URL configured, to show loading state during initial check
  const [apiStatus, setApiStatus] = useState<'unknown' | 'online' | 'offline' | 'checking'>(() => {
    // Check if we have a URL from org settings or store on initial render
    const orgUrl = organization?.settings?.api_url
    const storeUrl = apiServerUrl
    return orgUrl || storeUrl ? 'checking' : 'unknown'
  })
  const [apiVersion, setApiVersion] = useState<string | null>(null)
  const [apiBuild, setApiBuild] = useState<string | null>(null)
  const [versionCheck, setVersionCheck] = useState<ApiVersionCheckResult | null>(null)
  const [apiHistory, setApiHistory] = useState<ApiCallRecord[]>(() => {
    try {
      const stored = localStorage.getItem(API_HISTORY_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  // Get API token from Supabase session
  useEffect(() => {
    const getToken = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session?.access_token) {
        setApiToken(session.access_token)
      }
    }
    getToken()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setApiToken(session?.access_token || null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Sync API URL from org settings to store (handles persistence)
  // Org value takes precedence - this handles both setting and clearing the URL
  // Only sync when organization is actually loaded (has an id)
  useEffect(() => {
    // Don't sync until organization is loaded
    if (!organization?.id) {
      return
    }

    const orgApiUrl = organization?.settings?.api_url || null
    const currentApiUrl = apiServerUrl || null

    if (orgApiUrl !== currentApiUrl) {
      setApiServerUrl(orgApiUrl)
    }
  }, [organization?.id, organization?.settings?.api_url, apiServerUrl, setApiServerUrl])

  // Check API status when organization loads or URL changes
  // This ensures we wait for org to be ready before checking status
  useEffect(() => {
    // If org settings have api_url but store doesn't yet, wait for sync
    const orgApiUrl = organization?.settings?.api_url
    const effectiveUrl = apiUrl || orgApiUrl

    if (effectiveUrl) {
      // Small delay to ensure URL sync has happened
      const timeout = setTimeout(() => {
        checkApiStatus()
      }, 100)
      return () => clearTimeout(timeout)
    } else if (organization?.id) {
      // Organization loaded but no API URL configured
      setApiStatus('unknown')
      return undefined
    } else {
      // Keep showing 'checking' state while waiting for org
      return undefined
    }
  }, [organization?.id, organization?.settings?.api_url, apiUrl])

  const checkApiStatus = async () => {
    if (!apiUrl) {
      setApiStatus('unknown')
      return
    }

    setApiStatus('checking')
    const start = Date.now()
    try {
      const response = await fetch(`${apiUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      })
      const duration = Date.now() - start

      if (response.ok) {
        const data = await response.json()
        setApiStatus('online')
        setApiVersion(data.version || null)
        setApiBuild(data.build || null)
        // Check version compatibility
        const check = checkApiCompatibility(data.version || null)
        setVersionCheck(check)
        if (check.status !== 'current') {
          log.warn('[API]', 'Version mismatch', { status: check.status, message: check.message })
        }
        addApiCall('GET', '/health', response.status, duration)
      } else {
        setApiStatus('offline')
        addApiCall('GET', '/health', response.status, duration)
      }
    } catch (error) {
      const duration = Date.now() - start
      setApiStatus('offline')
      addApiCall('GET', '/health', 0, duration)
    }
    setLastChecked(new Date())
  }

  const addApiCall = (method: string, endpoint: string, status: number, duration: number) => {
    const newCall: ApiCallRecord = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      method,
      endpoint,
      status,
      duration,
    }
    setApiHistory((prev) => {
      const updated = [newCall, ...prev].slice(0, 50)
      localStorage.setItem(API_HISTORY_KEY, JSON.stringify(updated))
      return updated
    })
  }

  const clearApiHistory = () => {
    setApiHistory([])
    localStorage.removeItem(API_HISTORY_KEY)
  }

  const handleSaveApiUrl = async () => {
    let url = apiUrlInput.trim()
    if (url) {
      // Remove any existing protocol and normalize
      url = url.replace(/^https?:\/\//, '')
      // Remove trailing slashes
      url = url.replace(/\/+$/, '')
      // Remove any leading/trailing whitespace that might have snuck in
      url = url.trim()
      // Add https:// (always use https for production)
      url = 'https://' + url

      // Update store (which also syncs to localStorage for backward compatibility)
      setApiUrl(url)

      // Save org-wide for all members when admin sets external URL
      if (organization && isAdmin) {
        try {
          // IMPORTANT: Fetch current settings from database first to avoid overwriting
          // other fields that may have been set by other components
          const { data: currentOrg, error: fetchError } = await db
            .from('organizations')
            .select('settings')
            .eq('id', organization.id)
            .single()

          if (fetchError) {
            log.error('[API]', 'Failed to fetch current settings', { error: fetchError })
          }

          // Merge with current database settings (not local state which may be stale)
          const currentSettings = currentOrg?.settings || organization.settings || {}
          const newSettings = { ...currentSettings, api_url: url }

          const { error } = await db
            .from('organizations')
            .update({ settings: newSettings })
            .eq('id', organization.id)

          if (error) {
            log.error('[API]', 'Failed to save API URL to org', { error })
            addToast('error', `Saved locally, but failed to sync: ${error.message}`)
          } else {
            // Update local state
            setOrganization({
              ...organization,
              settings: newSettings,
            })
            addToast('success', 'API URL saved for organization')
          }
        } catch (error) {
          log.error('[API]', 'Failed to save API URL to org', { error: error })
          addToast('error', 'Saved locally, but failed to sync to organization')
        }
      } else {
        addToast('success', 'API URL saved')
      }
    }
    setEditingApiUrl(false)
    setTimeout(checkApiStatus, 100)
  }

  const handleCopyToken = async () => {
    if (!apiToken) return
    const result = await copyToClipboard(apiToken)
    if (result.success) {
      setTokenCopied(true)
      setTimeout(() => setTokenCopied(false), 2000)
    } else {
      log.error('[API]', 'Failed to copy token', { error: result.error })
    }
  }

  const testApiEndpoint = async (endpoint: string) => {
    if (!apiToken) {
      return
    }
    const start = Date.now()
    try {
      const response = await fetch(`${apiUrl}${endpoint}`, {
        headers: { Authorization: `Bearer ${apiToken}` },
        signal: AbortSignal.timeout(10000),
      })
      const duration = Date.now() - start
      addApiCall('GET', endpoint, response.status, duration)
    } catch (error) {
      const duration = Date.now() - start
      addApiCall('GET', endpoint, 0, duration)
    }
  }

  const statusDot =
    apiStatus === 'online'
      ? 'bg-plm-success'
      : apiStatus === 'offline'
        ? 'bg-plm-error'
        : apiStatus === 'checking'
          ? 'bg-plm-warning animate-pulse'
          : 'bg-plm-fg-muted'

  const startEditingUrl = () => {
    setApiUrlInput(apiUrl.replace(/^https?:\/\//, ''))
    setEditingApiUrl(true)
  }

  return (
    <SettingsPage>
      <SettingsSection
        title="Server Status"
        actions={
          apiUrl ? (
            <Button
              size="sm"
              onClick={checkApiStatus}
              disabled={apiStatus === 'checking'}
              icon={
                <RefreshCw size={14} className={apiStatus === 'checking' ? 'animate-spin' : ''} />
              }
            >
              Refresh
            </Button>
          ) : undefined
        }
      >
        <SettingsGroup>
          <SettingRow
            label={
              <span className="flex items-center gap-2">
                <span className={`h-2 w-2 flex-shrink-0 rounded-full ${statusDot}`} aria-hidden />
                {apiStatus === 'online' && 'API Server Online'}
                {apiStatus === 'offline' && 'API Server Offline'}
                {apiStatus === 'checking' && 'Checking...'}
                {apiStatus === 'unknown' &&
                  (apiUrl ? 'Status Unknown' : 'No API server configured')}
              </span>
            }
            badge={
              apiVersion ? (
                <Badge tone={versionCheck?.status === 'current' ? 'success' : 'warning'}>
                  v{apiVersion}
                </Badge>
              ) : undefined
            }
            description={
              apiUrl ? (
                <span className="flex flex-wrap items-center gap-2">
                  {versionCheck && versionCheck.status !== 'current' && (
                    <span className="text-plm-warning">(expected v{EXPECTED_API_VERSION})</span>
                  )}
                  {apiBuild && <code className="font-mono text-plm-fg-dim">{apiBuild}</code>}
                  {lastChecked && <span>Checked {lastChecked.toLocaleTimeString()}</span>}
                </span>
              ) : undefined
            }
          >
            {apiUrl && (
              <a
                href={`${apiUrl}/docs`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[12px] text-plm-accent hover:underline"
              >
                <ExternalLink size={14} />
                Open API Documentation (Swagger)
              </a>
            )}
          </SettingRow>

          <SettingRow
            label="API Server URL"
            badge={
              !isAdmin ? (
                <Badge icon={<Shield size={10} />}>Admin required to edit</Badge>
              ) : undefined
            }
            description={
              editingApiUrl && isAdmin
                ? 'Paste your Railway/Render domain — https:// is added automatically'
                : undefined
            }
            stacked={editingApiUrl && isAdmin}
          >
            {editingApiUrl && isAdmin ? (
              <div className="flex gap-2">
                <TextInput
                  type="text"
                  value={apiUrlInput}
                  onChange={(e) => setApiUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveApiUrl()
                    if (e.key === 'Escape') setEditingApiUrl(false)
                  }}
                  placeholder="blueplm-api-production.up.railway.app"
                  className="flex-1 font-mono"
                  autoFocus
                />
                <Button variant="primary" onClick={handleSaveApiUrl}>
                  Save
                </Button>
                <Button onClick={() => setEditingApiUrl(false)}>Cancel</Button>
              </div>
            ) : apiUrl ? (
              <>
                <code className="max-w-[320px] truncate font-mono text-[12px] text-plm-fg-dim">
                  {apiUrl}
                </code>
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={startEditingUrl}
                    icon={<Edit2 size={12} />}
                  >
                    Edit
                  </Button>
                )}
              </>
            ) : isAdmin ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setApiUrlInput('')
                  setEditingApiUrl(true)
                }}
              >
                Set API Server URL
              </Button>
            ) : (
              <span className="text-[12px] text-plm-fg-muted">No API server configured</span>
            )}
          </SettingRow>
        </SettingsGroup>

        {apiUrl &&
          versionCheck &&
          versionCheck.status !== 'current' &&
          versionCheck.status !== 'unknown' && (
            <Callout
              tone={versionCheck.status === 'incompatible' ? 'error' : 'warning'}
              title={versionCheck.message}
            >
              {versionCheck.details}
            </Callout>
          )}

        {apiUrl && apiStatus === 'offline' && (
          <Callout tone="info" title="Need to deploy?">
            <p>Deploy to Railway or Render in 5 min.</p>
            <div className="mt-1 flex gap-3">
              <a
                href="https://railway.app/new"
                target="_blank"
                rel="noopener noreferrer"
                className="text-plm-accent hover:underline"
              >
                Railway
              </a>
              <a
                href="https://render.com/deploy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-plm-accent hover:underline"
              >
                Render
              </a>
              <a
                href="https://github.com/bluerobotics/bluePLM/blob/main/api/README.md#deployment"
                target="_blank"
                rel="noopener noreferrer"
                className="text-plm-accent hover:underline"
              >
                Guide
              </a>
            </div>
          </Callout>
        )}
      </SettingsSection>

      <SettingsSection title="Access Token">
        <SettingsGroup>
          {apiToken ? (
            <>
              <div className="flex items-center gap-2 px-4 py-3">
                <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-plm-fg-muted">
                  {showToken ? apiToken : `${apiToken.substring(0, 20)}${'•'.repeat(30)}`}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowToken(!showToken)}
                  title={showToken ? 'Hide token' : 'Show token'}
                  aria-label={showToken ? 'Hide token' : 'Show token'}
                  icon={showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCopyToken}
                  title="Copy token"
                  aria-label="Copy token"
                  className={tokenCopied ? 'text-plm-success' : ''}
                  icon={tokenCopied ? <Check size={14} /> : <Copy size={14} />}
                />
              </div>
              {apiUrl && (
                <div className="px-4 py-3">
                  <code className="block rounded bg-plm-bg px-2 py-1.5 font-mono text-[12px] text-plm-fg-dim">
                    curl -H "Authorization: Bearer $TOKEN" {apiUrl}/files
                  </code>
                </div>
              )}
            </>
          ) : (
            <div className="px-4 py-3 text-[13px] text-plm-fg-muted">
              Sign in to get an API token
            </div>
          )}
        </SettingsGroup>
      </SettingsSection>

      {apiToken && apiStatus === 'online' && apiUrl && (
        <SettingsSection title="Quick Test">
          <div className="flex flex-wrap gap-2">
            {['/vaults', '/files?limit=5', '/checkouts', '/activity?limit=5'].map((endpoint) => (
              <Button
                key={endpoint}
                size="sm"
                onClick={() => testApiEndpoint(endpoint)}
                className="font-mono"
              >
                GET {endpoint}
              </Button>
            ))}
          </div>
        </SettingsSection>
      )}

      <SettingsSection
        title="Recent API Calls"
        actions={
          apiHistory.length > 0 ? (
            <Button size="sm" variant="ghost" onClick={clearApiHistory} icon={<Trash2 size={14} />}>
              Clear
            </Button>
          ) : undefined
        }
      >
        <SettingsGroup>
          {apiHistory.length === 0 ? (
            <div className="px-4 py-3 text-[13px] text-plm-fg-muted">No API calls recorded</div>
          ) : (
            <div className="max-h-48 divide-y divide-plm-border overflow-y-auto">
              {apiHistory.slice(0, 20).map((call) => (
                <div key={call.id} className="flex items-center gap-2 px-4 py-2 text-[12px]">
                  <Badge
                    tone={
                      call.status >= 200 && call.status < 300
                        ? 'success'
                        : call.status === 0
                          ? 'error'
                          : 'warning'
                    }
                  >
                    {call.status || 'error'}
                  </Badge>
                  <span className="text-plm-fg-muted">{call.method}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-plm-fg">
                    {call.endpoint}
                  </span>
                  <span className="flex items-center gap-1 text-plm-fg-muted">
                    <Clock size={10} />
                    {call.duration}ms
                  </span>
                </div>
              ))}
            </div>
          )}
        </SettingsGroup>
      </SettingsSection>
    </SettingsPage>
  )
}
