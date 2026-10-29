// Extracted auth-only transport from f86da5003b3f322ec89abb419e97a83ea1999a3a.
const MDB_REQUEST_TIMEOUT_MS = 15_000
/** Reuses the registration input limit in c8eb49c5 mdbMainAuthInputs.ts. */
export const MDB_PASSWORD_MAX_LENGTH = 8192

/** Electron-Main-only credential material. Never export through renderer code. */
export interface MdbFileVaultSession {
  readonly backend: 'mdb'
  readonly serverUrl: string
  readonly bearerToken: string
}

export type MdbFetch = (input: URL, init?: RequestInit) => Promise<Response>

export class MdbFileVaultTransportError extends Error {
  constructor(
    readonly code:
      | 'invalid-input'
      | 'invalid-session'
      | 'insecure-server-url'
      | 'redirect-rejected'
      | 'unauthorized'
      | 'forbidden'
      | 'request-failed'
      | 'request-timeout'
      | 'request-aborted'
      | 'invalid-json',
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'MdbFileVaultTransportError'
  }
}

export class MdbFileVaultTransport {
  private readonly baseUrl: URL

  constructor(
    private readonly session: MdbFileVaultSession,
    private readonly fetchImpl: MdbFetch = globalThis.fetch,
  ) {
    this.baseUrl = normalizeBaseUrl(session)
  }

  currentPrincipal(signal?: AbortSignal): Promise<unknown> {
    return this.request('auth/me', {
      method: 'GET',
      ...(signal === undefined ? {} : { signal }),
    })
  }

  currentOrganization(signal?: AbortSignal): Promise<unknown> {
    return this.request('organizations/current', {
      method: 'GET',
      ...(signal === undefined ? {} : { signal }),
    })
  }

  private request(relativePath: string, init: RequestInit): Promise<unknown> {
    return requestJson(this.baseUrl, relativePath, init, this.fetchImpl, this.session.bearerToken)
  }
}

function requestTimeoutError(): MdbFileVaultTransportError {
  return new MdbFileVaultTransportError(
    'request-timeout',
    'MDB request timed out before the response was complete.',
  )
}

function requestAbortedError(): MdbFileVaultTransportError {
  return new MdbFileVaultTransportError(
    'request-aborted',
    'MDB request was cancelled by its caller.',
  )
}

/**
 * Login has no bearer token.  It is deliberately separate from a session
 * transport so a Main authority can require native server confirmation before
 * this method is ever called for a new origin.
 */
export async function loginToMdb(
  serverUrl: string,
  credentials: { readonly email: string; readonly password: string },
  options: { readonly fetchImpl?: MdbFetch; readonly signal?: AbortSignal } = {},
): Promise<unknown> {
  if (credentials.password.length > MDB_PASSWORD_MAX_LENGTH) {
    throw new MdbFileVaultTransportError('invalid-input', 'MDB password exceeds the input limit.')
  }
  if (!nonEmptyText(credentials.email) || !nonEmptyText(credentials.password)) {
    throw new MdbFileVaultTransportError('invalid-session', 'MDB login requires credentials.')
  }
  const baseUrl = normalizeServerUrl(serverUrl)
  return requestJson(
    baseUrl,
    'auth/login',
    {
      method: 'POST',
      signal: options.signal,
      body: JSON.stringify({ email: credentials.email, password: credentials.password }),
    },
    options.fetchImpl ?? globalThis.fetch,
  )
}

/**
 * Complete an admin TOTP challenge without ever constructing a bearer session
 * from the challenge itself. The caller owns both secrets and must keep them
 * Main-only.
 */
export async function verifyMdbTotp(
  serverUrl: string,
  challenge: { readonly challengeToken: string; readonly code: string },
  options: { readonly fetchImpl?: MdbFetch; readonly signal?: AbortSignal } = {},
): Promise<unknown> {
  if (!nonEmptyText(challenge.challengeToken) || !nonEmptyText(challenge.code)) {
    throw new MdbFileVaultTransportError(
      'invalid-session',
      'MDB TOTP verification requires a challenge.',
    )
  }
  const baseUrl = normalizeServerUrl(serverUrl)
  return requestJson(
    baseUrl,
    'auth/totp/verify',
    {
      method: 'POST',
      signal: options.signal,
      body: JSON.stringify({ challengeToken: challenge.challengeToken, code: challenge.code }),
    },
    options.fetchImpl ?? globalThis.fetch,
  )
}

function normalizeBaseUrl(session: MdbFileVaultSession): URL {
  if (session.backend !== 'mdb' || !nonEmptyText(session.bearerToken)) {
    throw new MdbFileVaultTransportError('invalid-session', 'MDB session requires a bearer token.')
  }

  return normalizeServerUrl(session.serverUrl)
}

export function normalizeMdbServerUrl(serverUrl: string): URL {
  return normalizeServerUrl(serverUrl)
}

/** Health schema check based on 9865986a; it does not establish server identity or DB readiness. */
export async function validateMdbHealth(
  serverUrl: string,
  fetchImpl: MdbFetch = globalThis.fetch,
): Promise<void> {
  const result = await requestJson(
    normalizeServerUrl(serverUrl),
    'health',
    { method: 'GET', cache: 'no-store' },
    fetchImpl,
  )
  if (typeof result !== 'object' || result === null || Array.isArray(result))
    throw new MdbFileVaultTransportError('invalid-json', 'Invalid MDB health response.')
  const health = result as Record<string, unknown>
  if (
    health.ok !== true ||
    health.runtime !== 'php' ||
    health.supabase !== false ||
    health.apiVersion !== 2
  )
    throw new MdbFileVaultTransportError('invalid-json', 'Unsupported MDB health response.')
}

function normalizeServerUrl(serverUrl: string): URL {
  let url: URL
  try {
    url = new URL(serverUrl)
  } catch {
    throw new MdbFileVaultTransportError(
      'invalid-session',
      'MDB session has an invalid server URL.',
    )
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new MdbFileVaultTransportError(
      'invalid-session',
      'MDB server URL must not contain credentials, query, or fragment.',
    )
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopbackHost(url.hostname))) {
    throw new MdbFileVaultTransportError(
      'insecure-server-url',
      'MDB servers on a network must use HTTPS.',
    )
  }

  if (!url.pathname.endsWith('/')) url.pathname = `${url.pathname}/`
  return url
}

async function requestJson(
  baseUrl: URL,
  relativePath: string,
  init: RequestInit,
  fetchImpl: MdbFetch,
  bearerToken?: string,
): Promise<unknown> {
  if (init.signal?.aborted) throw requestAbortedError()
  const url = new URL(relativePath, baseUrl)
  if (url.origin !== baseUrl.origin) {
    throw new MdbFileVaultTransportError(
      'insecure-server-url',
      'MDB request target must remain on the configured server origin.',
    )
  }
  const controller = new AbortController()
  const requestSignal =
    init.signal == null ? controller.signal : AbortSignal.any([init.signal, controller.signal])
  const timeout = setTimeout(() => controller.abort(), MDB_REQUEST_TIMEOUT_MS)
  try {
    let response: Response
    try {
      response = await fetchImpl(url, {
        ...init,
        signal: requestSignal,
        credentials: 'omit',
        redirect: 'manual',
        headers: {
          Accept: 'application/json',
          ...(bearerToken === undefined ? {} : { Authorization: `Bearer ${bearerToken}` }),
          ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
      })
    } catch {
      if (init.signal?.aborted) throw requestAbortedError()
      if (controller.signal.aborted) throw requestTimeoutError()
      throw new MdbFileVaultTransportError('request-failed', 'MDB request could not be completed.')
    }
    if (response.status >= 300 && response.status < 400) {
      throw new MdbFileVaultTransportError(
        'redirect-rejected',
        'MDB redirects are rejected.',
        response.status,
      )
    }
    if (response.status === 401)
      throw new MdbFileVaultTransportError(
        'unauthorized',
        'MDB session is invalid or expired.',
        401,
      )
    if (response.status === 403)
      throw new MdbFileVaultTransportError('forbidden', 'MDB denied the requested operation.', 403)
    if (!response.ok) {
      throw new MdbFileVaultTransportError(
        'request-failed',
        `MDB request failed with HTTP ${response.status}.`,
        response.status,
      )
    }
    try {
      return await response.json()
    } catch {
      if (init.signal?.aborted) throw requestAbortedError()
      if (controller.signal.aborted) throw requestTimeoutError()
      throw new MdbFileVaultTransportError('invalid-json', 'MDB response was not valid JSON.')
    }
  } finally {
    clearTimeout(timeout)
  }
}

function nonEmptyText(value: string): boolean {
  return value.trim().length > 0
}

function isLoopbackHost(value: string): boolean {
  const hostname = value.replace(/^\[|\]$/g, '').toLowerCase()
  return (
    hostname === 'localhost' ||
    hostname === '::1' ||
    /^127(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(hostname)
  )
}
