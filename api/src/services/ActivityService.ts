/**
 * Activity Service
 *
 * Handles activity logging and retrieval.
 * Note: This service uses Supabase directly since activity logging is a simple
 * cross-cutting concern that doesn't benefit from the repository abstraction.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface ActivityInput {
  orgId: string;
  fileId: string;
  userId: string;
  action: string;
  details?: Record<string, unknown>;
}

export interface ActivityEntry {
  id: string;
  orgId: string;
  fileId: string;
  userId: string;
  action: string;
  details: Record<string, unknown>;
  createdAt: Date;
  file?: { fileName: string; filePath: string } | null;
  user?: { email: string; fullName: string | null } | null;
}

export interface GetRecentOptions {
  fileId?: string;
  limit?: number;
}

export class ActivityService {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Log an activity entry
   */
  async log(input: ActivityInput): Promise<void> {
    await this.supabase.from('activity').insert({
      org_id: input.orgId,
      file_id: input.fileId,
      user_id: input.userId,
      action: input.action,
      details: input.details ?? {},
    });
  }

  /**
   * Get recent activity for an organization
   */
  async getRecent(orgId: string, options: GetRecentOptions = {}): Promise<ActivityEntry[]> {
    let query = this.supabase
      .from('activity')
      .select(`
        *,
        file:files(file_name, file_path),
        user:users(email, full_name)
      `)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(options.limit ?? 50);

    if (options.fileId) {
      query = query.eq('file_id', options.fileId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map((row) => ({
      id: row.id,
      orgId: row.org_id,
      fileId: row.file_id,
      userId: row.user_id,
      action: row.action,
      details: row.details,
      createdAt: new Date(row.created_at),
      file: row.file ? { fileName: row.file.file_name, filePath: row.file.file_path } : null,
      user: row.user ? { email: row.user.email, fullName: row.user.full_name } : null,
    }));
  }
}
