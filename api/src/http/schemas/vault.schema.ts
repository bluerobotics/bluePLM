/**
 * Vault Schemas
 *
 * TypeBox schemas for vault routes.
 */

import { Type, Static } from '@sinclair/typebox';

// Vault schema (response)
export const VaultSchema = Type.Object({
  id: Type.String(),
  org_id: Type.String(),
  name: Type.String(),
  description: Type.Union([Type.String(), Type.Null()]),
  local_path: Type.Union([Type.String(), Type.Null()]),
  created_at: Type.String(),
  updated_at: Type.String(),
});

export type VaultSchemaType = Static<typeof VaultSchema>;

// Vault status response
export const VaultStatusSchema = Type.Object({
  total: Type.Integer(),
  checked_out: Type.Integer(),
  checked_out_by_me: Type.Integer(),
  by_state: Type.Record(Type.String(), Type.Integer()),
});

export type VaultStatusType = Static<typeof VaultStatusSchema>;
