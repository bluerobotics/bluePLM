// Supabase queries for Change Control. Plain table reads and writes under RLS, plus the two
// SECURITY DEFINER RPCs the module defines (instantiate_process_template, approve_eco_gate).
// The desktop's equivalents live in src/features/change-control (not importable here) and
// src/lib/supabase/ecoHelpers.ts; the shapes written match theirs.
import { getSupabaseClient } from '@/lib/supabase/client'
import { loadVaults } from '@web/features/files/api'
import type { Database } from '@/types/supabase'
import {
  ECO_ACTIVITY,
  isUuid,
  type ChecklistStatusPatch,
  type DeviationStatusPatch,
  type EcoStatusPatch,
  type PermissionGrant,
} from './model'

type Tables = Database['public']['Tables']
export type EcoRow = Tables['ecos']['Row']
export type DeviationRow = Tables['deviations']['Row']
export type ChecklistItemRow = Tables['eco_checklist_items']['Row']
export type GateRow = Tables['eco_gate_approvals']['Row']
export type ActivityRow = Tables['eco_checklist_activity']['Row']
export type ProcessTemplateRow = Pick<Tables['process_templates']['Row'], 'id' | 'name' | 'description' | 'is_default'>

export interface UserSummary {
  id: string
  full_name: string | null
  email: string | null
}

export interface FileSummary {
  id: string
  file_name: string
  file_path: string
  part_number: string | null
  revision: string
  version: number
}

export interface FileLink {
  id: string
  file_id: string
  created_at: string | null
  created_by: string
  notes: string | null
  /** Null when the file is in a vault this user cannot open, or was removed. */
  file: FileSummary | null
}

export interface DeviationFileLink extends FileLink {
  file_version: number | null
  file_revision: string | null
}

export class QueryError extends Error {
  code: string | null
  constructor(error: { message: string; code?: string | null }) {
    super(error.message)
    this.name = 'QueryError'
    this.code = error.code ?? null
  }
}

function fail(error: { message: string; code?: string | null } | null): void {
  if (error) throw new QueryError(error)
}

const client = () => getSupabaseClient()

const FILE_COLUMNS = 'id, file_name, file_path, part_number, revision, version, vault_id'

/** Who is asking: RLS on `files` is org-wide, so vault access is applied here (as in Files). */
export interface VaultAccess {
  userId: string
  orgId: string
  isAdmin: boolean
}

async function accessibleVaultIds(access: VaultAccess): Promise<string[]> {
  return (await loadVaults(access.userId, access.orgId, access.isAdmin)).map((vault) => vault.id)
}

function toSummary({ vault_id: _vaultId, ...file }: FileSummary & { vault_id: string | null }): FileSummary {
  return file
}

// ---------------------------------------------------------------------------------------------
// Shared lookups
// ---------------------------------------------------------------------------------------------

export async function loadPermissionGrants(userId: string): Promise<PermissionGrant[]> {
  const { data, error } = await client().rpc('get_user_permissions', { p_user_id: userId })
  fail(error)
  return (data ?? []).map((row) => ({ resource: row.resource, actions: row.actions }))
}

export async function loadUsers(ids: Iterable<string | null | undefined>): Promise<Map<string, UserSummary>> {
  const unique = [...new Set([...ids].filter((id): id is string => !!id))]
  const map = new Map<string, UserSummary>()
  if (unique.length === 0) return map
  const { data, error } = await client().from('users').select('id, full_name, email').in('id', unique)
  fail(error)
  for (const user of data ?? []) map.set(user.id, user)
  return map
}

async function loadFiles(ids: string[], access: VaultAccess): Promise<Map<string, FileSummary>> {
  const map = new Map<string, FileSummary>()
  if (ids.length === 0) return map
  const vaultIds = new Set(await accessibleVaultIds(access))
  const unique = [...new Set(ids)]
  for (let i = 0; i < unique.length; i += 100) {
    const { data, error } = await client().from('files').select(FILE_COLUMNS).in('id', unique.slice(i, i + 100))
    fail(error)
    for (const file of data ?? []) {
      if (file.vault_id && vaultIds.has(file.vault_id)) map.set(file.id, toSummary(file))
    }
  }
  return map
}

/** Active files in the user's vaults whose name, path or part number contains the term (sanitized by the caller). */
export async function searchFiles(access: VaultAccess, term: string): Promise<FileSummary[]> {
  if (!term) return []
  const vaultIds = await accessibleVaultIds(access)
  if (vaultIds.length === 0) return []
  const pattern = `%${term}%`
  const { data, error } = await client()
    .from('files')
    .select(FILE_COLUMNS)
    .eq('org_id', access.orgId)
    .in('vault_id', vaultIds)
    .is('deleted_at', null)
    .or(`file_name.ilike.${pattern},part_number.ilike.${pattern},file_path.ilike.${pattern}`)
    .order('file_name')
    .limit(25)
  fail(error)
  return (data ?? []).map(toSummary)
}

const ID_CHUNK = 100
const LINK_PAGE = 1000

/**
 * Tagged-file counts per ECO or deviation. Ids go in chunks (a few hundred UUIDs in one `in.()`
 * would pass the URL limit) and each chunk is paged, so PostgREST's row cap cannot cut a count short.
 */
async function countLinks(
  table: 'file_ecos' | 'file_deviations',
  column: 'eco_id' | 'deviation_id',
  ids: readonly string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK)
    for (let offset = 0; ; offset += LINK_PAGE) {
      const { data, error } = await client()
        .from(table)
        .select(`id, ${column}`)
        .in(column, chunk)
        .order('id')
        .range(offset, offset + LINK_PAGE - 1)
      fail(error)
      const rows = (data ?? []) as unknown as Array<Record<typeof column, string>>
      for (const row of rows) counts.set(row[column], (counts.get(row[column]) ?? 0) + 1)
      if (rows.length < LINK_PAGE) break
    }
  }
  return counts
}

// ---------------------------------------------------------------------------------------------
// ECOs
// ---------------------------------------------------------------------------------------------

export interface EcoListData {
  ecos: EcoRow[]
  fileCounts: Map<string, number>
  users: Map<string, UserSummary>
}

export async function listEcos(orgId: string): Promise<EcoListData> {
  const { data, error } = await client().from('ecos').select('*').eq('org_id', orgId).order('created_at', { ascending: false })
  fail(error)
  const ecos = data ?? []
  const fileCounts = await countLinks('file_ecos', 'eco_id', ecos.map((eco) => eco.id))
  const users = await loadUsers(ecos.map((eco) => eco.created_by))
  return { ecos, fileCounts, users }
}

export interface EcoDetailData {
  eco: EcoRow
  files: FileLink[]
  checklist: ChecklistItemRow[]
  gates: GateRow[]
  activity: ActivityRow[]
  templates: ProcessTemplateRow[]
  users: Map<string, UserSummary>
}

/** Null when the ECO does not exist or belongs to another organization (RLS hides it). */
export async function getEco(id: string, access: VaultAccess): Promise<EcoDetailData | null> {
  if (!isUuid(id)) return null
  const { data: eco, error } = await client().from('ecos').select('*').eq('id', id).maybeSingle()
  fail(error)
  if (!eco) return null
  const [links, checklist, gates, activity, templates] = await Promise.all([
    client().from('file_ecos').select('id, file_id, created_at, created_by, notes').eq('eco_id', id).order('created_at', { ascending: false }),
    client().from('eco_checklist_items').select('*').eq('eco_id', id),
    client().from('eco_gate_approvals').select('*').eq('eco_id', id),
    client().from('eco_checklist_activity').select('*').eq('eco_id', id).order('performed_at', { ascending: false }).limit(200),
    client().from('process_templates').select('id, name, description, is_default').eq('org_id', eco.org_id).eq('is_active', true).order('name'),
  ])
  for (const result of [links, checklist, gates, activity, templates]) fail(result.error)
  const linkRows = links.data ?? []
  const files = await loadFiles(linkRows.map((link) => link.file_id), access)
  const users = await loadUsers([
    eco.created_by,
    eco.updated_by,
    ...linkRows.map((link) => link.created_by),
    ...(activity.data ?? []).map((row) => row.performed_by),
    ...(gates.data ?? []).map((gate) => gate.approved_by),
    ...(checklist.data ?? []).map((item) => item.completed_by),
  ])
  return {
    eco,
    files: linkRows.map((link) => ({ ...link, file: files.get(link.file_id) ?? null })),
    checklist: checklist.data ?? [],
    gates: gates.data ?? [],
    activity: activity.data ?? [],
    templates: templates.data ?? [],
    users,
  }
}

/**
 * ECO activity is written to eco_checklist_activity, the module's only ECO-scoped log. Best
 * effort: the change it describes has already been made, so a failed log line is not an error.
 */
export async function logEcoActivity(
  ecoId: string,
  userId: string,
  action: string,
  values: { old?: string | null; new?: string | null; notes?: string | null; checklistItemId?: string | null } = {},
): Promise<void> {
  await client().from('eco_checklist_activity').insert({
    eco_id: ecoId,
    action,
    old_value: values.old ?? null,
    new_value: values.new ?? null,
    notes: values.notes ?? null,
    checklist_item_id: values.checklistItemId ?? null,
    performed_by: userId,
  })
}

export async function createEco(
  orgId: string,
  userId: string,
  values: { eco_number: string; title: string | null; description: string | null },
): Promise<string> {
  const { data, error } = await client()
    .from('ecos')
    .insert({ org_id: orgId, created_by: userId, status: 'open', ...values })
    .select('id')
    .single()
  fail(error)
  if (!data) throw new QueryError({ message: 'No row returned' })
  await logEcoActivity(data.id, userId, ECO_ACTIVITY.created, { new: values.eco_number })
  return data.id
}

/** Update an ECO; throws when RLS let no row through (no edit permission). */
export async function updateEco(
  id: string,
  patch: Tables['ecos']['Update'] | EcoStatusPatch,
): Promise<void> {
  const { data, error } = await client().from('ecos').update(patch).eq('id', id).select('id')
  fail(error)
  if (!data || data.length === 0) throw new QueryError({ message: 'Not allowed', code: '42501' })
}

export async function deleteEco(id: string): Promise<void> {
  const { data, error } = await client().from('ecos').delete().eq('id', id).select('id')
  fail(error)
  if (!data || data.length === 0) throw new QueryError({ message: 'Not allowed', code: '42501' })
}

/** Tag files; already-tagged files are left as they are. */
export async function addFilesToEco(ecoId: string, fileIds: string[], userId: string): Promise<void> {
  const { error } = await client()
    .from('file_ecos')
    .upsert(
      fileIds.map((fileId) => ({ eco_id: ecoId, file_id: fileId, created_by: userId })),
      { onConflict: 'file_id,eco_id', ignoreDuplicates: true },
    )
  fail(error)
}

export async function removeEcoFile(linkId: string): Promise<void> {
  const { data, error } = await client().from('file_ecos').delete().eq('id', linkId).select('id')
  fail(error)
  if (!data || data.length === 0) throw new QueryError({ message: 'Not allowed', code: '42501' })
}

export async function updateChecklistItem(id: string, patch: ChecklistStatusPatch): Promise<void> {
  const { data, error } = await client().from('eco_checklist_items').update(patch).eq('id', id).select('id')
  fail(error)
  if (!data || data.length === 0) throw new QueryError({ message: 'Not allowed', code: '42501' })
}

export async function applyProcessTemplate(ecoId: string, templateId: string): Promise<void> {
  const { error } = await client().rpc('instantiate_process_template', { p_eco_id: ecoId, p_template_id: templateId })
  fail(error)
}

export type GateApprovalResult = { success: true } | { success: false; error: string; incomplete: string[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function approveGate(ecoId: string, gateName: string, notes: string | null): Promise<GateApprovalResult> {
  const { data, error } = await client().rpc('approve_eco_gate', { p_eco_id: ecoId, p_gate_name: gateName, p_notes: notes ?? undefined })
  fail(error)
  if (isRecord(data) && data.success === true) return { success: true }
  const incomplete = isRecord(data) && Array.isArray(data.incomplete_items) ? data.incomplete_items.filter((v): v is string => typeof v === 'string') : []
  const message = isRecord(data) && typeof data.error === 'string' ? data.error : ''
  return { success: false, error: message, incomplete }
}

// ---------------------------------------------------------------------------------------------
// Deviations
// ---------------------------------------------------------------------------------------------

export interface DeviationListData {
  deviations: DeviationRow[]
  fileCounts: Map<string, number>
  users: Map<string, UserSummary>
}

export async function listDeviations(orgId: string): Promise<DeviationListData> {
  const { data, error } = await client().from('deviations').select('*').eq('org_id', orgId).order('created_at', { ascending: false })
  fail(error)
  const deviations = data ?? []
  const fileCounts = await countLinks('file_deviations', 'deviation_id', deviations.map((deviation) => deviation.id))
  const users = await loadUsers(deviations.flatMap((deviation) => [deviation.created_by, deviation.approved_by]))
  return { deviations, fileCounts, users }
}

export interface DeviationDetailData {
  deviation: DeviationRow
  files: DeviationFileLink[]
  users: Map<string, UserSummary>
}

export async function getDeviation(id: string, access: VaultAccess): Promise<DeviationDetailData | null> {
  if (!isUuid(id)) return null
  const { data: deviation, error } = await client().from('deviations').select('*').eq('id', id).maybeSingle()
  fail(error)
  if (!deviation) return null
  const { data: links, error: linkError } = await client()
    .from('file_deviations')
    .select('id, file_id, created_at, created_by, notes, file_version, file_revision')
    .eq('deviation_id', id)
    .order('created_at', { ascending: false })
  fail(linkError)
  const linkRows = links ?? []
  const files = await loadFiles(linkRows.map((link) => link.file_id), access)
  const users = await loadUsers([deviation.created_by, deviation.updated_by, deviation.approved_by, ...linkRows.map((link) => link.created_by)])
  return { deviation, files: linkRows.map((link) => ({ ...link, file: files.get(link.file_id) ?? null })), users }
}

export type DeviationValues = Pick<
  DeviationRow,
  'deviation_number' | 'title' | 'description' | 'deviation_type' | 'effective_date' | 'expiration_date' | 'affected_part_numbers'
>

export async function createDeviation(orgId: string, userId: string, values: DeviationValues): Promise<string> {
  const { data, error } = await client()
    .from('deviations')
    .insert({ org_id: orgId, created_by: userId, status: 'draft', ...values, effective_date: values.effective_date ?? undefined })
    .select('id')
    .single()
  fail(error)
  if (!data) throw new QueryError({ message: 'No row returned' })
  return data.id
}

export async function updateDeviation(id: string, patch: Tables['deviations']['Update'] | DeviationStatusPatch): Promise<void> {
  const { data, error } = await client().from('deviations').update(patch).eq('id', id).select('id')
  fail(error)
  if (!data || data.length === 0) throw new QueryError({ message: 'Not allowed', code: '42501' })
}

export async function deleteDeviation(id: string): Promise<void> {
  const { data, error } = await client().from('deviations').delete().eq('id', id).select('id')
  fail(error)
  if (!data || data.length === 0) throw new QueryError({ message: 'Not allowed', code: '42501' })
}

/**
 * Tag files to a deviation, optionally pinned to their current version and revision (as the
 * desktop's "specific version" option), and add their part numbers to the deviation's list.
 */
export async function addFilesToDeviation(
  deviationId: string,
  files: FileSummary[],
  userId: string,
  options: { pinVersion: boolean; notes: string | null; affectedPartNumbers: string[] },
): Promise<void> {
  const { error } = await client()
    .from('file_deviations')
    .upsert(
      files.map((file) => ({
        deviation_id: deviationId,
        file_id: file.id,
        file_version: options.pinVersion ? file.version : null,
        file_revision: options.pinVersion ? file.revision : null,
        notes: options.notes,
        created_by: userId,
      })),
      { onConflict: 'file_id,deviation_id', ignoreDuplicates: true },
    )
  fail(error)
  const { error: partsError } = await client()
    .from('deviations')
    .update({ affected_part_numbers: options.affectedPartNumbers, updated_at: new Date().toISOString(), updated_by: userId })
    .eq('id', deviationId)
  fail(partsError)
}

export async function removeDeviationFile(linkId: string): Promise<void> {
  const { data, error } = await client().from('file_deviations').delete().eq('id', linkId).select('id')
  fail(error)
  if (!data || data.length === 0) throw new QueryError({ message: 'Not allowed', code: '42501' })
}
