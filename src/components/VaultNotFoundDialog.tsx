import { useState } from 'react'
import { AlertTriangle, FolderOpen, Settings, X } from 'lucide-react'

interface VaultNotFoundDialogProps {
  vaultPath: string
  vaultName?: string
  onClose: () => void
  onOpenSettings: () => void
  onBrowseNewPath: () => void
}

export function VaultNotFoundDialog({ 
  vaultPath, 
  vaultName,
  onClose, 
  onOpenSettings,
  onBrowseNewPath 
}: VaultNotFoundDialogProps) {
  const [isExiting, setIsExiting] = useState(false)

  const handleClose = () => {
    setIsExiting(true)
    setTimeout(onClose, 200)
  }

  const handleOpenSettings = () => {
    setIsExiting(true)
    setTimeout(() => {
      onClose()
      onOpenSettings()
    }, 200)
  }

  const handleBrowse = () => {
    setIsExiting(true)
    setTimeout(() => {
      onClose()
      onBrowseNewPath()
    }, 200)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
          isExiting ? 'opacity-0' : 'opacity-100'
        }`}
        onClick={handleClose}
      />
      
      {/* Dialog */}
      <div 
        className={`
          relative bg-pdm-panel border border-pdm-border rounded-lg shadow-2xl 
          w-full max-w-md mx-4 overflow-hidden
          transition-all duration-200
          ${isExiting ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}
        `}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-pdm-border bg-pdm-bg/50">
          <div className="p-2 rounded-full bg-yellow-500/20">
            <AlertTriangle size={20} className="text-yellow-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-pdm-fg">Vault Not Found</h2>
            <p className="text-sm text-pdm-fg-muted">The vault folder could not be located</p>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-md hover:bg-pdm-hover text-pdm-fg-muted hover:text-pdm-fg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4">
          <div className="p-3 rounded-md bg-pdm-bg border border-pdm-border">
            <p className="text-xs text-pdm-fg-muted mb-1">
              {vaultName ? `Vault "${vaultName}" path:` : 'Expected path:'}
            </p>
            <p className="text-sm font-mono text-pdm-fg break-all">{vaultPath}</p>
          </div>
          
          <p className="text-sm text-pdm-fg-muted">
            This vault folder doesn't exist on your computer. This can happen if:
          </p>
          <ul className="text-sm text-pdm-fg-muted space-y-1 ml-4 list-disc">
            <li>The folder was moved or renamed</li>
            <li>You're on a different computer</li>
            <li>The drive is disconnected</li>
          </ul>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 px-5 py-4 bg-pdm-bg/30 border-t border-pdm-border">
          <button
            onClick={handleBrowse}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium
              bg-pdm-accent text-white hover:bg-pdm-accent/90 transition-colors"
          >
            <FolderOpen size={16} />
            Browse for Folder
          </button>
          <button
            onClick={handleOpenSettings}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium
              bg-pdm-hover text-pdm-fg hover:bg-pdm-border transition-colors"
          >
            <Settings size={16} />
            Open Settings
          </button>
          <button
            onClick={handleClose}
            className="ml-auto px-4 py-2 rounded-md text-sm text-pdm-fg-muted hover:text-pdm-fg transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}

