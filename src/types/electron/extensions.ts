export interface ExtensionAPI {
  extensions: {
    // ----- Queries -----
    getAll: () => Promise<ExtensionInfo[]>
    getExtension: (extensionId: string) => Promise<ExtensionInfo | undefined>

    // ----- Store Operations -----
    fetchStore: () => Promise<StoreExtensionInfo[]>
    searchStore: (request: {
      query?: string
      category?: string
      verifiedOnly?: boolean
      sort?: 'popular' | 'recent' | 'name'
      page?: number
      pageSize?: number
    }) => Promise<{
      extensions: StoreExtensionInfo[]
      total: number
      page: number
      hasMore: boolean
    }>
    getStoreExtension: (extensionId: string) => Promise<StoreExtensionInfo | undefined>

    // ----- Installation -----
    // downloadId: database UUID for download, manifestId: expected manifest ID for validation
    install: (
      downloadId: string,
      version?: string,
      manifestId?: string,
    ) => Promise<ExtensionInstallResult>
    installFromFile: (
      bpxPath: string,
      acknowledgeUnsigned?: boolean,
    ) => Promise<ExtensionInstallResult>
    uninstall: (extensionId: string) => Promise<{ success: boolean; error?: string }>

    // ----- Native extensions (org-installed, SHA-256 pinned) -----
    nativePrepare: (request: {
      extensionId: string
      version: string
      sha256: string
      downloadUrl: string
    }) => Promise<NativePrepareResult>
    nativePrune: (
      keepShas: string[],
    ) => Promise<{ success: boolean; removed: string[]; error?: string }>
    nativeInspect: () => Promise<NativeInspectResult>

    // ----- Events -----
    onStateChange: (callback: (event: ExtensionStateChangeEvent) => void) => () => void
  }
}

/** Extension state as main reports it: a package is either installed or not. */
export type ExtensionState = 'not-installed' | 'installed'

/** Extension verification status */
export type ExtensionVerificationStatus = 'verified' | 'community' | 'sideloaded'

/** Extension category */
export type ExtensionCategory = 'sandboxed' | 'native'

/** An installed extension package, as `extensions:get-all` returns it */
export interface ExtensionInfo {
  manifest: {
    id: string
    name: string
    version: string
    publisher: string
    description?: string
    icon?: string
    repository?: string
    license?: string
    category?: ExtensionCategory
    main?: string
    serverMain?: string
  }
  state: ExtensionState
  verification: ExtensionVerificationStatus
  installedAt: string
}

/** Store extension listing */
export interface StoreExtensionInfo {
  id: string
  extensionId: string
  publisher: {
    id: string
    name: string
    slug: string
    verified: boolean
  }
  name: string
  description?: string
  iconUrl?: string
  repositoryUrl: string
  license: string
  category: ExtensionCategory
  categories: string[]
  tags: string[]
  verified: boolean
  featured: boolean
  downloadCount: number
  latestVersion: string
  createdAt: string
  updatedAt: string
  deprecation?: {
    deprecatedAt: string
    reason: string
    replacementId?: string
    sunsetDate?: string
  }
}

/** Result of `extensions:install` and `extensions:install-from-file` */
export interface ExtensionInstallResult {
  success: boolean
  extensionId?: string
  version?: string
  error?: string
  warning?: string
  requiresAcknowledgment?: boolean
}

/** `extensions:native-prepare` result */
export type NativePrepareResult =
  | {
      success: true
      sha256: string
      /** `blueplm-ext://<sha256>/` */
      baseUrl: string
      clientEntryUrl: string
      manifest: ExtensionInfo['manifest'] & Record<string, unknown>
      cached: boolean
    }
  | { success: false; error: string }

/** `extensions:native-inspect` result (admin upload) */
export type NativeInspectResult =
  | {
      success: true
      manifest: ExtensionInfo['manifest'] & Record<string, unknown>
      sha256: string
      size: number
      sqlFiles: Array<{ name: string; content: string }>
      data: Uint8Array
    }
  | { success: false; canceled?: boolean; error?: string }

/** `extension:state-change`: sent by main after an install or an uninstall */
export interface ExtensionStateChangeEvent {
  extensionId: string
  state: ExtensionState
  timestamp: number
}
