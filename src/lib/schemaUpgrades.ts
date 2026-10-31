/**
 * Whether the organization upgrades its database from its release pipeline (the `migrate-db` job in
 * release.yml) rather than from the app. One definition for the upgrade gate and the setting.
 */

import type { Organization } from '@/types/pdm'

export function schemaUpgradesByRelease(
  organization: Pick<Organization, 'settings'> | null | undefined,
): boolean {
  return organization?.settings?.schema_upgrades === 'release'
}
