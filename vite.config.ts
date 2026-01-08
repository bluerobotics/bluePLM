import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, existsSync } from 'fs'
import pkg from './package.json'

// Plugin to copy Extension Host HTML to build output
function copyExtensionHostHtml(): Plugin {
  return {
    name: 'copy-extension-host-html',
    writeBundle() {
      const srcPath = resolve(__dirname, 'electron/extension-host/host.html')
      const destDir = resolve(__dirname, 'dist-electron/extension-host')
      const destPath = resolve(destDir, 'host.html')
      
      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true })
      }
      
      copyFileSync(srcPath, destPath)
      console.log('Copied extension-host/host.html to dist-electron/extension-host/')
    }
  }
}

export default defineConfig({
  define: {
    'import.meta.env.PACKAGE_VERSION': JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    copyExtensionHostHtml(),
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
              formats: ['cjs']
            },
            rollupOptions: {
              external: ['electron'],
              output: {
                entryFileNames: '[name].js'
              }
            }
          }
        }
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
              formats: ['cjs']
            },
            rollupOptions: {
              external: ['electron'],
              output: {
                entryFileNames: '[name].js'
              }
            }
          }
        }
      },
      {
        entry: 'electron/extension-host/preload.ts',
        onstart(args) {
          args.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron/extension-host',
            lib: {
              entry: 'electron/extension-host/preload.ts',
              formats: ['cjs']
            },
            rollupOptions: {
              external: ['electron'],
              output: {
                entryFileNames: '[name].js'
              }
            }
          }
        }
      }
    ]),
    renderer()
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      }
    }
  }
})
