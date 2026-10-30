/**
 * Filling empty `files` metadata columns from values a SolidWorks file still holds.
 *
 * The fake client evaluates the update's filters against the row, so the guarantee under test is
 * the one production relies on: the emptiness check travels with the UPDATE, and a column that
 * gained a value between the scan and the write is never overwritten.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>

const FILE_ID = '00000000-0000-0000-0000-0000000000f1'
const USER_ID = '00000000-0000-0000-0000-0000000000u1'

let row: Row = {}
let rowVisible = true
let updatePayloads: Row[] = []
let activityInserts: Row[] = []
let versionWrites = 0
/** Row-level security refuses the UPDATE while the row stays readable. */
let updateDenied = false
/** Which query answers with an error: the file lookup, the update, or the re-read after it. */
let failing = new Set<'file' | 'update' | 'read'>()

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === ''
}

function updateQuery(payload: Row) {
  const filters: Array<(candidate: Row) => boolean> = []
  const query = {
    eq(column: string, value: unknown) {
      filters.push((candidate) => candidate[column] === value)
      return query
    },
    is(column: string, value: unknown) {
      filters.push((candidate) => (value === null ? isEmpty(candidate[column]) : false))
      return query
    },
    or(expression: string) {
      const column = expression.split('.')[0]
      filters.push((candidate) => isEmpty(candidate[column]))
      return query
    },
    select() {
      return query
    },
    async maybeSingle() {
      updatePayloads.push(payload)
      if (failing.has('update')) return { data: null, error: { message: 'update boom' } }
      if (updateDenied) return { data: null, error: null }
      if (!rowVisible || !filters.every((filter) => filter(row))) {
        return { data: null, error: null }
      }
      row = { ...row, ...payload }
      return { data: { ...row }, error: null }
    },
  }
  return query
}

vi.mock('../client', () => ({
  getSupabaseClient: () => ({
    from(table: string) {
      if (table === 'activity') {
        return {
          insert: async (values: Row) => {
            activityInserts.push(values)
            return { error: null }
          },
        }
      }
      if (table === 'file_version') {
        versionWrites += 1
        return {}
      }
      return {
        update: (payload: Row) => updateQuery(payload),
        select: (columns: string) => ({
          eq: () => ({
            maybeSingle: async () => {
              const query = columns.startsWith('org_id') ? 'file' : 'read'
              if (failing.has(query)) return { data: null, error: { message: `${query} boom` } }
              return { data: rowVisible ? { ...row } : null, error: null }
            },
          }),
        }),
      }
    },
  }),
}))

vi.mock('../auth', () => ({
  getCurrentUserEmail: async () => 'admin@example.com',
}))

const { fillEmptyFileMetadata, fillEmptyFileMetadataBatch } = await import('./fillEmptyMetadata')

beforeEach(() => {
  row = {
    id: FILE_ID,
    org_id: 'org-1',
    part_number: null,
    description: '',
    deleted_at: null,
    version: 3,
    updated_at: '2026-09-01T00:00:00.000Z',
  }
  rowVisible = true
  updatePayloads = []
  activityInserts = []
  versionWrites = 0
  updateDenied = false
  failing = new Set()
})

describe('fillEmptyFileMetadata', () => {
  it('fills empty columns and logs one activity entry naming them', async () => {
    const result = await fillEmptyFileMetadata(FILE_ID, USER_ID, {
      part_number: 'BR-100077',
      description: 'PCB, Fathom-X',
    })

    expect(result.filled).toEqual(['part_number', 'description'])
    expect(row.part_number).toBe('BR-100077')
    expect(row.description).toBe('PCB, Fathom-X')
    expect(row.updated_by).toBe(USER_ID)
    expect(activityInserts).toHaveLength(1)
    expect(activityInserts[0]).toMatchObject({
      action: 'update',
      file_id: FILE_ID,
      details: { metadataRestore: true, changedFields: ['part_number', 'description'] },
    })
  })

  it('never overwrites a column that gained a value after the scan', async () => {
    row.part_number = 'BR-999999'

    const result = await fillEmptyFileMetadata(FILE_ID, USER_ID, {
      part_number: 'BR-100077',
      description: 'PCB, Fathom-X',
    })

    expect(row.part_number).toBe('BR-999999')
    expect(result.alreadySet).toEqual(['part_number'])
    expect(result.filled).toEqual(['description'])
  })

  it('reports a row the database would not let this user write as refused', async () => {
    rowVisible = false

    const result = await fillEmptyFileMetadata(FILE_ID, USER_ID, { part_number: 'BR-100077' })

    expect(result.filled).toEqual([])
    expect(result.refused).toEqual(['part_number'])
    expect(activityInserts).toHaveLength(0)
  })

  it('does not touch a trashed row', async () => {
    row.deleted_at = '2026-09-02T00:00:00.000Z'

    const result = await fillEmptyFileMetadata(FILE_ID, USER_ID, { part_number: 'BR-100077' })

    expect(result.filled).toEqual([])
    expect(row.part_number).toBeNull()
  })

  it('skips blank values instead of writing them', async () => {
    const result = await fillEmptyFileMetadata(FILE_ID, USER_ID, {
      part_number: '   ',
      description: '',
    })

    expect(updatePayloads).toHaveLength(0)
    expect(result.filled).toEqual([])
  })

  it('neither bumps the version nor writes a version row', async () => {
    await fillEmptyFileMetadata(FILE_ID, USER_ID, { part_number: 'BR-100077' })

    expect(row.version).toBe(3)
    expect(updatePayloads[0]).not.toHaveProperty('version')
    expect(versionWrites).toBe(0)
  })

  it('skips a file someone else has checked out, read from the row itself', async () => {
    row.checked_out_by = 'someone-else'

    const result = await fillEmptyFileMetadata(FILE_ID, USER_ID, { part_number: 'BR-100077' })

    expect(result.heldByOther).toBe(true)
    expect(result.filled).toEqual([])
    expect(updatePayloads).toHaveLength(0)
    expect(row.part_number).toBeNull()
  })

  it('still fills a file the admin has checked out themselves', async () => {
    row.checked_out_by = USER_ID

    const result = await fillEmptyFileMetadata(FILE_ID, USER_ID, { part_number: 'BR-100077' })

    expect(result.filled).toEqual(['part_number'])
  })
})

describe('fillEmptyFileMetadataBatch', () => {
  it('accounts for every value and names the files it skipped', async () => {
    row.description = 'Set by a colleague'

    const filled = await fillEmptyFileMetadataBatch(
      [
        {
          fileId: FILE_ID,
          relativePath: 'ELEC/A.SLDPRT',
          values: { part_number: 'BR-100077', description: 'PCB' },
        },
      ],
      USER_ID,
    )

    expect(filled).toMatchObject({ filled: 1, alreadySet: 1, refused: 0, heldByOther: [], failed: [] })
    expect(filled.filledKeys).toEqual([`${FILE_ID}:part_number`])
    expect(filled.updatedRows).toHaveLength(1)

    row.checked_out_by = 'someone-else'
    row.part_number = null
    const held = await fillEmptyFileMetadataBatch(
      [{ fileId: FILE_ID, relativePath: 'ELEC/A.SLDPRT', values: { part_number: 'BR-100077' } }],
      USER_ID,
    )
    expect(held.heldByOther).toEqual(['ELEC/A.SLDPRT'])
    expect(held.filled).toBe(0)
  })
})

// Pinned by mutation testing (.cursor/plans/test-mutation-report.md).
describe('fillEmptyFileMetadata when the write does not land', () => {
  it('reports a value the update was not allowed to write as refused, not already set', async () => {
    updateDenied = true

    const result = await fillEmptyFileMetadata(FILE_ID, USER_ID, { part_number: 'BR-100077' })

    expect(result.refused).toEqual(['part_number'])
    expect(result.alreadySet).toEqual([])
    expect(result.row).toBeUndefined()
    expect(activityInserts).toHaveLength(0)
  })

  it('logs no activity when every value was already set', async () => {
    row.part_number = 'BR-1'
    row.description = 'Set'

    const result = await fillEmptyFileMetadata(FILE_ID, USER_ID, { part_number: 'BR-2', description: 'Other' })

    expect(result.alreadySet).toEqual(['part_number', 'description'])
    expect(activityInserts).toHaveLength(0)
  })

  it('says no version was created in the activity it logs', async () => {
    await fillEmptyFileMetadata(FILE_ID, USER_ID, { part_number: 'BR-100077' })

    expect(activityInserts[0]).toMatchObject({ details: { versionCreated: false, source: 'solidworks' } })
  })

  it.each([
    ['the file lookup', 'file' as const, 'file boom'],
    ['the update', 'update' as const, 'update boom'],
    ['the re-read', 'read' as const, 'read boom'],
  ])('stops and reports an error from %s', async (_label, query, message) => {
    failing.add(query)
    updateDenied = query === 'read'

    const result = await fillEmptyFileMetadata(FILE_ID, USER_ID, { part_number: 'BR-100077' })

    expect(result.error).toBe(message)
    expect(result.filled).toEqual([])
    expect(result.alreadySet).toEqual([])
    expect(result.refused).toEqual([])
  })
})

describe('fillEmptyFileMetadataBatch accounting', () => {
  it('counts refusals, names the refused file and puts no row in the store for it', async () => {
    updateDenied = true

    const receipt = await fillEmptyFileMetadataBatch(
      [{ fileId: FILE_ID, relativePath: 'ELEC/A.SLDPRT', values: { part_number: 'BR-1', description: 'PCB' } }],
      USER_ID,
    )

    expect(receipt).toMatchObject({ filled: 0, refused: 2, refusedPaths: ['ELEC/A.SLDPRT'], updatedRows: [] })
  })

  it('names no file as refused when nothing was refused', async () => {
    const receipt = await fillEmptyFileMetadataBatch(
      [{ fileId: FILE_ID, relativePath: 'ELEC/A.SLDPRT', values: { part_number: 'BR-1' } }],
      USER_ID,
    )

    expect(receipt.refusedPaths).toEqual([])
    expect(receipt.updatedRows).toEqual([{ fileId: FILE_ID, row: expect.objectContaining({ part_number: 'BR-1' }) }])
  })

  it('lists a file whose write errored as failed, with the reason', async () => {
    failing.add('update')

    const receipt = await fillEmptyFileMetadataBatch(
      [{ fileId: FILE_ID, relativePath: 'ELEC/A.SLDPRT', values: { part_number: 'BR-1' } }],
      USER_ID,
    )

    expect(receipt.failed).toEqual([{ relativePath: 'ELEC/A.SLDPRT', reason: 'update boom' }])
    expect(receipt.filled).toBe(0)
  })
})
