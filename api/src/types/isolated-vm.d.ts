/**
 * Type declarations for isolated-vm
 * 
 * This provides type definitions when the native module isn't available locally.
 * On production (Railway/Linux), the actual package with native bindings is used.
 */
declare module 'isolated-vm' {
  export interface IsolateOptions {
    memoryLimit?: number
    inspector?: boolean
    onCatastrophicError?: (message: string) => void
  }

  export interface HeapStatistics {
    total_heap_size: number
    total_heap_size_executable: number
    total_physical_size: number
    total_available_size: number
    used_heap_size: number
    heap_size_limit: number
    malloced_memory: number
    peak_malloced_memory: number
    does_zap_garbage: number
    externally_allocated_size: number
  }

  export interface ContextOptions {
    inspector?: boolean
  }

  export interface ScriptRunOptions {
    timeout?: number
    promise?: boolean
    reference?: boolean
    copy?: boolean
  }

  export interface ApplyOptions {
    result?: {
      promise?: boolean
      copy?: boolean
      reference?: boolean
    }
    arguments?: {
      copy?: boolean
      reference?: boolean
    }
    timeout?: number
  }

  export class Isolate {
    constructor(options?: IsolateOptions)
    createContext(options?: ContextOptions): Promise<Context>
    compileScript(code: string, options?: { filename?: string }): Promise<Script>
    compileScriptSync(code: string, options?: { filename?: string }): Script
    getHeapStatistics(): HeapStatistics
    dispose(): void
  }

  export class Context {
    global: Reference<Record<string, unknown>>
    eval(code: string, options?: ScriptRunOptions): Promise<unknown>
    evalSync(code: string, options?: ScriptRunOptions): unknown
  }

  export class Script {
    run(context: Context, options?: ScriptRunOptions): Promise<unknown>
    runSync(context: Context, options?: ScriptRunOptions): unknown
  }

  export class Reference<T = unknown> {
    constructor(value: T, options?: { copy?: boolean })
    get(property: string): Promise<Reference<unknown>>
    getSync(property: string): Reference<unknown>
    set(property: string, value: unknown): Promise<void>
    setSync(property: string, value: unknown): void
    apply(
      receiver: unknown,
      args: unknown[],
      options?: ApplyOptions
    ): Promise<unknown>
    applySync(receiver: unknown, args: unknown[], options?: ApplyOptions): unknown
    deref(): T
    derefInto(): T
    copy(): Promise<T>
    copySync(): T
    release(): void
  }

  export class Callback {
    constructor(callback: (...args: any[]) => any, options?: { async?: boolean })
  }

  export class ExternalCopy<T = unknown> {
    constructor(value: T)
    copy(): Promise<T>
    copySync(): T
    copyInto(): T
    release(): void
  }
}
