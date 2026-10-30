/**
 * Schema Version Checking
 *
 * Detects mismatches between the app's expected database schema version
 * and the actual schema version in the database. This helps users understand
 * when their organization's database needs to be updated.
 *
 * DATABASE SCHEMA LOCATION:
 * The schema is now modular - see supabase/README.md for details:
 * - supabase/core.sql - Foundation (orgs, users, teams, permissions)
 * - supabase/modules/*.sql - Feature modules (source files, change control, etc.)
 *
 * WHAT THE NUMBER IN THE DATABASE MEANS (schema 89 onwards):
 * schema_version.version is written by one thing only - verify_and_stamp_schema(),
 * called from supabase/tools/verify-schema.sql - and only after it has confirmed
 * that the objects the release requires are actually present. Running a file no
 * longer stamps anything. Before 89 both core.sql and each module stamped the
 * head unconditionally, so applying one module to an old database recorded a
 * version the database was not at and this check reported "up to date" over a
 * half-applied schema. The comparison below is worth acting on because the number
 * it reads can now only be reached by verification.
 *
 * Version 0 is the value core.sql seeds and means "never verified", which is not
 * the same as "old" - see the dbVersion === 0 branch below.
 *
 * When making schema changes:
 * 1. Increment EXPECTED_SCHEMA_VERSION here
 * 2. Update the appropriate module file in supabase/ (core.sql or modules/*.sql)
 * 3. Bump schema_release_version() in supabase/core.sql to match, and add any
 *    new object to schema_release_manifest() there so verification can see it
 * 4. Add entry to VERSION_DESCRIPTIONS below
 * 5. This file and schema_release_version() in supabase/core.sql must agree
 */

import { supabase } from './supabase'

// The schema version this app version expects
// Increment this when releasing app updates that require schema changes
export const EXPECTED_SCHEMA_VERSION = 500

// 5.0 renamed the schema (supabase/rename-map-5.0.json), so no 5.x app can run against a 4.x
// database at all: anything below this is a hard block (src/features/dbUpgrade), never a warning.
// A database newer than the app is fine unless client_min_version() says otherwise, because
// migrations after 500 are additive for the app versions they leave allowed.
export const MINIMUM_COMPATIBLE_VERSION = EXPECTED_SCHEMA_VERSION

// Human-readable descriptions for each version
// What the app shows for the schema it expects. The 1-112 history lives in git and in
// supabase/legacy-4.10; no 5.x client can meet a database below 500.
export const VERSION_DESCRIPTIONS: Record<number, string> = {
  500:
    'BluePLM 5.0: one clean schema with consistent names (singular tables such as organization, app_user, file and file_version; org_ prefixes; <entity>_<verb> functions), upgraded from 112 in place by migrations/0500_from_4x.sql. From 5.0 on, the desktop app applies the database SQL itself: an organization admin gives the database connection once, the app runs the numbered migrations in supabase/migrations under an advisory lock, each in its own transaction, records them in schema_migration with a checksum, and verifies. client_min_version() names the oldest app allowed to connect; older 5.x apps update before they continue.',
}

export interface SchemaVersionInfo {
  version: number
  description: string | null
  appliedAt: Date | null
  appliedBy: string | null
}

export interface SchemaCheckResult {
  status: 'current' | 'outdated' | 'incompatible' | 'unknown' | 'missing'
  dbVersion: number | null
  expectedVersion: number
  message: string
  details?: string
}

/**
 * Fetch the current schema version from the database
 */
export async function getSchemaVersion(): Promise<SchemaVersionInfo | null> {
  try {
    const { data, error } = await supabase
      .from('schema_version')
      .select('version, description, applied_at, applied_by')
      .single()

    if (error) {
      // Table might not exist yet (pre-schema-versioning database)
      return null
    }

    // Type assertion needed because supabase client uses @ts-nocheck
    const row = data as {
      version: number
      description: string | null
      applied_at: string | null
      applied_by: string | null
    }

    return {
      version: row.version,
      description: row.description,
      appliedAt: row.applied_at ? new Date(row.applied_at) : null,
      appliedBy: row.applied_by,
    }
  } catch {
    return null
  }
}

/**
 * Check if the database schema is compatible with this app version
 */
export async function checkSchemaCompatibility(): Promise<SchemaCheckResult> {
  const versionInfo = await getSchemaVersion()

  // The version could not be read (no table, or the read failed)
  if (versionInfo === null) {
    return {
      status: 'missing',
      dbVersion: null,
      expectedVersion: EXPECTED_SCHEMA_VERSION,
      message: 'Database schema version unknown',
      details:
        'The database did not report its schema version. An organization admin can set it up or ' +
        'upgrade it from the BluePLM desktop app (Database upgrade required).',
    }
  }

  const { version: dbVersion } = versionInfo

  // Version 0 is what core.sql seeds. It does not mean an old database - it
  // means verify-schema.sql has never completed against this one, which is the
  // state of every database in the ten minutes after it is created. Reported as
  // 'incompatible' it produced a permanent error toast telling the admin their
  // brand-new database was "too old", with a minimum version it already
  // exceeded. It is missing a version, not behind on one.
  if (dbVersion === 0) {
    return {
      status: 'missing',
      dbVersion,
      expectedVersion: EXPECTED_SCHEMA_VERSION,
      message: 'Database not verified yet',
      details:
        'This database has never been verified. An organization admin finishes the setup from the ' +
        `BluePLM desktop app, which verifies it and records the version (v${EXPECTED_SCHEMA_VERSION}).`,
    }
  }

  // Perfect match
  if (dbVersion === EXPECTED_SCHEMA_VERSION) {
    return {
      status: 'current',
      dbVersion,
      expectedVersion: EXPECTED_SCHEMA_VERSION,
      message: 'Database schema is up to date',
    }
  }

  // Database is newer than app (user should update app)
  if (dbVersion > EXPECTED_SCHEMA_VERSION) {
    return {
      status: 'outdated',
      dbVersion,
      expectedVersion: EXPECTED_SCHEMA_VERSION,
      message: 'App update available',
      details:
        `Your database (v${dbVersion}) is newer than this app expects (v${EXPECTED_SCHEMA_VERSION}). ` +
        'Please update BluePLM to the latest version for the best experience.',
    }
  }

  // Database is older than app expects: always a hard block since 5.0 (no soft mode).
  if (dbVersion < MINIMUM_COMPATIBLE_VERSION) {
    return {
      status: 'incompatible',
      dbVersion,
      expectedVersion: EXPECTED_SCHEMA_VERSION,
      message: 'Database schema update required',
      details:
        `Your organization's database (v${dbVersion}) is too old for this app version. ` +
        `Required: v${MINIMUM_COMPATIBLE_VERSION}+. An organization admin upgrades it from the ` +
        'BluePLM desktop app (Database upgrade required).',
    }
  }

  // Unreachable while MINIMUM_COMPATIBLE_VERSION === EXPECTED_SCHEMA_VERSION; kept as the
  // exhaustive answer for any version the branches above did not take.
  return {
    status: 'incompatible',
    dbVersion,
    expectedVersion: EXPECTED_SCHEMA_VERSION,
    message: 'Database schema update required',
    details: `Your organization's database (v${dbVersion}) must be upgraded to v${EXPECTED_SCHEMA_VERSION}.`,
  }
}

/** True when this app cannot run against the database at all (5.0: anything below 500). */
export function requiresDatabaseUpgrade(dbVersion: number | null): boolean {
  return dbVersion === null || dbVersion < MINIMUM_COMPATIBLE_VERSION
}
