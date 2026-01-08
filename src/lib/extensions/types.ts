/**
 * BluePLM Extension System - Core Type Definitions
 * 
 * This module defines the complete type system for the extension architecture,
 * following VS Code/Atlassian Forge patterns for enterprise extensibility.
 * 
 * @module extensions/types
 */

// ═══════════════════════════════════════════════════════════════════════════════
// EXTENSION CATEGORIES & VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extension category determines execution environment and trust requirements.
 * 
 * - `sandboxed`: Runs in Extension Host (client) + V8 isolate (server). Default.
 * - `native`: Runs in main Electron process. Verified extensions only.
 */
export type ExtensionCategory = 'sandboxed' | 'native'

/**
 * Verification status indicates trust level of extension.
 * 
 * - `verified`: Code reviewed and signed by Blue Robotics.
 * - `community`: Open source, not reviewed. Use at own risk.
 * - `sideloaded`: Installed from local .bpx file. Prominent warning shown.
 */
export type VerificationStatus = 'verified' | 'community' | 'sideloaded'

/**
 * Extension lifecycle states.
 */
export type ExtensionState =
  | 'not-installed'
  | 'installed'
  | 'loading'
  | 'active'
  | 'error'
  | 'disabled'

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVATION EVENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Events that trigger extension activation (lazy loading).
 * 
 * @example
 * // Activate when extension is enabled
 * "onExtensionEnabled"
 * 
 * @example
 * // Activate on app startup
 * "onStartup"
 * 
 * @example
 * // Activate when user navigates to specific route
 * "onNavigate:settings/extensions/google-drive"
 * 
 * @example
 * // Activate when command is executed
 * "onCommand:google-drive.sync"
 * 
 * @example
 * // Activate when view is opened
 * "onView:google-drive.panel"
 */
export type ActivationEvent =
  | 'onExtensionEnabled'
  | 'onStartup'
  | `onNavigate:${string}`
  | `onCommand:${string}`
  | `onView:${string}`
  | `onFileType:${string}`

// ═══════════════════════════════════════════════════════════════════════════════
// PERMISSIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Client-side permissions for Extension Host execution.
 */
export type ClientPermission =
  // UI permissions
  | 'ui:toast'
  | 'ui:dialog'
  | 'ui:status'
  | 'ui:progress'
  | 'ui:quickpick'
  | 'ui:inputbox'
  // Storage permissions
  | 'storage:local'
  // Network permissions
  | 'network:orgApi'
  | 'network:storeApi'
  | 'network:fetch'
  // Commands
  | 'commands:register'
  | 'commands:execute'
  // Workspace
  | 'workspace:files'
  | 'workspace:vaults'
  // Telemetry
  | 'telemetry'

/**
 * Server-side permissions for V8 isolate execution.
 */
export type ServerPermission =
  | 'storage:database'
  | 'secrets:read'
  | 'secrets:write'
  | 'http:fetch'
  | `http:domain:${string}`

/**
 * Combined permissions declaration.
 */
export interface ExtensionPermissions {
  /** Client-side permissions (Extension Host) */
  client?: ClientPermission[]
  /** Server-side permissions (API sandbox) */
  server?: ServerPermission[]
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRIBUTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * View contribution - UI panels and tabs.
 */
export interface ViewContribution {
  /** Unique view identifier */
  id: string
  /** Display name */
  name: string
  /** Lucide icon name */
  icon?: string
  /** Location in UI */
  location: 'sidebar' | 'panel' | 'settings' | 'dialog'
  /** Component path relative to extension */
  component: string
  /** When to show this view */
  when?: string
}

/**
 * Command contribution - executable actions.
 */
export interface CommandContribution {
  /** Unique command identifier (scoped to extension) */
  id: string
  /** Display name for command palette */
  title: string
  /** Lucide icon name */
  icon?: string
  /** Keyboard shortcut */
  keybinding?: string
  /** Command category for grouping */
  category?: string
  /** When to enable this command */
  when?: string
}

/**
 * Settings contribution - settings page entries.
 */
export interface SettingsContribution {
  /** Settings page identifier */
  id: string
  /** Display name */
  name: string
  /** Description shown in settings list */
  description?: string
  /** Lucide icon name */
  icon?: string
  /** Component path for settings UI */
  component: string
  /** Parent settings category */
  category?: 'account' | 'organization' | 'extensions' | 'system'
}

/**
 * API route contribution - server-side HTTP endpoints.
 */
export interface ApiRouteContribution {
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Route path (relative to /extensions/{id}/) */
  path: string
  /** Handler file path */
  handler: string
  /** Public endpoint (no auth required) - requires admin approval */
  public?: boolean
  /** Rate limit override (requests per minute) */
  rateLimit?: number
}

/**
 * Configuration property schema (VS Code pattern).
 */
export interface ConfigurationProperty {
  /** Property type */
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  /** Default value */
  default?: unknown
  /** Human-readable description */
  description?: string
  /** Enum values for string/number */
  enum?: unknown[]
  /** Enum descriptions for UI */
  enumDescriptions?: string[]
  /** Minimum value for numbers */
  minimum?: number
  /** Maximum value for numbers */
  maximum?: number
  /** Items schema for arrays */
  items?: ConfigurationProperty
  /** Properties schema for objects */
  properties?: Record<string, ConfigurationProperty>
  /** Order in settings UI */
  order?: number
  /** Deprecation message */
  deprecationMessage?: string
}

/**
 * Configuration contribution - extension settings schema.
 */
export interface ConfigurationContribution {
  /** Settings section title */
  title: string
  /** Property definitions */
  properties: Record<string, ConfigurationProperty>
}

/**
 * All contribution types an extension can declare.
 */
export interface ExtensionContributions {
  /** UI views (panels, tabs, dialogs) */
  views?: ViewContribution[]
  /** Executable commands */
  commands?: CommandContribution[]
  /** Settings pages */
  settings?: SettingsContribution[]
  /** Server API routes */
  apiRoutes?: ApiRouteContribution[]
  /** Configuration schema */
  configuration?: ConfigurationContribution
}

// ═══════════════════════════════════════════════════════════════════════════════
// NATIVE EXTENSION CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Platform identifiers for native extensions.
 */
export type Platform = 'win32' | 'darwin' | 'linux'

/**
 * Native extension configuration (verified extensions only).
 * 
 * Native extensions run in the main Electron process and have
 * full access to Node.js APIs and system resources.
 * 
 * @example
 * // SolidWorks integration (Windows only)
 * {
 *   platforms: ['win32'],
 *   electronMain: 'main/solidworks.js',
 *   requiresAdmin: false
 * }
 */
export interface NativeExtensionConfig {
  /** Supported platforms */
  platforms: Platform[]
  /** Entry point for main process code */
  electronMain?: string
  /** Requires admin/elevated privileges */
  requiresAdmin?: boolean
  /** Native dependencies (bundled binaries) */
  nativeDependencies?: string[]
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTENSION MANIFEST
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extension manifest (extension.json).
 * 
 * This is the primary declaration file for an extension, similar to
 * VS Code's package.json extension fields or Atlassian Forge's manifest.yml.
 * 
 * @example
 * {
 *   "id": "blueplm.google-drive",
 *   "name": "Google Drive",
 *   "version": "1.0.0",
 *   "publisher": "blueplm",
 *   "description": "Sync files with Google Drive",
 *   "license": "MIT",
 *   "engines": { "blueplm": "^1.0.0" },
 *   "main": "client/index.js",
 *   "serverMain": "server/index.js",
 *   "activationEvents": ["onExtensionEnabled"],
 *   "contributes": { ... },
 *   "permissions": { ... }
 * }
 */
export interface ExtensionManifest {
  // ─────────────────────────────────────────────────────────────────────────────
  // Identity (required)
  // ─────────────────────────────────────────────────────────────────────────────
  
  /** 
   * Unique extension identifier in format `publisher.name`.
   * @example "blueplm.google-drive"
   */
  id: string
  
  /**
   * Human-readable display name.
   * @example "Google Drive"
   */
  name: string
  
  /**
   * Semantic version string.
   * @example "1.2.3"
   */
  version: string
  
  /**
   * Publisher slug (organization or individual).
   * @example "blueplm"
   */
  publisher: string
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Metadata
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Extension description (shown in store).
   */
  description?: string
  
  /**
   * Path to extension icon (128x128 PNG).
   */
  icon?: string
  
  /**
   * Source repository URL (required for store submission).
   * @example "https://github.com/bluerobotics/blueplm-google-drive"
   */
  repository?: string
  
  /**
   * OSI-approved license identifier (required).
   * @example "MIT"
   */
  license: string
  
  /**
   * Extension keywords for search.
   */
  keywords?: string[]
  
  /**
   * Store categories for filtering.
   */
  categories?: string[]
  
  /**
   * Changelog or release notes.
   */
  changelog?: string
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Category
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Extension category determines execution environment.
   * @default "sandboxed"
   */
  category?: ExtensionCategory
  
  /**
   * Native extension configuration (category: "native" only).
   */
  native?: NativeExtensionConfig
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Dependencies
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Required BluePLM app version range.
   * @example { "blueplm": "^1.0.0" }
   */
  engines: {
    blueplm: string
  }
  
  /**
   * Other extensions this extension depends on.
   * @example ["blueplm.core-utils@^1.0.0"]
   */
  extensionDependencies?: string[]
  
  /**
   * Extensions bundled together (extension pack).
   * @example ["blueplm.google-drive", "blueplm.dropbox"]
   */
  extensionPack?: string[]
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Entry Points
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Client-side entry point (Extension Host).
   * Must export `activate(context, api)` and optionally `deactivate()`.
   * @example "client/index.js"
   */
  main?: string
  
  /**
   * Server-side entry point (API sandbox).
   * @example "server/index.js"
   */
  serverMain?: string
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Capabilities
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Events that trigger extension activation.
   * @example ["onExtensionEnabled", "onNavigate:settings/extensions/google-drive"]
   */
  activationEvents: ActivationEvent[]
  
  /**
   * What the extension contributes (views, commands, settings, etc.).
   */
  contributes: ExtensionContributions
  
  /**
   * Required permissions for client and server execution.
   */
  permissions: ExtensionPermissions
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTENSION CONTEXT (Runtime)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Disposable pattern for cleanup (VS Code pattern).
 */
export interface Disposable {
  /** Release resources */
  dispose(): void
}

/**
 * Extension logger interface.
 */
export interface ExtensionLogger {
  /** Debug-level log (development only) */
  debug(message: string, ...args: unknown[]): void
  /** Info-level log */
  info(message: string, ...args: unknown[]): void
  /** Warning-level log */
  warn(message: string, ...args: unknown[]): void
  /** Error-level log */
  error(message: string, ...args: unknown[]): void
}

/**
 * Extension context passed to activate function.
 * 
 * Contains extension identity, paths, and lifecycle utilities.
 * 
 * @example
 * export async function activate(context: ExtensionContext, api: ExtensionClientAPI) {
 *   context.log.info('Extension activating');
 *   
 *   // Register command (auto-disposed on deactivate)
 *   context.subscriptions.push(
 *     api.commands.registerCommand('my-ext.doThing', () => {
 *       // handler
 *     })
 *   );
 * }
 */
export interface ExtensionContext {
  /** Extension identifier */
  extensionId: string
  
  /** Absolute path to extension installation directory */
  extensionPath: string
  
  /** Absolute path for extension-specific data storage */
  storagePath: string
  
  /**
   * Subscriptions array for automatic cleanup on deactivate.
   * Push Disposable objects here; they'll be disposed when extension deactivates.
   */
  subscriptions: Disposable[]
  
  /** Extension logger (scoped to this extension) */
  log: ExtensionLogger
  
  /** Extension manifest */
  manifest: ExtensionManifest
  
  /** Current extension state */
  state: ExtensionState
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOADED EXTENSION (Runtime Instance)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Loaded extension instance with runtime state.
 */
export interface LoadedExtension {
  /** Extension manifest */
  manifest: ExtensionManifest
  
  /** Current lifecycle state */
  state: ExtensionState
  
  /** Verification status */
  verification: VerificationStatus
  
  /** Error message if state is 'error' */
  error?: string
  
  /** Installation timestamp */
  installedAt?: Date
  
  /** Last activation timestamp */
  activatedAt?: Date
  
  /** Extension context (when active) */
  context?: ExtensionContext
}

// ═══════════════════════════════════════════════════════════════════════════════
// PACKAGE CONTENTS (After Extraction)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Contents of a .bpx package after extraction.
 */
export interface PackageContents {
  /** Parsed and validated manifest */
  manifest: ExtensionManifest
  
  /** Client-side bundle (if present) */
  clientBundle?: string
  
  /** Server-side handlers (filename -> code) */
  serverHandlers?: Record<string, string>
  
  /** Ed25519 signature (for verified extensions) */
  signature?: string
  
  /** SHA-256 hash of package contents */
  hash: string
  
  /** Package size in bytes */
  size: number
  
  /** README contents (if present) */
  readme?: string
  
  /** Changelog contents (if present) */
  changelog?: string
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIGNING & VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Ed25519 public key for signature verification.
 */
export interface SigningKey {
  /** Key identifier */
  keyId: string
  
  /** Public key (base64-encoded) */
  publicKey: string
  
  /** Key issuer (e.g., "Blue Robotics") */
  issuer: string
  
  /** Key creation date */
  createdAt: Date
  
  /** Key expiration date */
  expiresAt: Date
  
  /** Whether key is currently valid */
  isActive: boolean
}

/**
 * Certificate Revocation List entry.
 */
export interface RevokedKey {
  /** Revoked key identifier */
  keyId: string
  
  /** Revocation timestamp */
  revokedAt: Date
  
  /** Reason for revocation */
  reason: string
}

/**
 * Signature verification result.
 */
export interface SignatureVerificationResult {
  /** Whether signature is valid */
  valid: boolean
  
  /** Key used for signing (if valid) */
  signingKey?: SigningKey
  
  /** Error message (if invalid) */
  error?: string
  
  /** Whether key was revoked */
  revoked?: boolean
}

// ═══════════════════════════════════════════════════════════════════════════════
// MANIFEST VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validation error for manifest parsing.
 */
export interface ValidationError {
  /** JSON path to error location */
  path: string
  
  /** Error message */
  message: string
  
  /** Expected type or value */
  expected?: string
  
  /** Actual value received */
  received?: string
}

/**
 * Result of manifest validation.
 */
export interface ValidationResult {
  /** Whether manifest is valid */
  valid: boolean
  
  /** Parsed manifest (if valid) */
  manifest?: ExtensionManifest
  
  /** Validation errors (if invalid) */
  errors?: ValidationError[]
  
  /** Warnings (non-fatal issues) */
  warnings?: ValidationError[]
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTENSION UPDATES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Available extension update information.
 */
export interface ExtensionUpdate {
  /** Extension identifier */
  extensionId: string
  
  /** Currently installed version */
  currentVersion: string
  
  /** Available new version */
  newVersion: string
  
  /** Changelog for new version */
  changelog?: string
  
  /** Whether this is a breaking change (major version bump) */
  breaking: boolean
  
  /** Minimum app version required for update */
  minAppVersion?: string
}

// ═══════════════════════════════════════════════════════════════════════════════
// STORE TYPES (for API responses)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extension listing from store.
 */
export interface StoreExtension {
  /** Store extension UUID */
  id: string
  
  /** Extension manifest ID (e.g., "blueplm.google-drive") */
  extensionId: string
  
  /** Publisher information */
  publisher: {
    id: string
    name: string
    slug: string
    verified: boolean
  }
  
  /** Display name */
  name: string
  
  /** Description */
  description?: string
  
  /** Icon URL */
  iconUrl?: string
  
  /** Repository URL */
  repositoryUrl: string
  
  /** License */
  license: string
  
  /** Extension category */
  category: ExtensionCategory
  
  /** Store categories */
  categories: string[]
  
  /** Search tags */
  tags: string[]
  
  /** Whether verified by Blue Robotics */
  verified: boolean
  
  /** Whether featured in store */
  featured: boolean
  
  /** Total download count */
  downloadCount: number
  
  /** Latest version */
  latestVersion: string
  
  /** Creation timestamp */
  createdAt: Date
  
  /** Last update timestamp */
  updatedAt: Date
  
  /** Deprecation info (if deprecated) */
  deprecation?: {
    deprecatedAt: Date
    reason: string
    replacementId?: string
    sunsetDate?: Date
  }
}

/**
 * Extension version from store.
 */
export interface StoreExtensionVersion {
  /** Version UUID */
  id: string
  
  /** Extension UUID */
  extensionId: string
  
  /** Semantic version */
  version: string
  
  /** Changelog */
  changelog?: string
  
  /** Download URL for .bpx file */
  bundleUrl: string
  
  /** SHA-256 hash of bundle */
  bundleHash: string
  
  /** Bundle size in bytes */
  bundleSize: number
  
  /** Minimum app version required */
  minAppVersion?: string
  
  /** Full manifest */
  manifest: ExtensionManifest
  
  /** Publication timestamp */
  publishedAt: Date
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTENSION MODULE (Runtime)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extension module exports (what extension's main file must export).
 */
export interface ExtensionModule {
  /**
   * Called when extension is activated.
   * 
   * @param context - Extension context with lifecycle utilities
   * @param api - Client API for UI, storage, network operations
   */
  activate(context: ExtensionContext, api: unknown): void | Promise<void>
  
  /**
   * Called when extension is deactivated (optional).
   * Subscriptions in context.subscriptions are auto-disposed.
   */
  deactivate?(): void | Promise<void>
}

// ═══════════════════════════════════════════════════════════════════════════════
// WATCHDOG TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Watchdog violation types.
 */
export type ViolationType = 
  | 'memory_exceeded'
  | 'cpu_timeout'
  | 'unresponsive'
  | 'crash'

/**
 * Watchdog violation report.
 */
export interface WatchdogViolation {
  /** Extension that violated limits */
  extensionId: string
  
  /** Type of violation */
  type: ViolationType
  
  /** Violation timestamp */
  timestamp: Date
  
  /** Additional details */
  details: {
    /** Memory usage in bytes (for memory violations) */
    memoryUsage?: number
    /** Memory limit in bytes */
    memoryLimit?: number
    /** Execution time in ms (for CPU violations) */
    executionTime?: number
    /** CPU time limit in ms */
    cpuLimit?: number
    /** Error message (for crashes) */
    errorMessage?: string
  }
  
  /** Action taken */
  action: 'warned' | 'killed'
}

/**
 * Extension resource statistics.
 */
export interface ExtensionStats {
  /** Extension identifier */
  extensionId: string
  
  /** Current memory usage in bytes */
  memoryUsage: number
  
  /** Memory limit in bytes */
  memoryLimit: number
  
  /** CPU time used in current period (ms) */
  cpuTime: number
  
  /** Number of IPC calls in current period */
  ipcCalls: number
  
  /** Number of violations */
  violationCount: number
  
  /** Last activity timestamp */
  lastActivity: Date
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Deep partial type for configuration updates.
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

/**
 * Extract extension ID from manifest.
 */
export function getExtensionId(manifest: ExtensionManifest): string {
  return manifest.id
}

/**
 * Check if extension is native.
 */
export function isNativeExtension(manifest: ExtensionManifest): boolean {
  return manifest.category === 'native'
}

/**
 * Check if extension has server component.
 */
export function hasServerComponent(manifest: ExtensionManifest): boolean {
  return !!manifest.serverMain || (manifest.contributes.apiRoutes?.length ?? 0) > 0
}

/**
 * Check if extension has client component.
 */
export function hasClientComponent(manifest: ExtensionManifest): boolean {
  return !!manifest.main
}

/**
 * Get all required permissions for an extension.
 */
export function getAllPermissions(manifest: ExtensionManifest): {
  client: ClientPermission[]
  server: ServerPermission[]
} {
  return {
    client: manifest.permissions.client ?? [],
    server: manifest.permissions.server ?? []
  }
}

/**
 * Semantic version comparison result.
 */
export type VersionCompare = -1 | 0 | 1

/**
 * Compare two semantic versions.
 * 
 * @returns -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareVersions(a: string, b: string): VersionCompare {
  const partsA = a.replace(/^v/, '').split('.').map(Number)
  const partsB = b.replace(/^v/, '').split('.').map(Number)
  
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] ?? 0
    const numB = partsB[i] ?? 0
    
    if (numA < numB) return -1
    if (numA > numB) return 1
  }
  
  return 0
}

/**
 * Check if version satisfies a semver range.
 * 
 * Supports: ^, ~, >=, >, <=, <, =, exact match
 */
export function satisfiesVersion(version: string, range: string): boolean {
  const cleanVersion = version.replace(/^v/, '')
  const cleanRange = range.replace(/^v/, '')
  
  // Exact match
  if (!cleanRange.match(/^[\^~><=]/)) {
    return compareVersions(cleanVersion, cleanRange) === 0
  }
  
  // Caret range (^) - compatible with version
  if (cleanRange.startsWith('^')) {
    const rangeVersion = cleanRange.slice(1)
    const [major] = rangeVersion.split('.').map(Number)
    const [vMajor] = cleanVersion.split('.').map(Number)
    
    return vMajor === major && compareVersions(cleanVersion, rangeVersion) >= 0
  }
  
  // Tilde range (~) - patch-level changes
  if (cleanRange.startsWith('~')) {
    const rangeVersion = cleanRange.slice(1)
    const [major, minor] = rangeVersion.split('.').map(Number)
    const [vMajor, vMinor] = cleanVersion.split('.').map(Number)
    
    return vMajor === major && vMinor === minor && compareVersions(cleanVersion, rangeVersion) >= 0
  }
  
  // Comparison operators
  if (cleanRange.startsWith('>=')) {
    return compareVersions(cleanVersion, cleanRange.slice(2)) >= 0
  }
  if (cleanRange.startsWith('<=')) {
    return compareVersions(cleanVersion, cleanRange.slice(2)) <= 0
  }
  if (cleanRange.startsWith('>')) {
    return compareVersions(cleanVersion, cleanRange.slice(1)) > 0
  }
  if (cleanRange.startsWith('<')) {
    return compareVersions(cleanVersion, cleanRange.slice(1)) < 0
  }
  if (cleanRange.startsWith('=')) {
    return compareVersions(cleanVersion, cleanRange.slice(1)) === 0
  }
  
  return false
}
