/**
 * File Operation Tracker
 * 
 * Provides hierarchical tracking of file operations with timing for each step.
 * Used by command handlers (checkin, checkout, download, etc.) to capture
 * detailed performance metrics for display in DevTools.
 * 
 * @example
 * ```typescript
 * const tracker = FileOperationTracker.start('checkin', files.length, paths)
 * 
 * // Track a step manually
 * const stepId = tracker.startStep('Hash file', { fileName: 'part.sldprt' })
 * const hash = await hashFile(path)
 * tracker.endStep(stepId, 'completed', { hash })
 * 
 * // Or use the withStep helper
 * const result = await tracker.withStep('Upload to storage', { size }, async () => {
 *   return await uploadFile(file)
 * })
 * 
 * tracker.endOperation('completed')
 * ```
 */

import { usePDMStore } from '../stores/pdmStore'

// ============================================================================
// Types
// ============================================================================

/**
 * All file operation types that can be tracked.
 * Maps to command handlers in src/lib/commands/handlers/
 */
export type FileOperationType =
  | 'checkin'
  | 'checkout'
  | 'download'
  | 'get-latest'
  | 'sync'
  | 'discard'
  | 'force-release'
  | 'delete'
  | 'sync-metadata'
  | 'extract-references'

/** Status of an operation or step */
export type OperationStatus = 'running' | 'completed' | 'failed'

/**
 * A single step within an operation (e.g., "Hash file", "Upload to storage").
 */
export interface OperationStep {
  /** Unique step ID */
  id: string
  /** Human-readable step name */
  name: string
  /** When the step started (ms since epoch) */
  startTime: number
  /** When the step ended (ms since epoch) */
  endTime?: number
  /** Duration in milliseconds */
  durationMs?: number
  /** Additional metadata (file name, size, hash, etc.) */
  metadata?: Record<string, unknown>
  /** Current status */
  status: OperationStatus
  /** Parent step ID for nested substeps (e.g., substeps under "Process SW files") */
  parentStepId?: string
}

/**
 * A file operation containing multiple steps.
 */
export interface FileOperation {
  /** Unique operation ID */
  id: string
  /** Operation type (checkin, checkout, etc.) */
  type: FileOperationType
  /** Number of files in the operation */
  fileCount: number
  /** Relative paths of files being processed */
  filePaths: string[]
  /** Current status */
  status: OperationStatus
  /** When the operation started (ms since epoch) */
  startTime: number
  /** When the operation ended (ms since epoch) */
  endTime?: number
  /** Total duration in milliseconds */
  durationMs?: number
  /** Error message if status is 'failed' */
  error?: string
  /** All steps with timing information */
  steps: OperationStep[]
}

// ============================================================================
// FileOperationTracker Class
// ============================================================================

/**
 * Tracks a single file operation with multiple steps.
 * 
 * Create via `FileOperationTracker.start()` static method.
 * Each tracker instance represents one operation (e.g., checking in 5 files).
 */
export class FileOperationTracker {
  private operationId: string
  private stepCounter: number = 0
  private hasEnded: boolean = false

  private constructor(operationId: string) {
    this.operationId = operationId
  }

  /**
   * Start tracking a new file operation.
   * 
   * @param type - The operation type (checkin, checkout, etc.)
   * @param fileCount - Number of files being processed
   * @param filePaths - Relative paths of files being processed
   * @returns A new FileOperationTracker instance
   */
  static start(
    type: FileOperationType,
    fileCount: number,
    filePaths: string[]
  ): FileOperationTracker {
    const id = `${type}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    
    const operation: FileOperation = {
      id,
      type,
      fileCount,
      filePaths,
      status: 'running',
      startTime: Date.now(),
      steps: []
    }

    // Add to store
    usePDMStore.getState().addOperation(operation)

    return new FileOperationTracker(id)
  }

  /**
   * Get the operation ID.
   */
  get id(): string {
    return this.operationId
  }

  /**
   * Start tracking a new step within this operation.
   * 
   * @param name - Human-readable step name (e.g., "Hash file", "Upload to storage")
   * @param metadata - Optional metadata to associate with the step
   * @returns The step ID (use to end the step later)
   */
  startStep(name: string, metadata?: Record<string, unknown>): string {
    if (this.hasEnded) {
      console.warn(`[FileOperationTracker] Cannot start step "${name}" - operation ${this.operationId} has already ended`)
      return ''
    }

    const stepId = `step-${++this.stepCounter}`
    
    const step: OperationStep = {
      id: stepId,
      name,
      startTime: Date.now(),
      status: 'running',
      metadata
    }

    usePDMStore.getState().addStep(this.operationId, step)
    return stepId
  }

  /**
   * End a step that was previously started.
   * 
   * @param stepId - The step ID returned from startStep
   * @param status - Final status ('completed' or 'failed')
   * @param metadata - Additional metadata to merge with existing
   */
  endStep(
    stepId: string,
    status: 'completed' | 'failed',
    metadata?: Record<string, unknown>
  ): void {
    if (!stepId) return

    const endTime = Date.now()
    
    usePDMStore.getState().updateStep(this.operationId, stepId, {
      endTime,
      status,
      ...(metadata && { metadata })
    })
  }

  /**
   * Convenience method to track an async function as a step.
   * Automatically records start/end times and handles errors.
   * 
   * @param name - Human-readable step name
   * @param fn - Async function to execute
   * @returns The result of the function
   * 
   * @example
   * ```typescript
   * const hash = await tracker.withStep('Hash file', { fileName }, async () => {
   *   return await window.electronAPI?.hashFile(path)
   * })
   * ```
   */
  async withStep<T>(
    name: string,
    fn: () => Promise<T>
  ): Promise<T>
  async withStep<T>(
    name: string,
    metadata: Record<string, unknown>,
    fn: () => Promise<T>
  ): Promise<T>
  async withStep<T>(
    name: string,
    metadataOrFn: Record<string, unknown> | (() => Promise<T>),
    maybeFn?: () => Promise<T>
  ): Promise<T> {
    const metadata = typeof metadataOrFn === 'function' ? undefined : metadataOrFn
    const fn = typeof metadataOrFn === 'function' ? metadataOrFn : maybeFn!

    const stepId = this.startStep(name, metadata)
    
    try {
      const result = await fn()
      this.endStep(stepId, 'completed')
      return result
    } catch (error) {
      this.endStep(stepId, 'failed', {
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  /**
   * Convenience method to track a synchronous function as a step.
   * 
   * @param name - Human-readable step name
   * @param fn - Sync function to execute
   * @returns The result of the function
   */
  withStepSync<T>(name: string, fn: () => T): T
  withStepSync<T>(name: string, metadata: Record<string, unknown>, fn: () => T): T
  withStepSync<T>(
    name: string,
    metadataOrFn: Record<string, unknown> | (() => T),
    maybeFn?: () => T
  ): T {
    const metadata = typeof metadataOrFn === 'function' ? undefined : metadataOrFn
    const fn = typeof metadataOrFn === 'function' ? metadataOrFn : maybeFn!

    const stepId = this.startStep(name, metadata)
    
    try {
      const result = fn()
      this.endStep(stepId, 'completed')
      return result
    } catch (error) {
      this.endStep(stepId, 'failed', {
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  /**
   * Mark the operation as complete.
   * 
   * @param status - Final status ('completed' or 'failed')
   * @param error - Error message if status is 'failed'
   */
  endOperation(status: 'completed' | 'failed', error?: string): void {
    if (this.hasEnded) {
      console.warn(`[FileOperationTracker] Operation ${this.operationId} has already ended`)
      return
    }

    this.hasEnded = true
    const endTime = Date.now()

    usePDMStore.getState().updateOperation(this.operationId, {
      status,
      endTime,
      error
    })
  }

  /**
   * Add metadata to the operation without ending it.
   * Useful for adding summary information during processing.
   * 
   * Creates a virtual step with the metadata attached.
   * 
   * @param name - Name for the metadata entry
   * @param metadata - Metadata to add to the operation
   */
  addMetadata(name: string, metadata: Record<string, unknown>): void {
    const stepId = this.startStep(name, metadata)
    this.endStep(stepId, 'completed')
  }

  /**
   * Add a substep with timing information under a parent step.
   * Used for aggregate timing data (e.g., "checkoutAPI (252 calls)").
   * 
   * @param parentStepId - The parent step ID this substep belongs to
   * @param name - Substep name (e.g., "checkoutAPI (252 calls)")
   * @param durationMs - Total duration in milliseconds
   * @param metadata - Additional metadata (avgMs, callCount, etc.)
   */
  addSubstep(
    parentStepId: string,
    name: string,
    durationMs: number,
    metadata?: Record<string, unknown>
  ): void {
    if (this.hasEnded) {
      console.warn(`[FileOperationTracker] Cannot add substep "${name}" - operation ${this.operationId} has already ended`)
      return
    }

    const stepId = `substep-${++this.stepCounter}`
    const now = Date.now()
    
    const step: OperationStep = {
      id: stepId,
      name,
      startTime: now - durationMs, // Back-calculate start time
      endTime: now,
      durationMs,
      status: 'completed',
      metadata,
      parentStepId
    }

    usePDMStore.getState().addStep(this.operationId, step)
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format duration in milliseconds to a human-readable string.
 * 
 * @param ms - Duration in milliseconds
 * @returns Formatted string (e.g., "1.23s", "456ms")
 */
export function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '-'
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`
  const minutes = Math.floor(ms / 60000)
  const seconds = ((ms % 60000) / 1000).toFixed(1)
  return `${minutes}m ${seconds}s`
}

/**
 * Get display name for an operation type.
 * 
 * @param type - The operation type
 * @returns Human-readable display name
 */
export function getOperationDisplayName(type: FileOperationType): string {
  const names: Record<FileOperationType, string> = {
    'checkin': 'Check In',
    'checkout': 'Check Out',
    'download': 'Download',
    'get-latest': 'Get Latest',
    'sync': 'Sync',
    'discard': 'Discard',
    'force-release': 'Force Release',
    'delete': 'Delete',
    'sync-metadata': 'Sync Metadata',
    'extract-references': 'Extract References'
  }
  return names[type] ?? type
}
