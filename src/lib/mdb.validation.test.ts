import { afterEach, describe, expect, it, vi } from 'vitest'

import { MDB_API_VERSION, validateMdbConfig } from './mdb'

describe('MariaDB backend compatibility', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('accepts the supported MDB API contract', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            runtime: 'php',
            supabase: false,
            apiVersion: MDB_API_VERSION,
          }),
          { status: 200 },
        ),
      ),
    )

    await expect(validateMdbConfig('https://mdb.example.test')).resolves.toEqual({
      valid: true,
    })
  })

  it('rejects an older MDB API before settings pages can call missing endpoints', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, runtime: 'php', supabase: false }), {
          status: 200,
        }),
      ),
    )

    await expect(validateMdbConfig('https://mdb.example.test')).resolves.toEqual({
      valid: false,
      error: `The MariaDB backend is outdated. Install API version ${MDB_API_VERSION} or newer.`,
    })
  })

  it('rejects a different backend even if it reports an API version', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ supabase: true, apiVersion: MDB_API_VERSION }), {
          status: 200,
        }),
      ),
    )

    await expect(validateMdbConfig('https://mdb.example.test')).resolves.toEqual({
      valid: false,
      error: 'This is not a BluePLM MariaDB backend.',
    })
  })
})
