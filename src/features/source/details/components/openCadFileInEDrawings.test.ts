import { describe, expect, it, vi } from 'vitest'

import { openCadFileInEDrawings } from './openCadFileInEDrawings'

describe('openCadFileInEDrawings', () => {
  it('reports a resolved failure result', async () => {
    const failure = { success: false, errorCode: 'external-open-failed' }
    const onFailure = vi.fn()

    await expect(
      openCadFileInEDrawings('part.sldprt', {
        openFile: vi.fn().mockResolvedValue(failure),
        onFailure,
      }),
    ).resolves.toBe(false)
    expect(onFailure).toHaveBeenCalledWith(failure)
  })

  it('reports a rejected open request', async () => {
    const error = new Error('IPC unavailable')
    const onFailure = vi.fn()

    await expect(
      openCadFileInEDrawings('part.sldprt', {
        openFile: vi.fn().mockRejectedValue(error),
        onFailure,
      }),
    ).resolves.toBe(false)
    expect(onFailure).toHaveBeenCalledWith(error)
  })
})
