/**
 * Which simulated machine is running right now.
 *
 * Several machines live in one test process. Module singletons (the Zustand store, realtime
 * channels, load coordination, caches) are separated by giving each machine its own module graph
 * (see machine.ts). The globals the app reads instead of importing - `window.electronAPI`,
 * `localStorage`, `sessionStorage`, `indexedDB` - and the Supabase client cannot be separated
 * that way, so they are routed through an AsyncLocalStorage: every machine operation, realtime
 * delivery and watcher event runs inside `runOn(machine, ...)`, and promise continuations and
 * timers keep that context. A global read outside any machine throws, so a leak shows up as a
 * failure instead of one machine quietly reading another's disk.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

import type { SupabaseClient } from '@supabase/supabase-js'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { vi } from 'vitest'

import type { Database } from '@/types/supabase'

export interface MachineContext {
  name: string
  electronAPI: NonNullable<Window['electronAPI']>
  client: SupabaseClient<Database>
  localStorage: Storage
  sessionStorage: Storage
  indexedDB: IDBFactory
}

// One instance per process, not per module graph: this module is evaluated again in every
// machine's graph (the client mock's factory imports it there), and every copy must see the same
// context.
const ALS_KEY = Symbol.for('bluePLM.test.multi.machineContext')
const holder = globalThis as unknown as Record<symbol, AsyncLocalStorage<MachineContext> | undefined>
const als: AsyncLocalStorage<MachineContext> = (holder[ALS_KEY] ??= new AsyncLocalStorage<MachineContext>())

export function currentMachine(): MachineContext {
  const ctx = als.getStore()
  if (!ctx) throw new Error('multi: a machine global was read outside any machine (wrap the call in runOn)')
  return ctx
}

export function currentMachineOrNull(): MachineContext | null {
  return als.getStore() ?? null
}

export function runOn<T>(ctx: MachineContext, fn: () => T): T {
  return als.run(ctx, fn)
}

/** A plain in-memory Storage, one per machine. Survives a restart of that machine. */
export class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>()
  get length(): number {
    return this.map.size
  }
  clear(): void {
    this.map.clear()
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value))
  }
}

export function newIndexedDB(): IDBFactory {
  return new IDBFactory()
}

const INSTALLED_KEY = Symbol.for('bluePLM.test.multi.globalsInstalled')

/**
 * Route the per-machine globals through the current machine, and make fake timers keep the
 * machine context: a callback runs in the context it was scheduled from, as real timers do.
 * Call once per test file, in `beforeAll`.
 */
export function installMachineGlobals(): void {
  const flags = globalThis as unknown as Record<symbol, boolean | undefined>
  if (flags[INSTALLED_KEY]) return
  flags[INSTALLED_KEY] = true
  const targets = new Set<object>([globalThis])
  if (typeof window !== 'undefined') targets.add(window)
  for (const target of targets) {
    for (const [name, read] of [
      ['electronAPI', () => currentMachine().electronAPI],
      ['localStorage', () => currentMachine().localStorage],
      ['sessionStorage', () => currentMachine().sessionStorage],
      ['indexedDB', () => currentMachine().indexedDB],
    ] as const) {
      Object.defineProperty(target, name, { get: read, configurable: true })
    }
    Object.defineProperty(target, 'IDBKeyRange', { value: IDBKeyRange, configurable: true, writable: true })
  }
}

/**
 * Fake timers with the machine context carried across: `vi.useFakeTimers` alone would run every
 * callback in the context of whoever advances the clock. `Date` is faked too, so the app's
 * suppression windows and debounce checks see the same clock as its timers.
 */
const TIMERS_KEY = Symbol.for('bluePLM.test.multi.timersInstalled')

export function installMachineTimers(): void {
  // Once per test file: uninstalling and installing again around the wrappers below loses the
  // timer functions altogether. Between tests, `vi.clearAllTimers()` drops what is pending.
  const flags = globalThis as unknown as Record<symbol, boolean | undefined>
  if (flags[TIMERS_KEY]) return
  flags[TIMERS_KEY] = true
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    now: Date.parse('2026-10-20T09:00:00.000Z'),
  })
  const targets = new Set<Record<string, unknown>>([globalThis as unknown as Record<string, unknown>])
  if (typeof window !== 'undefined') targets.add(window as unknown as Record<string, unknown>)
  for (const target of targets) {
    for (const name of ['setTimeout', 'setInterval'] as const) {
      const fake = target[name] as (cb: unknown, ms?: number, ...args: unknown[]) => unknown
      const bound = (cb: unknown, ms?: number, ...args: unknown[]) =>
        fake(typeof cb === 'function' ? AsyncLocalStorage.bind(cb as () => void) : cb, ms, ...args)
      target[name] = bound
    }
    target.requestAnimationFrame = (cb: FrameRequestCallback) => globalThis.setTimeout(() => cb(Date.now()), 16)
    target.cancelAnimationFrame = (id: number) => globalThis.clearTimeout(id)
  }
}
