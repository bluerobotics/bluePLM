// @vitest-environment jsdom
/**
 * Smoke render of the whole app: signed in, one vault connected and loaded.
 *
 * Two hooks are replaced. `useAuth` would run the Supabase session listener and `useLoadFiles`
 * the disk scan; both have their own tests (and the harness runs the load's merge stages), and
 * neither is what a smoke render asks: does the shell mount over a loaded vault without throwing,
 * and does it show that vault's files. Everything else (startup, theme, realtime, heartbeats,
 * the shell, the explorer, the file pane) is real, over the harness's fake database and service.
 */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/client', async (importOriginal) =>
  (await import('@/test/supabaseClientMock')).mockClientModule(await importOriginal()),
)

const loadFiles = vi.fn(async () => {})
vi.mock('@/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks')>()),
  useAuth: () => ({
    supabaseReady: true,
    handleSupabaseConfigured: () => {},
    handleChangeOrg: () => {},
    sessionGeneration: 0,
  }),
  useLoadFiles: () => ({ loadFiles }),
}))

// The online-users query embeds a users join, which the fake database does not model.
vi.mock('@/lib/supabase/sessions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase/sessions')>()),
  getOrgOnlineUsers: async () => ({ users: [] }),
}))

const { App } = await import('./App')
const { usePDMStore } = await import('@/stores/pdmStore')
const { t } = await import('@/lib/i18n')
const { ORG_ID, OTHER_USER_ID, USER_ID, VAULT_ID, createHarness } = await import('@/test/harness')
const { bulkFiles, installDomShims, lenientElectron, signedInVault } = await import('@/test/render')

type Harness = Awaited<ReturnType<typeof createHarness>>

let h: Harness

function rowFor(relativePath: string): HTMLElement | undefined {
  const path = h.absolute(relativePath)
  return Array.from(document.querySelectorAll<HTMLElement>('tr[data-path]')).find(
    (el) => el.getAttribute('data-path') === path,
  )
}

beforeEach(async () => {
  h = await createHarness()
  // The vault exists on the server and this user is granted it; otherwise App's vault
  // validation disconnects it as stale.
  h.db.seed('vault', { id: VAULT_ID, org_id: ORG_ID, name: 'Test Vault', slug: 'test-vault' })
  h.db.defineRpc('user_vault_access_list', (args) =>
    args.p_user_id === USER_ID ? [{ vault_id: VAULT_ID }] : [],
  )
  // The vault folder exists: useVaultManagement disconnects a vault whose folder it cannot open.
  Object.assign(h.electron.api, {
    setWorkingDir: async (path: string) => ({ success: true, path }),
  })
  installDomShims()
  lenientElectron(h)
  signedInVault()
  usePDMStore.setState({
    onboardingComplete: true,
    authInitialized: true,
    isVaultConnected: true,
    currentFolder: 'Parts',
  })
  loadFiles.mockClear()
})

afterEach(() => {
  cleanup()
})

// The first mount imports and starts the whole shell; slow CI runners need more than the default 5 s.
describe('App', { timeout: 30_000 }, () => {
  it('mounts the shell over a loaded vault and lists its files with their metadata', async () => {
    h.seedSolidWorksFile('Parts/bracket.sldprt', { part_number: 'BR-100', description: 'Bracket' })
    h.seedSolidWorksFile('Parts/plate.sldprt', {
      part_number: 'PL-200',
      description: 'Plate',
      checked_out_by: OTHER_USER_ID,
    })
    await h.reload()

    render(<App />)

    await waitFor(() => expect(rowFor('Parts/bracket.sldprt')).toBeTruthy(), { timeout: 20_000 })
    expect(within(rowFor('Parts/bracket.sldprt')!).getByText('BR-100')).toBeTruthy()
    expect(within(rowFor('Parts/plate.sldprt')!).getByText('Plate')).toBeTruthy()
    expect(screen.queryByText(/Something went wrong/i)).toBeNull()
  })

  it('mounts over an empty vault: the pane shows its empty or loading state, no rows', async () => {
    usePDMStore.setState({ currentFolder: '' })
    render(<App />)
    await waitFor(
      () =>
        expect(
          screen.queryAllByRole('button', { name: /Add Files/ }).length +
            screen.queryAllByText(t('vaultLoad.loading')).length,
        ).toBeGreaterThan(0),
      { timeout: 20_000 },
    )
    expect(document.querySelectorAll('tr[data-path]')).toHaveLength(0)
    expect(screen.queryByText(/Something went wrong/i)).toBeNull()
  })

  it('mounts over a 1,000-file vault', async () => {
    h.seedSolidWorksFile('Parts/bracket.sldprt', { part_number: 'BR-100' })
    await h.reload()
    usePDMStore.getState().setFiles(bulkFiles(h.file('Parts/bracket.sldprt'), 1000))
    usePDMStore.setState({ currentFolder: 'Bulk' })

    render(<App />)

    await waitFor(() => expect(rowFor('Bulk/part-0000.sldprt')).toBeTruthy(), { timeout: 20_000 })
    expect(within(rowFor('Bulk/part-0000.sldprt')!).getByText('BULK-0000')).toBeTruthy()
  })
})
