/**
 * Extension Registry - Public API
 * 
 * The central module for extension lifecycle management.
 * 
 * @module extensions/registry
 * 
 * @example
 * ```typescript
 * import { 
 *   ExtensionRegistry,
 *   getExtensionRegistry,
 * } from '@/lib/extensions/registry'
 * 
 * // Get the singleton
 * const registry = getExtensionRegistry()
 * 
 * // Initialize
 * await registry.initialize({
 *   extensionsPath: '/path/to/extensions',
 * })
 * 
 * // Install extension
 * await registry.install('blueplm.google-drive')
 * 
 * // Activate startup extensions
 * await registry.activateStartupExtensions()
 * ```
 */

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export {
  ExtensionRegistry,
  getExtensionRegistry,
  type RegistryConfig,
  type ExtensionStateCallback,
  type UpdateAvailableCallback,
} from './ExtensionRegistry'

// ═══════════════════════════════════════════════════════════════════════════════
// LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // State machine
  ExtensionLifecycle,
  LifecycleManager,
  
  // Transitions
  transition,
  isValidTransition,
  getNextState,
  
  // State helpers
  isActiveState,
  isInstalledState,
  isErrorState,
  getStateDescription,
  
  // Types
  type LifecycleAction,
  type TransitionResult,
  type StateChangeEvent,
  type StateChangeCallback,
} from './lifecycle'

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVATION
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Manager
  ActivationManager,
  
  // Event parsing
  parseActivationEvent,
  eventMatches,
  
  // Event creators
  createNavigateTrigger,
  createCommandTrigger,
  createViewTrigger,
  createFileTypeTrigger,
  
  // Helpers
  getEventTypes,
  shouldActivateOnStartup,
  
  // Types
  type ParsedActivationEvent,
  type ActivationCallback,
} from './activation'

// ═══════════════════════════════════════════════════════════════════════════════
// DISCOVERY
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Local discovery
  discoverLocalExtensions,
  getExtensionsPath,
  
  // Store discovery
  discoverStoreExtensions,
  getFeaturedExtensions,
  getStoreExtension,
  getExtensionVersions,
  getExtensionDownloadUrl,
  clearStoreCache,
  
  // Search
  searchExtensions,
  
  // Constants
  DEFAULT_STORE_API_URL,
  
  // Types
  type LocalDiscoveryResult,
  type LocalDiscoveryOptions,
  type StoreDiscoveryOptions,
  type StoreDiscoveryResult,
} from './discovery'

// ═══════════════════════════════════════════════════════════════════════════════
// INSTALLATION
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Install functions
  installFromStore,
  sideloadFromFile,
  uninstallExtension,
  
  // Queries
  isExtensionInstalled,
  getInstalledVersion,
  
  // Types
  type InstallOptions,
  type SideloadOptions,
  type UninstallOptions,
  type InstallProgress,
  type InstallProgressCallback,
  type InstallResult,
  type InstallStep,
} from './installer'

// ═══════════════════════════════════════════════════════════════════════════════
// UPDATES
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Update checking
  checkForUpdates,
  checkExtensionUpdate,
  
  // Updating
  updateExtension,
  
  // Rollback
  rollbackExtension,
  canRollback,
  cleanupExpiredRollbacks,
  
  // Version pinning
  pinVersion,
  unpinVersion,
  getVersionPins,
  isPinned,
  
  // Types
  type UpdateOptions,
  type UpdateCheckResult,
  type RollbackEntry,
  type VersionPin,
} from './updater'
