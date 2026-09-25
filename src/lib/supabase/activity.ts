import { getSupabaseClient } from './client'
import { getCommunityActivity, getCommunityFileActivity } from '@/lib/community'
import { routeBackend } from '@/lib/backendAdapter'

// ============================================
// Activity Log
// ============================================

export async function getRecentActivity(orgId: string, limit = 50) {
  return routeBackend({
    mdb: async () => {
      try {
        return { activity: await getCommunityActivity(limit), error: null }
      } catch (error) {
        return { activity: null, error: error instanceof Error ? error : new Error(String(error)) }
      }
    },
    supabase: async () => {
      const client = getSupabaseClient()
      const { data, error } = await client
        .from('activity')
        .select(
          `
          *,
          file:files(file_name, file_path)
        `,
        )
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(limit)

      return { activity: data, error }
    },
  })
}

export async function getFileActivity(fileId: string, limit = 20) {
  return routeBackend({
    mdb: async () => {
      try {
        return { activity: await getCommunityFileActivity(fileId, limit), error: null }
      } catch (error) {
        return { activity: null, error: error instanceof Error ? error : new Error(String(error)) }
      }
    },
    supabase: async () => {
      const client = getSupabaseClient()
      const { data, error } = await client
        .from('activity')
        .select('*')
        .eq('file_id', fileId)
        .order('created_at', { ascending: false })
        .limit(limit)

      return { activity: data, error }
    },
  })
}
