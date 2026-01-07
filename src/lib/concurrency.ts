/**
 * Concurrency Utilities for BluePLM
 * 
 * Provides controlled parallel execution to prevent overwhelming
 * the server or network with too many simultaneous requests.
 */

/** Default number of concurrent operations for file operations */
export const CONCURRENT_OPERATIONS = 20

/**
 * Lower concurrency for SolidWorks operations.
 * The SW service uses a serial stdin/stdout pipe, so high concurrency
 * just creates contention. 3 workers allows some parallelism for
 * queueing while respecting the serial nature of the service.
 */
export const SW_CONCURRENT_OPERATIONS = 3

/** Default batch size for bulk database operations */
export const BATCH_CHUNK_SIZE = 100

/** Default interval for yielding to event loop during batch operations */
export const YIELD_INTERVAL = 5

/**
 * Yield to the event loop to keep UI responsive during long-running operations.
 * Uses setTimeout(0) to allow React re-renders, user input, and animations.
 */
export function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

/**
 * Options for processWithConcurrency
 */
export interface ProcessWithConcurrencyOptions {
  /**
   * Number of items to process before yielding to event loop.
   * Lower values = more responsive UI but slightly slower overall.
   * Default: 5
   */
  yieldInterval?: number
  
  /**
   * Callback invoked after each item completes.
   * Useful for progress tracking.
   */
  onItemComplete?: (index: number, total: number) => void
}

/**
 * Process items with limited concurrency using a worker pool pattern.
 * Periodically yields to the event loop to keep UI responsive.
 * 
 * @param items - Array of items to process
 * @param maxConcurrent - Maximum number of concurrent operations
 * @param processor - Async function to process each item
 * @param options - Optional configuration for yielding and callbacks
 * @returns Array of results in the same order as input items
 */
export async function processWithConcurrency<T, R>(
  items: T[],
  maxConcurrent: number,
  processor: (item: T) => Promise<R>,
  options?: ProcessWithConcurrencyOptions
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0
  let completedCount = 0
  const yieldInterval = options?.yieldInterval ?? YIELD_INTERVAL
  const onItemComplete = options?.onItemComplete
  
  async function worker() {
    let itemsProcessedSinceYield = 0
    
    while (nextIndex < items.length) {
      const index = nextIndex++
      results[index] = await processor(items[index])
      completedCount++
      itemsProcessedSinceYield++
      
      // Notify progress if callback provided
      if (onItemComplete) {
        onItemComplete(completedCount, items.length)
      }
      
      // Yield to event loop periodically to keep UI responsive
      if (itemsProcessedSinceYield >= yieldInterval) {
        await yieldToEventLoop()
        itemsProcessedSinceYield = 0
      }
    }
  }
  
  // Create worker pool - min of maxConcurrent and items.length
  const workerCount = Math.min(maxConcurrent, items.length)
  await Promise.all(
    Array.from({ length: workerCount }, () => worker())
  )
  
  return results
}

/**
 * Split an array into chunks for batch processing
 */
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize))
  }
  return chunks
}
