/**
 * Opening a folder leaves search. While a query is set the file pane shows results instead of the
 * current folder, so a navigation that kept the query (double-clicking a folder in the results,
 * the sidebar tree, a breadcrumb, a reveal-in-browser jump) changed the folder underneath and
 * looked like it did nothing. `setCurrentFolder` is the one place every navigation goes through,
 * so it ends the search there. Tab switches restore each tab's own search with a direct set().
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateCreator } from 'zustand'

import type { PDMStoreState, FilesSlice } from '../types'
import { createFilesSlice } from './filesSlice'

vi.mock('@/stores/pdmStore', () => ({
  usePDMStore: {
    getState: vi.fn(),
  },
}))
vi.mock('@/lib/userActionLogger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/userActionLogger')>()),
  logExplorer: vi.fn(),
}))

type FilesSliceCreator = StateCreator<PDMStoreState, [['zustand/persist', unknown]], [], FilesSlice>
type StoreSet = Parameters<FilesSliceCreator>[0]
type StoreGet = Parameters<FilesSliceCreator>[1]

describe('setCurrentFolder and search', () => {
  let store: PDMStoreState
  let setCalls: number

  beforeEach(() => {
    setCalls = 0
    store = {} as unknown as PDMStoreState
    const set: StoreSet = (partial) => {
      setCalls++
      const update = typeof partial === 'function' ? partial(store) : partial
      store = { ...store, ...update }
    }
    const get: StoreGet = () => store
    const api = {} as Parameters<FilesSliceCreator>[2]
    store = { ...createFilesSlice(set, get, api) } as unknown as PDMStoreState
  })

  it('clears an active search and its type when the folder changes', () => {
    store.setSearchQuery('bracket')
    store.setSearchType('folders')
    store.setCurrentFolder('parts/brackets')

    expect(store.currentFolder).toBe('parts/brackets')
    expect(store.searchQuery).toBe('')
    expect(store.searchType).toBe('all')
  })

  it('clears the search when navigating to the folder already open', () => {
    store.setCurrentFolder('parts')
    store.setSearchQuery('bracket')
    store.setCurrentFolder('parts')

    expect(store.searchQuery).toBe('')
  })

  it('writes only the folder when no search is active', () => {
    store.setSearchType('files')
    setCalls = 0
    store.setCurrentFolder('parts')

    expect(setCalls).toBe(1)
    expect(store.currentFolder).toBe('parts')
    // No search to leave, so a chosen type is left alone.
    expect(store.searchType).toBe('files')
  })
})
