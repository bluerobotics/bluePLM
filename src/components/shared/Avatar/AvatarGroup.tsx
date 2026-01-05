import { Avatar } from './Avatar'

interface User {
  full_name?: string | null
  email?: string
  avatar_url?: string | null
  custom_avatar_url?: string | null
}

interface AvatarGroupProps {
  users: User[]
  max?: number
  size?: 'xs' | 'sm' | 'md' | 'lg'
}

export function AvatarGroup({ users, max = 3, size = 'sm' }: AvatarGroupProps) {
  const visible = users.slice(0, max)
  const remaining = users.length - max

  const overlapClass = size === 'xs' ? '-space-x-1.5' : size === 'sm' ? '-space-x-2' : '-space-x-2.5'
  const countSizeClass = size === 'xs' ? 'w-5 h-5 text-[9px]' : 
                         size === 'sm' ? 'w-6 h-6 text-xs' : 
                         size === 'md' ? 'w-8 h-8 text-sm' : 'w-10 h-10 text-base'

  return (
    <div className={`flex ${overlapClass}`}>
      {visible.map((user, i) => (
        <Avatar
          key={user.email || i}
          user={user}
          size={size}
          className="ring-2 ring-plm-bg"
        />
      ))}
      {remaining > 0 && (
        <div className={`${countSizeClass} bg-plm-bg-tertiary text-plm-fg-muted rounded-full flex items-center justify-center ring-2 ring-plm-bg font-medium`}>
          +{remaining}
        </div>
      )}
    </div>
  )
}
