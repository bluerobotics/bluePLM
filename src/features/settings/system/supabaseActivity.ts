// Pure helpers for the Connection settings page: activity bucketing, key masking, region names.

export type ActivityTimeRange = '24h' | '7d' | '30d' | 'all'

export interface SupabaseStats {
  totalFiles: number
  totalVaults: number
  totalUsers: number
  totalCheckouts: number
  realtimeConnected: boolean
}

export interface DailyActivity {
  date: string
  dayLabel: string
  checkouts: number
  checkins: number
  creates: number
  deletes: number
  stateChanges: number
  total: number
  bytesIn: number
  bytesOut: number
  uniqueUsers: number
}

export interface NetworkStats {
  totalBytesIn: number
  totalBytesOut: number
  totalEvents: number
  activeUsers: number
  peakDay: string
  peakEvents: number
}

export interface ActivityRow {
  action: string
  user_id: string
  created_at: string
}

export interface VersionRow {
  file_size: number | null
  created_at: string
}

export const EMPTY_NETWORK_STATS: NetworkStats = {
  totalBytesIn: 0,
  totalBytesOut: 0,
  totalEvents: 0,
  activeUsers: 0,
  peakDay: '',
  peakEvents: 0,
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function emptyBucket(date: string, dayLabel: string): DailyActivity {
  return {
    date,
    dayLabel,
    checkouts: 0,
    checkins: 0,
    creates: 0,
    deletes: 0,
    stateChanges: 0,
    total: 0,
    bytesIn: 0,
    bytesOut: 0,
    uniqueUsers: 0,
  }
}

/** The start of the window for a time range (null = all time), and how many buckets it has. */
export function activityWindow(
  timeRange: ActivityTimeRange,
  now: Date = new Date(),
): { startDate: Date | null; bucketCount: number } {
  const startDate = new Date(now)
  switch (timeRange) {
    case '24h':
      startDate.setHours(startDate.getHours() - 23)
      startDate.setMinutes(0, 0, 0)
      return { startDate, bucketCount: 24 }
    case '7d':
      startDate.setDate(startDate.getDate() - 6)
      startDate.setHours(0, 0, 0, 0)
      return { startDate, bucketCount: 7 }
    case '30d':
      startDate.setDate(startDate.getDate() - 29)
      startDate.setHours(0, 0, 0, 0)
      return { startDate, bucketCount: 30 }
    case 'all':
      return { startDate: null, bucketCount: 12 }
  }
}

function bucketKeyFor(timeRange: ActivityTimeRange, createdAt: string): string {
  const date = new Date(createdAt)
  if (timeRange === '24h') {
    const hour = new Date(date)
    hour.setMinutes(0, 0, 0)
    return hour.toISOString()
  }
  if (timeRange === '7d' || timeRange === '30d') return createdAt.split('T')[0]
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** Groups activity rows and file versions into time buckets and sums the network figures. */
export function buildActivityBuckets(
  timeRange: ActivityTimeRange,
  activities: readonly ActivityRow[] | null,
  versions: readonly VersionRow[] | null,
  now: Date = new Date(),
): { buckets: DailyActivity[]; networkStats: NetworkStats } {
  const { startDate, bucketCount } = activityWindow(timeRange, now)
  const buckets: DailyActivity[] = []

  if (timeRange === '24h' && startDate) {
    // Hourly buckets
    for (let i = 0; i < bucketCount; i++) {
      const bucketDate = new Date(startDate)
      bucketDate.setHours(startDate.getHours() + i)
      const isNow = i === bucketCount - 1
      buckets.push(
        emptyBucket(bucketDate.toISOString(), isNow ? 'Now' : `${bucketDate.getHours()}:00`),
      )
    }
  } else if ((timeRange === '7d' || timeRange === '30d') && startDate) {
    // Daily buckets
    for (let i = 0; i < bucketCount; i++) {
      const bucketDate = new Date(startDate)
      bucketDate.setDate(startDate.getDate() + i)
      const dateStr = bucketDate.toISOString().split('T')[0]
      let label: string
      if (i === bucketCount - 1) label = 'Today'
      else if (i === bucketCount - 2) label = 'Yest'
      else if (timeRange === '30d') label = `${bucketDate.getDate()}`
      else label = DAY_NAMES[bucketDate.getDay()]
      buckets.push(emptyBucket(dateStr, label))
    }
  } else {
    // Monthly buckets for "all time" - last 12 months
    for (let i = 11; i >= 0; i--) {
      const bucketDate = new Date(now)
      bucketDate.setMonth(bucketDate.getMonth() - i)
      bucketDate.setDate(1)
      const monthKey = `${bucketDate.getFullYear()}-${String(bucketDate.getMonth() + 1).padStart(2, '0')}`
      buckets.push(emptyBucket(monthKey, i === 0 ? 'This Mo' : MONTH_NAMES[bucketDate.getMonth()]))
    }
  }

  const usersByBucket: Record<string, Set<string>> = {}

  for (const activity of activities ?? []) {
    const bucketKey = bucketKeyFor(timeRange, activity.created_at)
    const bucket = buckets.find((b) => b.date === bucketKey)
    if (!bucket) continue
    bucket.total++
    if (!usersByBucket[bucketKey]) usersByBucket[bucketKey] = new Set()
    usersByBucket[bucketKey].add(activity.user_id)
    switch (activity.action) {
      case 'checkout':
        bucket.checkouts++
        break
      case 'checkin':
        bucket.checkins++
        break
      case 'create':
        bucket.creates++
        break
      case 'delete':
        bucket.deletes++
        break
      case 'state_change':
      case 'revision_change':
        bucket.stateChanges++
        break
    }
  }

  for (const version of versions ?? []) {
    const bucket = buckets.find((b) => b.date === bucketKeyFor(timeRange, version.created_at))
    if (bucket) bucket.bytesIn += version.file_size || 0
  }

  for (const bucket of buckets) {
    bucket.uniqueUsers = usersByBucket[bucket.date]?.size || 0
  }

  const totalBytesIn = buckets.reduce((sum, d) => sum + d.bytesIn, 0)
  const totalEvents = buckets.reduce((sum, d) => sum + d.total, 0)
  const allUsers = new Set<string>()
  for (const a of activities ?? []) allUsers.add(a.user_id)

  // Estimate bytes out
  const avgFileSize =
    versions && versions.length > 0
      ? versions.reduce((sum, v) => sum + (v.file_size || 0), 0) / versions.length
      : 0
  const totalCheckouts = buckets.reduce((sum, d) => sum + d.checkouts, 0)
  for (const bucket of buckets) {
    bucket.bytesOut = bucket.checkouts * avgFileSize
  }

  const peakBucket = buckets.reduce((max, d) => (d.total > max.total ? d : max), buckets[0])

  return {
    buckets,
    networkStats: {
      totalBytesIn,
      totalBytesOut: totalCheckouts * avgFileSize,
      totalEvents,
      activeUsers: allUsers.size,
      peakDay: peakBucket?.dayLabel || '',
      peakEvents: peakBucket?.total || 0,
    },
  }
}

export function maskKey(key: string): string {
  if (key.length <= 20) return '•'.repeat(key.length)
  return key.substring(0, 12) + '•'.repeat(20) + key.substring(key.length - 8)
}

export function formatExpiryTime(date: Date): string {
  const diff = date.getTime() - Date.now()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  if (minutes < 0) return 'Expired'
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  return `${minutes}m`
}

/** Region of a Supabase URL: `<project-id>.supabase.co` or `<project-id>.<region>.supabase.co`. */
export function extractRegion(url: string): string {
  try {
    const parts = new URL(url).hostname.split('.')
    if (parts.length >= 3 && parts[1] !== 'supabase') {
      const regionMap: Record<string, string> = {
        'us-east-1': 'US East (N. Virginia)',
        'us-west-1': 'US West (N. California)',
        'eu-west-1': 'EU (Ireland)',
        'eu-central-1': 'EU (Frankfurt)',
        'ap-southeast-1': 'Asia Pacific (Singapore)',
        'ap-northeast-1': 'Asia Pacific (Tokyo)',
        'ap-south-1': 'Asia Pacific (Mumbai)',
        'sa-east-1': 'South America (São Paulo)',
      }
      return regionMap[parts[1]] || parts[1]
    }
    return 'Default'
  } catch {
    return 'Unknown'
  }
}
