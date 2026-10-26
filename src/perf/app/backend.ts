/**
 * The fake backend a render-performance session runs against: the test kit's typed Supabase,
 * seeded with an organization, a vault, the test user and the synthetic vault's file rows.
 *
 * Pure construction, no window: the perf boot (boot.ts) installs it, and backend.test.ts checks it
 * answers the calls a signed-in boot makes.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import { FIXTURE_USER_ID, type SyntheticVault } from '@/lib/loadPipelineFixtures'
import { EXPECTED_SCHEMA_VERSION } from '@/lib/schemaVersion'
import { FakeSupabase, type Row } from '@/test/fakeSupabase'
import type { Database } from '@/types/supabase'

import { createSession, lenientClient, type LenientClientHooks, type Misses, type PerfSession } from './lenientClient'

export const PERF_ORG_ID = '00000000-0000-4000-8000-0000000000a1'
export const PERF_VAULT_ID = '00000000-0000-4000-8000-0000000000b1'
export const PERF_USER_ID = FIXTURE_USER_ID
export const PERF_USER_EMAIL = 'perf@example.com'
/** buildSyntheticVault checks every other checked-out file out to this user. */
export const PERF_OTHER_USER_ID = 'user-other-0002'

export interface PerfBackend {
  db: FakeSupabase
  client: SupabaseClient<Database>
  session: PerfSession
  vault: SyntheticVault
  misses: Misses
  /** Auth events and the client's channel count, for the soak. */
  clientHooks: LenientClientHooks
  /** The full `files` row a realtime event carries for the vault's `index`-th file. */
  fileRow(index: number): Row
}

/** `vault` is built by the caller, so the boot can serve its disk before any app module loads. */
export function createPerfBackend(vault: SyntheticVault, misses: Misses = new Map()): PerfBackend {
  const db = new FakeSupabase()
  db.actorId = PERF_USER_ID
  db.actorEmail = PERF_USER_EMAIL
  db.now = Date.now()

  db.seed('organizations', { id: PERF_ORG_ID, name: 'Perf Org', slug: 'perf-org' })
  db.seed('users', {
    id: PERF_USER_ID,
    email: PERF_USER_EMAIL,
    full_name: 'Perf User',
    role: 'admin',
    org_id: PERF_ORG_ID,
  })
  db.seed('users', {
    id: PERF_OTHER_USER_ID,
    email: 'olive@example.com',
    full_name: 'Olive Other',
    role: 'engineer',
    org_id: PERF_ORG_ID,
  })
  db.seed('vaults', {
    id: PERF_VAULT_ID,
    org_id: PERF_ORG_ID,
    name: 'Perf Vault',
    slug: 'perf-vault',
    is_default: true,
  })
  db.seed('schema_version', { id: 1, version: EXPECTED_SCHEMA_VERSION, description: 'perf boot' })

  // The vault's rows are served by the RPC rather than seeded: 30k validated inserts would put the
  // fake's own cost into every boot. The RPC result is still deep-copied, like a response body.
  db.defineRpc('get_vault_files_fast', () => vault.serverRows)
  db.defineRpc('get_user_vault_access', () => [{ vault_id: PERF_VAULT_ID }])

  const fileRow = (index: number): Row => {
    const row = vault.serverRows[index]
    return {
      ...row,
      org_id: PERF_ORG_ID,
      vault_id: PERF_VAULT_ID,
      created_at: '2026-09-01T12:00:00.000Z',
      created_by: PERF_OTHER_USER_ID,
      updated_by: PERF_OTHER_USER_ID,
      deleted_at: null,
    }
  }

  const session = createSession(PERF_USER_ID, PERF_USER_EMAIL)
  const clientHooks = {} as LenientClientHooks
  const client = lenientClient(db, session, misses, clientHooks)
  return { db, client, session, vault, misses, clientHooks, fileRow }
}
