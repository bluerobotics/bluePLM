import { describe, expect, it } from 'vitest'

import {
  getDirectVaultIds,
  getEffectiveVaultIds,
  getInheritedVaultIds,
  getVaultAccessLoadPlan,
} from './useVaultAccess'

describe('getVaultAccessLoadPlan', () => {
  it('loads user and team access even when the vault catalogue was loaded earlier', () => {
    expect(getVaultAccessLoadPlan('org-1', true, false)).toEqual({
      loadVaults: false,
      loadUserAccess: true,
      loadTeamAccess: true,
    })
  })

  it('loads the catalogue and both access maps for a fresh organization', () => {
    expect(getVaultAccessLoadPlan('org-1', false, false)).toEqual({
      loadVaults: true,
      loadUserAccess: true,
      loadTeamAccess: true,
    })
  })

  it('does not issue requests without an active organization', () => {
    expect(getVaultAccessLoadPlan(null, false, false)).toEqual({
      loadVaults: false,
      loadUserAccess: false,
      loadTeamAccess: false,
    })
  })
})

describe('vault access resolution', () => {
  const direct = {
    'vault-direct': ['user-1'],
    'vault-other': ['user-2'],
  }
  const teams = {
    'team-1': ['vault-inherited', 'vault-shared'],
    'team-2': ['vault-shared'],
  }

  it('keeps direct and inherited assignments independently addressable', () => {
    expect(getDirectVaultIds('user-1', direct)).toEqual(['vault-direct'])
    expect(getInheritedVaultIds(['team-1', 'team-2'], teams)).toEqual([
      'vault-inherited',
      'vault-shared',
    ])
  })

  it('unions direct and team access for viewers without duplicates', () => {
    expect(getEffectiveVaultIds('user-1', ['team-1', 'team-2'], 'viewer', direct, teams)).toEqual([
      'vault-direct',
      'vault-inherited',
      'vault-shared',
    ])
  })

  it('does not grant guests inherited team access', () => {
    expect(getEffectiveVaultIds('user-1', ['team-1'], 'guest', direct, teams)).toEqual([
      'vault-direct',
    ])
  })
})
