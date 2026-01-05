import { SupabaseClient } from '@supabase/supabase-js';
import { mapWebhookRowToEntity, type WebhookRow } from '../mappers/webhookMapper';
import type { Webhook } from '../../../core/types/entities';
import type { IWebhookRepository, CreateWebhookData } from '../../../core/types/repositories';

export class WebhookRepository implements IWebhookRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly orgId: string
  ) {}

  async findByOrgId(orgId: string): Promise<Webhook[]> {
    const { data, error } = await this.supabase
      .from('webhooks')
      .select('*')
      .eq('org_id', orgId);

    if (error) throw error;
    return (data ?? []).map((row) => mapWebhookRowToEntity(row as WebhookRow));
  }

  async findActiveByEvent(orgId: string, event: string): Promise<Webhook[]> {
    const { data, error } = await this.supabase
      .from('webhooks')
      .select('*')
      .eq('org_id', orgId)
      .eq('active', true)
      .contains('events', [event]);

    if (error) throw error;
    return (data ?? []).map((row) => mapWebhookRowToEntity(row as WebhookRow));
  }

  async create(data: CreateWebhookData): Promise<Webhook> {
    const { data: result, error } = await this.supabase
      .from('webhooks')
      .insert({
        org_id: data.orgId,
        url: data.url,
        secret: data.secret,
        events: data.events,
        active: true,
        created_by: data.createdBy,
      })
      .select()
      .single();

    if (error) throw error;
    return mapWebhookRowToEntity(result as WebhookRow);
  }

  async update(id: string, data: Partial<Webhook>): Promise<Webhook> {
    const updatePayload: Record<string, unknown> = {};
    if (data.url !== undefined) updatePayload.url = data.url;
    if (data.events !== undefined) updatePayload.events = data.events;
    if (data.active !== undefined) updatePayload.active = data.active;

    const { data: result, error } = await this.supabase
      .from('webhooks')
      .update(updatePayload)
      .eq('id', id)
      .eq('org_id', this.orgId)
      .select()
      .single();

    if (error) throw error;
    return mapWebhookRowToEntity(result as WebhookRow);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('webhooks')
      .delete()
      .eq('id', id)
      .eq('org_id', this.orgId);

    if (error) throw error;
  }
}
