import { Check, Eye, EyeOff, Plug, Save, X } from 'lucide-react'

import { Button, Callout, TextInput } from '@/components/core/ui'

import { CONFIG_COLORS } from './odooTypes'
import type { OdooSettingsState } from './useOdooSettings'

const LABEL = 'text-[13px] font-medium text-ui-fg'

/** The "New / Edit Odoo connection" dialog: names a connection and holds its credentials. */
export function OdooConnectionDialog({ odoo }: { odoo: OdooSettingsState }) {
  const {
    editingConfig,
    configName,
    setConfigName,
    configDescription,
    setConfigDescription,
    configColor,
    setConfigColor,
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
    setupError,
    testResult,
    isTesting,
    isSavingConfig,
    handleTest,
    handleSaveConfig,
    closeSaveDialog,
  } = odoo

  const cannotSave =
    isSavingConfig ||
    !configName.trim() ||
    !url ||
    !database ||
    !username ||
    (!apiKey && apiKeyRequired)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-ui-bg border border-ui-divider rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-ui-divider sticky top-0 bg-ui-bg">
          <h3 className="text-[14px] font-semibold text-ui-fg">
            {editingConfig ? 'Edit Connection' : 'New Odoo Connection'}
          </h3>
          <Button
            size="sm"
            variant="ghost"
            onClick={closeSaveDialog}
            aria-label="Close"
            icon={<X size={14} />}
          />
        </div>

        <div className="p-4 space-y-4">
          {/* Name & Color row */}
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <label htmlFor="odoo-config-name" className={LABEL}>
                Connection Name *
              </label>
              <TextInput
                id="odoo-config-name"
                type="text"
                value={configName}
                onChange={(e) => setConfigName(e.target.value)}
                placeholder="e.g., Production, Dev Server"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <div className={LABEL}>Color</div>
              <div className="flex flex-wrap gap-1 max-w-[140px]">
                {CONFIG_COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() => setConfigColor(color.value)}
                    className={`w-6 h-6 rounded flex items-center justify-center transition-all ${
                      configColor === color.value
                        ? 'ring-2 ring-offset-1 ring-offset-ui-bg ring-ui-accent'
                        : 'hover:opacity-80'
                    }`}
                    style={{ backgroundColor: color.value }}
                    title={color.name}
                    aria-label={color.name}
                  >
                    {configColor === color.value && <Check size={10} className="text-white" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label htmlFor="odoo-config-description" className={LABEL}>
              Description (optional)
            </label>
            <TextInput
              id="odoo-config-description"
              type="text"
              value={configDescription}
              onChange={(e) => setConfigDescription(e.target.value)}
              placeholder="e.g., Main production Odoo instance"
            />
          </div>

          <div className="h-px bg-ui-divider" />

          <div className="text-[14px] font-medium text-ui-fg">Connection details</div>

          <div className="space-y-1.5">
            <label htmlFor="odoo-config-url" className={LABEL}>
              Odoo URL *
            </label>
            <TextInput
              id="odoo-config-url"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://mycompany.odoo.com"
              className="font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="odoo-config-database" className={LABEL}>
              Database *
            </label>
            <TextInput
              id="odoo-config-database"
              type="text"
              value={database}
              onChange={(e) => setDatabase(e.target.value)}
              placeholder="master or mycompany-main"
              className="font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="odoo-config-username" className={LABEL}>
              Username (Email) *
            </label>
            <TextInput
              id="odoo-config-username"
              type="email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin@mycompany.com"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="odoo-config-api-key" className={LABEL}>
              API Key {apiKeyRequired ? '*' : ''}
            </label>
            <div className="relative">
              <TextInput
                id="odoo-config-api-key"
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={storedKeyApplies ? '•••••••• (saved)' : 'Enter API key'}
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
            <p className="text-[13px] text-ui-fg-secondary">
              {storedKeyApplies
                ? 'A key is saved for this connection. Leave this blank to keep it.'
                : hasStoredKey
                  ? 'The saved key belongs to the previous connection. Enter the key for this one.'
                  : 'Generate at: Odoo → Settings → Users → [Your User] → API Keys'}
            </p>
          </div>

          {/* Credential storage misconfigured on the API */}
          {setupError && <Callout tone="error">{setupError}</Callout>}

          {testResult && (
            <Callout tone={testResult.success ? 'success' : 'error'}>{testResult.message}</Callout>
          )}
        </div>

        <div className="flex justify-between gap-2 px-4 py-3 border-t border-ui-divider bg-ui-bg sticky bottom-0">
          <Button
            onClick={handleTest}
            disabled={isTesting || !url || !database || !username || !apiKey}
            loading={isTesting}
            icon={<Plug size={14} />}
            title={
              storedKeyApplies && !apiKey
                ? 'Testing sends the key from this form. Save & Connect tests the saved key.'
                : undefined
            }
          >
            Test Connection
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={closeSaveDialog}>
              Cancel
            </Button>
            <Button
              onClick={() => handleSaveConfig(false)}
              disabled={cannotSave}
              loading={isSavingConfig}
              icon={<Save size={14} />}
            >
              {editingConfig ? 'Update' : 'Save'}
            </Button>
            <Button
              variant="primary"
              onClick={() => handleSaveConfig(true)}
              disabled={cannotSave}
              loading={isSavingConfig}
              icon={<Plug size={14} />}
            >
              {editingConfig ? 'Update & Connect' : 'Save & Connect'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
