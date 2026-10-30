import { beforeEach, describe, expect, it, vi } from 'vitest'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

interface RecordedQuery {
  table: string
  filters: Array<{ op: string; column: string; value: unknown }>
}

const mocks = vi.hoisted(() => {
  let userResults: Array<Promise<unknown>> = []
  const queries: RecordedQuery[] = []

  const setUserResults = (results: Array<Promise<unknown>>) => {
    userResults = [...results]
  }

  const createQuery = (table: string) => {
    const recorded: RecordedQuery = { table, filters: [] }
    queries.push(recorded)
    const result =
      table === 'app_user'
        ? (userResults.shift() ?? Promise.resolve({ data: [], error: null }))
        : Promise.resolve({ data: [], error: null })
    const query = {
      select: () => query,
      in: (column: string, value: unknown) => {
        recorded.filters.push({ op: 'in', column, value })
        return query
      },
      not: () => query,
      eq: (column: string, value: unknown) => {
        recorded.filters.push({ op: 'eq', column, value })
        return query
      },
      single: () => query,
      maybeSingle: () => query,
      then<TResult1 = unknown, TResult2 = never>(
        onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ): PromiseLike<TResult1 | TResult2> {
        return result.then(onfulfilled, onrejected)
      },
    }
    return query
  }

  const client = {
    from: vi.fn((table: string) => createQuery(table)),
  }

  return { client, queries, setUserResults }
})

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient: () => mocks.client,
}))

import { getCheckedOutUsers } from './queries'

const FIRST_FILE_ID = 'file-a'
const FIRST_OWNER_ID = 'owner-a'
const SECOND_OWNER_ID = 'owner-b'
const ORG_ID = 'org-a'
const VAULT_ID = 'vault-a'
const SCOPE = { orgId: ORG_ID, vaultId: VAULT_ID }

const VAULT_CHECKOUT_COUNT = 751
const VAULT_OWNER_COUNT = 11
const OWNER_BATCH_SIZE = 100

function profileFor(ownerId: string) {
  return {
    id: ownerId,
    email: `${ownerId}@example.test`,
    full_name: `Name ${ownerId}`,
    avatar_url: null,
  }
}

function inValues(query: RecordedQuery): unknown[] {
  const filter = query.filters.find((f) => f.op === 'in' && f.column === 'id')
  return Array.isArray(filter?.value) ? filter.value : []
}

describe('getCheckedOutUsers', () => {
  beforeEach(() => {
    mocks.client.from.mockClear()
    mocks.queries.length = 0
    mocks.setUserResults([])
  })

  it('looks profiles up by owner without querying files', async () => {
    const owners = Array.from({ length: VAULT_CHECKOUT_COUNT }, (_, index) => ({
      fileId: `file-${index}`,
      ownerId: `owner-${index % VAULT_OWNER_COUNT}`,
    }))
    const ownerIds = [...new Set(owners.map((o) => o.ownerId))]
    mocks.setUserResults([Promise.resolve({ data: ownerIds.map(profileFor), error: null })])

    const result = await getCheckedOutUsers(owners, SCOPE)

    expect(mocks.queries.map((q) => q.table)).toEqual(['app_user'])
    expect(inValues(mocks.queries[0])).toHaveLength(VAULT_OWNER_COUNT)
    expect(mocks.queries[0].filters).toContainEqual({ op: 'eq', column: 'org_id', value: ORG_ID })
    expect(result.error).toBeNull()
    expect(Object.keys(result.users)).toHaveLength(VAULT_CHECKOUT_COUNT)
    for (const { fileId, ownerId } of owners) {
      expect(result.users[fileId]).toEqual(profileFor(ownerId))
    }
  })

  it('builds the request from owner IDs and scope alone', async () => {
    mocks.setUserResults([Promise.resolve({ data: [profileFor(FIRST_OWNER_ID)], error: null })])

    await getCheckedOutUsers([{ fileId: FIRST_FILE_ID, ownerId: FIRST_OWNER_ID }], SCOPE)

    expect(mocks.queries).toEqual([
      {
        table: 'app_user',
        filters: [
          { op: 'in', column: 'id', value: [FIRST_OWNER_ID] },
          { op: 'eq', column: 'org_id', value: ORG_ID },
        ],
      },
    ])
  })

  it('never puts more than the batch size of owner IDs in one request', async () => {
    const ownerTotal = OWNER_BATCH_SIZE * 2 + 1
    const owners = Array.from({ length: ownerTotal }, (_, index) => ({
      fileId: `file-${index}`,
      ownerId: `owner-${String(index).padStart(4, '0')}`,
    }))

    await getCheckedOutUsers(owners, SCOPE)

    expect(mocks.queries).toHaveLength(3)
    for (const query of mocks.queries) {
      expect(inValues(query).length).toBeLessThanOrEqual(OWNER_BATCH_SIZE)
    }
  })

  it('keeps profiles from batches that succeeded when another batch fails', async () => {
    const owners = Array.from({ length: OWNER_BATCH_SIZE + 1 }, (_, index) => ({
      fileId: `file-${index}`,
      ownerId: `owner-${String(index).padStart(4, '0')}`,
    }))
    const sortedOwnerIds = owners.map((o) => o.ownerId).sort()
    const failure = { message: 'Bad Request' }
    mocks.setUserResults([
      Promise.resolve({ data: null, error: failure }),
      Promise.resolve({ data: [profileFor(sortedOwnerIds[OWNER_BATCH_SIZE])], error: null }),
    ])

    const result = await getCheckedOutUsers(owners, SCOPE)

    expect(result.error).toBe(failure)
    expect(Object.keys(result.users)).toEqual([`file-${OWNER_BATCH_SIZE}`])
  })

  it('leaves out a file whose owner has no user row', async () => {
    mocks.setUserResults([Promise.resolve({ data: [profileFor(FIRST_OWNER_ID)], error: null })])

    const result = await getCheckedOutUsers(
      [
        { fileId: FIRST_FILE_ID, ownerId: FIRST_OWNER_ID },
        { fileId: 'file-b', ownerId: SECOND_OWNER_ID },
      ],
      SCOPE,
    )

    expect(result).toEqual({ users: { [FIRST_FILE_ID]: profileFor(FIRST_OWNER_ID) }, error: null })
  })

  it('returns a users error as an error', async () => {
    const failure = { message: 'permission denied' }
    mocks.setUserResults([Promise.resolve({ data: null, error: failure })])

    await expect(
      getCheckedOutUsers([{ fileId: FIRST_FILE_ID, ownerId: FIRST_OWNER_ID }], SCOPE),
    ).resolves.toEqual({ users: {}, error: failure })
  })

  it('does not attach a profile whose id differs from the file owner', async () => {
    mocks.setUserResults([Promise.resolve({ data: [profileFor(SECOND_OWNER_ID)], error: null })])

    await expect(
      getCheckedOutUsers([{ fileId: FIRST_FILE_ID, ownerId: FIRST_OWNER_ID }], SCOPE),
    ).resolves.toEqual({ users: {}, error: null })
  })

  it('deduplicates an in-flight lookup while its transport is deferred', async () => {
    const userResponse = deferred<{ data: ReturnType<typeof profileFor>[]; error: null }>()
    mocks.setUserResults([userResponse.promise])

    const owners = [{ fileId: FIRST_FILE_ID, ownerId: FIRST_OWNER_ID }]
    const firstRequest = getCheckedOutUsers(owners, SCOPE)
    const secondRequest = getCheckedOutUsers(owners, SCOPE)

    expect(mocks.client.from).toHaveBeenCalledTimes(1)

    userResponse.resolve({ data: [profileFor(FIRST_OWNER_ID)], error: null })

    await expect(secondRequest).resolves.toEqual({
      users: { [FIRST_FILE_ID]: profileFor(FIRST_OWNER_ID) },
      error: null,
    })
    await expect(firstRequest).resolves.toEqual(await secondRequest)
    expect(mocks.client.from).toHaveBeenCalledTimes(1)
  })
})
