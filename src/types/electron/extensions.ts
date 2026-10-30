export interface ExtensionAPI {
  extensions: {
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
  }
}

/** A native extension manifest (extension.json): the fields the renderer reads. */
export interface NativeExtensionManifestInfo {
  id: string
  name: string
  version: string
  publisher: string
  description?: string
  icon?: string
  repository?: string
  license?: string
  category?: 'native'
  main?: string
  serverMain?: string
}

/** `extensions:native-prepare` result */
export type NativePrepareResult =
  | {
      success: true
      sha256: string
      /** `blueplm-ext://<sha256>/` */
      baseUrl: string
      clientEntryUrl: string
      manifest: NativeExtensionManifestInfo & Record<string, unknown>
      cached: boolean
    }
  | { success: false; error: string }

/** `extensions:native-inspect` result (admin upload) */
export type NativeInspectResult =
  | {
      success: true
      manifest: NativeExtensionManifestInfo & Record<string, unknown>
      sha256: string
      size: number
      sqlFiles: Array<{ name: string; content: string }>
      data: Uint8Array
    }
  | { success: false; canceled?: boolean; error?: string }
