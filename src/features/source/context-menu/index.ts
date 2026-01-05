// src/features/source/context-menu/index.ts

// Main component - standalone FileContextMenu with simple interface
export { FileContextMenu } from './FileContextMenu'

// Types
export * from './types'

// Items
export {
  ClipboardItems,
  FileOperationItems,
  PDMItems,
  CollaborationItems,
  NavigationItems,
  AdminItems,
  DeleteItems
} from './items'

// Dialogs
export {
  DeleteConfirmDialog,
  DeleteLocalConfirmDialog,
  ForceCheckinDialog,
  PropertiesDialog,
  ReviewRequestDialog,
  CheckoutRequestDialog,
  MentionDialog,
  ShareLinkDialog,
  AddToECODialog
} from './dialogs'

// Hooks
export { useMenuPosition, useContextMenuState } from './hooks'

// Utils - re-export from central location
export { formatFileSize as formatSize, getCountLabel, plural } from '@/lib/utils'

// Constants
export { SW_EXTENSIONS, MENU_PADDING, SUBMENU_WIDTH, DEFAULT_SHARE_EXPIRY_DAYS, MAX_VISIBLE_FILES } from './constants'
