/**
 * StateService - Type-safe database operations for workflow states
 *
 * Uses the supabase client with runtime type assertions to work around
 * TypeScript inference issues with the database types.
 *
 * Rows are returned as the domain `WorkflowState`, which narrows the nullable
 * enum columns the database defaults always populate. Doing the assertion here
 * once keeps it out of every call site.
 */
import { supabase } from '@/lib/supabase'
import {
  createMdbWorkflowState,
  deleteMdbWorkflowState,
  getMdbWorkflowStates,
  updateMdbWorkflowState,
} from '@/lib/mdb'
import { routeBackend } from '@/lib/backendAdapter'
import type { Database } from '@/types/database'
import type { WorkflowState } from '@/types/workflow'

type WorkflowStateRow = Database['public']['Tables']['workflow_states']['Row']

export interface StateServiceResult<T> {
  data: T | null
  error: Error | null
}

// Type-safe access to workflow_states table
const workflowStates = () => supabase.from('workflow_states')

export const stateService = {
  /**
   * Get all states for a workflow
   */
  async getByWorkflow(workflowId: string): Promise<StateServiceResult<WorkflowState[]>> {
    return routeBackend({
      mdb: async () => {
        try { return { data: await getMdbWorkflowStates(workflowId) as unknown as WorkflowState[], error: null } }
        catch (error) { return { data: null, error: error instanceof Error ? error : new Error('Failed to load workflow states.') } }
      },
      supabase: async () => {
        const { data, error } = await workflowStates().select('*').eq('workflow_id', workflowId).order('sort_order')
        return { data: data as WorkflowState[] | null, error: error ? new Error(error.message) : null }
      },
    })
  },

  /**
   * Get a single state by ID
   */
  async getById(stateId: string): Promise<StateServiceResult<WorkflowState>> {
    const { data, error } = await workflowStates().select('*').eq('id', stateId).single()

    return {
      data: data as WorkflowState | null,
      error: error ? new Error(error.message) : null,
    }
  },

  /**
   * Create a new state
   */
  async create(
    state: Partial<WorkflowStateRow> & { workflow_id: string; name: string },
  ): Promise<StateServiceResult<WorkflowState>> {
    return routeBackend({
      mdb: async () => {
        try { return { data: await createMdbWorkflowState(state as Record<string, unknown>) as unknown as WorkflowState, error: null } }
        catch (error) { return { data: null, error: error instanceof Error ? error : new Error('Failed to create workflow state.') } }
      },
      supabase: async () => {
        const { data, error } = await workflowStates().insert(state as never).select().single()
        return { data: data as WorkflowState | null, error: error ? new Error(error.message) : null }
      },
    })
  },

  /**
   * Update a state
   */
  async update(
    stateId: string,
    updates: Partial<WorkflowStateRow>,
  ): Promise<StateServiceResult<WorkflowState>> {
    return routeBackend({
      mdb: async () => {
        try { return { data: await updateMdbWorkflowState(stateId, updates as Record<string, unknown>) as unknown as WorkflowState, error: null } }
        catch (error) { return { data: null, error: error instanceof Error ? error : new Error('Failed to update workflow state.') } }
      },
      supabase: async () => {
        const { data, error } = await workflowStates().update(updates as never).eq('id', stateId).select().single()
        return { data: data as WorkflowState | null, error: error ? new Error(error.message) : null }
      },
    })
  },

  /**
   * Update state position
   */
  async updatePosition(
    stateId: string,
    positionX: number,
    positionY: number,
  ): Promise<StateServiceResult<void>> {
    return routeBackend({
      mdb: async () => {
        try { await updateMdbWorkflowState(stateId, { position_x: positionX, position_y: positionY }); return { data: undefined, error: null } }
        catch (error) { return { data: null, error: error instanceof Error ? error : new Error('Failed to update workflow state.') } }
      },
      supabase: async () => {
        const { error } = await workflowStates().update({ position_x: positionX, position_y: positionY } as never).eq('id', stateId)
        return { data: error ? null : undefined, error: error ? new Error(error.message) : null }
      },
    })
  },

  /**
   * Delete a state
   */
  async delete(stateId: string): Promise<StateServiceResult<void>> {
    return routeBackend({
      mdb: async () => {
        try { await deleteMdbWorkflowState(stateId); return { data: undefined, error: null } }
        catch (error) { return { data: null, error: error instanceof Error ? error : new Error('Failed to delete workflow state.') } }
      },
      supabase: async () => {
        const { error } = await workflowStates().delete().eq('id', stateId)
        return { data: error ? null : undefined, error: error ? new Error(error.message) : null }
      },
    })
  },

  /**
   * Batch update state positions
   */
  async batchUpdatePositions(
    updates: Array<{ id: string; position_x: number; position_y: number }>,
  ): Promise<StateServiceResult<void>> {
    return routeBackend({
      mdb: async () => {
        try {
          await Promise.all(updates.map(({ id, position_x, position_y }) => updateMdbWorkflowState(id, { position_x, position_y })))
          return { data: undefined, error: null }
        } catch (error) { return { data: null, error: error instanceof Error ? error : new Error('Failed to update workflow states.') } }
      },
      supabase: async () => {
        const results = await Promise.all(updates.map(({ id, position_x, position_y }) =>
          workflowStates().update({ position_x, position_y } as never).eq('id', id)))
        const firstError = results.find((result) => result.error)?.error
        return { data: firstError ? null : undefined, error: firstError ? new Error(firstError.message) : null }
      },
    })
  },

  /**
   * Get next sort order for a workflow
   */
  async getNextSortOrder(workflowId: string): Promise<number> {
    const { data } = await workflowStates()
      .select('sort_order')
      .eq('workflow_id', workflowId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single()

    return ((data as { sort_order: number } | null)?.sort_order ?? 0) + 1
  },
}
