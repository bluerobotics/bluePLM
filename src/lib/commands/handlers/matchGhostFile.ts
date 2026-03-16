/**
 * Match Ghost File Command
 * 
 * Resolves a ghost file (server record with stale path, diffStatus === 'deleted')
 * by updating the server path to match a local candidate file via moveFileOnServer.
 * This is the user-driven resolution for files renamed outside of BluePLM's tracking.
 */

import type { Command, MatchGhostFileParams, CommandResult } from '../types'
import { moveFileOnServer } from '../../supabase/files/move'
import { log } from '@/lib/logger'

export const matchGhostFileCommand: Command<MatchGhostFileParams> = {
  id: 'match-ghost-file',
  name: 'Match Ghost File',
  description: 'Match a ghost file to its renamed local counterpart by updating the server path',

  validate({ ghostFile, targetFile }, ctx) {
    if (!ctx.user) {
      return 'Please sign in first'
    }

    if (!ghostFile?.pdmData?.id) {
      return 'Ghost file has no server record'
    }

    if (ghostFile.diffStatus !== 'deleted') {
      return 'Selected file is not a ghost file (expected diffStatus: deleted)'
    }

    if (ghostFile.pdmData.checked_out_by !== ctx.user.id) {
      return 'Ghost file is not checked out by you'
    }

    if (!targetFile) {
      return 'No target file selected'
    }

    if (targetFile.diffStatus !== 'added') {
      return 'Target file is not an unmatched local file (expected diffStatus: added)'
    }

    return null
  },

  async execute({ ghostFile, targetFile }, ctx): Promise<CommandResult> {
    const user = ctx.user!

    log.info('[MatchGhostFile]', 'Matching ghost to local file', {
      ghostPath: ghostFile.relativePath,
      targetPath: targetFile.relativePath,
      fileId: ghostFile.pdmData!.id,
    })

    const result = await moveFileOnServer(
      ghostFile.pdmData!.id,
      user.id,
      targetFile.relativePath,
      targetFile.name
    )

    if (!result.success) {
      log.error('[MatchGhostFile]', 'Failed to update server path', {
        error: result.error,
        ghostPath: ghostFile.relativePath,
        targetPath: targetFile.relativePath,
      })
      ctx.addToast('error', `Failed to match ghost file: ${result.error}`)
      return {
        success: false,
        message: result.error || 'Failed to update server path',
        total: 1,
        succeeded: 0,
        failed: 1,
      }
    }

    log.info('[MatchGhostFile]', 'Successfully matched ghost file', {
      oldPath: ghostFile.relativePath,
      newPath: targetFile.relativePath,
    })

    ctx.addToast('success', `Matched "${ghostFile.name}" → "${targetFile.name}"`)
    ctx.onRefresh?.()

    return {
      success: true,
      message: `Matched ghost file to ${targetFile.relativePath}`,
      total: 1,
      succeeded: 1,
      failed: 0,
    }
  },
}
