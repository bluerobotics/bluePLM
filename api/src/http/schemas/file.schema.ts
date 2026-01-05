/**
 * File Schemas
 *
 * TypeBox schemas for file routes.
 */

import { Type, Static } from '@sinclair/typebox';

// File state enum
export const FileState = Type.Union([
  Type.Literal('not_tracked'),
  Type.Literal('wip'),
  Type.Literal('in_review'),
  Type.Literal('released'),
  Type.Literal('obsolete'),
]);

export type FileStateType = Static<typeof FileState>;

// File type enum
export const FileType = Type.Union([
  Type.Literal('part'),
  Type.Literal('assembly'),
  Type.Literal('drawing'),
  Type.Literal('document'),
  Type.Literal('other'),
]);

// File schema (response)
export const FileSchema = Type.Object({
  id: Type.String(),
  org_id: Type.String(),
  vault_id: Type.String(),
  file_path: Type.String(),
  file_name: Type.String(),
  extension: Type.String(),
  file_type: FileType,
  part_number: Type.Union([Type.String(), Type.Null()]),
  description: Type.Union([Type.String(), Type.Null()]),
  revision: Type.String(),
  version: Type.Integer(),
  content_hash: Type.String(),
  file_size: Type.Integer(),
  state: FileState,
  checked_out_by: Type.Union([Type.String(), Type.Null()]),
  checked_out_at: Type.Union([Type.String(), Type.Null()]),
  lock_message: Type.Union([Type.String(), Type.Null()]),
  created_at: Type.String(),
  updated_at: Type.String(),
});

export type FileSchemaType = Static<typeof FileSchema>;

// List files query
export const ListFilesQuery = Type.Object({
  vault_id: Type.Optional(Type.String({ format: 'uuid' })),
  folder: Type.Optional(Type.String()),
  state: Type.Optional(FileState),
  search: Type.Optional(Type.String()),
  checked_out: Type.Optional(Type.Union([Type.Literal('me'), Type.Literal('any')])),
  limit: Type.Optional(Type.Integer({ default: 1000 })),
  offset: Type.Optional(Type.Integer({ default: 0 })),
});

export type ListFilesQueryType = Static<typeof ListFilesQuery>;

// Checkout body
export const CheckoutBody = Type.Object({
  message: Type.Optional(Type.String()),
});

export type CheckoutBodyType = Static<typeof CheckoutBody>;

// Checkin body
export const CheckinBody = Type.Object({
  comment: Type.Optional(Type.String()),
  content_hash: Type.Optional(Type.String()),
  file_size: Type.Optional(Type.Integer()),
  content: Type.Optional(Type.String({ description: 'Base64 encoded file content' })),
});

export type CheckinBodyType = Static<typeof CheckinBody>;

// Sync body
export const SyncBody = Type.Object({
  vault_id: Type.String({ format: 'uuid' }),
  file_path: Type.String(),
  file_name: Type.String(),
  extension: Type.Optional(Type.String()),
  content: Type.String({ description: 'Base64 encoded file content' }),
});

export type SyncBodyType = Static<typeof SyncBody>;

// Update metadata body
export const UpdateMetadataBody = Type.Object({
  state: Type.Optional(FileState),
});

export type UpdateMetadataBodyType = Static<typeof UpdateMetadataBody>;

// Download query
export const DownloadQuery = Type.Object({
  version: Type.Optional(Type.Integer({ description: 'Specific version to download' })),
});

export type DownloadQueryType = Static<typeof DownloadQuery>;
