import type { ReactNode } from 'react'
import { AlertTriangle, Eraser, FolderX, Unlink } from 'lucide-react'

import { Button, TextInput } from '@/components/core/ui'

import type { VaultsManager } from './useVaultsManager'

interface ConfirmShellProps {
  icon: ReactNode
  iconTone: 'error' | 'warning'
  title: string
  onClose: () => void
  children: ReactNode
  footer: ReactNode
}

/** The overlay and card every vault confirm dialog shares. */
function ConfirmShell({ icon, iconTone, title, onClose, children, footer }: ConfirmShellProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-md rounded-xl border border-ui-border bg-ui-bg p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-3">
          <div
            className={`rounded-full p-2 ${
              iconTone === 'error'
                ? 'bg-ui-danger/15 text-ui-danger'
                : 'bg-ui-warning/15 text-ui-warning'
            }`}
          >
            {icon}
          </div>
          <h3 className="text-[16px] font-semibold text-ui-fg">{title}</h3>
        </div>
        {children}
        <div className="flex justify-end gap-2">{footer}</div>
      </div>
    </div>
  )
}

interface TypeToConfirmProps {
  name: string
  value: string
  onChange: (value: string) => void
  value2: string
  onChange2: (value: string) => void
}

/** Two fields that must both equal the vault's name before a destructive action unlocks. */
function TypeToConfirm({ name, value, onChange, value2, onChange2 }: TypeToConfirmProps) {
  return (
    <div className="mb-4 space-y-3">
      <div className="space-y-1.5">
        <label className="text-[14px] text-ui-fg">
          Type <strong>"{name}"</strong> to confirm:
        </label>
        <TextInput
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={name}
          className={value === name ? '!border-ui-success' : ''}
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-[14px] text-ui-fg">Type it again to double confirm:</label>
        <TextInput
          value={value2}
          onChange={(e) => onChange2(e.target.value)}
          placeholder={name}
          disabled={value !== name}
          className={value2 === name ? '!border-ui-success' : ''}
        />
      </div>
    </div>
  )
}

/** Delete, clear, disconnect and wipe confirmations of the Vaults page. */
export function VaultDialogs({ manager }: { manager: VaultsManager }) {
  const {
    deletingVault,
    deleteConfirmText,
    setDeleteConfirmText,
    deleteConfirmText2,
    setDeleteConfirmText2,
    isDeleting,
    cancelDelete,
    handleDeleteVault,
    clearingVault,
    clearConfirmText,
    setClearConfirmText,
    clearConfirmText2,
    setClearConfirmText2,
    isClearing,
    cancelClear,
    handleClearVault,
    disconnectingVault,
    setDisconnectingVault,
    isDisconnecting,
    confirmDisconnect,
    wipingVault,
    setWipingVault,
    isWiping,
    handleWipeLocalFiles,
  } = manager

  return (
    <>
      {deletingVault && (
        <ConfirmShell
          icon={<AlertTriangle size={20} />}
          iconTone="error"
          title="Delete Vault"
          onClose={cancelDelete}
          footer={
            <>
              <Button variant="ghost" onClick={cancelDelete}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleDeleteVault}
                disabled={
                  deleteConfirmText !== deletingVault.name ||
                  deleteConfirmText2 !== deletingVault.name ||
                  isDeleting
                }
              >
                {isDeleting ? 'Deleting...' : 'Delete Vault'}
              </Button>
            </>
          }
        >
          <p className="mb-4 text-[14px] text-ui-fg-secondary">
            This will permanently delete the vault <strong>"{deletingVault.name}"</strong> and all
            its files from the cloud. This action cannot be undone.
          </p>
          <TypeToConfirm
            name={deletingVault.name}
            value={deleteConfirmText}
            onChange={setDeleteConfirmText}
            value2={deleteConfirmText2}
            onChange2={setDeleteConfirmText2}
          />
        </ConfirmShell>
      )}

      {clearingVault && (
        <ConfirmShell
          icon={<FolderX size={20} />}
          iconTone="warning"
          title="Clear Vault Contents"
          onClose={cancelClear}
          footer={
            <>
              <Button variant="ghost" onClick={cancelClear}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleClearVault}
                disabled={
                  clearConfirmText !== clearingVault.name ||
                  clearConfirmText2 !== clearingVault.name ||
                  isClearing
                }
              >
                {isClearing ? 'Clearing...' : 'Clear Vault Contents'}
              </Button>
            </>
          }
        >
          <p className="mb-2 text-[14px] text-ui-fg-secondary">
            This will permanently delete all files and file history from{' '}
            <strong>"{clearingVault.name}"</strong>.
          </p>
          <ul className="mb-4 list-inside list-disc space-y-1 text-[13px] text-ui-fg">
            <li>All files will be removed from the cloud</li>
            <li>All file history and versions will be deleted</li>
            <li>Local files will be cleared</li>
            <li>The vault itself will remain intact</li>
          </ul>
          <TypeToConfirm
            name={clearingVault.name}
            value={clearConfirmText}
            onChange={setClearConfirmText}
            value2={clearConfirmText2}
            onChange2={setClearConfirmText2}
          />
        </ConfirmShell>
      )}

      {disconnectingVault && (
        <ConfirmShell
          icon={<Unlink size={20} />}
          iconTone="warning"
          title="Disconnect Vault"
          onClose={() => setDisconnectingVault(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDisconnectingVault(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={confirmDisconnect} disabled={isDisconnecting}>
                {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
              </Button>
            </>
          }
        >
          <p className="mb-4 text-[14px] text-ui-fg-secondary">
            This will remove <strong>"{disconnectingVault.name}"</strong> from BluePLM. Local files
            will be preserved and can be reconnected later.
          </p>
        </ConfirmShell>
      )}

      {wipingVault && (
        <ConfirmShell
          icon={<Eraser size={20} />}
          iconTone="error"
          title="Wipe Local Files"
          onClose={() => setWipingVault(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setWipingVault(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleWipeLocalFiles} disabled={isWiping}>
                {isWiping ? 'Wiping...' : 'Wipe Local Files'}
              </Button>
            </>
          }
        >
          <p className="mb-4 text-[14px] text-ui-fg-secondary">
            This will delete all local files for <strong>"{wipingVault.name}"</strong>. Cloud files
            will not be affected and can be re-synced.
          </p>
        </ConfirmShell>
      )}
    </>
  )
}
