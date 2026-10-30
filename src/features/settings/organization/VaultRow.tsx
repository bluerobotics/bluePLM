import {
  Check,
  Eraser,
  FolderOpen,
  FolderX,
  Link,
  Pencil,
  Star,
  Trash2,
  Unlink,
  X,
} from 'lucide-react'

import { Badge, Button, TextInput } from '@/components/core/ui'
import { hasDesktop } from '@/lib/platform'

import type { Vault, VaultsManager } from './useVaultsManager'

interface VaultRowProps {
  vault: Vault
  manager: VaultsManager
}

/** One vault in the Vaults list: name, local folder, connection state and its actions. */
export function VaultRow({ vault, manager }: VaultRowProps) {
  const {
    isAdmin,
    renamingVaultId,
    setRenamingVaultId,
    renameValue,
    setRenameValue,
    startRename,
    handleRenameVault,
    handleSetDefaultVault,
    connectingVaultId,
    handleConnectVault,
    isVaultConnected,
    localPathOf,
    handleDisconnectVault,
    startWipe,
    startClear,
    startDelete,
  } = manager

  const connected = isVaultConnected(vault.id)
  const localPath = connected && hasDesktop() ? localPathOf(vault.id) : undefined
  const isRenaming = renamingVaultId === vault.id

  return (
    <div className="flex items-center gap-3 py-3.5">
      <div className="min-w-0 flex-1">
        {isRenaming ? (
          <div className="flex items-center gap-1.5">
            <TextInput
              size="sm"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameVault(vault)
                if (e.key === 'Escape') setRenamingVaultId(null)
              }}
              className="flex-1"
              autoFocus
            />
            <Button
              variant="ghost"
              size="sm"
              icon={<Check size={14} className="text-ui-success" />}
              onClick={() => handleRenameVault(vault)}
              aria-label="Save name"
            />
            <Button
              variant="ghost"
              size="sm"
              icon={<X size={14} />}
              onClick={() => setRenamingVaultId(null)}
              aria-label="Cancel rename"
            />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="truncate text-[14px] text-ui-fg">{vault.name}</span>
              {vault.is_default && <Badge>Default</Badge>}
              {connected ? <Badge tone="success">Connected</Badge> : <Badge>Not connected</Badge>}
            </div>
            {vault.description && (
              <div className="mt-0.5 truncate text-[13px] text-ui-fg-secondary">
                {vault.description}
              </div>
            )}
            {localPath && (
              <div className="truncate text-[13px] text-ui-fg-secondary" title={localPath}>
                {localPath}
              </div>
            )}
          </>
        )}
      </div>
      {!isRenaming && (
        <div className="flex flex-shrink-0 items-center gap-1">
          {/* Show in folder (connected vaults, on the desktop only) */}
          {connected && hasDesktop() && (
            <Button
              variant="ghost"
              size="sm"
              icon={<FolderOpen size={14} />}
              onClick={() => {
                if (localPath) {
                  window.electronAPI?.showInExplorer(localPath)
                }
              }}
              title="Show in folder"
              aria-label="Show in folder"
            />
          )}

          {connected ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                icon={<Unlink size={14} />}
                onClick={() => handleDisconnectVault(vault.id)}
                title="Disconnect vault"
              >
                Disconnect
              </Button>
              {hasDesktop() && (
                <Button
                  variant="danger-subtle"
                  size="sm"
                  icon={<Eraser size={14} />}
                  onClick={() => startWipe(vault)}
                  title="Wipe local files"
                >
                  Wipe Local
                </Button>
              )}
            </>
          ) : (
            <Button
              size="sm"
              icon={<Link size={14} />}
              loading={connectingVaultId === vault.id}
              onClick={() => handleConnectVault(vault)}
            >
              Connect
            </Button>
          )}

          {isAdmin && (
            <div className="ml-1 flex items-center gap-0.5 border-l border-ui-divider pl-2">
              <Button
                variant="ghost"
                size="sm"
                icon={<Pencil size={14} />}
                onClick={() => startRename(vault)}
                title="Rename vault"
                aria-label="Rename vault"
              />
              {!vault.is_default && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Star size={14} />}
                  onClick={() => handleSetDefaultVault(vault.id)}
                  title="Set as default"
                  aria-label="Set as default"
                />
              )}
              <Button
                variant="ghost"
                size="sm"
                icon={<FolderX size={14} />}
                onClick={() => startClear(vault)}
                title="Clear vault contents"
                aria-label="Clear vault contents"
              />
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 size={14} />}
                onClick={() => startDelete(vault)}
                title="Delete vault"
                aria-label="Delete vault"
                className="!text-ui-danger"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
