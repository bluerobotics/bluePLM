import { beforeEach, describe, expect, it } from 'vitest'

import { usePDMStore } from '@/stores/pdmStore'
import type { ConnectedVault, User } from '@/stores/types'
import { resetPDMStore } from '@/test/pdmStoreReset'
import {
  applyWebVaultSync,
  connectWebVault,
  planWebVaultSync,
  webConnectedVault,
  webVaultPath,
  webWorkingVaultState,
} from './webVault'

const main = { id: 'v-main', name: 'Main', slug: 'main', is_default: true }
const archive = { id: 'v-arch', name: 'Archive', slug: 'archive', is_default: false }
const USER = { id: 'user-1' } as User

describe('webVaultPath', () => {
  it('is the slug under the root, or the id when there is no slug', () => {
    expect(webVaultPath(main)).toBe('/main')
    expect(webVaultPath({ id: 'abc', slug: '' })).toBe('/abc')
    expect(webVaultPath({ id: 'abc', slug: 'a/b\\c' })).toBe('/a-b-c')
  })
})

describe('planWebVaultSync', () => {
  it('connects every reachable vault on first visit, default first as active', () => {
    const plan = planWebVaultSync([archive, main], [], null)
    expect(plan.add.map((v) => v.id)).toEqual(['v-arch', 'v-main'])
    expect(plan.add[1]).toEqual({
      id: 'v-main',
      name: 'Main',
      localPath: '/main',
      isExpanded: true,
      hasCompletedSetup: true,
    })
    expect(plan.remove).toEqual([])
    expect(plan.activeVaultId).toBe('v-main')
  })

  it('drops a vault whose access was withdrawn and keeps the active one that stays', () => {
    const connected = [webConnectedVault(main), webConnectedVault(archive)]
    const plan = planWebVaultSync([archive], connected, 'v-arch')
    expect(plan.remove).toEqual(['v-main'])
    expect(plan.add).toEqual([])
    expect(plan.activeVaultId).toBe('v-arch')
  })

  it('moves off an active vault that is gone, and renames a vault the server renamed', () => {
    const connected: ConnectedVault[] = [
      { ...webConnectedVault(archive), name: 'Old name' },
      webConnectedVault({ ...main, id: 'v-gone', slug: 'gone' }),
    ]
    const plan = planWebVaultSync([main, archive], connected, 'v-gone')
    expect(plan.activeVaultId).toBe('v-main')
    expect(plan.update).toEqual([
      { id: 'v-arch', updates: { name: 'Archive', localPath: '/archive' } },
    ])
  })

  it('has no active vault when the user can reach none', () => {
    expect(planWebVaultSync([], [webConnectedVault(main)], 'v-main')).toEqual({
      add: [],
      remove: ['v-main'],
      update: [],
      activeVaultId: null,
    })
  })
})

describe('webWorkingVaultState', () => {
  const vaults = [webConnectedVault(main), webConnectedVault(archive)]

  it('opens the active vault, connected only once signed in', () => {
    expect(webWorkingVaultState(vaults, 'v-arch', null, true)).toEqual({
      vaultPath: '/archive',
      connected: true,
    })
    expect(webWorkingVaultState(vaults, 'v-arch', null, false)).toEqual({
      vaultPath: '/archive',
      connected: false,
    })
  })

  it('falls back to the first vault, then the persisted path, then nothing', () => {
    expect(webWorkingVaultState(vaults, null, null, true).vaultPath).toBe('/main')
    expect(webWorkingVaultState([], null, '/main', true)).toEqual({
      vaultPath: '/main',
      connected: true,
    })
    expect(webWorkingVaultState([], null, null, true)).toEqual({
      vaultPath: null,
      connected: false,
    })
  })
})

describe('store actions', () => {
  beforeEach(() => {
    resetPDMStore({ user: USER })
  })

  it('connectWebVault adds the vault, makes it active and connects its virtual path', () => {
    connectWebVault(main)
    const state = usePDMStore.getState()
    expect(state.connectedVaults.map((v) => v.localPath)).toEqual(['/main'])
    expect(state.activeVaultId).toBe('v-main')
    expect(state.vaultPath).toBe('/main')
    expect(state.isVaultConnected).toBe(true)
  })

  it('applyWebVaultSync connects all reachable vaults and opens the default', () => {
    applyWebVaultSync(planWebVaultSync([archive, main], [], null))
    const state = usePDMStore.getState()
    expect(state.connectedVaults.map((v) => v.id)).toEqual(['v-arch', 'v-main'])
    expect(state.activeVaultId).toBe('v-main')
    expect(state.vaultPath).toBe('/main')
    expect(state.isVaultConnected).toBe(true)
  })

  it('switching vault clears the previous vault rows; nothing to reach disconnects', () => {
    connectWebVault(main)
    usePDMStore.setState({ filesLoaded: true })
    applyWebVaultSync(planWebVaultSync([archive], usePDMStore.getState().connectedVaults, 'v-main'))
    let state = usePDMStore.getState()
    expect(state.vaultPath).toBe('/archive')
    expect(state.filesLoaded).toBe(false)

    applyWebVaultSync(planWebVaultSync([], state.connectedVaults, state.activeVaultId))
    state = usePDMStore.getState()
    expect(state.connectedVaults).toEqual([])
    expect(state.vaultPath).toBeNull()
    expect(state.isVaultConnected).toBe(false)
  })

  it('does not connect without a signed-in user', () => {
    resetPDMStore({ user: null })
    connectWebVault(main)
    expect(usePDMStore.getState().isVaultConnected).toBe(false)
  })
})
