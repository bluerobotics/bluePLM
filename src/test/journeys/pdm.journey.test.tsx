// @vitest-environment jsdom
/**
 * Check out, edit metadata, check in, undo checkout, first check-in and get latest, driven from
 * the file context menu and the inline metadata cells; and the refusals for files someone else
 * holds or that are read-only because they are not checked out.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/client', async (importOriginal) =>
  (await import('@/test/supabaseClientMock')).mockClientModule(await importOriginal()),
)

import { OTHER_USER_ID, USER_ID, openVault, swDocument, waitFor, type Vault } from './journeyVault'

let vault: Vault | null = null
afterEach(() => {
  vault?.unmount()
  vault = null
})

const store = (v: Vault, path: string) => v.state().store.find((f) => f.path === path)

describe('check out and check in', () => {
  it('checks out from the context menu: server lock, writable file, UI and store agree', async () => {
    vault = await openVault({ files: [{ path: 'bracket.sldprt', partNumber: 'BR-100', description: 'Bracket' }] })

    await vault.contextMenu(vault.row('bracket.sldprt'), /^Check Out/)

    await waitFor(() => expect(vault!.serverRow('bracket.sldprt').checked_out_by).toBe(USER_ID))
    expect(vault.electron.disk.require(vault.absolute('bracket.sldprt')).readonly).toBe(false)
    expect(store(vault, 'bracket.sldprt')?.checkedOutBy).toBe(USER_ID)
    vault.expectConsistent()
    await vault.expectStableAcrossReload()
    // Checkout never blanks metadata.
    expect(vault.serverRow('bracket.sldprt').part_number).toBe('BR-100')
    expect(vault.serverRow('bracket.sldprt').description).toBe('Bracket')
  })

  it('edits the description inline, checks in, and the server, file and reload all agree', async () => {
    vault = await openVault({
      files: [{ path: 'bracket.sldprt', partNumber: 'BR-100', description: 'Bracket', document: swDocument({ Number: 'BR-100', Description: 'Bracket' }) }],
    })
    await vault.contextMenu(vault.row('bracket.sldprt'), /^Check Out/)
    await waitFor(() => expect(vault!.serverRow('bracket.sldprt').checked_out_by).toBe(USER_ID))

    await vault.editCell(vault.row('bracket.sldprt'), 'description', 'Mounting bracket')
    expect(vault.cell(vault.row('bracket.sldprt'), 'description').textContent).toContain('Mounting bracket')

    await vault.contextMenu(vault.row('bracket.sldprt'), /^Check In/)

    await waitFor(() => expect(vault!.serverRow('bracket.sldprt').checked_out_by).toBeNull(), { timeout: 4000 })
    const row = vault.serverRow('bracket.sldprt')
    expect(row.description).toBe('Mounting bracket')
    expect(row.part_number).toBe('BR-100')
    expect(vault.electron.disk.require(vault.absolute('bracket.sldprt')).readonly).toBe(true)
    // The edit reached the file, and the server holds the file's bytes.
    expect(vault.electron.disk.require(vault.absolute('bracket.sldprt')).document?.fileProperties.Description).toBe(
      'Mounting bracket',
    )
    expect(row.content_hash).toBe(vault.electron.disk.hash(vault.absolute('bracket.sldprt')))
    vault.expectConsistent()
    await vault.expectStableAcrossReload()
    expect(vault.cell(vault.row('bracket.sldprt'), 'description').textContent).toContain('Mounting bracket')
    expect(vault.file('bracket.sldprt').pendingMetadata).toBeUndefined()
  })

  it('checks in changed content as a new version', async () => {
    vault = await openVault({ files: [{ path: 'bracket.sldprt' }] })
    await vault.contextMenu(vault.row('bracket.sldprt'), /^Check Out/)
    await waitFor(() => expect(vault!.serverRow('bracket.sldprt').checked_out_by).toBe(USER_ID))
    vault.electron.disk.write(vault.absolute('bracket.sldprt'), 'edited in SolidWorks')
    await vault.reload()
    expect(store(vault, 'bracket.sldprt')?.status).toBe('modified')

    await vault.contextMenu(vault.row('bracket.sldprt'), /^Check In/)

    await waitFor(() => expect(vault!.serverRow('bracket.sldprt').version).toBe(2), { timeout: 4000 })
    expect(vault.serverRow('bracket.sldprt').checked_out_by).toBeNull()
    expect(vault.db.rows('file_version').filter((r) => r.file_id === vault!.serverRow('bracket.sldprt').id)).toHaveLength(2)
    vault.expectConsistent()
    await vault.expectStableAcrossReload()
  })

  it('undoes a checkout: local edits are replaced by the server version and the lock is released', async () => {
    vault = await openVault({ files: [{ path: 'bracket.sldprt' }] })
    const original = vault.serverRow('bracket.sldprt').content_hash
    await vault.contextMenu(vault.row('bracket.sldprt'), /^Check Out/)
    await waitFor(() => expect(vault!.serverRow('bracket.sldprt').checked_out_by).toBe(USER_ID))
    vault.electron.disk.write(vault.absolute('bracket.sldprt'), 'edits to throw away')
    await vault.reload()

    await vault.contextMenu(vault.row('bracket.sldprt'), /^Discard Checkout/)

    await waitFor(() => expect(vault!.serverRow('bracket.sldprt').checked_out_by).toBeNull(), { timeout: 4000 })
    expect(vault.electron.disk.hash(vault.absolute('bracket.sldprt'))).toBe(original)
    expect(vault.serverRow('bracket.sldprt').version).toBe(1)
    vault.expectConsistent()
    await vault.expectStableAcrossReload()
  })

  it('first check-in of a local file creates one row at its path', async () => {
    vault = await openVault({ files: [{ path: 'Parts/new.sldprt', local: true }, { path: 'Parts/old.sldprt' }] })
    await vault.openFolder('Parts')

    await vault.contextMenu(vault.row('Parts/new.sldprt'), /^First Check In/)

    await waitFor(() => expect(vault!.state().server.map((r) => r.path)).toContain('Parts/new.sldprt'), { timeout: 4000 })
    const row = vault.serverRow('Parts/new.sldprt')
    expect(row.version).toBe(1)
    expect(row.content_hash).toBe(vault.electron.disk.hash(vault.absolute('Parts/new.sldprt')))
    expect(vault.state().server).toHaveLength(2)
    expect(vault.electron.disk.require(vault.absolute('Parts/new.sldprt')).readonly).toBe(true)
    vault.expectConsistent()
    await vault.expectStableAcrossReload()
  })

  it('downloads a cloud-only file: the server bytes, read-only, synced', async () => {
    vault = await openVault({ files: [{ path: 'Parts/remote.sldprt', cloud: true }, { path: 'Parts/here.sldprt' }] })
    await vault.openFolder('Parts')
    expect(store(vault, 'Parts/remote.sldprt')?.status).toBe('cloud')

    await vault.contextMenu(vault.row('Parts/remote.sldprt'), /^Download/)

    await waitFor(() => expect(store(vault!, 'Parts/remote.sldprt')?.status).toBe('synced'))
    const path = vault.absolute('Parts/remote.sldprt')
    expect(vault.electron.disk.hash(path)).toBe(vault.serverRow('Parts/remote.sldprt').content_hash)
    expect(vault.electron.disk.require(path).readonly).toBe(true)
    vault.expectConsistent()
    await vault.expectStableAcrossReload()
  })

  it('gets the latest version of a file someone else checked in', async () => {
    vault = await openVault({ files: [{ path: 'bracket.sldprt' }] })
    vault.otherUserChecksIn('bracket.sldprt', 'version two bytes')
    await vault.reload()
    expect(store(vault, 'bracket.sldprt')?.status).toBe('outdated')

    await vault.contextMenu(vault.row('bracket.sldprt'), /^Get Latest/)

    await waitFor(() =>
      expect(vault!.electron.disk.hash(vault!.absolute('bracket.sldprt'))).toBe(vault!.serverRow('bracket.sldprt').content_hash),
    )
    expect(vault.electron.disk.require(vault.absolute('bracket.sldprt')).readonly).toBe(true)
    expect(store(vault, 'bracket.sldprt')?.status).toBe('synced')
    vault.expectConsistent()
    await vault.expectStableAcrossReload()
  })
})

describe('refused: someone else holds it, or it is read-only', () => {
  it('cannot check out a file someone else has checked out', async () => {
    vault = await openVault({ files: [{ path: 'theirs.sldprt', checkedOutBy: OTHER_USER_ID }] })

    await vault.contextMenu(vault.row('theirs.sldprt'), /^Check Out/).catch(() => {})

    expect(vault.serverRow('theirs.sldprt').checked_out_by).toBe(OTHER_USER_ID)
    expect(vault.electron.disk.require(vault.absolute('theirs.sldprt')).readonly).toBe(true)
    await vault.expectStableAcrossReload()
  })

  it('does not open the metadata editor on a file that is not checked out', async () => {
    vault = await openVault({ files: [{ path: 'bracket.sldprt', description: 'Bracket' }] })
    const cell = vault.cell(vault.row('bracket.sldprt'), 'description')

    await vault.user.click(cell.querySelector('[data-no-drag]') ?? cell)
    await vault.settle()

    expect(cell.querySelector('input')).toBeNull()
    expect(vault.file('bracket.sldprt').pendingMetadata).toBeUndefined()
  })

  it('does not open the metadata editor on a file someone else holds', async () => {
    vault = await openVault({ files: [{ path: 'theirs.sldprt', description: 'Theirs', checkedOutBy: OTHER_USER_ID }] })
    const cell = vault.cell(vault.row('theirs.sldprt'), 'description')

    await vault.user.click(cell.querySelector('[data-no-drag]') ?? cell)
    await vault.settle()

    expect(cell.querySelector('input')).toBeNull()
  })

  it('cannot check in a file someone else has checked out', async () => {
    vault = await openVault({ files: [{ path: 'theirs.sldprt', checkedOutBy: OTHER_USER_ID }] })

    await vault.contextMenu(vault.row('theirs.sldprt'), /^Check In/).catch(() => {})

    expect(vault.serverRow('theirs.sldprt').checked_out_by).toBe(OTHER_USER_ID)
    expect(vault.serverRow('theirs.sldprt').version).toBe(1)
  })
})
