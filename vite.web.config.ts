import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'
import pkg from './package.json'
import { buildHeadersFile, findInlineCode } from './web/src/app/securityHeaders'

/**
 * Writes Cloudflare Pages' `_headers` (CSP naming the pinned Supabase host, HSTS, caching) and
 * refuses a build whose index.html carries inline code the CSP would block. Deep links need no
 * `_redirects`: with no top-level 404.html, Pages serves index.html for unknown paths (SPA mode).
 */
function cloudflarePagesHeaders(supabaseUrl: string, apiUrls: string[]): Plugin {
  return {
    name: 'blueplm-web:cloudflare-pages-headers',
    apply: 'build',
    // After vite:build-html, so index.html is in the bundle when it is checked.
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const name of ['_headers', '_redirects', '404.html']) {
        if (existsSync(resolve(__dirname, 'web/public', name))) {
          this.error(`web/public/${name} must not exist: _headers is generated and 404.html would end SPA mode`)
        }
      }
      const html = bundle['index.html']
      if (html?.type === 'asset') {
        const findings = findInlineCode(String(html.source))
        if (findings.length > 0) this.error(`index.html has inline code the CSP blocks: ${findings.join('; ')}`)
      }
      this.emitFile({ type: 'asset', fileName: '_headers', source: buildHeadersFile(supabaseUrl, apiUrls) })
      // The web-only public files (icons, robots.txt); the shared public/ folder is Vite's publicDir.
      for (const name of readdirSync(resolve(__dirname, 'web/public'))) {
        this.emitFile({ type: 'asset', fileName: name, source: readFileSync(resolve(__dirname, 'web/public', name)) })
      }
    },
  }
}

// BluePLM Web (blueplm.io): the desktop renderer (src/) built for the browser. There is no Electron
// main process or preload, so window.electronAPI is undefined and desktop-only features are hidden
// (src/lib/platform.ts). The entry is web/index.html, which pins the backend and then starts the same
// App as the desktop. Never built through vite.config.ts, which wires in the Electron plugins.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, ['VITE_', 'BLUEPLM_WEB_'])
  // The org's API servers (organizations.settings.api_url), allowed in connect-src.
  const apiUrls = (env.BLUEPLM_WEB_API_URLS ?? '').split(',').filter((url) => url.trim())
  if (mode === 'production' && (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY)) {
    // The web build pins its backend at build time. A build without one would ship a client that
    // cannot sign anyone in, so refuse it here instead of at runtime.
    throw new Error('BluePLM Web: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for the build')
  }

  return {
    root: resolve(__dirname, 'web'),
    envDir: __dirname,
    publicDir: resolve(__dirname, 'public'),
    define: {
      'import.meta.env.PACKAGE_VERSION': JSON.stringify(pkg.version),
      'import.meta.env.BLUEPLM_WEB': 'true',
    },
    plugins: [react(), ...(env.VITE_SUPABASE_URL ? [cloudflarePagesHeaders(env.VITE_SUPABASE_URL, apiUrls)] : [])],
    css: {
      // The desktop's postcss and Tailwind config, so classes in src/ compile the same way.
      postcss: __dirname,
    },
    esbuild: {
      keepNames: true,
    },
    resolve: {
      alias: {
        '@web': resolve(__dirname, 'web/src'),
        '@': resolve(__dirname, 'src'),
      },
    },
    server: {
      port: 5174,
      strictPort: true,
    },
    build: {
      outDir: resolve(__dirname, 'dist-web'),
      emptyOutDir: true,
      sourcemap: false,
      target: 'es2020',
    },
  }
})
