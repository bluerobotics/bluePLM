/**
 * Server backups: see worker.ts for what runs when, repository.ts for the
 * format, and api/scripts/backup.ts for the sandbox, dry run, verify and
 * restore commands.
 */

import type { Env } from '../config/env.js'
import { createSupabaseAdminClient } from '../infrastructure/supabase.js'
import type { BackupLogger } from './engine.js'
import { SERVER_REPOSITORY_PREFIX } from './repository.js'
import { S3ObjectStore } from './s3Store.js'
import { SupabaseBackupSource } from './source.js'
import { BackupWorker, type ServerBackupConfig } from './worker.js'

export { BackupWorker, planJob } from './worker.js'

export function s3StoreFor(config: ServerBackupConfig): S3ObjectStore {
  return new S3ObjectStore({
    provider: config.provider,
    bucket: config.bucket as string,
    region: config.region,
    endpoint: config.endpoint,
    accessKey: config.access_key_encrypted as string,
    secretKey: config.secret_key_encrypted as string,
    prefix: SERVER_REPOSITORY_PREFIX,
  })
}

/** Starts the worker when this API is configured for it; returns null when it is not. */
export function startBackupWorker(
  env: Env,
  log: { info: (obj: object, msg: string) => void; warn: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void },
  version: string,
): BackupWorker | null {
  if (!env.BACKUP_WORKER) {
    log.info({}, 'Backup worker off (BACKUP_WORKER=false)')
    return null
  }
  if (!env.SUPABASE_SERVICE_KEY) {
    log.warn({}, 'Backup worker not started: SUPABASE_SERVICE_KEY is not set')
    return null
  }
  const admin = createSupabaseAdminClient()
  const logger: BackupLogger = {
    info: (message, data) => log.info(data ?? {}, message),
    warn: (message, data) => log.warn(data ?? {}, message),
    error: (message, data) => log.error(data ?? {}, message),
  }
  const worker = new BackupWorker({
    admin,
    openStore: s3StoreFor,
    openSource: (orgId) => new SupabaseBackupSource(admin, orgId, env.SUPABASE_URL),
    log: logger,
    version,
  })
  worker.start()
  log.info({}, 'Backup worker started')
  return worker
}
