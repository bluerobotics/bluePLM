/**
 * ExtensionCard - Display an extension in a card format
 *
 * Used in the extension store and installed extensions list.
 * Shows extension metadata, verification status, and action buttons.
 * Install and uninstall buttons render only when the parent passes their handler,
 * which it does for administrators only.
 */
import { useState } from 'react'
import { Download, Trash2, ExternalLink, Star } from 'lucide-react'

import { Badge, Button, Callout } from '@/components/core/ui'
import { usePDMStore } from '@/stores/pdmStore'
import type { InstalledExtension, StoreExtensionListing } from '@/stores/types'

import { VerificationBadge, NativeBadge } from './VerificationBadge'

interface ExtensionCardProps {
  // Either installed extension or store listing
  extension?: InstalledExtension
  storeExtension?: StoreExtensionListing
  onViewDetails?: () => void
  onInstall?: () => void
  onUninstall?: () => void
  compact?: boolean
  className?: string
}

export function ExtensionCard({
  extension,
  storeExtension,
  onViewDetails,
  onInstall,
  onUninstall,
  compact = false,
  className = '',
}: ExtensionCardProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const isExtensionInstalled = usePDMStore((s) => s.isExtensionInstalled)

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

  const verification = extension?.verification || (isVerified ? 'verified' : 'community')

  // Check if we can install (not already installed)
  const canInstall =
    isFromStore && !!onInstall && !isExtensionInstalled(storeExtension.extensionId)

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
        className={`flex items-center gap-3 p-2 rounded-lg bg-plm-bg-light/60 hover:bg-plm-highlight
          border border-plm-border cursor-pointer transition-colors ${className}`}
        onClick={onViewDetails}
      >
        {/* Icon */}
        <div className="w-8 h-8 rounded-md bg-plm-bg flex items-center justify-center shrink-0 overflow-hidden">
          {icon ? (
            <img src={icon} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[15px] font-semibold text-plm-fg-muted">{name[0]}</span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[13px] text-plm-fg truncate">{name}</span>
            {isVerified && <VerificationBadge status="verified" size="sm" />}
          </div>
          <div className="text-[12px] text-plm-fg-muted">v{version}</div>
        </div>

        {/* Installed indicator: a package on disk, not a running extension */}
        {isInstalled && <div className="w-2 h-2 rounded-full shrink-0 bg-plm-fg-muted" />}
      </div>
    )
  }

  return (
    <div
      className={`relative p-4 rounded-lg bg-plm-bg-light/60 border border-plm-border
        hover:border-plm-border-light transition-colors group ${className}`}
    >
      {/* Featured badge */}
      {isFeatured && (
        <Badge
          tone="warning"
          icon={<Star size={10} fill="currentColor" />}
          className="absolute right-3 top-3"
        >
          Featured
        </Badge>
      )}

      {/* Deprecation warning */}
      {deprecation && (
        <Callout tone="error" className="mb-3">
          <strong>Deprecated:</strong> {deprecation.reason}
        </Callout>
      )}

      {/* Header */}
      <div className="flex gap-3">
        {/* Icon */}
        <div className="w-10 h-10 rounded-lg bg-plm-bg flex items-center justify-center shrink-0 overflow-hidden">
          {icon ? (
            <img src={icon} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[18px] font-semibold text-plm-fg-muted">{name[0]}</span>
          )}
        </div>

        {/* Title & Publisher */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[13px] font-semibold text-plm-fg truncate">{name}</h3>
            <VerificationBadge status={verification} size="sm" />
            {isNative && <NativeBadge size="sm" />}
          </div>
          <div className="flex items-center gap-2 text-[12px] text-plm-fg-muted">
            <span>{publisher}</span>
            <span className="text-plm-fg-dim">·</span>
            <span>v{version}</span>
            {downloadCount !== undefined && (
              <>
                <span className="text-plm-fg-dim">·</span>
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
      <p className="mt-3 text-[12px] leading-relaxed text-plm-fg-muted line-clamp-2">
        {description}
      </p>

      {/* Categories/Tags */}
      {storeExtension?.categories && storeExtension.categories.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {storeExtension.categories.slice(0, 3).map((cat) => (
            <Badge key={cat}>{cat}</Badge>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2">
        {/* View Details */}
        <Button size="sm" onClick={onViewDetails}>
          Details
        </Button>

        {/* Install button (for store extensions) */}
        {canInstall && (
          <Button
            size="sm"
            variant="primary"
            onClick={() => handleAction('install', onInstall)}
            loading={actionLoading === 'install'}
            icon={<Download size={14} />}
          >
            Install
          </Button>
        )}

        {/* Uninstall button */}
        {isInstalled && onUninstall && (
          <Button
            size="sm"
            variant="danger-subtle"
            onClick={() => handleAction('uninstall', onUninstall)}
            loading={actionLoading === 'uninstall'}
            icon={<Trash2 size={14} />}
            className="ml-auto"
          >
            Uninstall
          </Button>
        )}

        {/* Repository link */}
        {(manifest?.repository || storeExtension?.repositoryUrl) && (
          <a
            href={manifest?.repository || storeExtension?.repositoryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto p-1.5 rounded-md text-plm-fg-muted hover:bg-plm-highlight
              hover:text-plm-fg transition-colors"
            title="View source"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink size={14} />
          </a>
        )}
      </div>
    </div>
  )
}
