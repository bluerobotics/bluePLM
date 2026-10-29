import type {
  MdbAuthState,
  MdbPrincipal,
  MdbOrganization,
} from '../../src/lib/backend/contracts/mdbAuthShared'
import {
  MdbFileVaultTransport,
  MdbFileVaultTransportError,
  loginToMdb,
  normalizeMdbServerUrl,
  validateMdbHealth,
  verifyMdbTotp,
  type MdbFetch,
} from './mdbAuthTransport'
import { MdbAuthAuthorityError } from './mdbAuthAuthorityError'
import {
  isExpired,
  parseLogin,
  parseSessionLogin,
  parsePrincipal,
  parseOrganization,
} from './mdbAuthParsers'

/** Auth-only extraction of trusted-context generation, request, and persistence semantics from f86da500. */
export interface MdbAuthSnapshot {
  readonly serverUrl: string
  readonly bearerToken: string
  readonly expiresAt: string
  readonly principal: MdbPrincipal
  readonly organization: MdbOrganization
}
export interface MdbAuthPersistence {
  load(): Promise<MdbAuthSnapshot | null>
  /** Return true only after publication, or false if canCommit rejects it before publication. */
  save(value: MdbAuthSnapshot, canCommit: () => boolean): Promise<boolean>
  clear(): Promise<void>
}

export function createMdbAuthAuthority(options: {
  readonly confirmServer: (url: string) => Promise<boolean>
  readonly persistence: MdbAuthPersistence
  readonly fetchImpl?: MdbFetch
  readonly now?: () => Date
}) {
  const now = options.now ?? (() => new Date())
  let active: MdbAuthSnapshot | null = null
  let pending: {
    serverUrl: string
    challengeToken: string
    expiresAt: string
    generation: number
  } | null = null
  let generation = 0
  let clearFailed = false
  let expiryTimer: ReturnType<typeof setTimeout> | undefined
  let tail: Promise<void> = Promise.resolve()
  const controllers = new Set<AbortController>()
  const listeners = new Set<(state: MdbAuthState) => void>()
  const state = (): MdbAuthState => {
    if (pending !== null && isExpired(pending.expiresAt, now)) pending = null
    if (pending !== null) return { status: 'totp-required' }
    if (active !== null && isExpired(active.expiresAt, now)) {
      active = null
      generation++
      for (const controller of controllers) controller.abort()
      controllers.clear()
      void clear().catch(() => undefined)
    }
    if (active === null) return { status: 'signed-out' }
    return {
      status: 'verified',
      principal: active.principal,
      organization: active.organization,
      expiresAt: active.expiresAt,
    }
  }
  const publish = () => {
    const view = state()
    for (const listener of listeners) {
      try {
        listener(view)
      } catch {
        // A failed subscriber must not block authority revocation or persistence cleanup.
      }
    }
  }
  const invalidate = () => {
    if (expiryTimer !== undefined) clearTimeout(expiryTimer)
    expiryTimer = undefined
    active = null
    pending = null
    generation++
    for (const controller of controllers) controller.abort()
    controllers.clear()
    publish()
    return generation
  }
  const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
    const work = tail.then(fn)
    tail = work.then(
      () => undefined,
      () => undefined,
    )
    return work
  }
  const clear = () =>
    enqueue(async () => {
      try {
        await options.persistence.clear()
        clearFailed = false
      } catch {
        clearFailed = true
        throw new MdbAuthAuthorityError(
          'persistence-clear-failed',
          'Could not clear saved MDB session.',
        )
      }
    })
  const scheduleExpiry = (expiresAt: string, expected: number) => {
    if (expiryTimer !== undefined) clearTimeout(expiryTimer)
    const remaining = Date.parse(expiresAt) - now().getTime()
    expiryTimer = setTimeout(
      () => {
        if (generation !== expected) return
        if (Date.parse(expiresAt) > now().getTime()) {
          scheduleExpiry(expiresAt, expected)
          return
        }
        invalidate()
        void clear().catch(() => undefined)
      },
      Math.max(1, Math.min(2_147_000_000, remaining)),
    )
  }
  const current = (expected: number) => {
    if (generation !== expected)
      throw new MdbAuthAuthorityError('context-invalidated', 'MDB authority changed.')
  }
  const request = () => {
    const controller = new AbortController()
    controllers.add(controller)
    const timer = setTimeout(() => controller.abort(), 15_000)
    return {
      signal: controller.signal,
      close: () => {
        clearTimeout(timer)
        controllers.delete(controller)
      },
    }
  }
  const activate = async (
    serverUrl: string,
    token: string,
    expiresAt: string,
    expected: number,
    signal: AbortSignal,
    previous?: MdbAuthSnapshot,
  ) => {
    current(expected)
    const transport = new MdbFileVaultTransport(
      { backend: 'mdb', serverUrl, bearerToken: token },
      options.fetchImpl,
    )
    const principal = parsePrincipal(await transport.currentPrincipal(signal))
    current(expected)
    if (
      previous &&
      (previous.principal.userId !== principal.userId ||
        previous.principal.organizationId !== principal.organizationId)
    )
      throw new MdbAuthAuthorityError('invalid-principal-response', 'Restored identity changed.')
    const organization = parseOrganization(await transport.currentOrganization(signal))
    current(expected)
    if (organization.id !== principal.organizationId)
      throw new MdbAuthAuthorityError(
        'invalid-principal-response',
        'Identity and organization differ.',
      )
    const next = { serverUrl, bearerToken: token, expiresAt, principal, organization }
    await enqueue(async () => {
      current(expected)
      try {
        const committed = await options.persistence.save(next, () => generation === expected)
        if (!committed) {
          current(expected)
          throw new Error('MDB session save was not committed')
        }
      } catch {
        current(expected)
        throw new MdbAuthAuthorityError('persistence-save-failed', 'Could not save MDB session.')
      }
      current(expected)
      clearFailed = false
      active = next
      pending = null
    })
    current(expected)
    scheduleExpiry(expiresAt, expected)
    publish()
  }
  return {
    state,
    subscribe(listener: (state: MdbAuthState) => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async validateServer(serverUrl: string) {
      const normalized = normalizeMdbServerUrl(serverUrl).toString()
      if (!(await options.confirmServer(normalized)))
        throw new MdbAuthAuthorityError('server-not-confirmed', 'Server not confirmed.')
      await validateMdbHealth(normalized, options.fetchImpl)
    },
    async signIn(input: { serverUrl: string; email: string; password: string }) {
      const serverUrl = normalizeMdbServerUrl(input.serverUrl).toString()
      const beforeConfirmation = generation
      if (!(await options.confirmServer(serverUrl)))
        throw new MdbAuthAuthorityError('server-not-confirmed', 'Server not confirmed.')
      current(beforeConfirmation)
      const expected = invalidate()
      await clear()
      current(expected)
      await validateMdbHealth(serverUrl, options.fetchImpl)
      current(expected)
      const req = request()
      try {
        const result = parseLogin(
          await loginToMdb(serverUrl, input, { fetchImpl: options.fetchImpl, signal: req.signal }),
          now,
        )
        current(expected)
        if (result.kind === 'totp') {
          pending = {
            serverUrl,
            challengeToken: result.challengeToken,
            expiresAt: result.expiresAt,
            generation: expected,
          }
          scheduleExpiry(result.expiresAt, expected)
          publish()
          return
        }
        await activate(serverUrl, result.token, result.expiresAt, expected, req.signal)
      } finally {
        req.close()
      }
    },
    async verifyTotp(code: string) {
      const challenge = pending
      if (
        !challenge ||
        challenge.generation !== generation ||
        isExpired(challenge.expiresAt, now) ||
        !/^\d{6}$/.test(code)
      )
        throw new MdbAuthAuthorityError('totp-invalid', 'Invalid or expired challenge.')
      const req = request()
      try {
        let response: unknown
        try {
          response = await verifyMdbTotp(
            challenge.serverUrl,
            { challengeToken: challenge.challengeToken, code },
            { fetchImpl: options.fetchImpl, signal: req.signal },
          )
        } catch (error) {
          if (error instanceof MdbFileVaultTransportError && error.code === 'unauthorized')
            throw new MdbAuthAuthorityError('totp-invalid', 'Invalid or expired challenge.')
          throw error
        }
        const login = parseSessionLogin(response, now)
        await activate(
          challenge.serverUrl,
          login.token,
          login.expiresAt,
          challenge.generation,
          req.signal,
        )
      } finally {
        req.close()
      }
    },
    async restore() {
      const expected = invalidate()
      const saved = await enqueue(async () => {
        if (clearFailed)
          throw new MdbAuthAuthorityError(
            'persistence-clear-failed',
            'Could not clear saved MDB session.',
          )
        return options.persistence.load()
      })
      current(expected)
      if (saved === null || isExpired(saved.expiresAt, now)) return
      const serverUrl = normalizeMdbServerUrl(saved.serverUrl).toString()
      const req = request()
      try {
        await validateMdbHealth(serverUrl, options.fetchImpl)
        current(expected)
        await activate(serverUrl, saved.bearerToken, saved.expiresAt, expected, req.signal, saved)
      } catch (error) {
        const revoked =
          (error instanceof MdbAuthAuthorityError && error.code === 'invalid-principal-response') ||
          (error instanceof MdbFileVaultTransportError && error.code === 'unauthorized')
        if (revoked && generation === expected) {
          invalidate()
          await clear()
        }
        throw error
      } finally {
        req.close()
      }
    },
    async signOut() {
      invalidate()
      await clear()
    },
    /** Drop in-memory authority during shutdown without deleting the saved session. */
    dispose() {
      invalidate()
      listeners.clear()
    },
  }
}
