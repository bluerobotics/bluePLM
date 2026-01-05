import type { Vault } from '../../../core/types/entities';

export interface VaultRow {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export function mapVaultRowToEntity(row: VaultRow): Vault {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    description: row.description,
    createdAt: new Date(row.created_at),
  };
}
