import { routeBackend } from '@/lib/backendAdapter'
import { setCommunityDocumentManagerLicense } from '@/lib/community'
import { supabase } from '@/lib/supabase'
import type { Json } from '@/types/database'
import type { OrgSettings } from '@/types/pdm'

interface PersistDocumentManagerLicenseOptions {
  organizationId: string
  currentSettings: OrgSettings
  licenseKey: string | null
}

function normalizeSettings(settings: OrgSettings, licenseKey: string | null): OrgSettings {
  const normalized = { ...settings }
  if (licenseKey) {
    normalized.solidworks_dm_license_key = licenseKey
  } else {
    delete normalized.solidworks_dm_license_key
  }
  return normalized
}

async function persistWithMdb(
  currentSettings: OrgSettings,
  licenseKey: string | null,
): Promise<OrgSettings> {
  await setCommunityDocumentManagerLicense(licenseKey)
  return normalizeSettings(currentSettings, licenseKey)
}

async function persistWithSupabase(
  organizationId: string,
  currentSettings: OrgSettings,
  licenseKey: string | null,
): Promise<OrgSettings> {
  const { data: currentOrg, error: fetchError } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', organizationId)
    .single()

  if (fetchError) throw fetchError

  const persistedSettings = {
    ...((currentOrg?.settings as unknown as OrgSettings | null) || currentSettings),
    solidworks_dm_license_key: licenseKey,
  }

  const { data: updateResult, error: updateError } = await supabase
    .from('organizations')
    .update({ settings: persistedSettings as unknown as Json })
    .eq('id', organizationId)
    .select('settings')
    .single()

  if (updateError) throw updateError
  if (!updateResult) {
    throw new Error('Update failed - you may not have permission to modify organization settings')
  }

  const savedSettings = updateResult.settings as unknown as OrgSettings
  const savedKey = savedSettings?.solidworks_dm_license_key || null
  if (savedKey !== licenseKey) throw new Error('License key was not saved correctly')

  return normalizeSettings(savedSettings, licenseKey)
}

/** Persist the organization-wide Document Manager key through the active backend only. */
export async function persistDocumentManagerLicense({
  organizationId,
  currentSettings,
  licenseKey,
}: PersistDocumentManagerLicenseOptions): Promise<OrgSettings> {
  return routeBackend({
    mdb: () => persistWithMdb(currentSettings, licenseKey),
    supabase: () => persistWithSupabase(organizationId, currentSettings, licenseKey),
  })
}
