import { getInitials, getAvatarColor, getEffectiveAvatarUrl } from '@/lib/utils'

interface AvatarProps {
  user: {
    full_name?: string | null
    email?: string
    avatar_url?: string | null
    custom_avatar_url?: string | null
  } | null
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizeClasses = {
  xs: 'w-5 h-5 text-[9px]',
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-10 h-10 text-base',
  xl: 'w-12 h-12 text-lg',
}

export function Avatar({ user, size = 'md', className = '' }: AvatarProps) {
  const avatarUrl = getEffectiveAvatarUrl(user)
  const initials = getInitials(user?.full_name || user?.email)
  const colors = getAvatarColor(user?.email || user?.full_name)

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={user?.full_name || 'User avatar'}
        className={`${sizeClasses[size]} rounded-full object-cover flex-shrink-0 ${className}`}
        referrerPolicy="no-referrer"
      />
    )
  }

  return (
    <div
      className={`${sizeClasses[size]} ${colors.bg} ${colors.text} rounded-full flex items-center justify-center font-medium flex-shrink-0 ${className}`}
    >
      {initials}
    </div>
  )
}

// Avatar with online status indicator
interface AvatarWithStatusProps extends AvatarProps {
  isOnline?: boolean
  showStatus?: boolean
}

export function AvatarWithStatus({ 
  user, 
  size = 'md', 
  className = '',
  isOnline = false,
  showStatus = true
}: AvatarWithStatusProps) {
  return (
    <div className="relative inline-flex flex-shrink-0">
      <Avatar user={user} size={size} className={className} />
      {showStatus && (
        <div className={`absolute -bottom-0.5 -right-0.5 rounded-full bg-plm-bg flex items-center justify-center ${
          size === 'xs' ? 'w-2 h-2' : size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'
        }`}>
          <div className={`rounded-full ${isOnline ? 'bg-plm-success' : 'bg-plm-fg-dim'} ${
            size === 'xs' ? 'w-1.5 h-1.5' : size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5'
          }`} />
        </div>
      )}
    </div>
  )
}
