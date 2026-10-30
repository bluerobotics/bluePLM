/**
 * Typed Supabase helpers for team-members hooks
 *
 * The main Supabase client has @ts-nocheck due to complex type inference issues.
 * This module provides typed wrappers for the specific operations used in
 * team-members hooks, enabling proper type checking in the consuming hooks.
 *
 * Note: Some tables (job_titles, user_job_titles, team_vault_access, pending_org_members)
 * are not yet in the main Database type definition. Types are defined locally here.
 */
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

// ============================================
// Type Definitions from Database
// ============================================

type Tables = Database['public']['Tables']

// Teams
export type TeamRow = Tables['team']['Row']
export type TeamInsert = Tables['team']['Insert']
export type TeamUpdate = Tables['team']['Update']

// Team Members
export type TeamMemberRow = Tables['team_member']['Row']
export type TeamMemberInsert = Tables['team_member']['Insert']

// Team Permissions
export type TeamPermissionRow = Tables['team_permission']['Row']
export type TeamPermissionInsert = Tables['team_permission']['Insert']

// Users
export type UserRow = Tables['app_user']['Row']

// Workflow Roles
export type WorkflowRoleRow = Tables['workflow_role']['Row']
export type WorkflowRoleInsert = Tables['workflow_role']['Insert']
export type WorkflowRoleUpdate = Tables['workflow_role']['Update']

// User Workflow Roles
export type UserWorkflowRoleRow = Tables['user_workflow_role']['Row']
export type UserWorkflowRoleInsert = Tables['user_workflow_role']['Insert']

// Vaults
export type VaultRow = Tables['vault']['Row']

// Vault Access
export type VaultAccessRow = Tables['vault_access']['Row']
export type VaultAccessInsert = Tables['vault_access']['Insert']

// Organizations
export type OrganizationRow = Tables['organization']['Row']
export type OrganizationUpdate = Tables['organization']['Update']

// ============================================
// Types Not in Main Database Definition
// (These tables exist but aren't in types/database.ts)
// ============================================

// Team Vault Access (junction table)
export interface TeamVaultAccessRow {
  id: string
  team_id: string
  vault_id: string
  granted_by: string | null
  granted_at: string
}

export interface TeamVaultAccessInsert {
  id?: string
  team_id: string
  vault_id: string
  granted_by?: string | null
  granted_at?: string
}

// Job Titles
export interface JobTitleRow {
  id: string
  org_id: string
  name: string
  color: string
  icon: string
  created_at: string
  created_by: string | null
}

export interface JobTitleInsert {
  id?: string
  org_id: string
  name: string
  color?: string
  icon?: string
  created_at?: string
  created_by?: string | null
}

export interface JobTitleUpdate {
  id?: string
  org_id?: string
  name?: string
  color?: string
  icon?: string
  created_at?: string
  created_by?: string | null
}

// User Job Titles (junction table)
export interface UserJobTitleRow {
  id: string
  user_id: string
  title_id: string
  assigned_at: string
  assigned_by: string | null
}

export interface UserJobTitleInsert {
  id?: string
  user_id: string
  title_id: string
  assigned_at?: string
  assigned_by?: string | null
}

// Pending Org Members
export interface PendingOrgMemberRow {
  id: string
  org_id: string
  email: string
  full_name: string | null
  role: string
  team_ids: string[]
  workflow_role_ids: string[]
  vault_ids: string[]
  notes: string | null
  created_at: string
  created_by: string | null
  claimed_at: string | null
}

export interface PendingOrgMemberUpdate {
  id?: string
  org_id?: string
  email?: string
  full_name?: string | null
  role?: string
  team_ids?: string[]
  workflow_role_ids?: string[]
  vault_ids?: string[]
  notes?: string | null
  created_at?: string
  created_by?: string | null
  claimed_at?: string | null
}

// ============================================
// Query Response Types
// ============================================

/** Team with member and permission counts from aggregate query */
export interface TeamWithCounts extends TeamRow {
  team_member: { count: number }[]
  team_permission: { count: number }[]
}

/** User with selected fields for member list */
export interface UserBasic {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  custom_avatar_url: string | null
  job_title: string | null
  role: string
  last_sign_in_at: string | null
  last_online_at: string | null
}

/** Team membership join result */
export interface TeamMembershipJoin {
  user_id: string
  team: {
    id: string
    name: string
    color: string
    icon: string
  } | null
}

/** User job title join result */
export interface UserJobTitleJoin {
  user_id: string
  title: {
    id: string
    name: string
    color: string
    icon: string
  } | null
}

/** User workflow role assignment join result */
export interface UserWorkflowRoleJoin {
  user_id: string
  workflow_role_id: string
  workflow_role: {
    org_id: string
  }
}

/** Team vault access for mapping */
export interface TeamVaultAccessJoin {
  team_id: string
  vault_id: string
}

/** Workflow role with basic fields */
export interface WorkflowRoleBasic {
  id: string
  name: string
  color: string
  icon: string
  description: string | null
}

/** Job title with basic fields */
export interface JobTitleBasic {
  id: string
  name: string
  color: string
  icon: string
}

// ============================================
// Typed Query Helpers
// ============================================

/**
 * Get the typed Supabase client.
 * Note: The client has @ts-nocheck internally, so we use type assertions
 * to provide proper typing for operations.
 */
// Supabase v2 type inference incomplete for team member operations
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any // TODO: type this

/**
 * Insert into teams table with proper typing
 */
export async function insertTeam(data: TeamInsert) {
  return db.from('team').insert(data).select().single() as Promise<{
    data: TeamRow | null
    error: Error | null
  }>
}

/**
 * Update teams table with proper typing
 */
export async function updateTeam(teamId: string, data: Partial<TeamUpdate>) {
  return db.from('team').update(data).eq('id', teamId) as Promise<{
    data: null
    error: Error | null
  }>
}

/**
 * Insert team permissions with proper typing
 */
export async function insertTeamPermissions(data: TeamPermissionInsert[]) {
  return db.from('team_permission').insert(data) as Promise<{
    data: null
    error: Error | null
  }>
}

/**
 * Insert team vault access with proper typing
 */
export async function insertTeamVaultAccess(data: TeamVaultAccessInsert[]) {
  return db.from('team_vault_access').insert(data) as Promise<{
    data: null
    error: Error | null
  }>
}

/**
 * Insert team member with proper typing
 */
export async function insertTeamMember(data: TeamMemberInsert) {
  return db.from('team_member').insert(data) as Promise<{
    data: null
    error: Error | null
  }>
}

/**
 * Update organization with proper typing
 * Note: Uses Record type since organizations table has many optional fields
 */
export async function updateOrganization(orgId: string, data: Record<string, unknown>) {
  return db.from('organization').update(data).eq('id', orgId) as Promise<{
    data: null
    error: Error | null
  }>
}

/**
 * Insert workflow role with proper typing
 */
export async function insertWorkflowRole(data: WorkflowRoleInsert) {
  return db.from('workflow_role').insert(data) as Promise<{
    data: null
    error: Error | null
  }>
}

/**
 * Update workflow role with proper typing
 */
export async function updateWorkflowRole(roleId: string, data: Partial<WorkflowRoleUpdate>) {
  return db.from('workflow_role').update(data).eq('id', roleId) as Promise<{
    data: null
    error: Error | null
  }>
}

/**
 * Insert user workflow role with proper typing
 */
export async function insertUserWorkflowRole(data: UserWorkflowRoleInsert) {
  return db.from('user_workflow_role').insert(data) as Promise<{
    data: null
    error: Error | null
  }>
}

/**
 * Insert multiple user workflow roles with proper typing
 */
export async function insertUserWorkflowRoles(data: UserWorkflowRoleInsert[]) {
  return db.from('user_workflow_role').insert(data) as Promise<{
    data: null
    error: Error | null
  }>
}

/**
 * Insert job title with proper typing
 */
export async function insertJobTitle(data: JobTitleInsert) {
  return db.from('job_title').insert(data).select().single() as Promise<{
    data: JobTitleRow | null
    error: Error | null
  }>
}

/**
 * Update job title with proper typing
 */
export async function updateJobTitle(titleId: string, data: Partial<JobTitleUpdate>) {
  return db.from('job_title').update(data).eq('id', titleId) as Promise<{
    data: null
    error: Error | null
  }>
}

/**
 * Upsert user job title with proper typing
 */
export async function upsertUserJobTitle(data: UserJobTitleInsert) {
  return db.from('user_job_title').upsert(data, { onConflict: 'user_id' }) as Promise<{
    data: null
    error: Error | null
  }>
}

/**
 * Update pending org member with proper typing
 */
export async function updatePendingOrgMember(
  memberId: string,
  data: Partial<PendingOrgMemberUpdate>,
) {
  return db.from('pending_org_member').update(data).eq('id', memberId) as Promise<{
    data: null
    error: Error | null
  }>
}

// ============================================
// Typed Query Helpers for Select Operations
// ============================================

/**
 * Cast query results to expected type.
 * Use this for select queries with joins/aggregates.
 */
export function castQueryResult<T>(data: unknown): T {
  return data as T
}
