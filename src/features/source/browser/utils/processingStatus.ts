import type { OperationType } from '@/stores/types'

/**
 * Get the operation type for a FILE if it's being processed (exact match only)
 * Does NOT propagate from parent folders - only returns if this specific file is processing
 */
export function getFileProcessingOperation(
  relativePath: string,
  processingOperations: Map<string, OperationType>
): OperationType | null {
  const normalizedPath = relativePath.replace(/\\/g, '/')
  
  if (processingOperations.has(relativePath)) {
    return processingOperations.get(relativePath)!
  }
  if (processingOperations.has(normalizedPath)) {
    return processingOperations.get(normalizedPath)!
  }
  
  return null
}

/**
 * Get the operation type for a FOLDER if any of its descendants are being processed
 */
export function getFolderProcessingOperation(
  folderPath: string,
  processingOperations: Map<string, OperationType>
): OperationType | null {
  const normalizedFolder = folderPath.replace(/\\/g, '/')
  
  // Check if the folder itself is being processed
  if (processingOperations.has(folderPath)) {
    return processingOperations.get(folderPath)!
  }
  if (processingOperations.has(normalizedFolder)) {
    return processingOperations.get(normalizedFolder)!
  }
  
  // Check if any descendant path is being processed
  for (const [path, opType] of processingOperations) {
    const normalizedPath = path.replace(/\\/g, '/')
    if (normalizedPath.startsWith(normalizedFolder + '/')) {
      return opType
    }
  }
  
  return null
}

/**
 * Smart processing operation getter that handles both files and folders correctly
 * - For files: only returns if THIS exact path is processing
 * - For folders: returns if the folder itself OR any descendant is processing
 */
export function getProcessingOperation(
  relativePath: string,
  processingOperations: Map<string, OperationType>,
  isDirectory: boolean
): OperationType | null {
  if (isDirectory) {
    return getFolderProcessingOperation(relativePath, processingOperations)
  } else {
    return getFileProcessingOperation(relativePath, processingOperations)
  }
}
