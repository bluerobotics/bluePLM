/**
 * InstallDialog - Extension installation dialog with permissions review
 * 
 * Shows:
 * - Extension information
 * - Required permissions (client & server)
 * - Installation progress
 * - Success/error state
 */
import { useState, useEffect, useMemo } from 'react'
import {
  X, Download, CheckCircle2, XCircle, AlertTriangle,
  Monitor, Database
} from 'lucide-react'
import { VerificationBadge, NativeBadge } from './VerificationBadge'
import { usePDMStore } from '@/stores/pdmStore'

interface InstallDialogProps {
  extensionId: string | null
  open: boolean
  onClose: () => void
}

type InstallState = 'review' | 'installing' | 'success' | 'error'

// Permission icons and descriptions (for future use when parsing manifest permissions)
// Kept as reference for the permission types available
// const PERMISSION_CONFIG = {
//   client: {
//     'ui:toast': { icon: MessageSquare, label: 'Show toasts' },
//     'storage:local': { icon: Database, label: 'Local storage' },
//     'network:fetch': { icon: Globe, label: 'Network access' },
//   },
//   server: {
//     'storage:database': { icon: Database, label: 'Database' },
//     'secrets:read': { icon: Lock, label: 'Read secrets' },
//   }
// }

export function InstallDialog({
  extensionId,
  open,
  onClose,
}: InstallDialogProps) {
  const [installState, setInstallState] = useState<InstallState>('review')
  const [error, setError] = useState<string | null>(null)
  const [permissionsAccepted, setPermissionsAccepted] = useState(false)
  
  const storeExtensions = usePDMStore(s => s.storeExtensions)
  const installProgress = usePDMStore(s => s.installProgress)
  const installExtension = usePDMStore(s => s.installExtension)
  const addToast = usePDMStore(s => s.addToast)

  // Find the store extension
  const storeExt = useMemo(() => {
    if (!extensionId) return null
    return storeExtensions.find(e => e.extensionId === extensionId)
  }, [extensionId, storeExtensions])

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setInstallState('review')
      setError(null)
      setPermissionsAccepted(false)
    }
  }, [open, extensionId])

  // Handle installation
  const handleInstall = async () => {
    if (!extensionId) return
    
    setInstallState('installing')
    setError(null)
    
    try {
      const result = await installExtension(extensionId)
      
      if (result.success) {
        setInstallState('success')
        addToast('success', `${storeExt?.name || extensionId} installed successfully`)
      } else {
        setError(result.error || 'Installation failed')
        setInstallState('error')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Installation failed')
      setInstallState('error')
    }
  }

  if (!open || !extensionId) return null

  const name = storeExt?.name || extensionId
  const isNative = storeExt?.category === 'native'
  const isVerified = storeExt?.verified
  const verification = isVerified ? 'verified' : 'community'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="w-full max-w-md bg-gray-900 rounded-xl shadow-2xl border border-gray-700 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-800">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-200 
              hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
          
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-gray-800 flex items-center justify-center">
              {storeExt?.iconUrl ? (
                <img src={storeExt.iconUrl} alt="" className="w-full h-full object-cover rounded-lg" />
              ) : (
                <Download size={24} className="text-blue-400" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-100">Install Extension</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-sm text-gray-400">{name}</span>
                <VerificationBadge status={verification} size="sm" />
                {isNative && <NativeBadge size="sm" />}
              </div>
            </div>
          </div>
        </div>
        
        {/* Content */}
        <div className="p-6">
          {/* Review state */}
          {installState === 'review' && (
            <>
              {/* Native warning */}
              {isNative && (
                <div className="mb-4 p-3 rounded-lg bg-purple-500/10 border border-purple-500/30">
                  <div className="flex items-center gap-2 text-purple-400 font-medium mb-1">
                    <AlertTriangle size={16} />
                    Native Extension
                  </div>
                  <p className="text-sm text-purple-300">
                    This extension runs with full system access. Only install from trusted sources.
                  </p>
                </div>
              )}
              
              {/* Permissions section */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  This extension requires:
                </h3>
                <div className="space-y-2">
                  {/* Placeholder permissions - in real implementation, parse from manifest */}
                  <div className="flex items-center gap-3 p-2 rounded bg-gray-800/50">
                    <Monitor size={16} className="text-blue-400" />
                    <div>
                      <div className="text-sm text-gray-200">UI Access</div>
                      <div className="text-xs text-gray-500">Show notifications and dialogs</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded bg-gray-800/50">
                    <Database size={16} className="text-green-400" />
                    <div>
                      <div className="text-sm text-gray-200">Local Storage</div>
                      <div className="text-xs text-gray-500">Store extension data locally</div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Checkbox */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={permissionsAccepted}
                  onChange={e => setPermissionsAccepted(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-600 
                    focus:ring-blue-500 focus:ring-offset-gray-900"
                />
                <span className="text-sm text-gray-300">
                  I understand and accept the permissions requested by this extension
                </span>
              </label>
            </>
          )}
          
          {/* Installing state */}
          {installState === 'installing' && (
            <div className="py-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-500/20 flex items-center justify-center">
                <Download size={32} className="text-blue-400 animate-bounce" />
              </div>
              <h3 className="text-lg font-semibold text-gray-100 mb-2">Installing...</h3>
              <p className="text-sm text-gray-400">
                {installProgress?.message || 'Please wait...'}
              </p>
              {installProgress && (
                <div className="mt-4 w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${installProgress.percent}%` }}
                  />
                </div>
              )}
            </div>
          )}
          
          {/* Success state */}
          {installState === 'success' && (
            <div className="py-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle2 size={32} className="text-green-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-100 mb-2">Installed Successfully</h3>
              <p className="text-sm text-gray-400">
                {name} is now ready to use.
              </p>
            </div>
          )}
          
          {/* Error state */}
          {installState === 'error' && (
            <div className="py-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                <XCircle size={32} className="text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-100 mb-2">Installation Failed</h3>
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="p-6 border-t border-gray-800 flex justify-end gap-3">
          {installState === 'review' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleInstall}
                disabled={!permissionsAccepted}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg 
                  transition-colors disabled:opacity-50 disabled:cursor-not-allowed 
                  flex items-center gap-2"
              >
                <Download size={16} />
                Install
              </button>
            </>
          )}
          
          {installState === 'installing' && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-gray-200 transition-colors"
            >
              Run in background
            </button>
          )}
          
          {(installState === 'success' || installState === 'error') && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
