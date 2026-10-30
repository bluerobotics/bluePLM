import type { WebhookEvent, WebhookTriggerFilter } from '@/types/database'

// All available webhook events
export const WEBHOOK_EVENTS: { value: WebhookEvent; label: string; category: string }[] = [
  { value: 'file.created', label: 'File Created', category: 'Files' },
  { value: 'file.updated', label: 'File Updated', category: 'Files' },
  { value: 'file.deleted', label: 'File Deleted', category: 'Files' },
  { value: 'file.checked_out', label: 'File Checked Out', category: 'Files' },
  { value: 'file.checked_in', label: 'File Checked In', category: 'Files' },
  { value: 'file.state_changed', label: 'File State Changed', category: 'Files' },
  { value: 'file.revision_changed', label: 'Revision Changed', category: 'Files' },
  { value: 'review.requested', label: 'Review Requested', category: 'Reviews' },
  { value: 'review.approved', label: 'Review Approved', category: 'Reviews' },
  { value: 'review.rejected', label: 'Review Rejected', category: 'Reviews' },
  { value: 'eco.created', label: 'ECO Created', category: 'ECOs' },
  { value: 'eco.completed', label: 'ECO Completed', category: 'ECOs' },
]

// Group events by category
export const EVENTS_BY_CATEGORY = WEBHOOK_EVENTS.reduce(
  (acc, event) => {
    if (!acc[event.category]) acc[event.category] = []
    acc[event.category].push(event)
    return acc
  },
  {} as Record<string, typeof WEBHOOK_EVENTS>,
)

// Generate a secure random secret
export function generateSecret(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export interface WebhookFormData {
  name: string
  description: string
  url: string
  secret: string
  events: WebhookEvent[]
  is_active: boolean
  trigger_filter: WebhookTriggerFilter
  trigger_roles: string[]
  trigger_user_ids: string[]
}

export const emptyFormData: WebhookFormData = {
  name: '',
  description: '',
  url: '',
  secret: generateSecret(),
  events: [],
  is_active: true,
  trigger_filter: 'everyone',
  trigger_roles: [],
  trigger_user_ids: [],
}

// User roles
export const USER_ROLES = [
  { value: 'admin', label: 'Admins' },
  { value: 'engineer', label: 'Engineers' },
  { value: 'viewer', label: 'Viewers' },
]
