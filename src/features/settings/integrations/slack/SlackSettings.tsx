import { useState, useEffect } from 'react'
import { Loader2, Check, Eye, EyeOff, RefreshCw, Plug, ExternalLink, Trash2, Send } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { Badge, Button, Callout, Select, Switch, TextInput } from '@/components/core/ui'
import {
  SettingRow,
  SettingsGroup,
  SettingsPage,
  SettingsSection,
} from '@/features/settings/components/ui'
import { log } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import { usePDMStore } from '@/stores/pdmStore'

interface SlackChannel {
  id: string
  name: string
  is_private: boolean
}

interface NotificationEvent {
  id: string
  label: string
  description: string
  enabled: boolean
  channel: string
}

interface SlackSettingsData {
  configured: boolean
  is_connected: boolean
  workspace_name?: string
  workspace_id?: string
  bot_user_id?: string
  channels?: SlackChannel[]
  notifications: NotificationEvent[]
}

const DEFAULT_NOTIFICATION_EVENTS: NotificationEvent[] = [
  {
    id: 'eco_created',
    label: 'ECO Created',
    description: 'When a new Engineering Change Order is created',
    enabled: true,
    channel: '',
  },
  {
    id: 'eco_approved',
    label: 'ECO Approved',
    description: 'When an ECO is fully approved',
    enabled: true,
    channel: '',
  },
  {
    id: 'eco_rejected',
    label: 'ECO Rejected',
    description: 'When an ECO is rejected',
    enabled: true,
    channel: '',
  },
  {
    id: 'eco_released',
    label: 'ECO Released',
    description: 'When ECO changes are released to production',
    enabled: true,
    channel: '',
  },
  {
    id: 'review_requested',
    label: 'Review Requested',
    description: 'When someone is assigned to review a file',
    enabled: true,
    channel: '',
  },
  {
    id: 'review_completed',
    label: 'Review Completed',
    description: 'When a review is approved or rejected',
    enabled: true,
    channel: '',
  },
  {
    id: 'file_released',
    label: 'File Released',
    description: 'When files are released to a new revision',
    enabled: false,
    channel: '',
  },
  {
    id: 'file_obsoleted',
    label: 'File Obsoleted',
    description: 'When files are marked as obsolete',
    enabled: false,
    channel: '',
  },
]

function getApiUrl(organization: { settings?: { api_url?: string } } | null): string | null {
  return organization?.settings?.api_url || null
}

async function getAuthToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.access_token || null
}

export function SlackSettings() {
  const { organization, addToast, getEffectiveRole } = usePDMStore(
    useShallow((s) => ({
      organization: s.organization,
      addToast: s.addToast,
      getEffectiveRole: s.getEffectiveRole,
    })),
  )
  const isAdmin = getEffectiveRole() === 'admin'

  const apiUrl = getApiUrl(organization)

  const [settings, setSettings] = useState<SlackSettingsData | null>(null)
  const [botToken, setBotToken] = useState('')
  const [signingSecret, setSigningSecret] = useState('')
  const [showBotToken, setShowBotToken] = useState(false)
  const [showSigningSecret, setShowSigningSecret] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [isFetchingChannels, setIsFetchingChannels] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [apiServerOnline, setApiServerOnline] = useState<boolean | null>(null)
  const [notifications, setNotifications] = useState<NotificationEvent[]>(
    DEFAULT_NOTIFICATION_EVENTS,
  )
  const [channels, setChannels] = useState<SlackChannel[]>([])
  const [defaultChannel, setDefaultChannel] = useState('')
  const [testMessage, setTestMessage] = useState('')
  const [isSendingTest, setIsSendingTest] = useState(false)

  // Disconnect confirmation state
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)

  useEffect(() => {
    loadSettings()
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
        log.warn('[SlackSettings]', 'No auth token available')
        setIsLoading(false)
        return
      }

      const response = await fetch(`${apiUrl}/integrations/slack`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(5000),
      })

      setApiServerOnline(true)

      if (response.ok) {
        const data = await response.json()
        setSettings(data)
        if (data.configured) {
          setEnabled(true)
          setChannels(data.channels || [])
          setNotifications(data.notifications || DEFAULT_NOTIFICATION_EVENTS)
          if (data.notifications?.length > 0) {
            // Find the most common channel as default
            const channelCounts: Record<string, number> = {}
            data.notifications.forEach((n: NotificationEvent) => {
              if (n.channel) {
                channelCounts[n.channel] = (channelCounts[n.channel] || 0) + 1
              }
            })
            const mostCommon = Object.entries(channelCounts).sort((a, b) => b[1] - a[1])[0]
            if (mostCommon) {
              setDefaultChannel(mostCommon[0])
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        setApiServerOnline(false)
      }
      log.error('[SlackSettings]', 'Failed to load Slack settings', { error: error })
    } finally {
      setIsLoading(false)
    }
  }

  const handleTest = async () => {
    if (!apiUrl) {
      addToast('error', 'API server not configured. Go to Settings > REST API.')
      return
    }
    if (!botToken) {
      addToast('warning', 'Please enter a Bot Token')
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
      const response = await fetch(`${apiUrl}/integrations/slack/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          bot_token: botToken,
          signing_secret: signingSecret,
        }),
        signal: AbortSignal.timeout(15000),
      })

      const data = await response.json()

      if (response.ok) {
        setTestResult({
          success: true,
          message: `Connected to ${data.workspace_name || 'Slack workspace'}`,
        })
        if (data.channels) {
          setChannels(data.channels)
        }
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

  const handleFetchChannels = async () => {
    if (!apiUrl) {
      addToast('error', 'API server not configured. Go to Settings > REST API.')
      return
    }
    const token = await getAuthToken()
    if (!token) return

    setIsFetchingChannels(true)
    try {
      const response = await fetch(`${apiUrl}/integrations/slack/channels`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(10000),
      })

      if (response.ok) {
        const data = await response.json()
        setChannels(data.channels || [])
        addToast('success', `Found ${data.channels?.length || 0} channels`)
      } else {
        addToast('error', 'Failed to fetch channels')
      }
    } catch (error) {
      addToast('error', `Error: ${error}`)
    } finally {
      setIsFetchingChannels(false)
    }
  }

  const handleSave = async (skipTest: boolean = false) => {
    if (!apiUrl) {
      addToast('error', 'API server not configured. Go to Settings > REST API.')
      return
    }
    if (!botToken && !settings?.configured) {
      addToast('warning', 'Please enter a Bot Token')
      return
    }

    const token = await getAuthToken()
    if (!token) {
      addToast('error', 'Session expired. Please log in again.')
      return
    }

    setIsSaving(true)

    try {
      const response = await fetch(`${apiUrl}/integrations/slack`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          bot_token: botToken || undefined,
          signing_secret: signingSecret || undefined,
          default_channel: defaultChannel,
          notifications: notifications,
          skip_test: skipTest,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        if (data.connection_error) {
          addToast('warning', `Saved! But connection failed: ${data.connection_error}`)
        } else {
          addToast('success', data.message || 'Slack settings saved!')
        }
        loadSettings()
      } else {
        if (response.status === 401) {
          addToast('error', `Auth failed: ${data.message || 'Check API server Supabase config'}`)
        } else {
          addToast('error', data.message || data.error || 'Failed to save configuration')
        }
      }
    } catch (error) {
      log.error('[SlackSettings]', 'Error', { error: error })
      addToast('error', `Error: ${error}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSendTestMessage = async () => {
    if (!apiUrl) {
      addToast('error', 'API server not configured. Go to Settings > REST API.')
      return
    }
    if (!defaultChannel) {
      addToast('warning', 'Please select a default channel first')
      return
    }

    const token = await getAuthToken()
    if (!token) {
      addToast('error', 'Session expired. Please log in again.')
      return
    }

    setIsSendingTest(true)

    try {
      const response = await fetch(`${apiUrl}/integrations/slack/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          channel: defaultChannel,
          message: testMessage || '🔧 Test message from BluePLM!',
        }),
      })

      const data = await response.json()

      if (response.ok) {
        addToast('success', 'Test message sent!')
        setTestMessage('')
      } else {
        addToast('error', data.message || 'Failed to send message')
      }
    } catch (error) {
      addToast('error', `Error: ${error}`)
    } finally {
      setIsSendingTest(false)
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
      const response = await fetch(`${apiUrl}/integrations/slack`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        addToast('info', 'Slack integration disconnected')
        setSettings(null)
        setBotToken('')
        setSigningSecret('')
        setEnabled(false)
        setTestResult(null)
        setChannels([])
        setDefaultChannel('')
        setNotifications(DEFAULT_NOTIFICATION_EVENTS)
      }
    } catch (error) {
      addToast('error', `Error: ${error}`)
    } finally {
      setIsDisconnecting(false)
      setShowDisconnectDialog(false)
    }
  }

  const toggleNotification = (eventId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === eventId ? { ...n, enabled: !n.enabled } : n)),
    )
  }

  const setNotificationChannel = (eventId: string, channel: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === eventId ? { ...n, channel } : n)))
  }

  const setAllNotificationChannels = (channel: string) => {
    setDefaultChannel(channel)
    setNotifications((prev) => prev.map((n) => ({ ...n, channel })))
  }

  const connected = Boolean(settings?.is_connected)

  return (
    <SettingsPage>
      {!isAdmin && (
        <Callout tone="info">Only administrators can edit integration settings.</Callout>
      )}

      {/* Status header */}
      <SettingsSection>
        <SettingsGroup>
          <SettingRow
            label="Enable Slack Integration"
            htmlFor="slack-enabled"
            badge={
              isLoading ? (
                <Loader2 size={12} className="animate-spin text-plm-fg-muted" />
              ) : connected ? (
                <Badge tone="success">Connected</Badge>
              ) : apiServerOnline === false ? (
                <Badge tone="warning">API server offline</Badge>
              ) : (
                <Badge>Not connected</Badge>
              )
            }
            description={
              connected
                ? `Connected to ${settings?.workspace_name || 'Slack'} · ${channels.length} channel${channels.length !== 1 ? 's' : ''} available`
                : 'Approval reminders, review notifications, ECO updates'
            }
          >
            {connected && isAdmin && enabled && apiServerOnline !== false && (
              <Button
                size="sm"
                variant="danger-subtle"
                onClick={() => setShowDisconnectDialog(true)}
                icon={<Trash2 size={14} />}
              >
                Disconnect Slack
              </Button>
            )}
            <Switch
              id="slack-enabled"
              checked={enabled}
              onChange={(next) => isAdmin && setEnabled(next)}
              disabled={apiServerOnline === false || !isAdmin}
            />
          </SettingRow>
        </SettingsGroup>

        {apiServerOnline === false && (
          <Callout
            tone="warning"
            title="API Server Offline"
            action={
              <Button size="sm" onClick={checkApiServer} icon={<RefreshCw size={12} />}>
                Retry connection
              </Button>
            }
          >
            Slack integration requires the BluePLM API server. Run{' '}
            <code className="rounded bg-plm-bg px-1 font-mono">npm run api</code> locally or
            configure an external API URL in Settings → REST API.
          </Callout>
        )}
      </SettingsSection>

      {enabled && apiServerOnline !== false && (
        <>
          <SettingsSection
            title="Credentials"
            actions={
              isAdmin ? (
                <>
                  <Button
                    size="sm"
                    onClick={handleTest}
                    disabled={isTesting || !botToken}
                    loading={isTesting}
                    icon={<Plug size={14} />}
                  >
                    Test
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleSave(true)}
                    disabled={isSaving || (!botToken && !settings?.configured)}
                    loading={isSaving}
                    icon={<Check size={14} />}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => handleSave(false)}
                    disabled={isSaving || (!botToken && !settings?.configured)}
                    loading={isSaving}
                    icon={<Check size={14} />}
                  >
                    Save & Test
                  </Button>
                </>
              ) : undefined
            }
          >
            <SettingsGroup>
              <SettingRow
                label="Bot User OAuth Token"
                htmlFor="slack-bot-token"
                description="Found in your Slack App → OAuth & Permissions → Bot User OAuth Token"
                stacked
              >
                <div className="relative">
                  <TextInput
                    id="slack-bot-token"
                    type={showBotToken ? 'text' : 'password'}
                    value={botToken}
                    onChange={(e) => isAdmin && setBotToken(e.target.value)}
                    placeholder={
                      connected
                        ? '••••••••••••'
                        : 'xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx'
                    }
                    readOnly={!isAdmin}
                    className="pr-9 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowBotToken(!showBotToken)}
                    aria-label={showBotToken ? 'Hide token' : 'Show token'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-plm-fg-muted hover:text-plm-fg"
                  >
                    {showBotToken ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </SettingRow>
              <SettingRow
                label="Signing Secret"
                badge={<Badge>Optional</Badge>}
                htmlFor="slack-signing-secret"
                description="Found in your Slack App → Basic Information → App Credentials"
                stacked
              >
                <div className="relative">
                  <TextInput
                    id="slack-signing-secret"
                    type={showSigningSecret ? 'text' : 'password'}
                    value={signingSecret}
                    onChange={(e) => isAdmin && setSigningSecret(e.target.value)}
                    placeholder="For receiving events from Slack"
                    readOnly={!isAdmin}
                    className="pr-9 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSigningSecret(!showSigningSecret)}
                    aria-label={showSigningSecret ? 'Hide secret' : 'Show secret'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-plm-fg-muted hover:text-plm-fg"
                  >
                    {showSigningSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </SettingRow>
            </SettingsGroup>

            {testResult && (
              <Callout tone={testResult.success ? 'success' : 'error'}>{testResult.message}</Callout>
            )}
          </SettingsSection>

          {connected && (
            <SettingsSection
              title="Notification Settings"
              actions={
                isAdmin ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleFetchChannels}
                    loading={isFetchingChannels}
                    icon={<RefreshCw size={14} />}
                  >
                    Refresh channels
                  </Button>
                ) : undefined
              }
            >
              <SettingsGroup>
                <SettingRow
                  label="Default Channel"
                  htmlFor="slack-default-channel"
                  description="All notifications will be sent to this channel by default"
                >
                  <Select
                    id="slack-default-channel"
                    value={defaultChannel}
                    onChange={(e) => isAdmin && setAllNotificationChannels(e.target.value)}
                    disabled={!isAdmin}
                    className="w-56"
                  >
                    <option value="">Select a channel...</option>
                    {channels.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.is_private ? '🔒 ' : '# '}
                        {ch.name}
                      </option>
                    ))}
                  </Select>
                </SettingRow>
                {notifications.map((event) => (
                  <SettingRow
                    key={event.id}
                    label={event.label}
                    description={event.description}
                    htmlFor={`slack-event-${event.id}`}
                  >
                    {event.enabled && (
                      <Select
                        size="sm"
                        value={event.channel || defaultChannel}
                        onChange={(e) =>
                          isAdmin && setNotificationChannel(event.id, e.target.value)
                        }
                        disabled={!isAdmin}
                        className="max-w-[160px]"
                        aria-label={`${event.label} channel`}
                      >
                        <option value="">Use default</option>
                        {channels.map((ch) => (
                          <option key={ch.id} value={ch.id}>
                            {ch.is_private ? '🔒' : '#'} {ch.name}
                          </option>
                        ))}
                      </Select>
                    )}
                    <Switch
                      id={`slack-event-${event.id}`}
                      checked={event.enabled}
                      onChange={() => isAdmin && toggleNotification(event.id)}
                      disabled={!isAdmin}
                    />
                  </SettingRow>
                ))}
              </SettingsGroup>
            </SettingsSection>
          )}

          {connected && isAdmin && (
            <SettingsSection title="Send Test Message">
              <SettingsGroup>
                <SettingRow
                  label="Message"
                  htmlFor="slack-test-message"
                  stacked
                  description={
                    !defaultChannel ? (
                      <span className="text-plm-warning">
                        Select a default channel above to send test messages
                      </span>
                    ) : undefined
                  }
                >
                  <div className="flex gap-2">
                    <TextInput
                      id="slack-test-message"
                      type="text"
                      value={testMessage}
                      onChange={(e) => setTestMessage(e.target.value)}
                      placeholder="🔧 Test message from BluePLM!"
                      className="flex-1"
                    />
                    <Button
                      variant="primary"
                      onClick={handleSendTestMessage}
                      disabled={!defaultChannel}
                      loading={isSendingTest}
                      icon={<Send size={14} />}
                    >
                      Send
                    </Button>
                  </div>
                </SettingRow>
              </SettingsGroup>
            </SettingsSection>
          )}

          {!connected && (
            <Callout tone="info" title="Setup Instructions">
              <ol className="mt-1 list-decimal list-inside space-y-1">
                <li>
                  Go to{' '}
                  <a
                    href="https://api.slack.com/apps"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-plm-accent hover:underline"
                  >
                    Slack API Apps
                  </a>{' '}
                  and create a new app
                </li>
                <li>Select "From scratch" and choose your workspace</li>
                <li>
                  Go to <strong>OAuth & Permissions</strong> and add these Bot Token Scopes:
                  <ul className="ml-6 mt-1 list-disc space-y-0.5">
                    <li>
                      <code className="font-mono text-[12px]">channels:read</code> - View channels
                    </li>
                    <li>
                      <code className="font-mono text-[12px]">chat:write</code> - Send messages
                    </li>
                    <li>
                      <code className="font-mono text-[12px]">groups:read</code> - View private
                      channels
                    </li>
                  </ul>
                </li>
                <li>
                  Click <strong>Install to Workspace</strong> and authorize
                </li>
                <li>
                  Copy the <strong>Bot User OAuth Token</strong> (starts with xoxb-)
                </li>
                <li>
                  Invite the bot to your desired channels:{' '}
                  <code className="font-mono text-[12px]">/invite @YourBotName</code>
                </li>
              </ol>
            </Callout>
          )}

          <a
            href="https://api.slack.com/tutorials/tracks/posting-messages-with-curl"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[12px] text-plm-accent hover:underline"
          >
            <ExternalLink size={14} />
            Slack API Documentation
          </a>
        </>
      )}

      {showDisconnectDialog && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
          onClick={() => setShowDisconnectDialog(false)}
        >
          <div
            className="bg-plm-bg-light border border-plm-border rounded-xl p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[15px] font-semibold text-plm-fg mb-3">Disconnect Slack</h3>
            <p className="text-[13px] text-plm-fg-muted mb-5">
              Are you sure you want to disconnect Slack? This will stop all notifications.
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                onClick={() => setShowDisconnectDialog(false)}
                disabled={isDisconnecting}
              >
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDisconnect} disabled={isDisconnecting}>
                {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </SettingsPage>
  )
}
