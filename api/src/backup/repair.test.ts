/**
 * Repairing damaged or missing vault content against the typed in-memory Supabase (storage and
 * the schema-503 finding table, added to the fake's shape here) and an in-memory backup
 * repository: nothing that does not hash to the name is ever written, a damaged object's bytes
 * are kept under their own hash, and a repair closes its finding.
 */

import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { FakeSupabase } from '../../../src/test/fakeSupabase.js'
import { seededBytes, SimulatedOrg } from '../../test/backupSim.js'
import { runServerBackup } from './engine.js'
import { MemoryObjectStore } from './objectStore.js'
import { BackupRepository } from './repository.js'
import { RepairError, repairFromUpload, restoreFromBackup, snapshotsHolding, vaultObjectPath, writeVaultObject } from './repair.js'

const ORG = '00000000-0000-4000-8000-0000000000c1'
const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex')

function fake(): FakeSupabase {
  const db = new FakeSupabase()
  ;(db.schema.tables as Map<string, unknown>).set('vault_object_issue', {
    columns: new Set(['org_id', 'content_hash', 'status', 'storage_name', 'resolution']),
    requiredOnInsert: new Set<string>(),
  })
  db.defineRpc(
    'backup_issue_record_repair',
    (a) => {
      const row = db.rows('vault_object_issue' as never).find((r) => r.content_hash === a.p_content_hash)
      if (!row || row.status === 'repaired') return false
      row.status = 'repaired'
      row.resolution = a.p_resolution
      return true
    },
    { untyped: true },
  )
  return db
}

async function stored(db: FakeSupabase, path: string): Promise<Buffer | null> {
  const { data } = await db.client.storage.from('vault').download(path)
  return data ? Buffer.from(await data.arrayBuffer()) : null
}

describe('writeVaultObject', () => {
  it('refuses bytes that do not hash to the name, and writes nothing', async () => {
    const db = fake()
    const good = seededBytes('good', 1000)
    await expect(
      writeVaultObject(db.client as never, ORG, sha(good), seededBytes('other', 1000), null),
    ).rejects.toMatchObject({ code: 'HASH_MISMATCH', statusCode: 422 })
    expect(await stored(db, vaultObjectPath(ORG, sha(good)))).toBeNull()
  })

  it('replaces a damaged object, keeping its bytes under their own hash', async () => {
    const db = fake()
    const good = seededBytes('v2', 1500)
    const nextVersion = seededBytes('v3', 1600)
    const path = vaultObjectPath(ORG, sha(good))
    await db.client.storage.from('vault').upload(path, nextVersion)
    await writeVaultObject(db.client as never, ORG, sha(good), good, path)
    expect(sha((await stored(db, path))!)).toBe(sha(good))
    expect(await stored(db, vaultObjectPath(ORG, sha(nextVersion)))).toEqual(nextVersion)
  })
})

describe('repairs close their finding', () => {
  it('restores from the server backup', async () => {
    const db = fake()
    const org = new SimulatedOrg()
    const hash = org.checkIn('Parts/a.sldprt', seededBytes('a', 3000))
    const repo = await BackupRepository.init(new MemoryObjectStore(), 'pw', { N: 1024 })
    const run = await runServerBackup({ repo, source: org, orgId: org.orgId, trigger: 'sandbox' })
    db.rows('vault_object_issue' as never).push({ org_id: ORG, content_hash: hash, status: 'open', storage_name: null, resolution: null })

    expect(await snapshotsHolding(repo, hash)).toEqual([{ id: run.snapshotId, createdAt: run.manifest.createdAt }])
    await restoreFromBackup(db.client as never, repo, ORG, hash, 'admin-1')
    expect(sha((await stored(db, vaultObjectPath(ORG, hash)))!)).toBe(hash)
    expect(db.rows('vault_object_issue' as never)[0]).toMatchObject({ status: 'repaired', resolution: 'restored_from_backup' })
    await expect(restoreFromBackup(db.client as never, repo, ORG, hash, 'admin-1')).rejects.toMatchObject({ code: 'ALREADY_REPAIRED' })
  })

  it('says so when the backup does not hold the content', async () => {
    const db = fake()
    const hash = sha(seededBytes('never-backed-up', 10))
    db.rows('vault_object_issue' as never).push({ org_id: ORG, content_hash: hash, status: 'open', storage_name: null, resolution: null })
    const repo = await BackupRepository.init(new MemoryObjectStore(), 'pw', { N: 1024 })
    await expect(restoreFromBackup(db.client as never, repo, ORG, hash, 'admin-1')).rejects.toBeInstanceOf(RepairError)
    expect(db.rows('vault_object_issue' as never)[0].status).toBe('open')
  })

  it("stores a desktop's copy only when it hashes to the name", async () => {
    const db = fake()
    const good = seededBytes('desk', 2222)
    const hash = sha(good)
    db.rows('vault_object_issue' as never).push({ org_id: ORG, content_hash: hash, status: 'open', storage_name: null, resolution: null })
    await expect(repairFromUpload(db.client as never, ORG, hash, seededBytes('wrong', 2222), 'admin-1')).rejects.toMatchObject({
      code: 'HASH_MISMATCH',
    })
    expect(db.rows('vault_object_issue' as never)[0].status).toBe('open')
    await repairFromUpload(db.client as never, ORG, hash, good, 'admin-1')
    expect(db.rows('vault_object_issue' as never)[0]).toMatchObject({ status: 'repaired', resolution: 'uploaded_from_desktop' })
  })
})
