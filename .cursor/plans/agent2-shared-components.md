# Agent 2: Shared Components Organization

## Mission
Organize smart shared components into a clean `components/shared/` directory with consistent exports.

## Ownership Boundaries

**FILES YOU OWN (only you touch these):**
- `src/components/shared/` (entire directory)
- `src/components/OnlineUsersIndicator.tsx` → Move to shared
- `src/components/ImpersonationBanner.tsx` → Move to shared
- `src/components/LanguageSelector.tsx` → Move to shared
- `src/components/SystemStats.tsx` → Move to shared

**FILES YOU MUST NOT TOUCH:**
- `src/components/core/` (Agent 1's territory)
- `src/components/layout/` (existing, well-organized)
- Any feature folders (backup/, command-search/, activity-bar/, settings/, sidebar/)
- FileBrowser.tsx, Sidebar.tsx, App.tsx
- Store files, lib files

---

## Task 1: Audit Existing Shared Directory

### Current State
`src/components/shared/` already contains:
- `ColorPicker.tsx`
- `DraggableTab.tsx`
- `FileItemComponents.tsx`
- `IconPicker.tsx`

### Goal
Organize these and add related components with proper barrel exports.

---

## Task 2: Create Proper Structure

```
src/components/shared/
├── ColorPicker/
│   ├── ColorPicker.tsx
│   └── index.ts
├── IconPicker/
│   ├── IconPicker.tsx
│   └── index.ts
├── DraggableTab/
│   ├── DraggableTab.tsx
│   └── index.ts
├── FileItem/
│   ├── FileItemComponents.tsx
│   └── index.ts
├── Avatar/
│   ├── Avatar.tsx
│   ├── AvatarGroup.tsx
│   └── index.ts
├── OnlineUsers/
│   ├── OnlineUsersIndicator.tsx
│   └── index.ts
├── ImpersonationBanner/
│   ├── ImpersonationBanner.tsx
│   └── index.ts
├── LanguageSelector/
│   ├── LanguageSelector.tsx
│   └── index.ts
├── SystemStats/
│   ├── SystemStats.tsx
│   └── index.ts
└── index.ts
```

---

## Task 3: Reorganize ColorPicker

### Steps
1. Read `src/components/shared/ColorPicker.tsx`
2. Create `src/components/shared/ColorPicker/ColorPicker.tsx` (move content)
3. Create `src/components/shared/ColorPicker/index.ts`:
```typescript
export { ColorPicker } from './ColorPicker'
```
4. Delete original `src/components/shared/ColorPicker.tsx`

---

## Task 4: Reorganize IconPicker

### Steps
1. Read `src/components/shared/IconPicker.tsx`
2. Create `src/components/shared/IconPicker/IconPicker.tsx`
3. Create `src/components/shared/IconPicker/index.ts`:
```typescript
export { IconPicker } from './IconPicker'
```
4. Delete original

---

## Task 5: Reorganize DraggableTab

### Steps
1. Read `src/components/shared/DraggableTab.tsx`
2. Create `src/components/shared/DraggableTab/DraggableTab.tsx`
3. Create `src/components/shared/DraggableTab/index.ts`:
```typescript
export { DraggableTab } from './DraggableTab'
```
4. Delete original

---

## Task 6: Reorganize FileItemComponents

### Steps
1. Read `src/components/shared/FileItemComponents.tsx`
2. Create `src/components/shared/FileItem/FileItemComponents.tsx`
3. Create `src/components/shared/FileItem/index.ts`:
```typescript
export * from './FileItemComponents'
```
4. Delete original

---

## Task 7: Create Avatar Components

### Source
Extract avatar rendering logic used throughout the codebase. Search for patterns using:
- `getInitials` from pdm.ts
- `getAvatarColor` from pdm.ts
- Avatar URL rendering with fallbacks

### Create `src/components/shared/Avatar/Avatar.tsx`:
```typescript
import { getInitials, getAvatarColor, getEffectiveAvatarUrl } from '@/types/pdm'

interface AvatarProps {
  user: {
    full_name?: string | null
    email?: string
    avatar_url?: string | null
    custom_avatar_url?: string | null
  } | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeClasses = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-10 h-10 text-base',
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
        className={`${sizeClasses[size]} rounded-full object-cover ${className}`}
      />
    )
  }

  return (
    <div
      className={`${sizeClasses[size]} ${colors.bg} ${colors.text} rounded-full flex items-center justify-center font-medium ${className}`}
    >
      {initials}
    </div>
  )
}
```

### Create `src/components/shared/Avatar/AvatarGroup.tsx`:
```typescript
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
  size?: 'sm' | 'md' | 'lg'
}

export function AvatarGroup({ users, max = 3, size = 'sm' }: AvatarGroupProps) {
  const visible = users.slice(0, max)
  const remaining = users.length - max

  return (
    <div className="flex -space-x-2">
      {visible.map((user, i) => (
        <Avatar
          key={user.email || i}
          user={user}
          size={size}
          className="ring-2 ring-plm-bg"
        />
      ))}
      {remaining > 0 && (
        <div className={`w-6 h-6 text-xs bg-plm-bg-tertiary text-plm-fg-muted rounded-full flex items-center justify-center ring-2 ring-plm-bg`}>
          +{remaining}
        </div>
      )}
    </div>
  )
}
```

### Create `src/components/shared/Avatar/index.ts`:
```typescript
export { Avatar } from './Avatar'
export { AvatarGroup } from './AvatarGroup'
```

---

## Task 8: Move OnlineUsersIndicator

### Steps
1. Read `src/components/OnlineUsersIndicator.tsx`
2. Create `src/components/shared/OnlineUsers/OnlineUsersIndicator.tsx`
3. Update imports to use the new Avatar component if applicable
4. Create `src/components/shared/OnlineUsers/index.ts`:
```typescript
export { OnlineUsersIndicator } from './OnlineUsersIndicator'
```
5. Create re-export stub at original location:
```typescript
// src/components/OnlineUsersIndicator.tsx
export { OnlineUsersIndicator } from './shared/OnlineUsers'
```

---

## Task 9: Move ImpersonationBanner

### Steps
1. Read `src/components/ImpersonationBanner.tsx`
2. Create `src/components/shared/ImpersonationBanner/ImpersonationBanner.tsx`
3. Create `src/components/shared/ImpersonationBanner/index.ts`:
```typescript
export { ImpersonationBanner } from './ImpersonationBanner'
```
4. Create re-export stub at original location

---

## Task 10: Move LanguageSelector

### Steps
1. Read `src/components/LanguageSelector.tsx`
2. Create `src/components/shared/LanguageSelector/LanguageSelector.tsx`
3. Create `src/components/shared/LanguageSelector/index.ts`:
```typescript
export { LanguageSelector } from './LanguageSelector'
```
4. Create re-export stub at original location

---

## Task 11: Move SystemStats

### Steps
1. Read `src/components/SystemStats.tsx`
2. Create `src/components/shared/SystemStats/SystemStats.tsx`
3. Create `src/components/shared/SystemStats/index.ts`:
```typescript
export { SystemStats } from './SystemStats'
```
4. Create re-export stub at original location

---

## Task 12: Create Main Barrel Export

Create `src/components/shared/index.ts`:
```typescript
// Shared smart components
export * from './Avatar'
export * from './ColorPicker'
export * from './IconPicker'
export * from './DraggableTab'
export * from './FileItem'
export * from './OnlineUsers'
export * from './ImpersonationBanner'
export * from './LanguageSelector'
export * from './SystemStats'
```

---

## Import Update Pattern

After reorganization, imports can use either:
```typescript
// Specific import
import { Avatar } from '@/components/shared/Avatar'

// Barrel import
import { Avatar, ColorPicker, IconPicker } from '@/components/shared'
```

---

## Verification Checklist

- [ ] Each component in `shared/` has its own folder with index.ts
- [ ] Main `shared/index.ts` barrel export exists
- [ ] Original file locations have re-export stubs
- [ ] Avatar component created with proper pdm.ts utility integration
- [ ] `npm run typecheck` passes

---

## Notes for Agent

1. **Preserve all existing functionality** - just reorganize
2. **Create re-export stubs** for backward compatibility with existing imports
3. **Use the new Avatar component** to replace inline avatar rendering where found
4. **Check for type exports** - ensure types are also exported from index.ts files
