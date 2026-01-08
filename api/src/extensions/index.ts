/**
 * Extension System - API Server Module
 * 
 * Provides V8 sandbox execution, storage, secrets, and rate limiting
 * for extension server handlers.
 * 
 * @module extensions
 */

// Types
export * from './types.js'

// Sandbox
export {
  IsolatePool,
  getIsolatePool,
  disposeIsolatePool,
  type IsolatePoolConfig,
  type PoolStats,
  type SandboxResult
} from './sandbox.js'

// Runtime
export {
  createExtensionRuntime,
  createResponseHelpers,
  type ExtensionServerAPI,
  type ExtensionResponse,
  type RuntimeOptions,
  type ExtensionServerAPICallable
} from './runtime.js'

// Loader
export {
  ExtensionLoader,
  getLoader,
  clearLoader,
  clearAllLoaders,
  installExtension,
  uninstallExtension,
  setExtensionEnabled,
  type LoadedHandler,
  type HandlerKey
} from './loader.js'

// Router
export {
  routeExtensionRequest,
  createExtensionRouteHandler,
  type RouterOptions
} from './router.js'

// Storage
export {
  ExtensionStorage,
  StorageError,
  STORAGE_LIMITS
} from './storage.js'

// Secrets
export {
  ExtensionSecrets,
  SecretsError,
  SECRETS_LIMITS
} from './secrets.js'

// Rate Limiting
export {
  ExtensionRateLimiter,
  getRateLimiter,
  disposeRateLimiter,
  checkRateLimit,
  getRateLimitHeaders,
  DEFAULT_RATE_LIMIT,
  type RateLimitConfig,
  type RateLimitResult
} from './ratelimit.js'

// HTTP Logger
export {
  logHttpRequest,
  getHttpLogs,
  cleanupHttpLogs,
  type HttpLogEntry
} from './http-logger.js'
