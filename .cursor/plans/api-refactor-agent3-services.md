# Phase 3: Service Layer

## Overview

Implement the service layer containing all business logic. Services orchestrate repositories, handle validation, trigger webhooks, and return Result types.

**Depends on:** Phase 1 (Core), Phase 2 (Repositories)  
**Directories:** `api/src/services/`

---

## Directory Structure to Create

```
api/src/services/
├── index.ts                    # Barrel export
├── AuthService.ts
├── FileService.ts
├── VaultService.ts
├── SupplierService.ts
├── WebhookService.ts
├── ActivityService.ts
└── integrations/
    ├── index.ts
    ├── OdooService.ts
    └── WooCommerceService.ts
```

---

## Tasks

### 1. File Service

Create `api/src/services/FileService.ts`:

```typescript
import type { IFileRepository } from '../core/types/repositories';
import type { File } from '../core/types/entities';
import type { Result } from '../core/result';
import { ok, err } from '../core/result';
import { NotFoundError, ConflictError, ForbiddenError } from '../core/errors';
import type { AppError } from '../core/errors/AppError';

interface CheckinInput {
  comment?: string;
  contentHash?: string;
  fileSize?: number;
}

export class FileService {
  constructor(
    private readonly fileRepo: IFileRepository,
    private readonly webhookService: WebhookService,
    private readonly activityService: ActivityService
  ) {}

  async getById(id: string): Promise<Result<File, AppError>> {
    const file = await this.fileRepo.findById(id);
    if (!file) return err(new NotFoundError('File', id));
    return ok(file);
  }

  async checkout(fileId: string, userId: string, message?: string): Promise<Result<File, AppError>> {
    const file = await this.fileRepo.findById(fileId);
    if (!file) return err(new NotFoundError('File', fileId));

    if (file.checkedOutBy && file.checkedOutBy !== userId) {
      return err(new ConflictError('File is checked out by another user'));
    }

    const updated = await this.fileRepo.checkout(fileId, userId, message);

    await this.activityService.log({
      orgId: file.orgId,
      fileId,
      userId,
      action: 'checkout',
      details: message ? { message } : {},
    });

    await this.webhookService.trigger(file.orgId, 'file.checkout', {
      file_id: fileId,
      file_path: file.filePath,
      file_name: file.fileName,
      user_id: userId,
    });

    return ok(updated);
  }

  async checkin(
    fileId: string, 
    userId: string, 
    input: CheckinInput
  ): Promise<Result<{ file: File; contentChanged: boolean }, AppError>> {
    const file = await this.fileRepo.findById(fileId);
    if (!file) return err(new NotFoundError('File', fileId));

    if (file.checkedOutBy !== userId) {
      return err(new ForbiddenError('File is not checked out to you'));
    }

    const contentChanged = input.contentHash !== undefined && input.contentHash !== file.contentHash;
    const newVersion = contentChanged ? file.version + 1 : file.version;

    const updated = await this.fileRepo.checkin(fileId, {
      userId,
      contentHash: input.contentHash,
      fileSize: input.fileSize,
      newVersion,
    });

    await this.activityService.log({
      orgId: file.orgId,
      fileId,
      userId,
      action: 'checkin',
      details: { comment: input.comment, contentChanged },
    });

    await this.webhookService.trigger(file.orgId, 'file.checkin', {
      file_id: fileId,
      content_changed: contentChanged,
      user_id: userId,
    });

    return ok({ file: updated, contentChanged });
  }

  async undoCheckout(fileId: string, userId: string, userRole: string): Promise<Result<File, AppError>> {
    const file = await this.fileRepo.findById(fileId);
    if (!file) return err(new NotFoundError('File', fileId));

    if (file.checkedOutBy !== userId && userRole !== 'admin') {
      return err(new ForbiddenError('File is not checked out to you'));
    }

    const updated = await this.fileRepo.undoCheckout(fileId);
    return ok(updated);
  }

  async delete(fileId: string, userId: string): Promise<Result<void, AppError>> {
    const file = await this.fileRepo.findById(fileId);
    if (!file) return err(new NotFoundError('File', fileId));

    if (file.checkedOutBy && file.checkedOutBy !== userId) {
      return err(new ConflictError('Cannot delete file checked out by another user'));
    }

    await this.fileRepo.softDelete(fileId, userId);

    await this.webhookService.trigger(file.orgId, 'file.delete', {
      file_id: fileId,
      file_path: file.filePath,
      user_id: userId,
    });

    return ok(undefined);
  }

  async restore(fileId: string): Promise<Result<File, AppError>> {
    const restored = await this.fileRepo.restore(fileId);
    return ok(restored);
  }
}
```

### 2. Webhook Service

Create `api/src/services/WebhookService.ts`:

```typescript
import type { IWebhookRepository } from '../core/types/repositories';
import type { Webhook, WebhookEvent } from '../core/types/entities';
import type { Result } from '../core/result';
import { ok, err } from '../core/result';
import { ForbiddenError } from '../core/errors';
import type { AppError } from '../core/errors/AppError';
import crypto from 'crypto';

export class WebhookService {
  constructor(
    private readonly webhookRepo: IWebhookRepository,
    private readonly logger: any
  ) {}

  async trigger(orgId: string, event: WebhookEvent, data: Record<string, unknown>): Promise<void> {
    const webhooks = await this.webhookRepo.findActiveByEvent(orgId, event);
    if (webhooks.length === 0) return;

    const payload = JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      org_id: orgId,
      data,
    });

    await Promise.allSettled(
      webhooks.map(webhook => this.deliver(webhook, payload, event))
    );
  }

  private async deliver(webhook: Webhook, payload: string, event: WebhookEvent): Promise<void> {
    try {
      const signature = crypto.createHmac('sha256', webhook.secret).update(payload).digest('hex');

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
        this.logger.warn({ webhookId: webhook.id, status: response.status }, 'Webhook delivery failed');
      }
    } catch (error) {
      this.logger.error({ webhookId: webhook.id, error }, 'Webhook delivery error');
    }
  }

  async list(orgId: string): Promise<Webhook[]> {
    return this.webhookRepo.findByOrgId(orgId);
  }

  async create(
    orgId: string,
    userId: string,
    userRole: string,
    input: { url: string; events: WebhookEvent[] }
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

  async delete(id: string, userRole: string): Promise<Result<void, AppError>> {
    if (userRole !== 'admin') {
      return err(new ForbiddenError('Only admins can delete webhooks'));
    }

    await this.webhookRepo.delete(id);
    return ok(undefined);
  }
}
```

### 3. Activity Service

Create `api/src/services/ActivityService.ts`:

```typescript
import { SupabaseClient } from '@supabase/supabase-js';

interface ActivityInput {
  orgId: string;
  fileId: string;
  userId: string;
  action: string;
  details?: Record<string, unknown>;
}

export class ActivityService {
  constructor(private readonly supabase: SupabaseClient) {}

  async log(input: ActivityInput): Promise<void> {
    await this.supabase.from('activity').insert({
      org_id: input.orgId,
      file_id: input.fileId,
      user_id: input.userId,
      action: input.action,
      details: input.details ?? {},
    });
  }

  async getRecent(orgId: string, options: { fileId?: string; limit?: number }) {
    let query = this.supabase
      .from('activity')
      .select('*, file:files(file_name, file_path), user:users(email, full_name)')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(options.limit ?? 50);

    if (options.fileId) query = query.eq('file_id', options.fileId);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  }
}
```

### 4. Vault Service

Create `api/src/services/VaultService.ts`:

```typescript
import type { IVaultRepository } from '../core/types/repositories';
import type { Vault } from '../core/types/entities';
import type { Result } from '../core/result';
import { ok, err } from '../core/result';
import { NotFoundError } from '../core/errors';
import type { AppError } from '../core/errors/AppError';

export class VaultService {
  constructor(private readonly vaultRepo: IVaultRepository) {}

  async getById(id: string): Promise<Result<Vault, AppError>> {
    const vault = await this.vaultRepo.findById(id);
    if (!vault) return err(new NotFoundError('Vault', id));
    return ok(vault);
  }

  async list(): Promise<Result<Vault[], AppError>> {
    const vaults = await this.vaultRepo.findAll();
    return ok(vaults);
  }
}
```

### 5. Auth Service

Create `api/src/services/AuthService.ts` with login, refresh, and validateToken methods.

---

## Completion Criteria

- [ ] All services use Result<T, E> for error handling
- [ ] Business logic extracted from routes
- [ ] Services orchestrate repositories + webhooks + activity
- [ ] No direct Supabase calls (use repositories)
- [ ] Commit: `git commit -m "refactor(api): add service layer"`
