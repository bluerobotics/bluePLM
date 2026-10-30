import { LogViewerInline } from '@/features/dev-tools/logs'

/** A 'full' layout page: fills the height SettingsContent gives it; the viewer scrolls its own list. */
export function LogsSettings() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <LogViewerInline />
    </div>
  )
}
