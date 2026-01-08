import type { OperationType } from '@/stores/types'

/**
 * Get the operation type for a FILE if it's being processed.
 * Checks for exact match OR if this file is inside a processing folder (downward propagation).
 */
export function getFileProcessingOperation(
  relativePath: string,
  processingOperations: Map<string, OperationType>
): OperationType | null {
  const normalizedPath = relativePath.replace(/\\/g, '/')
  
  // Check exact match first
  if (processingOperations.has(relativePath)) {
    return processingOperations.get(relativePath)!
  }
  if (processingOperations.has(normalizedPath)) {
    return processingOperations.get(normalizedPath)!
  }
  
  // Check if this file is INSIDE any processing folder (downward propagation)
  for (const [processingPath, opType] of processingOperations) {
    const normalizedProcessingPath = processingPath.replace(/\\/g, '/')
    if (normalizedPath.startsWith(normalizedProcessingPath + '/')) {
      return opType
    }
  }
  
  return null
}

/**
 * Get the operation type for a FOLDER if it's being processed.
 * Checks for exact match OR if this folder is inside a processing folder (downward propagation).
 * Does NOT propagate UP to parent folders.
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
  
  // Check if this folder is INSIDE any processing folder (downward propagation)
  // This makes spinners propagate DOWN to children, not UP to parents
  for (const [path, opType] of processingOperations) {
    const normalizedPath = path.replace(/\\/g, '/')
    if (normalizedFolder.startsWith(normalizedPath + '/')) {
      return opType
    }
  }
  
  return null
}

/**
 * Smart processing operation getter that handles both files and folders correctly
 * - For both: returns if the exact path is processing OR if it's inside a processing folder
 * - Spinners propagate DOWN to children, NOT up to parents
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
