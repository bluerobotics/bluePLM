/**
 * ExtensionDetailsDialog - Detailed view of an extension
 * 
 * Shows full extension information including:
 * - Description and metadata
 * - Permissions required
 * - Changelog
 * - Install/Update/Uninstall actions
 */
import { useMemo } from 'react'
import {
  X, Download, Trash2, RefreshCw, ExternalLink, Calendar, Tag,
  Shield, Lock, Code, Bell
} from 'lucide-react'
import { VerificationBadge, NativeBadge } from './VerificationBadge'
import { usePDMStore } from '@/stores/pdmStore'

interface ExtensionDetailsDialogProps {
  extensionId: string | null
  open: boolean
  onClose: () => void
  onInstall?: () => void
  onUninstall?: () => void
  onUpdate?: () => void
}

export function ExtensionDetailsDialog({
  extensionId,
  open,
  onClose,
  onInstall,
  onUninstall,
  onUpdate,
}: ExtensionDetailsDialogProps) {
  const installedExtensions = usePDMStore(s => s.installedExtensions)
  const storeExtensions = usePDMStore(s => s.storeExtensions)
  const availableUpdates = usePDMStore(s => s.availableUpdates)

  // Find the extension data
  const { installed, storeExt, update } = useMemo(() => {
    if (!extensionId) return { installed: undefined, storeExt: undefined, update: undefined }
    
    const installed = installedExtensions[extensionId]
    const storeExt = storeExtensions.find(e => e.extensionId === extensionId)
    const update = availableUpdates.find(u => u.extensionId === extensionId)
    
    return { installed, storeExt, update }
  }, [extensionId, installedExtensions, storeExtensions, availableUpdates])

  if (!open || !extensionId) return null

  // Extract common data
  const manifest = installed?.manifest
  const name = manifest?.name || storeExt?.name || extensionId
  const description = manifest?.description || storeExt?.description || 'No description available.'
  const version = manifest?.version || storeExt?.latestVersion || '0.0.0'
  const publisher = manifest?.publisher || storeExt?.publisher.name || 'Unknown'
  const license = manifest?.license || storeExt?.license || 'Unknown'
  const repository = manifest?.repository || storeExt?.repositoryUrl
  const icon = manifest?.icon || storeExt?.iconUrl
  const isNative = manifest?.category === 'native' || storeExt?.category === 'native'
  const isVerified = storeExt?.verified || installed?.verification === 'verified'
  const verification = installed?.verification || (isVerified ? 'verified' : 'community')
  const categories = storeExt?.categories || []
  const tags = storeExt?.tags || []
  const downloadCount = storeExt?.downloadCount
  const createdAt = storeExt?.createdAt ? new Date(storeExt.createdAt).toLocaleDateString() : null
  const updatedAt = storeExt?.updatedAt ? new Date(storeExt.updatedAt).toLocaleDateString() : null
  const deprecation = storeExt?.deprecation

  const isInstalled = !!installed
  const canInstall = !isInstalled && !!storeExt
  const hasUpdate = !!update

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] bg-gray-900 rounded-xl shadow-2xl border border-gray-700 
          overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative p-6 border-b border-gray-800">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-200 
              hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
          
          <div className="flex gap-4">
            {/* Icon */}
            <div className="w-16 h-16 rounded-xl bg-gray-800 flex items-center justify-center shrink-0 overflow-hidden">
              {icon ? (
                <img src={icon} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl font-bold text-gray-500">{name[0]}</span>
              )}
            </div>
            
            {/* Title */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-gray-100">{name}</h2>
                <VerificationBadge status={verification} showLabel />
                {isNative && <NativeBadge />}
              </div>
              <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
                <span>{publisher}</span>
                <span>•</span>
                <span>v{version}</span>
                {downloadCount !== undefined && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Download size={12} />
                      {downloadCount.toLocaleString()}
                    </span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {categories.map(cat => (
                  <span key={cat} className="px-2 py-0.5 text-xs rounded-full bg-gray-800 text-gray-400">
                    {cat}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Deprecation warning */}
          {deprecation && (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
              <h3 className="font-semibold text-red-400 mb-1">Deprecated</h3>
              <p className="text-sm text-red-300">{deprecation.reason}</p>
              {deprecation.sunsetDate && (
                <p className="text-xs text-red-400 mt-2">
                  Sunset date: {new Date(deprecation.sunsetDate).toLocaleDateString()}
                </p>
              )}
            </div>
          )}
          
          {/* Update available */}
          {update && (
            <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <h3 className="font-semibold text-blue-400 mb-1">Update Available</h3>
              <p className="text-sm text-blue-300">
                Version {update.newVersion} is available (currently {update.currentVersion})
              </p>
              {update.breaking && (
                <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
                  <Bell size={12} />
                  Contains breaking changes
                </p>
              )}
              {update.changelog && (
                <div className="mt-3 p-3 rounded bg-gray-800/50 text-sm text-gray-300">
                  <p className="font-medium mb-1">Changelog:</p>
                  <p className="whitespace-pre-wrap">{update.changelog}</p>
                </div>
              )}
            </div>
          )}
          
          {/* Description */}
          <div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Description
            </h3>
            <p className="text-gray-300 leading-relaxed">{description}</p>
          </div>
          
          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Tag size={14} className="text-gray-500" />
              <span className="text-gray-400">License:</span>
              <span className="text-gray-200">{license}</span>
            </div>
            {createdAt && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar size={14} className="text-gray-500" />
                <span className="text-gray-400">Created:</span>
                <span className="text-gray-200">{createdAt}</span>
              </div>
            )}
            {updatedAt && (
              <div className="flex items-center gap-2 text-sm">
                <RefreshCw size={14} className="text-gray-500" />
                <span className="text-gray-400">Updated:</span>
                <span className="text-gray-200">{updatedAt}</span>
              </div>
            )}
            {repository && (
              <div className="flex items-center gap-2 text-sm">
                <Code size={14} className="text-gray-500" />
                <span className="text-gray-400">Source:</span>
                <a
                  href={repository}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  Repository <ExternalLink size={12} />
                </a>
              </div>
            )}
          </div>
          
          {/* Tags */}
          {tags.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Tags
              </h3>
              <div className="flex flex-wrap gap-2">
                {tags.map(tag => (
                  <span key={tag} className="px-2 py-1 text-xs rounded bg-gray-800 text-gray-400">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {/* Permissions note */}
          {isNative && (
            <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/30">
              <h3 className="font-semibold text-purple-400 mb-1 flex items-center gap-2">
                <Shield size={16} />
                Native Extension
              </h3>
              <p className="text-sm text-purple-300">
                This extension runs in the main process and has full system access.
                Only install native extensions from trusted sources.
              </p>
            </div>
          )}
          
          {/* Verification info */}
          {verification === 'sideloaded' && (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
              <h3 className="font-semibold text-red-400 mb-1 flex items-center gap-2">
                <Lock size={16} />
                Sideloaded Extension
              </h3>
              <p className="text-sm text-red-300">
                This extension was installed from a local file and has not been reviewed.
                Use at your own risk.
              </p>
            </div>
          )}
          
          {/* Installation state */}
          {isInstalled && installed && (
            <div>
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Status
              </h3>
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${
                  installed.state === 'active' ? 'bg-green-500' :
                  installed.state === 'disabled' ? 'bg-gray-500' :
                  installed.state === 'error' ? 'bg-red-500' :
                  'bg-yellow-500'
                }`} />
                <span className="text-gray-300 capitalize">{installed.state}</span>
              </div>
              {installed.error && (
                <p className="mt-2 text-sm text-red-400">{installed.error}</p>
              )}
              {installed.installedAt && (
                <p className="mt-2 text-xs text-gray-500">
                  Installed: {new Date(installed.installedAt).toLocaleString()}
                </p>
              )}
              {installed.activatedAt && (
                <p className="text-xs text-gray-500">
                  Last activated: {new Date(installed.activatedAt).toLocaleString()}
                </p>
              )}
            </div>
          )}
        </div>
        
        {/* Footer actions */}
        <div className="p-6 border-t border-gray-800 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-gray-200 transition-colors"
          >
            Close
          </button>
          
          <div className="flex items-center gap-2">
            {/* Uninstall */}
            {isInstalled && (
              <button
                onClick={onUninstall}
                className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 
                  rounded-lg transition-colors flex items-center gap-2"
              >
                <Trash2 size={16} />
                Uninstall
              </button>
            )}
            
            {/* Update */}
            {hasUpdate && (
              <button
                onClick={onUpdate}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white 
                  rounded-lg transition-colors flex items-center gap-2"
              >
                <RefreshCw size={16} />
                Update to {update.newVersion}
              </button>
            )}
            
            {/* Install */}
            {canInstall && (
              <button
                onClick={onInstall}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white 
                  rounded-lg transition-colors flex items-center gap-2"
              >
                <Download size={16} />
                Install
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
