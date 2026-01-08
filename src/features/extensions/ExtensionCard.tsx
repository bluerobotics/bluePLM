/**
 * ExtensionCard - Display an extension in a card format
 * 
 * Used in the extension store and installed extensions list.
 * Shows extension metadata, verification status, and action buttons.
 */
import { useState } from 'react'
import { Download, Trash2, RefreshCw, Power, PowerOff, ExternalLink, Star } from 'lucide-react'
import { VerificationBadge, NativeBadge } from './VerificationBadge'
import type { InstalledExtension, StoreExtensionListing, ExtensionUpdateAvailable } from '@/stores/types'
import { usePDMStore } from '@/stores/pdmStore'

interface ExtensionCardProps {
  // Either installed extension or store listing
  extension?: InstalledExtension
  storeExtension?: StoreExtensionListing
  update?: ExtensionUpdateAvailable
  onViewDetails?: () => void
  onInstall?: () => void
  onUninstall?: () => void
  onUpdate?: () => void
  onEnable?: () => void
  onDisable?: () => void
  compact?: boolean
  className?: string
}

export function ExtensionCard({
  extension,
  storeExtension,
  update,
  onViewDetails,
  onInstall,
  onUninstall,
  onUpdate,
  onEnable,
  onDisable,
  compact = false,
  className = '',
}: ExtensionCardProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const isExtensionInstalled = usePDMStore(s => s.isExtensionInstalled)
  
  // Determine source of data
  const manifest = extension?.manifest
  const isInstalled = !!extension
  const isFromStore = !!storeExtension
  
  // Extract common properties
  const name = manifest?.name || storeExtension?.name || 'Unknown Extension'
  const description = manifest?.description || storeExtension?.description || ''
  const version = manifest?.version || storeExtension?.latestVersion || ''
  const publisher = manifest?.publisher || storeExtension?.publisher.name || ''
  const icon = manifest?.icon || storeExtension?.iconUrl
  const isVerified = storeExtension?.verified || extension?.verification === 'verified'
  const isNative = manifest?.category === 'native' || storeExtension?.category === 'native'
  const isFeatured = storeExtension?.featured
  const downloadCount = storeExtension?.downloadCount
  const deprecation = storeExtension?.deprecation
  
  // Extension state
  const state = extension?.state || 'not-installed'
  const isActive = state === 'active'
  const isDisabled = state === 'disabled'
  const hasError = state === 'error'
  const verification = extension?.verification || (isVerified ? 'verified' : 'community')
  
  // Check if we can install (not already installed)
  const canInstall = isFromStore && !isExtensionInstalled(storeExtension.extensionId)
  
  // Handle action with loading state
  const handleAction = async (action: string, handler?: () => void | Promise<void>) => {
    if (!handler) return
    setActionLoading(action)
    try {
      await handler()
    } finally {
      setActionLoading(null)
    }
  }

  if (compact) {
    return (
      <div
        className={`flex items-center gap-3 p-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 
          border border-gray-700/50 cursor-pointer transition-colors ${className}`}
        onClick={onViewDetails}
      >
        {/* Icon */}
        <div className="w-8 h-8 rounded-md bg-gray-700 flex items-center justify-center shrink-0 overflow-hidden">
          {icon ? (
            <img src={icon} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-lg font-bold text-gray-400">{name[0]}</span>
          )}
        </div>
        
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-gray-200 truncate">{name}</span>
            {isVerified && <VerificationBadge status="verified" size="sm" />}
          </div>
          <div className="text-xs text-gray-400">v{version}</div>
        </div>
        
        {/* State indicator */}
        {isInstalled && (
          <div className={`w-2 h-2 rounded-full shrink-0 ${
            isActive ? 'bg-green-500' :
            isDisabled ? 'bg-gray-500' :
            hasError ? 'bg-red-500' :
            'bg-yellow-500'
          }`} title={state} />
        )}
      </div>
    )
  }

  return (
    <div
      className={`relative p-4 rounded-xl bg-gray-800/50 border border-gray-700/50 
        hover:border-gray-600/50 transition-all group ${className}`}
    >
      {/* Featured badge */}
      {isFeatured && (
        <div className="absolute -top-2 -right-2 bg-amber-500 text-black text-[10px] font-bold 
          px-2 py-0.5 rounded-full flex items-center gap-1">
          <Star size={10} fill="currentColor" />
          Featured
        </div>
      )}
      
      {/* Deprecation warning */}
      {deprecation && (
        <div className="mb-3 p-2 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
          <strong>Deprecated:</strong> {deprecation.reason}
        </div>
      )}
      
      {/* Header */}
      <div className="flex gap-3">
        {/* Icon */}
        <div className="w-12 h-12 rounded-lg bg-gray-700 flex items-center justify-center shrink-0 overflow-hidden">
          {icon ? (
            <img src={icon} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl font-bold text-gray-400">{name[0]}</span>
          )}
        </div>
        
        {/* Title & Publisher */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-100 truncate">{name}</h3>
            <VerificationBadge status={verification} size="sm" />
            {isNative && <NativeBadge size="sm" />}
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <span>{publisher}</span>
            <span className="text-gray-600">•</span>
            <span>v{version}</span>
            {downloadCount !== undefined && (
              <>
                <span className="text-gray-600">•</span>
                <span className="flex items-center gap-1">
                  <Download size={12} />
                  {downloadCount.toLocaleString()}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
      
      {/* Description */}
      <p className="mt-3 text-sm text-gray-400 line-clamp-2">{description}</p>
      
      {/* Categories/Tags */}
      {storeExtension?.categories && storeExtension.categories.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {storeExtension.categories.slice(0, 3).map(cat => (
            <span
              key={cat}
              className="px-2 py-0.5 text-[10px] rounded-full bg-gray-700/50 text-gray-400"
            >
              {cat}
            </span>
          ))}
        </div>
      )}
      
      {/* Update available badge */}
      {update && (
        <div className="mt-3 p-2 rounded bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs">
          Update available: v{update.currentVersion} → v{update.newVersion}
          {update.breaking && <span className="ml-2 text-amber-400">(Breaking changes)</span>}
        </div>
      )}
      
      {/* Error state */}
      {hasError && extension?.error && (
        <div className="mt-3 p-2 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
          Error: {extension.error}
        </div>
      )}
      
      {/* Actions */}
      <div className="mt-4 flex items-center gap-2">
        {/* View Details */}
        <button
          onClick={onViewDetails}
          className="px-3 py-1.5 text-sm rounded-lg bg-gray-700/50 hover:bg-gray-700 
            text-gray-300 transition-colors"
        >
          Details
        </button>
        
        {/* Install button (for store extensions) */}
        {canInstall && (
          <button
            onClick={() => handleAction('install', onInstall)}
            disabled={actionLoading === 'install'}
            className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 
              text-white transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {actionLoading === 'install' ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            Install
          </button>
        )}
        
        {/* Update button */}
        {update && (
          <button
            onClick={() => handleAction('update', onUpdate)}
            disabled={actionLoading === 'update'}
            className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 
              text-white transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {actionLoading === 'update' ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            Update
          </button>
        )}
        
        {/* Enable/Disable toggle (for installed extensions) */}
        {isInstalled && !hasError && (
          <>
            {isDisabled ? (
              <button
                onClick={() => handleAction('enable', onEnable)}
                disabled={actionLoading === 'enable'}
                className="px-3 py-1.5 text-sm rounded-lg bg-green-600/20 hover:bg-green-600/30 
                  text-green-400 transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {actionLoading === 'enable' ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Power size={14} />
                )}
                Enable
              </button>
            ) : (
              <button
                onClick={() => handleAction('disable', onDisable)}
                disabled={actionLoading === 'disable'}
                className="px-3 py-1.5 text-sm rounded-lg bg-gray-700/50 hover:bg-gray-700 
                  text-gray-400 transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {actionLoading === 'disable' ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <PowerOff size={14} />
                )}
                Disable
              </button>
            )}
          </>
        )}
        
        {/* Uninstall button */}
        {isInstalled && (
          <button
            onClick={() => handleAction('uninstall', onUninstall)}
            disabled={actionLoading === 'uninstall'}
            className="ml-auto px-3 py-1.5 text-sm rounded-lg bg-red-600/20 hover:bg-red-600/30 
              text-red-400 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {actionLoading === 'uninstall' ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Trash2 size={14} />
            )}
            Uninstall
          </button>
        )}
        
        {/* Repository link */}
        {(manifest?.repository || storeExtension?.repositoryUrl) && (
          <a
            href={manifest?.repository || storeExtension?.repositoryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto p-1.5 rounded-lg hover:bg-gray-700/50 text-gray-400 
              hover:text-gray-300 transition-colors"
            title="View source"
            onClick={e => e.stopPropagation()}
          >
            <ExternalLink size={16} />
          </a>
        )}
      </div>
    </div>
  )
}
