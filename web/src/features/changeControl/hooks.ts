import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { t } from '@web/i18n'
import { isUniqueViolation, NO_PERMISSIONS, type ChangeControlPermissions } from './model'

export interface LoadState<T> {
  data: T | null
  error: string | null
  loading: boolean
  reload: () => void
}

/** Run a loader on mount and whenever `key` changes; stale results from an earlier key are dropped. */
export function useLoad<T>(load: () => Promise<T>, key: string): LoadState<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true })
  const [count, setCount] = useState(0)
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    let active = true
    setState((previous) => ({ ...previous, loading: true, error: null }))
    loadRef.current().then(
      (data) => active && setState({ data, error: null, loading: false }),
      (error: unknown) => active && setState({ data: null, error: errorMessage(error), loading: false }),
    )
    return () => {
      active = false
    }
  }, [key, count])

  const reload = useCallback(() => setCount((value) => value + 1), [])
  return { ...state, reload }
}

/** A user-facing message for a failed query. */
export function errorMessage(error: unknown, duplicateKey?: string): string {
  const record = typeof error === 'object' && error !== null ? (error as { code?: unknown; message?: unknown }) : null
  const code = typeof record?.code === 'string' ? record.code : null
  const message = typeof record?.message === 'string' ? record.message : null
  if (duplicateKey && isUniqueViolation({ code, message })) return t(duplicateKey)
  if (code === '42501' || /row-level security|permission denied|not authorized/i.test(message ?? '')) {
    return t('changeControl.errors.notAllowed')
  }
  return message ?? t('common.unknownError')
}

export const PermissionsContext = createContext<ChangeControlPermissions>(NO_PERMISSIONS)

export function usePermissions(): ChangeControlPermissions {
  return useContext(PermissionsContext)
}
