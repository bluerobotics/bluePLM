import type { File } from '../../../core/types/entities';

export interface FileRow {
  id: string;
  org_id: string;
  vault_id: string;
  file_path: string;
  file_name: string;
  extension: string;
  file_type: string;
  part_number: string | null;
  description: string | null;
  revision: string;
  version: number;
  content_hash: string;
  file_size: number;
  state: string;
  checked_out_by: string | null;
  checked_out_at: string | null;
  lock_message: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
}

export function mapFileRowToEntity(row: FileRow): File {
  return {
    id: row.id,
    orgId: row.org_id,
    vaultId: row.vault_id,
    filePath: row.file_path,
    fileName: row.file_name,
    extension: row.extension,
    fileType: row.file_type as File['fileType'],
    partNumber: row.part_number,
    description: row.description,
    revision: row.revision,
    version: row.version,
    contentHash: row.content_hash,
    fileSize: row.file_size,
    state: row.state as File['state'],
    checkedOutBy: row.checked_out_by,
    checkedOutAt: row.checked_out_at ? new Date(row.checked_out_at) : null,
    lockMessage: row.lock_message,
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
    deletedBy: row.deleted_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}
