// @vitest-environment jsdom
/**
 * The SolidWorks properties tab and Where Used tab, rendered over the real store, the harness's
 * fake service and its documents.
 *
 * SWPropertiesTab is a database-versus-file view: the key properties are what the document holds,
 * the PDM block is the committed row (by design, see overlayCallSites.test.ts), and "Write to File"
 * pushes the value the user sees, pending over committed.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/client', async (importOriginal) =>
  (await import('@/test/supabaseClientMock')).mockClientModule(await importOriginal()),
)

const { SWPropertiesTab, WhereUsedTab } = await import('./SolidWorksPanel')
const { usePDMStore } = await import('@/stores/pdmStore')
const { OTHER_USER_ID, createHarness } = await import('@/test/harness')
const { installDomShims, lenientElectron, signedInVault } = await import('@/test/render')

type Harness = Awaited<ReturnType<typeof createHarness>>

const PART = 'Parts/bracket.sldprt'

let h: Harness

function seedPart(
  options: { checkedOutBy?: string | null; fileProperties?: Record<string, string>; partNumber?: string } = {},
) {
  h.seedSolidWorksFile(PART, {
    part_number: options.partNumber ?? 'BR-100',
    description: 'Bracket',
    checked_out_by: options.checkedOutBy ?? null,
    document: {
      // What BluePLM's own writer leaves in a part: `Number` and `Base Item Number`.
      fileProperties: options.fileProperties ?? {
        Number: 'BR-100',
        'Base Item Number': 'BR-100',
        Description: 'Bracket',
        Revision: 'A',
        Material: '6061-T6',
      },
      configurations: [{ name: 'Default', isActive: true, properties: {} }],
    },
  })
}

/** The value of a key-property cell (`P/N`, `Desc`, `Rev`, `Mat`). */
function keyProp(label: string): string {
  const labelEl = screen.getAllByText(label).find((el) => el.className.includes('uppercase'))
  return labelEl?.nextElementSibling?.textContent ?? ''
}

/** The PDM block's value next to `P/N:` or `Desc:`, with its "file disagrees" highlight. */
function pdmValue(label: string): { text: string; differs: boolean } {
  const labelEl = screen.getByText(label)
  const value = labelEl.nextElementSibling as HTMLElement
  return { text: value.textContent ?? '', differs: value.className.includes('text-plm-warning') }
}

function renderTab() {
  return render(<SWPropertiesTab file={h.file(PART)} />)
}

async function documentProperties() {
  const reply = await window.electronAPI!.solidworks.getProperties(h.absolute(PART))
  if (!reply.success || !reply.data) throw new Error(reply.error)
  return reply.data.fileProperties
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

describe('SWPropertiesTab: what the document holds', () => {
  it('shows the item number BluePLM wrote under `Number`', async () => {
    seedPart()
    await h.reload()
    renderTab()
    await waitFor(() => expect(keyProp('P/N')).toBe('BR-100'))
    expect(keyProp('Desc')).toBe('Bracket')
    expect(keyProp('Rev')).toBe('A')
    expect(keyProp('Mat')).toBe('6061-T6')
  })

  it('a property reference reads as empty, not as its formula', async () => {
    seedPart({ fileProperties: { Number: 'BR-100', Description: '$PRP:"SW-File Name"' } })
    await h.reload()
    renderTab()
    await waitFor(() => expect(keyProp('P/N')).toBe('BR-100'))
    expect(keyProp('Desc')).toBe('—')
  })

  it('the PDM block agrees with a document whose `Number` carries the tab', async () => {
    seedPart({
      fileProperties: { Number: 'BR-100-01', 'Base Item Number': 'BR-100', Description: 'Bracket' },
    })
    await h.reload()
    renderTab()
    await waitFor(() => expect(keyProp('P/N')).toBe('BR-100-01'))
    expect(pdmValue('P/N:')).toEqual({ text: 'BR-100', differs: false })
    expect(pdmValue('Desc:')).toEqual({ text: 'Bracket', differs: false })
  })

  it('the PDM block flags a document that disagrees with the row', async () => {
    seedPart({ fileProperties: { Number: 'BR-999', Description: 'Old name' } })
    await h.reload()
    renderTab()
    await waitFor(() => expect(keyProp('P/N')).toBe('BR-999'))
    expect(pdmValue('P/N:')).toEqual({ text: 'BR-100', differs: true })
    expect(pdmValue('Desc:')).toEqual({ text: 'Bracket', differs: true })
  })

  it('with the service stopped: renders, shows no document values and no PDM block', async () => {
    seedPart()
    await h.reload()
    h.electron.service.running = false
    renderTab()
    await act(async () => {})
    expect(keyProp('P/N')).toBe('—')
    expect(screen.queryByText('PDM Metadata')).toBeNull()
  })
})

describe('SWPropertiesTab: who may write', () => {
  it('a file nobody holds: no Write to File, says to check out', async () => {
    seedPart()
    await h.reload()
    renderTab()
    await screen.findByText('PDM Metadata')
    expect(screen.queryByRole('button', { name: /Write to File/ })).toBeNull()
    expect(screen.getByText('Check out to write metadata to file')).toBeTruthy()
  })

  it('a file someone else holds: no Write to File', async () => {
    seedPart({ checkedOutBy: OTHER_USER_ID })
    await h.reload()
    renderTab()
    await screen.findByText('PDM Metadata')
    expect(screen.queryByRole('button', { name: /Write to File/ })).toBeNull()
  })

  it('a file I hold: Write to File pushes the pending value, the block still shows the committed one', async () => {
    seedPart()
    await h.checkOut(PART)
    usePDMStore.getState().updatePendingMetadata(h.file(PART).path, {
      part_number: 'BR-200',
      description: 'Bracket, anodized',
    })
    renderTab()
    const write = await screen.findByRole('button', { name: /Write to File/ })

    // Committed side of the comparison (the row has not changed until check-in).
    expect(pdmValue('P/N:').text).toBe('BR-100')

    await act(async () => {
      fireEvent.click(write)
    })
    await waitFor(async () => expect((await documentProperties()).Number).toBe('BR-200'))
    expect((await documentProperties()).Description).toBe('Bracket, anodized')
    await waitFor(() => expect(keyProp('P/N')).toBe('BR-200'))
  })
})

describe('WhereUsedTab', () => {
  it('a local-only part: says it is not synced', async () => {
    h.electron.disk.write(h.absolute('Parts/new.sldprt'), 'new', {
      fileProperties: {},
      configurations: [],
    })
    await h.reload()
    render(<WhereUsedTab file={h.file('Parts/new.sldprt')} />)
    expect(within(document.body).getByText('File not synced to cloud')).toBeTruthy()
  })

  it('a file that is not a SolidWorks document: asks for one', async () => {
    h.seedSolidWorksFile('Docs/spec.step')
    await h.reload()
    render(<WhereUsedTab file={h.file('Docs/spec.step')} />)
    expect(screen.getByText('Select a SolidWorks file')).toBeTruthy()
  })
})
