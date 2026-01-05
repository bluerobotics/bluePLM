import type { LocalFile } from '@/stores/pdmStore'

// Clipboard
export interface Clipboard {
  files: LocalFile[]
  operation: 'copy' | 'cut'
}

// Selection categories for multi-select operations
export interface SelectionCategories {
  downloadable: LocalFile[]    // cloud-only or outdated
  checkoutable: LocalFile[]    // synced, not checked out
  checkinable: LocalFile[]     // checked out by current user
  uploadable: LocalFile[]      // local-only, not synced
  updatable: LocalFile[]       // outdated (subset of downloadable)
}

// Checkout user info for avatars
export interface CheckoutUser {
  id: string
  name: string
  avatar_url?: string
  isMe: boolean
  count?: number
}

// Drag-drop mode
export type DragDropMode = 'tree' | 'list' | 'grid'

// Drag-drop data type constant
export const PDM_FILES_DATA_TYPE = 'application/x-plm-files'
