import { describe, expect, it } from 'vitest'

import { EXPECTED_SCHEMA_VERSION, requiresDatabaseUpgrade } from '@/lib/schemaVersion'

import {
  compareAppVersions,
  decideGate,
  estimatePending,
  projectRefFromUrl,
  REQUIRED_SCHEMA_VERSION,
} from './gateDecision'

const base = {
  appVersion: '5.0.0',
  recordedVersion: 500,
  clientMinVersion: '5.0.0',
  isAdmin: false,
  hasDesktop: true,
}

describe('decideGate', () => {
  it('agrees with the schema version the app expects', () => {
    expect(REQUIRED_SCHEMA_VERSION).toBe(EXPECTED_SCHEMA_VERSION)
    expect(requiresDatabaseUpgrade(499)).toBe(true)
    expect(requiresDatabaseUpgrade(0)).toBe(true)
    expect(requiresDatabaseUpgrade(null)).toBe(true)
    expect(requiresDatabaseUpgrade(500)).toBe(false)
  })

  it('lets a current app through a current database', () => {
    expect(decideGate(base)).toBe('clear')
    expect(decideGate({ ...base, recordedVersion: 503 })).toBe('clear')
    expect(decideGate({ ...base, clientMinVersion: null })).toBe('clear')
  })

  it('requires an update below client_min_version, before anything else', () => {
    expect(decideGate({ ...base, clientMinVersion: '5.0.1' })).toBe('update-required')
    expect(decideGate({ ...base, appVersion: '5.0.0-beta.2', clientMinVersion: '5.1.0' })).toBe(
      'update-required',
    )
    expect(decideGate({ ...base, recordedVersion: 112, clientMinVersion: '5.2.0' })).toBe(
      'update-required',
    )
  })

  it('sends any signed-in desktop user to set up an uninitialized database (no schema_version)', () => {
    expect(decideGate({ ...base, recordedVersion: null, isAdmin: false })).toBe('db-upgrade-admin')
    expect(decideGate({ ...base, recordedVersion: null, isAdmin: true })).toBe('db-upgrade-admin')
    expect(decideGate({ ...base, recordedVersion: null, isAdmin: false, hasDesktop: false })).toBe(
      'db-upgrade-wait',
    )
  })

  it('sends an admin on the desktop to the upgrade screen, everyone else to wait', () => {
    for (const recordedVersion of [112, 0, 499]) {
      expect(decideGate({ ...base, recordedVersion, isAdmin: true })).toBe('db-upgrade-admin')
      expect(decideGate({ ...base, recordedVersion, isAdmin: false })).toBe('db-upgrade-wait')
      expect(decideGate({ ...base, recordedVersion, isAdmin: true, hasDesktop: false })).toBe(
        'db-upgrade-wait',
      )
    }
  })
})

describe('compareAppVersions', () => {
  it('compares numerically, ignoring a v prefix and prerelease suffix', () => {
    expect(compareAppVersions('5.10.0', '5.9.9')).toBeGreaterThan(0)
    expect(compareAppVersions('v5.0.0', '5.0.0')).toBe(0)
    expect(compareAppVersions('5.0', '5.0.0')).toBe(0)
    expect(compareAppVersions('4.10.0', '5.0.0')).toBeLessThan(0)
  })
})

describe('estimatePending', () => {
  const migrations = [
    { version: 501, name: '0501_b' },
    { version: 500, name: '0500_from_4x' },
  ]

  it('from 112 lists every migration from 0500', () => {
    expect(estimatePending(112, migrations)).toEqual({
      needsLegacy: false,
      unknownStart: false,
      migrations: [
        { version: 500, name: '0500_from_4x' },
        { version: 501, name: '0501_b' },
      ],
    })
  })

  it('below 112 adds the 4.10 step', () => {
    expect(estimatePending(90, migrations).needsLegacy).toBe(true)
  })

  it('at 500 lists only later migrations', () => {
    expect(estimatePending(500, migrations).migrations.map((m) => m.version)).toEqual([501])
  })

  it('with no recorded version leaves the list to the database', () => {
    expect(estimatePending(null, migrations).unknownStart).toBe(true)
  })
})

describe('projectRefFromUrl', () => {
  it('reads the ref from a Supabase project URL', () => {
    expect(projectRefFromUrl('https://abcdefghij.supabase.co')).toBe('abcdefghij')
    expect(projectRefFromUrl('https://example.com')).toBeNull()
    expect(projectRefFromUrl(null)).toBeNull()
  })
})
