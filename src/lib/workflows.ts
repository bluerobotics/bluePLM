// Workflow Service Functions for BluePLM
// Handles all Supabase interactions for workflow management

import { supabase } from './supabase'
import {
  assignMdbFileWorkflow,
  createMdbWorkflow,
  createMdbWorkflowGate,
  createMdbWorkflowState,
  createMdbWorkflowTransition,
  decideMdbWorkflowReview,
  deleteMdbWorkflow,
  deleteMdbWorkflowGate,
  deleteMdbWorkflowState,
  deleteMdbWorkflowTransition,
  executeMdbWorkflowTransition,
  getMdbAvailableTransitions,
  getMdbFileWorkflow,
  getMdbMyWorkflowReviews,
  getMdbWorkflowGates,
  getMdbWorkflowStates,
  getMdbWorkflowTransitions,
  getMdbWorkflows,
  updateMdbWorkflow,
  updateMdbWorkflowGate,
  updateMdbWorkflowState,
  updateMdbWorkflowTransition,
} from './mdb'
import { routeBackend } from './backendAdapter'
import type {
  WorkflowTemplate,
  WorkflowState,
  WorkflowTransition,
  WorkflowGate,
  GateReviewer,
  PendingReview,
  AvailableTransition,
  MyPendingReview,
  TransitionResult,
} from '../types/workflow'

// ============================================
// Workflow Templates
// ============================================

export async function getWorkflowTemplates(orgId: string) {
  return routeBackend({
    mdb: async () => {
      try { return { data: await getMdbWorkflows() as unknown as WorkflowTemplate[], error: null } }
      catch (error) { return { data: null, error: error instanceof Error ? error : new Error('Failed to load workflows.') } }
    },
    supabase: async () => {
      const { data, error } = await supabase
        .from('workflow_templates').select('*').eq('org_id', orgId).eq('is_active', true)
        .order('is_default', { ascending: false }).order('name')
      return { data, error }
    },
  })
}

export async function getDefaultWorkflow(orgId: string) {
  return routeBackend({
    mdb: async () => {
      try {
        const workflow = (await getMdbWorkflows()).find((candidate) => candidate.is_default)
        return { data: workflow as unknown as WorkflowTemplate | undefined ?? null, error: null }
      } catch (error) { return { data: null, error: error instanceof Error ? error : new Error('Failed to load default workflow.') } }
    },
    supabase: async () => {
      const { data, error } = await supabase.from('workflow_templates').select('*')
        .eq('org_id', orgId).eq('is_default', true).eq('is_active', true).single()
      return { data, error }
    },
  })
}

export async function createWorkflowTemplate(
  orgId: string,
  createdBy: string,
  name: string,
  description?: string,
) {
  return routeBackend({
    mdb: async () => {
      try { return { data: await createMdbWorkflow({ name, description: description ?? null }) as unknown as WorkflowTemplate, error: null } }
      catch (error) { return { data: null, error: error instanceof Error ? error : new Error('Failed to create workflow.') } }
    },
    supabase: async () => {
      const { data: workflowId, error: createError } = await supabase.rpc('create_default_workflow', { p_org_id: orgId, p_created_by: createdBy })
      if (createError) return { data: null, error: createError }
      if (name !== 'Standard Release Process' || description) {
        const { error: updateError } = await supabase.from('workflow_templates').update({ name, description }).eq('id', workflowId)
        if (updateError) return { data: null, error: updateError }
      }
      return supabase.from('workflow_templates').select('*').eq('id', workflowId).single()
    },
  })
}

export async function updateWorkflowTemplate(
  workflowId: string,
  updates: Partial<WorkflowTemplate>,
) {
  return routeBackend({
    mdb: async () => {
      try { return { data: await updateMdbWorkflow(workflowId, updates as Record<string, unknown>) as unknown as WorkflowTemplate, error: null } }
      catch (error) { return { data: null, error: error instanceof Error ? error : new Error('Failed to update workflow.') } }
    },
    supabase: async () => {
      const updateData = { ...updates, updated_at: new Date().toISOString(), canvas_config: updates.canvas_config as import('../types/supabase').Json | undefined }
      return supabase.from('workflow_templates').update(updateData).eq('id', workflowId).select().single()
    },
  })
}

export async function deleteWorkflowTemplate(workflowId: string) {
  return routeBackend({
    mdb: async () => {
      try { await deleteMdbWorkflow(workflowId); return { data: null, error: null } }
      catch (error) { return { data: null, error: error instanceof Error ? error : new Error('Failed to delete workflow.') } }
    },
    supabase: () => supabase.from('workflow_templates').update({ is_active: false }).eq('id', workflowId),
  })
}

// ============================================
// Workflow States
// ============================================

export async function getWorkflowStates(workflowId: string) {
  return routeBackend({
    mdb: async () => {
      try { return { data: await getMdbWorkflowStates(workflowId) as unknown as WorkflowState[], error: null } }
      catch (error) { return { data: null, error: error instanceof Error ? error : new Error('Failed to load workflow states.') } }
    },
    supabase: () => supabase.from('workflow_states').select('*').eq('workflow_id', workflowId).order('sort_order'),
  })
}

export async function createWorkflowState(
  state: Omit<Partial<WorkflowState>, 'id'> & { name: string; workflow_id: string },
) {
  return routeBackend({
    mdb: async () => {
      try { return { data: await createMdbWorkflowState(state as Record<string, unknown>) as unknown as WorkflowState, error: null } }
      catch (error) { return { data: null, error: error instanceof Error ? error : new Error('Failed to create workflow state.') } }
    },
    supabase: () => supabase.from('workflow_states').insert(state).select().single(),
  })
}

export async function updateWorkflowState(stateId: string, updates: Partial<WorkflowState>) {
  return routeBackend({
    mdb: async () => {
      try { return { data: await updateMdbWorkflowState(stateId, updates as Record<string, unknown>) as unknown as WorkflowState, error: null } }
      catch (error) { return { data: null, error: error instanceof Error ? error : new Error('Failed to update workflow state.') } }
    },
    supabase: () => supabase.from('workflow_states').update(updates).eq('id', stateId).select().single(),
  })
}

export async function deleteWorkflowState(stateId: string) {
  return routeBackend({
    mdb: async () => {
      try { await deleteMdbWorkflowState(stateId); return { data: null, error: null } }
      catch (error) { return { data: null, error: error instanceof Error ? error : new Error('Failed to delete workflow state.') } }
    },
    supabase: () => supabase.from('workflow_states').delete().eq('id', stateId),
  })
}

// ============================================
// Workflow Transitions
// ============================================

export async function getWorkflowTransitions(workflowId: string) {
  return routeBackend({
    mdb: async () => {
      try { return { data: await getMdbWorkflowTransitions(workflowId) as unknown as WorkflowTransition[], error: null } }
      catch (error) { return { data: null, error: error instanceof Error ? error : new Error('Failed to load workflow transitions.') } }
    },
    supabase: () => supabase.from('workflow_transitions').select('*').eq('workflow_id', workflowId),
  })
}

export async function createWorkflowTransition(
  transition: Omit<Partial<WorkflowTransition>, 'id'> & {
    workflow_id: string
    from_state_id: string
    to_state_id: string
  },
) {
  return routeBackend({
    mdb: async () => {
      try { return { data: await createMdbWorkflowTransition(transition as Record<string, unknown>) as unknown as WorkflowTransition, error: null } }
      catch (error) { return { data: null, error: error instanceof Error ? error : new Error('Failed to create workflow transition.') } }
    },
    supabase: () => {
      const insertData = { ...transition, auto_conditions: transition.auto_conditions as import('../types/supabase').Json | undefined }
      return supabase.from('workflow_transitions').insert(insertData).select().single()
    },
  })
}

export async function updateWorkflowTransition(
  transitionId: string,
  updates: Partial<WorkflowTransition>,
) {
  return routeBackend({
    mdb: async () => {
      try { return { data: await updateMdbWorkflowTransition(transitionId, updates as Record<string, unknown>) as unknown as WorkflowTransition, error: null } }
      catch (error) { return { data: null, error: error instanceof Error ? error : new Error('Failed to update workflow transition.') } }
    },
    supabase: () => {
      const updateData = { ...updates, auto_conditions: updates.auto_conditions as import('../types/supabase').Json | undefined }
      return supabase.from('workflow_transitions').update(updateData).eq('id', transitionId).select().single()
    },
  })
}

export async function deleteWorkflowTransition(transitionId: string) {
  return routeBackend({
    mdb: async () => {
      try { await deleteMdbWorkflowTransition(transitionId); return { data: null, error: null } }
      catch (error) { return { data: null, error: error instanceof Error ? error : new Error('Failed to delete workflow transition.') } }
    },
    supabase: () => supabase.from('workflow_transitions').delete().eq('id', transitionId),
  })
}

// ============================================
// Workflow Gates
// ============================================

export async function getGatesForTransitions(transitionIds: string[]) {
  return routeBackend({
    mdb: async () => {
      try { return { data: await getMdbWorkflowGates(transitionIds) as unknown as WorkflowGate[], error: null } }
      catch (error) { return { data: null, error: error instanceof Error ? error : new Error('Failed to load workflow gates.') } }
    },
    supabase: () => supabase.from('workflow_gates').select('*').in('transition_id', transitionIds).order('sort_order'),
  })
}

export async function createWorkflowGate(
  gate: Omit<Partial<WorkflowGate>, 'id'> & { transition_id: string; name: string },
) {
  return routeBackend({
    mdb: async () => {
      try { return { data: await createMdbWorkflowGate(gate as Record<string, unknown>) as unknown as WorkflowGate, error: null } }
      catch (error) { return { data: null, error: error instanceof Error ? error : new Error('Failed to create workflow gate.') } }
    },
    supabase: () => {
      const insertData = {
        ...gate,
        approval_mode: gate.approval_mode as 'any' | 'all' | 'majority' | null | undefined,
        checklist_items: gate.checklist_items as import('../types/supabase').Json | undefined,
        conditions: gate.conditions as import('../types/supabase').Json | undefined,
      }
      return supabase.from('workflow_gates').insert(insertData).select().single()
    },
  })
}

export async function updateWorkflowGate(gateId: string, updates: Partial<WorkflowGate>) {
  return routeBackend({
    mdb: async () => {
      try { return { data: await updateMdbWorkflowGate(gateId, updates as Record<string, unknown>) as unknown as WorkflowGate, error: null } }
      catch (error) { return { data: null, error: error instanceof Error ? error : new Error('Failed to update workflow gate.') } }
    },
    supabase: () => {
      const updateData = {
        ...updates,
        approval_mode: updates.approval_mode as 'any' | 'all' | 'majority' | null | undefined,
        checklist_items: updates.checklist_items as import('../types/supabase').Json | undefined,
        conditions: updates.conditions as import('../types/supabase').Json | undefined,
      }
      return supabase.from('workflow_gates').update(updateData).eq('id', gateId).select().single()
    },
  })
}

export async function deleteWorkflowGate(gateId: string) {
  return routeBackend({
    mdb: async () => {
      try { await deleteMdbWorkflowGate(gateId); return { data: null, error: null } }
      catch (error) { return { data: null, error: error instanceof Error ? error : new Error('Failed to delete workflow gate.') } }
    },
    supabase: () => supabase.from('workflow_gates').delete().eq('id', gateId),
  })
}

// ============================================
// Gate Reviewers
// ============================================

export async function getGateReviewers(gateId: string) {
  return supabase
    .from('workflow_gate_reviewers')
    .select(
      `
      *,
      user:user_id (
        id,
        email,
        full_name,
        avatar_url
      ),
      workflow_role:workflow_role_id (
        id,
        name,
        color,
        icon
      )
    `,
    )
    .eq('gate_id', gateId)
}

export async function addGateReviewer(
  reviewer: Omit<Partial<GateReviewer>, 'id'> & {
    gate_id: string
    reviewer_type: 'user' | 'role' | 'group' | 'workflow_role'
  },
) {
  const { user: _user, workflow_role: _workflowRole, ...insertData } = reviewer
  return supabase.from('workflow_gate_reviewers').insert(insertData).select().single()
}

export async function removeGateReviewer(reviewerId: string) {
  return supabase.from('workflow_gate_reviewers').delete().eq('id', reviewerId)
}

// ============================================
// File Workflow Assignments
// ============================================

export async function getFileWorkflowAssignment(fileId: string) {
  return routeBackend({
    mdb: async () => {
      try { return { data: await getMdbFileWorkflow(fileId), error: null } }
      catch (error) { return { data: null, error: error instanceof Error ? error : new Error('Failed to load file workflow.') } }
    },
    supabase: () => supabase.from('file_workflow_assignments').select(`
      *,
      current_state:current_state_id (*),
      workflow:workflow_id (*)
    `).eq('file_id', fileId).single(),
  })
}

export async function assignWorkflowToFile(
  fileId: string,
  workflowId: string,
  initialStateId: string,
  assignedBy: string,
) {
  return routeBackend({
    mdb: async () => {
      try { await assignMdbFileWorkflow(fileId, workflowId, initialStateId); return { data: { file_id: fileId, workflow_id: workflowId, current_state_id: initialStateId }, error: null } }
      catch (error) { return { data: null, error: error instanceof Error ? error : new Error('Failed to assign workflow.') } }
    },
    supabase: () => supabase.from('file_workflow_assignments').upsert({
      file_id: fileId, workflow_id: workflowId, current_state_id: initialStateId, assigned_by: assignedBy,
    }).select().single(),
  })
}

export async function updateFileWorkflowState(fileId: string, newStateId: string) {
  return routeBackend({
    mdb: async () => {
      try {
        const assignment = await getMdbFileWorkflow(fileId)
        const workflowId = typeof assignment?.workflow_id === 'string' ? assignment.workflow_id : null
        if (!workflowId) return { data: null, error: new Error('File has no workflow assignment.') }
        await assignMdbFileWorkflow(fileId, workflowId, newStateId)
        return { data: { file_id: fileId, current_state_id: newStateId }, error: null }
      } catch (error) { return { data: null, error: error instanceof Error ? error : new Error('Failed to update workflow state.') } }
    },
    supabase: () => supabase.from('file_workflow_assignments').update({ current_state_id: newStateId }).eq('file_id', fileId).select().single(),
  })
}

// ============================================
// Available Transitions (for file context menu)
// ============================================

export async function getAvailableTransitions(
  fileId: string,
  userId: string,
): Promise<{ data: AvailableTransition[] | null; error: Error | null }> {
  return routeBackend({
    mdb: async () => {
      try { return { data: await getMdbAvailableTransitions(fileId) as unknown as AvailableTransition[], error: null } }
      catch (error) { return { data: null, error: error instanceof Error ? error : new Error('Failed to load workflow transitions.') } }
    },
    supabase: async () => {
      const { data, error } = await supabase.rpc('get_available_transitions', { p_file_id: fileId, p_user_id: userId })
      return { data, error }
    },
  })
}

// ============================================
// Pending Reviews
// ============================================

export async function getPendingReviews(orgId: string) {
  return supabase
    .from('pending_reviews')
    .select(
      `
      *,
      file:file_id (file_name, file_path),
      gate:gate_id (*),
      requester:requested_by (email, full_name, avatar_url),
      assignee:assigned_to (email, full_name, avatar_url)
    `,
    )
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .order('requested_at', { ascending: false })
}

export async function getMyPendingReviews(): Promise<{
  data: MyPendingReview[] | null
  error: Error | null
}> {
  return routeBackend({
    mdb: async () => {
      try { return { data: await getMdbMyWorkflowReviews() as unknown as MyPendingReview[], error: null } }
      catch (error) { return { data: null, error: error instanceof Error ? error : new Error('Failed to load pending reviews.') } }
    },
    supabase: async () => {
      const { data, error } = await supabase.rpc('get_my_pending_reviews')
      return { data, error: error ? new Error(error.message) : null }
    },
  })
}

export async function createPendingReview(
  review: Omit<Partial<PendingReview>, 'id'> & {
    file_id: string
    transition_id: string
    gate_id: string
    org_id: string
    requested_by: string
  },
) {
  const { file: _file, gate: _gate, requester: _requester, assignee: _assignee, ...insertData } = review
  return supabase.from('pending_reviews').insert(insertData).select().single()
}

/**
 * Record a decision on one gate review. When the decision clears the last
 * blocking gate the file advances as part of the same transaction, so callers
 * should re-read the file rather than assuming it stayed put.
 */
export async function submitReviewDecision(
  reviewId: string,
  decision: 'approved' | 'rejected' | 'kicked_back',
  comment?: string,
  checklistResponses?: Record<string, boolean>,
): Promise<{ data: TransitionResult | null; error: Error | null }> {
  return routeBackend({
    mdb: async () => {
      try { return { data: await decideMdbWorkflowReview(reviewId, decision, comment, checklistResponses), error: null } }
      catch (error) { return { data: null, error: error instanceof Error ? error : new Error('Failed to submit review decision.') } }
    },
    supabase: async () => {
      const { data, error } = await supabase.rpc('complete_gate_review', {
        p_pending_review_id: reviewId, p_decision: decision, p_comment: comment ?? undefined,
        p_checklist_responses: checklistResponses ?? {},
      })
      if (error) return { data: null, error: new Error(error.message) }
      return { data: readTransitionResult(data), error: null }
    },
  })
}

// ============================================
// Review History
// ============================================

export async function getReviewHistory(
  orgId: string,
  options?: {
    fileId?: string
    reviewedBy?: string
    limit?: number
  },
) {
  let query = supabase
    .from('workflow_review_history')
    .select('*')
    .eq('org_id', orgId)
    .order('reviewed_at', { ascending: false })

  if (options?.fileId) {
    query = query.eq('file_id', options.fileId)
  }
  if (options?.reviewedBy) {
    query = query.eq('reviewed_by', options.reviewedBy)
  }
  if (options?.limit) {
    query = query.limit(options.limit)
  }

  return query
}

// ============================================
// Workflow Transition (Execute)
// ============================================

/**
 * Reads the jsonb the engine RPCs return. Every field is optional on the wire:
 * a refusal carries only the error, a gated transition only `requires_review`.
 */
function readTransitionResult(value: unknown): TransitionResult {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>

  return {
    success: raw.success === true,
    requires_review: raw.requires_review === true,
    new_state_id: typeof raw.new_state_id === 'string' ? raw.new_state_id : null,
    new_state_name: typeof raw.new_state_name === 'string' ? raw.new_state_name : null,
    new_revision: typeof raw.new_revision === 'string' ? raw.new_revision : null,
    error_code: typeof raw.error_code === 'string' ? raw.error_code : null,
    error_message: typeof raw.error_message === 'string' ? raw.error_message : null,
  }
}

/**
 * Move a file along a transition.
 *
 * All of the work happens in `execute_workflow_transition`: it re-checks the
 * file's current state, the caller's workflow roles and the checkout rules,
 * then either opens the transition's blocking gates or advances the file,
 * bumps the revision and writes history - in one transaction.
 */
export async function executeTransition(
  fileId: string,
  transitionId: string,
  options?: { comment?: string },
): Promise<{ data: TransitionResult | null; error: Error | null }> {
  return routeBackend({
    mdb: async () => {
      try { return { data: await executeMdbWorkflowTransition(fileId, transitionId, options?.comment), error: null } }
      catch (error) { return { data: null, error: error instanceof Error ? error : new Error('Failed to execute workflow transition.') } }
    },
    supabase: async () => {
      const { data, error } = await supabase.rpc('execute_workflow_transition', {
        p_file_id: fileId, p_transition_id: transitionId, p_comment: options?.comment ?? undefined,
      })
      if (error) return { data: null, error: new Error(error.message) }
      return { data: readTransitionResult(data), error: null }
    },
  })
}

// ============================================
// Helper: Get full workflow with all related data
// ============================================

export async function getFullWorkflow(workflowId: string) {
  const [workflowResult, statesResult, transitionsResult] = await Promise.all([
    supabase.from('workflow_templates').select('*').eq('id', workflowId).single(),
    getWorkflowStates(workflowId),
    getWorkflowTransitions(workflowId),
  ])

  const workflow = workflowResult.data
  const states = statesResult.data
  const transitions = transitionsResult.data

  if (!workflow) {
    return { data: null, error: new Error('Workflow not found') }
  }

  // Get gates for all transitions
  let gates: Record<string, WorkflowGate[]> = {}
  if (transitions && transitions.length > 0) {
    const { data: allGates } = await getGatesForTransitions(transitions.map((t) => t.id))
    if (allGates) {
      gates = allGates.reduce(
        (acc, gate) => {
          if (!acc[gate.transition_id]) acc[gate.transition_id] = []
          acc[gate.transition_id].push(gate as WorkflowGate)
          return acc
        },
        {} as Record<string, WorkflowGate[]>,
      )
    }
  }

  return {
    data: {
      workflow,
      states: states || [],
      transitions: transitions || [],
      gates,
    },
    error: null,
  }
}
