import type { Webhook, WebhookEvent } from '../../../core/types/entities';

export interface WebhookRow {
  id: string;
  org_id: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  created_at: string;
  created_by: string;
}

export function mapWebhookRowToEntity(row: WebhookRow): Webhook {
  return {
    id: row.id,
    orgId: row.org_id,
    url: row.url,
    secret: row.secret,
    events: row.events as WebhookEvent[],
    active: row.active,
    createdAt: new Date(row.created_at),
    createdBy: row.created_by,
  };
}
