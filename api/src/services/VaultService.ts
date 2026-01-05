/**
 * Vault Service
 *
 * Handles vault listing and access control.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { IVaultRepository } from '../core/types/repositories';
import type { Vault } from '../core/types/entities';
import type { Result } from '../core/result';
import { ok, err } from '../core/result';
import { NotFoundError } from '../core/errors';
import type { AppError } from '../core/errors/AppError';

export interface VaultStatus {
  total: number;
  checkedOut: number;
  checkedOutByMe: number;
  byState: Record<string, number>;
}

export class VaultService {
  constructor(private readonly vaultRepo: IVaultRepository) {}

  /**
   * Get a vault by ID
   */
  async getById(id: string): Promise<Result<Vault, AppError>> {
    const vault = await this.vaultRepo.findById(id);
    if (!vault) return err(new NotFoundError('Vault', id));
    return ok(vault);
  }

  /**
   * List all vaults for an organization
   */
  async list(): Promise<Result<Vault[], AppError>> {
    const vaults = await this.vaultRepo.findAll();
    return ok(vaults);
  }

  /**
   * Get vault status (file counts by state)
   */
  async getStatus(
    vaultId: string,
    userId: string,
    supabase: SupabaseClient
  ): Promise<Result<VaultStatus, AppError>> {
    const { data: files, error } = await supabase
      .from('files')
      .select('state, checked_out_by')
      .eq('vault_id', vaultId)
      .is('deleted_at', null);

    if (error) throw error;

    const status: VaultStatus = {
      total: files?.length || 0,
      checkedOut: files?.filter(f => f.checked_out_by).length || 0,
      checkedOutByMe: files?.filter(f => f.checked_out_by === userId).length || 0,
      byState: {},
    };

    for (const file of files || []) {
      const state = file.state || 'not_tracked';
      status.byState[state] = (status.byState[state] || 0) + 1;
    }

    return ok(status);
  }
}
