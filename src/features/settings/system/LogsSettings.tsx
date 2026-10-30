import { LogViewerInline } from '@/features/dev-tools/logs'

/** A 'full' layout page: fills the height SettingsContent gives it; the viewer scrolls its own list. */
export function LogsSettings() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <h3 className="pb-3 text-[16px] font-semibold leading-6 text-ui-fg">Logs</h3>
      <div className="min-h-0 flex-1">
        <LogViewerInline />
      </div>
    </div>
  )
}
