/**
 * Operation Log Slice
 * 
 * Zustand slice for storing file operation logs with hierarchical step tracking.
 * Used by DevTools to display detailed timing information for each operation.
 * 
 * Features:
 * - Circular buffer storage (max 100 operations)
 * - Per-step timing tracking
 * - Selection state for UI expansion
 */

import { StateCreator } from 'zustand'
import type { PDMStoreState } from '../types'
import type { 
  FileOperation, 
  OperationStep, 
  FileOperationType,
  OperationStatus 
} from '../../lib/fileOperationTracker'

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of operations to keep in the circular buffer */
const MAX_OPERATIONS = 100

// ============================================================================
// Slice Types
// ============================================================================

export interface OperationLogSlice {
  // ═══════════════════════════════════════════════════════════════
  // State
  // ═══════════════════════════════════════════════════════════════
  
  /** Array of file operations (circular buffer, max 100) */
  operations: FileOperation[]
  
  /** Currently selected operation ID for detailed view */
  selectedOperationId: string | null
  
  // ═══════════════════════════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════════════════════════
  
  /** Add a new operation to the log */
  addOperation: (operation: FileOperation) => void
  
  /** Update an existing operation */
  updateOperation: (operationId: string, updates: Partial<Omit<FileOperation, 'id' | 'type' | 'steps'>>) => void
  
  /** Add a step to an operation */
  addStep: (operationId: string, step: OperationStep) => void
  
  /** Update a step within an operation */
  updateStep: (
    operationId: string, 
    stepId: string, 
    updates: Partial<Omit<OperationStep, 'id' | 'name' | 'startTime'>>
  ) => void
  
  /** Clear all operations from the log */
  clearOperations: () => void
  
  /** Set the selected operation for detailed view */
  setSelectedOperation: (operationId: string | null) => void
  
  // ═══════════════════════════════════════════════════════════════
  // Getters
  // ═══════════════════════════════════════════════════════════════
  
  /** Get an operation by ID */
  getOperation: (operationId: string) => FileOperation | undefined
  
  /** Get the currently selected operation */
  getSelectedOperation: () => FileOperation | undefined
  
  /** Get operations filtered by type */
  getOperationsByType: (type: FileOperationType) => FileOperation[]
  
  /** Get operations filtered by status */
  getOperationsByStatus: (status: OperationStatus) => FileOperation[]
  
  /** Get the most recent operation */
  getLatestOperation: () => FileOperation | undefined
  
  /** Get running operations */
  getRunningOperations: () => FileOperation[]
}

// ============================================================================
// Slice Creator
// ============================================================================

export const createOperationLogSlice: StateCreator<
  PDMStoreState,
  [['zustand/persist', unknown]],
  [],
  OperationLogSlice
> = (set, get) => ({
  // ═══════════════════════════════════════════════════════════════
  // Initial State
  // ═══════════════════════════════════════════════════════════════
  
  operations: [],
  selectedOperationId: null,
  
  // ═══════════════════════════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════════════════════════
  
  addOperation: (operation: FileOperation) => {
    set(state => {
      // Add new operation and trim to max size (circular buffer)
      const newOperations = [...state.operations, operation]
      if (newOperations.length > MAX_OPERATIONS) {
        return { operations: newOperations.slice(-MAX_OPERATIONS) }
      }
      return { operations: newOperations }
    })
  },
  
  updateOperation: (operationId: string, updates: Partial<Omit<FileOperation, 'id' | 'type' | 'steps'>>) => {
    set(state => {
      const operationIndex = state.operations.findIndex(op => op.id === operationId)
      if (operationIndex === -1) return state
      
      const operation = state.operations[operationIndex]
      const endTime = updates.endTime ?? operation.endTime
      const startTime = operation.startTime
      
      // Calculate duration if we have both start and end times
      const durationMs = endTime !== undefined ? endTime - startTime : operation.durationMs
      
      const updatedOperation: FileOperation = {
        ...operation,
        ...updates,
        durationMs
      }
      
      const newOperations = [...state.operations]
      newOperations[operationIndex] = updatedOperation
      
      return { operations: newOperations }
    })
  },
  
  addStep: (operationId: string, step: OperationStep) => {
    set(state => {
      const operationIndex = state.operations.findIndex(op => op.id === operationId)
      if (operationIndex === -1) return state
      
      const operation = state.operations[operationIndex]
      const updatedOperation: FileOperation = {
        ...operation,
        steps: [...operation.steps, step]
      }
      
      const newOperations = [...state.operations]
      newOperations[operationIndex] = updatedOperation
      
      return { operations: newOperations }
    })
  },
  
  updateStep: (
    operationId: string, 
    stepId: string, 
    updates: Partial<Omit<OperationStep, 'id' | 'name' | 'startTime'>>
  ) => {
    set(state => {
      const operationIndex = state.operations.findIndex(op => op.id === operationId)
      if (operationIndex === -1) return state
      
      const operation = state.operations[operationIndex]
      const stepIndex = operation.steps.findIndex(s => s.id === stepId)
      if (stepIndex === -1) return state
      
      const step = operation.steps[stepIndex]
      const endTime = updates.endTime ?? step.endTime
      const startTime = step.startTime
      
      // Calculate duration if we have both start and end times
      const durationMs = endTime !== undefined ? endTime - startTime : step.durationMs
      
      // Merge metadata if both exist
      const metadata = updates.metadata 
        ? { ...step.metadata, ...updates.metadata }
        : step.metadata
      
      const updatedStep: OperationStep = {
        ...step,
        ...updates,
        durationMs,
        metadata
      }
      
      const newSteps = [...operation.steps]
      newSteps[stepIndex] = updatedStep
      
      const updatedOperation: FileOperation = {
        ...operation,
        steps: newSteps
      }
      
      const newOperations = [...state.operations]
      newOperations[operationIndex] = updatedOperation
      
      return { operations: newOperations }
    })
  },
  
  clearOperations: () => {
    set({ operations: [], selectedOperationId: null })
  },
  
  setSelectedOperation: (operationId: string | null) => {
    set({ selectedOperationId: operationId })
  },
  
  // ═══════════════════════════════════════════════════════════════
  // Getters
  // ═══════════════════════════════════════════════════════════════
  
  getOperation: (operationId: string) => {
    return get().operations.find(op => op.id === operationId)
  },
  
  getSelectedOperation: () => {
    const { operations, selectedOperationId } = get()
    if (!selectedOperationId) return undefined
    return operations.find(op => op.id === selectedOperationId)
  },
  
  getOperationsByType: (type: FileOperationType) => {
    return get().operations.filter(op => op.type === type)
  },
  
  getOperationsByStatus: (status: OperationStatus) => {
    return get().operations.filter(op => op.status === status)
  },
  
  getLatestOperation: () => {
    const { operations } = get()
    return operations.length > 0 ? operations[operations.length - 1] : undefined
  },
  
  getRunningOperations: () => {
    return get().operations.filter(op => op.status === 'running')
  }
})

// ============================================================================
// Re-export types for convenience
// ============================================================================

export type { 
  FileOperation, 
  OperationStep, 
  FileOperationType,
  OperationStatus 
} from '../../lib/fileOperationTracker'
