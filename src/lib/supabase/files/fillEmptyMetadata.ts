import { getSupabaseClient } from '../client'
import { getCurrentUserEmail } from '../auth'

import { nonEmptyText } from './metadataValue'

export type FillableMetadataField = 'part_number' | 'description'

export interface FillEmptyMetadataResult {
  /** Fields this call wrote. */
  filled: FillableMetadataField[]
  /** Fields that already held a value when the write ran, so were left alone. */
  alreadySet: FillableMetadataField[]
  /** Fields the database did not let this user write, or a row that is gone or trashed. */
  refused: FillableMetadataField[]
  /** Another user holds the checkout, so nothing was written. */
  heldByOther: boolean
  /** The row after the write, for the store. Absent when nothing was filled. */
  row?: { part_number: string | null; description: string | null; updated_at: string | null }
  error?: string
}

const ROW_COLUMNS = 'id, part_number, description, updated_at'

/** One file's worth of a fill request. */
export interface FillEmptyMetadataRequest {
  fileId: string
  relativePath: string
  values: Partial<Record<FillableMetadataField, string>>
}

/** What a batch did, counted in values except where a whole file was skipped or failed. */
export interface FillEmptyMetadataReceipt {
  filled: number
  alreadySet: number
  refused: number
  /** Files skipped because another user had them checked out at write time. */
  heldByOther: string[]
  /** Files whose write errored, with the reason. */
  failed: Array<{ relativePath: string; reason: string }>
  /** Files the database refused at least one value for. */
  refusedPaths: string[]
  /** Every file that gained a value, with the row to put in the store. */
  updatedRows: Array<{ fileId: string; row: NonNullable<FillEmptyMetadataResult['row']> }>
  /** `${fileId}:${field}` for every value written. */
  filledKeys: string[]
}

/** Fill a batch of files one after the other, and account for every value asked for. */
export async function fillEmptyFileMetadataBatch(
  requests: readonly FillEmptyMetadataRequest[],
  userId: string,
): Promise<FillEmptyMetadataReceipt> {
  const receipt: FillEmptyMetadataReceipt = {
    filled: 0,
    alreadySet: 0,
    refused: 0,
    heldByOther: [],
    failed: [],
    refusedPaths: [],
    updatedRows: [],
    filledKeys: [],
  }

  for (const request of requests) {
    let result: FillEmptyMetadataResult
    try {
      result = await fillEmptyFileMetadata(request.fileId, userId, request.values)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      receipt.failed.push({ relativePath: request.relativePath, reason })
      continue
    }

    if (result.error) {
      receipt.failed.push({ relativePath: request.relativePath, reason: result.error })
    }
    if (result.heldByOther) receipt.heldByOther.push(request.relativePath)
    if (result.refused.length > 0) receipt.refusedPaths.push(request.relativePath)

    receipt.filled += result.filled.length
    receipt.alreadySet += result.alreadySet.length
    receipt.refused += result.refused.length
    receipt.filledKeys.push(...result.filled.map((field) => `${request.fileId}:${field}`))
    if (result.row) receipt.updatedRows.push({ fileId: request.fileId, row: result.row })
  }

  return receipt
}

/**
 * Write file-held values into `files.part_number` / `files.description`, but only into a column
 * that is still empty when the write runs.
 *
 * The emptiness test is part of the UPDATE itself, so a value someone checked in between the scan
 * and this call is never overwritten - the row wins, always. No version is cut: the content did
 * not change, and a version created while another user holds the checkout would suppress the one
 * their check-in is owed (`checkin_file` skips the increment once a version exists inside the
 * checkout window). The next check-in snapshots these values like any other.
 *
 * A file another user has checked out is skipped outright, read from the row rather than from the
 * caller's loaded files, so a file that is not in the local list is still protected.
 */
export async function fillEmptyFileMetadata(
  fileId: string,
  userId: string,
  values: Partial<Record<FillableMetadataField, string>>,
): Promise<FillEmptyMetadataResult> {
  const client = getSupabaseClient()
  const result: FillEmptyMetadataResult = {
    filled: [],
    alreadySet: [],
    refused: [],
    heldByOther: false,
  }

  const fields = (Object.keys(values) as FillableMetadataField[]).filter(
    (field) => nonEmptyText(values[field]) !== null,
  )
  if (fields.length === 0) return result

  const { data: file, error: fileError } = await client
    .from('file')
    .select('org_id, checked_out_by, deleted_at')
    .eq('id', fileId)
    .maybeSingle()
  if (fileError) return { ...result, error: fileError.message }
  if (!file || file.deleted_at) return { ...result, refused: fields }
  if (file.checked_out_by && file.checked_out_by !== userId) {
    return { ...result, heldByOther: true }
  }

  for (const field of fields) {
    const value = values[field] as string
    const stamp = { updated_at: new Date().toISOString(), updated_by: userId }
    const payload =
      field === 'part_number' ? { part_number: value, ...stamp } : { description: value, ...stamp }

    const { data, error } = await client
      .from('file')
      .update(payload)
      .eq('id', fileId)
      .is('deleted_at', null)
      .or(`${field}.is.null,${field}.eq.`)
      .select(ROW_COLUMNS)
      .maybeSingle()

    if (error) return { ...result, error: error.message }

    if (data) {
      result.filled.push(field)
      result.row = data
      continue
    }

    // No row came back: either the column was no longer empty, or row-level security hid the row
    // from the update. Reading it tells the two apart, and the answer decides what gets reported.
    const { data: current, error: readError } = await client
      .from('file')
      .select(ROW_COLUMNS)
      .eq('id', fileId)
      .maybeSingle()
    if (readError) return { ...result, error: readError.message }

    if (current && nonEmptyText(current[field]) !== null) result.alreadySet.push(field)
    else result.refused.push(field)
  }

  if (result.filled.length > 0) {
    try {
      await client.from('activity').insert({
        org_id: file.org_id,
        file_id: fileId,
        user_id: userId,
        user_email: await getCurrentUserEmail(),
        action: 'update',
        details: {
          metadataRestore: true,
          changedFields: result.filled,
          source: 'solidworks',
          versionCreated: false,
        },
      })
    } catch {
      // Activity logging is non-critical
    }
  }

  return result
}
