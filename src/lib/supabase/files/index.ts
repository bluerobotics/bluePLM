// Query functions - read operations
export {
  getFiles,
  getFilesLightweight,
  getCheckedOutUsers,
  getUserBasicInfo,
  getFile,
  getFileByPath,
  getFileVersions,
  getWhereUsed,
  getContains,
  getContainsRecursive,
  getMyCheckedOutFiles,
  getAllCheckedOutFiles,
  getFileReferenceDiagnostics,
  getVaultFilesForDiagnostics
} from './queries'

// Export types for recursive BOM queries and diagnostics
export type { BomTreeNode, FileReferenceDiagnostic, VaultFileSummary } from './queries'

// Checkout functions - check out/in operations
export {
  checkoutFile,
  checkinFile,
  syncSolidWorksFileMetadata,
  undoCheckout,
  adminForceDiscardCheckout
} from './checkout'

// Mutation functions - sync and metadata updates
export {
  syncFile,
  updateFileMetadata,
  updateFilePath,
  updateFolderPath,
  upsertFileReferences
} from './mutations'

// Export types for file references
export type { SWReference, UpsertReferencesResult, SkippedReferenceReason } from './mutations'

// Trash functions - soft delete, restore, permanent delete
export {
  softDeleteFile,
  softDeleteFiles,
  restoreFile,
  restoreFiles,
  permanentlyDeleteFile,
  permanentlyDeleteFiles,
  getDeletedFiles,
  getDeletedFilesCount,
  emptyTrash
} from './trash'

// Version functions - rollback, state transitions
export {
  rollbackToVersion,
  transitionFileState
} from './versions'