/**
 * Extension Lifecycle State Machine
 * 
 * Manages extension state transitions following a strict state machine model.
 * Ensures extensions move through valid states only via allowed transitions.
 * 
 * State Diagram:
 * ```
 * [not-installed] ──install()──► [installed] ──activate()──► [loading] ──success──► [active]
 *        ▲                            │                          │                     │
 *        │                            │                          │                     │
 *        └────────uninstall()─────────┘                          │                     │
 *        └──────────────────────────error─────────────────────[error]                  │
 *                                                                                      │
 *                                     [installed] ◄────────deactivate()────────────────┘
 *                                         │
 *                                     disable()
 *                                         │
 *                                         ▼
 *                                    [disabled]
 * ```
 * 
 * @module extensions/registry/lifecycle
 */

import type { ExtensionState } from '../types'

// ═══════════════════════════════════════════════════════════════════════════════
// STATE TRANSITION DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Actions that can trigger state transitions.
 */
export type LifecycleAction =
  | 'install'
  | 'uninstall'
  | 'activate'
  | 'load'
  | 'loaded'
  | 'deactivate'
  | 'disable'
  | 'enable'
  | 'error'
  | 'recover'

/**
 * Valid state transitions: [currentState, action] -> newState
 */
const STATE_TRANSITIONS: Record<ExtensionState, Partial<Record<LifecycleAction, ExtensionState>>> = {
  'not-installed': {
    install: 'installed',
  },
  'installed': {
    uninstall: 'not-installed',
    activate: 'loading',
    disable: 'disabled',
    error: 'error',
  },
  'loading': {
    loaded: 'active',
    error: 'error',
    uninstall: 'not-installed',
  },
  'active': {
    deactivate: 'installed',
    error: 'error',
    uninstall: 'not-installed',
  },
  'error': {
    recover: 'installed',
    uninstall: 'not-installed',
    activate: 'loading', // Retry
  },
  'disabled': {
    enable: 'installed',
    uninstall: 'not-installed',
  },
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSITION VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Result of a state transition attempt.
 */
export interface TransitionResult {
  /** Whether the transition was successful */
  success: boolean
  /** New state after transition (if successful) */
  newState?: ExtensionState
  /** Error message (if failed) */
  error?: string
}

/**
 * Check if a transition from one state to another via an action is valid.
 * 
 * @param currentState - Current extension state
 * @param action - Action to perform
 * @returns Whether the transition is allowed
 */
export function isValidTransition(
  currentState: ExtensionState,
  action: LifecycleAction
): boolean {
  const transitions = STATE_TRANSITIONS[currentState]
  return action in transitions
}

/**
 * Get the resulting state from a transition.
 * 
 * @param currentState - Current extension state
 * @param action - Action to perform
 * @returns The new state, or undefined if transition is invalid
 */
export function getNextState(
  currentState: ExtensionState,
  action: LifecycleAction
): ExtensionState | undefined {
  return STATE_TRANSITIONS[currentState][action]
}

/**
 * Attempt a state transition.
 * 
 * @param currentState - Current extension state
 * @param action - Action to perform
 * @returns Result indicating success/failure and new state
 */
export function transition(
  currentState: ExtensionState,
  action: LifecycleAction
): TransitionResult {
  const newState = getNextState(currentState, action)
  
  if (newState === undefined) {
    return {
      success: false,
      error: `Invalid transition: cannot perform '${action}' from state '${currentState}'`,
    }
  }
  
  return {
    success: true,
    newState,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATE MACHINE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Event fired when extension state changes.
 */
export interface StateChangeEvent {
  /** Extension ID */
  extensionId: string
  /** Previous state */
  previousState: ExtensionState
  /** New state */
  newState: ExtensionState
  /** Action that caused the change */
  action: LifecycleAction
  /** Timestamp of the change */
  timestamp: Date
  /** Error message if state is 'error' */
  error?: string
}

/**
 * Callback for state change events.
 */
export type StateChangeCallback = (event: StateChangeEvent) => void

/**
 * Extension Lifecycle State Machine.
 * 
 * Manages the state of a single extension with strict transition rules
 * and event notifications.
 * 
 * @example
 * ```typescript
 * const lifecycle = new ExtensionLifecycle('blueplm.google-drive')
 * 
 * lifecycle.onStateChange((event) => {
 *   console.log(`${event.extensionId}: ${event.previousState} -> ${event.newState}`)
 * })
 * 
 * lifecycle.dispatch('install')  // not-installed -> installed
 * lifecycle.dispatch('activate') // installed -> loading
 * lifecycle.dispatch('loaded')   // loading -> active
 * ```
 */
export class ExtensionLifecycle {
  private _state: ExtensionState = 'not-installed'
  private _error?: string
  private _listeners: Set<StateChangeCallback> = new Set()
  private _history: StateChangeEvent[] = []
  
  /**
   * Create a new lifecycle state machine.
   * 
   * @param extensionId - The extension this lifecycle manages
   * @param initialState - Starting state (default: 'not-installed')
   */
  constructor(
    public readonly extensionId: string,
    initialState: ExtensionState = 'not-installed'
  ) {
    this._state = initialState
  }
  
  /**
   * Get the current state.
   */
  get state(): ExtensionState {
    return this._state
  }
  
  /**
   * Get the current error message (if in error state).
   */
  get error(): string | undefined {
    return this._error
  }
  
  /**
   * Get the history of state changes.
   */
  get history(): readonly StateChangeEvent[] {
    return this._history
  }
  
  /**
   * Check if an action can be performed in the current state.
   * 
   * @param action - Action to check
   * @returns Whether the action is valid
   */
  canDispatch(action: LifecycleAction): boolean {
    return isValidTransition(this._state, action)
  }
  
  /**
   * Get all valid actions from the current state.
   * 
   * @returns Array of valid actions
   */
  getValidActions(): LifecycleAction[] {
    const transitions = STATE_TRANSITIONS[this._state]
    return Object.keys(transitions) as LifecycleAction[]
  }
  
  /**
   * Dispatch an action to transition state.
   * 
   * @param action - Action to perform
   * @param errorMessage - Optional error message (for 'error' action)
   * @returns Whether the transition was successful
   * @throws Never - check return value instead
   */
  dispatch(action: LifecycleAction, errorMessage?: string): boolean {
    const result = transition(this._state, action)
    
    if (!result.success || !result.newState) {
      console.warn(`[Extension Lifecycle] ${result.error}`)
      return false
    }
    
    const previousState = this._state
    this._state = result.newState
    
    // Track error message
    if (action === 'error' && errorMessage) {
      this._error = errorMessage
    } else if (action === 'recover' || action === 'activate') {
      this._error = undefined
    }
    
    // Create change event
    const event: StateChangeEvent = {
      extensionId: this.extensionId,
      previousState,
      newState: this._state,
      action,
      timestamp: new Date(),
      error: this._error,
    }
    
    // Record history (keep last 100 entries)
    this._history.push(event)
    if (this._history.length > 100) {
      this._history.shift()
    }
    
    // Notify listeners
    for (const listener of this._listeners) {
      try {
        listener(event)
      } catch (err) {
        console.error('[Extension Lifecycle] Error in state change listener:', err)
      }
    }
    
    return true
  }
  
  /**
   * Subscribe to state changes.
   * 
   * @param callback - Function to call on state change
   * @returns Unsubscribe function
   */
  onStateChange(callback: StateChangeCallback): () => void {
    this._listeners.add(callback)
    return () => this._listeners.delete(callback)
  }
  
  /**
   * Reset the state machine to initial state.
   * Used for testing or cleanup.
   */
  reset(): void {
    this._state = 'not-installed'
    this._error = undefined
    this._history = []
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIFECYCLE MANAGER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Manages lifecycle state machines for multiple extensions.
 */
export class LifecycleManager {
  private _lifecycles: Map<string, ExtensionLifecycle> = new Map()
  private _globalListeners: Set<StateChangeCallback> = new Set()
  
  /**
   * Get or create a lifecycle for an extension.
   * 
   * @param extensionId - Extension identifier
   * @param initialState - Initial state for new lifecycle
   * @returns The extension's lifecycle state machine
   */
  getLifecycle(extensionId: string, initialState?: ExtensionState): ExtensionLifecycle {
    let lifecycle = this._lifecycles.get(extensionId)
    
    if (!lifecycle) {
      lifecycle = new ExtensionLifecycle(extensionId, initialState)
      
      // Forward events to global listeners
      lifecycle.onStateChange((event) => {
        for (const listener of this._globalListeners) {
          try {
            listener(event)
          } catch (err) {
            console.error('[LifecycleManager] Error in global listener:', err)
          }
        }
      })
      
      this._lifecycles.set(extensionId, lifecycle)
    }
    
    return lifecycle
  }
  
  /**
   * Get the current state of an extension.
   * 
   * @param extensionId - Extension identifier
   * @returns Current state, or 'not-installed' if unknown
   */
  getState(extensionId: string): ExtensionState {
    return this._lifecycles.get(extensionId)?.state ?? 'not-installed'
  }
  
  /**
   * Check if an extension exists in the manager.
   */
  hasExtension(extensionId: string): boolean {
    return this._lifecycles.has(extensionId)
  }
  
  /**
   * Remove an extension's lifecycle (after uninstall).
   */
  removeLifecycle(extensionId: string): boolean {
    return this._lifecycles.delete(extensionId)
  }
  
  /**
   * Get all managed extension IDs.
   */
  getExtensionIds(): string[] {
    return Array.from(this._lifecycles.keys())
  }
  
  /**
   * Get all extensions in a specific state.
   */
  getExtensionsByState(state: ExtensionState): string[] {
    return Array.from(this._lifecycles.entries())
      .filter(([, lifecycle]) => lifecycle.state === state)
      .map(([id]) => id)
  }
  
  /**
   * Subscribe to state changes for all extensions.
   * 
   * @param callback - Function to call on any state change
   * @returns Unsubscribe function
   */
  onStateChange(callback: StateChangeCallback): () => void {
    this._globalListeners.add(callback)
    return () => this._globalListeners.delete(callback)
  }
  
  /**
   * Clear all lifecycles (for testing or reset).
   */
  clear(): void {
    this._lifecycles.clear()
    this._globalListeners.clear()
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if an extension state indicates it's usable.
 */
export function isActiveState(state: ExtensionState): boolean {
  return state === 'active'
}

/**
 * Check if an extension state indicates it's installed (but maybe not active).
 */
export function isInstalledState(state: ExtensionState): boolean {
  return state === 'installed' || state === 'loading' || state === 'active' || state === 'disabled'
}

/**
 * Check if an extension state indicates an error.
 */
export function isErrorState(state: ExtensionState): boolean {
  return state === 'error'
}

/**
 * Get a human-readable description of a state.
 */
export function getStateDescription(state: ExtensionState): string {
  switch (state) {
    case 'not-installed':
      return 'Not installed'
    case 'installed':
      return 'Installed (inactive)'
    case 'loading':
      return 'Loading...'
    case 'active':
      return 'Active'
    case 'error':
      return 'Error'
    case 'disabled':
      return 'Disabled'
    default:
      return 'Unknown'
  }
}
