// @vitest-environment jsdom
/**
 * The metadata cells and `useConfigHandlers`, rendered.
 *
 * Until this file no component was ever rendered in a test, so a cell that displayed the wrong
 * side of the overlay, opened an editor on a file nobody had checked out, or never reached the
 * SolidWorks write passed CI. Each cell renders inside the real providers with the real edit and
 * configuration handlers (src/test/FilePaneCellHost.tsx), over the real store and the harness's
 * fake database and service, and the assertions are on what is on screen, what the store holds and
 * what the document holds.
 */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/client', async (importOriginal) =>
  (await import('@/test/supabaseClientMock')).mockClientModule(await importOriginal()),
)

const { ItemNumberCell } = await import('./ItemNumberCell')
const { DescriptionCell } = await import('./DescriptionCell')
const { TabNumberCell } = await import('./TabNumberCell')
const { FilePaneCellHost } = await import('@/test/FilePaneCellHost')
const { useConfigHandlers } = await import('@/features/source/browser/hooks/useConfigHandlers')
const { extractMetadataFromProperties, readConfigurationTab } = await import(
  '@/lib/commands/handlers/syncMetadataProperties'
)
const { usePDMStore } = await import('@/stores/pdmStore')
const { USER_ID, createHarness } = await import('@/test/harness')

type Harness = Awaited<ReturnType<typeof createHarness>>

const PART = 'Parts/bracket.sldprt'
const DRAWING = 'Parts/bracket.slddrw'

function partDocument() {
  return {
    fileProperties: {
      Number: 'BR-100',
      'Base Item Number': 'BR-100',
      Description: 'Bracket',
      Revision: 'A',
    },
    configurations: ['Default', 'Blue', 'Red'].map((name, index) => ({
      name,
      isActive: index === 0,
      properties: {
        Number: `BR-100-0${index + 1}`,
        'Base Item Number': 'BR-100',
        'Tab Number': `0${index + 1}`,
        Description: `Bracket ${name}`,
      },
    })),
  }
}

let h: Harness

async function seedPart(checkedOut: boolean) {
  h.seedSolidWorksFile(PART, {
    part_number: 'BR-100',
    description: 'Bracket',
    document: partDocument(),
    custom_properties: { _config_tabs: { Default: '01', Blue: '02', Red: '03' } },
  })
  if (checkedOut) await h.checkOut(PART)
  else await h.reload()
}

async function documentProperties() {
  const reply = await window.electronAPI!.solidworks.getProperties(h.absolute(PART))
  if (!reply.success || !reply.data) throw new Error(reply.error)
  return reply.data
}

beforeEach(async () => {
  h = await createHarness()
})

afterEach(() => {
  cleanup()
})

describe('ItemNumberCell', () => {
  it('shows the committed item number read-only on a file nobody has checked out', async () => {
    await seedPart(false)
    render(<FilePaneCellHost relativePath={PART} Cell={ItemNumberCell} />)

    const value = screen.getByText('BR-100')
    expect(value.closest('[title]')?.getAttribute('title')).toBe('BR-100 • Check out file to edit')
    fireEvent.click(value)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(h.file(PART).pendingMetadata).toBeUndefined()
  })

  it('edits, shows the pending value, and writes it into the document', async () => {
    await seedPart(true)
    render(<FilePaneCellHost relativePath={PART} Cell={ItemNumberCell} />)

    fireEvent.click(screen.getByText('BR-100'))
    const input = await screen.findByRole('textbox')
    expect((input as HTMLInputElement).value).toBe('BR-100')

    fireEvent.change(input, { target: { value: 'BR-200' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(await screen.findByText('BR-200')).toBeTruthy()
    expect(h.file(PART).pendingMetadata).toMatchObject({ part_number: 'BR-200' })
    expect(h.file(PART).diffStatus).toBe('modified')
    // The committed row is untouched until check-in.
    expect(h.file(PART).pdmData?.part_number).toBe('BR-100')

    await waitFor(async () => {
      const doc = await documentProperties()
      expect(extractMetadataFromProperties(doc.fileProperties).partNumber).toBe('BR-200')
    })
    const doc = await documentProperties()
    // The base number is carried into every configuration, each keeping its own tab.
    expect(['Default', 'Blue', 'Red'].map((c) => doc.configurationProperties[c]['Tab Number'])).toEqual(
      ['01', '02', '03'],
    )
  })

  it('a cleared item number is a pending clear, shown as empty', async () => {
    await seedPart(true)
    render(<FilePaneCellHost relativePath={PART} Cell={ItemNumberCell} />)

    fireEvent.click(screen.getByText('BR-100'))
    const input = await screen.findByRole('textbox')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(await screen.findByText('-')).toBeTruthy()
    expect(h.file(PART).pendingMetadata).toMatchObject({ part_number: null })
  })
})

describe('DescriptionCell', () => {
  it('edits the description through the real save path', async () => {
    await seedPart(true)
    render(<FilePaneCellHost relativePath={PART} Cell={DescriptionCell} />)

    fireEvent.click(screen.getByText('Bracket'))
    const input = await screen.findByRole('textbox')
    fireEvent.change(input, { target: { value: 'Bracket, anodized' } })
    fireEvent.blur(input)

    expect(await screen.findByText('Bracket, anodized')).toBeTruthy()
    expect(h.file(PART).pendingMetadata).toMatchObject({ description: 'Bracket, anodized' })
    await waitFor(async () => {
      const doc = await documentProperties()
      expect(extractMetadataFromProperties(doc.fileProperties).description).toBe('Bracket, anodized')
    })
  })

  it('an unchanged value opens and closes without an edit', async () => {
    await seedPart(true)
    render(<FilePaneCellHost relativePath={PART} Cell={DescriptionCell} />)

    fireEvent.click(screen.getByText('Bracket'))
    fireEvent.keyDown(await screen.findByRole('textbox'), { key: 'Enter' })

    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
    expect(h.file(PART).pendingMetadata).toBeUndefined()
    expect(h.file(PART).diffStatus).toBeUndefined()
  })

  it('a locked drawing description does not open an editor even when checked out', async () => {
    h.seedSolidWorksFile(DRAWING, {
      description: 'Bracket drawing',
      document: { fileProperties: { Description: 'Bracket drawing' }, configurations: [] },
    })
    await h.checkOut(DRAWING)
    usePDMStore.setState({ lockDrawingDescription: true })
    render(<FilePaneCellHost relativePath={DRAWING} Cell={DescriptionCell} />)

    const value = screen.getByText('Bracket drawing')
    expect(value.closest('[title]')?.getAttribute('title')).toBe(
      'Drawing description is inherited from the referenced model',
    )
    fireEvent.click(value)
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})

describe('TabNumberCell', () => {
  // Tabs on parts and assemblies live per configuration (ConfigRow); the file row shows none.
  // `canHaveConfigs` admits only parts and assemblies, so no file row shows this cell's content
  // at all today - pinned here so a change to either rule is a decision, not an accident.
  it.each([PART, DRAWING])('renders nothing on the file row of %s', async (relativePath) => {
    h.seedSolidWorksFile(relativePath, {
      document: { fileProperties: {}, configurations: [] },
    })
    await h.checkOut(relativePath)
    usePDMStore.getState().updatePendingMetadata(h.file(relativePath).path, { tab_number: '07' })
    render(<FilePaneCellHost relativePath={relativePath} Cell={TabNumberCell} />)

    expect(screen.getByTestId('cell').textContent).toBe('')
  })
})

describe('useConfigHandlers', () => {
  function renderConfigHandlers() {
    const state = usePDMStore.getState()
    return renderHook(() =>
      useConfigHandlers({
        files: usePDMStore((s) => s.files),
        lastClickedConfigRef: { current: null },
        justSavedConfigs: { current: new Set<string>() },
        configContextMenu: null,
        setConfigContextMenu: () => {},
        setIsExportingConfigs: () => {},
        setSelectedFiles: state.setSelectedFiles,
        organization: usePDMStore((s) => s.organization),
        addToast: state.addToast,
        addProgressToast: state.addProgressToast,
        updateProgressToast: state.updateProgressToast,
        removeToast: state.removeToast,
      }),
    )
  }

  it('expanding a part lists its configurations with the tab each one holds', async () => {
    await seedPart(true)
    const { result } = renderConfigHandlers()

    await act(() => result.current.toggleFileConfigExpansion(h.file(PART)))

    const path = h.file(PART).path
    expect(usePDMStore.getState().expandedConfigFiles.has(path)).toBe(true)
    const configs = usePDMStore.getState().fileConfigurations.get(path) ?? []
    expect(configs.map((c) => [c.name, c.tabNumber])).toEqual([
      ['Default', '01'],
      ['Blue', '02'],
      ['Red', '03'],
    ])
  })

  it('a tab edit on one configuration is pending for that one and written without erasing the rest', async () => {
    await seedPart(true)
    const { result } = renderConfigHandlers()
    await act(() => result.current.toggleFileConfigExpansion(h.file(PART)))

    act(() => result.current.handleConfigTabChange(h.file(PART).path, 'Blue', '12'))
    const pending = h.file(PART).pendingMetadata
    expect(pending).toEqual({ config_tabs: { Blue: '12' } })
    expect(h.file(PART).pdmData?.checked_out_by).toBe(USER_ID)

    await act(() =>
      result.current.saveConfigsToSWFile(h.file(PART), {
        path: h.file(PART).path,
        fields: ['config_tabs'],
        pending: pending!,
      }),
    )
    const doc = await documentProperties()
    expect(
      ['Default', 'Blue', 'Red'].map((c) => readConfigurationTab(doc.configurationProperties[c], '-')),
    ).toEqual(['01', '12', '03'])
    expect(doc.configurationProperties.Blue.Number).toBe('BR-100-12')
    // The value stays pending until check-in hands it to the server.
    expect(h.file(PART).pendingMetadata).toEqual({ config_tabs: { Blue: '12' } })
  })

  it('refuses to write into a file that is read-only on disk, keeping the edit', async () => {
    await seedPart(true)
    const { result } = renderConfigHandlers()
    h.electron.disk.require(h.absolute(PART)).readonly = true
    const before = await documentProperties()

    const edit = usePDMStore.getState().updatePendingMetadata(h.file(PART).path, {
      description: 'Bracket, anodized',
    })
    await act(() => result.current.saveConfigsToSWFile(h.file(PART), edit))

    expect(await documentProperties()).toEqual(before)
    expect(h.file(PART).pendingMetadata).toMatchObject({ description: 'Bracket, anodized' })
  })
})
