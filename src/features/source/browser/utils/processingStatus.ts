/**
 * Check if a file/folder is being processed by any operation
 * 
 * @param relativePath - The relative path to check
 * @param processingFolders - Set of paths currently being processed
 * @returns true if the path or any parent is being processed
 */
export function isPathBeingProcessed(
  relativePath: string,
  processingFolders: Set<string>
): boolean {
  // Normalize path to use forward slashes for consistent comparison
  const normalizedPath = relativePath.replace(/\\/g, '/')
  
  // Check if this exact path is being processed
  if (processingFolders.has(relativePath)) return true
  if (processingFolders.has(normalizedPath)) return true
  
  // Check if any parent folder is being processed
  for (const processingPath of processingFolders) {
    const normalizedProcessingPath = processingPath.replace(/\\/g, '/')
    if (normalizedPath.startsWith(normalizedProcessingPath + '/')) return true
  }
  return false
}
