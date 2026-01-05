import type { User } from '../../../core/types/entities';

export interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  org_id: string | null;
}

export function mapUserRowToEntity(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role as User['role'],
    orgId: row.org_id,
  };
}
