/**
 * Webhook Service
 *
 * Handles webhook CRUD operations and event triggering.
 */

import crypto from 'crypto';
import type { IWebhookRepository } from '../core/types/repositories';
import type { Webhook, WebhookEvent } from '../core/types/entities';
import type { Result } from '../core/result';
import { ok, err } from '../core/result';
import { ForbiddenError } from '../core/errors';
import type { AppError } from '../core/errors/AppError';

export interface WebhookCreateInput {
  url: string;
  events: WebhookEvent[];
}

export interface Logger {
  warn(obj: Record<string, unknown>, message: string): void;
  error(obj: Record<string, unknown>, message: string): void;
}

export class WebhookService {
  constructor(
    private readonly webhookRepo: IWebhookRepository,
    private readonly logger: Logger
  ) {}

  /**
   * Trigger webhooks for an event
   */
  async trigger(
    orgId: string,
    event: WebhookEvent,
    data: Record<string, unknown>
  ): Promise<void> {
    const webhooks = await this.webhookRepo.findActiveByEvent(orgId, event);
    if (webhooks.length === 0) return;

    const payload = JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      org_id: orgId,
      data,
    });

    await Promise.allSettled(
      webhooks.map((webhook) => this.deliver(webhook, payload, event))
    );
  }

  /**
   * Deliver a webhook payload
   */
  private async deliver(
    webhook: Webhook,
    payload: string,
    event: WebhookEvent
  ): Promise<void> {
    try {
      const signature = crypto
        .createHmac('sha256', webhook.secret)
        .update(payload)
        .digest('hex');

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BluePLM-Signature': signature,
          'X-BluePLM-Event': event,
        },
        body: payload,
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        this.logger.warn(
          { webhookId: webhook.id, status: response.status },
          'Webhook delivery failed'
        );
      }
    } catch (error) {
      this.logger.error(
        { webhookId: webhook.id, error },
        'Webhook delivery error'
      );
    }
  }

  /**
   * List webhooks for an organization
   */
  async list(orgId: string): Promise<Webhook[]> {
    return this.webhookRepo.findByOrgId(orgId);
  }

  /**
   * Create a new webhook (admin only)
   */
  async create(
    orgId: string,
    userId: string,
    userRole: string,
    input: WebhookCreateInput
  ): Promise<Result<{ webhook: Webhook; secret: string }, AppError>> {
    if (userRole !== 'admin') {
      return err(new ForbiddenError('Only admins can create webhooks'));
    }

    const secret = crypto.randomBytes(32).toString('hex');

    const webhook = await this.webhookRepo.create({
      orgId,
      url: input.url,
      secret,
      events: input.events,
      createdBy: userId,
    });

    return ok({ webhook, secret });
  }

  /**
   * Update a webhook (admin only)
   */
  async update(
    id: string,
    userRole: string,
    updates: Partial<Pick<Webhook, 'url' | 'events' | 'active'>>
  ): Promise<Result<Webhook, AppError>> {
    if (userRole !== 'admin') {
      return err(new ForbiddenError('Only admins can update webhooks'));
    }

    const webhook = await this.webhookRepo.update(id, updates);
    return ok(webhook);
  }

  /**
   * Delete a webhook (admin only)
   */
  async delete(id: string, userRole: string): Promise<Result<void, AppError>> {
    if (userRole !== 'admin') {
      return err(new ForbiddenError('Only admins can delete webhooks'));
    }

    await this.webhookRepo.delete(id);
    return ok(undefined);
  }
}
