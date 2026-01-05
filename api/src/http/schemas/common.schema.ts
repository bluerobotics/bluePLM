/**
 * Common Schemas
 *
 * Shared TypeBox schemas for request/response validation.
 */

import { Type, Static } from '@sinclair/typebox';

// Common parameter schemas
export const UuidParams = Type.Object({
  id: Type.String({ format: 'uuid' }),
});

export type UuidParamsType = Static<typeof UuidParams>;

// Pagination query parameters
export const PaginationQuery = Type.Object({
  limit: Type.Optional(Type.Integer({ default: 100, minimum: 1, maximum: 1000 })),
  offset: Type.Optional(Type.Integer({ default: 0, minimum: 0 })),
});

export type PaginationQueryType = Static<typeof PaginationQuery>;

// Standard success response
export const SuccessResponse = Type.Object({
  success: Type.Literal(true),
});

// Standard error response
export const ErrorResponse = Type.Object({
  error: Type.String(),
  message: Type.String(),
  details: Type.Optional(Type.Unknown()),
});

// User schema (response)
export const UserSchema = Type.Object({
  id: Type.String(),
  email: Type.String(),
  full_name: Type.Union([Type.String(), Type.Null()]),
  role: Type.Union([Type.Literal('admin'), Type.Literal('engineer'), Type.Literal('viewer')]),
  org_id: Type.Union([Type.String(), Type.Null()]),
});

export type UserType = Static<typeof UserSchema>;
