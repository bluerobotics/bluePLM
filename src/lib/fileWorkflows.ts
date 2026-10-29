/**
 * Whether file workflows are on for the signed-in organization (schema 110). One definition for
 * every surface that hides workflow UI (sidebar view, Change State menus), matching the server's
 * `org_file_workflows_enabled()`: only an explicit `false` turns them off.
 */

import type { Organization } from '@/types/pdm'

export function fileWorkflowsEnabled(
  organization: Pick<Organization, 'settings'> | null | undefined,
): boolean {
  return organization?.settings?.file_workflows_enabled !== false
}
