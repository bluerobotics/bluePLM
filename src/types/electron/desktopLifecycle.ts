export interface DesktopLifecycleAPI {
  // App info
  getVersion: () => Promise<string>
  getPlatform: () => Promise<string>
  getTitleBarOverlayRect: () => Promise<{ x: number; y: number; width: number; height: number }>
  setTitleBarOverlay: (options: {
    color: string
    symbolColor: string
  }) => Promise<{ success: boolean; error?: string }>
  getZoomFactor: () => Promise<number>
  setZoomFactor: (factor: number) => Promise<{ success: boolean; factor?: number; error?: string }>
  onZoomChanged: (callback: (factor: number) => void) => () => void
  getWindowSize: () => Promise<{ width: number; height: number } | null>
  setWindowSize: (width: number, height: number) => Promise<{ success: boolean; error?: string }>
  resetWindowSize: () => Promise<{
    success: boolean
    size?: { width: number; height: number }
    error?: string
  }>
  getPathForFile: (file: File) => string
  reloadApp: () => Promise<{ success: boolean; error?: string }>
  requestFocus: () => Promise<{ success: boolean; error?: string }>
  openPerformanceWindow: () => Promise<{ success: boolean; error?: string }>
  createTabWindow: (
    view: string,
    title: string,
    customData?: Record<string, unknown>,
  ) => Promise<{ success: boolean; error?: string }>

  // Window controls
  minimize: () => void
  maximize: () => void
  close: () => void
  isMaximized: () => Promise<boolean>
}
