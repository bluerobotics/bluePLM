import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { log } from '@/lib/logger'
import { getSchemaVersion, type SchemaVersionInfo } from '@/lib/schemaVersion'
import { getCurrentConfig, isSupabaseConfigured, supabase } from '@/lib/supabase'
import { usePDMStore } from '@/stores/pdmStore'

import {
  activityWindow,
  buildActivityBuckets,
  EMPTY_NETWORK_STATS,
  type ActivityRow,
  type ActivityTimeRange,
  type DailyActivity,
  type NetworkStats,
  type SupabaseStats,
  type VersionRow,
} from './supabaseActivity'

// Supabase v2 type inference incomplete for system queries
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any // TODO: type this

export type ConnectionStatus = 'unknown' | 'online' | 'offline' | 'checking'
export type AuthStatus = 'authenticated' | 'unauthenticated' | 'checking'

/** Connection, auth, schema, statistics and activity state for the Connection settings page. */
export function useSupabaseConnection() {
  const { organization, getEffectiveRole } = usePDMStore(
    useShallow((s) => ({
      organization: s.organization,
      getEffectiveRole: s.getEffectiveRole,
    })),
  )

  const [status, setStatus] = useState<ConnectionStatus>('unknown')
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [latency, setLatency] = useState<number | null>(null)
  const [stats, setStats] = useState<SupabaseStats>({
    totalFiles: 0,
    totalVaults: 0,
    totalUsers: 0,
    totalCheckouts: 0,
    realtimeConnected: false,
  })
  const [loadingStats, setLoadingStats] = useState(false)
  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking')
  const [sessionInfo, setSessionInfo] = useState<{
    expiresAt: Date | null
    provider: string | null
  }>({ expiresAt: null, provider: null })
  const [dailyActivity, setDailyActivity] = useState<DailyActivity[]>([])
  const [networkStats, setNetworkStats] = useState<NetworkStats>(EMPTY_NETWORK_STATS)
  const [loadingActivity, setLoadingActivity] = useState(false)
  const [timeRange, setTimeRange] = useState<ActivityTimeRange>('7d')
  const [schemaVersion, setSchemaVersion] = useState<SchemaVersionInfo | null>(null)
  const [loadingSchema, setLoadingSchema] = useState(false)

  const config = getCurrentConfig()
  const isConfigured = isSupabaseConfigured()
  const isAdmin = getEffectiveRole() === 'admin'

  // Check connection status on mount
  useEffect(() => {
    checkConnectionStatus()
    checkAuthStatus()
  }, [])

  // Load stats when we have an organization
  useEffect(() => {
    if (organization?.id && status === 'online') {
      loadStats()
      loadActivityData()
      loadSchemaVersion()
    }
  }, [organization?.id, status])

  const loadSchemaVersion = async () => {
    setLoadingSchema(true)
    try {
      const version = await getSchemaVersion()
      setSchemaVersion(version)
    } catch (error) {
      log.error('[Supabase]', 'Failed to load schema version', { error: error })
    }
    setLoadingSchema(false)
  }

  // Reload activity when time range changes
  useEffect(() => {
    if (organization?.id && status === 'online') {
      loadActivityData()
    }
  }, [timeRange])

  const checkConnectionStatus = async () => {
    if (!isConfigured) {
      setStatus('offline')
      return
    }

    setStatus('checking')
    const start = Date.now()

    try {
      // Simple query to test connection
      const { error } = await supabase.from('organizations').select('id').limit(1)
      const duration = Date.now() - start
      setLatency(duration)

      if (error && (error.message.includes('Invalid API key') || error.code === 'PGRST301')) {
        setStatus('offline')
      } else {
        setStatus('online')
      }
    } catch {
      setStatus('offline')
      setLatency(null)
    }

    setLastChecked(new Date())
  }

  const checkAuthStatus = async () => {
    setAuthStatus('checking')
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session) {
        setAuthStatus('authenticated')
        setSessionInfo({
          expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null,
          provider: session.user?.app_metadata?.provider || 'email',
        })
      } else {
        setAuthStatus('unauthenticated')
      }
    } catch {
      setAuthStatus('unauthenticated')
    }
  }

  const loadStats = async () => {
    if (!organization?.id) return

    setLoadingStats(true)
    try {
      // Get stats in parallel
      const [filesResult, vaultsResult, usersResult, checkoutsResult] = await Promise.all([
        supabase
          .from('files')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', organization.id),
        supabase
          .from('vaults')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', organization.id),
        supabase
          .from('users')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', organization.id),
        supabase
          .from('files')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', organization.id)
          .not('checked_out_by', 'is', null),
      ])

      // Check realtime connection by looking at supabase channels
      const channels = supabase.getChannels()
      const realtimeConnected = channels.length > 0

      setStats({
        totalFiles: filesResult.count || 0,
        totalVaults: vaultsResult.count || 0,
        totalUsers: usersResult.count || 0,
        totalCheckouts: checkoutsResult.count || 0,
        realtimeConnected,
      })
    } catch (error) {
      log.error('[Supabase]', 'Failed to load stats', { error: error })
    }
    setLoadingStats(false)
  }

  const loadActivityData = async () => {
    if (!organization?.id) return

    setLoadingActivity(true)
    try {
      const now = new Date()
      const { startDate } = activityWindow(timeRange, now)

      // Build activity query
      let activityQuery = db
        .from('activity')
        .select('action, user_id, created_at')
        .eq('org_id', organization.id)
        .order('created_at', { ascending: true })

      if (startDate) {
        activityQuery = activityQuery.gte('created_at', startDate.toISOString())
      }

      const { data: activities, error: activityError } = (await activityQuery) as {
        data: ActivityRow[] | null
        error: unknown
      }

      if (activityError) {
        log.error('[Supabase]', 'Activity query error', { error: activityError })
      }

      // Build versions query
      let versionsQuery = db.from('file_versions').select('file_size, created_at, version')

      if (startDate) {
        versionsQuery = versionsQuery.gte('created_at', startDate.toISOString())
      }

      const { data: versions, error: versionError } = (await versionsQuery) as {
        data: VersionRow[] | null
        error: unknown
      }

      if (versionError) {
        log.error('[Supabase]', 'Versions query error', { error: versionError })
      }

      const result = buildActivityBuckets(timeRange, activities, versions, now)
      setDailyActivity(result.buckets)
      setNetworkStats(result.networkStats)
    } catch (error) {
      log.error('[Supabase]', 'Failed to load activity', { error: error })
    }
    setLoadingActivity(false)
  }

  return {
    organization,
    config,
    isConfigured,
    isAdmin,
    status,
    lastChecked,
    latency,
    authStatus,
    sessionInfo,
    stats,
    loadingStats,
    schemaVersion,
    loadingSchema,
    dailyActivity,
    networkStats,
    loadingActivity,
    timeRange,
    setTimeRange,
    checkConnectionStatus,
    loadStats,
    loadActivityData,
  }
}
