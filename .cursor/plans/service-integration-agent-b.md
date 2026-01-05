# Agent B: Core Route Integration

## Overview

Integrate the core routes (files, auth, webhooks) with their respective services. These are the most critical routes with significant business logic.

**Depends on**: Agent A (container plugin must be registered)
**Directory**: `api/src/http/routes/`

---

## Tasks

### 1. Files Routes Integration

**File**: `api/src/http/routes/files.routes.ts`

#### Endpoints to integrate with FileService:

**POST /files/:id/checkout** (lines ~135-195)
```typescript
// Replace inline logic with:
const result = await request.container.fileService.checkout(
  id,
  request.user!.id,
  message
);
if (!result.ok) throw result.error;
return { success: true, file: result.value };
```

**POST /files/:id/checkin** (lines ~198-300)

Keep storage upload logic, but use service for business logic:
```typescript
// After computing contentHash from upload...
const result = await request.container.fileService.checkin(id, request.user!.id, {
  comment,
  contentHash: newHash,
  fileSize: binaryContent.length,
});
if (!result.ok) throw result.error;
return { success: true, file: result.value.file, contentChanged: result.value.contentChanged };
```

Note: The file_versions insert should move to FileService or FileRepository.

**POST /files/:id/undo-checkout** (lines ~303-345)
```typescript
const result = await request.container.fileService.undoCheckout(
  id,
  request.user!.id,
  request.user!.role
);
if (!result.ok) throw result.error;
return { success: true, file: result.value };
```

**DELETE /files/:id** (lines ~563-602)
```typescript
const result = await request.container.fileService.delete(
  id,
  request.user!.id,
  request.user!.email
);
if (!result.ok) throw result.error;
return { success: true };
```

**POST /files/:id/release** (lines ~646-699)
```typescript
const result = await request.container.fileService.updateState(
  id,
  request.user!.id,
  request.user!.email,
  'released'
);
if (!result.ok) throw result.error;
return { success: true, file: result.value.file, previous_state: result.value.previousState };
```

**POST /files/:id/obsolete** (lines ~703-745)
```typescript
const result = await request.container.fileService.updateState(
  id,
  request.user!.id,
  request.user!.email,
  'obsolete'
);
if (!result.ok) throw result.error;
return { success: true, file: result.value.file, previous_state: result.value.previousState };
```

#### Endpoints to KEEP as direct Supabase:
- `GET /files` - list query with filters
- `GET /files/:id` - single query with joins
- `POST /files/sync` - storage upload + upsert
- `GET /files/:id/download` - signed URL generation
- `GET /files/:id/versions` - simple query
- `PATCH /files/:id/metadata` - simple update (unless adding webhook)
- `GET /files/:id/drawing` - query + signed URL
- `GET /files/:id/upload-url` - signed upload URL

---

### 2. Auth Routes Integration

**File**: `api/src/http/routes/auth.routes.ts`

**POST /auth/login** (lines ~37-79)

Use `createAuthOnlyContainer()` since no orgId yet:
```typescript
import { createAuthOnlyContainer } from '../../infrastructure/container';

// In handler:
const { authService } = createAuthOnlyContainer();
const result = await authService.login(email, password);
if (!result.ok) throw result.error;

return {
  access_token: result.value.accessToken,
  refresh_token: result.value.refreshToken,
  expires_at: result.value.expiresAt,
  user: result.value.user,
};
```

**POST /auth/refresh** (lines ~83-116)
```typescript
const { authService } = createAuthOnlyContainer();
const result = await authService.refresh(refresh_token);
if (!result.ok) throw result.error;

return {
  access_token: result.value.accessToken,
  refresh_token: result.value.refreshToken,
  expires_at: result.value.expiresAt,
};
```

**POST /auth/invite** (lines ~119-201)
```typescript
const result = await request.container.authService.invite(
  {
    id: request.user!.id,
    email: request.user!.email,
    fullName: request.user!.full_name,
    role: request.user!.role,
    orgId: request.user!.org_id,
  },
  {
    email: body.email,
    fullName: body.full_name,
    teamIds: body.team_ids,
    vaultIds: body.vault_ids,
    workflowRoleIds: body.workflow_role_ids,
    notes: body.notes,
    resend: body.resend,
  }
);
if (!result.ok) throw result.error;

return {
  success: result.value.success,
  message: result.value.message,
  pending_member_id: result.value.pendingMemberId,
  org_code: result.value.orgCode,
  existing_user: result.value.existingUser,
};
```

---

### 3. Webhooks Routes Integration (CRITICAL)

**File**: `api/src/http/routes/webhooks.routes.ts`

**Remove the in-memory Map** at the top of the file (lines ~14-23).

**GET /webhooks**
```typescript
const webhooks = await request.container.webhookService.list(request.user!.org_id!);
return {
  webhooks: webhooks.map(w => ({
    id: w.id,
    url: w.url,
    events: w.events,
    active: w.active,
    created_at: w.createdAt.toISOString(),
  })),
};
```

**POST /webhooks**
```typescript
const result = await request.container.webhookService.create(
  request.user!.org_id!,
  request.user!.id,
  request.user!.role,
  { url, events }
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
```

**DELETE /webhooks/:id**
```typescript
const result = await request.container.webhookService.delete(id, request.user!.role);
if (!result.ok) throw result.error;
return { success: true };
```

**PATCH /webhooks/:id**
```typescript
const result = await request.container.webhookService.update(id, request.user!.role, updates);
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
```

---

## Verification

```bash
cd api; npx tsc --noEmit
```

Test key endpoints:
- Login → should return tokens
- Checkout a file → should work and trigger webhook
- Create webhook → should persist to database (not in-memory)

---

## Notes

- Keep error handling consistent: `if (!result.ok) throw result.error;`
- The centralized error handler plugin will convert AppError to HTTP responses
- Don't change response shapes - keep backwards compatibility
