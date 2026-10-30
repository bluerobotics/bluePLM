import { Loader2, Plus } from 'lucide-react'

import { Badge, Button, Callout } from '@/components/core/ui'
import { SettingsGroup, SettingsPage, SettingsSection } from '@/features/settings/components/ui'

import { WebhookForm } from './webhooks/WebhookForm'
import { WebhookRow } from './webhooks/WebhookRow'
import { useWebhooks } from './webhooks/useWebhooks'

const PAYLOAD_EXAMPLE = `{
  "event": "file.checked_in",
  "timestamp": "2024-01-15T10:30:00Z",
  "organization": {
    "id": "org_...",
    "name": "Acme Corp"
  },
  "data": {
    "file_id": "file_...",
    "file_name": "bracket.sldprt",
    "file_path": "/Parts/bracket.sldprt",
    "revision": "B",
    "version": 3,
    "user": {
      "id": "user_...",
      "email": "engineer@acme.com"
    }
  }
}`

export function WebhooksSettings() {
  const state = useWebhooks()
  const {
    isAdmin,
    webhooks,
    deliveries,
    loading,
    showForm,
    expandedWebhook,
    setExpandedWebhook,
    testingWebhook,
    deletingWebhook,
    setDeletingWebhook,
    isDeleting,
    handleEdit,
    handleDelete,
    handleToggleActive,
    handleTestWebhook,
    openNewForm,
  } = state

  if (!isAdmin) {
    return <Callout tone="info">Only administrators can manage webhook settings.</Callout>
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-ui-fg-secondary" />
      </div>
    )
  }

  const activeCount = webhooks.filter((w) => w.is_active).length

  return (
    <SettingsPage>
      {showForm && <WebhookForm webhooks={state} />}

      <SettingsSection
        title={
          <span className="flex items-center gap-2">
            <span>Endpoints</span>
            {webhooks.length > 0 && (
              <Badge tone={activeCount > 0 ? 'success' : 'neutral'}>
                {activeCount}/{webhooks.length} active
              </Badge>
            )}
          </span>
        }
        description="Notify external services when events occur"
        actions={
          !showForm ? (
            <Button size="sm" variant="primary" onClick={openNewForm} icon={<Plus size={14} />}>
              Add Webhook
            </Button>
          ) : undefined
        }
      >
        {webhooks.length === 0 ? (
          !showForm && (
            <SettingsGroup>
              <div className="px-4 py-3 text-[14px] text-ui-fg-secondary">
                No webhooks configured. Add a webhook to notify external services when events
                occur.
              </div>
            </SettingsGroup>
          )
        ) : (
          <SettingsGroup>
            {webhooks.map((webhook) => (
              <WebhookRow
                key={webhook.id}
                webhook={webhook}
                expanded={expandedWebhook === webhook.id}
                deliveries={expandedWebhook === webhook.id ? deliveries : []}
                testing={testingWebhook === webhook.id}
                onToggleExpanded={() =>
                  setExpandedWebhook(expandedWebhook === webhook.id ? null : webhook.id)
                }
                onTest={() => handleTestWebhook(webhook)}
                onToggleActive={() => handleToggleActive(webhook)}
                onEdit={() => handleEdit(webhook)}
                onDelete={() => setDeletingWebhook(webhook)}
              />
            ))}
          </SettingsGroup>
        )}
      </SettingsSection>

      <SettingsSection
        title="Webhook Payload"
        description={
          <>
            Payloads are signed with HMAC-SHA256. Verify the signature using the{' '}
            <code className="text-ui-accent">X-BluePLM-Signature</code> header.
          </>
        }
      >
        <pre className="overflow-x-auto rounded-lg border border-ui-divider bg-ui-field/60 p-3 font-mono text-[13px] text-ui-fg">
          {PAYLOAD_EXAMPLE}
        </pre>
      </SettingsSection>

      {deletingWebhook && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
          onClick={() => setDeletingWebhook(null)}
        >
          <div
            className="bg-ui-field border border-ui-divider rounded-xl p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[15px] font-semibold text-ui-fg mb-3">Delete Webhook</h3>
            <p className="text-[14px] text-ui-fg-secondary mb-5">
              Are you sure you want to delete <strong>{deletingWebhook.name}</strong>? This cannot
              be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setDeletingWebhook(null)} disabled={isDeleting}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? 'Deleting...' : 'Delete Webhook'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </SettingsPage>
  )
}
