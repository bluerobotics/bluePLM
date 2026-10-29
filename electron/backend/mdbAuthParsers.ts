// Auth parsers extracted from f86da5003b3f322ec89abb419e97a83ea1999a3a.
import type {
  MdbPrincipal as MdbTrustedPrincipal,
  MdbOrganization as MdbTrustedOrganization,
} from '../../src/lib/backend/contracts/mdbAuthShared'
import { MdbAuthAuthorityError as MdbTrustedContextError } from './mdbAuthAuthorityError'
type MdbTrustedMembershipRole = MdbTrustedPrincipal['role']
export interface MdbLoginSession {
  readonly kind: 'session'
  readonly token: string
  readonly expiresAt: string
}

export interface MdbLoginTotpChallenge {
  readonly kind: 'totp'
  /** Main-only; never copy this to a snapshot, persistence, or an error. */
  readonly challengeToken: string
  readonly expiresAt: string
}

export function parseLogin(
  value: unknown,
  now: () => Date,
): MdbLoginSession | MdbLoginTotpChallenge {
  const record = requireRecord(value, 'login')
  const expiresAt = requireText(record.expiresAt, 'login.expiresAt')
  if (isExpired(expiresAt, now))
    throw new MdbTrustedContextError('invalid-login-response', 'MDB login expiry is invalid.')
  if (record.totpRequired === true) {
    return {
      kind: 'totp',
      challengeToken: requireText(record.challengeToken, 'login.challengeToken'),
      expiresAt,
    }
  }
  return parseSessionLogin(record, now)
}

export function parseSessionLogin(value: unknown, now: () => Date): MdbLoginSession {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MdbTrustedContextError('invalid-login-response', 'MDB login session is invalid.')
  }
  const record = value as Record<string, unknown>
  if (
    typeof record.token !== 'string' ||
    record.token.trim().length === 0 ||
    typeof record.expiresAt !== 'string' ||
    record.expiresAt.trim().length === 0
  ) {
    throw new MdbTrustedContextError('invalid-login-response', 'MDB login session is invalid.')
  }
  const token = record.token
  const expiresAt = record.expiresAt
  if (isExpired(expiresAt, now))
    throw new MdbTrustedContextError('invalid-login-response', 'MDB login expiry is invalid.')
  return { kind: 'session', token, expiresAt }
}

export function parsePrincipal(value: unknown): MdbTrustedPrincipal {
  const user = requireRecord(requireRecord(value, 'auth/me').user, 'auth/me.user')
  const role = requireText(user.role, 'auth/me.user.role')
  if (!isMdbMembershipRole(role)) {
    throw new MdbTrustedContextError(
      'invalid-principal-response',
      'MDB membership role is invalid.',
    )
  }
  const createdAt = requireText(user.createdAt, 'auth/me.user.createdAt')
  if (Number.isNaN(Date.parse(createdAt))) {
    throw new MdbTrustedContextError(
      'invalid-principal-response',
      'MDB user creation date is invalid.',
    )
  }
  return {
    userId: requireUuid(user.userId, 'auth/me.user.userId'),
    organizationId: requireUuid(user.organizationId, 'auth/me.user.organizationId'),
    email: requireText(user.email, 'auth/me.user.email'),
    displayName: requireText(user.displayName, 'auth/me.user.displayName'),
    role,
    createdAt,
  }
}

export function parseOrganization(value: unknown): MdbTrustedOrganization {
  const organization = requireRecord(
    requireRecord(value, 'organizations/current').organization,
    'organizations/current.organization',
  )
  const createdAt = requireText(
    organization.createdAt,
    'organizations/current.organization.createdAt',
  )
  if (Number.isNaN(Date.parse(createdAt))) {
    throw new MdbTrustedContextError(
      'invalid-principal-response',
      'MDB organization creation date is invalid.',
    )
  }
  return {
    id: requireUuid(organization.id, 'organizations/current.organization.id'),
    name: requireText(organization.name, 'organizations/current.organization.name'),
    slug: requireText(organization.slug, 'organizations/current.organization.slug'),
    createdAt,
  }
}

function requireRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new MdbTrustedContextError(
      'invalid-principal-response',
      `MDB ${context} must be an object.`,
    )
  return value as Record<string, unknown>
}

function requireText(value: unknown, context: string): string {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new MdbTrustedContextError(
      'invalid-principal-response',
      `MDB ${context} must be non-empty text.`,
    )
  return value
}

function requireUuid(value: unknown, context: string): string {
  const result = requireText(value, context)
  if (!UUID.test(result))
    throw new MdbTrustedContextError('invalid-principal-response', `MDB ${context} must be a UUID.`)
  return result
}

export function isExpired(value: string, now: () => Date): boolean {
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) || timestamp <= now().getTime()
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function isMdbMembershipRole(value: string): value is MdbTrustedMembershipRole {
  return (
    value === 'owner' ||
    value === 'admin' ||
    value === 'member' ||
    value === 'viewer' ||
    value === 'guest'
  )
}
