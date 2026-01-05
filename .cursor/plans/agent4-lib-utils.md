# Agent 4: Library Utilities Reorganization

## Mission
Reorganize `src/lib/` to contain only pure utilities, separating business logic that should move to services or features.

## Ownership Boundaries

**FILES YOU OWN (only you touch these):**
- `src/lib/utils.ts` → Split into `src/lib/utils/`
- `src/lib/clipboard.ts` → Keep, clean up
- `src/lib/analytics.ts` → Keep, clean up
- `src/lib/serialization.ts` → Evaluate placement
- `src/lib/storage.ts` → Evaluate placement
- `src/lib/network.ts` → Evaluate placement
- Create new: `src/lib/utils/` directory

**FILES YOU MUST NOT TOUCH:**
- `src/lib/supabase/` (Agent 6 will handle moving to services)
- `src/lib/commands/` (Agent 6 will handle moving to services)
- `src/lib/i18n/` (well-organized, leave alone)
- `src/lib/realtime.ts` (business logic, Agent 6)
- `src/lib/backup.ts` (belongs with backup feature)
- `src/lib/weather.ts` (Agent 3 moving to seasonal-effects)
- `src/lib/snowPhysics.ts` (Agent 3 moving to seasonal-effects)
- `src/lib/workflows.ts` (business logic)

---

## Task 1: Audit Current lib/utils.ts

### Steps
1. Read `src/lib/utils.ts`
2. Identify utility categories:
   - Date/time utilities
   - String utilities
   - File/path utilities
   - Array/object utilities
   - Formatting utilities

---

## Task 2: Create Utils Directory Structure

```
src/lib/utils/
├── date.ts          # Date formatting, parsing, comparison
├── string.ts        # String manipulation, truncation
├── path.ts          # File path utilities (platform-aware)
├── format.ts        # Number, size, duration formatting
├── array.ts         # Array utilities if any
├── validation.ts    # Input validation helpers
└── index.ts         # Barrel export
```

---

## Task 3: Create Date Utilities

Create `src/lib/utils/date.ts`:
```typescript
/**
 * Date and time utilities
 */

/**
 * Format a date for display
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Format a date with time
 */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  return formatDate(d)
}

/**
 * Check if two dates are the same day
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  )
}

/**
 * Get start of day
 */
export function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}
```

---

## Task 4: Create String Utilities

Create `src/lib/utils/string.ts`:
```typescript
/**
 * String manipulation utilities
 */

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 3) + '...'
}

/**
 * Capitalize first letter
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Convert to title case
 */
export function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => capitalize(word))
    .join(' ')
}

/**
 * Slugify a string (for URLs, IDs)
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(str: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return str.replace(/[&<>"']/g, char => htmlEntities[char])
}

/**
 * Generate a random ID
 */
export function generateId(prefix = ''): string {
  const random = Math.random().toString(36).substring(2, 9)
  return prefix ? `${prefix}-${random}` : random
}
```

---

## Task 5: Create Path Utilities

Create `src/lib/utils/path.ts`:
```typescript
/**
 * File path utilities - platform-aware
 */

// Detect platform separator
export const sep = typeof window !== 'undefined' && navigator.platform.includes('Win') ? '\\' : '/'

/**
 * Normalize path separators to platform default
 */
export function normalizePath(path: string): string {
  return path.replace(/[/\\]/g, sep)
}

/**
 * Normalize path separators to forward slashes (for URLs, storage)
 */
export function toForwardSlash(path: string): string {
  return path.replace(/\\/g, '/')
}

/**
 * Get file name from path
 */
export function getFileName(path: string): string {
  const normalized = toForwardSlash(path)
  return normalized.split('/').pop() || ''
}

/**
 * Get file extension (with dot)
 */
export function getExtension(path: string): string {
  const fileName = getFileName(path)
  const dotIndex = fileName.lastIndexOf('.')
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : ''
}

/**
 * Get file name without extension
 */
export function getBaseName(path: string): string {
  const fileName = getFileName(path)
  const dotIndex = fileName.lastIndexOf('.')
  return dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName
}

/**
 * Get parent directory path
 */
export function getDirectory(path: string): string {
  const normalized = toForwardSlash(path)
  const lastSlash = normalized.lastIndexOf('/')
  return lastSlash >= 0 ? normalized.slice(0, lastSlash) : ''
}

/**
 * Join path segments
 */
export function joinPath(...segments: string[]): string {
  return segments
    .filter(Boolean)
    .map(s => s.replace(/^[/\\]+|[/\\]+$/g, ''))
    .join(sep)
}

/**
 * Build full path from vault path and relative path
 */
export function buildFullPath(vaultPath: string, relativePath: string): string {
  if (!vaultPath || !relativePath) return relativePath || vaultPath || ''
  return joinPath(vaultPath, relativePath)
}

/**
 * Get relative path from full path and vault path
 */
export function getRelativePath(fullPath: string, vaultPath: string): string {
  const normalizedFull = toForwardSlash(fullPath).toLowerCase()
  const normalizedVault = toForwardSlash(vaultPath).toLowerCase()
  
  if (normalizedFull.startsWith(normalizedVault)) {
    const relative = fullPath.slice(vaultPath.length)
    return relative.replace(/^[/\\]+/, '')
  }
  return fullPath
}
```

---

## Task 6: Create Format Utilities

Create `src/lib/utils/format.ts`:
```typescript
/**
 * Formatting utilities for display
 */

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

/**
 * Format number with commas
 */
export function formatNumber(num: number): string {
  return num.toLocaleString()
}

/**
 * Format percentage
 */
export function formatPercent(value: number, decimals = 0): string {
  return `${(value * 100).toFixed(decimals)}%`
}

/**
 * Format duration in milliseconds to human readable
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}

/**
 * Format bytes per second
 */
export function formatSpeed(bytesPerSecond: number): string {
  return `${formatFileSize(bytesPerSecond)}/s`
}
```

---

## Task 7: Create Validation Utilities

Create `src/lib/utils/validation.ts`:
```typescript
/**
 * Input validation utilities
 */

/**
 * Check if string is a valid email
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Check if string is empty or whitespace only
 */
export function isBlank(str: string | null | undefined): boolean {
  return !str || str.trim().length === 0
}

/**
 * Check if string is a valid URL
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * Sanitize filename (remove invalid characters)
 */
export function sanitizeFileName(name: string): string {
  // Remove characters invalid on Windows: \ / : * ? " < > |
  return name.replace(/[\\/:*?"<>|]/g, '_')
}

/**
 * Check if path is safe (no directory traversal)
 */
export function isSafePath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/')
  return !normalized.includes('../') && !normalized.includes('/..')
}
```

---

## Task 8: Create Barrel Export

Create `src/lib/utils/index.ts`:
```typescript
// Date utilities
export * from './date'

// String utilities
export * from './string'

// Path utilities
export * from './path'

// Formatting utilities
export * from './format'

// Validation utilities
export * from './validation'
```

---

## Task 9: Update Original utils.ts

After creating all utility files, update `src/lib/utils.ts` to re-export from the new location:

```typescript
/**
 * @deprecated Import from '@/lib/utils/*' instead
 * This file re-exports for backward compatibility
 */
export * from './utils/index'

// Keep any utilities that don't fit the new categories here
// and gradually migrate them
```

---

## Task 10: Clean Up clipboard.ts

### Steps
1. Read `src/lib/clipboard.ts`
2. Ensure it only contains clipboard operations (no unrelated utilities)
3. Add proper JSDoc comments
4. Ensure proper error handling

---

## Task 11: Clean Up analytics.ts

### Steps
1. Read `src/lib/analytics.ts`
2. Ensure it contains only analytics/telemetry utilities
3. Add proper JSDoc comments

---

## Task 12: Evaluate Other Files

For each of these files, decide if they belong in lib/ or should be noted for future moves:

### `src/lib/storage.ts`
- If it's about localStorage/browser storage → Keep in lib/
- If it's about Supabase storage → Should move to services/

### `src/lib/serialization.ts`
- Pure utility for data serialization → Keep in lib/
- Business logic for specific formats → Consider moving

### `src/lib/network.ts`
- Network utility functions → Keep in lib/
- API-specific logic → Should move to services/

---

## Import Migration Guide

### Old Import
```typescript
import { formatFileSize, truncate } from '../lib/utils'
```

### New Import Options
```typescript
// Specific category import (preferred)
import { formatFileSize } from '@/lib/utils/format'
import { truncate } from '@/lib/utils/string'

// Barrel import (acceptable)
import { formatFileSize, truncate } from '@/lib/utils'
```

---

## Verification Checklist

- [ ] `src/lib/utils/` directory created with all utility files
- [ ] `src/lib/utils/index.ts` barrel export working
- [ ] `src/lib/utils.ts` re-exports from new location
- [ ] `clipboard.ts` and `analytics.ts` cleaned up
- [ ] No business logic mixed with pure utilities
- [ ] `npm run typecheck` passes
- [ ] Search for `from '../lib/utils'` - all imports still work

---

## Notes for Agent

1. **Pure utilities only** - No side effects, no API calls, no store access
2. **Preserve existing function signatures** - Don't break existing callers
3. **Add JSDoc comments** - Document parameters and return values
4. **Platform awareness** - Path utilities must work on Windows and Mac
5. **Test utilities** - These are highly testable, consider adding tests later
