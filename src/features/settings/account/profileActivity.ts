/**
 * Shapes `activity` rows for the user profile's history.
 *
 * Most activity rows carry only a `file_id` (a checkout's details hold the lock message, not the
 * file), so the name and path come from the joined `files` row. A deleted file's row may no longer
 * join, and the delete trigger copies its name and path into `details`, so those are the fallback.
 */

export interface ProfileActivityRow {
  id: string
  action: string
  created_at: string
  file_id?: string | null
  details?: Record<string, unknown> | null
  file?: { file_name: string | null; file_path: string | null } | null
}

export interface ProfileActivity {
  id: string
  action: string
  createdAt: string
  /** UTC calendar day, `YYYY-MM-DD`, the key the contribution grid uses. */
  day: string
  fileName: string | null
  /** Vault-relative path with forward slashes, or null when the row names no file. */
  filePath: string | null
  /** Containing folder of `filePath`; empty string for a file at the vault root. */
  folderPath: string | null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

export function toProfileActivity(row: ProfileActivityRow): ProfileActivity {
  const details = row.details ?? {}
  const rawPath = text(row.file?.file_path) ?? text(details.file_path)
  const filePath = rawPath ? rawPath.replace(/\\/g, '/') : null
  const slash = filePath ? filePath.lastIndexOf('/') : -1
  const fileName =
    text(row.file?.file_name) ??
    text(details.file_name) ??
    (filePath ? filePath.slice(slash + 1) : null)

  return {
    id: row.id,
    action: row.action,
    createdAt: row.created_at,
    day: row.created_at.split('T')[0],
    fileName,
    filePath,
    folderPath: filePath ? (slash >= 0 ? filePath.slice(0, slash) : '') : null,
  }
}

/** Action counts, most frequent first. */
export function countByAction(activities: ProfileActivity[]): { action: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const activity of activities) {
    counts.set(activity.action, (counts.get(activity.action) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count || a.action.localeCompare(b.action))
}
