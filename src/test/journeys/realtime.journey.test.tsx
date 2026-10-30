// @vitest-environment jsdom
/**
 * Another user's changes arriving over realtime, with the app's own subscriptions mounted: while
 * I look, in the middle of my operation, and the echo of my own move. After each, what realtime
 * left in the store must be what a fresh load would show.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/client', async (importOriginal) =>
  (await import('@/test/supabaseClientMock')).mockClientModule(await importOriginal()),
)

import { moveFile } from '../fakeSupabaseRpcs'
import { dragAndDrop } from './dom'
import { OTHER_USER_ID, USER_ID, openVault, waitFor, type Vault } from './journeyVault'

let vault: Vault | null = null
afterEach(() => {
  vault?.unmount()
  vault = null
})

const store = (v: Vault, path: string) => v.state().store.find((f) => f.path === path)

const spec = { files: [{ path: 'a.sldprt' }, { path: 'b.sldprt' }, { path: 'Parts/x.sldprt' }] }

describe('another user, while I look', () => {
  it('checks out a file: my view shows it, and my own checkout is then refused', async () => {
    vault = await openVault(spec)

    vault.otherUserUpdates('a.sldprt', { checked_out_by: OTHER_USER_ID, checked_out_at: vault.db.isoNow() })

    await waitFor(() => expect(store(vault!, 'a.sldprt')?.checkedOutBy).toBe(OTHER_USER_ID))
    await vault.contextMenu(vault.row('a.sldprt'), /^Check Out/).catch(() => {})
    await vault.settle()
    expect(vault.serverRow('a.sldprt').checked_out_by).toBe(OTHER_USER_ID)
    expect(vault.electron.disk.require(vault.absolute('a.sldprt')).readonly).toBe(true)
    await vault.expectStableAcrossReload()
  })

  it('checks in a new version: the file shows as outdated, as a reload would', async () => {
    vault = await openVault(spec)

    vault.otherUserChecksIn('a.sldprt', 'their version two')

    await waitFor(() => expect(store(vault!, 'a.sldprt')?.status).toBe('outdated'))
    await vault.expectStableAcrossReload()
  })

  it('releases a checkout I could see: my view follows, as a reload would', async () => {
    vault = await openVault({ files: [{ path: 'a.sldprt', checkedOutBy: OTHER_USER_ID }] })

    vault.otherUserUpdates('a.sldprt', { checked_out_by: null, checked_out_at: null })

    await waitFor(() => expect(store(vault!, 'a.sldprt')?.checkedOutBy).toBeNull())
    await vault.expectStableAcrossReload()
  })
})

describe('in the middle of my operation', () => {
  it('another user checks out a different file while my move is on its way to the server', async () => {
    vault = await openVault(spec)
    const other = vault
    vault.db.defineRpc('file_move', (args, db) => {
      other.otherUserUpdates('b.sldprt', { checked_out_by: OTHER_USER_ID, checked_out_at: db.isoNow() })
      return moveFile(args, db)
    })

    await dragAndDrop(vault.row('a.sldprt'), vault.row('Parts'))

    expect(vault.serverRow('Parts/a.sldprt').checked_out_by).toBeNull()
    await waitFor(() => expect(store(vault!, 'b.sldprt')?.checkedOutBy).toBe(OTHER_USER_ID))
    expect(store(vault, 'Parts/a.sldprt')?.status).toBe('synced')
    vault.expectConsistent()
    await vault.expectStableAcrossReload()
  })

  it('another user checks out the very file I am moving before my server move lands: refused, put back', async () => {
    vault = await openVault(spec)
    const other = vault
    vault.db.defineRpc('file_move', (args, db) => {
      other.otherUserUpdates('a.sldprt', { checked_out_by: OTHER_USER_ID, checked_out_at: db.isoNow() })
      return moveFile(args, db)
    })

    await dragAndDrop(vault.row('a.sldprt'), vault.row('Parts'))

    // The server refuses; the local move is rolled back so disk and server agree.
    expect(vault.serverRow('a.sldprt').checked_out_by).toBe(OTHER_USER_ID)
    expect(vault.state().disk.map((d) => d.path)).toContain('a.sldprt')
    expect(vault.state().disk.map((d) => d.path)).not.toContain('Parts/a.sldprt')
    await waitFor(() => expect(store(vault!, 'a.sldprt')?.checkedOutBy).toBe(OTHER_USER_ID))
    vault.expectConsistent()
    await vault.expectStableAcrossReload()
  })

  it('the echo of my own move arrives afterwards and does not revert it (22fde292)', async () => {
    vault = await openVault(spec)
    const id = vault.serverRow('a.sldprt').id

    await dragAndDrop(vault.row('a.sldprt'), vault.row('Parts'))
    // The UPDATE my move_file wrote, delivered late by realtime.
    const row = vault.db.row('file', id)
    vault.db.emitRealtime('file', 'UPDATE', { ...row }, { ...row, file_path: 'a.sldprt' })
    await vault.settle()
    await new Promise((r) => setTimeout(r, 700))
    await vault.settle()

    expect(store(vault, 'Parts/a.sldprt')?.status).toBe('synced')
    expect(store(vault, 'a.sldprt')).toBeUndefined()
    expect(vault.serverRow('Parts/a.sldprt').checked_out_by).toBeNull()
    vault.expectConsistent()
    await vault.expectStableAcrossReload()
  })

  it('my own checkout echo does not undo my metadata edit', async () => {
    vault = await openVault({ files: [{ path: 'a.sldprt', checkedOutBy: USER_ID, description: 'Old' }] })

    await vault.editCell(vault.row('a.sldprt'), 'description', 'New')
    const row = vault.serverRow('a.sldprt')
    vault.db.emitRealtime('file', 'UPDATE', { ...row }, { ...row })
    await new Promise((r) => setTimeout(r, 700))
    await vault.settle()

    expect(vault.file('a.sldprt').pendingMetadata?.description).toBe('New')
    expect(vault.cell(vault.row('a.sldprt'), 'description').textContent).toContain('New')
  })
})
