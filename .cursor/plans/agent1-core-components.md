# Agent 1: Core Components Extraction

## Mission
Extract reusable UI primitives from the codebase into a clean `components/core/` directory with consistent patterns.

## Ownership Boundaries

**FILES YOU OWN (only you touch these):**
- `src/components/Toast.tsx` → Move to `src/components/core/Toast/`
- `src/components/ErrorBoundary.tsx` → Move to `src/components/core/ErrorBoundary/`
- Create new: `src/components/core/Loader/`
- Create new: `src/components/core/Dialog/`
- Create new: `src/components/core/index.ts`

**FILES YOU MUST NOT TOUCH:**
- Any file in `features/`, `settings/`, `sidebar/`, `backup/`, `command-search/`, `activity-bar/`
- `FileBrowser.tsx`, `Sidebar.tsx`, `App.tsx`
- Store files, lib files, hooks files

---

## Task 1: Create Core Directory Structure

Create the following structure:
```
src/components/core/
├── Toast/
│   ├── Toast.tsx
│   ├── types.ts
│   └── index.ts
├── ErrorBoundary/
│   ├── ErrorBoundary.tsx
│   └── index.ts
├── Loader/
│   ├── Loader.tsx
│   ├── Spinner.tsx
│   └── index.ts
├── Dialog/
│   ├── Dialog.tsx
│   ├── ConfirmDialog.tsx
│   ├── types.ts
│   └── index.ts
└── index.ts
```

---

## Task 2: Extract Toast Component

### Current Location
`src/components/Toast.tsx`

### Steps
1. Read `src/components/Toast.tsx`
2. Create `src/components/core/Toast/Toast.tsx` with the component
3. Create `src/components/core/Toast/types.ts` with toast types (extract from stores/types.ts):
```typescript
export type ToastType = 'error' | 'success' | 'info' | 'warning' | 'progress' | 'update'

export interface ToastMessage {
  id: string
  type: ToastType
  message: string
  duration?: number
  progress?: number
}
```
4. Create `src/components/core/Toast/index.ts`:
```typescript
export { Toast } from './Toast'
export type { ToastType, ToastMessage } from './types'
```
5. Update `src/components/Toast.tsx` to be a re-export stub (temporary):
```typescript
// Re-export from core for backward compatibility
export { Toast } from './core/Toast'
```

---

## Task 3: Extract ErrorBoundary Component

### Current Location
`src/components/ErrorBoundary.tsx`

### Steps
1. Read `src/components/ErrorBoundary.tsx`
2. Create `src/components/core/ErrorBoundary/ErrorBoundary.tsx`
3. Create `src/components/core/ErrorBoundary/index.ts`:
```typescript
export { ErrorBoundary } from './ErrorBoundary'
```
4. Update original file to be a re-export stub

---

## Task 4: Create Loader Components

### Pattern to Extract
Search for `Loader2` usage with `animate-spin` pattern across codebase.

### Create Components
1. Create `src/components/core/Loader/Spinner.tsx`:
```typescript
import { Loader2 } from 'lucide-react'

interface SpinnerProps {
  size?: number
  className?: string
}

export function Spinner({ size = 20, className = '' }: SpinnerProps) {
  return (
    <Loader2 
      size={size} 
      className={`animate-spin text-plm-fg-muted ${className}`} 
    />
  )
}
```

2. Create `src/components/core/Loader/Loader.tsx`:
```typescript
import { Spinner } from './Spinner'

interface LoaderProps {
  text?: string
  size?: number
  className?: string
}

export function Loader({ text, size = 24, className = '' }: LoaderProps) {
  return (
    <div className={`flex items-center justify-center gap-2 ${className}`}>
      <Spinner size={size} />
      {text && <span className="text-plm-fg-muted">{text}</span>}
    </div>
  )
}
```

3. Create `src/components/core/Loader/index.ts`:
```typescript
export { Loader } from './Loader'
export { Spinner } from './Spinner'
```

---

## Task 5: Create Dialog Base Components

### Pattern to Extract
Look at dialog patterns in:
- `src/components/context-menu/dialogs/`
- `src/components/VaultNotFoundDialog.tsx`
- `src/components/UpdateModal.tsx`

### Create Components
1. Create `src/components/core/Dialog/types.ts`:
```typescript
export interface DialogProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  className?: string
}

export interface ConfirmDialogProps extends Omit<DialogProps, 'children'> {
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  variant?: 'danger' | 'warning' | 'info'
}
```

2. Create `src/components/core/Dialog/Dialog.tsx`:
```typescript
import { X } from 'lucide-react'
import type { DialogProps } from './types'

export function Dialog({ open, onClose, title, children, className = '' }: DialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50" 
        onClick={onClose}
      />
      
      {/* Dialog */}
      <div className={`relative bg-plm-bg-secondary border border-plm-border rounded-lg shadow-xl max-w-md w-full mx-4 ${className}`}>
        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-plm-border">
            <h2 className="text-lg font-medium text-plm-fg">{title}</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-plm-bg-tertiary rounded"
            >
              <X size={18} className="text-plm-fg-muted" />
            </button>
          </div>
        )}
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>
  )
}
```

3. Create `src/components/core/Dialog/ConfirmDialog.tsx`:
```typescript
import { AlertTriangle, Info, AlertCircle } from 'lucide-react'
import { Dialog } from './Dialog'
import type { ConfirmDialogProps } from './types'

const variantConfig = {
  danger: { icon: AlertTriangle, color: 'text-red-400', button: 'bg-red-600 hover:bg-red-700' },
  warning: { icon: AlertCircle, color: 'text-amber-400', button: 'bg-amber-600 hover:bg-amber-700' },
  info: { icon: Info, color: 'text-blue-400', button: 'bg-blue-600 hover:bg-blue-700' },
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  variant = 'info',
}: ConfirmDialogProps) {
  const config = variantConfig[variant]
  const Icon = config.icon

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="flex gap-3">
        <Icon size={24} className={config.color} />
        <p className="text-plm-fg-muted">{message}</p>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-plm-fg-muted hover:bg-plm-bg-tertiary rounded"
        >
          {cancelText}
        </button>
        <button
          onClick={() => {
            onConfirm()
            onClose()
          }}
          className={`px-4 py-2 text-sm text-white rounded ${config.button}`}
        >
          {confirmText}
        </button>
      </div>
    </Dialog>
  )
}
```

4. Create `src/components/core/Dialog/index.ts`:
```typescript
export { Dialog } from './Dialog'
export { ConfirmDialog } from './ConfirmDialog'
export type { DialogProps, ConfirmDialogProps } from './types'
```

---

## Task 6: Create Main Barrel Export

Create `src/components/core/index.ts`:
```typescript
// Core UI primitives
export * from './Toast'
export * from './ErrorBoundary'
export * from './Loader'
export * from './Dialog'
```

---

## Import Update Instructions

After creating all components, update these imports across the codebase.

### Toast Imports
Search: `from.*['"]\.\./components/Toast['"]` or `from.*['"]@/components/Toast['"]`
Replace with: `from '@/components/core'`

### ErrorBoundary Imports
Search: `from.*ErrorBoundary`
Replace with: `from '@/components/core'`

---

## Verification Checklist

- [ ] `src/components/core/Toast/` exists with Toast.tsx, types.ts, index.ts
- [ ] `src/components/core/ErrorBoundary/` exists with ErrorBoundary.tsx, index.ts
- [ ] `src/components/core/Loader/` exists with Loader.tsx, Spinner.tsx, index.ts
- [ ] `src/components/core/Dialog/` exists with Dialog.tsx, ConfirmDialog.tsx, types.ts, index.ts
- [ ] `src/components/core/index.ts` barrel export exists
- [ ] Old files have re-export stubs for backward compatibility
- [ ] `npm run typecheck` passes

---

## Notes for Agent

1. **Do NOT delete original files** - create re-export stubs for backward compatibility
2. **Use @/ import alias** when importing from other parts of the codebase
3. **Follow existing Tailwind patterns** - use `plm-bg`, `plm-fg`, `plm-border` classes
4. **Check for existing similar patterns** before creating new components
