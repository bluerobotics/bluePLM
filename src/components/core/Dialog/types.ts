import type { ReactNode } from 'react'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
}

export interface ConfirmDialogProps extends Omit<DialogProps, 'children'> {
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  variant?: 'danger' | 'warning' | 'info'
}
