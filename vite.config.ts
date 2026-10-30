import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { resolve } from 'path'
import pkg from './package.json'
import { perfBuildPlugin } from './vite.perf'

// The render-performance build (CI only, .github/workflows/render-perf.yml): `perf.html` instead of
// `index.html`, with the fake backends of src/perf/app wired in. A release build never sets this.
const perfBuild = process.env.BLUEPLM_PERF_BUILD === '1'

export default defineConfig({
  define: {
    'import.meta.env.PACKAGE_VERSION': JSON.stringify(pkg.version),
  },
  plugins: [
    ...(perfBuild ? [perfBuildPlugin(__dirname)] : []),
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        onstart(args) {
          // Enable remote debugging on port 9222 for Chrome DevTools Protocol
          args.startup(['.', '--remote-debugging-port=9222'])
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            lib: {
              entry: 'electron/main.ts',
              formats: ['cjs'],
            },
            rollupOptions: {
              // pg (database upgrades) is bundled. Its optional native binding and its Cloudflare
              // Workers socket are only required on paths Node never takes, so they stay external
              // instead of failing the build when they are not installed.
              external: ['electron', 'pg-native', 'pg-cloudflare', 'cloudflare:sockets'],
              output: {
                entryFileNames: '[name].js',
              },
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(args) {
          args.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            lib: {
              entry: 'electron/preload.ts',
              formats: ['cjs'],
            },
            rollupOptions: {
              external: ['electron'],
              output: {
                entryFileNames: '[name].js',
              },
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  esbuild: {
    keepNames: true,
  },
  build: {
    // The perf build maps its frames back to source for the heap report (scripts/render-perf).
    sourcemap: perfBuild,
    rollupOptions: {
      input: {
        ...(perfBuild
          ? { perf: resolve(__dirname, 'perf.html') }
          : { main: resolve(__dirname, 'index.html') }),
      },
    },
  },
})
