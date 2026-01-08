/**
 * VerificationBadge - Display extension verification status
 * 
 * Shows different badges based on verification status:
 * - Verified: Blue checkmark, signed by Blue Robotics
 * - Community: Yellow badge, open source but not reviewed
 * - Sideloaded: Red warning, installed from local .bpx file
 */
import { BadgeCheck, Users, AlertTriangle, Shield } from 'lucide-react'
import type { ExtensionVerificationStatus } from '@/stores/types'

interface VerificationBadgeProps {
  status: ExtensionVerificationStatus
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  className?: string
}

const sizeConfig = {
  sm: { icon: 12, text: 'text-[10px]' },
  md: { icon: 14, text: 'text-xs' },
  lg: { icon: 16, text: 'text-sm' },
}

const statusConfig = {
  verified: {
    icon: BadgeCheck,
    label: 'Verified',
    description: 'Reviewed and signed by Blue Robotics',
    className: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    iconClass: 'text-blue-400',
  },
  community: {
    icon: Users,
    label: 'Community',
    description: 'Open source, not reviewed',
    className: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    iconClass: 'text-amber-400',
  },
  sideloaded: {
    icon: AlertTriangle,
    label: 'Sideloaded',
    description: 'Installed from local file - use at your own risk',
    className: 'bg-red-500/20 text-red-400 border-red-500/30',
    iconClass: 'text-red-400',
  },
}

export function VerificationBadge({
  status,
  size = 'md',
  showLabel = false,
  className = '',
}: VerificationBadgeProps) {
  const config = statusConfig[status]
  const sizeConf = sizeConfig[size]
  const Icon = config.icon

  return (
    <div
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${config.className} ${className}`}
      title={config.description}
    >
      <Icon size={sizeConf.icon} className={config.iconClass} />
      {showLabel && (
        <span className={`font-medium ${sizeConf.text}`}>{config.label}</span>
      )}
    </div>
  )
}

// Compact version for inline use
export function VerificationIcon({
  status,
  size = 14,
  className = '',
}: {
  status: ExtensionVerificationStatus
  size?: number
  className?: string
}) {
  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <span title={config.description}>
      <Icon
        size={size}
        className={`${config.iconClass} ${className}`}
      />
    </span>
  )
}

// Native badge for native extensions
export function NativeBadge({
  size = 'md',
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const sizeConf = sizeConfig[size]

  return (
    <div
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border bg-purple-500/20 text-purple-400 border-purple-500/30 ${className}`}
      title="Runs in main process with full system access"
    >
      <Shield size={sizeConf.icon} className="text-purple-400" />
      <span className={`font-medium ${sizeConf.text}`}>Native</span>
    </div>
  )
}
