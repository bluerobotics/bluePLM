/**
 * Webhook Schemas
 *
 * TypeBox schemas for webhook routes.
 */

import { Type, Static } from '@sinclair/typebox';

// Webhook event types
export const WebhookEventType = Type.Union([
  Type.Literal('file.checkout'),
  Type.Literal('file.checkin'),
  Type.Literal('file.sync'),
  Type.Literal('file.delete'),
  Type.Literal('file.restore'),
  Type.Literal('file.state_change'),
  Type.Literal('file.version'),
]);

export type WebhookEventTypeValue = Static<typeof WebhookEventType>;

// Webhook schema (response)
export const WebhookSchema = Type.Object({
  id: Type.String(),
  url: Type.String(),
  events: Type.Array(WebhookEventType),
  active: Type.Boolean(),
  created_at: Type.String(),
});

export type WebhookSchemaType = Static<typeof WebhookSchema>;

// Create webhook body
export const CreateWebhookBody = Type.Object({
  url: Type.String({ format: 'uri' }),
  events: Type.Array(WebhookEventType, { minItems: 1 }),
});

export type CreateWebhookBodyType = Static<typeof CreateWebhookBody>;

// Update webhook body
export const UpdateWebhookBody = Type.Object({
  url: Type.Optional(Type.String({ format: 'uri' })),
  events: Type.Optional(Type.Array(WebhookEventType)),
  active: Type.Optional(Type.Boolean()),
});

export type UpdateWebhookBodyType = Static<typeof UpdateWebhookBody>;
