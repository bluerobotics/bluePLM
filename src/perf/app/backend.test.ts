/**
 * The render-performance boot's fakes, checked without launching anything: what a signed-in boot
 * asks the backend and the disk, and that a throw from the strict test fake reaches the app as a
 * returned error.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import * as realClient from '@/lib/supabase/client'
import { buildSyntheticVault, FIXTURE_VAULT_ROOT } from '@/lib/loadPipelineFixtures'

import { createPerfBackend, PERF_ORG_ID, PERF_USER_ID, PERF_VAULT_ID } from './backend'
import { summarizeLongTasks } from './control'
import { createRestFetch, plainSelect, PERF_SUPABASE_URL } from './lenientClient'
import { createPerfElectron } from './perfElectron'
import * as perfClient from './supabaseClient'

type Result = { data: unknown; error: { message: string } | null }

const small = () => createPerfBackend(buildSyntheticVault(200))

describe('perf backend', () => {
  it('answers the vault list RPC with every synthetic row', async () => {
    const b = small()
    const { data, error } = (await b.client.rpc('vault_file_list', {
      p_org_id: PERF_ORG_ID,
      p_vault_id: PERF_VAULT_ID,
    })) as unknown as Result
    expect(error).toBeNull()
    expect(data).toHaveLength(200)
  })

  it('turns the strict fake throws into returned errors and counts them', async () => {
    const b = small()
    const embedded = (await b.client.from('app_user').select('id, team(name)').eq('id', PERF_USER_ID)) as unknown as Result
    expect(embedded.data).toBeNull()
    expect(embedded.error?.message).toMatch(/embedded select/)

    const noTable = (await b.client.from('no_such_table' as 'app_user').select('*')) as unknown as Result
    expect(noTable.error).not.toBeNull()

    const noRpc = (await b.client.rpc('org_get_auth_providers' as 'vault_file_list', {} as never)) as unknown as Result
    expect(noRpc.error?.message).toMatch(/no handler/)

    const unmodelledFilter = (await (
      b.client.from('app_user').select('id') as unknown as { perfUnmodelled: (...a: unknown[]) => PromiseLike<Result> }
    ).perfUnmodelled('id')) as Result
    expect(unmodelledFilter.error).not.toBeNull()
    expect(b.misses.size).toBeGreaterThanOrEqual(4)
  })

  it('serves plain selects and single rows', async () => {
    const b = small()
    const one = (await b.client.from('vault').select('id, name').eq('org_id', PERF_ORG_ID).single()) as unknown as Result
    expect(one.data).toEqual({ id: PERF_VAULT_ID, name: 'Perf Vault' })
  })

  it('announces the test user session the way supabase-js restores one', async () => {
    const b = small()
    const event = await new Promise<{ name: string; userId?: string }>((done) =>
      b.client.auth.onAuthStateChange((name, session) => done({ name, userId: session?.user.id })),
    )
    expect(event).toEqual({ name: 'INITIAL_SESSION', userId: PERF_USER_ID })
  })

  it('answers the raw-fetch profile and organization paths with an admin in the org', async () => {
    const b = small()
    const fetch = createRestFetch(b.client, b.misses)
    const response = await fetch(`${PERF_SUPABASE_URL}/rest/v1/app_user?select=id,email,role,org_id&id=eq.${PERF_USER_ID}`)
    expect(await response.json()).toEqual([
      { id: PERF_USER_ID, email: 'perf@example.com', role: 'admin', org_id: PERF_ORG_ID },
    ])
    const embedded = await fetch(`${PERF_SUPABASE_URL}/rest/v1/supplier_contact?select=*,supplier:supplier(id,name)&auth_user_id=eq.x`)
    expect(embedded.ok).toBe(true)
    expect(await embedded.json()).toEqual([])
    await expect(fetch('https://example.com/x')).rejects.toThrow(/no network/)
  })

  it('plainSelect drops embedded resources', () => {
    expect(plainSelect('*,supplier:supplier(id,name,code)')).toBe('*')
    expect(plainSelect('id, email ,team(name, members(id))')).toBe('id,email')
    expect(plainSelect(null)).toBe('*')
  })
})

describe('perf electron', () => {
  it('serves the synthetic vault as the disk, hashed like the server rows', async () => {
    const vault = buildSyntheticVault(200)
    const misses = new Map<string, number>()
    const api = createPerfElectron(vault, FIXTURE_VAULT_ROOT, misses, undefined)

    const scan = await api.listWorkingFiles()
    expect(scan.files).toHaveLength(vault.localEntries.length)
    expect(scan.files![0]).not.toBe(vault.localEntries[0])

    const file = vault.localEntries.find((e) => !e.isDirectory)!
    const hashes = await api.computeFileHashes([
      { path: file.path, relativePath: file.relativePath, size: file.size, mtime: 0 },
    ])
    const row = vault.serverRows.find((r) => r.file_path === file.relativePath)!
    expect(hashes.results).toEqual([{ relativePath: file.relativePath, hash: row.content_hash }])

    expect(await api.setWorkingDir(FIXTURE_VAULT_ROOT)).toEqual({ success: true, path: FIXTURE_VAULT_ROOT })
    expect(await api.extensions.nativePrune([])).toMatchObject({ success: false })
    // Unmodelled: an inert answer, recorded; subscriptions hand back an unsubscribe.
    const loose = api as unknown as Record<string, (...args: unknown[]) => unknown>
    expect(await loose.getRecentPerfThing()).toMatchObject({ success: false })
    expect(typeof loose.onPerfThingChanged(() => {})).toBe('function')
    expect([...misses.keys()]).toContain('electron.getRecentPerfThing')
    // The SolidWorks service fake comes from the test kit.
    expect(typeof api.solidworks.getProperties).toBe('function')
  })
})

describe('perf boot wiring', () => {
  it('stands in for every export of the real Supabase client module', () => {
    const real = Object.keys(realClient).sort()
    const perf = Object.keys(perfClient)
      .filter((k) => k !== 'installPerfSupabaseClient')
      .sort()
    expect(perf).toEqual(real)
  })

  it('is reachable only from perf.html: no shipped module imports the perf boot', () => {
    const root = resolve(__dirname, '../../..')
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) {
          if (name !== 'node_modules') walk(path)
          continue
        }
        if (!/\.(ts|tsx)$/.test(name) || /\.test\.tsx?$/.test(name)) continue
        const rel = relative(root, path).replace(/\\/g, '/')
        if (rel.startsWith('src/perf/app/')) continue
        if (/['"](@\/perf\/app|[./]+perf\/app)\//.test(readFileSync(path, 'utf8'))) offenders.push(rel)
      }
    }
    walk(join(root, 'src'))
    walk(join(root, 'electron'))
    expect(offenders).toEqual([])
    expect(readFileSync(join(root, 'index.html'), 'utf8')).not.toMatch(/perf/)
  })

  it('summarizes long tasks inside a window', () => {
    const tasks = [
      { start: 10, duration: 40 },
      { start: 100, duration: 120 },
      { start: 300, duration: 60 },
      { start: 900, duration: 500 },
    ]
    expect(summarizeLongTasks(tasks, 0, 800)).toEqual({ count: 3, totalBlockingMs: 80, longestMs: 120 })
  })
})
