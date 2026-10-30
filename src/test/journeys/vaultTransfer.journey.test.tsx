// @vitest-environment jsdom
/**
 * Copy to Vault and Move to Vault from the file context menu: pick the destination vault, confirm
 * in the dialog, then check both vaults on disk and on the server, and that the source vault
 * reloads with no ghost folder and no phantom delete (52e5cfad).
 */
import { fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/client', async (importOriginal) =>
  (await import('@/test/supabaseClientMock')).mockClientModule(await importOriginal()),
)

import { OTHER_USER_ID, OTHER_VAULT_ID, OTHER_VAULT_PATH, act, openVault, screen, waitFor, type Vault } from './journeyVault'

let vault: Vault | null = null
afterEach(() => {
  vault?.unmount()
  vault = null
})

const spec = {
  files: [{ path: 'Proj/a.sldprt' }, { path: 'Proj/Sub/b.sldprt' }, { path: 'c.sldprt' }],
  secondVault: true,
}

/** Live rows and disk files in the second vault, by vault-relative path. */
function secondVault(v: Vault) {
  const prefix = `${OTHER_VAULT_PATH.toLowerCase()}\\`
  return {
    server: v.db
      .rows('file')
      .filter((r) => r.vault_id === OTHER_VAULT_ID && r.deleted_at == null)
      .map((r) => String(r.file_path))
      .sort((a, b) => a.localeCompare(b)),
    disk: v.electron.disk
      .all()
      .filter((e) => e.path.toLowerCase().startsWith(prefix))
      .map((e) => e.path.slice(prefix.length).replace(/\\/g, '/'))
      .sort((a, b) => a.localeCompare(b)),
  }
}

async function transfer(v: Vault, target: HTMLElement, mode: 'Copy' | 'Move') {
  // A submenu opens on hover; a click toggles it, so hover rather than click.
  await act(async () => {
    fireEvent.contextMenu(target, { clientX: 5, clientY: 5 })
  })
  const group = (await screen.findByText(`${mode} to Vault`)).closest('.context-menu-item')!
  await act(async () => {
    fireEvent.mouseEnter(group)
  })
  // "Keep folder path in" lists the vaults a second time; take that entry. The submenu opens
  // after a short delay, and the explorer tree lists the vault by name too.
  const entries = await waitFor(() => {
    const found = screen.queryAllByText('Second').filter((el) => !el.closest('[data-testid="tree"]'))
    if (found.length < 2) throw new Error('vault submenu not open')
    return found
  })
  await v.user.click(entries[entries.length - 1])
  await v.settle()
  const button = await waitFor(() => {
    const found = screen.getByRole('button', { name: new RegExp(`^${mode} \\d+ (file|item)`) })
    if ((found as HTMLButtonElement).disabled) throw new Error('confirm still disabled')
    return found
  })
  await v.user.click(button)
  await v.settle()
}

describe('copy and move to another vault', () => {
  it('copies a file to the other vault, keeping its folder path; the source is untouched', async () => {
    vault = await openVault(spec)
    await vault.openFolder('Proj')
    const before = vault.state()

    await transfer(vault, vault.row('Proj/a.sldprt'), 'Copy')

    await waitFor(() => expect(secondVault(vault!).server).toEqual(['Proj/a.sldprt']))
    expect(secondVault(vault).disk).toEqual(['Proj/a.sldprt'])
    expect(vault.state().server).toEqual(before.server)
    expect(vault.state().disk).toEqual(before.disk)
    await vault.expectStableAcrossReload()
  })

  it('moves a folder to the other vault: gone from this vault on disk and server, no ghost folder', async () => {
    vault = await openVault(spec)

    await transfer(vault, vault.row('Proj'), 'Move')

    await waitFor(() => expect(secondVault(vault!).server).toEqual(['Proj/a.sldprt', 'Proj/Sub/b.sldprt']), {
      timeout: 4000,
    })
    expect(secondVault(vault).disk).toEqual(['Proj/a.sldprt', 'Proj/Sub/b.sldprt'])
    await waitFor(() => expect(vault!.state().server.map((r) => r.path)).toEqual(['c.sldprt']))
    expect(vault.state().disk.map((d) => d.path)).toEqual(['c.sldprt'])
    await waitFor(() => expect(vault!.state().storeFolders).toEqual([]))
    vault.expectConsistent()
    await vault.expectStableAcrossReload()
  })

  it('does not move a file someone else has checked out', async () => {
    vault = await openVault({ ...spec, files: [...spec.files, { path: 'theirs.sldprt', checkedOutBy: OTHER_USER_ID }] })

    await transfer(vault, vault.row('theirs.sldprt'), 'Move').catch(() => {})
    await vault.settle()

    expect(vault.serverRow('theirs.sldprt').deleted_at).toBeNull()
    expect(vault.state().disk.map((d) => d.path)).toContain('theirs.sldprt')
    expect(secondVault(vault).server).toEqual([])
  })
})
