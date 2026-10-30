import { getSupabaseClient } from './client'

export interface MyAssignedSolidWorksLicense {
  serial: string
  nickname: string | null
}

/**
 * The SOLIDWORKS licences assigned to `userId`, with their serials.
 *
 * Filtered to the user's own assignments explicitly: an admin's RLS admits
 * every licence in the organization (schema 106), and this answers only "which
 * are mine". A non-admin's RLS already returns no other serial.
 */
export async function getMyAssignedSolidWorksLicenses(
  userId: string,
): Promise<MyAssignedSolidWorksLicense[]> {
  const client = getSupabaseClient()
  const { data: assignments, error: assignmentsError } = await client
    .from('solidworks_license_assignment')
    .select('license_id')
    .eq('user_id', userId)
  if (assignmentsError) throw assignmentsError

  const ids = (assignments ?? []).map((a) => a.license_id)
  if (ids.length === 0) return []

  const { data: licenses, error: licensesError } = await client
    .from('solidworks_license')
    .select('serial_number, nickname')
    .in('id', ids)
  if (licensesError) throw licensesError

  return (licenses ?? []).map((l) => ({ serial: l.serial_number, nickname: l.nickname }))
}
