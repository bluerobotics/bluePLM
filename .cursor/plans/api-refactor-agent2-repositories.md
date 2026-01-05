# Phase 2: Repository Layer

## Overview

Implement the repository layer that abstracts all database access. Repositories implement the interfaces defined in Phase 1.

**Depends on:** Phase 1 (Core Foundation)  
**Directories:** `api/src/infrastructure/database/`

---

## Directory Structure to Create

```
api/src/infrastructure/
└── database/
    ├── index.ts                    # Barrel export
    ├── BaseRepository.ts           # Abstract base class
    ├── mappers/
    │   ├── index.ts
    │   ├── fileMapper.ts
    │   ├── vaultMapper.ts
    │   └── webhookMapper.ts
    └── repositories/
        ├── index.ts
        ├── FileRepository.ts
        ├── VaultRepository.ts
        ├── UserRepository.ts
        ├── WebhookRepository.ts
        └── ActivityRepository.ts
```

---

## Tasks

### 1. Base Repository

Create `api/src/infrastructure/database/BaseRepository.ts`:

```typescript
import { SupabaseClient } from '@supabase/supabase-js';
import type { PaginationOptions, PaginatedResult } from '../../core/types/repositories';

export abstract class BaseRepository {
  constructor(
    protected readonly supabase: SupabaseClient,
    protected readonly tableName: string,
    protected readonly orgId: string
  ) {}

  protected query() {
    return this.supabase.from(this.tableName).eq('org_id', this.orgId);
  }

  protected async paginate<TRow, TEntity>(
    query: any,
    options: PaginationOptions,
    mapper: (row: TRow) => TEntity
  ): Promise<PaginatedResult<TEntity>> {
    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;

    const { data, error, count } = await query
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return {
      data: (data ?? []).map(mapper),
      total: count ?? data?.length ?? 0,
      hasMore: (data?.length ?? 0) === limit,
    };
  }
}
```

### 2. File Mapper

Create `api/src/infrastructure/database/mappers/fileMapper.ts`:

```typescript
import type { File } from '../../../core/types/entities';

export interface FileRow {
  id: string;
  org_id: string;
  vault_id: string;
  file_path: string;
  file_name: string;
  extension: string;
  file_type: string;
  part_number: string | null;
  description: string | null;
  revision: string;
  version: number;
  content_hash: string;
  file_size: number;
  state: string;
  checked_out_by: string | null;
  checked_out_at: string | null;
  lock_message: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
}

export function mapFileRowToEntity(row: FileRow): File {
  return {
    id: row.id,
    orgId: row.org_id,
    vaultId: row.vault_id,
    filePath: row.file_path,
    fileName: row.file_name,
    extension: row.extension,
    fileType: row.file_type as File['fileType'],
    partNumber: row.part_number,
    description: row.description,
    revision: row.revision,
    version: row.version,
    contentHash: row.content_hash,
    fileSize: row.file_size,
    state: row.state as File['state'],
    checkedOutBy: row.checked_out_by,
    checkedOutAt: row.checked_out_at ? new Date(row.checked_out_at) : null,
    lockMessage: row.lock_message,
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
    deletedBy: row.deleted_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}
```

### 3. File Repository

Create `api/src/infrastructure/database/repositories/FileRepository.ts`:

```typescript
import { SupabaseClient } from '@supabase/supabase-js';
import { BaseRepository } from '../BaseRepository';
import { mapFileRowToEntity, type FileRow } from '../mappers/fileMapper';
import type { File } from '../../../core/types/entities';
import type { IFileRepository, FileQueryOptions, PaginatedResult, CheckinData } from '../../../core/types/repositories';

export class FileRepository extends BaseRepository implements IFileRepository {
  constructor(supabase: SupabaseClient, orgId: string) {
    super(supabase, 'files', orgId);
  }

  async findById(id: string): Promise<File | null> {
    const { data, error } = await this.supabase
      .from('files')
      .select('*')
      .eq('id', id)
      .eq('org_id', this.orgId)
      .single();

    if (error || !data) return null;
    return mapFileRowToEntity(data);
  }

  async findByPath(vaultId: string, filePath: string): Promise<File | null> {
    const { data, error } = await this.supabase
      .from('files')
      .select('*')
      .eq('vault_id', vaultId)
      .eq('file_path', filePath)
      .eq('org_id', this.orgId)
      .is('deleted_at', null)
      .single();

    if (error || !data) return null;
    return mapFileRowToEntity(data);
  }

  async findMany(options: FileQueryOptions): Promise<PaginatedResult<File>> {
    let query = this.supabase
      .from('files')
      .select('*', { count: 'exact' })
      .eq('org_id', this.orgId);

    if (!options.includeDeleted) query = query.is('deleted_at', null);
    if (options.vaultId) query = query.eq('vault_id', options.vaultId);
    if (options.folder) query = query.ilike('file_path', `${options.folder}%`);
    if (options.state) query = query.eq('state', options.state);
    if (options.search) query = query.or(`file_name.ilike.%${options.search}%,part_number.ilike.%${options.search}%`);
    if (options.checkedOut === 'any') query = query.not('checked_out_by', 'is', null);

    return this.paginate(query, options, mapFileRowToEntity);
  }

  async checkout(id: string, userId: string, message?: string): Promise<File> {
    const { data, error } = await this.supabase
      .from('files')
      .update({
        checked_out_by: userId,
        checked_out_at: new Date().toISOString(),
        lock_message: message ?? null,
      })
      .eq('id', id)
      .eq('org_id', this.orgId)
      .select()
      .single();

    if (error) throw error;
    return mapFileRowToEntity(data);
  }

  async checkin(id: string, data: CheckinData): Promise<File> {
    const updateData: Partial<FileRow> = {
      checked_out_by: null,
      checked_out_at: null,
      lock_message: null,
      updated_at: new Date().toISOString(),
      updated_by: data.userId,
    };

    if (data.contentHash) {
      updateData.content_hash = data.contentHash;
      updateData.file_size = data.fileSize;
      updateData.version = data.newVersion;
    }

    const { data: result, error } = await this.supabase
      .from('files')
      .update(updateData)
      .eq('id', id)
      .eq('org_id', this.orgId)
      .select()
      .single();

    if (error) throw error;
    return mapFileRowToEntity(result);
  }

  async undoCheckout(id: string): Promise<File> {
    const { data, error } = await this.supabase
      .from('files')
      .update({ checked_out_by: null, checked_out_at: null, lock_message: null })
      .eq('id', id)
      .eq('org_id', this.orgId)
      .select()
      .single();

    if (error) throw error;
    return mapFileRowToEntity(data);
  }

  async softDelete(id: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('files')
      .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
      .eq('id', id)
      .eq('org_id', this.orgId);

    if (error) throw error;
  }

  async restore(id: string): Promise<File> {
    const { data, error } = await this.supabase
      .from('files')
      .update({ deleted_at: null, deleted_by: null })
      .eq('id', id)
      .eq('org_id', this.orgId)
      .select()
      .single();

    if (error) throw error;
    return mapFileRowToEntity(data);
  }
}
```

### 4. Webhook Repository (Database-Backed)

Create `api/src/infrastructure/database/repositories/WebhookRepository.ts`:

```typescript
import { SupabaseClient } from '@supabase/supabase-js';
import type { Webhook, WebhookEvent } from '../../../core/types/entities';
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
    return (data ?? []).map(this.mapToEntity);
  }

  async findActiveByEvent(orgId: string, event: string): Promise<Webhook[]> {
    const { data, error } = await this.supabase
      .from('webhooks')
      .select('*')
      .eq('org_id', orgId)
      .eq('active', true)
      .contains('events', [event]);

    if (error) throw error;
    return (data ?? []).map(this.mapToEntity);
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
    return this.mapToEntity(result);
  }

  async update(id: string, data: Partial<Webhook>): Promise<Webhook> {
    const { data: result, error } = await this.supabase
      .from('webhooks')
      .update({
        ...(data.url && { url: data.url }),
        ...(data.events && { events: data.events }),
        ...(data.active !== undefined && { active: data.active }),
      })
      .eq('id', id)
      .eq('org_id', this.orgId)
      .select()
      .single();

    if (error) throw error;
    return this.mapToEntity(result);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('webhooks')
      .delete()
      .eq('id', id)
      .eq('org_id', this.orgId);

    if (error) throw error;
  }

  private mapToEntity(row: any): Webhook {
    return {
      id: row.id,
      orgId: row.org_id,
      url: row.url,
      secret: row.secret,
      events: row.events,
      active: row.active,
      createdAt: new Date(row.created_at),
      createdBy: row.created_by,
    };
  }
}
```

### 5. Other Repositories

Create similar implementations for:
- `VaultRepository` - vault listing
- `UserRepository` - user profile lookups
- `ActivityRepository` - activity logging

---

## Completion Criteria

- [ ] All repository interfaces from Phase 1 implemented
- [ ] Mappers convert snake_case rows to camelCase entities
- [ ] Pagination works consistently
- [ ] WebhookRepository uses database (replaces in-memory Map)
- [ ] Commit: `git commit -m "refactor(api): add repository layer"`
