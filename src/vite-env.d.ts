/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly PACKAGE_VERSION: string
  /** True only in the BluePLM Web build (vite.web.config.ts). */
  readonly BLUEPLM_WEB?: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
