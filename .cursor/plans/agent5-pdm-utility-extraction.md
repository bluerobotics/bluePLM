# Agent 5: PDM Utility Function Extraction

## Objective
Extract utility functions from `src/types/pdm.ts` into proper utility modules. The types file should only contain types, interfaces, and constants - not utility functions.

## Problem Summary
`src/types/pdm.ts` contains 7 utility functions that violate separation of concerns:

| Function | Line | Usage Count | Description |
|----------|------|-------------|-------------|
| `getEffectiveAvatarUrl` | 642 | Low | Get user's avatar URL with fallback |
| `getNextRevision` | 756 | Low | Calculate next revision based on scheme |
| `getFileType` | 782 | Moderate | Map extension to file type |
| `getFileIconType` | 863 | Moderate | Map extension to icon type |
| `isCADFile` | 1047 | Low | Check if file is CAD format |
| `getInitials` | 1054 | **21 files** | Extract initials from name |
| `getAvatarColor` | 1090 | 2 files | Get consistent avatar color |

Also includes `AVATAR_COLORS` constant (line 1078) which should move with `getAvatarColor`.

## Tasks

### Task 1: Create `src/lib/utils/avatar.ts`

Extract avatar-related utilities:

```typescript
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
```

### Task 2: Create `src/lib/utils/file.ts`

Extract file-type utilities:

```typescript
/**
 * File type utilities
 * 
 * Functions for determining file types and icons based on extensions.
 */

import type { PDMFile, FileIconType } from '@/types/pdm'

/**
 * Map file extension to PDM file type
 */
export function getFileType(extension: string): PDMFile['file_type'] {
  // Copy the full implementation from pdm.ts lines 782-861
  const ext = extension.toLowerCase().replace('.', '')
  
  // CAD files
  const cadExtensions = ['sldprt', 'sldasm', 'slddrw', 'step', 'stp', 'iges', 'igs', 'dxf', 'dwg', 'stl', 'obj', 'fbx', 'glb', 'gltf', '3mf', 'catpart', 'catproduct', 'catdrawing', 'prt', 'asm', 'drw', 'ipt', 'iam', 'idw', 'f3d', 'fcstd', 'scad']
  if (cadExtensions.includes(ext)) return 'cad'
  
  // Document files
  const docExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'odt', 'ods', 'odp', 'md', 'csv']
  if (docExtensions.includes(ext)) return 'document'
  
  // Image files
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico', 'tif', 'tiff', 'psd', 'ai', 'eps', 'raw', 'cr2', 'nef', 'heic', 'heif']
  if (imageExtensions.includes(ext)) return 'image'
  
  // Video files
  const videoExtensions = ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm', 'm4v', 'mpeg', 'mpg', '3gp']
  if (videoExtensions.includes(ext)) return 'video'
  
  // Archive files
  const archiveExtensions = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'dmg']
  if (archiveExtensions.includes(ext)) return 'archive'
  
  // Code files
  const codeExtensions = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt', 'scala', 'html', 'css', 'scss', 'sass', 'less', 'json', 'xml', 'yaml', 'yml', 'sql', 'sh', 'bash', 'ps1', 'bat', 'cmd']
  if (codeExtensions.includes(ext)) return 'code'
  
  return 'other'
}

/**
 * Map file extension to icon type for display
 */
export function getFileIconType(extension: string): FileIconType {
  // Copy the full implementation from pdm.ts lines 863-1045
  // This is a large switch/map - copy it entirely
}

/**
 * Check if a file is a CAD file based on extension
 */
export function isCADFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const cadExtensions = [
    'sldprt', 'sldasm', 'slddrw',  // SolidWorks
    'step', 'stp', 'iges', 'igs',  // Neutral formats
    'dxf', 'dwg',                   // AutoCAD
    'stl', 'obj', 'fbx',           // Mesh formats
    'catpart', 'catproduct',        // CATIA
    'prt', 'asm', 'drw',           // Pro/E, Creo
    'ipt', 'iam', 'idw',           // Inventor
    'f3d',                          // Fusion 360
    'fcstd',                        // FreeCAD
  ]
  return cadExtensions.includes(ext)
}
```

### Task 3: Update `src/lib/utils/index.ts`

Add exports for the new modules:

```typescript
export * from './avatar'
export * from './date'
export * from './file'
export * from './format'
export * from './path'
export * from './string'
export * from './validation'
```

### Task 4: Remove functions from `src/types/pdm.ts`

Delete these sections from pdm.ts:
- Lines 642-650: `getEffectiveAvatarUrl` function
- Lines 756-780: `getNextRevision` function (KEEP THIS ONE - it's tightly coupled with RevisionScheme type)
- Lines 782-861: `getFileType` function  
- Lines 863-1045: `getFileIconType` function
- Lines 1047-1050: `isCADFile` function
- Lines 1052-1074: `getInitials` function and comment
- Lines 1076-1102: `AVATAR_COLORS` constant and `getAvatarColor` function

**Note**: Keep `getNextRevision` in pdm.ts as it's tightly coupled with the `RevisionScheme` type defined there.

### Task 5: Update imports across 21+ files

Files that import from `@/types/pdm` and use these functions need updating:

**For `getInitials` (21 files):**
```typescript
// BEFORE:
import { getInitials } from '@/types/pdm'

// AFTER:
import { getInitials } from '@/lib/utils'
```

Files to update:
- `src/features/supply-chain/rfq/RFQView.tsx`
- `src/features/settings/account/UserProfileModal.tsx`
- `src/features/settings/account/ProfileSettings.tsx`
- `src/components/shared/Screens/WelcomeScreen.tsx`
- `src/features/source/explorer/file-tree/TreeItemActions.tsx`
- `src/features/source/browser/components/FileList/cells/NameCell.tsx`
- `src/components/shared/InlineActions/InlineActionButtons.tsx`
- `src/components/layout/MenuBar/MenuBar.tsx`
- `src/features/source/pending/PendingView.tsx`
- `src/components/shared/FileItem/FileItemComponents.tsx`
- `src/features/source/browser/components/FileList/cells/CheckedOutByCell.tsx`
- `src/features/source/browser/components/FileList/cells/FileStatusCell.tsx`
- `src/features/settings/account/AccountSettings.tsx`
- `src/features/source/browser/components/FileGrid/badges/CheckoutBadge.tsx`
- `src/features/settings/organization/team-members/components/user/UserRow.tsx`
- `src/features/settings/organization/team-members/tabs/TitlesTab.tsx`
- `src/features/settings/organization/team-members/tabs/RolesTab.tsx`
- `src/features/settings/organization/team-members/components/team/TeamMembersDialog.tsx`
- `src/components/shared/OnlineUsers/OnlineUsersIndicator.tsx`
- `src/components/shared/Avatar/Avatar.tsx`
- Any others found via search

**For `getAvatarColor`:**
- `src/components/shared/Avatar/Avatar.tsx`

**For `getFileType`, `getFileIconType`, `isCADFile`:**
Search for usages and update imports similarly.

### Task 6: Verify no circular dependencies

After moving:
1. `src/lib/utils/file.ts` imports from `@/types/pdm` (for types only)
2. `src/types/pdm.ts` should NOT import from `@/lib/utils`

This ensures no circular dependency.

## Testing Checklist
- [ ] `npm run typecheck` passes
- [ ] Avatars display correctly with initials
- [ ] Avatar colors are consistent for same user
- [ ] File icons display correctly
- [ ] CAD file detection works
- [ ] No runtime errors in console

## Files Modified Summary
- Created: `src/lib/utils/avatar.ts`
- Created: `src/lib/utils/file.ts`
- Modified: `src/lib/utils/index.ts`
- Modified: `src/types/pdm.ts` (remove functions, keep types)
- Modified: 21+ files (import updates)

## Coordination Notes
- **Runs AFTER Agent 1** - Agent 1 handles format utilities, this handles the remaining pdm.ts utilities
- Does not conflict with Agents 2, 3, or 4
- Must complete before final verification
