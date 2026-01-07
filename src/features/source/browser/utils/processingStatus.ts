import type { OperationType } from '@/stores/types'

/**
 * Check if a file/folder is being processed by any operation
 * 
 * @param relativePath - The relative path to check
 * @param processingOperations - Map of paths to operation types currently being processed
 * @returns true if the path or any parent is being processed
 */
export function isPathBeingProcessed(
  relativePath: string,
  processingOperations: Map<string, OperationType>
): boolean {
  return getPathProcessingOperation(relativePath, processingOperations) !== null
}

/**
 * Get the operation type for a file/folder if it's being processed
 * 
 * @param relativePath - The relative path to check
 * @param processingOperations - Map of paths to operation types
 * @returns The operation type if processing, null otherwise
 */
export function getPathProcessingOperation(
  relativePath: string,
  processingOperations: Map<string, OperationType>
): OperationType | null {
  // Normalize path to use forward slashes for consistent comparison
  const normalizedPath = relativePath.replace(/\\/g, '/')
  
  // Check if this exact path is being processed
  if (processingOperations.has(relativePath)) {
    return processingOperations.get(relativePath)!
  }
  if (processingOperations.has(normalizedPath)) {
    return processingOperations.get(normalizedPath)!
  }
  
  // Check if any parent folder is being processed
  for (const [processingPath, opType] of processingOperations) {
    const normalizedProcessingPath = processingPath.replace(/\\/g, '/')
    if (normalizedPath.startsWith(normalizedProcessingPath + '/')) {
      return opType
    }
  }
  return null
}
