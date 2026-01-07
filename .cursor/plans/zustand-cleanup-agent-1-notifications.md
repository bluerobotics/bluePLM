# Agent 1: NotificationsView - Use Store Members

## Objective

Update `NotificationsView.tsx` to use the existing `members` array from `organizationDataSlice` instead of fetching organization users separately.

## Problem

The NotificationsView has its own `orgUsers` state and `loadOrgUsers()` function that duplicates data already available in the Zustand store's `organizationDataSlice.members`.

## Current Code Location

`src/features/notifications/NotificationsView.tsx`

Lines ~281 and ~315-331:
```typescript
const [orgUsers, setOrgUsers] = useState<{ id: string; email: string; full_name: string | null; avatar_url: string | null }[]>([])

const loadOrgUsers = useCallback(async () => {
  if (!organization?.id) return
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, full_name, avatar_url')
      .eq('org_id', organization.id)
      .order('full_name')
    if (!error && data) {
      setOrgUsers(data)
    }
  } catch (err) {
    console.error('Error loading org users:', err)
  }
}, [organization?.id])
```

## Solution

1. Remove the local `orgUsers` state and `loadOrgUsers` function
2. Import `members` and `membersLoaded` from the store
3. Ensure members are loaded when the send notification dialog is opened
4. Use `members` array for recipient selection (it has all needed fields plus more)

## Implementation Steps

### Step 1: Update Store Destructuring

Add to the existing `usePDMStore()` call:
```typescript
const {
  // ... existing destructuring ...
  members,
  membersLoaded,
} = usePDMStore()
```

### Step 2: Remove Local State

Remove:
- `const [orgUsers, setOrgUsers] = useState<...>([])`
- The entire `loadOrgUsers` callback function
- Any `useEffect` that calls `loadOrgUsers`

### Step 3: Update Recipient Selector

Find where `orgUsers` is used (likely in the send notification dialog JSX) and replace with `members`.

The `members` array from organizationDataSlice contains:
```typescript
{
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  custom_avatar_url: string | null
  job_title: { id: string; name: string; color: string; icon: string } | null
  role: string
  teams: { id: string; name: string; color: string; icon: string }[]
  // ... and more
}
```

This is a superset of what the notification dialog needs (`id`, `email`, `full_name`, `avatar_url`).

### Step 4: Handle Loading

If `membersLoaded` is false when opening the dialog, the data will be loaded automatically by the `useMembers` hook when the user visits the team members settings. For the notification dialog, the members are likely already loaded.

If needed, you can trigger a load:
```typescript
// Only if members aren't loaded and dialog is opening
useEffect(() => {
  if (showCreateDialog && !membersLoaded && organization?.id) {
    // Members will be loaded by the organizationDataSlice when needed
    // Or import loadMembers from the useMembers hook pattern
  }
}, [showCreateDialog, membersLoaded, organization?.id])
```

## Files to Modify

| File | Change |
|------|--------|
| `src/features/notifications/NotificationsView.tsx` | Replace `orgUsers` with `members` from store |

## Verification

1. Run `npm run typecheck` - should pass
2. Open Notifications view
3. Click "Send Notification" button
4. Verify recipient dropdown shows organization members
5. Verify no console errors about loading users

## Report

After completion, create a report at `.cursor/plans/zustand-cleanup-agent-1-report.md` with:
1. Files modified
2. TypeScript check results
3. Summary of changes made
4. Any issues encountered
