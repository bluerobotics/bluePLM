import { describe, expect, it } from 'vitest'

import { shouldRunVaultLoad } from './vaultLoadPolicy'

describe('vault load policy', () => {
  it('reloads the active vault after its local copy was invalidated', () => {
    expect(
      shouldRunVaultLoad({
        filesLoaded: false,
        loadKey: 'vault-path:vault-1:org-1:user-1:1:online',
        lastLoadKey: 'vault-path:vault-1:org-1:user-1:1:online',
      }),
    ).toBe(true)
  })

  it('does not repeat a completed load for the same session and vault', () => {
    expect(
      shouldRunVaultLoad({
        filesLoaded: true,
        loadKey: 'vault-path:vault-1:org-1:user-1:1:online',
        lastLoadKey: 'vault-path:vault-1:org-1:user-1:1:online',
      }),
    ).toBe(false)
  })
})
