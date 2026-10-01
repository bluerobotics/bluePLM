import { routeBackend } from '@/lib/backendAdapter'
import { getMdbWorkflowRoles } from '@/lib/mdb'
import { supabase } from '@/lib/supabase'

import type { WorkflowRoleBasic } from '../types'

/** Load workflow-role choices without exposing provider selection to dialogs. */
export function getWorkflowRoleOptions(organizationId: string): Promise<WorkflowRoleBasic[]> {
  return routeBackend({
    mdb: async () => (await getMdbWorkflowRoles()).map(({ id, name, color, icon }) => ({ id, name, color, icon })),
    supabase: async () => {
      const { data, error } = await supabase
        .from('workflow_roles')
        .select('id, name, color, icon')
        .eq('org_id', organizationId)
        .eq('is_active', true)
        .order('sort_order')
        .order('name')

      if (error) throw new Error(error.message)
      return (data ?? []) as WorkflowRoleBasic[]
    },
  })
}
