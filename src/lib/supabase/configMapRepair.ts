/**
 * Calling the configuration-map repair, and nothing else.
 *
 * This module is the only thing in the application that can change a reserved per-configuration
 * map, and all it does is hand an approved set to `file_repair_config_maps` and translate the receipt.
 * It performs no merge of its own: the merge is `computed || existing` inside the database
 * function, where the row is on the right and the key set can only grow, so there is no argument
 * this module could construct that would overwrite or delete an entry.
 *
 * Every 5.0 database has the function (schema 94 added it), so any error is a real failure and is
 * passed on with the database's own message.
 */

import { getSupabaseClient } from '@/lib/supabase/client'
import { log } from '@/lib/logger'
import { CONFIG_DESCRIPTIONS_KEY, CONFIG_TABS_KEY } from '@/lib/metadata/divergence'
import type { ConfigMapKey } from '@/lib/metadata/configMapRepair'
import type {
  VaultAuditRepairFile,
  VaultAuditRepairFileOutcome,
  VaultAuditRepairOutcome,
} from '@/types/vaultAudit'

const RESERVED_MAPS: readonly ConfigMapKey[] = [CONFIG_TABS_KEY, CONFIG_DESCRIPTIONS_KEY]

/**
 * The client Supabase's generated types do not know about.
 *
 * `src/types/supabase.ts` is generated from the deployed schema, and a function staged for the
 * next release is not in it. Narrowed to the one call rather than casting the whole client to
 * `any`, so the argument and return shapes are still checked at every call site.
 */
interface RepairRpcClient {
  rpc: (
    name: 'file_repair_config_maps',
    args: { p_org_id: string; p_repairs: unknown },
  ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asNumber(value: unknown): number {
  return typeof value === 'number' ? value : 0
}

/**
 * Read one file's receipt.
 *
 * Tolerant about shape and strict about meaning: an entry it cannot read reports zero added rather
 * than being dropped, because a file silently missing from the receipt would read as a file that
 * was never asked about.
 *
 * `entries_requested` is only on the branch that could not resolve the row - the applied branch
 * reports the same number per map - so it is read from whichever of the two the function used. A
 * refused file whose request went uncounted here is a file whose dropped entries never reach the
 * receipt's arithmetic, which is the shape of the defect the SQL side had.
 */
function readFileOutcome(raw: unknown): VaultAuditRepairFileOutcome {
  const record = isRecord(raw) ? raw : {}
  const maps = isRecord(record.maps) ? record.maps : {}

  const added: Partial<Record<ConfigMapKey, number>> = {}
  const mapsAbsent: ConfigMapKey[] = []
  let requestedAcrossMaps = 0
  let entriesUnderAbsentMap = 0

  for (const key of RESERVED_MAPS) {
    const report = maps[key]
    if (!isRecord(report)) continue

    const requested = asNumber(report.requested)
    requestedAcrossMaps += requested

    if (report.refused === 'map-absent') {
      mapsAbsent.push(key)
      entriesUnderAbsentMap += requested
      continue
    }
    added[key] = asNumber(report.added)
  }

  return {
    fileId: typeof record.file_id === 'string' ? record.file_id : '',
    relativePath: typeof record.file_path === 'string' ? record.file_path : null,
    updated: record.updated === true,
    refused: typeof record.refused === 'string' ? record.refused : null,
    entriesRequested:
      typeof record.entries_requested === 'number'
        ? record.entries_requested
        : requestedAcrossMaps,
    added,
    mapsAbsent,
    entriesUnderAbsentMap,
  }
}

function readOutcome(raw: unknown): VaultAuditRepairOutcome {
  const record = isRecord(raw) ? raw : {}
  const files = Array.isArray(record.files) ? record.files : []

  return {
    filesRequested: asNumber(record.files_requested),
    filesUpdated: asNumber(record.files_updated),
    entriesRequested: asNumber(record.entries_requested),
    entriesAdded: asNumber(record.entries_added),
    files: files.map(readFileOutcome),
  }
}

/** The wire shape `repair_config_maps` expects. Snake-cased here, at the boundary. */
function toPayload(files: readonly VaultAuditRepairFile[]): unknown[] {
  return files.map((file) => ({ file_id: file.fileId, maps: file.maps }))
}

/**
 * Apply an approved set of repairs.
 *
 * Throws an `Error` carrying the database's own message on failure - including the two refusals the function
 * raises for itself, which are an authorization answer and a malformed request rather than
 * anything the caller should retry.
 */
export async function applyConfigMapRepair(
  orgId: string,
  files: readonly VaultAuditRepairFile[],
): Promise<VaultAuditRepairOutcome> {
  const client = getSupabaseClient() as unknown as RepairRpcClient

  const { data, error } = await client.rpc('file_repair_config_maps', {
    p_org_id: orgId,
    p_repairs: toPayload(files),
  })

  if (error) throw new Error(error.message)

  const outcome = readOutcome(data)

  log.info('[ConfigMapRepair]', 'Repair applied', {
    filesRequested: outcome.filesRequested,
    filesUpdated: outcome.filesUpdated,
    entriesRequested: outcome.entriesRequested,
    entriesAdded: outcome.entriesAdded,
  })

  return outcome
}
