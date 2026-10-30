import { describe, expect, it, vi } from 'vitest'

const { openExternal } = vi.hoisted(() => ({ openExternal: vi.fn(() => Promise.resolve()) }))
vi.mock('electron', () => ({ shell: { openExternal } }))

import {
  installNavigationGuard,
  isAppNavigation,
  isGoogleAuthUrl,
  isGoogleDocumentUrl,
  isSafeExternalUrl,
  openExternalSafely,
} from './navigationGuard'

describe('openExternal allows https only', () => {
  it.each([
    ['https://blueplm.io/docs', true],
    ['http://example.com', false],
    ['file:///C:/Windows/System32/calc.exe', false],
    ['file://server/share/x.exe', false],
    ['search-ms:query=x&crumb=location:\\\\evil\\share', false],
    ['ms-msdt:/id PCWDiagnostic', false],
    ['javascript:alert(1)', false],
    ['not a url', false],
  ])('%s -> %s', (url, ok) => {
    expect(isSafeExternalUrl(url)).toBe(ok)
  })

  it('never hands a refused URL to the shell', () => {
    openExternal.mockClear()
    expect(openExternalSafely('file:///C:/x.exe')).toBe(false)
    expect(openExternal).not.toHaveBeenCalled()
    expect(openExternalSafely('https://github.com/')).toBe(true)
    expect(openExternal).toHaveBeenCalledWith('https://github.com/')
  })
})

describe('top-level navigation stays in the app', () => {
  it('allows the packaged page and, in development only, the dev server', () => {
    expect(isAppNavigation('file:///C:/app/dist/index.html#/x', false)).toBe(true)
    expect(isAppNavigation('http://localhost:5173/#/x', true)).toBe(true)
    expect(isAppNavigation('http://localhost:5173/#/x', false)).toBe(false)
    expect(isAppNavigation('http://localhost:5174/', true)).toBe(false)
    expect(isAppNavigation('https://evil.example/', true)).toBe(false)
  })

  it('prevents a remote navigation and lets an intercepted one through the intercept', () => {
    let handler: ((e: { preventDefault: () => void }, url: string) => void) | undefined
    const contents = { on: (_: string, h: typeof handler) => (handler = h) }
    const intercept = vi.fn((url: string) => url.startsWith('http://localhost') && url.includes('access_token'))
    installNavigationGuard(contents as never, { allowDevServer: false, intercept })

    const nav = (url: string) => {
      const preventDefault = vi.fn()
      handler?.({ preventDefault }, url)
      return preventDefault.mock.calls.length > 0
    }
    expect(nav('https://evil.example/')).toBe(true)
    expect(nav('file:///C:/app/dist/index.html')).toBe(false)
    expect(nav('http://localhost:3000/#access_token=x')).toBe(true)
    expect(intercept).toHaveBeenCalledWith('http://localhost:3000/#access_token=x')
  })
})

describe('Google sign-in window is matched by host', () => {
  it.each([
    ['https://accounts.google.com/o/oauth2/v2/auth?x=1', true],
    ['https://www.google.com/signin/v2', true],
    ['https://google.com/o/oauth2/auth', true],
    ['https://evil.example/?next=accounts.google.com', false],
    ['https://accounts.google.com.evil.example/', false],
    ['https://evil.example/google.com/o/oauth2', false],
    ['http://accounts.google.com/', false],
  ])('%s -> %s', (url, ok) => {
    expect(isGoogleAuthUrl(url)).toBe(ok)
  })

  it('closes on a real Docs/Drive document only', () => {
    expect(isGoogleDocumentUrl('https://docs.google.com/document/d/abc/edit')).toBe(true)
    expect(isGoogleDocumentUrl('https://drive.google.com/file/d/abc/view')).toBe(true)
    expect(isGoogleDocumentUrl('https://evil.example/docs.google.com/document/d/abc')).toBe(false)
  })
})
