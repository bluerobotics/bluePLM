/**
 * Metadata round trip, end to end: edit -> write to the file (Sync Metadata) -> check in ->
 * reload the vault -> read back. Real store, real commands, real Supabase query code; the server,
 * the disk and the SolidWorks service are the harness fakes.
 *
 * Every hop on this path has had its own fix and its own unit test (configuration tabs erased at
 * check-in, a cleared field kept, a partial map read as the whole set, a write reported verified
 * that never landed), and each passed while the next hop broke. This asserts on what the user sees
 * after the whole trip: the value in the row, in the document, and in the store after a reload.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/client', async (importOriginal) =>
  (await import('@/test/supabaseClientMock')).mockClientModule(await importOriginal()),
)

const { checkinCommand } = await import('@/lib/commands/handlers/checkin')
const { syncMetadataCommand } = await import('@/lib/commands/handlers/syncMetadata')
const { buildCommandContext } = await import('@/lib/commands/executor')
const { extractMetadataFromProperties, readConfigurationTab } = await import(
  '@/lib/commands/handlers/syncMetadataProperties'
)
const { resolveDescription, resolvePartNumber, resolvedText } = await import('@/lib/metadata/overlay')
const { readConfigurationMap } = await import('@/lib/metadata/configurationMaps')
const { usePDMStore } = await import('@/stores/pdmStore')
const { createHarness } = await import('@/test/harness')

type Harness = Awaited<ReturnType<typeof createHarness>>

const PART = 'Parts/bracket.sldprt'

const CONFIGS = ['Default', 'Blue', 'Red'] as const

function singleConfigDocument() {
  return {
    fileProperties: {
      Number: 'BR-100',
      'Base Item Number': 'BR-100',
      Description: 'Bracket',
      Revision: 'A',
    },
    configurations: [
      {
        name: 'Default',
        isActive: true,
        properties: { Number: 'BR-100', Description: 'Bracket' },
      },
    ],
  }
}

function multiConfigDocument() {
  return {
    fileProperties: {
      Number: 'BR-100',
      'Base Item Number': 'BR-100',
      Description: 'Bracket',
      Revision: 'A',
    },
    configurations: CONFIGS.map((name, index) => ({
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

const multiConfigCustomProperties = {
  _config_tabs: { Default: '01', Blue: '02', Red: '03' },
  _config_descriptions: { Default: 'Bracket Default', Blue: 'Bracket Blue', Red: 'Bracket Red' },
}

async function pushToFile(h: Harness) {
  const result = await syncMetadataCommand.execute({ files: [h.file(PART)] }, buildCommandContext())
  expect(result, result.message).toMatchObject({ success: true, failed: 0 })
  return result
}

async function checkIn(h: Harness) {
  const result = await checkinCommand.execute({ files: [h.file(PART)] }, buildCommandContext())
  expect(result, result.message).toMatchObject({ success: true, failed: 0 })
  return result
}

async function readDocument(h: Harness) {
  const reply = await window.electronAPI!.solidworks.getProperties(h.absolute(PART))
  if (!reply.success || !reply.data) throw new Error(reply.error)
  return reply.data
}

let h: Harness

beforeEach(async () => {
  h = await createHarness()
})

describe('metadata round trip: edit -> write to file -> check in -> reload', () => {
  it('a single-configuration part reads back the edited description everywhere', async () => {
    h.seedSolidWorksFile(PART, {
      part_number: 'BR-100',
      description: 'Bracket',
      document: singleConfigDocument(),
    })
    await h.checkOut(PART)

    usePDMStore.getState().updatePendingMetadata(h.file(PART).path, {
      description: 'Bracket, anodized',
    })
    expect(h.file(PART).diffStatus).toBe('modified')

    await pushToFile(h)
    const written = await readDocument(h)
    expect(extractMetadataFromProperties(written.fileProperties).description).toBe(
      'Bracket, anodized',
    )

    await checkIn(h)
    const row = h.serverRow(PART)
    expect(row).toMatchObject({
      description: 'Bracket, anodized',
      part_number: 'BR-100',
      checked_out_by: null,
      content_hash: h.electron.disk.hash(h.absolute(PART)),
    })
    expect(row.version).toBe(2)

    await h.reload()
    const reloaded = h.file(PART)
    expect(resolvedText(resolveDescription(reloaded))).toBe('Bracket, anodized')
    expect(resolvedText(resolvePartNumber(reloaded))).toBe('BR-100')
    expect(reloaded.pendingMetadata).toBeUndefined()
    expect(usePDMStore.getState().persistedPendingMetadata[reloaded.path]).toBeUndefined()
    // In sync after the trip: not modified, not outdated, the server version on disk.
    expect(reloaded.diffStatus).toBeUndefined()
  })

  it('a multi-configuration part keeps every configuration tab through the whole trip', async () => {
    h.seedSolidWorksFile(PART, {
      part_number: 'BR-100',
      description: 'Bracket',
      document: multiConfigDocument(),
      custom_properties: multiConfigCustomProperties,
    })
    await h.checkOut(PART)

    // One configuration edited; the other two must survive untouched.
    usePDMStore.getState().updatePendingMetadata(h.file(PART).path, {
      config_tabs: { Blue: '12' },
      config_descriptions: { Blue: 'Bracket Navy' },
    })

    await pushToFile(h)
    const written = await readDocument(h)
    const tabs = Object.fromEntries(
      CONFIGS.map((name) => [name, readConfigurationTab(written.configurationProperties[name], '-')]),
    )
    expect(tabs).toEqual({ Default: '01', Blue: '12', Red: '03' })
    expect(written.configurationProperties.Blue.Description).toBe('Bracket Navy')
    expect(written.configurationProperties.Red.Description).toBe('Bracket Red')

    await checkIn(h)
    const row = h.serverRow(PART)
    expect(readConfigurationMap(row.custom_properties, '_config_tabs')).toEqual({
      Default: '01',
      Blue: '12',
      Red: '03',
    })
    expect(readConfigurationMap(row.custom_properties, '_config_descriptions')).toEqual({
      Default: 'Bracket Default',
      Blue: 'Bracket Navy',
      Red: 'Bracket Red',
    })

    await h.reload()
    const reloaded = h.file(PART)
    expect(reloaded.pendingMetadata).toBeUndefined()
    expect(readConfigurationMap(reloaded.pdmData?.custom_properties, '_config_tabs')).toEqual({
      Default: '01',
      Blue: '12',
      Red: '03',
    })
    expect(reloaded.diffStatus).toBeUndefined()
  })

  it('Sync Metadata with no edit leaves every configuration tab in the file as it was', async () => {
    h.seedSolidWorksFile(PART, {
      part_number: 'BR-100',
      description: 'Bracket',
      document: multiConfigDocument(),
      custom_properties: multiConfigCustomProperties,
    })
    await h.checkOut(PART)

    await pushToFile(h)
    const written = await readDocument(h)
    for (const [index, name] of CONFIGS.entries()) {
      expect(readConfigurationTab(written.configurationProperties[name], '-')).toBe(`0${index + 1}`)
      expect(written.configurationProperties[name].Description).toBe(`Bracket ${name}`)
    }
    expect(Object.keys(written.configurationProperties).sort()).toEqual([...CONFIGS].sort())
  })

  it('Sync Metadata keeps configuration tabs the server has never seen', async () => {
    // A file first checked in without per-configuration metadata: the row has no maps at all.
    h.seedSolidWorksFile(PART, {
      part_number: 'BR-100',
      description: 'Bracket',
      document: multiConfigDocument(),
    })
    await h.checkOut(PART)

    await pushToFile(h)
    const written = await readDocument(h)
    const tabs = CONFIGS.map((name) => readConfigurationTab(written.configurationProperties[name], '-'))
    expect(tabs).toEqual(['01', '02', '03'])
  })

  it('an edited item number reaches the row and the document, and reads back after reload', async () => {
    h.seedSolidWorksFile(PART, {
      part_number: 'BR-100',
      description: 'Bracket',
      document: singleConfigDocument(),
    })
    await h.checkOut(PART)

    usePDMStore.getState().updatePendingMetadata(h.file(PART).path, { part_number: 'BR-200' })
    await pushToFile(h)
    expect(extractMetadataFromProperties((await readDocument(h)).fileProperties).partNumber).toBe(
      'BR-200',
    )
    await checkIn(h)
    expect(h.serverRow(PART).part_number).toBe('BR-200')

    await h.reload()
    expect(resolvedText(resolvePartNumber(h.file(PART)))).toBe('BR-200')
    expect(h.file(PART).pendingMetadata).toBeUndefined()
  })

  it('a description cleared by the user is cleared in the row after check-in', async () => {
    h.seedSolidWorksFile(PART, {
      part_number: 'BR-100',
      description: 'Bracket',
      document: singleConfigDocument(),
    })
    await h.checkOut(PART)

    usePDMStore.getState().updatePendingMetadata(h.file(PART).path, { description: null })
    await pushToFile(h)
    await checkIn(h)
    // Check-in is the one writer allowed to clear: it carries the user's own edit.
    expect(h.serverRow(PART).description ?? '').toBe('')

    await h.reload()
    expect(resolvedText(resolveDescription(h.file(PART)))).toBe('')
  })
})
