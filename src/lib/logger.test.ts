import { afterEach, describe, expect, it, vi } from 'vitest'

import { log } from './logger'

describe('logger error serialization', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('preserves an Error message when forwarding structured data to Electron', () => {
    const electronLog = vi.fn()
    vi.stubGlobal('window', { electronAPI: { log: electronLog } })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    log.error('[ItemDesignations]', 'Failed to load MDB item designations', {
      error: new Error('API route not found.'),
    })

    expect(electronLog).toHaveBeenCalledWith(
      'error',
      '[ItemDesignations] Failed to load MDB item designations',
      expect.objectContaining({
        error: expect.objectContaining({
          name: 'Error',
          message: 'API route not found.',
        }),
      }),
    )
  })
})
