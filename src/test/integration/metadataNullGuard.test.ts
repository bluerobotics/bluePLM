/**
 * No metadata writer may blank a populated column with "nothing" (the 4.4.5 incident class).
 *
 * In 4.4.5 two writers silently wrote `null` over item numbers and descriptions: `syncFile`
 * re-uploading onto an existing row from a local entry with no metadata, and
 * `syncSolidWorksFileMetadata` relaying a file read that came back empty. The fix guarded those
 * two fields at those two sites. This table runs every writer that relays a value it found
 * (as opposed to check-in, which carries the user's own edit and may clear) against every shape
 * "nothing" arrives in, over a row where every column is populated, through the real query code
 * and the typed fake database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/client', async (importOriginal) =>
  (await import('@/test/supabaseClientMock')).mockClientModule(await importOriginal()),
)

const { syncFile } = await import('@/lib/supabase/files/mutations')
const { checkinFile, syncSolidWorksFileMetadata } = await import('@/lib/supabase/files/checkout')
const { fillEmptyFileMetadata } = await import('@/lib/supabase/files/fillEmptyMetadata')
const { extractMetadataFromProperties } = await import(
  '@/lib/commands/handlers/syncMetadataProperties'
)
const { ORG_ID, USER_ID, VAULT_ID, createHarness } = await import('@/test/harness')

type Harness = Awaited<ReturnType<typeof createHarness>>

const PART = 'Parts/bracket.sldprt'

const POPULATED = {
  part_number: 'BR-100',
  description: 'Bracket',
  revision: 'B',
  custom_properties: {
    Material: 'AL6061',
    _config_tabs: { Default: '01', Blue: '02' },
    _config_descriptions: { Default: 'Bracket', Blue: 'Bracket Blue' },
  },
}

/** Every shape "no value" reaches a writer in. `undefined` is "the field was not sent at all". */
const BLANKS: ReadonlyArray<[string, string | null | undefined]> = [
  ['null', null],
  ['empty string', ''],
  ['undefined', undefined],
  ['whitespace', '   '],
]

type Column = 'part_number' | 'description' | 'revision'

let h: Harness

beforeEach(async () => {
  h = await createHarness()
})

function seedPopulated(checkedOutBy: string | null = null) {
  return h.seedSolidWorksFile(PART, {
    ...POPULATED,
    checked_out_by: checkedOutBy,
    document: {
      fileProperties: { Number: 'BR-100', Description: 'Bracket', Revision: 'B' },
      configurations: [{ name: 'Default', isActive: true, properties: {} }],
    },
  })
}

function expectUnchanged(columns: readonly Column[] | 'all') {
  const row = h.serverRow(PART)
  const check = columns === 'all' ? (['part_number', 'description', 'revision'] as const) : columns
  for (const column of check) expect(row[column], column).toBe(POPULATED[column])
  expect(row.custom_properties).toEqual(POPULATED.custom_properties)
}

/** Re-upload the file onto its existing row, as First Check-In / upload does. */
async function reupload(metadata: Parameters<typeof syncFile>[9]) {
  const path = h.absolute(PART)
  h.electron.disk.write(path, 'new bytes')
  const read = await window.electronAPI!.readFile(path)
  const result = await syncFile(
    ORG_ID,
    VAULT_ID,
    USER_ID,
    PART,
    'bracket.sldprt',
    '.sldprt',
    read.size!,
    read.hash!,
    read.data!,
    metadata,
  )
  expect(result.error).toBeNull()
}

describe.each(BLANKS)('a %s value never overwrites a populated column', (_label, blank) => {
  it.each(['part_number', 'description'] as const)(
    'syncFile (re-upload onto an existing row): %s',
    async (column) => {
      seedPopulated()
      const field = column === 'part_number' ? 'partNumber' : 'description'
      await reupload({ [field]: blank })
      expectUnchanged('all')
      // The upload itself still landed.
      expect(h.serverRow(PART).version).toBe(2)
    },
  )

  it('syncFile with every field blank at once (the 4.4.5 upload overlay)', async () => {
    seedPopulated()
    await reupload({ partNumber: blank, description: blank, revision: blank })
    expectUnchanged('all')
  })

  it.each(['part_number', 'description', 'revision'] as const)(
    'syncSolidWorksFileMetadata (a file read relayed to the row): %s',
    async (column) => {
      const row = seedPopulated()
      const result = await syncSolidWorksFileMetadata(row.id, USER_ID, { [column]: blank })
      expect(result.error ?? null).toBeNull()
      expectUnchanged('all')
    },
  )

  it('syncSolidWorksFileMetadata with every field blank at once', async () => {
    const row = seedPopulated()
    await syncSolidWorksFileMetadata(row.id, USER_ID, {
      part_number: blank,
      description: blank,
      revision: blank,
    })
    expectUnchanged('all')
  })

  it.each(['part_number', 'description'] as const)(
    'fillEmptyFileMetadata (Vault Audit "Fill empty from file"): %s',
    async (column) => {
      const row = seedPopulated()
      const result = await fillEmptyFileMetadata(row.id, USER_ID, {
        [column]: blank as string,
      })
      expect(result.filled).toEqual([])
      expectUnchanged('all')
    },
  )

  it('the Sync Metadata PULL reader turns a blank property into "no value", never a clear', () => {
    const read = extractMetadataFromProperties({
      Number: blank ?? '',
      Description: blank ?? '',
      Revision: blank ?? '',
    })
    expect(read).toEqual({ partNumber: null, tabNumber: null, description: null, revision: null })
  })
})

describe('custom_properties is never replaced by nothing', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
  ])('syncSolidWorksFileMetadata with custom_properties %s', async (_label, value) => {
    const row = seedPopulated()
    await syncSolidWorksFileMetadata(row.id, USER_ID, {
      description: 'Bracket',
      custom_properties: value as Record<string, unknown> | undefined,
    })
    expectUnchanged('all')
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
  ])('syncFile re-upload with customProperties %s', async (_label, value) => {
    seedPopulated()
    await reupload({ customProperties: value as Record<string, never> | undefined })
    expectUnchanged('all')
  })
})

describe('check-in leaves a field the user never touched as it was', () => {
  it('an absent pending field (undefined) keeps the committed value, maps included', async () => {
    const row = seedPopulated(USER_ID)
    // checkin_file only honours a checkout it can see.
    h.db.row('file', row.id).checked_out_at = h.db.tick()
    const result = await checkinFile(row.id, USER_ID, {
      pendingMetadata: { part_number: undefined, description: undefined },
      committedCustomProperties: row.custom_properties,
      skipMachineMismatchCheck: true,
    })
    expect(result.error ?? null).toBeNull()
    expectUnchanged('all')
  })

  it('an edit to one configuration does not erase the others', async () => {
    const row = seedPopulated(USER_ID)
    h.db.row('file', row.id).checked_out_at = h.db.tick()
    await checkinFile(row.id, USER_ID, {
      pendingMetadata: { config_tabs: { Blue: '12' } },
      committedCustomProperties: row.custom_properties,
      skipMachineMismatchCheck: true,
    })
    expect(h.serverRow(PART).custom_properties).toEqual({
      ...POPULATED.custom_properties,
      _config_tabs: { Default: '01', Blue: '12' },
    })
  })
})
