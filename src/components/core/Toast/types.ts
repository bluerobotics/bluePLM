export type ToastType = 'error' | 'success' | 'info' | 'warning' | 'progress' | 'update'

export interface ToastProgress {
  current: number
  total: number
  percent: number
  speed?: string
  cancelRequested?: boolean
  label?: string
  queued?: boolean  // True if operation is waiting in queue (not yet started)
}

export interface ToastMessage {
  id: string
  type: ToastType
  message: string
  duration?: number
  progress?: ToastProgress
}
