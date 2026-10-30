// Pure change-control logic for BluePLM Web: statuses, the patches a status change writes,
// form validation, permissions from team grants, filters and history. No I/O here, so every rule
// the pages apply is covered by model.test.ts.
//
// The database decides (RLS on ecos, file_ecos, deviations, file_deviations and the checklist
// tables, 20-change-control.sql). These rules only decide what the UI offers.
import type { Database } from '@/types/supabase'

type Enums = Database['public']['Enums']
export type EcoStatus = Enums['eco_status']
export type DeviationStatus = Enums['deviation_status']
export type ChecklistStatus = Enums['checklist_item_status']
export type PermissionAction = Enums['permission_action']

export const ECO_STATUSES: readonly EcoStatus[] = ['open', 'in_progress', 'completed', 'cancelled']

/** Statuses a user can set by hand. `expired` follows from the expiration date, as on the desktop. */
export const DEVIATION_SETTABLE_STATUSES: readonly DeviationStatus[] = [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'closed',
]
export const DEVIATION_STATUSES: readonly DeviationStatus[] = [...DEVIATION_SETTABLE_STATUSES, 'expired']

export const CHECKLIST_STATUSES: readonly ChecklistStatus[] = ['not_started', 'in_progress', 'complete', 'blocked', 'na']

/** The deviation types the desktop offers; the stored value is this English word. */
export const DEVIATION_TYPES = ['Material', 'Dimension', 'Process', 'Documentation', 'Finish', 'Tolerance', 'Other'] as const

export function isKnownDeviationType(value: string | null | undefined): value is (typeof DEVIATION_TYPES)[number] {
  return !!value && (DEVIATION_TYPES as readonly string[]).includes(value)
}

// ---------------------------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------------------------

export interface PermissionGrant {
  resource: string
  actions: readonly string[]
}

export interface ModulePermissions {
  create: boolean
  edit: boolean
  delete: boolean
}

export interface ChangeControlPermissions {
  eco: ModulePermissions
  deviations: ModulePermissions
}

export const NO_PERMISSIONS: ChangeControlPermissions = {
  eco: { create: false, edit: false, delete: false },
  deviations: { create: false, edit: false, delete: false },
}

/**
 * Mirrors user_has_permission() in core.sql for the org-wide grants get_user_permissions returns:
 * an admin may do everything, an `admin` grant on a resource implies every action on it.
 */
export function hasGrant(grants: readonly PermissionGrant[], isAdmin: boolean, resource: string, action: PermissionAction): boolean {
  if (isAdmin) return true
  return grants.some(
    (grant) => grant.resource === resource && (grant.actions.includes(action) || grant.actions.includes('admin')),
  )
}

export function resolvePermissions(grants: readonly PermissionGrant[], isAdmin: boolean): ChangeControlPermissions {
  const forResource = (resource: string): ModulePermissions => ({
    create: hasGrant(grants, isAdmin, resource, 'create'),
    edit: hasGrant(grants, isAdmin, resource, 'edit'),
    delete: hasGrant(grants, isAdmin, resource, 'delete'),
  })
  return { eco: forResource('module:eco'), deviations: forResource('module:deviations') }
}

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

export const NUMBER_MAX_LENGTH = 64
export const TITLE_MAX_LENGTH = 200

/** ECO and deviation numbers are stored trimmed and upper case, as the desktop writes them. */
export function normalizeNumber(raw: string): string {
  return raw.trim().toUpperCase()
}

export type FieldError = 'required' | 'tooLong' | 'beforeEffective'

export interface EcoDraft {
  number: string
  title: string
  description: string
}

export type EcoDraftErrors = Partial<Record<keyof EcoDraft, FieldError>>

export function validateEcoDraft(draft: EcoDraft): EcoDraftErrors {
  const errors: EcoDraftErrors = {}
  const number = normalizeNumber(draft.number)
  if (!number) errors.number = 'required'
  else if (number.length > NUMBER_MAX_LENGTH) errors.number = 'tooLong'
  if (draft.title.trim().length > TITLE_MAX_LENGTH) errors.title = 'tooLong'
  return errors
}

export interface DeviationDraft {
  number: string
  title: string
  description: string
  type: string
  /** `YYYY-MM-DD` from a date input, or empty. */
  effectiveDate: string
  expirationDate: string
  partNumbers: string
}

export type DeviationDraftErrors = Partial<Record<keyof DeviationDraft, FieldError>>

export function validateDeviationDraft(draft: DeviationDraft): DeviationDraftErrors {
  const errors: DeviationDraftErrors = {}
  const number = normalizeNumber(draft.number)
  if (!number) errors.number = 'required'
  else if (number.length > NUMBER_MAX_LENGTH) errors.number = 'tooLong'
  const title = draft.title.trim()
  if (!title) errors.title = 'required'
  else if (title.length > TITLE_MAX_LENGTH) errors.title = 'tooLong'
  // Date inputs give ISO calendar dates, which compare correctly as strings.
  if (draft.effectiveDate && draft.expirationDate && draft.expirationDate < draft.effectiveDate) {
    errors.expirationDate = 'beforeEffective'
  }
  return errors
}

export function hasErrors(errors: object): boolean {
  return Object.keys(errors).length > 0
}

/** Part numbers typed as a list: commas, semicolons or new lines; trimmed, blanks and repeats dropped. */
export function parsePartNumbers(text: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of text.split(/[,;\n\r]+/)) {
    const value = raw.trim()
    if (value && !seen.has(value)) {
      seen.add(value)
      result.push(value)
    }
  }
  return result
}

export function mergePartNumbers(existing: readonly string[] | null | undefined, added: readonly (string | null | undefined)[]): string[] {
  return parsePartNumbers([...(existing ?? []), ...added.filter((value): value is string => !!value)].join('\n'))
}

/** Text with no trimmed content is stored as null, never as an empty string. */
export function nullableText(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

// ---------------------------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------------------------

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** A stored timestamp as the local calendar date a date input shows. */
export function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** A date input's value as a timestamp at local midnight, or null when empty or invalid. */
export function dateInputToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date.toISOString()
}

// ---------------------------------------------------------------------------------------------
// ECO status
// ---------------------------------------------------------------------------------------------

/** Like the desktop, any other status can be chosen; a completed or cancelled ECO can be reopened. */
export function ecoStatusTargets(current: EcoStatus | null): EcoStatus[] {
  const from = current ?? 'open'
  return ECO_STATUSES.filter((status) => status !== from)
}

export interface EcoStatusPatch {
  status: EcoStatus
  updated_at: string
  updated_by: string
  completed_at?: string | null
}

export function ecoStatusPatch(from: EcoStatus | null, to: EcoStatus, userId: string, nowIso: string): EcoStatusPatch {
  const patch: EcoStatusPatch = { status: to, updated_at: nowIso, updated_by: userId }
  if (to === 'completed') patch.completed_at = nowIso
  else if (from === 'completed') patch.completed_at = null
  return patch
}

/** Closed ECOs are the ones files should no longer be tagged to. */
export function isEcoActive(status: EcoStatus | null): boolean {
  return status !== 'completed' && status !== 'cancelled'
}

// ---------------------------------------------------------------------------------------------
// Deviation status
// ---------------------------------------------------------------------------------------------

export interface DeviationLike {
  status: DeviationStatus | null
  expiration_date: string | null
}

/** An approved deviation past its expiration date is expired, whatever the stored status says. */
export function effectiveDeviationStatus(deviation: DeviationLike, now: Date): DeviationStatus {
  const status = deviation.status ?? 'draft'
  if (status === 'approved' && deviation.expiration_date) {
    const expires = new Date(deviation.expiration_date)
    if (!Number.isNaN(expires.getTime()) && expires.getTime() <= now.getTime()) return 'expired'
  }
  return status
}

export function isExpiringSoon(deviation: DeviationLike, now: Date, days = 30): boolean {
  if (effectiveDeviationStatus(deviation, now) !== 'approved' || !deviation.expiration_date) return false
  const expires = new Date(deviation.expiration_date).getTime()
  return expires > now.getTime() && expires <= now.getTime() + days * 24 * 60 * 60 * 1000
}

export function deviationStatusTargets(current: DeviationStatus | null): DeviationStatus[] {
  const from = current ?? 'draft'
  return DEVIATION_SETTABLE_STATUSES.filter((status) => status !== from)
}

export interface DeviationStatusPatch {
  status: DeviationStatus
  updated_at: string
  updated_by: string
  approved_by?: string | null
  approved_at?: string | null
  rejection_reason?: string | null
}

export type DeviationStatusResult = { ok: true; patch: DeviationStatusPatch } | { ok: false; error: 'reasonRequired' }

/**
 * The columns a status change writes. Approving records who and when; rejecting needs a reason;
 * going back to draft or pending approval withdraws an earlier approval or rejection, since it no
 * longer stands. Closing keeps the record of how the deviation was decided.
 */
export function deviationStatusPatch(
  from: DeviationStatus | null,
  to: DeviationStatus,
  userId: string,
  nowIso: string,
  rejectionReason = '',
): DeviationStatusResult {
  const patch: DeviationStatusPatch = { status: to, updated_at: nowIso, updated_by: userId }
  if (to === 'approved') {
    patch.approved_by = userId
    patch.approved_at = nowIso
    patch.rejection_reason = null
  } else if (to === 'rejected') {
    const reason = rejectionReason.trim()
    if (!reason) return { ok: false, error: 'reasonRequired' }
    patch.rejection_reason = reason
    patch.approved_by = null
    patch.approved_at = null
  } else if (to === 'draft' || to === 'pending_approval') {
    if (from === 'approved' || from === 'expired') {
      patch.approved_by = null
      patch.approved_at = null
    }
    if (from === 'rejected') patch.rejection_reason = null
  }
  return { ok: true, patch }
}

// ---------------------------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------------------------

export interface Searchable {
  number: string
  title: string | null
  description: string | null
  extra?: readonly (string | null | undefined)[]
}

export function matchesQuery(item: Searchable, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [item.number, item.title, item.description, ...(item.extra ?? [])].some(
    (value) => !!value && value.toLowerCase().includes(needle),
  )
}

/** Characters that would change a PostgREST `or=(…ilike…)` filter or act as LIKE wildcards. */
export function sanitizeSearchTerm(query: string): string {
  return query.replace(/[%_,()\\*"]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Route ids are looked up as UUID columns; anything else is not found rather than a query error. */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export function isUniqueViolation(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false
  return error.code === '23505' || /duplicate key|unique/i.test(error.message ?? '')
}

// ---------------------------------------------------------------------------------------------
// Checklist (process template phases and gates)
// ---------------------------------------------------------------------------------------------

export interface ChecklistItemLike {
  id: string
  phase_name: string
  phase_sort_order: number | null
  sort_order: number
  name: string
  status: ChecklistStatus | null
  required_for_gate: boolean | null
  gate_name: string | null
}

export interface GateLike {
  gate_name: string
  phase_name: string | null
  is_approved: boolean | null
}

export interface ChecklistPhase<I extends ChecklistItemLike, G extends GateLike> {
  name: string
  items: I[]
  gate: G | null
  done: number
  total: number
  /** Required items not yet complete or N/A; the gate can be approved when this is empty. */
  blocking: string[]
}

export function isChecklistItemDone(status: ChecklistStatus | null): boolean {
  return status === 'complete' || status === 'na'
}

export function groupChecklist<I extends ChecklistItemLike, G extends GateLike>(items: readonly I[], gates: readonly G[]): ChecklistPhase<I, G>[] {
  const sorted = [...items].sort(
    (a, b) => (a.phase_sort_order ?? 0) - (b.phase_sort_order ?? 0) || a.sort_order - b.sort_order || a.name.localeCompare(b.name),
  )
  const phases: ChecklistPhase<I, G>[] = []
  const byName = new Map<string, ChecklistPhase<I, G>>()
  for (const item of sorted) {
    let phase = byName.get(item.phase_name)
    if (!phase) {
      phase = { name: item.phase_name, items: [], gate: null, done: 0, total: 0, blocking: [] }
      byName.set(item.phase_name, phase)
      phases.push(phase)
    }
    phase.items.push(item)
    phase.total += 1
    if (isChecklistItemDone(item.status)) phase.done += 1
    else if (item.required_for_gate) phase.blocking.push(item.name)
  }
  for (const gate of gates) {
    const name = gate.phase_name ?? gate.gate_name
    let phase = byName.get(name)
    if (!phase) {
      // A gate whose phase has no items still has to be approvable.
      phase = { name, items: [], gate: null, done: 0, total: 0, blocking: [] }
      byName.set(name, phase)
      phases.push(phase)
    }
    phase.gate = gate
  }
  return phases
}

export interface ChecklistStatusPatch {
  status: ChecklistStatus
  updated_at: string
  updated_by: string
  started_at?: string
  completed_at?: string | null
  completed_by?: string | null
}

export function checklistStatusPatch(
  from: ChecklistStatus | null,
  to: ChecklistStatus,
  userId: string,
  nowIso: string,
  startedAt: string | null,
): ChecklistStatusPatch {
  const patch: ChecklistStatusPatch = { status: to, updated_at: nowIso, updated_by: userId }
  if (to === 'in_progress' && !startedAt) patch.started_at = nowIso
  if (to === 'complete') {
    patch.completed_at = nowIso
    patch.completed_by = userId
    if (!startedAt) patch.started_at = nowIso
  } else if (from === 'complete') {
    patch.completed_at = null
    patch.completed_by = null
  }
  return patch
}

// ---------------------------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------------------------

/** Activity actions this client writes to eco_checklist_activity (the ECO's activity log). */
export const ECO_ACTIVITY = {
  created: 'eco_created',
  edited: 'eco_edited',
  statusChanged: 'status_changed',
  filesAdded: 'files_added',
  fileRemoved: 'file_removed',
  itemStatus: 'item_status_changed',
  templateApplied: 'template_applied',
  gateApproved: 'gate_approved',
} as const

export interface ActivityRow {
  id: string
  action: string
  old_value: string | null
  new_value: string | null
  notes: string | null
  performed_by: string | null
  performed_at: string | null
}

export interface HistoryEntry {
  id: string
  at: string
  action: string
  userId: string | null
  oldValue: string | null
  newValue: string | null
  notes: string | null
}

/**
 * The ECO's history, newest first: its logged activity, plus the creation and completion stamps
 * on the row itself when no activity row records them (ECOs made before this log, or by the desktop).
 */
export function buildEcoHistory(
  eco: { id: string; created_at: string | null; created_by: string; completed_at: string | null; status: EcoStatus | null },
  activity: readonly ActivityRow[],
): HistoryEntry[] {
  const entries: HistoryEntry[] = activity
    .filter((row) => !!row.performed_at)
    .map((row) => ({
      id: row.id,
      at: row.performed_at as string,
      action: row.action,
      userId: row.performed_by,
      oldValue: row.old_value,
      newValue: row.new_value,
      notes: row.notes,
    }))
  const actions = new Set(entries.map((entry) => entry.action))
  if (eco.created_at && !actions.has(ECO_ACTIVITY.created)) {
    entries.push({ id: `${eco.id}:created`, at: eco.created_at, action: ECO_ACTIVITY.created, userId: eco.created_by, oldValue: null, newValue: null, notes: null })
  }
  const completionLogged = entries.some((entry) => entry.action === ECO_ACTIVITY.statusChanged && entry.newValue === 'completed')
  if (eco.status === 'completed' && eco.completed_at && !completionLogged) {
    entries.push({ id: `${eco.id}:completed`, at: eco.completed_at, action: ECO_ACTIVITY.statusChanged, userId: null, oldValue: null, newValue: 'completed', notes: null })
  }
  return entries.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}

/** A user's name for display: full name, else email, else null (the page shows "unknown"). */
export function displayUser(user: { full_name: string | null; email: string | null } | undefined): string | null {
  if (!user) return null
  return user.full_name?.trim() || user.email || null
}
