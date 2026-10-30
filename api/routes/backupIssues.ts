/**
 * Repairing damaged or missing vault content (schema 503), admins only.
 *
 * Only the service role may write a vault object, so these routes are how an admin's repair
 * reaches storage. The work and its checks live in src/backup/repair.ts: bytes are re-hashed
 * against the name before anything is written, and read back and hashed again after.
 *
 *   GET  /backup/issues/:hash/copies   which server-backup snapshots hold good bytes
 *   POST /backup/issues/:hash/restore  restore the content from the server backup
 *   POST /backup/issues/:hash/upload   store a desktop's copy (application/octet-stream body)
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import { BackupRepository } from '../src/backup/repository.js'
import { RepairError, readBackupCopy, repairFromUpload, restoreFromBackup, snapshotsHolding } from '../src/backup/repair.js'
import type { ServerBackupConfig } from '../src/backup/worker.js'
import { createSupabaseAdminClient } from '../src/infrastructure/supabase.js'
import { sendError } from '../utils/index.js'

/** Largest desktop copy accepted in one request. */
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024

// No pattern on :hash in the schema: Fastify validates before the authenticate preHandler runs,
// so a pattern would answer 400 to a caller with no token instead of 401. Checked after auth.
const hashParams = {
  type: 'object',
  required: ['hash'],
  properties: { hash: { type: 'string' } },
} as const

/** The caller's organization, after refusing a non-admin; then the content hash, checked. */
function requireAdmin(request: FastifyRequest): { orgId: string; hash: string } {
  if (!request.user?.isAdmin || !request.user.org_id) {
    throw { statusCode: 403, message: 'Only administrators can repair damaged files' }
  }
  const { hash } = request.params as { hash: string }
  if (!/^[0-9a-f]{64}$/.test(hash)) throw { statusCode: 400, message: 'Not a content hash' }
  return { orgId: request.user.org_id, hash }
}

async function openRepository(orgId: string): Promise<BackupRepository> {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin.from('backup_config').select('*').eq('org_id', orgId).maybeSingle()
  if (error || !data) throw new RepairError('Server backups are not set up for this organization.', 404, 'NO_BACKUP')
  const config = data as unknown as ServerBackupConfig
  if (!config.bucket || !config.restic_password_encrypted) {
    throw new RepairError('Server backups are not set up for this organization.', 404, 'NO_BACKUP')
  }
  // Imported here, not at the top: the AWS SDK is an API dependency only, and the route tests
  // (which run from the root install) load this module.
  const { s3StoreFor } = await import('../src/backup/index.js')
  return BackupRepository.open(s3StoreFor(config), config.restic_password_encrypted)
}

function sendRepairError(reply: FastifyReply, err: unknown) {
  if (err instanceof RepairError) return sendError(reply, err.statusCode, err.code, err.message)
  throw err
}

export default async function backupIssueRoutes(fastify: FastifyInstance) {
  fastify.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: MAX_UPLOAD_BYTES }, (_req, body, done) =>
    done(null, body),
  )

  fastify.get(
    '/backup/issues/:hash/copies',
    {
      schema: {
        description: 'Which server-backup snapshots hold good bytes for a damaged or missing file (admins)',
        tags: ['Backups'],
        security: [{ bearerAuth: [] }],
        params: hashParams,
      },
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      const { orgId, hash } = requireAdmin(request)
      try {
        const repo = await openRepository(orgId)
        const stored = (await repo.store.head(repo.blobKey(hash))) !== null
        return { stored, snapshots: stored ? await snapshotsHolding(repo, hash) : [] }
      } catch (err) {
        return sendRepairError(reply, err)
      }
    },
  )

  fastify.post(
    '/backup/issues/:hash/restore',
    {
      schema: {
        description: 'Restore damaged or missing vault content from the server backup (admins)',
        tags: ['Backups'],
        security: [{ bearerAuth: [] }],
        params: hashParams,
      },
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      const { orgId, hash } = requireAdmin(request)
      try {
        const repo = await openRepository(orgId)
        if (!(await readBackupCopy(repo, hash))) {
          throw new RepairError('The server backup does not hold this content.', 404, 'NO_BACKUP_COPY')
        }
        const written = await restoreFromBackup(createSupabaseAdminClient(), repo, orgId, hash, request.user!.id)
        request.log.info({ orgId, hash, actor: request.user!.id }, 'backup: restored vault content from backup')
        return { success: true, ...written }
      } catch (err) {
        return sendRepairError(reply, err)
      }
    },
  )

  fastify.post(
    '/backup/issues/:hash/upload',
    {
      schema: {
        description: "Store a desktop's copy of damaged or missing vault content, if it hashes to the name (admins)",
        tags: ['Backups'],
        security: [{ bearerAuth: [] }],
        params: hashParams,
      },
      bodyLimit: MAX_UPLOAD_BYTES,
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      const { orgId, hash } = requireAdmin(request)
      const body = request.body
      if (!Buffer.isBuffer(body) || body.length === 0) {
        return sendError(reply, 400, 'NO_CONTENT', 'Send the file as an application/octet-stream body.')
      }
      try {
        const written = await repairFromUpload(createSupabaseAdminClient(), orgId, hash, body, request.user!.id)
        request.log.info({ orgId, hash, actor: request.user!.id }, 'backup: stored a desktop copy of vault content')
        return { success: true, ...written }
      } catch (err) {
        return sendRepairError(reply, err)
      }
    },
  )
}
