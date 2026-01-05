# Agent A: Container Plugin + Service Methods

## Overview

Create the DI container plugin and complete missing service/repository methods. This phase must complete first as Agents B and C depend on it.

**Depends on**: Nothing (first phase)
**Blocks**: Agent B, Agent C

---

## Tasks

### 1. Create Container Plugin

**File**: `api/src/http/plugins/container.plugin.ts` (new)

Create a Fastify plugin that instantiates the DI container per-request:

```typescript
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { createContainer, Container } from '../../infrastructure/container';

declare module 'fastify' {
  interface FastifyRequest {
    container: Container;
  }
}

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest('container', null);

  fastify.addHook('preHandler', async (request) => {
    // Only create container for authenticated requests
    if (request.user && request.user.org_id) {
      request.container = createContainer({
        orgId: request.user.org_id,
        accessToken: request.accessToken || undefined,
        logger: request.log,
      });
    }
  });
};

export default fp(plugin, {
  name: 'container',
  dependencies: ['auth'], // Must run after auth
});
```

### 2. Export Container Plugin

**File**: `api/src/http/plugins/index.ts`

Add export:
```typescript
export { default as containerPlugin } from './container.plugin';
```

### 3. Register Container Plugin

**File**: `api/src/http/index.ts`

Import and register after auth plugin:
```typescript
import { containerPlugin } from './plugins';

// After auth plugin registration:
await fastify.register(containerPlugin);
```

---

### 4. Add updateState to IFileRepository Interface

**File**: `api/src/core/types/repositories.ts`

Add to `IFileRepository` interface:
```typescript
updateState(id: string, state: string, userId: string): Promise<File>;
```

### 5. Implement updateState in FileRepository

**File**: `api/src/infrastructure/database/repositories/FileRepository.ts`

Add method:
```typescript
async updateState(id: string, state: string, userId: string): Promise<File> {
  const { data, error } = await this.supabase
    .from('files')
    .update({
      state,
      state_changed_at: new Date().toISOString(),
      state_changed_by: userId,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq('id', id)
    .eq('org_id', this.orgId)
    .select()
    .single();

  if (error) throw error;
  return mapFileRowToEntity(data);
}
```

### 6. Complete FileService.updateState

**File**: `api/src/services/FileService.ts`

Replace the placeholder at line ~237 with actual repository call:
```typescript
const updated = await this.fileRepo.updateState(fileId, newState, userId);
```

And update the return to use `updated` instead of the spread placeholder.

### 7. Add getStatus to VaultService

**File**: `api/src/services/VaultService.ts`

Add method (requires Supabase client or a new repository method):
```typescript
async getStatus(vaultId: string, userId: string, supabase: SupabaseClient): Promise<Result<VaultStatus, AppError>> {
  const { data: files, error } = await supabase
    .from('files')
    .select('state, checked_out_by')
    .eq('vault_id', vaultId)
    .is('deleted_at', null);

  if (error) throw error;

  const status: VaultStatus = {
    total: files?.length || 0,
    checkedOut: files?.filter(f => f.checked_out_by).length || 0,
    checkedOutByMe: files?.filter(f => f.checked_out_by === userId).length || 0,
    byState: {},
  };

  for (const file of files || []) {
    const state = file.state || 'not_tracked';
    status.byState[state] = (status.byState[state] || 0) + 1;
  }

  return ok(status);
}
```

Note: This method takes supabase as a parameter since VaultService doesn't have direct file access. Alternatively, inject FileRepository or create a dedicated query.

---

## Verification

Run TypeScript check:
```bash
cd api; npx tsc --noEmit
```

Test that container is available on authenticated requests by adding a temporary log in a route.

---

## Completion Signal

When complete, notify that Agents B and C can begin. The container plugin must be registered and working before route integration can proceed.
