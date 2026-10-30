// @vitest-environment jsdom
/**
 * Back and search, and folder changes made outside the file pane.
 *
 * Search is a step of its own, as in Windows Explorer: Back first returns to the folder the
 * search was made in. A folder opened from the sidebar tree, a search result or a reveal jump
 * sets the store's folder without going through this hook; it is recorded so Back returns to the
 * folder before it instead of skipping over it, and the hook's own navigations are not recorded
 * twice.
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'

interface FakeStore {
  currentFolder: string
  searchQuery: string
  setCurrentFolder: (folder: string) => void
  setSearchQuery: (query: string) => void
}

// The real store's setCurrentFolder leaves search; the fake does the same.
const fakeStore = create<FakeStore>((set) => ({
  currentFolder: '',
  searchQuery: '',
  setCurrentFolder: (currentFolder) => set({ currentFolder, searchQuery: '' }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
}))

vi.mock('@/stores/pdmStore', () => ({ usePDMStore: fakeStore }))
vi.mock('@/lib/userActionLogger', () => ({ logExplorer: vi.fn() }))

const { useNavigationHistory } = await import('./useNavigationHistory')

function renderNav() {
  return renderHook(() =>
    useNavigationHistory({
      setCurrentFolder: fakeStore.getState().setCurrentFolder,
      expandedFolders: new Set<string>(['a', 'a/b', 'c']),
      toggleFolder: vi.fn(),
    }),
  )
}

describe('useNavigationHistory', () => {
  beforeEach(() => {
    fakeStore.setState({ currentFolder: '', searchQuery: '' })
  })

  it('leaves search on Back and stays in the folder searched in', () => {
    const { result } = renderNav()
    act(() => result.current.navigateToFolder('a'))
    act(() => fakeStore.getState().setSearchQuery('bracket'))

    expect(result.current.canGoBack).toBe(true)
    act(() => result.current.navigateBack())

    expect(fakeStore.getState().searchQuery).toBe('')
    expect(fakeStore.getState().currentFolder).toBe('a')

    act(() => result.current.navigateBack())
    expect(fakeStore.getState().currentFolder).toBe('')
  })

  it('can go back from a search made at the start of history', () => {
    const { result } = renderNav()
    expect(result.current.canGoBack).toBe(false)
    act(() => fakeStore.getState().setSearchQuery('bracket'))
    expect(result.current.canGoBack).toBe(true)
  })

  it('records a folder opened outside the pane, so Back returns to the one before it', () => {
    const { result } = renderNav()
    act(() => result.current.navigateToFolder('a'))
    // e.g. a search result picked in the top bar
    act(() => fakeStore.getState().setCurrentFolder('c'))

    expect(result.current.navigationHistory).toEqual(['', 'a', 'c'])
    act(() => result.current.navigateBack())
    expect(fakeStore.getState().currentFolder).toBe('a')
  })

  it('does not record its own navigations twice', () => {
    const { result } = renderNav()
    act(() => result.current.navigateToFolder('a'))
    act(() => result.current.navigateToFolder('a/b'))
    act(() => result.current.navigateBack())
    act(() => result.current.navigateForward())
    act(() => result.current.navigateToRoot())

    expect(result.current.navigationHistory).toEqual(['', 'a', 'a/b', ''])
    expect(result.current.historyIndex).toBe(3)
  })
})
