# Agent 3: Notifications Slice

## Overview

Create or extend a slice to centralize notifications data. Currently, `operationsSlice` holds `unreadNotificationCount` and `pendingReviewCount`, but the full notifications list is managed with local `useState` in `NotificationsView.tsx`. This causes the data to be lost when navigating away.

## Scope

| Feature | Source File | Current State | Target |
|---------|-------------|---------------|--------|
| Notifications List | `NotificationsView.tsx` | `useState<NotificationWithDetails[]>` | Store slice |
| Org Users (for send dialog) | `NotificationsView.tsx` | `useState<{...}[]>` | Store slice (or reuse from Agent 1) |
| Filters/Search | `NotificationsView.tsx` | Multiple `useState` | Keep local (UI state) |

## Implementation Steps

### Step 1: Decide on Slice Strategy

Options:
1. **Extend `operationsSlice`** - Keep all operations/notifications together
2. **Create `notificationsSlice`** - Separate concerns

Recommendation: Extend `operationsSlice` since it already has notification counts.

### Step 2: Add Notifications State to Operations Slice

**Update:** `src/stores/slices/operationsSlice.ts`

Add these state fields and actions:

```typescript
// State additions
notifications: NotificationWithDetails[]
notificationsLoading: boolean
notificationsLoaded: boolean

// Action additions
setNotifications: (notifications: NotificationWithDetails[]) => void
setNotificationsLoading: (loading: boolean) => void
addNotification: (notification: NotificationWithDetails) => void
updateNotification: (id: string, updates: Partial<NotificationWithDetails>) => void
removeNotification: (id: string) => void
markNotificationRead: (id: string) => void
markAllNotificationsRead: () => void
clearNotifications: () => void
```

### Step 3: Update Types

**Update:** `src/stores/types.ts`

Add to `OperationsSlice` interface:

```typescript
import type { NotificationWithDetails } from '../types/database'

// Add to OperationsSlice interface:
notifications: NotificationWithDetails[]
notificationsLoading: boolean
notificationsLoaded: boolean
setNotifications: (notifications: NotificationWithDetails[]) => void
setNotificationsLoading: (loading: boolean) => void
addNotification: (notification: NotificationWithDetails) => void
updateNotification: (id: string, updates: Partial<NotificationWithDetails>) => void
removeNotification: (id: string) => void
markNotificationRead: (id: string) => void
markAllNotificationsRead: () => void
clearNotifications: () => void
```

### Step 4: Implement Slice Updates

**Update:** `src/stores/slices/operationsSlice.ts`

```typescript
// Add to initial state
notifications: [],
notificationsLoading: false,
notificationsLoaded: false,

// Add actions
setNotifications: (notifications) => set({ 
  notifications, 
  notificationsLoaded: true,
  unreadNotificationCount: notifications.filter(n => !n.read).length 
}),

setNotificationsLoading: (loading) => set({ notificationsLoading: loading }),

addNotification: (notification) => set((state) => {
  const notifications = [notification, ...state.notifications]
  return { 
    notifications,
    unreadNotificationCount: notifications.filter(n => !n.read).length
  }
}),

updateNotification: (id, updates) => set((state) => ({
  notifications: state.notifications.map(n => 
    n.id === id ? { ...n, ...updates } : n
  )
})),

removeNotification: (id) => set((state) => {
  const notification = state.notifications.find(n => n.id === id)
  const notifications = state.notifications.filter(n => n.id !== id)
  return {
    notifications,
    unreadNotificationCount: notification && !notification.read 
      ? state.unreadNotificationCount - 1 
      : state.unreadNotificationCount
  }
}),

markNotificationRead: (id) => set((state) => {
  const notification = state.notifications.find(n => n.id === id)
  if (!notification || notification.read) return state
  
  return {
    notifications: state.notifications.map(n => 
      n.id === id ? { ...n, read: true, read_at: new Date().toISOString() } : n
    ),
    unreadNotificationCount: Math.max(0, state.unreadNotificationCount - 1)
  }
}),

markAllNotificationsRead: () => set((state) => ({
  notifications: state.notifications.map(n => ({ 
    ...n, 
    read: true, 
    read_at: n.read_at || new Date().toISOString() 
  })),
  unreadNotificationCount: 0
})),

clearNotifications: () => set({ 
  notifications: [], 
  notificationsLoaded: false,
  unreadNotificationCount: 0 
}),
```

### Step 5: Update NotificationsView

**Update:** `src/features/notifications/NotificationsView.tsx`

Replace local state with store selectors:

```typescript
// Replace these useState calls:
// const [notifications, setNotifications] = useState<NotificationWithDetails[]>([])
// const [loading, setLoading] = useState(true)

// With store selectors:
const notifications = usePDMStore(s => s.notifications)
const notificationsLoading = usePDMStore(s => s.notificationsLoading)
const notificationsLoaded = usePDMStore(s => s.notificationsLoaded)
const setNotifications = usePDMStore(s => s.setNotifications)
const setNotificationsLoading = usePDMStore(s => s.setNotificationsLoading)
const markNotificationRead = usePDMStore(s => s.markNotificationRead)
const markAllNotificationsRead = usePDMStore(s => s.markAllNotificationsRead)
const removeNotification = usePDMStore(s => s.removeNotification)
const clearNotifications = usePDMStore(s => s.clearNotifications)
```

Keep local state for:
- `selectedCategory` - UI filter state
- `searchQuery` - UI filter state
- `showFilters` - UI toggle state
- `priorityFilter` - UI filter state
- `showUnreadOnly` - UI filter state
- `expandedNotification` - UI state
- `responseComment` - Form state
- `respondingTo` - Form state
- `showCreateDialog` - Dialog state
- `newNotification` - Form state

### Step 6: Handle Org Users for Send Dialog

The `orgUsers` state in NotificationsView is used for the "send notification" dialog. Options:

1. **Reuse from Agent 1** - If Agent 1's slice includes members, use that
2. **Keep local** - It's only used in this view for the dialog
3. **Add to slice** - If needed elsewhere

Recommendation: Check if Agent 1's `members` array can be reused. If so, import from there.

### Step 7: Update Notification Handlers

Update the handlers in NotificationsView to use store actions instead of direct state manipulation:

```typescript
const handleMarkRead = async (notificationId: string) => {
  const { success } = await markNotificationsRead([notificationId])
  if (success) {
    markNotificationRead(notificationId)  // Use store action
  }
}

const handleMarkAllRead = async () => {
  if (!user?.id) return
  const { success } = await markAllNotificationsRead(user.id)
  if (success) {
    markAllNotificationsRead()  // Use store action (different name!)
    // Rename store action to avoid confusion, e.g., markAllRead
  }
}

const handleDeleteNotification = async (notificationId: string) => {
  const { success } = await deleteNotification(notificationId)
  if (success) {
    removeNotification(notificationId)  // Use store action
  }
}
```

## Files to Modify

| File | Action |
|------|--------|
| `src/stores/slices/operationsSlice.ts` | Add notifications state/actions |
| `src/stores/types.ts` | Update OperationsSlice interface |
| `src/features/notifications/NotificationsView.tsx` | Use store instead of useState |

## Persistence Consideration

Notifications should **NOT** be persisted - they should be fetched fresh on app load. Ensure the new state fields are not added to the `partialize` function in `pdmStore.ts`.

## Coordination with Other Agents

- **Agent 1**: May provide `members` array that can be reused for the send dialog's org users

## Testing Checklist

- [ ] Notifications load on view mount
- [ ] Notifications persist when navigating away and back
- [ ] Mark as read updates both UI and count badge
- [ ] Mark all as read works
- [ ] Delete notification works
- [ ] Clear all works
- [ ] Unread count in sidebar updates correctly
- [ ] Real-time notifications (if implemented) add to list
- [ ] Filters work correctly on store data
- [ ] Send notification dialog works

## Report Generation

After completing this work, generate a report file at `.cursor/plans/zustand-agent-3-report.md` containing:
1. Summary of changes made
2. Decision on slice strategy (extend vs create)
3. Files created/modified with brief descriptions
4. Any issues encountered and how they were resolved
5. Testing results
6. Coordination notes with other agents
