export type ToastType = 'error' | 'success' | 'info' | 'warning' | 'progress' | 'update'

export interface ToastProgress {
  current: number
  total: number
  percent: number
  speed?: string
  cancelRequested?: boolean
  label?: string
}

export interface ToastMessage {
  id: string
  type: ToastType
  message: string
  duration?: number
  progress?: ToastProgress
}
