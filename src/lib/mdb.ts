/**
 * MariaDB-backend session and configuration bridge.
 *
 * The upstream Supabase implementation remains isolated behind its own module
 * while callers are moved one domain at a time to this HTTP API. No Supabase
 * key is used in MDB mode.
 */
import { activateBackend } from './backend'
import { isMdbBackendActive } from './backendAdapter'


export const MDB_API_VERSION = 2

const STORAGE_KEY = 'blueplm-mdb-config'
const CHECKOUTS_STORAGE_KEY = 'blueplm-mdb-checkouts'
const LEGACY_STORAGE_KEY = 'blueplm-community-config'
const LEGACY_CHECKOUTS_STORAGE_KEY = 'blueplm-community-checkouts'

export interface MdbConfig {
  version: 1
  serverUrl: string
  accessToken?: string
}

export type MdbMembershipRole = 'owner' | 'admin' | 'member' | 'viewer' | 'guest'

export class MdbTotpRequiredError extends Error {
  constructor(public readonly challengeToken: string, public readonly expiresAt: string) {
    super('Authenticator code required.')
    this.name = 'MdbTotpRequiredError'
  }
}

export interface MdbTotpStatus {
  enabled: boolean
  enabledAt: string | null
}

export interface MdbTotpEnrollment {
  enrollmentToken: string
  secret: string
  provisioningUri: string
  expiresAt: string
}

export interface MdbPrincipal {
  userId: string
  organizationId: string
  email: string
  displayName: string
  role: MdbMembershipRole
  createdAt: string
}

export interface MdbRegistrationStatus {
  enabled: boolean
  organizationId: string | null
  organizationName: string | null
}

export interface MdbRegistrationRequest {
  id: string
  email: string
  displayName: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
}

export interface MdbOrganization {
  id: string
  name: string
  slug: string
  createdAt: string
  defaultNewUserTeamId: string | null
  /** Shared SOLIDWORKS Document Manager key, available only to authenticated organization users. */
  documentManagerLicenseKey: string | null
}

export type MdbOrganizationSettingSection =
  | 'serialization'
  | 'export'
  | 'rfq'
  | 'auth-providers'

export interface MdbUser {
  id: string
  email: string
  displayName: string
  role: MdbMembershipRole
  createdAt: string
}

export interface MdbUserProfile extends MdbUser {
  teams: Array<Pick<MdbTeam, 'id' | 'name' | 'color' | 'icon'>>
  workflowRoles: Array<Pick<MdbWorkflowRole, 'id' | 'name' | 'color' | 'icon'>>
}

export interface MdbWorkflowRole {
  id: string
  name: string
  color: string
  icon: string
  description: string | null
  sort_order: number
}

export interface MdbVault {
  id: string
  name: string
  networkRoot: string | null
  storageProvider: 'network'
  createdAt: string
}

export interface MdbTeam {
  id: string
  name: string
  color: string
  icon: string
  createdAt: string
  memberCount: number
  vaultCount: number
}

export interface MdbTeamMember {
  userId: string
  addedAt: string
  email: string
  displayName: string
  role: MdbMembershipRole
}

export type MdbPermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'admin'

export interface MdbTeamPermission {
  resource: string
  vaultId: string | null
  actions: MdbPermissionAction[]
}

export interface MdbTeamReviewer {
  id: string
  team_id: string
  reviewer_type: 'user' | 'workflow_role'
  user_id: string | null
  workflow_role_id: string | null
  added_at: string
  user?: { id: string; email: string; full_name: string | null; avatar_url: string | null } | null
}

export interface MdbFile {
  id: string
  canonicalPath: string
  fileName: string
  partNumber: string | null
  storageRelativePath: string
  currentRevision: number
  state: string
  contentHash: string | null
  sizeBytes: number | null
  workflowStateId?: string | null
  createdAt: string
  updatedAt: string
  checkedOutByUserId: string | null
  checkedOutBy: string | null
  checkoutExpiresAt: string | null
}

export interface MdbWorkflowTemplate {
  id: string
  org_id: string
  name: string
  description: string | null
  is_active: boolean
  is_default: boolean
  canvas_config: unknown | null
  created_by: string
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface MdbWorkflowState { id: string; workflow_id: string; name: string; [key: string]: unknown }
export interface MdbWorkflowTransition { id: string; workflow_id: string; from_state_id: string; to_state_id: string; [key: string]: unknown }
export interface MdbWorkflowGate { id: string; transition_id: string; name: string; [key: string]: unknown }
export interface MdbTransitionResult {
  success: boolean
  requires_review: boolean
  new_state_id: string | null
  new_state_name: string | null
  new_revision: string | null
  error_code: string | null
  error_message: string | null
}

export interface MdbAnnotation {
  id: string
  file_id: string
  user_id: string
  comment: string
  page_number: number | null
  position: { x: number; y: number; width: number; height: number; pageWidth: number; pageHeight: number } | null
  annotation_type: 'area' | 'text' | 'highlight' | 'file'
  parent_id: string | null
  resolved: boolean
  resolved_by: string | null
  resolved_at: string | null
  file_version: number | null
  edited_at: string | null
  created_at: string
  user: { email: string; full_name: string | null; avatar_url: string | null }
}

export interface MdbItemDefinition {
  anyStage: boolean
  workflowStageIds: string[]
  anyType: boolean
  fileTypes: Array<'part' | 'assembly' | 'drawing' | 'pdf' | 'step' | 'other'>
  requirePartNumber: boolean
  matchOrgFormat: boolean
}

export interface MdbItemDesignation { id: string; name: string; sort_order: number }
export interface MdbItemDesignationAssignment { part_number: string; designation_id: string }

export interface MdbTrashedFile {
  id: string
  vaultId: string
  canonicalPath: string
  fileName: string
  currentRevision: number
  state: string
  contentHash: string | null
  sizeBytes: number | null
  deletedAt: string
  deletedBy: string | null
  deletedByName: string | null
  updatedAt: string
}

export interface MdbActivityEntry {
  id: string
  action: string
  user_email: string
  details: Record<string, unknown>
  created_at: string
  file: { file_name: string; file_path: string } | null
}

export interface MdbDeviceSession {
  id: string
  user_id: string
  org_id: string
  machine_id: string
  machine_name: string | null
  os_version: string | null
  app_version: string | null
  platform: string | null
  last_active: string | null
  last_seen: string | null
  is_active: boolean
  created_at: string | null
}

export interface MdbOnlineUser {
  user_id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  custom_avatar_url: string | null
  role: string
  machine_name: string
  platform: string | null
  last_seen: string
}

export interface MdbFolder {
  id: string
  org_id: string
  vault_id: string
  folder_path: string
  created_by: string
  created_at: string
  deleted_at: string | null
  deleted_by: string | null
}

type AuthListener = () => void
const listeners = new Set<AuthListener>()

function notify(): void {
  for (const listener of listeners) listener()
}

type MdbCheckout = { token: string; vaultId?: string }

function loadMdbCheckouts(): Record<string, MdbCheckout> {
  try {
    const current = localStorage.getItem(CHECKOUTS_STORAGE_KEY)
    const legacy = current ? null : localStorage.getItem(LEGACY_CHECKOUTS_STORAGE_KEY)
    const parsed = JSON.parse(current ?? legacy ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    if (!current && legacy) {
      try {
        localStorage.setItem(CHECKOUTS_STORAGE_KEY, JSON.stringify(parsed))
        localStorage.removeItem(LEGACY_CHECKOUTS_STORAGE_KEY)
      } catch {
        // The legacy checkout map remains usable when storage is read-only.
      }
    }
    return parsed as Record<string, MdbCheckout>
  } catch {
    return {}
  }
}

function saveMdbCheckouts(checkouts: Record<string, MdbCheckout>): void {
  localStorage.setItem(CHECKOUTS_STORAGE_KEY, JSON.stringify(checkouts))
  localStorage.removeItem(LEGACY_CHECKOUTS_STORAGE_KEY)
}

function normalizeServerUrl(serverUrl: string): string {
  const url = new URL(serverUrl)
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Backend URL must use HTTP or HTTPS.')
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error('A network backend must use HTTPS.')
  }
  return url.toString().replace(/\/$/, '')
}

export function loadMdbConfig(): MdbConfig | null {
  try {
    const current = localStorage.getItem(STORAGE_KEY)
    const legacy = current ? null : localStorage.getItem(LEGACY_STORAGE_KEY)
    const value = current ?? legacy
    if (!value) return null
    const parsed = JSON.parse(value) as Partial<MdbConfig>
    if (parsed.version !== 1 || !parsed.serverUrl) return null
    const config = { version: 1, serverUrl: normalizeServerUrl(parsed.serverUrl), accessToken: parsed.accessToken } satisfies MdbConfig
    if (!current && legacy) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
        localStorage.removeItem(LEGACY_STORAGE_KEY)
      } catch {
        // Keep using the valid legacy configuration when storage is read-only.
      }
      activateBackend('mdb')
    }
    return config
  } catch {
    return null
  }
}

export function saveMdbConfig(config: MdbConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...config, serverUrl: normalizeServerUrl(config.serverUrl) }))
  localStorage.removeItem(LEGACY_STORAGE_KEY)
  activateBackend('mdb')
  notify()
}

export function clearMdbConfig(): void {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(LEGACY_STORAGE_KEY)
  notify()
}

export function isMdbServerConfigured(): boolean {
  return isMdbBackendActive() && loadMdbConfig() !== null
}

export function onMdbAuthChange(listener: AuthListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

async function request<T>(path: string, init: RequestInit = {}, needsAuth = true): Promise<T> {
  const config = loadMdbConfig()
  if (!config) throw new Error('MariaDB backend is not configured.')
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body) headers.set('Content-Type', 'application/json')
  if (needsAuth) {
    if (!config.accessToken) throw new Error('Not signed in.')
    headers.set('Authorization', `Bearer ${config.accessToken}`)
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(new URL(path, `${config.serverUrl}/`), { ...init, headers, signal: controller.signal })
    const body = await response.json().catch(() => ({})) as T & { error?: string; message?: string }
    if (!response.ok) {
      if (needsAuth && response.status === 401 && config.accessToken) {
        saveMdbConfig({ ...config, accessToken: undefined })
      }
      throw new Error(body.message ?? body.error ?? `Backend request failed (${response.status}).`)
    }
    return body
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The MariaDB backend did not respond within 15 seconds. Check the backend URL and HTTPS configuration.')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export async function validateMdbConfig(serverUrl: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const normalized = normalizeServerUrl(serverUrl)
    const response = await fetch(new URL('/health', `${normalized}/`))
    if (!response.ok) return { valid: false, error: `Backend returned HTTP ${response.status}.` }
    const body = await response.json() as { supabase?: boolean; apiVersion?: number }
    if (body.supabase !== false) return { valid: false, error: 'This is not a BluePLM MariaDB backend.' }
    if (!Number.isInteger(body.apiVersion) || body.apiVersion! < MDB_API_VERSION) {
      return { valid: false, error: `The MariaDB backend is outdated. Install API version ${MDB_API_VERSION} or newer.` }
    }
    return { valid: true }
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Backend is unreachable.' }
  }
}

export async function signInMdb(email: string, password: string): Promise<MdbPrincipal> {
  const result = await request<{ token?: string; totpRequired?: boolean; challengeToken?: string; expiresAt: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }, false)
  if (result.totpRequired && result.challengeToken) {
    throw new MdbTotpRequiredError(result.challengeToken, result.expiresAt)
  }
  if (!result.token) throw new Error('The MDB backend returned an invalid login response.')
  const config = loadMdbConfig()
  if (!config) throw new Error('MariaDB backend is not configured.')
  saveMdbConfig({ ...config, accessToken: result.token })
  return await getMdbPrincipal()
}

export async function getMdbRegistrationStatus(): Promise<MdbRegistrationStatus> {
  return request<MdbRegistrationStatus>('/auth/registration', {}, false)
}

export async function registerMdb(
  email: string,
  displayName: string,
  password: string,
): Promise<{ status: 'pending' }> {
  return request<{ status: 'pending' }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, displayName, password }),
  }, false)
}

export async function registerMdbWithRecoveryCode(
  email: string,
  displayName: string,
  password: string,
  recoveryCode: string,
): Promise<MdbPrincipal> {
  const result = await request<{ token: string }>('/auth/recovery-register', {
    method: 'POST',
    body: JSON.stringify({ email, displayName, password, recoveryCode }),
  }, false)
  if (!result.token) throw new Error('The MDB backend returned an invalid recovery registration response.')
  const config = loadMdbConfig()
  if (!config) throw new Error('MariaDB backend is not configured.')
  saveMdbConfig({ ...config, accessToken: result.token })
  return getMdbPrincipal()
}

export async function getMdbRegistrationRequests(): Promise<MdbRegistrationRequest[]> {
  return (await request<{ requests: MdbRegistrationRequest[] }>('/registration-requests')).requests
}

export async function approveMdbRegistration(
  requestId: string,
  role: Exclude<MdbMembershipRole, 'owner'>,
): Promise<MdbUser> {
  return (await request<{ user: MdbUser }>(`/registration-requests/${encodeURIComponent(requestId)}/approve`, {
    method: 'POST',
    body: JSON.stringify({ role }),
  })).user
}

export async function rejectMdbRegistration(requestId: string): Promise<void> {
  await request<void>(`/registration-requests/${encodeURIComponent(requestId)}/reject`, { method: 'POST' })
}

export async function verifyMdbTotp(challengeToken: string, code: string): Promise<MdbPrincipal> {
  const result = await request<{ token: string }>('/auth/totp/verify', {
    method: 'POST',
    body: JSON.stringify({ challengeToken, code }),
  }, false)
  const config = loadMdbConfig()
  if (!config) throw new Error('MariaDB backend is not configured.')
  saveMdbConfig({ ...config, accessToken: result.token })
  return getMdbPrincipal()
}

export async function getMdbTotpStatus(): Promise<MdbTotpStatus> {
  return request<MdbTotpStatus>('/account/totp')
}

export async function startMdbTotpEnrollment(): Promise<MdbTotpEnrollment> {
  return request<MdbTotpEnrollment>('/account/totp/enrollment', { method: 'POST' })
}

export async function confirmMdbTotpEnrollment(enrollmentToken: string, code: string): Promise<void> {
  await request<{ enabled: boolean }>('/account/totp/confirm', {
    method: 'POST',
    body: JSON.stringify({ enrollmentToken, code }),
  })
}

export async function disableMdbTotp(code: string): Promise<void> {
  await request<{ enabled: boolean }>('/account/totp', {
    method: 'DELETE',
    body: JSON.stringify({ code }),
  })
}

export async function getMdbPrincipal(): Promise<MdbPrincipal> {
  return (await request<{ user: MdbPrincipal }>('/auth/me')).user
}

export async function getMdbOrganization(): Promise<MdbOrganization> {
  return (await request<{ organization: MdbOrganization }>('/organizations/current')).organization
}

export async function setMdbDefaultNewUserTeam(teamId: string | null): Promise<void> {
  await request<{ defaultNewUserTeamId: string | null }>('/organizations/current/settings', {
    method: 'PUT', body: JSON.stringify({ defaultNewUserTeamId: teamId }),
  })
}

export async function setMdbDocumentManagerLicense(licenseKey: string | null): Promise<void> {
  await request<{ documentManagerLicenseKey: string | null }>('/organizations/current/document-manager-license', {
    method: 'PATCH',
    body: JSON.stringify({ documentManagerLicenseKey: licenseKey }),
  })
}

export interface MdbModuleAccessRow {
  module_id: string
  team_id: string | null
  user_id: string | null
}

export interface MdbColumnDefault {
  id: string
  width: number
  visible: boolean
}

export interface MdbMetadataColumn {
  id: string
  org_id: string
  name: string
  label: string
  data_type: 'text' | 'number' | 'date' | 'boolean' | 'select'
  select_options: string[]
  width: number
  visible: boolean
  sortable: boolean
  required: boolean
  default_value: string | null
  sort_order: number
  created_by: string | null
  updated_by: string | null
  created_at: string | null
  updated_at: string | null
}

export async function getMdbOrganizationSetting<T extends object>(
  section: MdbOrganizationSettingSection,
): Promise<T> {
  return (await request<{ value: T }>(`/organizations/current/settings/${section}`)).value
}

export async function setMdbOrganizationSetting<T extends object>(
  section: MdbOrganizationSettingSection,
  value: T,
  options: { replaceCounter?: boolean } = {},
): Promise<T> {
  return (
    await request<{ value: T }>(`/organizations/current/settings/${section}`, {
      method: 'PUT',
      body: JSON.stringify({ value, ...options }),
    })
  ).value
}

export async function previewMdbSerialNumber(): Promise<string | null> {
  return (
    await request<{ serialNumber: string | null }>(
      '/organizations/current/serialization/preview',
    )
  ).serialNumber
}

export async function allocateMdbSerialNumber(): Promise<string | null> {
  return (
    await request<{ serialNumber: string | null }>(
      '/organizations/current/serialization/next',
      { method: 'POST' },
    )
  ).serialNumber
}

export async function mdbSerialNumberExists(serialNumber: string): Promise<boolean> {
  return (
    await request<{ exists: boolean }>(
      `/organizations/current/serialization/exists?serial=${encodeURIComponent(serialNumber)}`,
    )
  ).exists
}

export async function getMdbSerialInventory(): Promise<Array<{ partNumber: string; filePath: string }>> {
  return (
    await request<{ files: Array<{ partNumber: string; filePath: string }> }>(
      '/organizations/current/serialization/files',
    )
  ).files
}

export async function getMdbModuleAccessConfig(): Promise<MdbModuleAccessRow[]> {
  return (await request<{ access: MdbModuleAccessRow[] }>('/module-access')).access
}

export async function setMdbModuleAccess(
  moduleId: string,
  teamIds: string[],
  userIds: string[],
): Promise<void> {
  await request<{ success: boolean }>(`/module-access/${encodeURIComponent(moduleId)}`, {
    method: 'PUT',
    body: JSON.stringify({ teamIds, userIds }),
  })
}

export async function getMdbOrganizationColumnDefaults(): Promise<MdbColumnDefault[]> {
  return (await request<{ columnDefaults: MdbColumnDefault[] }>('/column-defaults/organization')).columnDefaults
}

export async function setMdbOrganizationColumnDefaults(columnDefaults: MdbColumnDefault[]): Promise<void> {
  await request<{ columnDefaults: MdbColumnDefault[] }>('/column-defaults/organization', {
    method: 'PUT', body: JSON.stringify({ columnDefaults }),
  })
}

export async function forceMdbOrganizationColumnDefaults(columnDefaults: MdbColumnDefault[]): Promise<void> {
  await request<{ columnDefaults: MdbColumnDefault[] }>('/column-defaults/organization/force', {
    method: 'POST', body: JSON.stringify({ columnDefaults }),
  })
}

export async function getMdbUserColumnDefaults(): Promise<MdbColumnDefault[]> {
  return (await request<{ columnDefaults: MdbColumnDefault[] }>('/column-defaults/user')).columnDefaults
}

export async function setMdbUserColumnDefaults(columnDefaults: MdbColumnDefault[]): Promise<void> {
  await request<{ columnDefaults: MdbColumnDefault[] }>('/column-defaults/user', {
    method: 'PUT', body: JSON.stringify({ columnDefaults }),
  })
}

export async function getMdbDeniedModules(): Promise<string[]> {
  return (await request<{ moduleIds: string[] }>('/module-access/denied')).moduleIds
}

export async function getMdbMetadataColumns(): Promise<MdbMetadataColumn[]> {
  return (await request<{ columns: MdbMetadataColumn[] }>('/metadata-columns')).columns
}

export async function createMdbMetadataColumn(
  payload: Omit<MdbMetadataColumn, 'id' | 'org_id' | 'created_at' | 'updated_at' | 'updated_by'>,
): Promise<void> {
  await request<{ id: string }>('/metadata-columns', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateMdbMetadataColumn(
  columnId: string,
  payload: Partial<Omit<MdbMetadataColumn, 'id' | 'org_id' | 'created_at' | 'created_by'>>,
): Promise<void> {
  await request<{ success: boolean }>(`/metadata-columns/${encodeURIComponent(columnId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function deleteMdbMetadataColumn(columnId: string): Promise<void> {
  await request<void>(`/metadata-columns/${encodeURIComponent(columnId)}`, { method: 'DELETE' })
}

export async function getMdbUsers(): Promise<MdbUser[]> {
  return (await request<{ users: MdbUser[] }>('/users')).users
}

export async function getMdbUserProfile(userId: string): Promise<MdbUserProfile> {
  return (await request<{ user: MdbUserProfile }>(`/users/${encodeURIComponent(userId)}/profile`)).user
}

export async function createMdbUser(payload: Pick<MdbUser, 'email' | 'displayName'> & { password: string; role?: Exclude<MdbMembershipRole, 'owner'> }): Promise<Pick<MdbUser, 'id' | 'email' | 'displayName' | 'role'>> {
  return request<Pick<MdbUser, 'id' | 'email' | 'displayName' | 'role'>>('/users', { method: 'POST', body: JSON.stringify(payload) })
}

export async function updateMdbUser(
  userId: string,
  payload: Partial<Pick<MdbUser, 'email' | 'displayName'>> & { password?: string; role?: Exclude<MdbMembershipRole, 'owner'> },
): Promise<MdbUser> {
  return (await request<{ user: MdbUser }>(`/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })).user
}

export async function getMdbUserVaultAccess(userId: string): Promise<string[]> {
  return (await request<{ vaultIds: string[] }>(`/users/${encodeURIComponent(userId)}/vault-access`)).vaultIds
}

export async function setMdbUserVaultAccess(userId: string, vaultIds: string[]): Promise<void> {
  await request<{ success: boolean }>(`/users/${encodeURIComponent(userId)}/vault-access`, {
    method: 'PUT', body: JSON.stringify({ vaultIds }),
  })
}

export async function removeMdbUser(userId: string): Promise<void> {
  await request<void>(`/users/${encodeURIComponent(userId)}`, { method: 'DELETE' })
}

export async function getMdbWorkflowRoles(): Promise<MdbWorkflowRole[]> {
  return (await request<{ roles: MdbWorkflowRole[] }>('/workflow-roles')).roles.map((role) => ({
    ...role,
    sort_order: Number(role.sort_order),
  }))
}

export async function createMdbWorkflowRole(
  payload: Pick<MdbWorkflowRole, 'name' | 'color' | 'icon'> & { description?: string | null },
): Promise<MdbWorkflowRole> {
  return (await request<{ role: MdbWorkflowRole }>('/workflow-roles', {
    method: 'POST',
    body: JSON.stringify(payload),
  })).role
}

export async function updateMdbWorkflowRole(
  roleId: string,
  payload: Partial<Pick<MdbWorkflowRole, 'name' | 'color' | 'icon' | 'description'>>,
): Promise<MdbWorkflowRole> {
  return (await request<{ role: MdbWorkflowRole }>(`/workflow-roles/${encodeURIComponent(roleId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })).role
}

export async function deleteMdbWorkflowRole(roleId: string): Promise<void> {
  await request<void>(`/workflow-roles/${encodeURIComponent(roleId)}`, { method: 'DELETE' })
}

export async function getMdbWorkflowRoleAssignments(): Promise<Record<string, string[]>> {
  return (await request<{ assignments: Record<string, string[]> }>('/workflow-role-assignments')).assignments
}

/**
 * Load the workflow-role IDs assigned to one MDB user.
 *
 * The server keeps workflow roles separate from the account role.  Keep this
 * lookup in the mdb adapter so session hydration and workflow checks do
 * not accidentally fall back to the account-role mapping.
 */
export async function getMdbUserWorkflowRoles(userId: string): Promise<string[]> {
  const assignments = await getMdbWorkflowRoleAssignments()
  return assignments[userId] ?? []
}

export async function setMdbUserWorkflowRoles(userId: string, roleIds: string[]): Promise<void> {
  await request<{ success: boolean }>(`/users/${encodeURIComponent(userId)}/workflow-roles`, {
    method: 'PUT',
    body: JSON.stringify({ roleIds }),
  })
}

export async function getMdbUserPermissions(userId: string, vaultId: string | null): Promise<Record<string, MdbPermissionAction[]>> {
  const suffix = vaultId ? `?vaultId=${encodeURIComponent(vaultId)}` : ''
  const result = await request<{ permissions: Array<{ resource: string; actions: MdbPermissionAction[] }> }>(`/users/${encodeURIComponent(userId)}/permissions${suffix}`)
  return Object.fromEntries(result.permissions.map((permission) => [permission.resource, permission.actions]))
}

export async function getMdbEffectiveUserPermissions(userId: string): Promise<{
  permissions: MdbTeamPermission[]
  vaultIds: string[]
}> {
  return request<{ permissions: MdbTeamPermission[]; vaultIds: string[] }>(
    `/users/${encodeURIComponent(userId)}/effective-permissions`,
  )
}

export async function setMdbUserPermissions(userId: string, vaultId: string | null, permissions: Record<string, MdbPermissionAction[]>): Promise<void> {
  await request<{ success: boolean }>(`/users/${encodeURIComponent(userId)}/permissions`, {
    method: 'PUT', body: JSON.stringify({ vaultId, permissions }),
  })
}

export async function getMdbOrgVaultAccess(): Promise<Record<string, string[]>> {
  const { accessMap } = await request<{ accessMap: Record<string, string[]> }>('/vaults/access')
  const vaultIds = (await getMdbVaults()).map((vault) => vault.id)
  return normalizeMdbOrgVaultAccess(accessMap, vaultIds)
}

export function normalizeMdbOrgVaultAccess(
  accessMap: Record<string, string[]>,
  vaultIds: string[],
): Record<string, string[]> {
  const knownVaultIds = new Set(vaultIds)
  const keys = Object.keys(accessMap)
  if (keys.length === 0 || keys.every((key) => knownVaultIds.has(key))) return accessMap

  const normalized: Record<string, string[]> = {}
  for (const [userId, grantedVaultIds] of Object.entries(accessMap)) {
    for (const vaultId of grantedVaultIds) {
      if (!knownVaultIds.has(vaultId)) continue
      const users = normalized[vaultId] || []
      if (!users.includes(userId)) normalized[vaultId] = [...users, userId]
    }
  }
  return normalized
}

export async function getMdbTeams(): Promise<MdbTeam[]> {
  return (await request<{ teams: MdbTeam[] }>('/teams')).teams
}

export async function getMdbUserTeams(userId: string): Promise<Array<Pick<MdbTeam, 'id' | 'name' | 'color' | 'icon'>>> {
  return (await request<{ teams: Array<Pick<MdbTeam, 'id' | 'name' | 'color' | 'icon'>> }>(`/users/${encodeURIComponent(userId)}/teams`)).teams
}

export async function createMdbTeam(payload: Pick<MdbTeam, 'name' | 'color' | 'icon'>): Promise<Pick<MdbTeam, 'id' | 'name' | 'color' | 'icon'>> {
  return request<Pick<MdbTeam, 'id' | 'name' | 'color' | 'icon'>>('/teams', { method: 'POST', body: JSON.stringify(payload) })
}

export async function updateMdbTeam(teamId: string, payload: Pick<MdbTeam, 'name' | 'color' | 'icon'>): Promise<Pick<MdbTeam, 'id' | 'name' | 'color' | 'icon'>> {
  return request<Pick<MdbTeam, 'id' | 'name' | 'color' | 'icon'>>(`/teams/${encodeURIComponent(teamId)}`, { method: 'PATCH', body: JSON.stringify(payload) })
}

export async function deleteMdbTeam(teamId: string): Promise<void> {
  await request<void>(`/teams/${encodeURIComponent(teamId)}`, { method: 'DELETE' })
}

export async function setMdbTeamVaultAccess(teamId: string, vaultIds: string[]): Promise<void> {
  await request<{ success: boolean }>(`/teams/${encodeURIComponent(teamId)}/vault-access`, {
    method: 'PUT', body: JSON.stringify({ vaultIds }),
  })
}

export async function getMdbTeamVaultAccess(teamId: string): Promise<string[]> {
  return (await request<{ vaultIds: string[] }>(`/teams/${encodeURIComponent(teamId)}/vault-access`)).vaultIds
}

export async function getMdbTeamMembers(teamId: string): Promise<MdbTeamMember[]> {
  return (await request<{ members: MdbTeamMember[] }>(`/teams/${encodeURIComponent(teamId)}/members`)).members
}

export async function getMdbTeamPermissions(teamId: string): Promise<MdbTeamPermission[]> {
  return (await request<{ permissions: MdbTeamPermission[] }>(
    `/teams/${encodeURIComponent(teamId)}/permissions`,
  )).permissions
}

export async function setMdbTeamPermissions(
  teamId: string,
  permissions: MdbTeamPermission[],
): Promise<void> {
  await request<{ success: boolean }>(`/teams/${encodeURIComponent(teamId)}/permissions`, {
    method: 'PUT',
    body: JSON.stringify({ permissions }),
  })
}

export async function getMdbTeamReviewers(teamId: string): Promise<MdbTeamReviewer[]> {
  return (await request<{ reviewers: MdbTeamReviewer[] }>(
    `/teams/${encodeURIComponent(teamId)}/reviewers`,
  )).reviewers
}

export async function addMdbTeamReviewer(
  teamId: string,
  reviewerType: 'user' | 'workflow_role',
  targetId: string,
): Promise<string> {
  const result = await request<{ id: string }>(`/teams/${encodeURIComponent(teamId)}/reviewers`, {
    method: 'POST',
    body: JSON.stringify({
      reviewerType,
      ...(reviewerType === 'user' ? { userId: targetId } : { workflowRoleId: targetId }),
    }),
  })
  return result.id
}

export async function removeMdbTeamReviewer(reviewerId: string): Promise<void> {
  await request<void>(`/team-reviewers/${encodeURIComponent(reviewerId)}`, { method: 'DELETE' })
}

export async function addMdbTeamMember(teamId: string, userId: string): Promise<void> {
  await request<void>(`/teams/${encodeURIComponent(teamId)}/members`, {
    method: 'POST', body: JSON.stringify({ userId }),
  })
}

export async function removeMdbTeamMember(teamId: string, userId: string): Promise<void> {
  await request<void>(`/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' })
}

export async function getMdbVaults(): Promise<MdbVault[]> {
  return (await request<{ vaults: MdbVault[] }>('/vaults')).vaults
}

export async function createMdbVault(payload: {
  name: string
  storageProvider: 'network'
  networkRoot?: string
}): Promise<MdbVault> {
  return request<MdbVault>('/vaults', { method: 'POST', body: JSON.stringify(payload) })
}

export async function getMdbVault(vaultId: string): Promise<MdbVault> {
  const vault = (await getMdbVaults()).find((candidate) => candidate.id === vaultId)
  if (!vault) throw new Error('The selected MDB vault is not accessible to this user.')
  return vault
}

export async function getMdbFiles(vaultId: string): Promise<MdbFile[]> {
  return (await request<{ files: MdbFile[] }>(`/vaults/${encodeURIComponent(vaultId)}/files`)).files
}

/**
 * Registers the first immutable revision of a file that was staged by the
 * desktop client in its MDB network vault. File bytes never traverse the
 * PHP/MariaDB service.
 */
export async function importMdbFile(payload: {
  vaultId: string
  canonicalPath: string
  storageRelativePath: string
  fileName: string
  partNumber?: string | null
  contentHash: string
  sizeBytes: number
}): Promise<{ id: string; created: boolean }> {
  return request<{ id: string; created: boolean }>('/files/import', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function mdbObjectStoragePath(contentHash: string): string {
  const normalized = contentHash.trim().toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error('MDB revision content hash must be a SHA-256 value.')
  }
  return `.blueplm/objects/${normalized.slice(0, 2)}/${normalized}`
}

export async function getMdbFolders(vaultId: string): Promise<MdbFolder[]> {
  return (await request<{ folders: MdbFolder[] }>(`/vaults/${encodeURIComponent(vaultId)}/folders`)).folders
}

export async function syncMdbFolder(vaultId: string, folderPath: string): Promise<MdbFolder> {
  return (await request<{ folder: MdbFolder }>('/folders', { method: 'POST', body: JSON.stringify({ vaultId, folderPath }) })).folder
}

export async function updateMdbFolder(folderId: string, folderPath: string): Promise<void> {
  await request<{ success: boolean }>(`/folders/${encodeURIComponent(folderId)}`, { method: 'PATCH', body: JSON.stringify({ folderPath }) })
}

export async function deleteMdbFolder(folderId: string): Promise<void> {
  await request<void>(`/folders/${encodeURIComponent(folderId)}`, { method: 'DELETE' })
}

export async function moveMdbFile(fileId: string, canonicalPath: string, fileName?: string): Promise<void> {
  await request<{ success: boolean }>(`/files/${encodeURIComponent(fileId)}/path`, {
    method: 'PATCH', body: JSON.stringify({ canonicalPath, fileName }),
  })
}

export async function moveMdbFilePathPrefix(vaultId: string, oldFolderPath: string, newFolderPath: string): Promise<{ updated: number; total: number }> {
  return request<{ updated: number; total: number }>(`/vaults/${encodeURIComponent(vaultId)}/files/path-prefix`, {
    method: 'PATCH', body: JSON.stringify({ oldFolderPath, newFolderPath }),
  })
}

export async function updateMdbFileState(fileId: string, state: MdbFile['state']): Promise<Pick<MdbFile, 'id' | 'state'>> {
  return (await request<{ file: Pick<MdbFile, 'id' | 'state'> }>(`/files/${encodeURIComponent(fileId)}/state`, {
    method: 'PATCH', body: JSON.stringify({ state }),
  })).file
}

export async function getMdbInspectionRows(fileId: string): Promise<Record<string, unknown>[]> {
  return (await request<{ rows: Record<string, unknown>[] }>(`/files/${encodeURIComponent(fileId)}/inspection`)).rows
}

export async function getMdbInspectionRowsForRevision(revisionId: string): Promise<Record<string, unknown>[]> {
  return (await request<{ rows: Record<string, unknown>[] }>(`/file-revisions/${encodeURIComponent(revisionId)}/inspection`)).rows
}

export async function saveMdbInspectionRows(fileId: string, rows: unknown[]): Promise<void> {
  await request<{ success: boolean }>(`/files/${encodeURIComponent(fileId)}/inspection`, { method: 'PUT', body: JSON.stringify({ rows }) })
}

export async function getMdbInspectionMethods(): Promise<Array<{ id: string; name: string }>> {
  return (await request<{ methods: Array<{ id: string; name: string }> }>('/inspection-methods')).methods
}

export async function createMdbInspectionMethod(name: string): Promise<{ id: string; name: string }> {
  return (await request<{ method: { id: string; name: string } }>('/inspection-methods', { method: 'POST', body: JSON.stringify({ name }) })).method
}

export async function updateMdbInspectionMethod(id: string, name: string): Promise<void> {
  await request<{ success: boolean }>(`/inspection-methods/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ name }) })
}

export async function deleteMdbInspectionMethod(id: string): Promise<void> {
  await request<void>(`/inspection-methods/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function getMdbTrash(vaultId?: string): Promise<MdbTrashedFile[]> {
  const suffix = vaultId ? `?vaultId=${encodeURIComponent(vaultId)}` : ''
  return (await request<{ files: MdbTrashedFile[] }>(`/trash${suffix}`)).files
}

export async function trashMdbFile(fileId: string): Promise<void> {
  await request<{ success: boolean }>(`/files/${encodeURIComponent(fileId)}/trash`, { method: 'POST' })
}

export async function restoreMdbFile(fileId: string): Promise<void> {
  await request<{ success: boolean }>(`/files/${encodeURIComponent(fileId)}/restore`, { method: 'POST' })
}

export async function permanentlyDeleteMdbFile(fileId: string): Promise<void> {
  await request<void>(`/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' })
}

export async function getMdbAnnotations(fileId: string, version?: number): Promise<MdbAnnotation[]> {
  const suffix = version === undefined ? '' : `?version=${encodeURIComponent(String(version))}`
  return (await request<{ annotations: MdbAnnotation[] }>(`/files/${encodeURIComponent(fileId)}/annotations${suffix}`)).annotations
}

export async function createMdbAnnotation(fileId: string, payload: Record<string, unknown>): Promise<MdbAnnotation> {
  return (await request<{ annotation: MdbAnnotation }>(`/files/${encodeURIComponent(fileId)}/annotations`, { method: 'POST', body: JSON.stringify(payload) })).annotation
}

export async function updateMdbAnnotation(annotationId: string, comment: string): Promise<MdbAnnotation> {
  return (await request<{ annotation: MdbAnnotation }>(`/annotations/${encodeURIComponent(annotationId)}`, { method: 'PATCH', body: JSON.stringify({ comment }) })).annotation
}

export async function deleteMdbAnnotation(annotationId: string): Promise<void> {
  await request<void>(`/annotations/${encodeURIComponent(annotationId)}`, { method: 'DELETE' })
}

export async function getMdbItemDefinition(): Promise<MdbItemDefinition> {
  return (await request<{ settings: MdbItemDefinition }>('/item-definition')).settings
}

export async function updateMdbItemDefinition(settings: MdbItemDefinition): Promise<MdbItemDefinition> {
  return (await request<{ settings: MdbItemDefinition }>('/item-definition', { method: 'PUT', body: JSON.stringify(settings) })).settings
}

export async function getMdbItemWorkflowStages(): Promise<Array<{ id: string; name: string; label: string | null; color: string | null }>> {
  return (await request<{ stages: Array<{ id: string; name: string; label: string | null; color: string | null }> }>('/item-definition/workflow-stages')).stages
}

export async function getMdbItemDesignations(): Promise<MdbItemDesignation[]> {
  return (await request<{ designations: MdbItemDesignation[] }>('/item-designations')).designations
}

export async function createMdbItemDesignation(name: string, sortOrder?: number | null): Promise<MdbItemDesignation> {
  return (await request<{ designation: MdbItemDesignation }>('/item-designations', { method: 'POST', body: JSON.stringify({ name, sortOrder }) })).designation
}

export async function updateMdbItemDesignation(id: string, name: string, sortOrder?: number | null): Promise<MdbItemDesignation> {
  return (await request<{ designation: MdbItemDesignation }>(`/item-designations/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ name, sortOrder }) })).designation
}

export async function deleteMdbItemDesignation(id: string): Promise<void> {
  await request<void>(`/item-designations/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function getMdbItemDesignationAssignments(vaultId: string): Promise<MdbItemDesignationAssignment[]> {
  return (await request<{ assignments: MdbItemDesignationAssignment[] }>(`/vaults/${encodeURIComponent(vaultId)}/item-designations`)).assignments
}

export async function setMdbItemDesignationAssignment(vaultId: string, partNumber: string, designationId: string | null): Promise<void> {
  await request<void>(`/vaults/${encodeURIComponent(vaultId)}/item-designations/${encodeURIComponent(partNumber)}`, { method: 'PUT', body: JSON.stringify({ designationId }) })
}

export async function syncMdbFileReferences(fileId: string, references: unknown[], vaultRootPath?: string): Promise<{ success: boolean; inserted: number; updated: number; deleted: number; skipped: number; skippedReasons?: Array<{ swPath: string; reason: 'no_match' | 'file_not_synced' | 'ambiguous_filename' | 'self_reference'; details: string }> }> {
  return request(`/files/${encodeURIComponent(fileId)}/references/sync`, { method: 'POST', body: JSON.stringify({ references, vaultRootPath }) })
}

export async function getMdbFileReferences(fileId: string, direction: 'contains' | 'where-used'): Promise<Array<Record<string, unknown>>> {
  return (await request<{ references: Array<Record<string, unknown>> }>(`/files/${encodeURIComponent(fileId)}/references/${direction}`)).references
}

export async function resolveMdbAnnotation(annotationId: string): Promise<MdbAnnotation> {
  return (await request<{ annotation: MdbAnnotation }>(`/annotations/${encodeURIComponent(annotationId)}/resolve`, { method: 'POST' })).annotation
}

export async function unresolveMdbAnnotation(annotationId: string): Promise<MdbAnnotation> {
  return (await request<{ annotation: MdbAnnotation }>(`/annotations/${encodeURIComponent(annotationId)}/unresolve`, { method: 'POST' })).annotation
}

export async function getMdbWorkflows(): Promise<MdbWorkflowTemplate[]> {
  return (await request<{ workflows: MdbWorkflowTemplate[] }>('/workflows')).workflows
}

export async function getMdbWorkflow(workflowId: string): Promise<MdbWorkflowTemplate> {
  return (await request<{ workflow: MdbWorkflowTemplate }>(`/workflows/${encodeURIComponent(workflowId)}`)).workflow
}

export async function createMdbWorkflow(payload: { name: string; description?: string | null; canvas_config?: unknown | null }): Promise<MdbWorkflowTemplate> {
  return (await request<{ workflow: MdbWorkflowTemplate }>('/workflows', { method: 'POST', body: JSON.stringify(payload) })).workflow
}

export async function updateMdbWorkflow(workflowId: string, payload: Record<string, unknown>): Promise<MdbWorkflowTemplate> {
  return (await request<{ workflow: MdbWorkflowTemplate }>(`/workflows/${encodeURIComponent(workflowId)}`, { method: 'PATCH', body: JSON.stringify(payload) })).workflow
}

export async function deleteMdbWorkflow(workflowId: string): Promise<void> {
  await request<void>(`/workflows/${encodeURIComponent(workflowId)}`, { method: 'DELETE' })
}

export async function importMdbWorkflow(workflowId: string, payload: unknown): Promise<{ state_count: number; transition_count: number; gate_count: number }> {
  return (await request<{ result: { state_count: number; transition_count: number; gate_count: number } }>(`/workflows/${encodeURIComponent(workflowId)}/import`, { method: 'POST', body: JSON.stringify(payload) })).result
}

export async function getMdbWorkflowStates(workflowId: string): Promise<MdbWorkflowState[]> {
  return (await request<{ states: MdbWorkflowState[] }>(`/workflows/${encodeURIComponent(workflowId)}/states`)).states
}

export async function createMdbWorkflowState(payload: Record<string, unknown>): Promise<MdbWorkflowState> {
  return (await request<{ state: MdbWorkflowState }>('/workflow-states', { method: 'POST', body: JSON.stringify(payload) })).state
}

export async function updateMdbWorkflowState(stateId: string, payload: Record<string, unknown>): Promise<MdbWorkflowState> {
  return (await request<{ state: MdbWorkflowState }>(`/workflow-states/${encodeURIComponent(stateId)}`, { method: 'PATCH', body: JSON.stringify(payload) })).state
}

export async function deleteMdbWorkflowState(stateId: string): Promise<void> {
  await request<void>(`/workflow-states/${encodeURIComponent(stateId)}`, { method: 'DELETE' })
}

export async function getMdbWorkflowTransitions(workflowId: string): Promise<MdbWorkflowTransition[]> {
  return (await request<{ transitions: MdbWorkflowTransition[] }>(`/workflows/${encodeURIComponent(workflowId)}/transitions`)).transitions
}

export async function createMdbWorkflowTransition(payload: Record<string, unknown>): Promise<MdbWorkflowTransition> {
  return (await request<{ transition: MdbWorkflowTransition }>('/workflow-transitions', { method: 'POST', body: JSON.stringify(payload) })).transition
}

export async function updateMdbWorkflowTransition(transitionId: string, payload: Record<string, unknown>): Promise<MdbWorkflowTransition> {
  return (await request<{ transition: MdbWorkflowTransition }>(`/workflow-transitions/${encodeURIComponent(transitionId)}`, { method: 'PATCH', body: JSON.stringify(payload) })).transition
}

export async function deleteMdbWorkflowTransition(transitionId: string): Promise<void> {
  await request<void>(`/workflow-transitions/${encodeURIComponent(transitionId)}`, { method: 'DELETE' })
}

export async function getMdbWorkflowGates(transitionIds: string[]): Promise<MdbWorkflowGate[]> {
  if (transitionIds.length === 0) return []
  return (await request<{ gates: MdbWorkflowGate[] }>(`/workflow-gates?transitionIds=${encodeURIComponent(transitionIds.join(','))}`)).gates
}

export async function createMdbWorkflowGate(payload: Record<string, unknown>): Promise<MdbWorkflowGate> {
  return (await request<{ gate: MdbWorkflowGate }>('/workflow-gates', { method: 'POST', body: JSON.stringify(payload) })).gate
}

export async function updateMdbWorkflowGate(gateId: string, payload: Record<string, unknown>): Promise<MdbWorkflowGate> {
  return (await request<{ gate: MdbWorkflowGate }>(`/workflow-gates/${encodeURIComponent(gateId)}`, { method: 'PATCH', body: JSON.stringify(payload) })).gate
}

export async function deleteMdbWorkflowGate(gateId: string): Promise<void> {
  await request<void>(`/workflow-gates/${encodeURIComponent(gateId)}`, { method: 'DELETE' })
}

export async function getMdbFileWorkflow(fileId: string): Promise<Record<string, unknown> | null> {
  return (await request<{ assignment: Record<string, unknown> | null }>(`/files/${encodeURIComponent(fileId)}/workflow`)).assignment
}

export async function assignMdbFileWorkflow(fileId: string, workflowId: string, stateId: string): Promise<void> {
  await request<{ success: boolean }>(`/files/${encodeURIComponent(fileId)}/workflow`, { method: 'PUT', body: JSON.stringify({ workflow_id: workflowId, current_state_id: stateId }) })
}

export async function getMdbAvailableTransitions(fileId: string): Promise<Array<Record<string, unknown>>> {
  return (await request<{ transitions: Array<Record<string, unknown>> }>(`/files/${encodeURIComponent(fileId)}/available-transitions`)).transitions
}

export async function executeMdbWorkflowTransition(fileId: string, transitionId: string, comment?: string): Promise<MdbTransitionResult> {
  return (await request<{ result: MdbTransitionResult }>(`/files/${encodeURIComponent(fileId)}/workflow-transitions/${encodeURIComponent(transitionId)}/execute`, { method: 'POST', body: JSON.stringify({ comment }) })).result
}

export async function getMdbMyWorkflowReviews(): Promise<Array<Record<string, unknown>>> {
  return (await request<{ reviews: Array<Record<string, unknown>> }>('/workflow-reviews/mine')).reviews
}

export async function decideMdbWorkflowReview(reviewId: string, decision: 'approved' | 'rejected' | 'kicked_back', comment?: string, checklistResponses?: Record<string, boolean>): Promise<MdbTransitionResult> {
  return (await request<{ result: MdbTransitionResult }>(`/workflow-reviews/${encodeURIComponent(reviewId)}/decision`, { method: 'POST', body: JSON.stringify({ decision, comment, checklistResponses }) })).result
}

export async function getMdbFileRevisions(fileId: string): Promise<Array<{
  id: string
  revisionNumber: number
  contentHash: string | null
  storageRelativePath: string
  sizeBytes: number | null
  comment: string | null
  createdAt: string
  checkedInBy: string
}>> {
  return (await request<{ revisions: Array<{
    id: string
    revisionNumber: number
    contentHash: string | null
    storageRelativePath: string
    sizeBytes: number | null
    comment: string | null
    createdAt: string
    checkedInBy: string
  }> }>(`/files/${encodeURIComponent(fileId)}/revisions`)).revisions
}

export async function getMdbRollbackTarget(fileId: string, targetVersion: number, comment?: string): Promise<{
  success: boolean
  targetVersionRecord: Record<string, unknown>
  maxVersion: number
}> {
  return request(`/files/${encodeURIComponent(fileId)}/rollback-target`, {
    method: 'POST', body: JSON.stringify({ targetVersion, comment }),
  })
}

export type MdbItemImage = { partNumber: string; vaultId: string; imageType: 'icon' | 'image'; iconName: string | null; iconColor: string | null; storageRelativePath: string | null }
export async function getMdbItemImages(): Promise<MdbItemImage[]> { return (await request<{ images: MdbItemImage[] }>('/item-images')).images }
export async function setMdbItemImage(partNumber: string, payload: Omit<MdbItemImage, 'partNumber'>): Promise<MdbItemImage> {
  return request<MdbItemImage>(`/item-images/${encodeURIComponent(partNumber)}`, { method: 'PUT', body: JSON.stringify(payload) })
}
export async function resetMdbItemImage(partNumber: string): Promise<void> { await request<void>(`/item-images/${encodeURIComponent(partNumber)}`, { method: 'DELETE' }) }
export async function createMdbShareLink(fileId: string, expiresInDays = 7): Promise<{ id: string; token: string; expiresAt: string; downloadUrl: string }> {
  return request(`/files/${encodeURIComponent(fileId)}/share-links`, { method: 'POST', body: JSON.stringify({ expiresInDays }) })
}
export async function resolveMdbShareLink(token: string): Promise<{ file: { id: string; vaultId: string; canonicalPath: string; fileName: string } }> {
  return request(`/share-links/${encodeURIComponent(token)}`)
}
export async function searchMdbEcos(query: string): Promise<Array<{ eco_number: string; eco_title: string | null; file_id: string; file_name: string; file_path: string; part_number: string | null }>> {
  return (await request<{ results: Array<{ eco_number: string; eco_title: string | null; file_id: string; file_name: string; file_path: string; part_number: string | null }> }>(`/search/ecos?q=${encodeURIComponent(query)}`)).results
}

export interface MdbSupplier {
  id: string; name: string; code: string | null; contact_email: string | null; contact_phone: string | null; website: string | null
  city: string | null; state: string | null; country: string | null; is_active: boolean; is_approved: boolean
  erp_id: string | null; erp_synced_at: string | null; created_at: string | null
}
export interface MdbPartSupplier {
  id: string; org_id: string; file_id: string; supplier_id: string; supplier?: MdbSupplier
  supplier_part_number: string | null; supplier_description: string | null; supplier_url: string | null; unit_price: number | null
  currency: string | null; price_unit: string | null; price_breaks: Array<{ qty: number; price: number }> | null
  min_order_qty: number | null; order_multiple: number | null; lead_time_days: number | null; is_preferred: boolean | null
  is_active: boolean | null; is_qualified: boolean | null; qualified_at: string | null; notes: string | null
  last_price_update: string | null; created_at: string | null; updated_at: string | null
}
export type MdbPartSupplierInput = {
  supplierPartNumber?: string | null; supplierDescription?: string | null; supplierUrl?: string | null; unitPrice?: number | null
  currency?: string; priceUnit?: string; priceBreaks?: Array<{ qty: number; price: number }> | null; minOrderQty?: number | null
  orderMultiple?: number | null; leadTimeDays?: number | null; isPreferred?: boolean; isQualified?: boolean; qualifiedAt?: string | null; notes?: string | null
}
export async function getMdbSuppliers(): Promise<MdbSupplier[]> { return (await request<{ suppliers: MdbSupplier[] }>('/suppliers')).suppliers }
export async function getMdbPartSuppliers(fileId: string): Promise<MdbPartSupplier[]> { return (await request<{ partSuppliers: MdbPartSupplier[] }>(`/files/${encodeURIComponent(fileId)}/suppliers`)).partSuppliers }
export async function createMdbPartSupplier(fileId: string, supplierId: string, input: MdbPartSupplierInput): Promise<MdbPartSupplier> {
  return (await request<{ partSupplier: MdbPartSupplier }>(`/files/${encodeURIComponent(fileId)}/suppliers`, { method: 'POST', body: JSON.stringify({ supplierId, ...input }) })).partSupplier
}
export async function updateMdbPartSupplier(partSupplierId: string, input: MdbPartSupplierInput): Promise<MdbPartSupplier> {
  return (await request<{ partSupplier: MdbPartSupplier }>(`/part-suppliers/${encodeURIComponent(partSupplierId)}`, { method: 'PATCH', body: JSON.stringify(input) })).partSupplier
}
export async function setMdbPreferredPartSupplier(fileId: string, partSupplierId: string): Promise<void> { await request(`/files/${encodeURIComponent(fileId)}/suppliers/${encodeURIComponent(partSupplierId)}/preferred`, { method: 'POST' }) }
export async function removeMdbPartSupplier(partSupplierId: string): Promise<void> { await request(`/part-suppliers/${encodeURIComponent(partSupplierId)}`, { method: 'DELETE' }) }

export interface MdbDeviation {
  id: string; deviation_number: string; title: string; description: string | null; status: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'closed' | 'expired'
  deviation_type: string | null; effective_date: string | null; expiration_date: string | null; approved_by: string | null; approved_at: string | null
  rejection_reason: string | null; affected_part_numbers: string[] | null; created_at: string | null; created_by: string
  file_count: number; created_by_name: string | null; created_by_email: string | null; approved_by_name: string | null
}
export interface MdbFileDeviation {
  id: string; file_id: string; deviation_id: string; file_version: number | null; file_revision: string | null; created_at: string | null; notes: string | null
  file: { id: string; file_name: string; file_path: string; part_number: string | null; revision: string; version: number }
}
export async function getMdbDeviations(): Promise<MdbDeviation[]> { return (await request<{ deviations: MdbDeviation[] }>('/deviations')).deviations }
export async function createMdbDeviation(payload: { deviationNumber: string; title: string; description?: string | null; deviationType?: string | null; expirationDate?: string | null }): Promise<MdbDeviation> { return (await request<{ deviation: MdbDeviation }>('/deviations', { method: 'POST', body: JSON.stringify(payload) })).deviation }
export async function getMdbDeviationFiles(deviationId: string): Promise<MdbFileDeviation[]> { return (await request<{ files: MdbFileDeviation[] }>(`/deviations/${encodeURIComponent(deviationId)}/files`)).files }
export async function setMdbDeviationFiles(deviationId: string, files: Array<{ fileId: string; fileVersion?: number | null; fileRevision?: string | null; notes?: string | null }>, affectedPartNumbers: string[]): Promise<void> { await request(`/deviations/${encodeURIComponent(deviationId)}/files`, { method: 'PUT', body: JSON.stringify({ files, affectedPartNumbers }) }) }
export async function removeMdbDeviationFile(fileDeviationId: string): Promise<void> { await request(`/file-deviations/${encodeURIComponent(fileDeviationId)}`, { method: 'DELETE' }) }
export async function updateMdbDeviationStatus(deviationId: string, status: MdbDeviation['status']): Promise<void> { await request(`/deviations/${encodeURIComponent(deviationId)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }) }
export async function deleteMdbAccount(): Promise<void> { await request<void>('/account', { method: 'DELETE' }) }
export type MdbEco = { id:string; eco_number:string; title:string|null; description:string|null; status:'open'|'in_progress'|'completed'|'cancelled'; created_at:string|null; created_by:string; created_by_name:string|null; created_by_email:string|null; file_count:number }
export type MdbFileEco = { id:string; file_id:string; eco_id:string; created_at:string|null; notes:string|null; file:{id:string;file_name:string;file_path:string;part_number:string|null;revision:string} }
export async function getMdbEcos():Promise<MdbEco[]>{return (await request<{ecos:MdbEco[]}>('/ecos')).ecos}
export async function createMdbEco(payload:{ecoNumber:string;title?:string|null;description?:string|null}):Promise<MdbEco>{return (await request<{eco:MdbEco}>('/ecos',{method:'POST',body:JSON.stringify(payload)})).eco}
export async function getMdbEcoFiles(ecoId:string):Promise<MdbFileEco[]>{return (await request<{files:MdbFileEco[]}>(`/ecos/${encodeURIComponent(ecoId)}/files`)).files}
export async function updateMdbEcoStatus(ecoId:string,status:MdbEco['status']):Promise<void>{await request(`/ecos/${encodeURIComponent(ecoId)}/status`,{method:'PATCH',body:JSON.stringify({status})})}
export type MdbOrganizationProfile={logo_storage_path:string|null;phone:string|null;website:string|null;contact_email:string|null}
export type MdbOrganizationAddress={id:string;org_id:string;address_type:'billing'|'shipping';label:string;is_default:boolean;company_name:string|null;contact_name:string|null;address_line1:string;address_line2:string|null;city:string;state:string|null;postal_code:string|null;country:string;attention_to:string|null;phone:string|null}
export async function getMdbOrganizationProfile():Promise<MdbOrganizationProfile|null>{return (await request<{profile:MdbOrganizationProfile|null}>('/organizations/current/profile')).profile}
export async function getMdbOrganizationAddresses():Promise<MdbOrganizationAddress[]>{return (await request<{addresses:MdbOrganizationAddress[]}>('/organizations/current/addresses')).addresses}
export async function updateMdbOrganizationProfile(payload:Partial<{phone:string|null;website:string|null;contactEmail:string|null;logoStoragePath:string|null}>):Promise<void>{await request('/organizations/current/profile',{method:'PATCH',body:JSON.stringify(payload)})}

type MdbEventRow = {
  id: number | string
  type: string
  payload: unknown
  createdAt: string
  userEmail: string | null
  fileName: string | null
  filePath: string | null
}

function parseMdbEventPayload(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) return payload as Record<string, unknown>
  if (typeof payload !== 'string') return {}
  try {
    const parsed = JSON.parse(payload)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function mapMdbEvent(event: MdbEventRow): MdbActivityEntry {
  const actions: Record<string, string> = {
    'file.checked_out': 'checkout',
    'file.checked_in': 'checkin',
    'file.registered': 'create',
    'file.imported': 'create',
    'file.trashed': 'delete',
    'file.permanently_deleted': 'delete',
    'file.restored': 'restore',
    'file.state_changed': 'state_change',
    'workflow.transition_executed': 'state_change',
    'file.moved': 'move',
  }
  return {
    id: String(event.id),
    action: actions[event.type] ?? event.type,
    user_email: event.userEmail ?? 'system@blueplm.local',
    details: parseMdbEventPayload(event.payload),
    created_at: event.createdAt,
    file: event.fileName && event.filePath ? { file_name: event.fileName, file_path: event.filePath } : null,
  }
}

export async function getMdbActivity(limit = 50): Promise<MdbActivityEntry[]> {
  const result = await request<{ events: MdbEventRow[] }>(`/activity?limit=${encodeURIComponent(String(limit))}`)
  return result.events.map(mapMdbEvent)
}

export async function getMdbFileActivity(fileId: string, limit = 20): Promise<MdbActivityEntry[]> {
  const result = await request<{ events: MdbEventRow[] }>(`/files/${encodeURIComponent(fileId)}/activity?limit=${encodeURIComponent(String(limit))}`)
  return result.events.map(mapMdbEvent)
}

export async function registerMdbDeviceSession(payload: { machineId: string; machineName: string | null; platform: string; appVersion: string; osVersion?: string | null }): Promise<MdbDeviceSession> {
  return (await request<{ session: MdbDeviceSession }>('/device-sessions', { method: 'POST', body: JSON.stringify(payload) })).session
}

export async function heartbeatMdbDeviceSession(machineId: string): Promise<boolean> {
  return (await request<{ active: boolean }>('/device-sessions/current/heartbeat', { method: 'PATCH', body: JSON.stringify({ machineId }) })).active
}

export async function endMdbDeviceSession(machineId: string): Promise<void> {
  await request<{ success: boolean }>('/device-sessions/current/end', { method: 'PATCH', body: JSON.stringify({ machineId }) })
}

export async function endRemoteMdbDeviceSession(sessionId: string): Promise<void> {
  await request<{ success: boolean }>(`/device-sessions/${encodeURIComponent(sessionId)}/end`, { method: 'PATCH' })
}

export async function getMdbDeviceSessions(): Promise<MdbDeviceSession[]> {
  return (await request<{ sessions: MdbDeviceSession[] }>('/device-sessions/mine')).sessions
}

export async function getMdbOnlineUsers(): Promise<MdbOnlineUser[]> {
  return (await request<{ users: MdbOnlineUser[] }>('/organizations/current/online-users')).users
}

export async function getMdbCheckoutOwner(fileId: string): Promise<{ id: string; email: string; full_name: string | null; avatar_url: string | null } | null> {
  return (await request<{ user: { id: string; email: string; full_name: string | null; avatar_url: string | null } | null }>(`/files/${encodeURIComponent(fileId)}/checkout-owner`)).user
}

export async function watchMdbFile(fileId: string, options: { notifyOnCheckin?: boolean; notifyOnCheckout?: boolean; notifyOnStateChange?: boolean; notifyOnReview?: boolean }): Promise<void> {
  await request<{ success: boolean }>(`/files/${encodeURIComponent(fileId)}/watcher`, { method: 'PUT', body: JSON.stringify(options) })
}

export async function unwatchMdbFile(fileId: string): Promise<void> {
  await request<{ success: boolean }>(`/files/${encodeURIComponent(fileId)}/watcher`, { method: 'DELETE' })
}

export async function isWatchingMdbFile(fileId: string): Promise<boolean> {
  return (await request<{ watching: boolean }>(`/files/${encodeURIComponent(fileId)}/watcher`)).watching
}

export async function getMdbWatchedFiles(): Promise<Array<Record<string, unknown>>> {
  return (await request<{ watchers: Array<Record<string, unknown>> }>('/file-watchers/mine')).watchers
}

export async function getMdbActiveEcos(): Promise<Array<Record<string, unknown>>> {
  return (await request<{ ecos: Array<Record<string, unknown>> }>('/ecos/active')).ecos
}
export async function addMdbFileToEco(fileId: string, ecoId: string, notes?: string): Promise<void> {
  await request<{ success: boolean }>(`/files/${encodeURIComponent(fileId)}/ecos/${encodeURIComponent(ecoId)}`, { method: 'POST', body: JSON.stringify({ notes }) })
}
export async function removeMdbFileFromEco(fileId: string, ecoId: string): Promise<void> {
  await request<{ success: boolean }>(`/files/${encodeURIComponent(fileId)}/ecos/${encodeURIComponent(ecoId)}`, { method: 'DELETE' })
}
export async function getMdbFileEcos(fileId: string): Promise<Array<Record<string, unknown>>> {
  return (await request<{ ecos: Array<Record<string, unknown>> }>(`/files/${encodeURIComponent(fileId)}/ecos`)).ecos
}
export async function createMdbRecoveryCode(description?: string, expiresInDays = 90): Promise<{ code: string; codeId: string }> {
  return request('/recovery-codes', { method: 'POST', body: JSON.stringify({ description, expiresInDays }) })
}
export async function listMdbRecoveryCodes(): Promise<Array<Record<string, unknown>>> { return (await request<{ codes: Array<Record<string, unknown>> }>('/recovery-codes')).codes }
export async function revokeMdbRecoveryCode(codeId: string, reason?: string): Promise<void> {
  await request<{ success: boolean }>(`/recovery-codes/${encodeURIComponent(codeId)}/revoke`, { method: 'PATCH', body: JSON.stringify({ reason }) })
}
export async function deleteMdbRecoveryCode(codeId: string): Promise<void> {
  await request<void>(`/recovery-codes/${encodeURIComponent(codeId)}`, { method: 'DELETE' })
}
export async function useMdbRecoveryCode(code: string): Promise<{ success: boolean; message?: string; error?: string }> { return request('/recovery-codes/use', { method: 'POST', body: JSON.stringify({ code }) }) }

export function mdbAccessToken(): string | null {
  return loadMdbConfig()?.accessToken ?? null
}

export function signOutMdb(): void {
  const config = loadMdbConfig()
  if (config) saveMdbConfig({ ...config, accessToken: undefined })
}

export async function checkoutMdbFile(fileId: string, clientWorkingPath: string, vaultId?: string): Promise<{ expiresAt: string }> {
  const result = await request<{ checkoutToken: string; expiresAt: string }>(
    `/files/${encodeURIComponent(fileId)}/checkout`,
    { method: 'POST', body: JSON.stringify({ clientWorkingPath }) },
  )
  const checkouts = loadMdbCheckouts()
  checkouts[fileId] = { token: result.checkoutToken, vaultId }
  saveMdbCheckouts(checkouts)
  return { expiresAt: result.expiresAt }
}

export async function checkinMdbFile(
  fileId: string,
  payload: { storageRelativePath: string; contentHash?: string; sizeBytes?: number; comment?: string; partNumber?: string | null },
): Promise<{ revision: number }> {
  const checkout = loadMdbCheckouts()[fileId]
  if (!checkout?.token) throw new Error('This file has no MDB checkout on this client.')
  const result = await request<{ revision: number }>(`/files/${encodeURIComponent(fileId)}/checkin`, {
    method: 'POST',
    body: JSON.stringify({ checkoutToken: checkout.token, ...payload }),
  })
  const checkouts = loadMdbCheckouts()
  delete checkouts[fileId]
  saveMdbCheckouts(checkouts)
  return result
}

export async function cancelMdbCheckout(fileId: string): Promise<void> {
  const checkout = loadMdbCheckouts()[fileId]
  if (!checkout?.token) return
  await request<void>(`/files/${encodeURIComponent(fileId)}/checkout/cancel`, {
    method: 'POST', body: JSON.stringify({ checkoutToken: checkout.token }),
  })
  const checkouts = loadMdbCheckouts()
  delete checkouts[fileId]
  saveMdbCheckouts(checkouts)
}
