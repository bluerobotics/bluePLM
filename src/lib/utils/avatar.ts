/**
 * Avatar utilities
 *
 * Functions for generating avatar displays when no profile picture exists.
 */

/**
 * Avatar color palette for fallback avatars (when no profile picture)
 * These are tailwind-compatible color classes
 */
export const AVATAR_COLORS = [
  { bg: 'bg-blue-500/20', text: 'text-blue-400', ring: 'ring-blue-500/50' },
  { bg: 'bg-emerald-500/20', text: 'text-emerald-400', ring: 'ring-emerald-500/50' },
  { bg: 'bg-amber-500/20', text: 'text-amber-400', ring: 'ring-amber-500/50' },
  { bg: 'bg-rose-500/20', text: 'text-rose-400', ring: 'ring-rose-500/50' },
  { bg: 'bg-violet-500/20', text: 'text-violet-400', ring: 'ring-violet-500/50' },
  { bg: 'bg-cyan-500/20', text: 'text-cyan-400', ring: 'ring-cyan-500/50' },
  { bg: 'bg-orange-500/20', text: 'text-orange-400', ring: 'ring-orange-500/50' },
  { bg: 'bg-pink-500/20', text: 'text-pink-400', ring: 'ring-pink-500/50' },
] as const

export type AvatarColor = (typeof AVATAR_COLORS)[number]

/**
 * Get initials from a name (1-2 characters)
 *
 * @example
 * getInitials("John Doe") // "JD"
 * getInitials("john.doe@email.com") // "JD"
 * getInitials("John") // "JO"
 */
export function getInitials(name: string | null | undefined): string {
  if (!name) return '?'

  // If it's an email, extract the part before @
  const displayName = name.includes('@') ? name.split('@')[0] : name

  // Split by spaces, dots, underscores, or hyphens
  const parts = displayName.trim().split(/[\s._-]+/).filter(p => p.length > 0)

  if (parts.length >= 2) {
    // First letter of first and last parts
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
  } else if (parts.length === 1 && parts[0].length >= 2) {
    // Single word - take first 2 characters
    return parts[0].substring(0, 2).toUpperCase()
  } else if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase() || '?'
  }

  return '?'
}

/**
 * Get consistent avatar color based on name/id (same person always gets same color)
 */
export function getAvatarColor(identifier: string | null | undefined): AvatarColor {
  if (!identifier) return AVATAR_COLORS[0]

  // Simple hash function to get consistent index
  let hash = 0
  for (let i = 0; i < identifier.length; i++) {
    hash = ((hash << 5) - hash) + identifier.charCodeAt(i)
    hash = hash & hash // Convert to 32bit integer
  }

  const index = Math.abs(hash) % AVATAR_COLORS.length
  return AVATAR_COLORS[index]
}

/**
 * Get effective avatar URL with fallback logic
 * Prefers custom_avatar_url over avatar_url
 */
export function getEffectiveAvatarUrl(
  user: { custom_avatar_url?: string | null; avatar_url?: string | null } | null | undefined
): string | null {
  if (!user) return null
  return user.custom_avatar_url || user.avatar_url || null
}
