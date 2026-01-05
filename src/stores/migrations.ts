/**
 * Store Migration System
 * 
 * Each migration transforms persisted state from one version to the next.
 * Migrations run in order when the app loads with older persisted data.
 */

export interface StoreMigration {
  version: number
  description: string
  migrate: (state: Record<string, unknown>) => Record<string, unknown>
}

// Current schema version - increment when adding migrations
export const CURRENT_STORE_VERSION = 1

/**
 * All migrations in order. Each transforms state from previous version.
 */
export const migrations: StoreMigration[] = [
  // Example migration for future use:
  // {
  //   version: 2,
  //   description: 'Rename sidebarWidth to primarySidebarWidth',
  //   migrate: (state) => {
  //     const { sidebarWidth, ...rest } = state
  //     return { ...rest, primarySidebarWidth: sidebarWidth ?? 280 }
  //   }
  // }
]

/**
 * Run all necessary migrations on persisted state
 */
export function runMigrations(
  persistedState: Record<string, unknown>,
  fromVersion: number
): Record<string, unknown> {
  let state = { ...persistedState }
  
  for (const migration of migrations) {
    if (migration.version > fromVersion) {
      console.log(`[Store] Running migration v${migration.version}: ${migration.description}`)
      state = migration.migrate(state)
    }
  }
  
  // Always set current version after migrations
  state._storeVersion = CURRENT_STORE_VERSION
  
  return state
}

/**
 * Get the version from persisted state, defaulting to 0 for legacy data
 */
export function getPersistedVersion(state: Record<string, unknown>): number {
  return typeof state._storeVersion === 'number' ? state._storeVersion : 0
}
