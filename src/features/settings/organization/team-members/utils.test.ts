import { describe, expect, it } from 'vitest'

import { resolveMdbUserVaultAccess } from './utils'

describe('resolveMdbUserVaultAccess', () => {
  it('does not silently turn an empty selection into access to every vault', () => {
    expect(resolveMdbUserVaultAccess([])).toEqual([])
  })

  it('keeps explicitly selected vaults', () => {
    expect(resolveMdbUserVaultAccess(['vault-b'])).toEqual(['vault-b'])
  })
})
