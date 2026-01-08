/**
 * BluePLM Extension System - Public API
 * 
 * This module exports all public types, functions, and utilities for the
 * extension system. Import from this barrel file for clean imports.
 * 
 * @module extensions
 * 
 * @example
 * import {
 *   type ExtensionManifest,
 *   parseManifest,
 *   extractPackage,
 * } from '@/lib/extensions'
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type {
  // Categories & Verification
  ExtensionCategory,
  VerificationStatus,
  ExtensionState,
  
  // Activation
  ActivationEvent,
  
  // Permissions
  ClientPermission,
  ServerPermission,
  ExtensionPermissions,
  
  // Contributions
  ViewContribution,
  CommandContribution,
  SettingsContribution,
  ApiRouteContribution,
  ConfigurationProperty,
  ConfigurationContribution,
  ExtensionContributions,
  
  // Native Extensions
  Platform,
  NativeExtensionConfig,
  
  // Manifest
  ExtensionManifest,
  
  // Runtime
  Disposable,
  ExtensionLogger,
  ExtensionContext,
  LoadedExtension,
  ExtensionModule,
  
  // Package
  PackageContents,
  
  // Signing & Verification
  SigningKey,
  RevokedKey,
  SignatureVerificationResult,
  
  // Validation
  ValidationError,
  ValidationResult,
  
  // Updates
  ExtensionUpdate,
  
  // Store
  StoreExtension,
  StoreExtensionVersion,
  
  // Watchdog
  ViolationType,
  WatchdogViolation,
  ExtensionStats,
  
  // Utility
  DeepPartial,
  VersionCompare,
} from './types'

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

export {
  getExtensionId,
  isNativeExtension,
  hasServerComponent,
  hasClientComponent,
  getAllPermissions,
  compareVersions,
  satisfiesVersion,
} from './types'

// ═══════════════════════════════════════════════════════════════════════════════
// MANIFEST PARSING
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Parser functions
  parseManifest,
  parseManifestString,
  validateManifest,
  isValidManifest,
  
  // Utility functions
  extractExtensionId,
  getRequiredDomains,
  getActivationEventsByType,
  
  // Schema (for advanced use)
  extensionManifestSchema,
  
  // Error class
  ManifestParseError,
} from './manifest'

// ═══════════════════════════════════════════════════════════════════════════════
// PACKAGE UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Extraction
  extractPackage,
  extractPackageFromFile,
  getPackageInfo,
  packageExists,
  
  // Hash verification
  calculateHash,
  verifyPackageHash,
  verifyPackageIntegrity,
  
  // Signature verification
  verifyPackageSignature,
  checkRevocationList,
  fetchRevocationList,
  fetchSigningKeys,
  
  // Package creation (CLI)
  createPackage,
  type CreatePackageOptions,
  
  // Error class
  PackageError,
  type PackageErrorCode,
} from './package'

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Main registry
  ExtensionRegistry,
  getExtensionRegistry,
  
  // Lifecycle
  ExtensionLifecycle,
  LifecycleManager,
  isActiveState,
  isInstalledState,
  isErrorState,
  getStateDescription,
  
  // Activation
  ActivationManager,
  parseActivationEvent,
  createNavigateTrigger,
  createCommandTrigger,
  createViewTrigger,
  createFileTypeTrigger,
  shouldActivateOnStartup,
  
  // Discovery
  discoverLocalExtensions,
  discoverStoreExtensions,
  getFeaturedExtensions,
  getStoreExtension,
  getExtensionVersions,
  getExtensionDownloadUrl,
  getExtensionsPath,
  searchExtensions,
  clearStoreCache,
  DEFAULT_STORE_API_URL,
  
  // Installation
  installFromStore,
  sideloadFromFile,
  uninstallExtension,
  isExtensionInstalled,
  getInstalledVersion,
  
  // Updates
  checkForUpdates,
  checkExtensionUpdate,
  updateExtension,
  rollbackExtension,
  canRollback,
  cleanupExpiredRollbacks,
  pinVersion,
  unpinVersion,
  getVersionPins,
  isPinned,
  
  // Types
  type RegistryConfig,
  type ExtensionStateCallback,
  type UpdateAvailableCallback,
  type LifecycleAction,
  type TransitionResult,
  type StateChangeEvent,
  type StateChangeCallback,
  type ParsedActivationEvent,
  type ActivationCallback,
  type LocalDiscoveryResult,
  type LocalDiscoveryOptions,
  type StoreDiscoveryOptions,
  type StoreDiscoveryResult,
  type InstallOptions,
  type SideloadOptions,
  type UninstallOptions,
  type InstallProgress,
  type InstallProgressCallback,
  type InstallResult,
  type InstallStep,
  type UpdateOptions,
  type UpdateCheckResult,
  type RollbackEntry,
  type VersionPin,
} from './registry'