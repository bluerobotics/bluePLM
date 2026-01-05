/**
 * Webhook Routes
 *
 * Webhook management for event notifications.
 * Uses WebhookService for persistent database storage.
 */

import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { UuidParams, WebhookSchema, CreateWebhookBody, UpdateWebhookBody } from '../schemas';
import type { WebhookEvent } from '../../core/types/entities';

const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  // List webhooks
  fastify.get(
    '/webhooks',
    {
      schema: {
        description: 'List webhooks',
        tags: ['Webhooks'],
        security: [{ bearerAuth: [] }],
        response: {
          200: Type.Object({
            webhooks: Type.Array(WebhookSchema),
          }),
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const webhooks = await request.container!.webhookService.list(request.user!.org_id!);
      return {
        webhooks: webhooks.map((w) => ({
          id: w.id,
          url: w.url,
          events: w.events,
          active: w.active,
          created_at: w.createdAt.toISOString(),
        })),
      };
    }
  );

  // Create a webhook
  fastify.post(
    '/webhooks',
    {
      schema: {
        description: 'Create a webhook',
        tags: ['Webhooks'],
        security: [{ bearerAuth: [] }],
        body: CreateWebhookBody,
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            webhook: WebhookSchema,
            secret: Type.String({ description: 'Webhook secret (only shown once)' }),
          }),
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { url, events } = request.body as { url: string; events: string[] };

      const result = await request.container!.webhookService.create(
        request.user!.org_id!,
        request.user!.id,
        request.user!.role,
        { url, events: events as WebhookEvent[] }
      );
      if (!result.ok) throw result.error;

      return {
        success: true,
        webhook: {
          id: result.value.webhook.id,
          url: result.value.webhook.url,
          events: result.value.webhook.events,
          active: result.value.webhook.active,
          created_at: result.value.webhook.createdAt.toISOString(),
        },
        secret: result.value.secret,
      };
    }
  );

  // Delete a webhook
  fastify.delete<{ Params: { id: string } }>(
    '/webhooks/:id',
    {
      schema: {
        description: 'Delete a webhook',
        tags: ['Webhooks'],
        security: [{ bearerAuth: [] }],
        params: UuidParams,
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { id } = request.params;

      const result = await request.container!.webhookService.delete(id, request.user!.role);
      if (!result.ok) throw result.error;

      return { success: true };
    }
  );

  // Update a webhook
  fastify.patch<{ Params: { id: string } }>(
    '/webhooks/:id',
    {
      schema: {
        description: 'Update a webhook',
        tags: ['Webhooks'],
        security: [{ bearerAuth: [] }],
        params: UuidParams,
        body: UpdateWebhookBody,
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { id } = request.params;
      const updates = request.body as { url?: string; events?: string[]; active?: boolean };

      const result = await request.container!.webhookService.update(id, request.user!.role, {
        url: updates.url,
        events: updates.events as WebhookEvent[] | undefined,
        active: updates.active,
      });
      if (!result.ok) throw result.error;

      return {
        success: true,
        webhook: {
          id: result.value.id,
          url: result.value.url,
          events: result.value.events,
          active: result.value.active,
          created_at: result.value.createdAt.toISOString(),
        },
      };
    }
  );
};

export default webhookRoutes;
