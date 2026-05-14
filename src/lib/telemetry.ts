// High-speed telemetry service for performance monitoring
// Collects FPS data at configurable intervals (CPU/memory/network removed
// along with the systeminformation dependency to avoid powershell.exe spawns)

export interface TelemetrySnapshot {
  timestamp: number
  fps: number
  modules: Record<string, ModuleMemory>
}

export interface ModuleMemory {
  name: string
  heapUsed: number
  instances: number
  lastUpdate: number
}

export interface TelemetryConfig {
  sampleRateHz: number // How often to sample (default 50Hz)
  retentionSeconds: number // How long to keep data (default 60s)
  enabled: boolean
}

const DEFAULT_CONFIG: TelemetryConfig = {
  sampleRateHz: 50,
  retentionSeconds: 60,
  enabled: false,
}

// Circular buffer for efficient time-series storage
class CircularBuffer<T> {
  private buffer: T[]
  private head = 0
  private tail = 0
  private count = 0

  constructor(private capacity: number) {
    this.buffer = new Array(capacity)
  }

  push(item: T): void {
    this.buffer[this.tail] = item
    this.tail = (this.tail + 1) % this.capacity

    if (this.count < this.capacity) {
      this.count++
    } else {
      this.head = (this.head + 1) % this.capacity
    }
  }

  toArray(): T[] {
    const result: T[] = []
    for (let i = 0; i < this.count; i++) {
      result.push(this.buffer[(this.head + i) % this.capacity])
    }
    return result
  }

  get length(): number {
    return this.count
  }

  clear(): void {
    this.head = 0
    this.tail = 0
    this.count = 0
  }

  resize(newCapacity: number): void {
    const data = this.toArray()
    this.capacity = newCapacity
    this.buffer = new Array(newCapacity)
    this.head = 0
    this.tail = 0
    this.count = 0

    // Keep only the most recent data that fits
    const start = Math.max(0, data.length - newCapacity)
    for (let i = start; i < data.length; i++) {
      this.push(data[i])
    }
  }
}

// Telemetry service singleton
class TelemetryService {
  private config: TelemetryConfig = { ...DEFAULT_CONFIG }
  private buffer: CircularBuffer<TelemetrySnapshot>
  private intervalId: number | null = null
  private listeners: Set<(snapshot: TelemetrySnapshot) => void> = new Set()

  // FPS tracking
  private frameCount = 0
  private lastFpsTime = performance.now()
  private currentFps = 60
  private rafId: number | null = null

  constructor() {
    // Calculate buffer size based on config
    const bufferSize = this.config.sampleRateHz * this.config.retentionSeconds
    this.buffer = new CircularBuffer(bufferSize)
  }

  // Configure the service
  configure(config: Partial<TelemetryConfig>): void {
    const wasEnabled = this.config.enabled
    this.config = { ...this.config, ...config }

    // Resize buffer if retention changed
    const newBufferSize = this.config.sampleRateHz * this.config.retentionSeconds
    this.buffer.resize(newBufferSize)

    // Persist config
    localStorage.setItem('telemetry.config', JSON.stringify(this.config))

    // Start/stop based on enabled state
    if (this.config.enabled && !wasEnabled) {
      this.start()
    } else if (!this.config.enabled && wasEnabled) {
      this.stop()
    }
  }

  // Load saved config
  loadConfig(): TelemetryConfig {
    const saved = localStorage.getItem('telemetry.config')
    if (saved) {
      try {
        this.config = { ...DEFAULT_CONFIG, ...JSON.parse(saved) }
      } catch {
        // Ignore parse errors
      }
    }
    return this.config
  }

  getConfig(): TelemetryConfig {
    return { ...this.config }
  }

  // Start collecting telemetry
  start(): void {
    if (this.intervalId) return

    this.config.enabled = true

    // Start FPS counter
    this.startFpsCounter()

    // Start high-speed sampling
    const intervalMs = 1000 / this.config.sampleRateHz
    this.intervalId = window.setInterval(() => this.sample(), intervalMs)
  }

  // Stop collecting
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.config.enabled = false
  }

  // Check if running
  isRunning(): boolean {
    return this.intervalId !== null
  }

  // Subscribe to real-time updates
  subscribe(callback: (snapshot: TelemetrySnapshot) => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  // Get historical data
  getHistory(): TelemetrySnapshot[] {
    return this.buffer.toArray()
  }

  // Get current FPS (can be used externally)
  getCurrentFps(): number {
    return this.currentFps
  }

  // Clear all data
  clear(): void {
    this.buffer.clear()
  }

  private startFpsCounter(): void {
    const measureFrame = () => {
      this.frameCount++
      const now = performance.now()
      const delta = now - this.lastFpsTime

      // Update FPS every 100ms for smoother display
      if (delta >= 100) {
        this.currentFps = Math.round((this.frameCount / delta) * 1000)
        this.frameCount = 0
        this.lastFpsTime = now
      }

      if (this.config.enabled) {
        this.rafId = requestAnimationFrame(measureFrame)
      }
    }
    this.rafId = requestAnimationFrame(measureFrame)
  }

  private sample(): void {
    const snapshot: TelemetrySnapshot = {
      timestamp: Date.now(),
      fps: this.currentFps,
      modules: {},
    }

    this.buffer.push(snapshot)

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(snapshot)
      } catch {
        // Listener error - ignore
      }
    }
  }
}

// Export singleton
export const telemetry = new TelemetryService()

// Export for external FPS access (faster updates)
export function getFps(): number {
  return telemetry.getCurrentFps()
}
