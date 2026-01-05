import { Monitor } from 'lucide-react'
import { getInitials } from '@/types/pdm'

export interface CheckoutBadgeUser {
  id: string
  name: string
  avatar_url?: string
  isMe: boolean
  isDifferentMachine?: boolean
  machineName?: string
}

export interface CheckoutBadgeProps {
  checkoutUsers: CheckoutBadgeUser[]
  avatarSize: number
  avatarFontSize: number
}

/**
 * Badge showing checkout user avatars
 */
export function CheckoutBadge({ checkoutUsers, avatarSize, avatarFontSize }: CheckoutBadgeProps) {
  if (checkoutUsers.length === 0) return null

  return (
    <div
      className="flex"
      style={{ marginLeft: -avatarSize * 0.25 }}
      title={checkoutUsers.map(u => u.name).join(', ')}
    >
      {checkoutUsers.slice(0, 3).map((u, i) => (
        <div
          key={u.id}
          className="relative"
          style={{
            zIndex: 3 - i,
            marginLeft: i > 0 ? -avatarSize * 0.3 : 0
          }}
          title={u.isDifferentMachine && u.machineName ? `Checked out on ${u.machineName} (different computer)` : undefined}
        >
          {u.avatar_url ? (
            <img
              src={u.avatar_url}
              alt={u.name}
              className="rounded-full bg-plm-bg object-cover"
              style={{ width: avatarSize, height: avatarSize }}
              referrerPolicy="no-referrer"
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.style.display = 'none'
                target.nextElementSibling?.classList.remove('hidden')
              }}
            />
          ) : null}
          <div
            className={`rounded-full ${u.isMe ? (u.isDifferentMachine ? 'bg-plm-warning/30 text-plm-warning' : 'bg-plm-accent/30 text-plm-accent') : 'bg-plm-accent/30 text-plm-accent'} flex items-center justify-center font-medium ${u.avatar_url ? 'hidden' : ''}`}
            style={{ width: avatarSize, height: avatarSize, fontSize: avatarFontSize }}
          >
            {getInitials(u.name)}
          </div>
          {u.isDifferentMachine && (
            <div
              className="absolute -bottom-0.5 -right-0.5 bg-plm-warning rounded-full p-0.5"
              style={{ width: avatarSize * 0.4, height: avatarSize * 0.4 }}
              title={`Checked out on ${u.machineName || 'another computer'}`}
            >
              <Monitor
                size={avatarSize * 0.3}
                className="text-plm-bg w-full h-full"
              />
            </div>
          )}
        </div>
      ))}
      {checkoutUsers.length > 3 && (
        <div
          className="rounded-full bg-plm-bg-light flex items-center justify-center text-plm-fg-muted font-medium"
          style={{
            width: avatarSize,
            height: avatarSize,
            fontSize: avatarFontSize,
            marginLeft: -avatarSize * 0.3,
            zIndex: 0
          }}
        >
          +{checkoutUsers.length - 3}
        </div>
      )}
    </div>
  )
}
