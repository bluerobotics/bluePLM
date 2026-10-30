/**
 * Vault Properties: file, folder and sync counts for a connected vault. Opened from the vault's
 * context menu in the explorer tree.
 */
import { AlertTriangle, Check, Cloud, Database, Lock, Move, Plus, RefreshCw, X } from 'lucide-react'
import { t } from '@/lib/i18n'
import { hasDesktop } from '@/lib/platform'
import type { ConnectedVault, LocalFile } from '@/stores/pdmStore'

interface VaultPropertiesModalProps {
  vault: ConnectedVault
  files: LocalFile[]
  userId: string | undefined
  onClose: () => void
}

export function VaultPropertiesModal({ vault, files, userId, onClose }: VaultPropertiesModalProps) {
  return (
    <div
      data-native-preview-overlay="modal"
      className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-plm-bg-light border border-plm-border rounded-xl shadow-2xl w-[500px] max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-plm-border bg-plm-bg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-plm-accent/20 rounded-lg vault-icon-bg">
              <Database size={20} className="vault-icon text-plm-accent" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-plm-fg">{vault.name}</h3>
              <p className="text-xs text-plm-fg-muted">Vault Properties</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-plm-bg-light rounded text-plm-fg-muted hover:text-plm-fg"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-auto max-h-[60vh]">
          {/* BluePLM Web has no local folder, only the vault's virtual path. */}
          {hasDesktop() && (
            <div className="p-3 bg-plm-bg rounded-lg border border-plm-border">
              <div className="text-xs text-plm-fg-muted uppercase tracking-wide mb-1">
                Local Path
              </div>
              <div className="text-sm text-plm-fg break-all font-mono">
                {vault.localPath || 'Not connected locally'}
              </div>
            </div>
          )}

          {(() => {
            const vaultFiles = files.filter((f) => !f.isDirectory)
            const vaultFolders = files.filter((f) => f.isDirectory)
            const syncedFiles = vaultFiles.filter((f) => !f.diffStatus)
            const modifiedFiles = vaultFiles.filter((f) => f.diffStatus === 'modified')
            // 'moved_away' stubs are excluded - each is a shadow of the 'moved' row for
            // the same file at its new location, not a second file to report.
            const movedFiles = vaultFiles.filter((f) => f.diffStatus === 'moved')
            const addedFiles = vaultFiles.filter((f) => f.diffStatus === 'added')
            const cloudFiles = vaultFiles.filter((f) => f.diffStatus === 'cloud')
            const conflictFiles = vaultFiles.filter((f) => f.diffStatus === 'outdated')
            const checkedOutByMe = vaultFiles.filter(
              (f) => f.pdmData?.checked_out_by === userId,
            )
            const checkedOutByOthersVault = vaultFiles.filter(
              (f) => f.pdmData?.checked_out_by && f.pdmData.checked_out_by !== userId,
            )

            const totalLocalSize = vaultFiles
              .filter((f) => f.diffStatus !== 'cloud')
              .reduce((sum, f) => sum + (f.size || 0), 0)

            const formatSize = (bytes: number) => {
              if (bytes === 0) return '0 B'
              if (bytes >= 1024 * 1024 * 1024)
                return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
              if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
              if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`
              return `${bytes} B`
            }

            return (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-plm-bg rounded-lg border border-plm-border text-center">
                    <div className="text-2xl font-bold text-plm-fg">{vaultFiles.length}</div>
                    <div className="text-xs text-plm-fg-muted">Files</div>
                  </div>
                  <div className="p-3 bg-plm-bg rounded-lg border border-plm-border text-center">
                    <div className="text-2xl font-bold text-plm-fg">
                      {vaultFolders.length}
                    </div>
                    <div className="text-xs text-plm-fg-muted">Folders</div>
                  </div>
                  <div className="p-3 bg-plm-bg rounded-lg border border-plm-border text-center">
                    <div className="text-2xl font-bold text-plm-fg">
                      {formatSize(totalLocalSize)}
                    </div>
                    <div className="text-xs text-plm-fg-muted">Local Size</div>
                  </div>
                </div>

                <div className="p-3 bg-plm-bg rounded-lg border border-plm-border">
                  <div className="text-xs text-plm-fg-muted uppercase tracking-wide mb-3">
                    Sync Status
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Check size={14} className="text-plm-success" />
                        <span className="text-sm text-plm-fg">Synced</span>
                      </div>
                      <span className="text-sm font-medium text-plm-fg">
                        {syncedFiles.length}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <RefreshCw size={14} className="text-plm-warning" />
                        <span className="text-sm text-plm-fg">Modified</span>
                      </div>
                      <span className="text-sm font-medium text-plm-fg">
                        {modifiedFiles.length}
                      </span>
                    </div>
                    {movedFiles.length > 0 && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Move size={14} className="text-blue-400" />
                          <span className="text-sm text-plm-fg">
                            {t('diffStatus.moved')}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-plm-fg">
                          {movedFiles.length}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Plus size={14} className="text-plm-accent" />
                        <span className="text-sm text-plm-fg">Local Only</span>
                      </div>
                      <span className="text-sm font-medium text-plm-fg">
                        {addedFiles.length}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Cloud size={14} className="text-plm-fg-muted" />
                        <span className="text-sm text-plm-fg">Cloud Only</span>
                      </div>
                      <span className="text-sm font-medium text-plm-fg">
                        {cloudFiles.length}
                      </span>
                    </div>
                    {conflictFiles.length > 0 && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AlertTriangle size={14} className="text-plm-error" />
                          <span className="text-sm text-plm-fg">Conflicts</span>
                        </div>
                        <span className="text-sm font-medium text-plm-error">
                          {conflictFiles.length}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-plm-bg rounded-lg border border-plm-border">
                  <div className="text-xs text-plm-fg-muted uppercase tracking-wide mb-3">
                    Checkout Status
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Lock size={14} className="text-plm-accent" />
                        <span className="text-sm text-plm-fg">Checked out by you</span>
                      </div>
                      <span className="text-sm font-medium text-plm-fg">
                        {checkedOutByMe.length}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Lock size={14} className="text-plm-warning" />
                        <span className="text-sm text-plm-fg">Checked out by others</span>
                      </div>
                      <span className="text-sm font-medium text-plm-fg">
                        {checkedOutByOthersVault.length}
                      </span>
                    </div>
                  </div>
                </div>

                {(() => {
                  const typeCount = new Map<string, number>()
                  vaultFiles.forEach((f) => {
                    const ext = (f.extension || 'other').toLowerCase()
                    typeCount.set(ext, (typeCount.get(ext) || 0) + 1)
                  })

                  const sortedTypes = [...typeCount.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10)

                  if (sortedTypes.length === 0) return null

                  return (
                    <div className="p-3 bg-plm-bg rounded-lg border border-plm-border">
                      <div className="text-xs text-plm-fg-muted uppercase tracking-wide mb-3">
                        File Types
                      </div>
                      <div className="space-y-1.5">
                        {sortedTypes.map(([ext, count]) => (
                          <div key={ext} className="flex items-center justify-between">
                            <span className="text-sm text-plm-fg">.{ext}</span>
                            <span className="text-sm text-plm-fg-muted">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </>
            )
          })()}
        </div>

        <div className="p-4 border-t border-plm-border bg-plm-bg flex justify-end">
          <button onClick={onClose} className="btn btn-ghost">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
