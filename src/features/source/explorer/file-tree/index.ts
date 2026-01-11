// Barrel export for file-tree components
// Note: FileTree is exported from parent folder's index.ts

// Export sub-components
export { VaultTreeItem } from './VaultTreeItem'
export { FolderTreeItem } from './FolderTreeItem'
export { PinnedFoldersSection } from './PinnedFoldersSection'
export { RecentVaultsSection, NoVaultAccessMessage } from './RecentVaultsSection'
export { FileActionButtons, FolderActionButtons } from './TreeItemActions'
export { VirtualizedTreeRow, TREE_ROW_HEIGHT } from './VirtualizedTreeRow'

// Export hooks
export * from './hooks'

// Export types
export * from './types'

// Export constants
export * from './constants'

// Export context
export { TreeHoverProvider, useTreeHover } from './TreeHoverContext'
export type { TreeHoverState, TreeHoverSetters, TreeHoverContextValue } from './TreeHoverContext'