/**
 * Extension Activation Event Handler
 * 
 * Manages lazy activation of extensions based on activation events.
 * Extensions declare when they should be activated in their manifest
 * (e.g., on startup, when navigating to a route, when a command is run).
 * 
 * @module extensions/registry/activation
 */

import type { ActivationEvent, ExtensionManifest } from '../types'

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVATION EVENT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parsed activation event with type discrimination.
 */
export type ParsedActivationEvent =
  | { type: 'onExtensionEnabled' }
  | { type: 'onStartup' }
  | { type: 'onNavigate'; route: string }
  | { type: 'onCommand'; commandId: string }
  | { type: 'onView'; viewId: string }
  | { type: 'onFileType'; extension: string }

/**
 * Callback when an extension should be activated.
 */
export type ActivationCallback = (extensionId: string, event: ParsedActivationEvent) => Promise<void>

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT PARSING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parse a raw activation event string into a structured event.
 * 
 * @param event - Raw activation event string
 * @returns Parsed event, or null if invalid
 * 
 * @example
 * parseActivationEvent('onNavigate:settings/extensions/google-drive')
 * // { type: 'onNavigate', route: 'settings/extensions/google-drive' }
 */
export function parseActivationEvent(event: ActivationEvent): ParsedActivationEvent | null {
  if (event === 'onExtensionEnabled') {
    return { type: 'onExtensionEnabled' }
  }
  
  if (event === 'onStartup') {
    return { type: 'onStartup' }
  }
  
  if (event.startsWith('onNavigate:')) {
    const route = event.slice('onNavigate:'.length)
    if (route) {
      return { type: 'onNavigate', route }
    }
  }
  
  if (event.startsWith('onCommand:')) {
    const commandId = event.slice('onCommand:'.length)
    if (commandId) {
      return { type: 'onCommand', commandId }
    }
  }
  
  if (event.startsWith('onView:')) {
    const viewId = event.slice('onView:'.length)
    if (viewId) {
      return { type: 'onView', viewId }
    }
  }
  
  if (event.startsWith('onFileType:')) {
    const extension = event.slice('onFileType:'.length)
    if (extension) {
      return { type: 'onFileType', extension }
    }
  }
  
  console.warn(`[Activation] Unknown activation event format: ${event}`)
  return null
}

/**
 * Check if a parsed event matches a trigger.
 * 
 * @param registered - The registered activation event
 * @param trigger - The event that occurred
 * @returns Whether they match
 */
export function eventMatches(
  registered: ParsedActivationEvent,
  trigger: ParsedActivationEvent
): boolean {
  if (registered.type !== trigger.type) {
    return false
  }
  
  switch (registered.type) {
    case 'onExtensionEnabled':
    case 'onStartup':
      return true
      
    case 'onNavigate':
      // Match if trigger route starts with registered route
      // This allows 'onNavigate:settings' to match 'settings/extensions/foo'
      return (trigger as { type: 'onNavigate'; route: string }).route.startsWith(registered.route)
      
    case 'onCommand':
      return (trigger as { type: 'onCommand'; commandId: string }).commandId === registered.commandId
      
    case 'onView':
      return (trigger as { type: 'onView'; viewId: string }).viewId === registered.viewId
      
    case 'onFileType':
      return (trigger as { type: 'onFileType'; extension: string }).extension.toLowerCase() === registered.extension.toLowerCase()
      
    default:
      return false
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVATION REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Registered extension activation info.
 */
interface RegistrationInfo {
  extensionId: string
  events: ParsedActivationEvent[]
  activated: boolean
}

/**
 * Activation Event Manager.
 * 
 * Tracks which extensions are waiting for which activation events,
 * and triggers activation when events occur.
 * 
 * @example
 * ```typescript
 * const activationManager = new ActivationManager()
 * 
 * // Register extension
 * activationManager.register(manifest)
 * 
 * // Set activation callback
 * activationManager.setActivationCallback(async (extensionId, event) => {
 *   await extensionRegistry.activate(extensionId)
 * })
 * 
 * // Trigger event (e.g., on route change)
 * activationManager.trigger({ type: 'onNavigate', route: 'settings/extensions' })
 * ```
 */
export class ActivationManager {
  private _registrations: Map<string, RegistrationInfo> = new Map()
  private _activationCallback?: ActivationCallback
  private _pendingActivations: Set<string> = new Set()
  
  /**
   * Set the callback for when an extension should be activated.
   */
  setActivationCallback(callback: ActivationCallback): void {
    this._activationCallback = callback
  }
  
  /**
   * Register an extension's activation events.
   * 
   * @param manifest - Extension manifest with activation events
   */
  register(manifest: ExtensionManifest): void {
    const extensionId = manifest.id
    const events: ParsedActivationEvent[] = []
    
    for (const rawEvent of manifest.activationEvents) {
      const parsed = parseActivationEvent(rawEvent)
      if (parsed) {
        events.push(parsed)
      }
    }
    
    this._registrations.set(extensionId, {
      extensionId,
      events,
      activated: false,
    })
  }
  
  /**
   * Unregister an extension.
   */
  unregister(extensionId: string): void {
    this._registrations.delete(extensionId)
    this._pendingActivations.delete(extensionId)
  }
  
  /**
   * Mark an extension as already activated (e.g., on app startup).
   */
  markActivated(extensionId: string): void {
    const registration = this._registrations.get(extensionId)
    if (registration) {
      registration.activated = true
    }
    this._pendingActivations.delete(extensionId)
  }
  
  /**
   * Reset activation state (for testing).
   */
  resetActivationState(extensionId: string): void {
    const registration = this._registrations.get(extensionId)
    if (registration) {
      registration.activated = false
    }
  }
  
  /**
   * Trigger an activation event.
   * Activates all extensions that are waiting for this event.
   * 
   * @param event - The event that occurred
   * @returns List of extension IDs that were activated
   */
  async trigger(event: ParsedActivationEvent): Promise<string[]> {
    const activated: string[] = []
    
    for (const [extensionId, registration] of this._registrations) {
      // Skip if already activated or pending
      if (registration.activated || this._pendingActivations.has(extensionId)) {
        continue
      }
      
      // Check if any registered event matches
      const matches = registration.events.some(e => eventMatches(e, event))
      
      if (matches) {
        this._pendingActivations.add(extensionId)
        
        try {
          if (this._activationCallback) {
            await this._activationCallback(extensionId, event)
          }
          registration.activated = true
          activated.push(extensionId)
        } catch (error) {
          console.error(`[Activation] Failed to activate ${extensionId}:`, error)
        } finally {
          this._pendingActivations.delete(extensionId)
        }
      }
    }
    
    return activated
  }
  
  /**
   * Trigger startup activation.
   * Activates all extensions with 'onStartup' or 'onExtensionEnabled' events.
   * 
   * @returns List of extension IDs that were activated
   */
  async triggerStartup(): Promise<string[]> {
    const activatedByEnabled = await this.trigger({ type: 'onExtensionEnabled' })
    const activatedByStartup = await this.trigger({ type: 'onStartup' })
    
    // Return unique list
    return [...new Set([...activatedByEnabled, ...activatedByStartup])]
  }
  
  /**
   * Get extensions waiting for a specific event type.
   */
  getExtensionsWaitingFor(eventType: ParsedActivationEvent['type']): string[] {
    const waiting: string[] = []
    
    for (const [extensionId, registration] of this._registrations) {
      if (registration.activated) continue
      
      if (registration.events.some(e => e.type === eventType)) {
        waiting.push(extensionId)
      }
    }
    
    return waiting
  }
  
  /**
   * Get all registered extensions.
   */
  getRegisteredExtensions(): string[] {
    return Array.from(this._registrations.keys())
  }
  
  /**
   * Check if an extension is registered.
   */
  isRegistered(extensionId: string): boolean {
    return this._registrations.has(extensionId)
  }
  
  /**
   * Check if an extension has been activated.
   */
  isActivated(extensionId: string): boolean {
    return this._registrations.get(extensionId)?.activated ?? false
  }
  
  /**
   * Clear all registrations (for testing).
   */
  clear(): void {
    this._registrations.clear()
    this._pendingActivations.clear()
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create navigation trigger event.
 */
export function createNavigateTrigger(route: string): ParsedActivationEvent {
  return { type: 'onNavigate', route }
}

/**
 * Create command trigger event.
 */
export function createCommandTrigger(commandId: string): ParsedActivationEvent {
  return { type: 'onCommand', commandId }
}

/**
 * Create view trigger event.
 */
export function createViewTrigger(viewId: string): ParsedActivationEvent {
  return { type: 'onView', viewId }
}

/**
 * Create file type trigger event.
 */
export function createFileTypeTrigger(extension: string): ParsedActivationEvent {
  return { type: 'onFileType', extension }
}

/**
 * Get all unique event types from a manifest.
 */
export function getEventTypes(manifest: ExtensionManifest): Set<ParsedActivationEvent['type']> {
  const types = new Set<ParsedActivationEvent['type']>()
  
  for (const rawEvent of manifest.activationEvents) {
    const parsed = parseActivationEvent(rawEvent)
    if (parsed) {
      types.add(parsed.type)
    }
  }
  
  return types
}

/**
 * Check if an extension should activate on startup.
 */
export function shouldActivateOnStartup(manifest: ExtensionManifest): boolean {
  const types = getEventTypes(manifest)
  return types.has('onStartup') || types.has('onExtensionEnabled')
}
