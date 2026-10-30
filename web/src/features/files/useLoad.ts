import { useCallback, useEffect, useState } from 'react'

export type LoadState<T> =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: T; error: null }
  | { status: 'error'; data: null; error: string }

/**
 * Run `load` whenever `key` changes and keep only the latest answer, so a slow response for a
 * folder the user already left cannot overwrite the current one. `load` is read on each run
 * through the key, so callers must put every input it uses into the key.
 */
export function useLoad<T>(key: string, load: () => Promise<T>): LoadState<T> & { reload: () => void } {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading', data: null, error: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setState({ status: 'loading', data: null, error: null })
    load().then(
      (data) => {
        if (active) setState({ status: 'ready', data, error: null })
      },
      (error: unknown) => {
        if (active) setState({ status: 'error', data: null, error: error instanceof Error ? error.message : String(error) })
      },
    )
    return () => {
      active = false
    }
    // `load` is a fresh closure every render; `key` names everything it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  return { ...state, reload }
}
