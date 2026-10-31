import { describe, expect, it } from 'vitest'

import {
  parseConnectionString,
  pgConfig,
  projectRefFromSupabaseUrl,
  redactSecret,
  secretsOf,
} from './dbMigrationsPg'

const POOLER =
  'postgresql://postgres.abcdefghij:s3cr%40t-pw@aws-0-us-west-1.pooler.supabase.com:5432/postgres'

describe('parseConnectionString', () => {
  it('reads a Supabase session pooler string', () => {
    const parsed = parseConnectionString(POOLER, 'abcdefghij')
    expect(parsed).toEqual({
      ok: true,
      connection: {
        host: 'aws-0-us-west-1.pooler.supabase.com',
        port: 5432,
        user: 'postgres.abcdefghij',
        password: 's3cr@t-pw',
        database: 'postgres',
        projectRef: 'abcdefghij',
      },
    })
  })

  it('reads the project from a direct connection host', () => {
    const parsed = parseConnectionString('postgres://postgres:pw@db.abcdefghij.supabase.co:5432/postgres', null)
    expect(parsed.ok && parsed.connection.projectRef).toBe('abcdefghij')
  })

  it('refuses the transaction pooler, a missing password, another project and non-URLs', () => {
    expect(parseConnectionString(POOLER.replace(':5432', ':6543'), null)).toEqual({
      ok: false,
      reason: 'transaction-pooler',
    })
    expect(
      parseConnectionString('postgresql://postgres.abcdefghij@host:5432/postgres', null),
    ).toEqual({ ok: false, reason: 'no-password' })
    expect(parseConnectionString(POOLER, 'otherproject')).toEqual({
      ok: false,
      reason: 'project-mismatch',
    })
    expect(parseConnectionString('host=x user=y', null)).toEqual({ ok: false, reason: 'format' })
  })

  it('refuses a password left inside the placeholder brackets, but not one that contains a bracket', () => {
    const withPassword = (password: string) =>
      `postgresql://postgres.abcdefghij:${password}@aws-0-us-west-1.pooler.supabase.com:5432/postgres`
    expect(parseConnectionString(withPassword('[MyPass!123]'), 'abcdefghij')).toEqual({
      ok: false,
      reason: 'password-brackets',
    })
    const inner = parseConnectionString(withPassword('My[Pass]!123'), 'abcdefghij')
    expect(inner.ok && inner.connection.password).toBe('My[Pass]!123')
  })

  it('ignores sslmode in the string: TLS is always on and verified', () => {
    const parsed = parseConnectionString(`${POOLER}?sslmode=disable`, null)
    if (!parsed.ok) throw new Error('expected a connection')
    const config = pgConfig(parsed.connection, ['-----BEGIN CERTIFICATE-----'])
    expect(config.ssl).toMatchObject({ rejectUnauthorized: true })
    const ca = (config.ssl as { ca: string[] }).ca
    expect(ca).toContain('-----BEGIN CERTIFICATE-----')
    expect(ca.length).toBeGreaterThan(1)
  })
})

describe('secret hygiene', () => {
  it('removes the string, the password and any URL credential from a message', () => {
    const parsed = parseConnectionString(POOLER, null)
    const secrets = secretsOf(POOLER, parsed.ok ? parsed.connection : null)
    const text = redactSecret(
      `failed ${POOLER} with s3cr@t-pw and postgresql://someone:else@host/db`,
      secrets,
    )
    expect(text).not.toContain('s3cr')
    expect(text).not.toContain('someone:else')
  })

  it('reads the project ref of the signed-in Supabase URL', () => {
    expect(projectRefFromSupabaseUrl('https://abcdefghij.supabase.co')).toBe('abcdefghij')
    expect(projectRefFromSupabaseUrl('http://localhost:54321')).toBeNull()
  })
})
