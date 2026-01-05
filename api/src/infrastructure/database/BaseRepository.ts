import { SupabaseClient } from '@supabase/supabase-js';
import type { PaginationOptions, PaginatedResult } from '../../core/types/repositories';

export abstract class BaseRepository {
  constructor(
    protected readonly supabase: SupabaseClient,
    protected readonly tableName: string,
    protected readonly orgId: string
  ) {}

  protected query() {
    return this.supabase.from(this.tableName).select('*').eq('org_id', this.orgId);
  }

  protected async paginate<TRow, TEntity>(
    query: any,
    options: PaginationOptions,
    mapper: (row: TRow) => TEntity
  ): Promise<PaginatedResult<TEntity>> {
    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;

    const { data, error, count } = await query.range(offset, offset + limit - 1);

    if (error) throw error;

    return {
      data: (data ?? []).map(mapper),
      total: count ?? data?.length ?? 0,
      hasMore: (data?.length ?? 0) === limit,
    };
  }
}
