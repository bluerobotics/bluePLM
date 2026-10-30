// @vitest-environment jsdom
/**
 * Delete journeys: remove the local copy, delete from the server (keep local), delete both,
 * delete a local-only file with the Delete key, restore from the trash, and the Recycle Bin
 * fallback when Windows refuses to recycle.
 */
import { fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/client', async (importOriginal) =>
  (await import('@/test/supabaseClientMock')).mockClientModule(await importOriginal()),
)

import { OTHER_USER_ID, USER_ID, act, openVault, screen, waitFor, within, type Vault } from './journeyVault'

let vault: Vault | null = null
afterEach(() => {
  vault?.unmount()
  vault = null
})

const livePaths = (v: Vault) => v.state().server.map((r) => r.path)
const diskPaths = (v: Vault) => v.state().disk.map((d) => d.path)
const store = (v: Vault, path: string) => v.state().store.find((f) => f.path === path)

const spec = {
  files: [
    { path: 'a.sldprt' },
    { path: 'b.sldprt' },
    { path: 'Proj/c.sldprt' },
    { path: 'Proj/Sub/d.sldprt' },
    { path: 'local.txt', local: true },
  ],
}

describe('delete', () => {
  it('removes the local copy: the file goes to the Recycle Bin and stays on the server as cloud-only', async () => {
    vault = await openVault(spec)

    await vault.contextMenu(vault.row('a.sldprt'), /^Remove Local Copy/)
    await vault.confirm(/remove|delete/i).catch(() => {})

    await waitFor(() => expect(diskPaths(vault!)).not.toContain('a.sldprt'))
    expect(vault.electron.disk.recycleBin.map((r) => r.path)).toEqual([vault.absolute('a.sldprt')])
    expect(livePaths(vault)).toContain('a.sldprt')
    expect(store(vault, 'a.sldprt')?.status).toBe('cloud')
    vault.expectConsistent()
    await vault.expectStableAcrossReload()
  })

  it('deletes from the server and keeps the local copy as a local-only file', async () => {
    vault = await openVault(spec)
    const id = vault.serverRow('a.sldprt').id

    await vault.contextMenu(vault.row('a.sldprt'), /^Delete from Server/)
    await vault.confirm('Delete from Server')

    await waitFor(() => expect(vault!.db.row('file', id).deleted_at).not.toBeNull())
    expect(diskPaths(vault)).toContain('a.sldprt')
    expect(store(vault, 'a.sldprt')?.status).toBe('added')
    vault.expectConsistent()
    await vault.expectStableAcrossReload()
  })

  it('deletes local and server copies of a folder tree', async () => {
    vault = await openVault(spec)

    await vault.contextMenu(vault.row('Proj'), /^Delete Local & Server/)
    await vault.confirm(/delete/i).catch(() => {})

    await waitFor(() => expect(livePaths(vault!)).toEqual(['a.sldprt', 'b.sldprt']))
    expect(diskPaths(vault)).toEqual(['a.sldprt', 'b.sldprt', 'local.txt'])
    await waitFor(() => expect(vault!.state().storeFolders).toEqual([]))
    vault.expectConsistent()
    await vault.expectStableAcrossReload()
  })

  it('deletes a local-only file with the Delete key', async () => {
    vault = await openVault(spec)
    await vault.select(vault.row('local.txt'))

    await vault.keyboard('{Delete}')
    await vault.confirm(/delete/i).catch(() => {})

    await waitFor(() => expect(diskPaths(vault!)).not.toContain('local.txt'))
    expect(vault.state().server).toHaveLength(4)
    vault.expectConsistent()
    await vault.expectStableAcrossReload()
  })

  it('falls back to a permanent delete when the Recycle Bin refuses an explicit delete', async () => {
    vault = await openVault(spec)
    vault.electron.disk.recycleBinUnavailable = true

    await vault.contextMenu(vault.row('a.sldprt'), /^Remove Local Copy/)
    await vault.confirm(/remove|delete/i).catch(() => {})

    await waitFor(() => expect(diskPaths(vault!)).not.toContain('a.sldprt'))
    expect(vault.electron.disk.recycleBin).toEqual([])
    expect(livePaths(vault)).toContain('a.sldprt')
    await vault.expectStableAcrossReload()
  })

  it('refuses to delete from the server a file someone else has checked out', async () => {
    vault = await openVault({ files: [{ path: 'theirs.sldprt', checkedOutBy: OTHER_USER_ID }] })

    await vault.contextMenu(vault.row('theirs.sldprt'), /^Delete from Server/).catch(() => {})
    await vault.confirm('Delete from Server').catch(() => {})

    expect(vault.serverRow('theirs.sldprt').deleted_at).toBeNull()
    expect(diskPaths(vault)).toEqual(['theirs.sldprt'])
  })

  it('refuses to remove the local copy of a file I have checked out without asking', async () => {
    vault = await openVault({ files: [{ path: 'mine.sldprt', checkedOutBy: USER_ID }] })

    await vault.contextMenu(vault.row('mine.sldprt'), /^Remove Local Copy/)

    // A checked-out file has work in it: the app asks before it removes it.
    expect(screen.queryAllByRole('dialog').length + screen.queryAllByText(/checked out/i).length).toBeGreaterThan(0)
    expect(diskPaths(vault)).toEqual(['mine.sldprt'])
  })
})

describe('restore from the trash', () => {
  it('restores a file deleted from the server and it downloads back to its path', async () => {
    vault = await openVault(spec)
    const id = vault.serverRow('b.sldprt').id
    await vault.contextMenu(vault.row('b.sldprt'), /^Delete Local & Server/)
    await vault.confirm(/delete/i).catch(() => {})
    await waitFor(() => expect(vault!.db.row('file', id).deleted_at).not.toBeNull())
    expect(diskPaths(vault)).not.toContain('b.sldprt')

    const trash = within(await vault.openTrash())
    const [entry] = await trash.findAllByText('b.sldprt', {}, { timeout: 3000 })
    await act(async () => {
      fireEvent.click(entry)
    })
    await vault.user.click(trash.getByRole('button', { name: /restore/i }))
    await vault.settle()

    await waitFor(() => expect(vault!.db.row('file', id).deleted_at).toBeNull())
    expect(livePaths(vault)).toContain('b.sldprt')
    // Restored on the server: cloud-only here until downloaded, never a duplicate row.
    expect(vault.db.rows('file').filter((r) => r.file_path === 'b.sldprt')).toHaveLength(1)
    await vault.expectStableAcrossReload()
  })
})
