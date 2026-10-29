import { describe, expect, it, vi } from 'vitest'
import {
  loginToMdb,
  MdbFileVaultTransport,
  normalizeMdbServerUrl,
  MDB_PASSWORD_MAX_LENGTH,
  verifyMdbTotp,
} from './mdbAuthTransport'

describe('Main MDB authentication transport', () => {
  it('rejects oversized passwords before the transport calls fetch', async () => {
    const fetchImpl = vi.fn(async () => Response.json({}))
    await expect(
      loginToMdb(
        'https://example.test/',
        { email: 'a', password: 'x'.repeat(MDB_PASSWORD_MAX_LENGTH + 1) },
        { fetchImpl },
      ),
    ).rejects.toMatchObject({ code: 'invalid-input' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('rejects insecure remote URLs, credentials and cross-origin redirects', async () => {
    expect(() => normalizeMdbServerUrl('http://example.org')).toThrow()
    expect(() => normalizeMdbServerUrl('https://user:password@example.org')).toThrow()
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, { status: 302, headers: { Location: 'https://other.example/' } }),
    )
    await expect(
      loginToMdb('https://example.org/api/', { email: 'a', password: 'b' }, { fetchImpl }),
    ).rejects.toMatchObject({ code: 'redirect-rejected' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('sends the challenge only to the selected server and uses bearer identity reads', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ok: true }))
    await verifyMdbTotp(
      'https://example.org/api/',
      { challengeToken: 'challenge', code: '123456' },
      { fetchImpl },
    )
    const [url, request] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit]
    expect(url.href).toBe('https://example.org/api/auth/totp/verify')
    expect(JSON.parse(String(request.body))).toEqual({
      challengeToken: 'challenge',
      code: '123456',
    })
    const transport = new MdbFileVaultTransport(
      { backend: 'mdb', serverUrl: 'https://example.org/api/', bearerToken: 'token' },
      fetchImpl,
    )
    await transport.currentPrincipal()
    expect(fetchImpl.mock.calls).toHaveLength(2)
    const [principalUrl, principalRequest] = fetchImpl.mock.calls[1] as unknown as [
      URL,
      RequestInit,
    ]
    expect(principalUrl.href).toBe('https://example.org/api/auth/me')
    expect(principalRequest.headers).toMatchObject({ Authorization: 'Bearer token' })
    expect(principalRequest.credentials).toBe('omit')
  })

  it('reports rejected and malformed authentication responses without their contents', async () => {
    const unauthorized = vi.fn(async () => new Response('private response', { status: 401 }))
    await expect(
      verifyMdbTotp(
        'https://example.org/',
        { challengeToken: 'secret', code: '123456' },
        { fetchImpl: unauthorized },
      ),
    ).rejects.toMatchObject({ code: 'unauthorized', message: 'MDB session is invalid or expired.' })
    const invalidJson = vi.fn(async () => new Response('private response', { status: 200 }))
    await expect(
      loginToMdb('https://example.org/', { email: 'a', password: 'b' }, { fetchImpl: invalidJson }),
    ).rejects.toMatchObject({ code: 'invalid-json' })
  })
})
