import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Edit2,
  RotateCcw,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react'

import { Badge, Button, Switch } from '@/components/core/ui'
import type { Webhook, WebhookDelivery } from '@/types/database'

interface WebhookRowProps {
  webhook: Webhook
  expanded: boolean
  /** Loaded for the expanded webhook only. */
  deliveries: WebhookDelivery[]
  testing: boolean
  onToggleExpanded: () => void
  onTest: () => void
  onToggleActive: () => void
  onEdit: () => void
  onDelete: () => void
}

/** One webhook in the list: its endpoint, events, counters, actions and recent deliveries. */
export function WebhookRow({
  webhook,
  expanded,
  deliveries,
  testing,
  onToggleExpanded,
  onTest,
  onToggleActive,
  onEdit,
  onDelete,
}: WebhookRowProps) {
  return (
    <div>
      <div className="px-4 py-3.5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 flex-shrink-0 rounded-full ${
                  webhook.is_active ? 'bg-plm-success' : 'bg-plm-fg-muted'
                }`}
                aria-hidden
              />
              <span className="truncate text-[13px] font-medium text-plm-fg">{webhook.name}</span>
              {!webhook.is_active && <Badge>Disabled</Badge>}
            </div>
            {webhook.description && (
              <p className="truncate text-[12px] text-plm-fg-muted">{webhook.description}</p>
            )}
            <code className="block truncate font-mono text-[12px] text-plm-fg-dim">
              {webhook.url}
            </code>
            <div className="mt-1.5 flex items-center gap-4 text-[12px] text-plm-fg-muted">
              <span className="flex items-center gap-1">
                <CheckCircle2 size={12} className="text-plm-success" />
                {webhook.success_count} delivered
              </span>
              <span className="flex items-center gap-1">
                <XCircle size={12} className="text-plm-error" />
                {webhook.failure_count} failed
              </span>
              {webhook.last_triggered_at && (
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  Last: {new Date(webhook.last_triggered_at).toLocaleString()}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={onTest}
              loading={testing}
              title="Test webhook"
              aria-label="Test webhook"
              icon={<Send size={14} />}
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={onEdit}
              title="Edit"
              aria-label="Edit"
              icon={<Edit2 size={14} />}
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={onDelete}
              title="Delete"
              aria-label="Delete"
              className="hover:text-plm-error"
              icon={<Trash2 size={14} />}
            />
            <Switch
              size="sm"
              checked={webhook.is_active}
              onChange={onToggleActive}
              title={webhook.is_active ? 'Disable webhook' : 'Enable webhook'}
              aria-label={webhook.is_active ? 'Disable webhook' : 'Enable webhook'}
            />
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1">
          {webhook.events.map((event) => (
            <Badge key={event} tone="accent" className="font-mono">
              {event}
            </Badge>
          ))}
        </div>

        {webhook.trigger_filter && webhook.trigger_filter !== 'everyone' && (
          <div className="mt-2 text-[12px] text-plm-fg-muted">
            <span className="text-plm-fg-dim">Triggered by: </span>
            {webhook.trigger_filter === 'roles' && (
              <span className="text-plm-fg">
                {webhook.trigger_roles
                  ?.map((r) => r.charAt(0).toUpperCase() + r.slice(1))
                  .join(', ') || 'No roles selected'}
              </span>
            )}
            {webhook.trigger_filter === 'users' && (
              <span className="text-plm-fg">
                {webhook.trigger_user_ids?.length || 0} selected user
                {(webhook.trigger_user_ids?.length || 0) !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onToggleExpanded}
          className="mt-2 flex items-center gap-1 text-[12px] text-plm-fg-muted hover:text-plm-fg"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          Recent Deliveries
        </button>
      </div>

      {expanded && (
        <div className="border-t border-plm-border bg-plm-bg/40">
          {deliveries.length === 0 ? (
            <div className="px-4 py-3 text-[12px] text-plm-fg-muted">No deliveries yet</div>
          ) : (
            <div className="max-h-64 divide-y divide-plm-border overflow-y-auto">
              {deliveries.map((delivery) => (
                <div key={delivery.id} className="flex items-center gap-3 px-4 py-2 text-[12px]">
                  <span className="flex-shrink-0">
                    {delivery.status === 'success' && (
                      <CheckCircle2 size={14} className="text-plm-success" />
                    )}
                    {delivery.status === 'failed' && (
                      <XCircle size={14} className="text-plm-error" />
                    )}
                    {delivery.status === 'retrying' && (
                      <RotateCcw size={14} className="text-plm-warning" />
                    )}
                    {delivery.status === 'pending' && (
                      <Clock size={14} className="text-plm-fg-muted" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-plm-accent">{delivery.event_type}</code>
                      {delivery.response_status && (
                        <span
                          className={
                            delivery.response_status >= 200 && delivery.response_status < 300
                              ? 'text-plm-success'
                              : 'text-plm-error'
                          }
                        >
                          {delivery.response_status}
                        </span>
                      )}
                    </div>
                    {delivery.last_error && (
                      <p className="truncate text-plm-error">{delivery.last_error}</p>
                    )}
                  </div>
                  <div className="whitespace-nowrap text-plm-fg-dim">
                    {delivery.created_at
                      ? new Date(delivery.created_at).toLocaleString()
                      : 'unknown'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
