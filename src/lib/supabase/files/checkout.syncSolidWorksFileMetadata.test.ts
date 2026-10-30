/**
 * Adopting metadata read out of a SolidWorks file into the `files` row.
 *
 * The writer relays what a document holds. A document that holds no part number or no
 * description used to be relayed as `null`, which the update wrote straight into the row - so a
 * refresh from a file whose read came back empty blanked a populated column.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>

const FILE_ID = '00000000-0000-0000-0000-0000000000f1'
const USER_ID = '00000000-0000-0000-0000-0000000000u1'
const OTHER_USER_ID = '00000000-0000-0000-0000-0000000000u2'

let row: Row = {}
let updatePayloads: Row[] = []
let versionInserts: Row[] = []

vi.mock('../client', () => ({
  getSupabaseClient: () => ({
    from(table: string) {
      if (table === 'file_version') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
              }),
            }),
          }),
          insert: async (values: Row) => {
            versionInserts.push(values)
            return { error: null }
          },
        }
      }
      if (table === 'activity') {
        return { insert: async () => ({ error: null }) }
      }
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: { ...row }, error: null }) }) }),
        update: (payload: Row) => ({
          eq: () => ({
            select: () => ({
              single: async () => {
                updatePayloads.push(payload)
                row = { ...row, ...payload }
                return { data: { ...row }, error: null }
              },
            }),
          }),
        }),
      }
    },
  }),
}))

vi.mock('../auth', () => ({
  getCurrentUserEmail: async () => 'someone@example.com',
}))

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { syncSolidWorksFileMetadata } = await import('./checkout')

beforeEach(() => {
  row = {
    id: FILE_ID,
    org_id: 'org-1',
    part_number: 'BR-100077',
    description: 'PCB, Fathom-X',
    revision: 'A',
    version: 3,
    content_hash: 'hash',
    file_size: 10,
    checked_out_by: USER_ID,
  }
  updatePayloads = []
  versionInserts = []
})

describe('syncSolidWorksFileMetadata', () => {
  it('leaves a populated column alone when the file holds nothing for it', async () => {
    const result = await syncSolidWorksFileMetadata(FILE_ID, USER_ID, {
      part_number: null,
      description: null,
    })

    expect(result.success).toBe(true)
    expect(updatePayloads).toHaveLength(0)
    expect(row.part_number).toBe('BR-100077')
    expect(row.description).toBe('PCB, Fathom-X')
  })

  it('treats a blank string as nothing, not as a clear', async () => {
    await syncSolidWorksFileMetadata(FILE_ID, USER_ID, { part_number: '', description: '   ' })

    expect(updatePayloads).toHaveLength(0)
    expect(row.part_number).toBe('BR-100077')
  })

  it('writes the field the file does hold and keeps the one it does not', async () => {
    await syncSolidWorksFileMetadata(FILE_ID, USER_ID, {
      part_number: 'BR-200000',
      description: null,
    })

    expect(updatePayloads).toHaveLength(1)
    expect(updatePayloads[0]).not.toHaveProperty('description')
    expect(row.part_number).toBe('BR-200000')
    expect(row.description).toBe('PCB, Fathom-X')
  })

  it('fills an empty column from the file', async () => {
    row.part_number = null
    row.description = ''

    await syncSolidWorksFileMetadata(FILE_ID, USER_ID, {
      part_number: 'BR-100077',
      description: 'PCB, Fathom-X',
    })

    expect(row.part_number).toBe('BR-100077')
    expect(row.description).toBe('PCB, Fathom-X')
  })

  it('snapshots the resulting values into the version it creates', async () => {
    row.checked_out_by = OTHER_USER_ID

    await syncSolidWorksFileMetadata(FILE_ID, USER_ID, {
      part_number: 'BR-200000',
      description: null,
    })

    expect(versionInserts).toHaveLength(1)
    expect(versionInserts[0]).toMatchObject({
      part_number: 'BR-200000',
      description: 'PCB, Fathom-X',
    })
  })
})
