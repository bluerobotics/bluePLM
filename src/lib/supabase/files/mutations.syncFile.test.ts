/**
 * Syncing a file onto a path that is already taken in another case.
 *
 * `file_vault_id_file_path_idx` is unique on `(vault_id,
 * LOWER(file_path))` where `deleted_at IS NULL`, but syncFile's existence check
 * is byte-exact and stays that way: the check runs once per file at
 * CONCURRENT_OPERATIONS concurrency during a first check-in of a whole vault,
 * and paying for a case-insensitive lookup on every file would slow down the
 * overwhelmingly common case that never collides. So the miss is real, the
 * insert is refused with 23505, and the recovery has to happen there - once,
 * on the collision - by calling `get_active_file_by_path` (schema 100)
 * rather than by making the hot path pay for it.
 *
 * The fake client below implements the partial unique index and the RPC's
 * case-insensitive equality match rather than recording call shapes, so these
 * tests fail if the index reasoning is wrong.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

interface FileRow {
  id: string
  org_id: string
  vault_id: string
  file_path: string
  file_name: string
  version: number
  content_hash: string
  file_size: number
  revision: string
  part_number?: string | null
  description?: string | null
  workflow_state_id: string | null
  state: string | null
  deleted_at: string | null
  created_at: string
}

interface QueryError {
  code?: string
  message: string
}

type Row = Record<string, unknown>

const ORG = '00000000-0000-0000-0000-000000000001'
const VAULT = '00000000-0000-0000-0000-000000000002'
const USER = '00000000-0000-0000-0000-000000000003'
const NO_ROWS = 'PGRST116'
const UNIQUE_VIOLATION = '23505'

let table: FileRow[] = []
/** Makes the next files insert raise 23505 with nothing in the table to find. */
let phantomConflict = false
/** Every `get_active_file_by_path` call the run made, so the hot path can be shown to avoid it. */
let activeFileByPathCalls: Array<{ vaultId: string; filePath: string }> = []
/** file_path values passed to `.eq()`, i.e. the byte-exact lookups. */
let exactPathLookups: string[] = []
/** file_path patterns passed to `.ilike()` (5.0 removed the schema-99 ilike fallback). */
let ilikeLookups: string[] = []
let filesInsertAttempts = 0
/** Whether storage already holds the content for the hash being synced. */
let storageHasContent = true
let uploads = 0
/** Every storage list and upload, to check the content-addressed layout. */
let storageLists: Array<{ prefix: string; search?: string }> = []
let storageUploads: Array<{ path: string; body: Blob; options: unknown }> = []
/** What the next storage upload answers with. */
let uploadError: { message: string } | null = null
/** Every files insert payload, to check the defaults a new row gets. */
let insertPayloads: Row[] = []
/** Makes the next files insert fail with this error instead of applying the index. */
let insertError: QueryError | null = null
/** Makes every files update answer with this instead of applying its payload. */
let updateOutcome: { data: null; error: QueryError | null } | null = null
const logged: Array<{ level: string; message: string; data?: unknown }> = []

/** Turns a LIKE/ILIKE pattern (as `escapeLikePattern` produces it) into a case-insensitive RegExp. */
function likePatternToRegex(pattern: string): RegExp {
  let body = ''
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]
    if (char === '\\') {
      const next = pattern[i + 1]
      body += next.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      i++
    } else if (char === '%') {
      body += '.*'
    } else if (char === '_') {
      body += '.'
    } else {
      body += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`^${body}$`, 'i')
}

class SelectQuery {
  private predicates: Array<(row: FileRow) => boolean> = []
  private orderBy: Array<{ column: keyof FileRow; ascending: boolean }> = []
  private rowLimit: number | null = null

  eq(column: keyof FileRow, value: string): this {
    if (column === 'file_path') exactPathLookups.push(value)
    this.predicates.push((row) => row[column] === value)
    return this
  }

  /** The `.ilike()` fallback's own matcher - not the partial index's, so the test proves the pattern is right. */
  ilike(column: keyof FileRow, pattern: string): this {
    if (column === 'file_path') ilikeLookups.push(pattern)
    const regex = likePatternToRegex(pattern)
    this.predicates.push((row) => regex.test(String(row[column])))
    return this
  }

  is(column: keyof FileRow, value: null): this {
    this.predicates.push((row) => row[column] === value)
    return this
  }

  order(column: keyof FileRow, options?: { ascending?: boolean }): this {
    this.orderBy.push({ column, ascending: options?.ascending !== false })
    return this
  }

  limit(count: number): this {
    this.rowLimit = count
    return this
  }

  private run(): FileRow[] {
    let rows = table.filter((row) => this.predicates.every((predicate) => predicate(row)))
    if (this.orderBy.length > 0) {
      rows = [...rows].sort((left, right) => {
        for (const { column, ascending } of this.orderBy) {
          const leftValue = String(left[column] ?? '')
          const rightValue = String(right[column] ?? '')
          if (leftValue !== rightValue) {
            return (leftValue < rightValue ? -1 : 1) * (ascending ? 1 : -1)
          }
        }
        return 0
      })
    }
    if (this.rowLimit !== null) rows = rows.slice(0, this.rowLimit)
    return rows
  }

  /** PostgREST reports both "no rows" and "more than one row" as PGRST116. */
  async single(): Promise<{ data: FileRow | null; error: QueryError | null }> {
    const rows = this.run()
    // A copy, as PostgREST returns: a later update must not reach back into a row read earlier.
    if (rows.length === 1) return { data: { ...rows[0] }, error: null }
    return {
      data: null,
      error: { code: NO_ROWS, message: 'JSON object requested, multiple (or no) rows returned' },
    }
  }

  then<TResult1 = { data: FileRow[]; error: null }, TResult2 = never>(
    onFulfilled?:
      | ((value: { data: FileRow[]; error: null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve({ data: this.run(), error: null }).then(onFulfilled, onRejected)
  }
}

class FilesInsertQuery {
  constructor(private values: Row) {}

  select(): this {
    return this
  }

  /** The insert PostgREST would perform, under file_vault_id_file_path_idx. */
  async single(): Promise<{ data: FileRow | null; error: QueryError | null }> {
    filesInsertAttempts++
    if (insertError) {
      const error = insertError
      insertError = null
      return { data: null, error }
    }
    const filePath = String(this.values.file_path)
    const collides = table.some(
      (row) =>
        row.vault_id === this.values.vault_id &&
        row.deleted_at === null &&
        row.file_path.toLowerCase() === filePath.toLowerCase(),
    )
    if (collides || phantomConflict) {
      phantomConflict = false
      return {
        data: null,
        error: {
          code: UNIQUE_VIOLATION,
          message: 'duplicate key value violates unique constraint "file_vault_id_file_path_idx"',
        },
      }
    }
    const inserted: FileRow = {
      id: `id-${table.length + 1}`,
      org_id: String(this.values.org_id),
      vault_id: String(this.values.vault_id),
      file_path: filePath,
      file_name: String(this.values.file_name),
      version: Number(this.values.version),
      content_hash: String(this.values.content_hash),
      file_size: Number(this.values.file_size),
      revision: String(this.values.revision ?? ''),
      workflow_state_id: null,
      state: String(this.values.state ?? 'not_tracked'),
      deleted_at: null,
      created_at: `2026-09-09T00:00:0${table.length}.000Z`,
    }
    table.push(inserted)
    return { data: inserted, error: null }
  }
}

class UpdateQuery {
  private targetId: string | null = null

  constructor(private payload: Row) {}

  eq(column: string, value: string): this {
    if (column === 'id') this.targetId = value
    return this
  }

  select(): this {
    return this
  }

  async single(): Promise<{ data: FileRow | null; error: QueryError | null }> {
    if (updateOutcome) return updateOutcome
    const row = table.find((candidate) => candidate.id === this.targetId)
    if (!row) return { data: null, error: { code: NO_ROWS, message: 'no rows' } }
    Object.assign(row, this.payload)
    return { data: row, error: null }
  }
}

/** Every file_versions insert, so the snapshot a sync records can be read back. */
let versionInserts: Row[] = []

const versionsInsert = {
  then<T>(onFulfilled?: ((value: { data: null; error: null }) => T) | null) {
    return Promise.resolve({ data: null, error: null }).then(onFulfilled)
  },
}

const fakeClient = {
  storage: {
    from: () => ({
      // Report the content as already stored so the upload path is skipped -
      // this suite is about the database write, not about storage.
      list: async (prefix: string, options?: { search?: string }) => {
        storageLists.push({ prefix, search: options?.search })
        return { data: storageHasContent ? [{ name: 'hash' }] : [], error: null }
      },
      upload: async (path: string, body: Blob, options: unknown) => {
        uploads++
        storageUploads.push({ path, body, options })
        return { data: null, error: uploadError }
      },
    }),
  },
  from(name: string) {
    if (name === 'file_version') {
      return {
        insert: (values: Row) => {
          versionInserts.push(values)
          return versionsInsert
        },
      }
    }
    expect(name).toBe('file')
    return {
      select: () => new SelectQuery(),
      insert: (values: Row) => {
        insertPayloads.push(values)
        return new FilesInsertQuery(values)
      },
      update: (payload: Row) => new UpdateQuery(payload),
    }
  },
  /**
   * `get_active_file_by_path`'s server-side semantics: the active row whose
   * (vault_id, LOWER(file_path)) matches, per file_vault_id_file_path_idx.
   */
  async rpc(name: string, params: Record<string, unknown>) {
    expect(name).toBe('file_get_active_by_path')
    const vaultId = String(params.p_vault_id)
    const filePath = String(params.p_file_path)
    activeFileByPathCalls.push({ vaultId, filePath })

    const match = table.find(
      (row) =>
        row.vault_id === vaultId &&
        row.deleted_at === null &&
        row.file_path.toLowerCase() === filePath.toLowerCase(),
    )
    return { data: match ? [match] : [], error: null }
  },
}

vi.mock('../client', () => ({
  getSupabaseClient: () => fakeClient,
}))

vi.mock('../auth', () => ({
  getCurrentUser: async () => ({ user: { id: USER } }),
  getCurrentUserEmail: async () => 'someone@example.com',
}))

const { syncFile, isSyncFileExistsError } = await import('./mutations')

function existingFile(filePath: string, overrides: Partial<FileRow> = {}): FileRow {
  return {
    id: `id-${filePath.toLowerCase()}`,
    org_id: ORG,
    vault_id: VAULT,
    file_path: filePath,
    file_name: filePath.split('/').pop() ?? filePath,
    version: 3,
    content_hash: 'old-hash',
    file_size: 10,
    revision: 'A',
    workflow_state_id: null,
    state: 'wip',
    deleted_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function sync(filePath: string, metadata?: Parameters<typeof syncFile>[9]) {
  const fileName = filePath.split('/').pop() ?? filePath
  return syncFile(ORG, VAULT, USER, filePath, fileName, '.sldprt', 42, 'new-hash', '', metadata)
}

function warnings(): Array<{ message: string; data?: unknown }> {
  return logged.filter((entry) => entry.level === 'warn')
}

beforeEach(() => {
  table = []
  phantomConflict = false
  activeFileByPathCalls = []
  exactPathLookups = []
  ilikeLookups = []
  filesInsertAttempts = 0
  storageHasContent = true
  uploads = 0
  storageLists = []
  storageUploads = []
  uploadError = null
  insertPayloads = []
  insertError = null
  updateOutcome = null
  versionInserts = []
  logged.length = 0
  // syncFile logs through window.electronAPI when it is there; the test
  // environment is node, so it has to be supplied to read the warn back.
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      electronAPI: {
        log: (level: string, message: string, data?: unknown) => {
          logged.push({ level, message, data })
        },
      },
    },
  })
})

describe('syncing onto a path an active row already holds in another case', () => {
  it('updates that row instead of failing on every retry', async () => {
    // Before the fallback the insert was refused, the error propagated, the file
    // was counted as failed, and the next attempt repeated the same three steps
    // for as long as the two spellings existed.
    table.push(existingFile('Parts/BRACKET.SLDPRT'))

    const result = await sync('Parts/Bracket.SLDPRT')

    expect(result.error).toBeNull()
    expect(result.isNew).toBe(false)
    expect(table).toHaveLength(1)
    expect(table[0].version).toBe(4)
    expect(table[0].content_hash).toBe('new-hash')
    // The stored spelling is left alone; the row is the file, whatever case it
    // was first checked in under.
    expect(table[0].file_path).toBe('Parts/BRACKET.SLDPRT')
  })

  it('keeps the primary lookup byte-exact and pays for the RPC only on collision', async () => {
    // The reason this was deferred to the RPC: paying for a case-insensitive
    // lookup on every file during a bulk first check-in would slow down the
    // path that never collides. It must not appear on the path that finds the
    // row, nor on the path that inserts a new one.
    table.push(existingFile('Parts/Bracket.SLDPRT'))

    await sync('Parts/Bracket.SLDPRT')
    await sync('Parts/Other.SLDPRT')

    expect(exactPathLookups).toEqual(['Parts/Bracket.SLDPRT', 'Parts/Other.SLDPRT'])
    expect(activeFileByPathCalls).toHaveLength(0)
  })

  it('matches case-insensitively without treating underscore as a wildcard', async () => {
    // The old `.ilike()` fallback needed to escape `_` or `Part_Files.sldprt`
    // would also match `PartXFiles.sldprt`. get_active_file_by_path matches on
    // `LOWER(file_path) = LOWER($1)`, an equality comparison with no pattern
    // metacharacters to escape at all - this proves the RPC path still tells
    // the two apart.
    table.push(existingFile('PartXFiles.sldprt', { created_at: '2026-01-01T00:00:00.000Z' }))
    table.push(
      existingFile('PART_FILES.SLDPRT', { created_at: '2026-02-01T00:00:00.000Z', version: 7 }),
    )

    const result = await sync('Part_Files.sldprt')

    expect(result.error).toBeNull()
    expect(result.isNew).toBe(false)
    expect(activeFileByPathCalls).toEqual([{ vaultId: VAULT, filePath: 'Part_Files.sldprt' }])
    expect(table.find((row) => row.file_path === 'PART_FILES.SLDPRT')?.version).toBe(8)
    expect(table.find((row) => row.file_path === 'PartXFiles.sldprt')?.content_hash).toBe('old-hash')
  })

  it('inserts once and does not retry the refused insert', async () => {
    table.push(existingFile('Parts/BRACKET.SLDPRT'))

    await sync('Parts/Bracket.SLDPRT')

    expect(filesInsertAttempts).toBe(1)
  })
})

describe('a unique violation with no file behind it', () => {
  it('reports a real error rather than a null file with a null error', async () => {
    // The index is partial on `deleted_at IS NULL`, so 23505 said an active row
    // exists. Not reading it back means something else is wrong, and check-in
    // counts `{ file: null, error: null }` as a success it never got.
    phantomConflict = true

    const result = await sync('Parts/Bracket.SLDPRT')

    expect(result.file).toBeNull()
    expect(result.error).not.toBeNull()
    expect((result.error as QueryError).code).toBe(UNIQUE_VIOLATION)
    expect(result.isNew).toBe(false)
    expect(warnings()).toHaveLength(1)
    expect(warnings()[0].data).toMatchObject({
      filePath: 'Parts/Bracket.SLDPRT',
      vaultId: VAULT,
      orgId: ORG,
    })
  })

  it('stays quiet when the collision really was a collision', async () => {
    table.push(existingFile('Parts/BRACKET.SLDPRT'))

    await sync('Parts/Bracket.SLDPRT')

    expect(warnings()).toHaveLength(0)
  })
})

describe('uploading onto a row that already holds a part number and description', () => {
  // The upload command passes the overlay's value for every field, and for a row the client
  // never matched to the server that value is null: the client has nothing to say. The update
  // used to write that null into the row, blanking metadata the file and the vault still held.
  const held = { part_number: 'BR-100077', description: 'PCB, Fathom-X' }

  it('keeps both columns when the upload carries no value for them', async () => {
    table.push(existingFile('Parts/Bracket.SLDPRT', held))

    const result = await sync('Parts/Bracket.SLDPRT', {
      partNumber: null,
      description: null,
      revision: null,
    })

    expect(result.error).toBeNull()
    expect(table[0].version).toBe(4)
    expect(table[0].part_number).toBe('BR-100077')
    expect(table[0].description).toBe('PCB, Fathom-X')
  })

  it('keeps both columns when the upload carries empty strings', async () => {
    table.push(existingFile('Parts/Bracket.SLDPRT', held))

    await sync('Parts/Bracket.SLDPRT', { partNumber: '', description: '  ' })

    expect(table[0].part_number).toBe('BR-100077')
    expect(table[0].description).toBe('PCB, Fathom-X')
  })

  it('keeps both columns on the case-insensitive collision path too', async () => {
    table.push(existingFile('Parts/BRACKET.SLDPRT', held))

    await sync('Parts/Bracket.SLDPRT', { partNumber: null, description: null })

    expect(table[0].part_number).toBe('BR-100077')
    expect(table[0].description).toBe('PCB, Fathom-X')
  })

  it('still writes a value the upload does carry', async () => {
    table.push(existingFile('Parts/Bracket.SLDPRT', held))

    await sync('Parts/Bracket.SLDPRT', { partNumber: 'BR-200000', description: null })

    expect(table[0].part_number).toBe('BR-200000')
    expect(table[0].description).toBe('PCB, Fathom-X')
  })

  it('snapshots the row it kept into the new version', async () => {
    table.push(existingFile('Parts/Bracket.SLDPRT', held))

    await sync('Parts/Bracket.SLDPRT', { partNumber: null, description: null })

    expect(versionInserts).toHaveLength(1)
    expect(versionInserts[0]).toMatchObject({
      part_number: 'BR-100077',
      description: 'PCB, Fathom-X',
    })
  })
})

describe('creating a row only (insertOnly)', () => {
  // Cross-vault copy has already shown the user what exists at the destination. If the path was
  // taken in the meantime, replacing that file with a new version is the one outcome it must not
  // produce: it would overwrite a colleague's work with a copy.
  function syncInsertOnly(filePath: string, content: string | null = '') {
    const fileName = filePath.split('/').pop() ?? filePath
    return syncFile(
      ORG,
      VAULT,
      USER,
      filePath,
      fileName,
      '.sldprt',
      42,
      'new-hash',
      content,
      undefined,
      undefined,
      { insertOnly: true },
    )
  }

  it('creates the row when the path is free', async () => {
    const result = await syncInsertOnly('Parts/Bracket.SLDPRT')

    expect(result.error).toBeNull()
    expect(result.isNew).toBe(true)
    expect(table).toHaveLength(1)
  })

  it('refuses an exact match and leaves the existing row untouched', async () => {
    table.push(existingFile('Parts/Bracket.SLDPRT'))

    const result = await syncInsertOnly('Parts/Bracket.SLDPRT')

    expect(result.file).toBeNull()
    expect(isSyncFileExistsError(result.error)).toBe(true)
    expect(table).toHaveLength(1)
    expect(table[0].version).toBe(3)
    expect(table[0].content_hash).toBe('old-hash')
    expect(versionInserts).toHaveLength(0)
  })

  it('refuses a case-insensitive collision instead of updating that row', async () => {
    table.push(existingFile('Parts/BRACKET.SLDPRT'))

    const result = await syncInsertOnly('Parts/Bracket.SLDPRT')

    expect(result.file).toBeNull()
    expect(isSyncFileExistsError(result.error)).toBe(true)
    expect(table).toHaveLength(1)
    expect(table[0].version).toBe(3)
    expect(table[0].content_hash).toBe('old-hash')
  })

  it('does not call its refusal a failure worth a warning', async () => {
    table.push(existingFile('Parts/Bracket.SLDPRT'))

    await syncInsertOnly('Parts/Bracket.SLDPRT')

    expect(warnings()).toHaveLength(0)
  })

  it('leaves the default behaviour an upsert', async () => {
    table.push(existingFile('Parts/Bracket.SLDPRT'))

    const result = await sync('Parts/Bracket.SLDPRT')

    expect(result.error).toBeNull()
    expect(result.isNew).toBe(false)
    expect(table[0].version).toBe(4)
  })

  it('does not mistake an ordinary failure for the refusal', async () => {
    phantomConflict = true

    const result = await syncInsertOnly('Parts/Bracket.SLDPRT')

    expect(result.error).not.toBeNull()
    expect(isSyncFileExistsError(result.error)).toBe(false)
  })
})

describe('content already in storage (null base64)', () => {
  it('creates the row without uploading', async () => {
    const result = await syncFile(
      ORG,
      VAULT,
      USER,
      'Parts/Bracket.SLDPRT',
      'Bracket.SLDPRT',
      '.sldprt',
      42,
      'new-hash',
      null,
    )

    expect(result.error).toBeNull()
    expect(result.isNew).toBe(true)
    expect(uploads).toBe(0)
    expect(table).toHaveLength(1)
  })

  it('fails without creating a row when the content is not stored after all', async () => {
    storageHasContent = false

    const result = await syncFile(
      ORG,
      VAULT,
      USER,
      'Parts/Bracket.SLDPRT',
      'Bracket.SLDPRT',
      '.sldprt',
      42,
      'new-hash',
      null,
    )

    expect(result.file).toBeNull()
    expect(result.error).not.toBeNull()
    expect(uploads).toBe(0)
    expect(table).toHaveLength(0)
    expect(filesInsertAttempts).toBe(0)
  })
})

// Pinned by mutation testing (.cursor/plans/test-mutation-report.md): what syncFile writes,
// where, and what it does when a write fails.
function syncBytes(filePath: string, base64: string) {
  const fileName = filePath.split('/').pop() ?? filePath
  return syncFile(ORG, VAULT, USER, filePath, fileName, '.sldprt', 2, 'ab12cd', base64)
}

function syncInsertOnlyAt(filePath: string) {
  const fileName = filePath.split('/').pop() ?? filePath
  return syncFile(ORG, VAULT, USER, filePath, fileName, '.sldprt', 42, 'new-hash', '', undefined, undefined, {
    insertOnly: true,
  })
}

describe('storing new content', () => {
  beforeEach(() => {
    storageHasContent = false
  })

  it('looks the hash up and uploads it under org/first-two-chars/hash, never overwriting', async () => {
    const result = await syncBytes('Parts/Bracket.SLDPRT', btoa('hi'))

    expect(result.error).toBeNull()
    expect(storageLists).toEqual([{ prefix: `${ORG}/ab`, search: 'ab12cd' }])
    expect(storageUploads).toHaveLength(1)
    expect(storageUploads[0].path).toBe(`${ORG}/ab/ab12cd`)
    expect(storageUploads[0].options).toMatchObject({ upsert: false })
  })

  it('uploads the decoded bytes, not the base64 text', async () => {
    await syncBytes('Parts/Bracket.SLDPRT', btoa('hi'))

    const bytes = new Uint8Array(await storageUploads[0].body.arrayBuffer())
    expect([...bytes]).toEqual([104, 105])
  })

  it('fails without a row when the upload is refused', async () => {
    uploadError = { message: 'new row violates row-level security policy' }

    const result = await syncBytes('Parts/Bracket.SLDPRT', btoa('hi'))

    expect(result.file).toBeNull()
    expect(result.error).toMatchObject({ message: 'new row violates row-level security policy' })
    expect(filesInsertAttempts).toBe(0)
  })

  it('carries on when another upload stored the same content first', async () => {
    uploadError = { message: 'The resource already exists' }

    const result = await syncBytes('Parts/Bracket.SLDPRT', btoa('hi'))

    expect(result.error).toBeNull()
    expect(result.isNew).toBe(true)
  })
})

describe('updating an existing row', () => {
  it('records the new version with the row state, defaulting a missing state', async () => {
    table.push(existingFile('Parts/Bracket.SLDPRT', { state: null }))

    await sync('Parts/Bracket.SLDPRT')

    expect(versionInserts).toEqual([
      expect.objectContaining({
        file_id: 'id-parts/bracket.sldprt',
        version: 4,
        state: 'not_tracked',
        content_hash: 'new-hash',
      }),
    ])
  })

  it('keeps the row state in the version when it has one', async () => {
    table.push(existingFile('Parts/Bracket.SLDPRT'))

    await sync('Parts/Bracket.SLDPRT')

    expect(versionInserts[0]).toMatchObject({ state: 'wip' })
  })

  it('writes a carried description and property bag, and keeps the bag when none is carried', async () => {
    table.push(existingFile('Parts/Bracket.SLDPRT', { description: 'Old' }))

    await sync('Parts/Bracket.SLDPRT', { description: 'New', customProperties: { Material: 'Al' } })
    expect(table[0]).toMatchObject({ description: 'New', custom_properties: { Material: 'Al' } })

    await sync('Parts/Bracket.SLDPRT', {})
    expect(table[0]).toMatchObject({ description: 'New', custom_properties: { Material: 'Al' } })
  })

  it.each([
    ['an error', { data: null, error: { message: 'permission denied' } }],
    ['no row', { data: null, error: null }],
  ])('fails and records no version when the update returns %s', async (_label, outcome) => {
    table.push(existingFile('Parts/Bracket.SLDPRT'))
    updateOutcome = outcome

    const result = await sync('Parts/Bracket.SLDPRT')

    expect(result.file).toBeNull()
    expect(result.error).not.toBeNull()
    expect(versionInserts).toEqual([])
  })
})

describe('inserting a new row', () => {
  it('starts untracked at version 1 with empty metadata when none is carried', async () => {
    await sync('Parts/Bracket.SLDPRT')

    expect(insertPayloads[0]).toMatchObject({
      state: 'not_tracked',
      version: 1,
      revision: '',
      part_number: null,
      description: null,
      custom_properties: {},
      created_by: USER,
    })
  })

  it('writes the metadata it does carry', async () => {
    await sync('Parts/Bracket.SLDPRT', {
      revision: 'B',
      partNumber: 'BR-1',
      description: 'Bracket',
      customProperties: { Material: 'Al' },
    })

    expect(insertPayloads[0]).toMatchObject({
      revision: 'B',
      part_number: 'BR-1',
      description: 'Bracket',
      custom_properties: { Material: 'Al' },
    })
  })

  it('does not treat an ordinary insert error as a case collision', async () => {
    // A row in another case is there, but the insert failed for its own reason: that row must
    // not be updated in its place.
    table.push(existingFile('Parts/BRACKET.SLDPRT'))
    insertError = { code: '42501', message: 'permission denied for table files' }

    const result = await sync('Parts/Bracket.SLDPRT')

    expect(result.error).toMatchObject({ code: '42501' })
    expect(activeFileByPathCalls).toEqual([])
    expect(table[0].version).toBe(3)
  })

  it('reports the insert-only refusal as not new', async () => {
    table.push(existingFile('Parts/Bracket.SLDPRT'))

    const exact = await syncInsertOnlyAt('Parts/Bracket.SLDPRT')
    const cased = await syncInsertOnlyAt('Parts/bracket.SLDPRT')

    expect(isSyncFileExistsError(exact.error)).toBe(true)
    expect(exact.isNew).toBe(false)
    expect(isSyncFileExistsError(cased.error)).toBe(true)
    expect(cased.isNew).toBe(false)
  })
})

describe('isSyncFileExistsError', () => {
  it('is false for anything that is not the refusal', () => {
    expect(isSyncFileExistsError(null)).toBe(false)
    expect(isSyncFileExistsError(undefined)).toBe(false)
    expect(isSyncFileExistsError('SYNC_FILE_EXISTS')).toBe(false)
    expect(isSyncFileExistsError({ code: '23505' })).toBe(false)
  })
})
