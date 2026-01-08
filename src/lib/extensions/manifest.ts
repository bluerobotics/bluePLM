/**
 * BluePLM Extension Manifest Parser & Validator
 * 
 * Uses Zod for runtime validation of extension.json manifests.
 * Provides detailed error messages with JSON paths for debugging.
 * 
 * @module extensions/manifest
 */

import { z } from 'zod'
import type {
  ExtensionManifest,
  ValidationResult,
  ValidationError,
  ExtensionCategory,
  ActivationEvent,
  ClientPermission,
  ServerPermission,
  Platform,
} from './types'

// ═══════════════════════════════════════════════════════════════════════════════
// ZOD SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extension ID format: publisher.name (e.g., "blueplm.google-drive")
 */
const extensionIdSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/,
    'Extension ID must be in format "publisher.name" using lowercase letters, numbers, and hyphens'
  )

/**
 * Semantic version format (e.g., "1.2.3", "1.0.0-beta.1")
 */
const semverSchema = z
  .string()
  .regex(
    /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/,
    'Version must be a valid semantic version (e.g., "1.2.3")'
  )

/**
 * Semver range (e.g., "^1.0.0", ">=1.2.0")
 */
const semverRangeSchema = z
  .string()
  .regex(
    /^[\^~><=]*\d+(\.\d+)?(\.\d+)?(-[a-zA-Z0-9.-]+)?$/,
    'Version range must be a valid semver range (e.g., "^1.0.0", ">=1.2.0")'
  )

/**
 * Extension dependency format: publisher.name@version-range
 */
const extensionDependencySchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*@[\^~><=]*\d+(\.\d+)?(\.\d+)?$/,
    'Extension dependency must be in format "publisher.name@version-range"'
  )

/**
 * Extension category
 */
const categorySchema = z.enum(['sandboxed', 'native'] satisfies ExtensionCategory[])

/**
 * Platform identifiers
 */
const platformSchema = z.enum(['win32', 'darwin', 'linux'] satisfies Platform[])

/**
 * Activation events
 */
const activationEventSchema = z.union([
  z.literal('onExtensionEnabled'),
  z.literal('onStartup'),
  z.string().regex(/^onNavigate:.+$/, 'onNavigate event must specify a route'),
  z.string().regex(/^onCommand:.+$/, 'onCommand event must specify a command'),
  z.string().regex(/^onView:.+$/, 'onView event must specify a view'),
  z.string().regex(/^onFileType:.+$/, 'onFileType event must specify a file extension'),
]) as z.ZodType<ActivationEvent>

/**
 * Client permissions
 */
const clientPermissionSchema = z.enum([
  'ui:toast',
  'ui:dialog',
  'ui:status',
  'ui:progress',
  'ui:quickpick',
  'ui:inputbox',
  'storage:local',
  'network:orgApi',
  'network:storeApi',
  'network:fetch',
  'commands:register',
  'commands:execute',
  'workspace:files',
  'workspace:vaults',
  'telemetry',
] satisfies ClientPermission[])

/**
 * Server permissions (with dynamic http:domain: pattern)
 */
const serverPermissionSchema = z.union([
  z.enum([
    'storage:database',
    'secrets:read',
    'secrets:write',
    'http:fetch',
  ]),
  z.string().regex(/^http:domain:[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/, 
    'http:domain permission must specify a valid domain'
  ),
]) as z.ZodType<ServerPermission>

/**
 * View contribution
 */
const viewContributionSchema = z.object({
  id: z.string().min(1, 'View ID is required'),
  name: z.string().min(1, 'View name is required'),
  icon: z.string().optional(),
  location: z.enum(['sidebar', 'panel', 'settings', 'dialog']),
  component: z.string().min(1, 'Component path is required'),
  when: z.string().optional(),
})

/**
 * Command contribution
 */
const commandContributionSchema = z.object({
  id: z.string().min(1, 'Command ID is required'),
  title: z.string().min(1, 'Command title is required'),
  icon: z.string().optional(),
  keybinding: z.string().optional(),
  category: z.string().optional(),
  when: z.string().optional(),
})

/**
 * Settings contribution
 */
const settingsContributionSchema = z.object({
  id: z.string().min(1, 'Settings ID is required'),
  name: z.string().min(1, 'Settings name is required'),
  description: z.string().optional(),
  icon: z.string().optional(),
  component: z.string().min(1, 'Component path is required'),
  category: z.enum(['account', 'organization', 'extensions', 'system']).optional(),
})

/**
 * API route contribution
 */
const apiRouteContributionSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().min(1, 'Route path is required'),
  handler: z.string().min(1, 'Handler path is required'),
  public: z.boolean().optional(),
  rateLimit: z.number().int().positive().optional(),
})

/**
 * Configuration property (recursive for nested objects/arrays)
 */
const configurationPropertySchema: z.ZodType<{
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  default?: unknown
  description?: string
  enum?: unknown[]
  enumDescriptions?: string[]
  minimum?: number
  maximum?: number
  items?: unknown
  properties?: Record<string, unknown>
  order?: number
  deprecationMessage?: string
}> = z.lazy(() => z.object({
  type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
  default: z.unknown().optional(),
  description: z.string().optional(),
  enum: z.array(z.unknown()).optional(),
  enumDescriptions: z.array(z.string()).optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  items: configurationPropertySchema.optional(),
  properties: z.record(z.string(), configurationPropertySchema).optional(),
  order: z.number().int().optional(),
  deprecationMessage: z.string().optional(),
}))

/**
 * Configuration contribution
 */
const configurationContributionSchema = z.object({
  title: z.string().min(1, 'Configuration title is required'),
  properties: z.record(z.string(), configurationPropertySchema),
})

/**
 * Extension contributions
 */
const contributionsSchema = z.object({
  views: z.array(viewContributionSchema).optional(),
  commands: z.array(commandContributionSchema).optional(),
  settings: z.array(settingsContributionSchema).optional(),
  apiRoutes: z.array(apiRouteContributionSchema).optional(),
  configuration: configurationContributionSchema.optional(),
})

/**
 * Extension permissions
 */
const permissionsSchema = z.object({
  client: z.array(clientPermissionSchema).optional(),
  server: z.array(serverPermissionSchema).optional(),
})

/**
 * Native extension configuration
 */
const nativeConfigSchema = z.object({
  platforms: z.array(platformSchema).min(1, 'At least one platform is required'),
  electronMain: z.string().optional(),
  requiresAdmin: z.boolean().optional(),
  nativeDependencies: z.array(z.string()).optional(),
})

/**
 * Complete extension manifest schema
 */
export const extensionManifestSchema = z.object({
  // Identity (required)
  id: extensionIdSchema,
  name: z.string().min(1, 'Extension name is required').max(100, 'Name too long'),
  version: semverSchema,
  publisher: z.string().min(1, 'Publisher is required').regex(
    /^[a-z][a-z0-9-]*$/,
    'Publisher must be lowercase with letters, numbers, and hyphens'
  ),
  
  // Metadata
  description: z.string().max(500, 'Description too long').optional(),
  icon: z.string().optional(),
  repository: z.string().url('Repository must be a valid URL').optional(),
  license: z.string().min(1, 'License is required'),
  keywords: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  changelog: z.string().optional(),
  
  // Category
  category: categorySchema.optional().default('sandboxed'),
  native: nativeConfigSchema.optional(),
  
  // Dependencies
  engines: z.object({
    blueplm: semverRangeSchema,
  }),
  extensionDependencies: z.array(extensionDependencySchema).optional(),
  extensionPack: z.array(extensionIdSchema).optional(),
  
  // Entry points
  main: z.string().optional(),
  serverMain: z.string().optional(),
  
  // Capabilities
  activationEvents: z.array(activationEventSchema).min(1, 'At least one activation event is required'),
  contributes: contributionsSchema,
  permissions: permissionsSchema,
}).refine(
  // Native extensions must have native config
  (data: { category?: string; native?: unknown }) => data.category !== 'native' || data.native !== undefined,
  {
    message: 'Native extensions must specify native configuration',
    path: ['native'],
  }
).refine(
  // Must have at least one entry point
  (data: { main?: string; serverMain?: string }) => data.main !== undefined || data.serverMain !== undefined,
  {
    message: 'Extension must have at least one entry point (main or serverMain)',
    path: ['main'],
  }
).refine(
  // Validate publisher matches ID
  (data: { id: string; publisher: string }) => data.id.startsWith(`${data.publisher}.`),
  {
    message: 'Extension ID must start with publisher slug',
    path: ['id'],
  }
)

// ═══════════════════════════════════════════════════════════════════════════════
// PARSER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parse and validate a manifest from unknown input.
 * 
 * @param json - Raw JSON object (from JSON.parse or file)
 * @returns Validated ExtensionManifest
 * @throws {ManifestParseError} If validation fails
 * 
 * @example
 * const manifest = parseManifest(JSON.parse(manifestJson));
 */
export function parseManifest(json: unknown): ExtensionManifest {
  const result = extensionManifestSchema.safeParse(json)
  
  if (!result.success) {
    throw new ManifestParseError(formatZodErrors(result.error))
  }
  
  return result.data as ExtensionManifest
}

/**
 * Validate a manifest with detailed error reporting.
 * 
 * @param json - Raw JSON object
 * @returns Validation result with errors and warnings
 * 
 * @example
 * const result = validateManifest(manifestData);
 * if (!result.valid) {
 *   console.error('Errors:', result.errors);
 * }
 */
export function validateManifest(json: unknown): ValidationResult {
  const result = extensionManifestSchema.safeParse(json)
  
  if (result.success) {
    const warnings = collectWarnings(result.data)
    return {
      valid: true,
      manifest: result.data as ExtensionManifest,
      warnings: warnings.length > 0 ? warnings : undefined,
    }
  }
  
  return {
    valid: false,
    errors: formatZodErrors(result.error),
  }
}

/**
 * Parse manifest from JSON string.
 * 
 * @param jsonString - JSON string content
 * @returns Validated ExtensionManifest
 */
export function parseManifestString(jsonString: string): ExtensionManifest {
  try {
    const json = JSON.parse(jsonString)
    return parseManifest(json)
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ManifestParseError([{
        path: '',
        message: `Invalid JSON: ${error.message}`,
      }])
    }
    throw error
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Error thrown when manifest parsing fails.
 */
export class ManifestParseError extends Error {
  /** Validation errors */
  public readonly errors: ValidationError[]
  
  constructor(errors: ValidationError[]) {
    const summary = errors.slice(0, 3).map(e => `  - ${e.path}: ${e.message}`).join('\n')
    const more = errors.length > 3 ? `\n  ... and ${errors.length - 3} more errors` : ''
    
    super(`Invalid extension manifest:\n${summary}${more}`)
    this.name = 'ManifestParseError'
    this.errors = errors
  }
}

/**
 * Convert Zod errors to ValidationError format.
 */
function formatZodErrors(zodError: z.ZodError): ValidationError[] {
  return zodError.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    expected: 'expected' in issue ? String((issue as { expected?: unknown }).expected) : undefined,
    received: 'received' in issue ? String((issue as { received?: unknown }).received) : undefined,
  }))
}

/**
 * Collect warnings for valid manifests (non-fatal issues).
 */
function collectWarnings(manifest: z.infer<typeof extensionManifestSchema>): ValidationError[] {
  const warnings: ValidationError[] = []
  
  // Warn if no icon
  if (!manifest.icon) {
    warnings.push({
      path: 'icon',
      message: 'No icon specified. Extensions without icons may not display well in the store.',
    })
  }
  
  // Warn if no description
  if (!manifest.description) {
    warnings.push({
      path: 'description',
      message: 'No description provided. A description helps users understand your extension.',
    })
  }
  
  // Warn if no repository (required for store submission)
  if (!manifest.repository) {
    warnings.push({
      path: 'repository',
      message: 'No repository URL. This is required for store submission.',
    })
  }
  
  // Warn about deprecated features
  if (manifest.contributes.configuration?.properties) {
    for (const [key, prop] of Object.entries(manifest.contributes.configuration.properties)) {
      const typedProp = prop as { deprecationMessage?: string }
      if (typedProp.deprecationMessage) {
        warnings.push({
          path: `contributes.configuration.properties.${key}`,
          message: `Deprecated property: ${typedProp.deprecationMessage}`,
        })
      }
    }
  }
  
  // Warn if native extension doesn't specify electron entry
  if (manifest.category === 'native' && !manifest.native?.electronMain) {
    warnings.push({
      path: 'native.electronMain',
      message: 'Native extension without electronMain entry point.',
    })
  }
  
  // Warn if using broad network permissions
  if (manifest.permissions.server?.includes('http:fetch')) {
    warnings.push({
      path: 'permissions.server',
      message: 'Using http:fetch allows requests to any domain. Consider using http:domain: for specific domains.',
    })
  }
  
  return warnings
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if a manifest is valid without throwing.
 * 
 * @param json - Raw JSON object
 * @returns True if valid
 */
export function isValidManifest(json: unknown): json is ExtensionManifest {
  return extensionManifestSchema.safeParse(json).success
}

/**
 * Extract extension ID from manifest string (quick check without full parse).
 * 
 * @param jsonString - JSON string
 * @returns Extension ID or null
 */
export function extractExtensionId(jsonString: string): string | null {
  try {
    const partial = JSON.parse(jsonString)
    if (typeof partial?.id === 'string' && extensionIdSchema.safeParse(partial.id).success) {
      return partial.id
    }
  } catch {
    // Invalid JSON
  }
  return null
}

/**
 * Get all HTTP domains required by an extension.
 * 
 * @param manifest - Extension manifest
 * @returns Array of domain strings
 */
export function getRequiredDomains(manifest: ExtensionManifest): string[] {
  const domains: string[] = []
  
  for (const perm of manifest.permissions.server ?? []) {
    if (perm.startsWith('http:domain:')) {
      domains.push(perm.slice('http:domain:'.length))
    }
  }
  
  return domains
}

/**
 * Get all activation event types from manifest.
 * 
 * @param manifest - Extension manifest
 * @returns Object with arrays of each event type
 */
export function getActivationEventsByType(manifest: ExtensionManifest): {
  onExtensionEnabled: boolean
  onStartup: boolean
  navigateRoutes: string[]
  commands: string[]
  views: string[]
  fileTypes: string[]
} {
  const result = {
    onExtensionEnabled: false,
    onStartup: false,
    navigateRoutes: [] as string[],
    commands: [] as string[],
    views: [] as string[],
    fileTypes: [] as string[],
  }
  
  for (const event of manifest.activationEvents) {
    if (event === 'onExtensionEnabled') {
      result.onExtensionEnabled = true
    } else if (event === 'onStartup') {
      result.onStartup = true
    } else if (event.startsWith('onNavigate:')) {
      result.navigateRoutes.push(event.slice('onNavigate:'.length))
    } else if (event.startsWith('onCommand:')) {
      result.commands.push(event.slice('onCommand:'.length))
    } else if (event.startsWith('onView:')) {
      result.views.push(event.slice('onView:'.length))
    } else if (event.startsWith('onFileType:')) {
      result.fileTypes.push(event.slice('onFileType:'.length))
    }
  }
  
  return result
}
