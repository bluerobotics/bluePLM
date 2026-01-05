import { SupabaseClient } from '@supabase/supabase-js';
import { BaseRepository } from '../BaseRepository';
import {
  mapActivityRowToEntity,
  type Activity,
  type ActivityRow,
} from '../mappers/activityMapper';
import type { PaginationOptions, PaginatedResult } from '../../../core/types/repositories';

export interface CreateActivityData {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName?: string;
  metadata?: Record<string, unknown>;
}

export interface ActivityQueryOptions extends PaginationOptions {
  entityType?: string;
  entityId?: string;
  userId?: string;
  action?: string;
}

export class ActivityRepository extends BaseRepository {
  constructor(supabase: SupabaseClient, orgId: string) {
    super(supabase, 'activity_log', orgId);
  }

  async create(data: CreateActivityData): Promise<Activity> {
    const { data: result, error } = await this.supabase
      .from('activity_log')
      .insert({
        org_id: this.orgId,
        user_id: data.userId,
        action: data.action,
        entity_type: data.entityType,
        entity_id: data.entityId,
        entity_name: data.entityName ?? null,
        metadata: data.metadata ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return mapActivityRowToEntity(result as ActivityRow);
  }

  async findMany(options: ActivityQueryOptions): Promise<PaginatedResult<Activity>> {
    let query = this.supabase
      .from('activity_log')
      .select('*', { count: 'exact' })
      .eq('org_id', this.orgId)
      .order('created_at', { ascending: false });

    if (options.entityType) {
      query = query.eq('entity_type', options.entityType);
    }
    if (options.entityId) {
      query = query.eq('entity_id', options.entityId);
    }
    if (options.userId) {
      query = query.eq('user_id', options.userId);
    }
    if (options.action) {
      query = query.eq('action', options.action);
    }

    return this.paginate<ActivityRow, Activity>(query, options, mapActivityRowToEntity);
  }

  async findByEntity(entityType: string, entityId: string): Promise<Activity[]> {
    const { data, error } = await this.supabase
      .from('activity_log')
      .select('*')
      .eq('org_id', this.orgId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []).map((row) => mapActivityRowToEntity(row as ActivityRow));
  }
}
