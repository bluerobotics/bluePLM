/**
 * Inspection table data layer: the highest-used balloon number (live rows + every snapshot)
 * and the source binding columns (schema 103) surviving a save.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getHighestUsedBalloonNumber, maxNumericBalloonNumber, saveInspectionRows } from './inspection'
import { emptyRowValues } from './inspectionRows'

import type { InspectionRowInput } from './inspection'

type Row = Record<string, unknown>

const FILE_ID = 'file-1'
const USER_ID = 'user-1'

let liveRows: Row[] = []
let snapshotRows: Row[] = []
let snapshotCalls: { eq: [string, unknown][]; range: [number, number] | null }[] = []
let upserts: Row[][] = []

function selectQuery(table: string) {
  const eqs: [string, unknown][] = []
  let range: [number, number] | null = null
  const resolve = () => {
    if (table === 'file') return { data: { checked_out_by: USER_ID }, error: null }
    if (table === 'inspection_characteristic') return { data: liveRows, error: null }
    snapshotCalls.push({ eq: eqs, range })
    const [from, to] = range ?? [0, snapshotRows.length - 1]
    return { data: snapshotRows.slice(from, to + 1), error: null }
  }
  const query = {
    eq(column: string, value: unknown) {
      eqs.push([column, value])
      return query
    },
    order() {
      return query
    },
    range(from: number, to: number) {
      range = [from, to]
      return query
    },
    async single() {
      return resolve()
    },
    then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve(resolve()).then(onFulfilled, onRejected)
    },
  }
  return query
}

function deleteQuery() {
  const query = {
    eq() {
      return query
    },
    not() {
      return query
    },
    then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve({ error: null }).then(onFulfilled, onRejected)
    },
  }
  return query
}

vi.mock('../client', () => ({
  getSupabaseClient: () => ({
    from: (table: string) => ({
      select: () => selectQuery(table),
      delete: () => deleteQuery(),
      upsert: async (payload: Row[]) => {
        upserts.push(payload)
        return { error: null }
      },
    }),
  }),
}))

beforeEach(() => {
  liveRows = []
  snapshotRows = []
  snapshotCalls = []
  upserts = []
})

describe('maxNumericBalloonNumber', () => {
  it('returns the largest plain integer and ignores everything else', () => {
    expect(maxNumericBalloonNumber(['3', ' 12 ', '7', null, undefined, '', '40A', '1.5', '-2', 'x'])).toBe(12)
  })

  it('returns 0 when nothing is numeric', () => {
    expect(maxNumericBalloonNumber([])).toBe(0)
    expect(maxNumericBalloonNumber(['A', null, '  '])).toBe(0)
  })
})

describe('getHighestUsedBalloonNumber', () => {
  it('takes the max over live rows and every snapshot, so a retired number is not reused', async () => {
    liveRows = [{ balloon_number: '4' }, { balloon_number: '2' }]
    snapshotRows = [{ id: 'a', balloon_number: '9' }, { id: 'b', balloon_number: 'note' }]

    const result = await getHighestUsedBalloonNumber(FILE_ID)

    expect(result).toEqual({ success: true, highest: 9 })
    expect(snapshotCalls[0].eq).toEqual([['file_version.file_id', FILE_ID]])
  })

  it('pages through snapshot history past the row cap', async () => {
    snapshotRows = Array.from({ length: 1500 }, (_, i) => ({ id: `s${i}`, balloon_number: String(i + 1) }))

    const result = await getHighestUsedBalloonNumber(FILE_ID)

    expect(result.highest).toBe(1500)
    expect(snapshotCalls.map((c) => c.range)).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })
})

describe('saveInspectionRows', () => {
  it('writes source_key, source_sheet and source_view with the row id', async () => {
    const row: InspectionRowInput = {
      ...emptyRowValues(0),
      id: 'row-1',
      balloon_number: '1',
      source_key: 'abc123',
      source_sheet: 'Sheet1',
      source_view: 'Drawing View1',
    }

    const result = await saveInspectionRows(FILE_ID, 'org-1', USER_ID, [row])

    expect(result.success).toBe(true)
    expect(upserts[0][0]).toMatchObject({
      id: 'row-1',
      source_key: 'abc123',
      source_sheet: 'Sheet1',
      source_view: 'Drawing View1',
    })
  })
})
