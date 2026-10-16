import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const scriptPath = path.resolve(__dirname, 'inspect-edrawings-preview-exports.cjs')
const scriptSource = readFileSync(scriptPath, 'utf8')

type ProbeOptions = {
  mode: 'production' | 'verify'
  methods?: string[]
  diagnostics?: boolean
  addonLoadError?: Error
}

async function runProbe(options: ProbeOptions) {
  const exitCalls: number[] = []
  let quitCalls = 0
  const deferredTasks: Array<() => void> = []
  const errors: string[] = []
  const methods = options.methods ?? [
    'attachToWindow',
    'loadFile',
    'setBounds',
    'show',
    'hide',
    'destroy',
    'isLoaded',
    'lastError',
  ]
  const preview = Object.fromEntries(methods.map((method) => [method, () => undefined]))
  if (options.diagnostics) {
    preview.getVisualState = () => undefined
    preview.getWindowState = () => undefined
  }
  const app = {
    whenReady: () => Promise.resolve(),
    exit: (code: number) => exitCalls.push(code),
    quit: () => {
      quitCalls += 1
    },
  }

  runInNewContext(
    scriptSource,
    {
      __dirname: path.dirname(scriptPath),
      console: {
        log: () => undefined,
        error: (...values: unknown[]) => errors.push(values.map(String).join(' ')),
      },
      process: { argv: ['electron', scriptPath, options.mode] },
      require: (specifier: string) => {
        if (specifier === 'electron') return { app }
        if (specifier === 'node:path') return path
        if (options.addonLoadError) throw options.addonLoadError
        return {
          EDrawingsPreview: class {
            constructor() {
              return preview
            }
          },
        }
      },
      setImmediate: (callback: () => void) => {
        deferredTasks.push(callback)
        return deferredTasks.length
      },
    },
    { filename: scriptPath },
  )

  await Promise.resolve()
  return {
    exitCalls,
    get quitCalls() {
      return quitCalls
    },
    deferredTasks,
    errors,
  }
}

describe('eDrawings native-export inspector exit contract', () => {
  it.each(['production', 'verify'] as const)(
    'waits until the successful %s callback returns before quitting exactly once',
    async (mode) => {
      const result = await runProbe({ mode, diagnostics: mode === 'verify' })

      expect(result.exitCalls).toEqual([])
      expect(result.quitCalls).toBe(0)
      expect(result.deferredTasks).toHaveLength(1)

      result.deferredTasks[0]!()

      expect(result.quitCalls).toBe(1)
      expect(result.exitCalls).not.toContain(0)
    },
  )

  it('preserves a nonzero failure exit for a production diagnostics mismatch without scheduling quit', async () => {
    const result = await runProbe({ mode: 'production', diagnostics: true })

    expect(result.exitCalls).toEqual([1])
    expect(result.quitCalls).toBe(0)
    expect(result.deferredTasks).toHaveLength(0)
    expect(result.errors.join('\n')).toContain(
      'production addon export mismatch: getVisualState=true, getWindowState=true',
    )
  })

  it('preserves a nonzero failure exit when a required production method is missing', async () => {
    const result = await runProbe({ mode: 'production', methods: ['loadFile'] })

    expect(result.exitCalls).toEqual([1])
    expect(result.quitCalls).toBe(0)
    expect(result.deferredTasks).toHaveLength(0)
    expect(result.errors.join('\n')).toContain(
      'production addon is missing production exports: attachToWindow, setBounds, show, hide, destroy, isLoaded, lastError',
    )
  })

  it('preserves a nonzero failure exit when loading the native addon fails', async () => {
    const result = await runProbe({
      mode: 'production',
      addonLoadError: new Error('fixture addon load failure'),
    })

    expect(result.exitCalls).toEqual([1])
    expect(result.quitCalls).toBe(0)
    expect(result.deferredTasks).toHaveLength(0)
    expect(result.errors.join('\n')).toContain('fixture addon load failure')
  })
})
