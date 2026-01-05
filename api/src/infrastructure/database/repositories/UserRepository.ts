import { SupabaseClient } from '@supabase/supabase-js';
import { mapUserRowToEntity, type UserRow } from '../mappers/userMapper';
import type { User } from '../../../core/types/entities';

export class UserRepository {
  // Note: orgId not stored - profile queries don't filter by org
  constructor(private readonly supabase: SupabaseClient, _orgId?: string) {}

  async findById(id: string): Promise<User | null> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return null;
    return mapUserRowToEntity(data as UserRow);
  }

  async findByEmail(email: string): Promise<User | null> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !data) return null;
    return mapUserRowToEntity(data as UserRow);
  }

  async findByOrgId(orgId: string): Promise<User[]> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('org_id', orgId);

    if (error) throw error;
    return (data ?? []).map((row) => mapUserRowToEntity(row as UserRow));
  }

  async updateProfile(
    id: string,
    data: { fullName?: string; role?: string }
  ): Promise<User> {
    const updatePayload: Record<string, unknown> = {};
    if (data.fullName !== undefined) updatePayload.full_name = data.fullName;
    if (data.role !== undefined) updatePayload.role = data.role;

    const { data: result, error } = await this.supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return mapUserRowToEntity(result as UserRow);
  }
}
