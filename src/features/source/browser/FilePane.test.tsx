// @vitest-environment jsdom
/**
 * The file pane, rendered whole over the real store.
 *
 * Every file state here is produced the way the app produces it: a row seeded on the fake server,
 * the disk changed, then the real vault-load merge (`h.reload()`). The assertions are on the rows,
 * badges, inline editors and context menu entries a user sees, not on the store.
 *
 * Labels that come from `t()` are asserted through `t()`. The context menu and part of the status
 * cell still hold literal English (not yet translated), so those assertions use the literal.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/client', async (importOriginal) =>
  (await import('@/test/supabaseClientMock')).mockClientModule(await importOriginal()),
)

const { FilePane } = await import('./FilePane')
const { t } = await import('@/lib/i18n')
const { usePDMStore } = await import('@/stores/pdmStore')
const { OTHER_USER_ID, createHarness } = await import('@/test/harness')
const { bulkFiles, hydrateOtherCheckout, installDomShims, lenientElectron, signedInVault } =
  await import('@/test/render')

type Harness = Awaited<ReturnType<typeof createHarness>>

const PLAIN = 'Parts/plain.sldprt'
const MINE = 'Parts/mine.sldprt'
const THEIRS = 'Parts/theirs.sldprt'
const MODIFIED = 'Parts/modified.sldprt'
const CLOUD = 'Parts/cloud.sldprt'
const MOVED_FROM = 'Parts/old-name.sldprt'
const MOVED_TO = 'Parts/new-name.sldprt'
const LOCAL = 'Parts/local-only.sldprt'

let h: Harness

function seed(relativePath: string, partNumber: string, checkedOutBy: string | null = null) {
  h.seedSolidWorksFile(relativePath, {
    part_number: partNumber,
    description: `Desc ${partNumber}`,
    checked_out_by: checkedOutBy,
    document: { fileProperties: { Number: partNumber }, configurations: [] },
  })
}

/** One file in each state the pane distinguishes. */
async function seedVault() {
  seed(PLAIN, 'PN-PLAIN')
  seed(MINE, 'PN-MINE')
  seed(THEIRS, 'PN-THEIRS', OTHER_USER_ID)
  seed(MODIFIED, 'PN-MOD')
  seed(CLOUD, 'PN-CLOUD')
  seed(MOVED_FROM, 'PN-MOVED')
  await h.checkOut(MINE)
  await h.checkOut(MODIFIED)
  h.electron.disk.write(h.absolute(MODIFIED), 'edited bytes')
  h.electron.disk.remove(h.absolute(CLOUD))
  h.electron.disk.rename(h.absolute(MOVED_FROM), h.absolute(MOVED_TO))
  h.electron.disk.write(h.absolute(LOCAL), 'never checked in')
  await h.reload()
  hydrateOtherCheckout(THEIRS)
}

function showStatusColumns() {
  usePDMStore.setState((s) => ({
    columns: s.columns.map((c) =>
      c.id === 'fileStatus' || c.id === 'checkedOutBy' ? { ...c, visible: true } : c,
    ),
  }))
}

function renderPane() {
  return render(<FilePane onRefresh={() => {}} />)
}

function row(relativePath: string): HTMLElement {
  const path = h.absolute(relativePath)
  const match = Array.from(document.querySelectorAll<HTMLElement>('tr[data-path]')).find(
    (el) => el.getAttribute('data-path') === path,
  )
  if (!match) throw new Error(`no row for ${relativePath}`)
  return match
}

/** The context menu entry whose text starts with `label`, and whether it is disabled. */
function menuEntry(label: string): { el: HTMLElement; disabled: boolean } | null {
  const el = Array.from(document.querySelectorAll<HTMLElement>('.context-menu-item')).find((item) =>
    (item.textContent ?? '').trim().startsWith(label),
  )
  return el ? { el, disabled: el.classList.contains('disabled') } : null
}

function openMenu(relativePath: string) {
  fireEvent.contextMenu(row(relativePath), { clientX: 10, clientY: 10 })
}

beforeEach(async () => {
  h = await createHarness()
  installDomShims()
  lenientElectron(h)
  signedInVault()
})

afterEach(() => {
  cleanup()
})

describe('FilePane: empty and large vaults', () => {
  it('an empty vault folder renders the empty state', () => {
    renderPane()
    expect(screen.getByRole('button', { name: /Add Files/ })).toBeTruthy()
    expect(document.querySelectorAll('tr[data-path]')).toHaveLength(0)
  })

  it('a vault still loading shows the loading state, not the empty state', () => {
    usePDMStore.setState({ filesLoaded: false, isLoading: true })
    renderPane()
    expect(screen.getAllByText(t('vaultLoad.loading')).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Add Files/ })).toBeNull()
  })

  it('renders a 1,000-file folder as a window of rows, metadata in place at both ends', async () => {
    seed(PLAIN, 'PN-PLAIN')
    await h.reload()
    usePDMStore.getState().setFiles(bulkFiles(h.file(PLAIN), 1000))
    usePDMStore.setState({ currentFolder: 'Bulk' })

    renderPane()

    const rendered = document.querySelectorAll('tr[data-path]').length
    expect(rendered).toBeGreaterThan(10)
    expect(rendered).toBeLessThan(200)
    expect(within(row('Bulk/part-0000.sldprt')).getByText('BULK-0000')).toBeTruthy()
    expect(within(row('Bulk/part-0000.sldprt')).getByText('Bulk part 0000')).toBeTruthy()

    // Scrolled to the end, the last file is on screen with its own values.
    const scroller = row('Bulk/part-0000.sldprt').closest<HTMLElement>('.overflow-auto')!
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: 1000 * 64 })
    act(() => {
      fireEvent.scroll(scroller)
    })
    expect(within(row('Bulk/part-0999.sldprt')).getByText('BULK-0999')).toBeTruthy()
  })
})

describe('FilePane: file states', () => {
  beforeEach(async () => {
    await seedVault()
    showStatusColumns()
    usePDMStore.setState({ currentFolder: 'Parts' })
  })

  it('shows who holds each file', () => {
    renderPane()
    const mine = deriveTitle(row(MINE))
    expect(mine).toContain(t('checkoutDisplay.checkedOutBy', { name: 'Test User' }))
    expect(deriveTitle(row(THEIRS))).toContain(
      t('checkoutDisplay.checkedOutBy', { name: 'Olive Other' }),
    )
    expect(within(row(THEIRS)).getAllByText('OO').length).toBeGreaterThan(0)
    expect(deriveTitle(row(PLAIN))).not.toContain(t('checkoutDisplay.checkedOutBy', { name: '' }).trim())
  })

  it('marks a modified file, a cloud-only file and a moved file apart from the rest', () => {
    renderPane()
    expect(row(MODIFIED).className).toContain('diff-modified')
    expect(row(PLAIN).className).not.toMatch(/diff-/)

    expect(row(CLOUD).className).toContain('diff-cloud')
    expect(within(row(CLOUD)).getByText(t('diffStatus.cloud'))).toBeTruthy()

    expect(row(MOVED_TO).className).toContain('diff-moved')
    const moved = within(row(MOVED_TO)).getByText(t('diffStatus.moved'))
    expect(moved.closest('[title]')?.getAttribute('title')).toBe(t('fileStatus.movedTooltip'))
  })

  it('keeps a moved_away stub at the recorded path, naming where the file went', () => {
    renderPane()
    const stub = row(MOVED_FROM)
    expect(stub.className).toContain('diff-moved-away')
    const label = within(stub).getByText(t('diffStatus.movedAway'))
    expect(label.closest('[title]')?.getAttribute('title')).toBe(
      t('fileStatus.movedAwayTooltipTo', { path: MOVED_TO }),
    )
    // The stub and the file it points at are both listed, once each.
    expect(within(stub).getByText('PN-MOVED')).toBeTruthy()
    expect(within(row(MOVED_TO)).getByText('PN-MOVED')).toBeTruthy()
  })

  it('lists a local-only file without server metadata', () => {
    renderPane()
    const local = row(LOCAL)
    expect(within(local).queryByText(/^PN-/)).toBeNull()
    // Literal: the status cell's local label is not translated yet.
    expect(local.querySelector('[title="Local file - not yet synced to cloud"]')).toBeTruthy()
  })

  it('shows a pending edit over the committed value, and follows later edits', () => {
    renderPane()
    expect(within(row(MINE)).getByText('PN-MINE')).toBeTruthy()

    act(() => {
      usePDMStore.getState().updatePendingMetadata(h.file(MINE).path, { part_number: 'PN-EDIT-1' })
    })
    expect(within(row(MINE)).getByText('PN-EDIT-1')).toBeTruthy()
    expect(within(row(MINE)).queryByText('PN-MINE')).toBeNull()

    // A second edit on a row whose status did not change still reaches the screen.
    act(() => {
      usePDMStore.getState().updatePendingMetadata(h.file(MINE).path, {
        part_number: 'PN-EDIT-2',
        description: 'Second pass',
      })
    })
    expect(within(row(MINE)).getByText('PN-EDIT-2')).toBeTruthy()
    expect(within(row(MINE)).getByText('Second pass')).toBeTruthy()
  })

  it('a newer committed value from a reload replaces the old one on screen', async () => {
    renderPane()
    expect(within(row(PLAIN)).getByText('PN-PLAIN')).toBeTruthy()

    h.db.updateAndEmit('file', h.serverRow(PLAIN).id, { part_number: 'PN-PLAIN-B', description: 'Rev B' })
    await act(() => h.reload())

    expect(within(row(PLAIN)).getByText('PN-PLAIN-B')).toBeTruthy()
    expect(within(row(PLAIN)).getByText('Rev B')).toBeTruthy()
  })

  it('opens an inline editor only on a file checked out by me', async () => {
    renderPane()

    fireEvent.click(within(row(THEIRS)).getByText('PN-THEIRS'))
    fireEvent.click(within(row(PLAIN)).getByText('PN-PLAIN'))
    expect(screen.queryByRole('textbox')).toBeNull()

    fireEvent.click(within(row(MINE)).getByText('PN-MINE'))
    const input = await within(row(MINE)).findByRole('textbox')
    expect((input as HTMLInputElement).value).toBe('PN-MINE')
  })
})

describe('FilePane: context menu', () => {
  beforeEach(async () => {
    await seedVault()
    usePDMStore.setState({ currentFolder: 'Parts' })
  })

  it('a committed file nobody holds: Check Out enabled, Check In disabled', () => {
    renderPane()
    openMenu(PLAIN)
    expect(menuEntry('Check Out')).toMatchObject({ disabled: false })
    expect(menuEntry('Check In')).toMatchObject({ disabled: true })
    expect(menuEntry('Discard Checkout')).toBeNull()
  })

  it('a file I hold: Check In and Discard enabled, Check Out disabled', () => {
    renderPane()
    openMenu(MINE)
    expect(menuEntry('Check Out')).toMatchObject({ disabled: true })
    expect(menuEntry('Check In')).toMatchObject({ disabled: false })
    expect(menuEntry('Discard Checkout')).toMatchObject({ disabled: false })
  })

  it('a file someone else holds: Check Out and Check In disabled, naming the holder', () => {
    renderPane()
    openMenu(THEIRS)
    const checkOut = menuEntry('Check Out')
    expect(checkOut).toMatchObject({ disabled: true })
    expect(checkOut?.el.getAttribute('title')).toContain('Olive Other')
    expect(menuEntry('Check In')).toMatchObject({ disabled: true })
    expect(menuEntry('Force Release')).toBeNull()
  })

  it('an admin sees Force Release on a file someone else holds', () => {
    usePDMStore.setState((s) => ({ user: s.user ? { ...s.user, role: 'admin' } : s.user }))
    renderPane()
    openMenu(THEIRS)
    expect(menuEntry('Force Release')).toMatchObject({ disabled: false })
  })

  it('a cloud-only file cannot be checked out before it is downloaded', () => {
    renderPane()
    openMenu(CLOUD)
    expect(menuEntry('Check Out')).toMatchObject({ disabled: true })
  })

  it('without explorer edit permission, Check Out is disabled', () => {
    usePDMStore.setState({ userPermissions: { 'module:explorer': ['view'] } })
    renderPane()
    openMenu(PLAIN)
    const checkOut = menuEntry('Check Out')
    expect(checkOut).toMatchObject({ disabled: true })
    expect(checkOut?.el.textContent).toContain('(no permission)')
  })

  it('opens on every state without throwing', () => {
    renderPane()
    for (const path of [PLAIN, MINE, THEIRS, MODIFIED, CLOUD, MOVED_FROM, MOVED_TO, LOCAL]) {
      openMenu(path)
      expect(document.querySelectorAll('.context-menu-item').length).toBeGreaterThan(0)
      fireEvent.keyDown(document, { key: 'Escape' })
    }
  })
})

/** Every title in a row, joined: the checkout owner is carried in a cell's tooltip. */
function deriveTitle(el: HTMLElement): string {
  return Array.from(el.querySelectorAll('[title]'))
    .map((n) => n.getAttribute('title'))
    .join(' | ')
}
