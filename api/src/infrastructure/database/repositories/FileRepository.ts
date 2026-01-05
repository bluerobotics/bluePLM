import { SupabaseClient } from '@supabase/supabase-js';
import { BaseRepository } from '../BaseRepository';
import { mapFileRowToEntity, type FileRow } from '../mappers/fileMapper';
import type { File } from '../../../core/types/entities';
import type {
  IFileRepository,
  FileQueryOptions,
  PaginatedResult,
  CheckinData,
} from '../../../core/types/repositories';

export class FileRepository extends BaseRepository implements IFileRepository {
  constructor(supabase: SupabaseClient, orgId: string) {
    super(supabase, 'files', orgId);
  }

  async findById(id: string): Promise<File | null> {
    const { data, error } = await this.supabase
      .from('files')
      .select('*')
      .eq('id', id)
      .eq('org_id', this.orgId)
      .single();

    if (error || !data) return null;
    return mapFileRowToEntity(data);
  }

  async findByPath(vaultId: string, filePath: string): Promise<File | null> {
    const { data, error } = await this.supabase
      .from('files')
      .select('*')
      .eq('vault_id', vaultId)
      .eq('file_path', filePath)
      .eq('org_id', this.orgId)
      .is('deleted_at', null)
      .single();

    if (error || !data) return null;
    return mapFileRowToEntity(data);
  }

  async findMany(options: FileQueryOptions): Promise<PaginatedResult<File>> {
    let query = this.supabase
      .from('files')
      .select('*', { count: 'exact' })
      .eq('org_id', this.orgId);

    if (!options.includeDeleted) {
      query = query.is('deleted_at', null);
    }
    if (options.vaultId) {
      query = query.eq('vault_id', options.vaultId);
    }
    if (options.folder) {
      query = query.ilike('file_path', `${options.folder}%`);
    }
    if (options.state) {
      query = query.eq('state', options.state);
    }
    if (options.search) {
      query = query.or(
        `file_name.ilike.%${options.search}%,part_number.ilike.%${options.search}%`
      );
    }
    if (options.checkedOut === 'any') {
      query = query.not('checked_out_by', 'is', null);
    }

    return this.paginate<FileRow, File>(query, options, mapFileRowToEntity);
  }

  async checkout(id: string, userId: string, message?: string): Promise<File> {
    const { data, error } = await this.supabase
      .from('files')
      .update({
        checked_out_by: userId,
        checked_out_at: new Date().toISOString(),
        lock_message: message ?? null,
      })
      .eq('id', id)
      .eq('org_id', this.orgId)
      .select()
      .single();

    if (error) throw error;
    return mapFileRowToEntity(data);
  }

  async checkin(id: string, data: CheckinData): Promise<File> {
    const updateData: Partial<FileRow> = {
      checked_out_by: null,
      checked_out_at: null,
      lock_message: null,
      updated_at: new Date().toISOString(),
      updated_by: data.userId,
    };

    if (data.contentHash) {
      updateData.content_hash = data.contentHash;
      updateData.file_size = data.fileSize;
      updateData.version = data.newVersion;
    }

    const { data: result, error } = await this.supabase
      .from('files')
      .update(updateData)
      .eq('id', id)
      .eq('org_id', this.orgId)
      .select()
      .single();

    if (error) throw error;
    return mapFileRowToEntity(result);
  }

  async undoCheckout(id: string): Promise<File> {
    const { data, error } = await this.supabase
      .from('files')
      .update({
        checked_out_by: null,
        checked_out_at: null,
        lock_message: null,
      })
      .eq('id', id)
      .eq('org_id', this.orgId)
      .select()
      .single();

    if (error) throw error;
    return mapFileRowToEntity(data);
  }

  async softDelete(id: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('files')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: userId,
      })
      .eq('id', id)
      .eq('org_id', this.orgId);

    if (error) throw error;
  }

  async restore(id: string): Promise<File> {
    const { data, error } = await this.supabase
      .from('files')
      .update({ deleted_at: null, deleted_by: null })
      .eq('id', id)
      .eq('org_id', this.orgId)
      .select()
      .single();

    if (error) throw error;
    return mapFileRowToEntity(data);
  }

  async updateState(id: string, state: string, userId: string): Promise<File> {
    const { data, error } = await this.supabase
      .from('files')
      .update({
        state,
        state_changed_at: new Date().toISOString(),
        state_changed_by: userId,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq('id', id)
      .eq('org_id', this.orgId)
      .select()
      .single();

    if (error) throw error;
    return mapFileRowToEntity(data);
  }
}
