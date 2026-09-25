/**
 * Community-backend session and configuration bridge.
 *
 * The upstream Supabase implementation remains isolated behind its own module
 * while callers are moved one domain at a time to this HTTP API. No Supabase
 * key is used in Community mode.
 */
import { activateBackend } from './backend'
import { isBackendConfigured } from './backendAdapter'

export { isBackendConfigured } from './backendAdapter'

const STORAGE_KEY = 'blueplm-community-config'
const CHECKOUTS_STORAGE_KEY = 'blueplm-community-checkouts'

export interface CommunityConfig {
  version: 1
  serverUrl: string
  accessToken?: string
}

export type CommunityMembershipRole = 'owner' | 'admin' | 'member' | 'viewer' | 'guest'

export class CommunityTotpRequiredError extends Error {
  constructor(public readonly challengeToken: string, public readonly expiresAt: string) {
    super('Authenticator code required.')
    this.name = 'CommunityTotpRequiredError'
  }
}

export interface CommunityTotpStatus {
  enabled: boolean
  enabledAt: string | null
}

export interface CommunityTotpEnrollment {
  enrollmentToken: string
  secret: string
  provisioningUri: string
  expiresAt: string
}

export interface CommunityPrincipal {
  userId: string
  organizationId: string
  email: string
  displayName: string
  role: CommunityMembershipRole
  createdAt: string
}

export interface CommunityOrganization {
  id: string
  name: string
  slug: string
  createdAt: string
  defaultNewUserTeamId: string | null
  /** Shared SOLIDWORKS Document Manager key, available only to authenticated organization users. */
  documentManagerLicenseKey: string | null
}

export interface CommunityUser {
  id: string
  email: string
  displayName: string
  role: CommunityMembershipRole
  createdAt: string
}

export interface CommunityVault {
  id: string
  name: string
  networkRoot: string | null
  storageProvider: 'network'
  createdAt: string
}

export interface CommunityTeam {
  id: string
  name: string
  color: string
  icon: string
  createdAt: string
  memberCount: number
  vaultCount: number
}

export interface CommunityTeamMember {
  userId: string
  addedAt: string
  email: string
  displayName: string
  role: CommunityMembershipRole
}

export type CommunityPermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'admin'

export interface CommunityFile {
  id: string
  canonicalPath: string
  fileName: string
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

export interface CommunityWorkflowTemplate {
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

export interface CommunityWorkflowState { id: string; workflow_id: string; name: string; [key: string]: unknown }
export interface CommunityWorkflowTransition { id: string; workflow_id: string; from_state_id: string; to_state_id: string; [key: string]: unknown }
export interface CommunityWorkflowGate { id: string; transition_id: string; name: string; [key: string]: unknown }
export interface CommunityTransitionResult {
  success: boolean
  requires_review: boolean
  new_state_id: string | null
  new_state_name: string | null
  new_revision: string | null
  error_code: string | null
  error_message: string | null
}

export interface CommunityAnnotation {
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

export interface CommunityItemDefinition {
  anyStage: boolean
  workflowStageIds: string[]
  anyType: boolean
  fileTypes: Array<'part' | 'assembly' | 'drawing' | 'pdf' | 'step' | 'other'>
  requirePartNumber: boolean
  matchOrgFormat: boolean
}

export interface CommunityItemDesignation { id: string; name: string; sort_order: number }
export interface CommunityItemDesignationAssignment { part_number: string; designation_id: string }

export interface CommunityTrashedFile {
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

export interface CommunityActivityEntry {
  id: string
  action: string
  user_email: string
  details: Record<string, unknown>
  created_at: string
  file: { file_name: string; file_path: string } | null
}

export interface CommunityDeviceSession {
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

export interface CommunityOnlineUser {
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

export interface CommunityFolder {
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

type CommunityCheckout = { token: string; vaultId?: string }

function loadCommunityCheckouts(): Record<string, CommunityCheckout> {
  try {
    const parsed = JSON.parse(localStorage.getItem(CHECKOUTS_STORAGE_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed as Record<string, CommunityCheckout> : {}
  } catch {
    return {}
  }
}

function saveCommunityCheckouts(checkouts: Record<string, CommunityCheckout>): void {
  localStorage.setItem(CHECKOUTS_STORAGE_KEY, JSON.stringify(checkouts))
}

function normalizeServerUrl(serverUrl: string): string {
  const url = new URL(serverUrl)
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Backend URL must use HTTP or HTTPS.')
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error('A network backend must use HTTPS.')
  }
  return url.toString().replace(/\/$/, '')
}

export function loadCommunityConfig(): CommunityConfig | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (!value) return null
    const parsed = JSON.parse(value) as Partial<CommunityConfig>
    if (parsed.version !== 1 || !parsed.serverUrl) return null
    return { version: 1, serverUrl: normalizeServerUrl(parsed.serverUrl), accessToken: parsed.accessToken }
  } catch {
    return null
  }
}

export function saveCommunityConfig(config: CommunityConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...config, serverUrl: normalizeServerUrl(config.serverUrl) }))
  activateBackend('community')
  notify()
}

export function clearCommunityConfig(): void {
  localStorage.removeItem(STORAGE_KEY)
  notify()
}

export function isCommunityServerConfigured(): boolean {
  return isBackendConfigured('community') && loadCommunityConfig() !== null
}

export function onCommunityAuthChange(listener: AuthListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

async function request<T>(path: string, init: RequestInit = {}, needsAuth = true): Promise<T> {
  const config = loadCommunityConfig()
  if (!config) throw new Error('Community backend is not configured.')
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
    if (!response.ok) throw new Error(body.message ?? body.error ?? `Backend request failed (${response.status}).`)
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

export async function validateCommunityConfig(serverUrl: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const normalized = normalizeServerUrl(serverUrl)
    const response = await fetch(new URL('/health', `${normalized}/`))
    if (!response.ok) return { valid: false, error: `Backend returned HTTP ${response.status}.` }
    const body = await response.json() as { supabase?: boolean }
    return body.supabase === false ? { valid: true } : { valid: false, error: 'This is not a BluePLM Community backend.' }
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Backend is unreachable.' }
  }
}

export async function signInCommunity(email: string, password: string): Promise<CommunityPrincipal> {
  const result = await request<{ token?: string; totpRequired?: boolean; challengeToken?: string; expiresAt: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }, false)
  if (result.totpRequired && result.challengeToken) {
    throw new CommunityTotpRequiredError(result.challengeToken, result.expiresAt)
  }
  if (!result.token) throw new Error('The MDB backend returned an invalid login response.')
  const config = loadCommunityConfig()
  if (!config) throw new Error('Community backend is not configured.')
  saveCommunityConfig({ ...config, accessToken: result.token })
  return await getCommunityPrincipal()
}

export async function verifyCommunityTotp(challengeToken: string, code: string): Promise<CommunityPrincipal> {
  const result = await request<{ token: string }>('/auth/totp/verify', {
    method: 'POST',
    body: JSON.stringify({ challengeToken, code }),
  }, false)
  const config = loadCommunityConfig()
  if (!config) throw new Error('Community backend is not configured.')
  saveCommunityConfig({ ...config, accessToken: result.token })
  return getCommunityPrincipal()
}

export async function getCommunityTotpStatus(): Promise<CommunityTotpStatus> {
  return request<CommunityTotpStatus>('/account/totp')
}

export async function startCommunityTotpEnrollment(): Promise<CommunityTotpEnrollment> {
  return request<CommunityTotpEnrollment>('/account/totp/enrollment', { method: 'POST' })
}

export async function confirmCommunityTotpEnrollment(enrollmentToken: string, code: string): Promise<void> {
  await request<{ enabled: boolean }>('/account/totp/confirm', {
    method: 'POST',
    body: JSON.stringify({ enrollmentToken, code }),
  })
}

export async function disableCommunityTotp(code: string): Promise<void> {
  await request<{ enabled: boolean }>('/account/totp', {
    method: 'DELETE',
    body: JSON.stringify({ code }),
  })
}

export async function getCommunityPrincipal(): Promise<CommunityPrincipal> {
  return (await request<{ user: CommunityPrincipal }>('/auth/me')).user
}

export async function getCommunityOrganization(): Promise<CommunityOrganization> {
  return (await request<{ organization: CommunityOrganization }>('/organizations/current')).organization
}

export async function setCommunityDefaultNewUserTeam(teamId: string | null): Promise<void> {
  await request<{ defaultNewUserTeamId: string | null }>('/organizations/current/settings', {
    method: 'PUT', body: JSON.stringify({ defaultNewUserTeamId: teamId }),
  })
}

export async function setCommunityDocumentManagerLicense(licenseKey: string | null): Promise<void> {
  await request<{ documentManagerLicenseKey: string | null }>('/organizations/current/document-manager-license', {
    method: 'PATCH',
    body: JSON.stringify({ documentManagerLicenseKey: licenseKey }),
  })
}

export async function getCommunityUsers(): Promise<CommunityUser[]> {
  return (await request<{ users: CommunityUser[] }>('/users')).users
}

export async function createCommunityUser(payload: Pick<CommunityUser, 'email' | 'displayName'> & { password: string; role?: Exclude<CommunityMembershipRole, 'owner'> }): Promise<Pick<CommunityUser, 'id' | 'email' | 'displayName' | 'role'>> {
  return request<Pick<CommunityUser, 'id' | 'email' | 'displayName' | 'role'>>('/users', { method: 'POST', body: JSON.stringify(payload) })
}

export async function updateCommunityUser(
  userId: string,
  payload: Partial<Pick<CommunityUser, 'email' | 'displayName'>> & { password?: string; role?: Exclude<CommunityMembershipRole, 'owner'> },
): Promise<CommunityUser> {
  return (await request<{ user: CommunityUser }>(`/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })).user
}

export async function getCommunityUserVaultAccess(userId: string): Promise<string[]> {
  return (await request<{ vaultIds: string[] }>(`/users/${encodeURIComponent(userId)}/vault-access`)).vaultIds
}

export async function setCommunityUserVaultAccess(userId: string, vaultIds: string[]): Promise<void> {
  await request<{ success: boolean }>(`/users/${encodeURIComponent(userId)}/vault-access`, {
    method: 'PUT', body: JSON.stringify({ vaultIds }),
  })
}

export async function removeCommunityUser(userId: string): Promise<void> {
  await request<void>(`/users/${encodeURIComponent(userId)}`, { method: 'DELETE' })
}

export async function getCommunityUserPermissions(userId: string, vaultId: string | null): Promise<Record<string, CommunityPermissionAction[]>> {
  const suffix = vaultId ? `?vaultId=${encodeURIComponent(vaultId)}` : ''
  const result = await request<{ permissions: Array<{ resource: string; actions: CommunityPermissionAction[] }> }>(`/users/${encodeURIComponent(userId)}/permissions${suffix}`)
  return Object.fromEntries(result.permissions.map((permission) => [permission.resource, permission.actions]))
}

export async function setCommunityUserPermissions(userId: string, vaultId: string | null, permissions: Record<string, CommunityPermissionAction[]>): Promise<void> {
  await request<{ success: boolean }>(`/users/${encodeURIComponent(userId)}/permissions`, {
    method: 'PUT', body: JSON.stringify({ vaultId, permissions }),
  })
}

export async function getCommunityOrgVaultAccess(): Promise<Record<string, string[]>> {
  return (await request<{ accessMap: Record<string, string[]> }>('/vaults/access')).accessMap
}

export async function getCommunityTeams(): Promise<CommunityTeam[]> {
  return (await request<{ teams: CommunityTeam[] }>('/teams')).teams
}

export async function getCommunityUserTeams(userId: string): Promise<Array<Pick<CommunityTeam, 'id' | 'name' | 'color' | 'icon'>>> {
  return (await request<{ teams: Array<Pick<CommunityTeam, 'id' | 'name' | 'color' | 'icon'>> }>(`/users/${encodeURIComponent(userId)}/teams`)).teams
}

export async function createCommunityTeam(payload: Pick<CommunityTeam, 'name' | 'color' | 'icon'>): Promise<Pick<CommunityTeam, 'id' | 'name' | 'color' | 'icon'>> {
  return request<Pick<CommunityTeam, 'id' | 'name' | 'color' | 'icon'>>('/teams', { method: 'POST', body: JSON.stringify(payload) })
}

export async function updateCommunityTeam(teamId: string, payload: Pick<CommunityTeam, 'name' | 'color' | 'icon'>): Promise<Pick<CommunityTeam, 'id' | 'name' | 'color' | 'icon'>> {
  return request<Pick<CommunityTeam, 'id' | 'name' | 'color' | 'icon'>>(`/teams/${encodeURIComponent(teamId)}`, { method: 'PATCH', body: JSON.stringify(payload) })
}

export async function deleteCommunityTeam(teamId: string): Promise<void> {
  await request<void>(`/teams/${encodeURIComponent(teamId)}`, { method: 'DELETE' })
}

export async function setCommunityTeamVaultAccess(teamId: string, vaultIds: string[]): Promise<void> {
  await request<{ success: boolean }>(`/teams/${encodeURIComponent(teamId)}/vault-access`, {
    method: 'PUT', body: JSON.stringify({ vaultIds }),
  })
}

export async function getCommunityTeamVaultAccess(teamId: string): Promise<string[]> {
  return (await request<{ vaultIds: string[] }>(`/teams/${encodeURIComponent(teamId)}/vault-access`)).vaultIds
}

export async function getCommunityTeamMembers(teamId: string): Promise<CommunityTeamMember[]> {
  return (await request<{ members: CommunityTeamMember[] }>(`/teams/${encodeURIComponent(teamId)}/members`)).members
}

export async function addCommunityTeamMember(teamId: string, userId: string): Promise<void> {
  await request<void>(`/teams/${encodeURIComponent(teamId)}/members`, {
    method: 'POST', body: JSON.stringify({ userId }),
  })
}

export async function removeCommunityTeamMember(teamId: string, userId: string): Promise<void> {
  await request<void>(`/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' })
}

export async function getCommunityVaults(): Promise<CommunityVault[]> {
  return (await request<{ vaults: CommunityVault[] }>('/vaults')).vaults
}

export async function createCommunityVault(payload: {
  name: string
  storageProvider: 'network'
  networkRoot?: string
}): Promise<CommunityVault> {
  return request<CommunityVault>('/vaults', { method: 'POST', body: JSON.stringify(payload) })
}

export async function getCommunityVault(vaultId: string): Promise<CommunityVault> {
  const vault = (await getCommunityVaults()).find((candidate) => candidate.id === vaultId)
  if (!vault) throw new Error('The selected Community vault is not accessible to this user.')
  return vault
}

export async function getCommunityFiles(vaultId: string): Promise<CommunityFile[]> {
  return (await request<{ files: CommunityFile[] }>(`/vaults/${encodeURIComponent(vaultId)}/files`)).files
}

/**
 * Registers the first immutable revision of a file that was staged by the
 * desktop client in its Community network vault. File bytes never traverse the
 * PHP/MariaDB service.
 */
export async function importCommunityFile(payload: {
  vaultId: string
  canonicalPath: string
  storageRelativePath: string
  fileName: string
  contentHash: string
  sizeBytes: number
}): Promise<{ id: string; created: boolean }> {
  return request<{ id: string; created: boolean }>('/files/import', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function communityObjectStoragePath(contentHash: string): string {
  const normalized = contentHash.trim().toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error('Community revision content hash must be a SHA-256 value.')
  }
  return `.blueplm/objects/${normalized.slice(0, 2)}/${normalized}`
}

export async function getCommunityFolders(vaultId: string): Promise<CommunityFolder[]> {
  return (await request<{ folders: CommunityFolder[] }>(`/vaults/${encodeURIComponent(vaultId)}/folders`)).folders
}

export async function syncCommunityFolder(vaultId: string, folderPath: string): Promise<CommunityFolder> {
  return (await request<{ folder: CommunityFolder }>('/folders', { method: 'POST', body: JSON.stringify({ vaultId, folderPath }) })).folder
}

export async function updateCommunityFolder(folderId: string, folderPath: string): Promise<void> {
  await request<{ success: boolean }>(`/folders/${encodeURIComponent(folderId)}`, { method: 'PATCH', body: JSON.stringify({ folderPath }) })
}

export async function deleteCommunityFolder(folderId: string): Promise<void> {
  await request<void>(`/folders/${encodeURIComponent(folderId)}`, { method: 'DELETE' })
}

export async function moveCommunityFile(fileId: string, canonicalPath: string, fileName?: string): Promise<void> {
  await request<{ success: boolean }>(`/files/${encodeURIComponent(fileId)}/path`, {
    method: 'PATCH', body: JSON.stringify({ canonicalPath, fileName }),
  })
}

export async function moveCommunityFilePathPrefix(vaultId: string, oldFolderPath: string, newFolderPath: string): Promise<{ updated: number; total: number }> {
  return request<{ updated: number; total: number }>(`/vaults/${encodeURIComponent(vaultId)}/files/path-prefix`, {
    method: 'PATCH', body: JSON.stringify({ oldFolderPath, newFolderPath }),
  })
}

export async function updateCommunityFileState(fileId: string, state: CommunityFile['state']): Promise<Pick<CommunityFile, 'id' | 'state'>> {
  return (await request<{ file: Pick<CommunityFile, 'id' | 'state'> }>(`/files/${encodeURIComponent(fileId)}/state`, {
    method: 'PATCH', body: JSON.stringify({ state }),
  })).file
}

export async function getCommunityInspectionRows(fileId: string): Promise<Record<string, unknown>[]> {
  return (await request<{ rows: Record<string, unknown>[] }>(`/files/${encodeURIComponent(fileId)}/inspection`)).rows
}

export async function getCommunityInspectionRowsForRevision(revisionId: string): Promise<Record<string, unknown>[]> {
  return (await request<{ rows: Record<string, unknown>[] }>(`/file-revisions/${encodeURIComponent(revisionId)}/inspection`)).rows
}

export async function saveCommunityInspectionRows(fileId: string, rows: unknown[]): Promise<void> {
  await request<{ success: boolean }>(`/files/${encodeURIComponent(fileId)}/inspection`, { method: 'PUT', body: JSON.stringify({ rows }) })
}

export async function getCommunityInspectionMethods(): Promise<Array<{ id: string; name: string }>> {
  return (await request<{ methods: Array<{ id: string; name: string }> }>('/inspection-methods')).methods
}

export async function createCommunityInspectionMethod(name: string): Promise<{ id: string; name: string }> {
  return (await request<{ method: { id: string; name: string } }>('/inspection-methods', { method: 'POST', body: JSON.stringify({ name }) })).method
}

export async function updateCommunityInspectionMethod(id: string, name: string): Promise<void> {
  await request<{ success: boolean }>(`/inspection-methods/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ name }) })
}

export async function deleteCommunityInspectionMethod(id: string): Promise<void> {
  await request<void>(`/inspection-methods/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function getCommunityTrash(vaultId?: string): Promise<CommunityTrashedFile[]> {
  const suffix = vaultId ? `?vaultId=${encodeURIComponent(vaultId)}` : ''
  return (await request<{ files: CommunityTrashedFile[] }>(`/trash${suffix}`)).files
}

export async function trashCommunityFile(fileId: string): Promise<void> {
  await request<{ success: boolean }>(`/files/${encodeURIComponent(fileId)}/trash`, { method: 'POST' })
}

export async function restoreCommunityFile(fileId: string): Promise<void> {
  await request<{ success: boolean }>(`/files/${encodeURIComponent(fileId)}/restore`, { method: 'POST' })
}

export async function permanentlyDeleteCommunityFile(fileId: string): Promise<void> {
  await request<void>(`/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' })
}

export async function getCommunityAnnotations(fileId: string, version?: number): Promise<CommunityAnnotation[]> {
  const suffix = version === undefined ? '' : `?version=${encodeURIComponent(String(version))}`
  return (await request<{ annotations: CommunityAnnotation[] }>(`/files/${encodeURIComponent(fileId)}/annotations${suffix}`)).annotations
}

export async function createCommunityAnnotation(fileId: string, payload: Record<string, unknown>): Promise<CommunityAnnotation> {
  return (await request<{ annotation: CommunityAnnotation }>(`/files/${encodeURIComponent(fileId)}/annotations`, { method: 'POST', body: JSON.stringify(payload) })).annotation
}

export async function updateCommunityAnnotation(annotationId: string, comment: string): Promise<CommunityAnnotation> {
  return (await request<{ annotation: CommunityAnnotation }>(`/annotations/${encodeURIComponent(annotationId)}`, { method: 'PATCH', body: JSON.stringify({ comment }) })).annotation
}

export async function deleteCommunityAnnotation(annotationId: string): Promise<void> {
  await request<void>(`/annotations/${encodeURIComponent(annotationId)}`, { method: 'DELETE' })
}

export async function getCommunityItemDefinition(): Promise<CommunityItemDefinition> {
  return (await request<{ settings: CommunityItemDefinition }>('/item-definition')).settings
}

export async function updateCommunityItemDefinition(settings: CommunityItemDefinition): Promise<CommunityItemDefinition> {
  return (await request<{ settings: CommunityItemDefinition }>('/item-definition', { method: 'PUT', body: JSON.stringify(settings) })).settings
}

export async function getCommunityItemWorkflowStages(): Promise<Array<{ id: string; name: string; label: string | null; color: string | null }>> {
  return (await request<{ stages: Array<{ id: string; name: string; label: string | null; color: string | null }> }>('/item-definition/workflow-stages')).stages
}

export async function getCommunityItemDesignations(): Promise<CommunityItemDesignation[]> {
  return (await request<{ designations: CommunityItemDesignation[] }>('/item-designations')).designations
}

export async function createCommunityItemDesignation(name: string, sortOrder?: number | null): Promise<CommunityItemDesignation> {
  return (await request<{ designation: CommunityItemDesignation }>('/item-designations', { method: 'POST', body: JSON.stringify({ name, sortOrder }) })).designation
}

export async function updateCommunityItemDesignation(id: string, name: string, sortOrder?: number | null): Promise<CommunityItemDesignation> {
  return (await request<{ designation: CommunityItemDesignation }>(`/item-designations/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ name, sortOrder }) })).designation
}

export async function deleteCommunityItemDesignation(id: string): Promise<void> {
  await request<void>(`/item-designations/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function getCommunityItemDesignationAssignments(vaultId: string): Promise<CommunityItemDesignationAssignment[]> {
  return (await request<{ assignments: CommunityItemDesignationAssignment[] }>(`/vaults/${encodeURIComponent(vaultId)}/item-designations`)).assignments
}

export async function setCommunityItemDesignationAssignment(vaultId: string, partNumber: string, designationId: string | null): Promise<void> {
  await request<void>(`/vaults/${encodeURIComponent(vaultId)}/item-designations/${encodeURIComponent(partNumber)}`, { method: 'PUT', body: JSON.stringify({ designationId }) })
}

export async function syncCommunityFileReferences(fileId: string, references: unknown[], vaultRootPath?: string): Promise<{ success: boolean; inserted: number; updated: number; deleted: number; skipped: number; skippedReasons?: Array<{ swPath: string; reason: 'no_match' | 'file_not_synced' | 'ambiguous_filename' | 'self_reference'; details: string }> }> {
  return request(`/files/${encodeURIComponent(fileId)}/references/sync`, { method: 'POST', body: JSON.stringify({ references, vaultRootPath }) })
}

export async function getCommunityFileReferences(fileId: string, direction: 'contains' | 'where-used'): Promise<Array<Record<string, unknown>>> {
  return (await request<{ references: Array<Record<string, unknown>> }>(`/files/${encodeURIComponent(fileId)}/references/${direction}`)).references
}

export async function resolveCommunityAnnotation(annotationId: string): Promise<CommunityAnnotation> {
  return (await request<{ annotation: CommunityAnnotation }>(`/annotations/${encodeURIComponent(annotationId)}/resolve`, { method: 'POST' })).annotation
}

export async function unresolveCommunityAnnotation(annotationId: string): Promise<CommunityAnnotation> {
  return (await request<{ annotation: CommunityAnnotation }>(`/annotations/${encodeURIComponent(annotationId)}/unresolve`, { method: 'POST' })).annotation
}

export async function getCommunityWorkflows(): Promise<CommunityWorkflowTemplate[]> {
  return (await request<{ workflows: CommunityWorkflowTemplate[] }>('/workflows')).workflows
}

export async function getCommunityWorkflow(workflowId: string): Promise<CommunityWorkflowTemplate> {
  return (await request<{ workflow: CommunityWorkflowTemplate }>(`/workflows/${encodeURIComponent(workflowId)}`)).workflow
}

export async function createCommunityWorkflow(payload: { name: string; description?: string | null; canvas_config?: unknown | null }): Promise<CommunityWorkflowTemplate> {
  return (await request<{ workflow: CommunityWorkflowTemplate }>('/workflows', { method: 'POST', body: JSON.stringify(payload) })).workflow
}

export async function updateCommunityWorkflow(workflowId: string, payload: Record<string, unknown>): Promise<CommunityWorkflowTemplate> {
  return (await request<{ workflow: CommunityWorkflowTemplate }>(`/workflows/${encodeURIComponent(workflowId)}`, { method: 'PATCH', body: JSON.stringify(payload) })).workflow
}

export async function deleteCommunityWorkflow(workflowId: string): Promise<void> {
  await request<void>(`/workflows/${encodeURIComponent(workflowId)}`, { method: 'DELETE' })
}

export async function importCommunityWorkflow(workflowId: string, payload: unknown): Promise<{ state_count: number; transition_count: number; gate_count: number }> {
  return (await request<{ result: { state_count: number; transition_count: number; gate_count: number } }>(`/workflows/${encodeURIComponent(workflowId)}/import`, { method: 'POST', body: JSON.stringify(payload) })).result
}

export async function getCommunityWorkflowStates(workflowId: string): Promise<CommunityWorkflowState[]> {
  return (await request<{ states: CommunityWorkflowState[] }>(`/workflows/${encodeURIComponent(workflowId)}/states`)).states
}

export async function createCommunityWorkflowState(payload: Record<string, unknown>): Promise<CommunityWorkflowState> {
  return (await request<{ state: CommunityWorkflowState }>('/workflow-states', { method: 'POST', body: JSON.stringify(payload) })).state
}

export async function updateCommunityWorkflowState(stateId: string, payload: Record<string, unknown>): Promise<CommunityWorkflowState> {
  return (await request<{ state: CommunityWorkflowState }>(`/workflow-states/${encodeURIComponent(stateId)}`, { method: 'PATCH', body: JSON.stringify(payload) })).state
}

export async function deleteCommunityWorkflowState(stateId: string): Promise<void> {
  await request<void>(`/workflow-states/${encodeURIComponent(stateId)}`, { method: 'DELETE' })
}

export async function getCommunityWorkflowTransitions(workflowId: string): Promise<CommunityWorkflowTransition[]> {
  return (await request<{ transitions: CommunityWorkflowTransition[] }>(`/workflows/${encodeURIComponent(workflowId)}/transitions`)).transitions
}

export async function createCommunityWorkflowTransition(payload: Record<string, unknown>): Promise<CommunityWorkflowTransition> {
  return (await request<{ transition: CommunityWorkflowTransition }>('/workflow-transitions', { method: 'POST', body: JSON.stringify(payload) })).transition
}

export async function updateCommunityWorkflowTransition(transitionId: string, payload: Record<string, unknown>): Promise<CommunityWorkflowTransition> {
  return (await request<{ transition: CommunityWorkflowTransition }>(`/workflow-transitions/${encodeURIComponent(transitionId)}`, { method: 'PATCH', body: JSON.stringify(payload) })).transition
}

export async function deleteCommunityWorkflowTransition(transitionId: string): Promise<void> {
  await request<void>(`/workflow-transitions/${encodeURIComponent(transitionId)}`, { method: 'DELETE' })
}

export async function getCommunityWorkflowGates(transitionIds: string[]): Promise<CommunityWorkflowGate[]> {
  if (transitionIds.length === 0) return []
  return (await request<{ gates: CommunityWorkflowGate[] }>(`/workflow-gates?transitionIds=${encodeURIComponent(transitionIds.join(','))}`)).gates
}

export async function createCommunityWorkflowGate(payload: Record<string, unknown>): Promise<CommunityWorkflowGate> {
  return (await request<{ gate: CommunityWorkflowGate }>('/workflow-gates', { method: 'POST', body: JSON.stringify(payload) })).gate
}

export async function updateCommunityWorkflowGate(gateId: string, payload: Record<string, unknown>): Promise<CommunityWorkflowGate> {
  return (await request<{ gate: CommunityWorkflowGate }>(`/workflow-gates/${encodeURIComponent(gateId)}`, { method: 'PATCH', body: JSON.stringify(payload) })).gate
}

export async function deleteCommunityWorkflowGate(gateId: string): Promise<void> {
  await request<void>(`/workflow-gates/${encodeURIComponent(gateId)}`, { method: 'DELETE' })
}

export async function getCommunityFileWorkflow(fileId: string): Promise<Record<string, unknown> | null> {
  return (await request<{ assignment: Record<string, unknown> | null }>(`/files/${encodeURIComponent(fileId)}/workflow`)).assignment
}

export async function assignCommunityFileWorkflow(fileId: string, workflowId: string, stateId: string): Promise<void> {
  await request<{ success: boolean }>(`/files/${encodeURIComponent(fileId)}/workflow`, { method: 'PUT', body: JSON.stringify({ workflow_id: workflowId, current_state_id: stateId }) })
}

export async function getCommunityAvailableTransitions(fileId: string): Promise<Array<Record<string, unknown>>> {
  return (await request<{ transitions: Array<Record<string, unknown>> }>(`/files/${encodeURIComponent(fileId)}/available-transitions`)).transitions
}

export async function executeCommunityWorkflowTransition(fileId: string, transitionId: string, comment?: string): Promise<CommunityTransitionResult> {
  return (await request<{ result: CommunityTransitionResult }>(`/files/${encodeURIComponent(fileId)}/workflow-transitions/${encodeURIComponent(transitionId)}/execute`, { method: 'POST', body: JSON.stringify({ comment }) })).result
}

export async function getCommunityMyWorkflowReviews(): Promise<Array<Record<string, unknown>>> {
  return (await request<{ reviews: Array<Record<string, unknown>> }>('/workflow-reviews/mine')).reviews
}

export async function decideCommunityWorkflowReview(reviewId: string, decision: 'approved' | 'rejected' | 'kicked_back', comment?: string, checklistResponses?: Record<string, boolean>): Promise<CommunityTransitionResult> {
  return (await request<{ result: CommunityTransitionResult }>(`/workflow-reviews/${encodeURIComponent(reviewId)}/decision`, { method: 'POST', body: JSON.stringify({ decision, comment, checklistResponses }) })).result
}

export async function getCommunityFileRevisions(fileId: string): Promise<Array<{
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

export async function getCommunityRollbackTarget(fileId: string, targetVersion: number, comment?: string): Promise<{
  success: boolean
  targetVersionRecord: Record<string, unknown>
  maxVersion: number
}> {
  return request(`/files/${encodeURIComponent(fileId)}/rollback-target`, {
    method: 'POST', body: JSON.stringify({ targetVersion, comment }),
  })
}

export type CommunityItemImage = { partNumber: string; vaultId: string; imageType: 'icon' | 'image'; iconName: string | null; iconColor: string | null; storageRelativePath: string | null }
export async function getCommunityItemImages(): Promise<CommunityItemImage[]> { return (await request<{ images: CommunityItemImage[] }>('/item-images')).images }
export async function setCommunityItemImage(partNumber: string, payload: Omit<CommunityItemImage, 'partNumber'>): Promise<CommunityItemImage> {
  return request<CommunityItemImage>(`/item-images/${encodeURIComponent(partNumber)}`, { method: 'PUT', body: JSON.stringify(payload) })
}
export async function resetCommunityItemImage(partNumber: string): Promise<void> { await request<void>(`/item-images/${encodeURIComponent(partNumber)}`, { method: 'DELETE' }) }
export async function createCommunityShareLink(fileId: string, expiresInDays = 7): Promise<{ id: string; token: string; expiresAt: string; downloadUrl: string }> {
  return request(`/files/${encodeURIComponent(fileId)}/share-links`, { method: 'POST', body: JSON.stringify({ expiresInDays }) })
}
export async function resolveCommunityShareLink(token: string): Promise<{ file: { id: string; vaultId: string; canonicalPath: string; fileName: string } }> {
  return request(`/share-links/${encodeURIComponent(token)}`)
}
export async function searchCommunityEcos(query: string): Promise<Array<{ eco_number: string; eco_title: string | null; file_id: string; file_name: string; file_path: string; part_number: string | null }>> {
  return (await request<{ results: Array<{ eco_number: string; eco_title: string | null; file_id: string; file_name: string; file_path: string; part_number: string | null }> }>(`/search/ecos?q=${encodeURIComponent(query)}`)).results
}

export interface CommunitySupplier {
  id: string; name: string; code: string | null; contact_email: string | null; contact_phone: string | null; website: string | null
  city: string | null; state: string | null; country: string | null; is_active: boolean; is_approved: boolean
  erp_id: string | null; erp_synced_at: string | null; created_at: string | null
}
export interface CommunityPartSupplier {
  id: string; org_id: string; file_id: string; supplier_id: string; supplier?: CommunitySupplier
  supplier_part_number: string | null; supplier_description: string | null; supplier_url: string | null; unit_price: number | null
  currency: string | null; price_unit: string | null; price_breaks: Array<{ qty: number; price: number }> | null
  min_order_qty: number | null; order_multiple: number | null; lead_time_days: number | null; is_preferred: boolean | null
  is_active: boolean | null; is_qualified: boolean | null; qualified_at: string | null; notes: string | null
  last_price_update: string | null; created_at: string | null; updated_at: string | null
}
export type CommunityPartSupplierInput = {
  supplierPartNumber?: string | null; supplierDescription?: string | null; supplierUrl?: string | null; unitPrice?: number | null
  currency?: string; priceUnit?: string; priceBreaks?: Array<{ qty: number; price: number }> | null; minOrderQty?: number | null
  orderMultiple?: number | null; leadTimeDays?: number | null; isPreferred?: boolean; isQualified?: boolean; qualifiedAt?: string | null; notes?: string | null
}
export async function getCommunitySuppliers(): Promise<CommunitySupplier[]> { return (await request<{ suppliers: CommunitySupplier[] }>('/suppliers')).suppliers }
export async function getCommunityPartSuppliers(fileId: string): Promise<CommunityPartSupplier[]> { return (await request<{ partSuppliers: CommunityPartSupplier[] }>(`/files/${encodeURIComponent(fileId)}/suppliers`)).partSuppliers }
export async function createCommunityPartSupplier(fileId: string, supplierId: string, input: CommunityPartSupplierInput): Promise<CommunityPartSupplier> {
  return (await request<{ partSupplier: CommunityPartSupplier }>(`/files/${encodeURIComponent(fileId)}/suppliers`, { method: 'POST', body: JSON.stringify({ supplierId, ...input }) })).partSupplier
}
export async function updateCommunityPartSupplier(partSupplierId: string, input: CommunityPartSupplierInput): Promise<CommunityPartSupplier> {
  return (await request<{ partSupplier: CommunityPartSupplier }>(`/part-suppliers/${encodeURIComponent(partSupplierId)}`, { method: 'PATCH', body: JSON.stringify(input) })).partSupplier
}
export async function setCommunityPreferredPartSupplier(fileId: string, partSupplierId: string): Promise<void> { await request(`/files/${encodeURIComponent(fileId)}/suppliers/${encodeURIComponent(partSupplierId)}/preferred`, { method: 'POST' }) }
export async function removeCommunityPartSupplier(partSupplierId: string): Promise<void> { await request(`/part-suppliers/${encodeURIComponent(partSupplierId)}`, { method: 'DELETE' }) }

export interface CommunityDeviation {
  id: string; deviation_number: string; title: string; description: string | null; status: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'closed' | 'expired'
  deviation_type: string | null; effective_date: string | null; expiration_date: string | null; approved_by: string | null; approved_at: string | null
  rejection_reason: string | null; affected_part_numbers: string[] | null; created_at: string | null; created_by: string
  file_count: number; created_by_name: string | null; created_by_email: string | null; approved_by_name: string | null
}
export interface CommunityFileDeviation {
  id: string; file_id: string; deviation_id: string; file_version: number | null; file_revision: string | null; created_at: string | null; notes: string | null
  file: { id: string; file_name: string; file_path: string; part_number: string | null; revision: string; version: number }
}
export async function getCommunityDeviations(): Promise<CommunityDeviation[]> { return (await request<{ deviations: CommunityDeviation[] }>('/deviations')).deviations }
export async function createCommunityDeviation(payload: { deviationNumber: string; title: string; description?: string | null; deviationType?: string | null; expirationDate?: string | null }): Promise<CommunityDeviation> { return (await request<{ deviation: CommunityDeviation }>('/deviations', { method: 'POST', body: JSON.stringify(payload) })).deviation }
export async function getCommunityDeviationFiles(deviationId: string): Promise<CommunityFileDeviation[]> { return (await request<{ files: CommunityFileDeviation[] }>(`/deviations/${encodeURIComponent(deviationId)}/files`)).files }
export async function setCommunityDeviationFiles(deviationId: string, files: Array<{ fileId: string; fileVersion?: number | null; fileRevision?: string | null; notes?: string | null }>, affectedPartNumbers: string[]): Promise<void> { await request(`/deviations/${encodeURIComponent(deviationId)}/files`, { method: 'PUT', body: JSON.stringify({ files, affectedPartNumbers }) }) }
export async function removeCommunityDeviationFile(fileDeviationId: string): Promise<void> { await request(`/file-deviations/${encodeURIComponent(fileDeviationId)}`, { method: 'DELETE' }) }
export async function updateCommunityDeviationStatus(deviationId: string, status: CommunityDeviation['status']): Promise<void> { await request(`/deviations/${encodeURIComponent(deviationId)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }) }
export async function deleteCommunityAccount(): Promise<void> { await request<void>('/account', { method: 'DELETE' }) }
export type CommunityEco = { id:string; eco_number:string; title:string|null; description:string|null; status:'open'|'in_progress'|'completed'|'cancelled'; created_at:string|null; created_by:string; created_by_name:string|null; created_by_email:string|null; file_count:number }
export type CommunityFileEco = { id:string; file_id:string; eco_id:string; created_at:string|null; notes:string|null; file:{id:string;file_name:string;file_path:string;part_number:string|null;revision:string} }
export async function getCommunityEcos():Promise<CommunityEco[]>{return (await request<{ecos:CommunityEco[]}>('/ecos')).ecos}
export async function createCommunityEco(payload:{ecoNumber:string;title?:string|null;description?:string|null}):Promise<CommunityEco>{return (await request<{eco:CommunityEco}>('/ecos',{method:'POST',body:JSON.stringify(payload)})).eco}
export async function getCommunityEcoFiles(ecoId:string):Promise<CommunityFileEco[]>{return (await request<{files:CommunityFileEco[]}>(`/ecos/${encodeURIComponent(ecoId)}/files`)).files}
export async function updateCommunityEcoStatus(ecoId:string,status:CommunityEco['status']):Promise<void>{await request(`/ecos/${encodeURIComponent(ecoId)}/status`,{method:'PATCH',body:JSON.stringify({status})})}
export type CommunityOrganizationProfile={logo_storage_path:string|null;phone:string|null;website:string|null;contact_email:string|null}
export type CommunityOrganizationAddress={id:string;org_id:string;address_type:'billing'|'shipping';label:string;is_default:boolean;company_name:string|null;contact_name:string|null;address_line1:string;address_line2:string|null;city:string;state:string|null;postal_code:string|null;country:string;attention_to:string|null;phone:string|null}
export async function getCommunityOrganizationProfile():Promise<CommunityOrganizationProfile|null>{return (await request<{profile:CommunityOrganizationProfile|null}>('/organizations/current/profile')).profile}
export async function getCommunityOrganizationAddresses():Promise<CommunityOrganizationAddress[]>{return (await request<{addresses:CommunityOrganizationAddress[]}>('/organizations/current/addresses')).addresses}
export async function updateCommunityOrganizationProfile(payload:Partial<{phone:string|null;website:string|null;contactEmail:string|null;logoStoragePath:string|null}>):Promise<void>{await request('/organizations/current/profile',{method:'PATCH',body:JSON.stringify(payload)})}

type CommunityEventRow = {
  id: number | string
  type: string
  payload: unknown
  createdAt: string
  userEmail: string | null
  fileName: string | null
  filePath: string | null
}

function parseCommunityEventPayload(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) return payload as Record<string, unknown>
  if (typeof payload !== 'string') return {}
  try {
    const parsed = JSON.parse(payload)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function mapCommunityEvent(event: CommunityEventRow): CommunityActivityEntry {
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
    details: parseCommunityEventPayload(event.payload),
    created_at: event.createdAt,
    file: event.fileName && event.filePath ? { file_name: event.fileName, file_path: event.filePath } : null,
  }
}

export async function getCommunityActivity(limit = 50): Promise<CommunityActivityEntry[]> {
  const result = await request<{ events: CommunityEventRow[] }>(`/activity?limit=${encodeURIComponent(String(limit))}`)
  return result.events.map(mapCommunityEvent)
}

export async function getCommunityFileActivity(fileId: string, limit = 20): Promise<CommunityActivityEntry[]> {
  const result = await request<{ events: CommunityEventRow[] }>(`/files/${encodeURIComponent(fileId)}/activity?limit=${encodeURIComponent(String(limit))}`)
  return result.events.map(mapCommunityEvent)
}

export async function registerCommunityDeviceSession(payload: { machineId: string; machineName: string | null; platform: string; appVersion: string; osVersion?: string | null }): Promise<CommunityDeviceSession> {
  return (await request<{ session: CommunityDeviceSession }>('/device-sessions', { method: 'POST', body: JSON.stringify(payload) })).session
}

export async function heartbeatCommunityDeviceSession(machineId: string): Promise<boolean> {
  return (await request<{ active: boolean }>('/device-sessions/current/heartbeat', { method: 'PATCH', body: JSON.stringify({ machineId }) })).active
}

export async function endCommunityDeviceSession(machineId: string): Promise<void> {
  await request<{ success: boolean }>('/device-sessions/current/end', { method: 'PATCH', body: JSON.stringify({ machineId }) })
}

export async function endRemoteCommunityDeviceSession(sessionId: string): Promise<void> {
  await request<{ success: boolean }>(`/device-sessions/${encodeURIComponent(sessionId)}/end`, { method: 'PATCH' })
}

export async function getCommunityDeviceSessions(): Promise<CommunityDeviceSession[]> {
  return (await request<{ sessions: CommunityDeviceSession[] }>('/device-sessions/mine')).sessions
}

export async function getCommunityOnlineUsers(): Promise<CommunityOnlineUser[]> {
  return (await request<{ users: CommunityOnlineUser[] }>('/organizations/current/online-users')).users
}

export async function getCommunityCheckoutOwner(fileId: string): Promise<{ id: string; email: string; full_name: string | null; avatar_url: string | null } | null> {
  return (await request<{ user: { id: string; email: string; full_name: string | null; avatar_url: string | null } | null }>(`/files/${encodeURIComponent(fileId)}/checkout-owner`)).user
}

export async function watchCommunityFile(fileId: string, options: { notifyOnCheckin?: boolean; notifyOnCheckout?: boolean; notifyOnStateChange?: boolean; notifyOnReview?: boolean }): Promise<void> {
  await request<{ success: boolean }>(`/files/${encodeURIComponent(fileId)}/watcher`, { method: 'PUT', body: JSON.stringify(options) })
}

export async function unwatchCommunityFile(fileId: string): Promise<void> {
  await request<{ success: boolean }>(`/files/${encodeURIComponent(fileId)}/watcher`, { method: 'DELETE' })
}

export async function isWatchingCommunityFile(fileId: string): Promise<boolean> {
  return (await request<{ watching: boolean }>(`/files/${encodeURIComponent(fileId)}/watcher`)).watching
}

export async function getCommunityWatchedFiles(): Promise<Array<Record<string, unknown>>> {
  return (await request<{ watchers: Array<Record<string, unknown>> }>('/file-watchers/mine')).watchers
}

export async function getCommunityActiveEcos(): Promise<Array<Record<string, unknown>>> {
  return (await request<{ ecos: Array<Record<string, unknown>> }>('/ecos/active')).ecos
}
export async function addCommunityFileToEco(fileId: string, ecoId: string, notes?: string): Promise<void> {
  await request<{ success: boolean }>(`/files/${encodeURIComponent(fileId)}/ecos/${encodeURIComponent(ecoId)}`, { method: 'POST', body: JSON.stringify({ notes }) })
}
export async function removeCommunityFileFromEco(fileId: string, ecoId: string): Promise<void> {
  await request<{ success: boolean }>(`/files/${encodeURIComponent(fileId)}/ecos/${encodeURIComponent(ecoId)}`, { method: 'DELETE' })
}
export async function getCommunityFileEcos(fileId: string): Promise<Array<Record<string, unknown>>> {
  return (await request<{ ecos: Array<Record<string, unknown>> }>(`/files/${encodeURIComponent(fileId)}/ecos`)).ecos
}
export async function createCommunityRecoveryCode(description?: string, expiresInDays = 90): Promise<{ code: string; codeId: string }> {
  return request('/recovery-codes', { method: 'POST', body: JSON.stringify({ description, expiresInDays }) })
}
export async function listCommunityRecoveryCodes(): Promise<Array<Record<string, unknown>>> { return (await request<{ codes: Array<Record<string, unknown>> }>('/recovery-codes')).codes }
export async function revokeCommunityRecoveryCode(codeId: string, reason?: string): Promise<void> {
  await request<{ success: boolean }>(`/recovery-codes/${encodeURIComponent(codeId)}/revoke`, { method: 'PATCH', body: JSON.stringify({ reason }) })
}
export async function deleteCommunityRecoveryCode(codeId: string): Promise<void> {
  await request<void>(`/recovery-codes/${encodeURIComponent(codeId)}`, { method: 'DELETE' })
}
export async function useCommunityRecoveryCode(code: string): Promise<{ success: boolean; message?: string; error?: string }> { return request('/recovery-codes/use', { method: 'POST', body: JSON.stringify({ code }) }) }

export function communityAccessToken(): string | null {
  return loadCommunityConfig()?.accessToken ?? null
}

export function signOutCommunity(): void {
  const config = loadCommunityConfig()
  if (config) saveCommunityConfig({ ...config, accessToken: undefined })
}

export async function checkoutCommunityFile(fileId: string, clientWorkingPath: string, vaultId?: string): Promise<{ expiresAt: string }> {
  const result = await request<{ checkoutToken: string; expiresAt: string }>(
    `/files/${encodeURIComponent(fileId)}/checkout`,
    { method: 'POST', body: JSON.stringify({ clientWorkingPath }) },
  )
  const checkouts = loadCommunityCheckouts()
  checkouts[fileId] = { token: result.checkoutToken, vaultId }
  saveCommunityCheckouts(checkouts)
  return { expiresAt: result.expiresAt }
}

export async function checkinCommunityFile(
  fileId: string,
  payload: { storageRelativePath: string; contentHash?: string; sizeBytes?: number; comment?: string },
): Promise<{ revision: number }> {
  const checkout = loadCommunityCheckouts()[fileId]
  if (!checkout?.token) throw new Error('This file has no Community checkout on this client.')
  const result = await request<{ revision: number }>(`/files/${encodeURIComponent(fileId)}/checkin`, {
    method: 'POST',
    body: JSON.stringify({ checkoutToken: checkout.token, ...payload }),
  })
  const checkouts = loadCommunityCheckouts()
  delete checkouts[fileId]
  saveCommunityCheckouts(checkouts)
  return result
}

export async function cancelCommunityCheckout(fileId: string): Promise<void> {
  const checkout = loadCommunityCheckouts()[fileId]
  if (!checkout?.token) return
  await request<void>(`/files/${encodeURIComponent(fileId)}/checkout/cancel`, {
    method: 'POST', body: JSON.stringify({ checkoutToken: checkout.token }),
  })
  const checkouts = loadCommunityCheckouts()
  delete checkouts[fileId]
  saveCommunityCheckouts(checkouts)
}
