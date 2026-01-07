/**
 * SolidWorks integration utilities.
 * 
 * Provides shared functionality for SolidWorks-related features:
 * - Path matching and normalization
 * - Reference validation types
 * 
 * @example
 * import { matchSwPathToDb, normalizePath, type PathMatchResult } from '@/lib/solidworks'
 */

// Types
export type {
  PathMatchMethod,
  PathMatchResult,
  PathStatus,
  SWServiceReference,
  VaultFileSummary,
  BomNodePathStatus
} from './types'

// Path matching utilities
export {
  normalizePath,
  getPathSuffix,
  matchSwPathToDb,
  getPathStatusFromMatch
} from './pathMatching'
