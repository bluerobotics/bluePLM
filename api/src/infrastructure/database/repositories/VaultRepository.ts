import { SupabaseClient } from '@supabase/supabase-js';
import { BaseRepository } from '../BaseRepository';
import { mapVaultRowToEntity, type VaultRow } from '../mappers/vaultMapper';
import type { Vault } from '../../../core/types/entities';
import type { IVaultRepository } from '../../../core/types/repositories';

export class VaultRepository extends BaseRepository implements IVaultRepository {
  constructor(supabase: SupabaseClient, orgId: string) {
    super(supabase, 'vaults', orgId);
  }

  async findById(id: string): Promise<Vault | null> {
    const { data, error } = await this.supabase
      .from('vaults')
      .select('*')
      .eq('id', id)
      .eq('org_id', this.orgId)
      .single();

    if (error || !data) return null;
    return mapVaultRowToEntity(data as VaultRow);
  }

  async findAll(): Promise<Vault[]> {
    const { data, error } = await this.supabase
      .from('vaults')
      .select('*')
      .eq('org_id', this.orgId)
      .order('name');

    if (error) throw error;
    return (data ?? []).map((row) => mapVaultRowToEntity(row as VaultRow));
  }
}
