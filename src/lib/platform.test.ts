import { afterEach, describe, expect, it, vi } from 'vitest'
import { cloudOnlyTextClass, hasDesktop } from './platform'

describe('platform', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('dims cloud-only rows on the desktop, where it tells them apart from downloaded ones', () => {
    vi.stubGlobal('window', { electronAPI: {} })
    expect(hasDesktop()).toBe(true)
    expect(cloudOnlyTextClass(true)).toBe('italic text-plm-fg-muted')
    expect(cloudOnlyTextClass(false)).toBe('')
  })

  it('shows every row normally on the web, where all rows are cloud-only', () => {
    vi.stubGlobal('window', {})
    expect(hasDesktop()).toBe(false)
    expect(cloudOnlyTextClass(true)).toBe('')
    expect(cloudOnlyTextClass(false)).toBe('')
  })
})
