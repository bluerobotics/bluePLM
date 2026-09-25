import { beforeEach, describe, expect, it, vi } from 'vitest'

const { channel, isBackendActive } = vi.hoisted(() => ({
  channel: vi.fn(),
  isBackendActive: vi.fn(),
}))

vi.mock('./supabase', () => ({
  supabase: { channel },
}))

vi.mock('./backend', () => ({
  isBackendActive,
}))

import { subscribeToFiles } from './realtime'

describe('Community realtime isolation', () => {
  beforeEach(() => {
    channel.mockReset()
    isBackendActive.mockReturnValue(true)
  })

  it('does not open a Supabase files channel while the Community backend is active', () => {
    const unsubscribe = subscribeToFiles('community-org', vi.fn())

    expect(channel).not.toHaveBeenCalled()
    expect(() => unsubscribe()).not.toThrow()
  })
})
