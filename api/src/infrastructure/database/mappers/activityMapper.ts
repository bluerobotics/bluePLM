export interface ActivityRow {
  id: string;
  org_id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  entity_name: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Activity {
  id: string;
  orgId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export function mapActivityRowToEntity(row: ActivityRow): Activity {
  return {
    id: row.id,
    orgId: row.org_id,
    userId: row.user_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityName: row.entity_name,
    metadata: row.metadata,
    createdAt: new Date(row.created_at),
  };
}
