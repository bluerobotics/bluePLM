import { Plug, Puzzle } from 'lucide-react'
import { usePDMStore } from '../../stores/pdmStore'

export function WebhooksSettings() {
  const { user } = usePDMStore()

  if (user?.role !== 'admin') {
    return (
      <div className="text-center py-12">
        <Puzzle size={40} className="mx-auto mb-4 text-plm-fg-muted opacity-50" />
        <p className="text-base text-plm-fg-muted">
          Only administrators can manage webhook settings.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-lg bg-plm-sidebar flex items-center justify-center">
          <Plug size={24} className="text-plm-fg-muted" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-medium text-plm-fg">Webhooks</h3>
          <p className="text-sm text-plm-fg-muted">
            Custom integrations via HTTP webhooks
          </p>
        </div>
        <span className="px-2 py-1 text-xs font-medium bg-plm-fg-muted/20 text-plm-fg-muted rounded">
          COMING SOON
        </span>
      </div>
      
      <div className="p-4 bg-plm-bg rounded-lg border border-plm-border">
        <p className="text-sm text-plm-fg-muted">
          Webhooks will allow you to:
        </p>
        <ul className="mt-2 text-sm text-plm-fg-muted list-disc list-inside space-y-1">
          <li>Trigger external workflows on file events</li>
          <li>Send data to your custom endpoints</li>
          <li>Integrate with any HTTP-compatible service</li>
        </ul>
      </div>
    </div>
  )
}

