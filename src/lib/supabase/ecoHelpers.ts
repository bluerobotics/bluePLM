import { getSupabaseClient } from './client'
import {
  addCommunityFileToEco,
  getCommunityActiveEcos,
  getCommunityFileEcos,
  removeCommunityFileFromEco,
} from '@/lib/community'
import { routeBackend } from '@/lib/backendAdapter'

/**
 * Get active ECOs for an organization (for selection)
 */
export async function getActiveECOs(orgId: string): Promise<{ ecos: any[]; error?: string }> {
  return routeBackend({
    mdb: async () => {
      try {
        return { ecos: await getCommunityActiveEcos() }
      } catch (error) {
        return { ecos: [], error: error instanceof Error ? error.message : String(error) }
      }
    },
    supabase: async () => {
      const client = getSupabaseClient()

      const { data, error } = await client
        .from('ecos')
        .select(
          `
          id,
          eco_number,
          title,
          status,
          created_at
        `,
        )
        .eq('org_id', orgId)
        .in('status', ['open', 'in_progress'])
        .order('created_at', { ascending: false })

      if (error) {
        return { ecos: [], error: error.message }
      }

      return { ecos: data || [] }
    },
  })
}

/**
 * Add a file to an ECO
 */
export async function addFileToECO(
  fileId: string,
  ecoId: string,
  userId: string,
  notes?: string,
): Promise<{ success: boolean; error?: string }> {
  return routeBackend({
    mdb: async () => {
      try {
        await addCommunityFileToEco(fileId, ecoId, notes)
        return { success: true }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
    supabase: async () => {
      const client = getSupabaseClient()

      const { error } = await client.from('file_ecos').insert({
        file_id: fileId,
        eco_id: ecoId,
        created_by: userId,
        notes: notes || null,
      })

      if (error) {
        if (error.code === '23505') {
          return { success: false, error: 'File is already part of this ECO' }
        }
        return { success: false, error: error.message }
      }

      return { success: true }
    },
  })
}

/**
 * Remove a file from an ECO
 */
export async function removeFileFromECO(
  fileId: string,
  ecoId: string,
): Promise<{ success: boolean; error?: string }> {
  return routeBackend({
    mdb: async () => {
      try {
        await removeCommunityFileFromEco(fileId, ecoId)
        return { success: true }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
    supabase: async () => {
      const client = getSupabaseClient()

      const { error } = await client
        .from('file_ecos')
        .delete()
        .eq('file_id', fileId)
        .eq('eco_id', ecoId)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true }
    },
  })
}

/**
 * Get ECOs that a file belongs to
 */
export async function getFileECOs(fileId: string): Promise<{ ecos: any[]; error?: string }> {
  return routeBackend({
    mdb: async () => {
      try {
        return { ecos: await getCommunityFileEcos(fileId) }
      } catch (error) {
        return { ecos: [], error: error instanceof Error ? error.message : String(error) }
      }
    },
    supabase: async () => {
      const client = getSupabaseClient()

      const { data, error } = await client
        .from('file_ecos')
        .select(
          `
          id,
          notes,
          created_at,
          eco:ecos(id, eco_number, title, status)
        `,
        )
        .eq('file_id', fileId)

      if (error) {
        return { ecos: [], error: error.message }
      }

      return { ecos: data || [] }
    },
  })
}
