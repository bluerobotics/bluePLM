// @vitest-environment jsdom
/**
 * Rename journeys: a part, an assembly, a drawing, folders (nested, holding my checkouts), and
 * the refusals (someone else's checkout, an existing name). Each renames through the inline
 * editor (select, F2, type, Enter) and then checks the UI, the store, the disk and the server,
 * and that a fresh reload agrees.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/client', async (importOriginal) =>
  (await import('@/test/supabaseClientMock')).mockClientModule(await importOriginal()),
)

import { OTHER_USER_ID, USER_ID, openVault, waitFor, type Vault } from './journeyVault'

let vault: Vault | null = null
afterEach(() => {
  vault?.unmount()
  vault = null
})

const livePaths = (v: Vault) => v.state().server.map((r) => r.path)
const diskPaths = (v: Vault) => v.state().disk.map((d) => d.path)

describe('rename a file', () => {
  it.each([
    ['part', 'Parts/bracket.sldprt', 'bracket-v2', 'Parts/bracket-v2.sldprt'],
    ['assembly', 'top.sldasm', 'top-level', 'top-level.sldasm'],
    ['drawing', 'Drawings/bracket.slddrw', 'bracket-dwg', 'Drawings/bracket-dwg.slddrw'],
  ])('renames a %s on disk, in the store and on the server', async (_kind, from, newName, to) => {
    vault = await openVault({
      files: [{ path: 'Parts/bracket.sldprt' }, { path: 'top.sldasm' }, { path: 'Drawings/bracket.slddrw' }],
    })
    const id = vault.serverRow(from).id
    const folder = from.includes('/') ? from.slice(0, from.lastIndexOf('/')) : ''
    await vault.openFolder(folder)

    await vault.renameInline(vault.row(from), newName)

    expect(vault.queryRow(from)).toBeNull()
    expect(vault.row(to)).toBeTruthy()
    expect(diskPaths(vault)).toContain(to)
    expect(diskPaths(vault)).not.toContain(from)
    await waitFor(() => expect(vault!.db.row('file', id).file_path).toBe(to))
    // Same row, same version: a rename is not a new revision and never a new row.
    expect(vault.db.row('file', id).version).toBe(1)
    expect(vault.state().server).toHaveLength(3)
    vault.expectConsistent()
    await vault.expectStableAcrossReload()
  })

  it('keeps the assembly and drawing references to a renamed part (they are by file id)', async () => {
    vault = await openVault({
      files: [{ path: 'Parts/bracket.sldprt' }, { path: 'top.sldasm' }, { path: 'Drawings/bracket.slddrw' }],
    })
    const part = vault.serverRow('Parts/bracket.sldprt')
    const asm = vault.serverRow('top.sldasm')
    const drw = vault.serverRow('Drawings/bracket.slddrw')
    vault.db.seed('file_reference', { org_id: part.org_id, parent_file_id: asm.id, child_file_id: part.id })
    vault.db.seed('file_reference', {
      org_id: part.org_id,
      parent_file_id: drw.id,
      child_file_id: part.id,
      reference_type: 'drawing_model' as never,
    })
    await vault.openFolder('Parts')

    await vault.renameInline(vault.row('Parts/bracket.sldprt'), 'bracket-renamed')

    await waitFor(() => expect(vault!.db.row('file', part.id).file_path).toBe('Parts/bracket-renamed.sldprt'))
    const refs = vault.db.rows('file_reference')
    expect(refs.map((r) => [r.parent_file_id, r.child_file_id])).toEqual([
      [asm.id, part.id],
      [drw.id, part.id],
    ])
    // Nothing is written into the parents: rename has no SolidWorks reference repair (only
    // "Duplicate" does, through duplicateWithReferences). Recorded in the journeys report.
    expect(vault.electron.calls.filter((c) => c.method.startsWith('solidworks.set'))).toEqual([])
    await vault.expectStableAcrossReload()
  })

  it('renames a file I have checked out and keeps the checkout and the writable bit', async () => {
    vault = await openVault({ files: [{ path: 'mine.sldprt', checkedOutBy: USER_ID }] })
    const id = vault.serverRow('mine.sldprt').id

    await vault.renameInline(vault.row('mine.sldprt'), 'mine-renamed')

    await waitFor(() => expect(vault!.db.row('file', id).file_path).toBe('mine-renamed.sldprt'))
    expect(vault.db.row('file', id).checked_out_by).toBe(USER_ID)
    expect(vault.electron.disk.require(vault.absolute('mine-renamed.sldprt')).readonly).toBe(false)
    await vault.expectStableAcrossReload()
  })

  it('refuses to rename a file someone else has checked out', async () => {
    vault = await openVault({ files: [{ path: 'theirs.sldprt', checkedOutBy: OTHER_USER_ID }] })

    await vault.renameInline(vault.row('theirs.sldprt'), 'stolen')

    expect(diskPaths(vault)).toEqual(['theirs.sldprt'])
    expect(livePaths(vault)).toEqual(['theirs.sldprt'])
    expect(vault.toasts().join('\n')).toMatch(/checked out by/i)
    await vault.expectStableAcrossReload()
  })

  it('refuses a name that already exists in the folder, whatever its case', async () => {
    vault = await openVault({ files: [{ path: 'a.sldprt' }, { path: 'b.sldprt' }] })

    await vault.renameInline(vault.row('a.sldprt'), 'B')

    expect(diskPaths(vault)).toEqual(['a.sldprt', 'b.sldprt'])
    expect(livePaths(vault)).toEqual(['a.sldprt', 'b.sldprt'])
    expect(vault.toasts().join('\n')).toMatch(/already exists/i)
    await vault.expectStableAcrossReload()
  })

  it('renames by case only (Windows: same file, new spelling)', async () => {
    vault = await openVault({ files: [{ path: 'Parts/bracket.sldprt' }] })
    const id = vault.serverRow('Parts/bracket.sldprt').id
    await vault.openFolder('Parts')

    await vault.renameInline(vault.row('Parts/bracket.sldprt'), 'Bracket')

    expect(diskPaths(vault)).toEqual(['Parts/Bracket.sldprt'])
    await waitFor(() => expect(vault!.db.row('file', id).file_path).toBe('Parts/Bracket.sldprt'))
    expect(vault.state().store.map((f) => f.path)).toEqual(['Parts/Bracket.sldprt'])
    await vault.expectStableAcrossReload()
  })
})

describe('rename a folder', () => {
  const nested = {
    files: [
      { path: 'Proj/a.sldprt' },
      { path: 'Proj/Sub/b.sldprt' },
      { path: 'Proj/Sub/Deep/c.slddrw' },
      { path: 'Proj/mine.sldasm', checkedOutBy: USER_ID },
      { path: 'Proj/local.txt', local: true },
      { path: 'Other/x.sldprt' },
    ],
    folders: ['Proj/Empty'],
  }

  it('renames a folder with nested folders, my checkouts and local files, everywhere', async () => {
    vault = await openVault(nested)
    const ids = ['Proj/a.sldprt', 'Proj/Sub/b.sldprt', 'Proj/Sub/Deep/c.slddrw', 'Proj/mine.sldasm'].map(
      (p) => vault!.serverRow(p).id,
    )

    await vault.renameInline(vault.row('Proj'), 'Project')

    expect(diskPaths(vault)).toEqual([
      'Other/x.sldprt',
      'Project/a.sldprt',
      'Project/local.txt',
      'Project/mine.sldasm',
      'Project/Sub/b.sldprt',
      'Project/Sub/Deep/c.slddrw',
    ])
    expect(vault.state().diskFolders).toContain('Project/Empty')
    await waitFor(() =>
      expect(ids.map((id) => vault!.db.row('file', id).file_path)).toEqual([
        'Project/a.sldprt',
        'Project/Sub/b.sldprt',
        'Project/Sub/Deep/c.slddrw',
        'Project/mine.sldasm',
      ]),
    )
    expect(vault.db.row('file', ids[3]).checked_out_by).toBe(USER_ID)
    expect(vault.state().storeFolders).not.toContain('Proj')
    expect(vault.state().storeFolders).toContain('Project/Sub/Deep')
    vault.expectConsistent()
    await vault.expectStableAcrossReload()
  })

  it('renames a folder that has a folders row: the row and the files under it move', async () => {
    vault = await openVault({ ...nested, serverFolders: ['Proj', 'Proj/Sub'] })
    const folderId = vault.db.rows('folder').find((r) => r.folder_path === 'Proj')!.id as string

    await vault.renameInline(vault.row('Proj'), 'Project')

    await waitFor(() => expect(vault!.db.row('folder', folderId).folder_path).toBe('Project'))
    expect(vault.db.rows('folder').map((r) => r.folder_path).sort()).toEqual(['Project', 'Project/Sub'])
    await waitFor(() => expect(livePaths(vault!).filter((p) => p.startsWith('Proj/'))).toEqual([]))
    await vault.expectStableAcrossReload()
  })

  it('renames a nested folder only', async () => {
    vault = await openVault(nested)
    await vault.openFolder('Proj')

    await vault.renameInline(vault.row('Proj/Sub'), 'Renamed')

    await waitFor(() =>
      expect(livePaths(vault!)).toEqual([
        'Other/x.sldprt',
        'Proj/a.sldprt',
        'Proj/mine.sldasm',
        'Proj/Renamed/b.sldprt',
        'Proj/Renamed/Deep/c.slddrw',
      ]),
    )
    await vault.expectStableAcrossReload()
  })

  it('refuses to rename a folder holding a file someone else has checked out', async () => {
    vault = await openVault({ files: [{ path: 'Proj/a.sldprt' }, { path: 'Proj/theirs.sldprt', checkedOutBy: OTHER_USER_ID }] })

    await vault.renameInline(vault.row('Proj'), 'Project')

    expect(diskPaths(vault)).toEqual(['Proj/a.sldprt', 'Proj/theirs.sldprt'])
    expect(livePaths(vault)).toEqual(['Proj/a.sldprt', 'Proj/theirs.sldprt'])
    expect(vault.toasts().join('\n')).toMatch(/checked out by/i)
    await vault.expectStableAcrossReload()
  })

  it('renames a folder by case only', async () => {
    vault = await openVault({ files: [{ path: 'proj/a.sldprt' }, { path: 'proj/Sub/b.sldprt' }] })

    await vault.renameInline(vault.row('proj'), 'Proj')

    expect(diskPaths(vault)).toEqual(['Proj/a.sldprt', 'Proj/Sub/b.sldprt'])
    await waitFor(() => expect(livePaths(vault!)).toEqual(['Proj/a.sldprt', 'Proj/Sub/b.sldprt']))
    expect(vault.state().storeFolders).toEqual(['Proj', 'Proj/Sub'])
    await vault.expectStableAcrossReload()
  })
})
