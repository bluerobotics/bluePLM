import {
  AlertCircle,
  Check,
  Edit2,
  ExternalLink,
  Eye,
  EyeOff,
  FolderOpen,
  Loader2,
  Plug,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'

import { Badge, Button, Callout, TextInput } from '@/components/core/ui'
import {
  SettingRow,
  SettingsGroup,
  SettingsPage,
  SettingsSection,
} from '@/features/settings/components/ui'

import { OdooConfirmDialog } from './OdooConfirmDialog'
import { OdooConnectionDialog } from './OdooConnectionDialog'
import { useOdooSettings } from './useOdooSettings'

export function OdooSettings() {
  const odoo = useOdooSettings()
  const {
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
    savedConfigs,
    showSaveDialog,
    isLoading,
    isSaving,
    isTesting,
    isSyncing,
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
    handleLoadConfig,
    handleActivateConfig,
    handleDeleteConfig,
    handleEditConfig,
    handleSync,
    handleDisconnect,
    openNewConnection,
  } = odoo

  const connected = Boolean(settings?.is_connected)
  const cannotSave = isSaving || !url || !database || !username || (!apiKey && !storedKeyApplies)

  return (
    <SettingsPage>
      {!isAdmin && (
        <Callout tone="info">Only administrators can edit integration settings.</Callout>
      )}

      {/* Status header */}
      <SettingsSection>
        <SettingsGroup>
          <SettingRow
            label={
              connected ? (
                <>
                  Connected to {settings?.settings?.url}
                  {settings?.settings?.config_name && (
                    <span className="ml-1 font-normal text-ui-fg-secondary">
                      ({settings.settings.config_name})
                    </span>
                  )}
                </>
              ) : (
                'Not connected'
              )
            }
            badge={
              isLoading ? (
                <Loader2 size={12} className="animate-spin text-ui-fg-secondary" />
              ) : connected ? (
                <Badge tone="success">Connected</Badge>
              ) : apiServerOnline === false ? (
                <Badge tone="warning">API server offline</Badge>
              ) : (
                <Badge>Off</Badge>
              )
            }
            description={
              connected && settings?.last_sync_at
                ? `Last sync: ${new Date(settings.last_sync_at).toLocaleDateString()}`
                : 'Sync suppliers, products, and BOMs from your Odoo instance'
            }
          >
            {connected && isAdmin && (
              <>
                <Button
                  size="sm"
                  onClick={handleSync}
                  loading={isSyncing}
                  icon={<RefreshCw size={14} />}
                >
                  Sync Suppliers Now
                </Button>
                <Button
                  size="sm"
                  variant="danger-subtle"
                  onClick={() => setShowDisconnectDialog(true)}
                >
                  Disconnect
                </Button>
              </>
            )}
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
            Odoo integration requires the BluePLM API server. Run{' '}
            <code className="rounded bg-ui-bg px-1 font-mono">npm run api</code> locally or
            configure an external API URL in Settings → REST API.
          </Callout>
        )}

        {/* Credential storage misconfigured on the API - actionable by an admin */}
        {setupError && (
          <Callout tone="error" title="API key could not be stored">
            {setupError}
          </Callout>
        )}
      </SettingsSection>

      {apiServerOnline !== false && (
        <SettingsSection
          title={
            <span className="flex items-center gap-2">
              <span>Odoo Connections</span>
              {savedConfigs.length > 0 && <Badge tone="accent">{savedConfigs.length}</Badge>}
            </span>
          }
          actions={
            isAdmin ? (
              <Button size="sm" onClick={openNewConnection} icon={<Plus size={14} />}>
                New Connection
              </Button>
            ) : undefined
          }
        >
          <SettingsGroup>
            {isLoadingConfigs ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 size={16} className="animate-spin text-ui-fg-secondary" />
              </div>
            ) : savedConfigs.length === 0 ? (
              <div className="px-4 py-3 text-[14px] text-ui-fg-secondary">
                No saved connections yet. Click "New Connection" to create one.
              </div>
            ) : (
              <div className="max-h-56 divide-y divide-ui-divider overflow-y-auto">
                {savedConfigs.map((config) => (
                  <div
                    key={config.id}
                    className={`flex items-center gap-3 px-4 py-2.5 ${
                      config.is_active ? 'bg-ui-accent/[0.06]' : ''
                    }`}
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: config.color || '#6b7280' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-medium text-ui-fg">
                          {config.name}
                        </span>
                        {config.is_active && <Badge tone="success">Active</Badge>}
                        {config.is_last_test_successful === true && (
                          <Check size={12} className="text-ui-success flex-shrink-0" />
                        )}
                        {config.is_last_test_successful === false && (
                          <AlertCircle size={12} className="text-ui-danger flex-shrink-0" />
                        )}
                      </div>
                      <div className="truncate text-[13px] text-ui-fg-secondary">
                        {config.url} · {config.database}
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="flex flex-shrink-0 items-center gap-0.5">
                        {config.is_active ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setShowDisconnectDialog(true)}
                            title="Disconnect this connection"
                            aria-label="Disconnect this connection"
                            className="hover:text-ui-danger"
                            icon={<Plug size={14} />}
                          />
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleActivateConfig(config)}
                            loading={activatingConfigId === config.id}
                            title="Activate this connection"
                            aria-label="Activate this connection"
                            icon={<Plug size={14} />}
                          />
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleLoadConfig(config)}
                          title="Load into form"
                          aria-label="Load into form"
                          icon={<FolderOpen size={14} />}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleEditConfig(config)}
                          title="Edit connection"
                          aria-label="Edit connection"
                          icon={<Edit2 size={14} />}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeletingConfig(config)}
                          title="Delete connection"
                          aria-label="Delete connection"
                          className="hover:text-ui-danger"
                          icon={<Trash2 size={14} />}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SettingsGroup>
        </SettingsSection>
      )}

      {/* Quick edit form - only show when connected */}
      {connected && apiServerOnline !== false && (
        <SettingsSection
          title="Active connection"
          actions={
            isAdmin ? (
              <>
                <Button
                  size="sm"
                  onClick={handleTest}
                  disabled={isTesting || !url || !database || !username || !apiKey}
                  loading={isTesting}
                  icon={<Plug size={14} />}
                  title={
                    storedKeyApplies && !apiKey
                      ? 'Testing sends the key from this form. Use Save & Test to test the saved key.'
                      : undefined
                  }
                >
                  Test
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleSave(true)}
                  disabled={cannotSave}
                  loading={isSaving}
                  icon={<Check size={14} />}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => handleSave(false)}
                  disabled={cannotSave}
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
              label="Odoo URL"
              htmlFor="odoo-url"
              description="https:// will be added automatically if not provided"
              stacked
            >
              <TextInput
                id="odoo-url"
                type="text"
                value={url}
                onChange={(e) => isAdmin && setUrl(e.target.value)}
                placeholder="https://mycompany.odoo.com or erp.mycompany.com"
                readOnly={!isAdmin}
                className="font-mono"
              />
            </SettingRow>
            <SettingRow
              label="Database"
              htmlFor="odoo-database"
              description="Find at: your-odoo-url/web/database/manager"
              stacked
            >
              <TextInput
                id="odoo-database"
                type="text"
                value={database}
                onChange={(e) => isAdmin && setDatabase(e.target.value)}
                placeholder="master or mycompany-main"
                readOnly={!isAdmin}
                className="font-mono"
              />
            </SettingRow>
            <SettingRow label="Username (Email)" htmlFor="odoo-username" stacked>
              <TextInput
                id="odoo-username"
                type="email"
                value={username}
                onChange={(e) => isAdmin && setUsername(e.target.value)}
                placeholder="admin@mycompany.com"
                readOnly={!isAdmin}
              />
            </SettingRow>
            <SettingRow
              label="API Key"
              htmlFor="odoo-api-key"
              stacked
              description={
                storedKeyApplies
                  ? 'A key is saved for this connection. Leave this blank to keep it, or enter a new one to replace it.'
                  : hasStoredKey
                    ? 'The saved key belongs to the previous connection. Enter the key for this one.'
                    : 'Generate at: Odoo → Settings → Users → [Your User] → API Keys'
              }
            >
              <div className="relative">
                <TextInput
                  id="odoo-api-key"
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => isAdmin && setApiKey(e.target.value)}
                  placeholder={storedKeyApplies ? '•••••••• (saved)' : 'Enter API key'}
                  readOnly={!isAdmin}
                  className="pr-9 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ui-fg-secondary hover:text-ui-fg"
                >
                  {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </SettingRow>
          </SettingsGroup>

          {testResult && (
            <Callout tone={testResult.success ? 'success' : 'error'}>{testResult.message}</Callout>
          )}
        </SettingsSection>
      )}

      <a
        href="https://www.odoo.com/documentation/17.0/developer/reference/external_api.html"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-[13px] text-ui-accent hover:underline"
      >
        <ExternalLink size={14} />
        Odoo API Documentation
      </a>

      {showSaveDialog && isAdmin && <OdooConnectionDialog odoo={odoo} />}

      {deletingConfig && (
        <OdooConfirmDialog
          title="Delete Connection"
          confirmLabel="Delete Connection"
          busyLabel="Deleting..."
          busy={isDeletingConfig}
          onConfirm={handleDeleteConfig}
          onCancel={() => setDeletingConfig(null)}
        >
          Are you sure you want to delete <strong>{deletingConfig.name}</strong>? This cannot be
          undone.
        </OdooConfirmDialog>
      )}

      {showDisconnectDialog && (
        <OdooConfirmDialog
          title="Disconnect Odoo"
          confirmLabel="Disconnect"
          busyLabel="Disconnecting..."
          busy={isDisconnecting}
          onConfirm={handleDisconnect}
          onCancel={() => setShowDisconnectDialog(false)}
        >
          Are you sure you want to disconnect Odoo? You will need to reconnect to sync data again.
        </OdooConfirmDialog>
      )}
    </SettingsPage>
  )
}
