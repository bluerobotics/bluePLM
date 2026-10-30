// A small history router. The app has a handful of top-level sections, each of which reads its
// own sub-path and query string, so a routing library would add more surface than it saves.
import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react'

const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((listener) => listener())
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', emit)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function snapshot(): string {
  return window.location.pathname + window.location.search
}

/** Only same-origin, absolute app paths are navigable; anything else would be an open redirect. */
export function isAppPath(to: string): boolean {
  return to.startsWith('/') && !to.startsWith('//') && !to.startsWith('/\\')
}

export function navigate(to: string, options?: { replace?: boolean }): void {
  if (!isAppPath(to)) return
  if (options?.replace) window.history.replaceState(null, '', to)
  else window.history.pushState(null, '', to)
  emit()
}

export interface Route {
  /** Path segments, decoded: `/reviews/abc` → ['reviews', 'abc']. */
  segments: string[]
  query: URLSearchParams
  pathname: string
}

export function parseRoute(location: string): Route {
  const url = new URL(location, 'http://local')
  const segments = url.pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment)
      } catch {
        return segment
      }
    })
  return { segments, query: url.searchParams, pathname: url.pathname }
}

export function useRoute(): Route {
  const location = useSyncExternalStore(subscribe, snapshot, () => '/')
  return parseRoute(location)
}

/** Build an app path from segments and an optional query, encoding each part. */
export function href(segments: string[], query?: Record<string, string | undefined>): string {
  const path = '/' + segments.map((segment) => encodeURIComponent(segment)).join('/')
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== '') params.set(key, value)
  }
  const search = params.toString()
  return search ? `${path}?${search}` : path
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }

export function Link({ to, onClick, ...rest }: LinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(to)
  }
  return <a href={to} onClick={handleClick} {...rest} />
}
