import { afterEach, expect, it, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { createMdbAuthAuthority } from './mdbAuthAuthority'
import {
  createMdbEncryptedAuthRecordStore,
  createSafeStorageMdbAuthPersistence,
} from './mdbAuthPersistence'

const cleanup = vi.hoisted(() => ({ failTemp: false }))
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    rm: async (target: Parameters<typeof actual.rm>[0], options?: Parameters<typeof actual.rm>[1]) => {
      if (cleanup.failTemp && String(target).endsWith('.tmp')) throw new Error('temporary cleanup denied')
      return actual.rm(target, options)
    },
  }
})

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true })
})
it('confirms absence after clear and handles a previously missing record', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mdb-auth-test-'))
  roots.push(root)
  const file = path.join(root, 'session.enc')
  const store = createMdbEncryptedAuthRecordStore(file)
  await store.clear()
  await store.write(new Uint8Array([1, 2, 3]), () => true)
  await store.clear()
  expect(await createMdbEncryptedAuthRecordStore(file).read()).toBeNull()
})
it('returns committed after publication even if removing the temporary path would fail', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mdb-auth-published-'))
  roots.push(root)
  const file = path.join(root, 'session.enc')
  cleanup.failTemp = true
  try {
    const store = createMdbEncryptedAuthRecordStore(file)
    await expect(store.write(new Uint8Array([1, 2, 3]), () => true)).resolves.toBe(true)
    expect(await store.read()).toEqual(new Uint8Array([1, 2, 3]))
    await expect(store.write(new Uint8Array([4]), () => false)).rejects.toThrow('temporary cleanup denied')
    expect(await store.read()).toEqual(new Uint8Array([1, 2, 3]))
  } finally {
    cleanup.failTemp = false
  }
})
it('fails closed when encryption is unavailable and propagates clear IO errors', async () => {
  const store = {
    read: async () => null,
    write: async () => true,
    clear: async () => {
      throw new Error('IO failure')
    },
  }
  const persistence = createSafeStorageMdbAuthPersistence(
    {
      isEncryptionAvailable: () => false,
      encryptString: () => Buffer.alloc(0),
      decryptString: () => '',
    },
    store,
  )
  await expect(persistence.load()).resolves.toBeNull()
  await expect(
    persistence.save({
      serverUrl: 'https://example.test/',
      bearerToken: 'test',
      expiresAt: '2099-01-01T00:00:00Z',
      principal: {
        userId: 'u',
        organizationId: 'o',
        email: 'a',
        displayName: 'A',
        role: 'member',
        createdAt: '2026-01-01T00:00:00Z',
      },
      organization: { id: 'o', name: 'O', slug: 'o', createdAt: '2026-01-01T00:00:00Z' },
    }, () => true),
  ).rejects.toThrow('encryption unavailable')
  await expect(persistence.clear()).rejects.toThrow('IO failure')
})
it('does not restore after confirmed filesystem clear with a fresh authority', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mdb-auth-restart-'))
  roots.push(root)
  const file = path.join(root, 'session.enc')
  const crypto = {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  }
  const principal = {
    userId: '11111111-1111-4111-8111-111111111111',
    organizationId: '22222222-2222-4222-8222-222222222222',
    email: 'a@example.test',
    displayName: 'A',
    role: 'member',
    createdAt: '2026-01-01T00:00:00Z',
  }
  const organization = {
    id: principal.organizationId,
    name: 'Org',
    slug: 'org',
    createdAt: principal.createdAt,
  }
  const fetchImpl = async (url: URL) => {
    if (url.pathname === '/health')
      return Response.json({ ok: true, runtime: 'php', supabase: false, apiVersion: 2 })
    if (url.pathname === '/auth/login')
      return Response.json({ token: 'synthetic', expiresAt: '2099-01-01T00:00:00Z' })
    if (url.pathname === '/auth/me') return Response.json({ user: principal })
    if (url.pathname === '/organizations/current') return Response.json({ organization })
    throw Error('unexpected request')
  }
  const create = () =>
    createMdbAuthAuthority({
      confirmServer: async () => true,
      fetchImpl,
      persistence: createSafeStorageMdbAuthPersistence(
        crypto,
        createMdbEncryptedAuthRecordStore(file),
      ),
    })
  const first = create()
  await first.signIn({ serverUrl: 'https://example.test/', email: 'a', password: 'b' })
  first.dispose()
  const second = create()
  await second.restore()
  expect(second.state()).toMatchObject({ status: 'verified' })
  await second.signOut()
  second.dispose()
  const third = create()
  await third.restore()
  expect(third.state()).toEqual({ status: 'signed-out' })
  third.dispose()
})

it.each(['restore', 'dispose', 'newer-authority'] as const)(
  'does not publish a staged invalidated save: %s',
  async (operation) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mdb-auth-race-'))
    roots.push(root)
    const file = path.join(root, 'session.enc')
    const key = randomBytes(32)
    const safeStorage = {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => {
        const iv = randomBytes(12)
        const cipher = createCipheriv('aes-256-gcm', key, iv)
        const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
        return Buffer.concat([iv, cipher.getAuthTag(), ciphertext])
      },
      decryptString: (value: Buffer) => {
        const decipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12))
        decipher.setAuthTag(value.subarray(12, 28))
        return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString()
      },
    }
    const principal = {
      userId: '11111111-1111-4111-8111-111111111111',
      organizationId: '22222222-2222-4222-8222-222222222222',
      email: 'a@example.test', displayName: 'A', role: 'member', createdAt: '2026-01-01T00:00:00Z',
    }
    const organization = { id: principal.organizationId, name: 'Org', slug: 'org', createdAt: principal.createdAt }
    const fetchImpl = async (url: URL) => {
      if (url.pathname === '/health') return Response.json({ ok: true, runtime: 'php', supabase: false, apiVersion: 2 })
      if (url.pathname === '/auth/login') return Response.json({ token: url.hostname === 'new.test' ? 'new-token' : 'old-token', expiresAt: '2099-01-01T00:00:00Z' })
      if (url.pathname === '/auth/me') return Response.json({ user: principal })
      if (url.pathname === '/organizations/current') return Response.json({ organization })
      throw Error('unexpected request')
    }
    let release!: () => void
    let entered!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const staged = new Promise<void>((resolve) => { entered = resolve })
    const oldPersistence = createSafeStorageMdbAuthPersistence(safeStorage, createMdbEncryptedAuthRecordStore(file, {
      writeTemporary: async (temp, bytes) => {
        await fs.writeFile(temp, bytes, { mode: 0o600, flag: 'wx' })
        entered()
        await gate
      },
    }))
    const newPersistence = createSafeStorageMdbAuthPersistence(safeStorage, createMdbEncryptedAuthRecordStore(file))
    const create = (persistence: typeof oldPersistence) => createMdbAuthAuthority({ confirmServer: async () => true, persistence, fetchImpl })
    const old = create(oldPersistence)
    const login = old.signIn({ serverUrl: 'https://old.test/', email: 'a', password: 'b' })
    const rejected = expect(login).rejects.toMatchObject({ code: 'context-invalidated' })
    await staged
    let restore: Promise<void> | undefined
    if (operation === 'restore') restore = old.restore()
    else old.dispose()
    const newer = create(newPersistence)
    if (operation === 'newer-authority')
      await newer.signIn({ serverUrl: 'https://new.test/', email: 'a', password: 'b' })
    release()
    await rejected
    if (restore) await restore
    if (operation === 'newer-authority') {
      expect((await newPersistence.load())?.bearerToken).toBe('new-token')
      expect(newer.state()).toMatchObject({ status: 'verified' })
    } else {
      if (operation === 'dispose') await newer.restore()
      expect((operation === 'restore' ? old : newer).state()).toEqual({ status: 'signed-out' })
      expect(await newPersistence.load()).toBeNull()
    }
    expect((await fs.readdir(root)).filter((name) => name.endsWith('.tmp'))).toEqual([])
    old.dispose()
    newer.dispose()
  },
)
