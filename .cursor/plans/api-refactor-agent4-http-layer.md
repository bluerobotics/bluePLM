# Phase 4: HTTP Layer

## Overview

Refactor the HTTP layer - routes become thin controllers that delegate to services. Add request context, centralized error handling, and complete OpenAPI schemas.

**Depends on:** Phase 3 (Services)  
**Directories:** `api/src/http/`

---

## Directory Structure to Create

```
api/src/http/
├── index.ts
├── plugins/
│   ├── index.ts
│   ├── auth.plugin.ts
│   ├── requestContext.plugin.ts
│   └── errorHandler.plugin.ts
├── schemas/
│   ├── index.ts
│   ├── common.schema.ts
│   ├── file.schema.ts
│   ├── vault.schema.ts
│   └── webhook.schema.ts
└── routes/
    ├── index.ts
    ├── health.routes.ts
    ├── auth.routes.ts
    ├── files.routes.ts
    ├── vaults.routes.ts
    ├── parts.routes.ts
    ├── suppliers.routes.ts
    ├── trash.routes.ts
    ├── activity.routes.ts
    ├── webhooks.routes.ts
    └── integrations/
        ├── odoo.routes.ts
        └── woocommerce.routes.ts
```

---

## Tasks

### 1. Add TypeBox for Schemas

```bash
npm install @sinclair/typebox
```

### 2. Request Context Plugin

Create `api/src/http/plugins/requestContext.plugin.ts`:

```typescript
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import crypto from 'crypto';

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
    startTime: number;
  }
}

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest('requestId', '');
  fastify.decorateRequest('startTime', 0);

  fastify.addHook('onRequest', async (request) => {
    request.requestId = (request.headers['x-request-id'] as string) || crypto.randomUUID();
    request.startTime = Date.now();
  });

  fastify.addHook('onSend', async (request, reply) => {
    reply.header('X-Request-ID', request.requestId);
    reply.header('X-Response-Time', `${Date.now() - request.startTime}ms`);
  });
};

export default fp(plugin, { name: 'request-context' });
```

### 3. Error Handler Plugin

Create `api/src/http/plugins/errorHandler.plugin.ts`:

```typescript
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { AppError } from '../../core/errors/AppError';
import { ErrorCode } from '../../core/errors/ErrorCodes';

declare module 'fastify' {
  interface FastifyReply {
    sendError(error: AppError): void;
  }
}

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateReply('sendError', function(error: AppError) {
    return this.code(error.statusCode).send(error.toJSON());
  });

  fastify.setErrorHandler((error, request, reply) => {
    request.log.error({ requestId: request.requestId, error: error.message });

    if (error instanceof AppError) {
      return reply.code(error.statusCode).send(error.toJSON());
    }

    if ((error as any).validation) {
      return reply.code(400).send({
        error: ErrorCode.VALIDATION_ERROR,
        message: error.message,
        details: (error as any).validation,
      });
    }

    const statusCode = (error as any).statusCode || 500;
    return reply.code(statusCode).send({
      error: statusCode >= 500 ? ErrorCode.INTERNAL_ERROR : 'ERROR',
      message: statusCode >= 500 ? 'Internal server error' : error.message,
    });
  });

  fastify.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      error: ErrorCode.NOT_FOUND,
      message: `Route ${request.method} ${request.url} not found`,
    });
  });
};

export default fp(plugin, { name: 'error-handler' });
```

### 4. Auth Plugin (Refactored - No console.log)

Create `api/src/http/plugins/auth.plugin.ts`:

```typescript
import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import type { User } from '../../core/types/entities';
import { UnauthorizedError } from '../../core/errors';

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
    accessToken: string | null;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest('user', null);
  fastify.decorateRequest('accessToken', null);

  fastify.decorate('authenticate', async function(request: FastifyRequest, reply: FastifyReply) {
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid Authorization header');
    }

    const token = authHeader.substring(7);
    if (!token || token === 'undefined' || token === 'null') {
      throw new UnauthorizedError('Invalid access token');
    }

    // Validate with AuthService (injected via container)
    const authService = fastify.container.authService;
    const result = await authService.validateToken(token);

    if (!result.ok) throw result.error;

    request.user = result.value;
    request.accessToken = token;

    request.log.info({ userId: result.value.id }, 'User authenticated');
  });
};

export default fp(plugin, { name: 'auth' });
```

### 5. Thin Route Handlers

Create `api/src/http/routes/files.routes.ts`:

```typescript
import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';

const FileIdParams = Type.Object({ id: Type.String({ format: 'uuid' }) });
const CheckoutBody = Type.Object({ message: Type.Optional(Type.String()) });

const filesRoutes: FastifyPluginAsync = async (fastify) => {
  const { fileService } = fastify.container;

  // GET /files/:id
  fastify.get<{ Params: { id: string } }>('/files/:id', {
    schema: {
      description: 'Get file by ID',
      tags: ['Files'],
      security: [{ bearerAuth: [] }],
      params: FileIdParams,
    },
    preHandler: fastify.authenticate,
  }, async (request, reply) => {
    const result = await fileService.getById(request.params.id);
    if (!result.ok) return reply.sendError(result.error);
    return { file: mapToResponse(result.value) };
  });

  // POST /files/:id/checkout
  fastify.post<{ Params: { id: string }; Body: { message?: string } }>('/files/:id/checkout', {
    schema: {
      description: 'Check out a file',
      tags: ['Files'],
      security: [{ bearerAuth: [] }],
      params: FileIdParams,
      body: CheckoutBody,
    },
    preHandler: fastify.authenticate,
  }, async (request, reply) => {
    const result = await fileService.checkout(
      request.params.id,
      request.user!.id,
      request.body.message
    );
    if (!result.ok) return reply.sendError(result.error);
    return { success: true, file: mapToResponse(result.value) };
  });

  // ... more routes following same pattern
};

function mapToResponse(file: File) {
  return {
    id: file.id,
    file_path: file.filePath,
    file_name: file.fileName,
    // ... map camelCase to snake_case for API response
  };
}

export default filesRoutes;
```

### 6. Other Routes

Migrate all existing routes to thin handlers:
- `health.routes.ts`
- `auth.routes.ts`
- `vaults.routes.ts`
- `parts.routes.ts`
- `suppliers.routes.ts`
- `trash.routes.ts`
- `activity.routes.ts`
- `webhooks.routes.ts`
- `integrations/odoo.routes.ts`
- `integrations/woocommerce.routes.ts`

---

## Completion Criteria

- [ ] Request context adds X-Request-ID to all responses
- [ ] Error handler catches all errors consistently
- [ ] No `console.log` anywhere
- [ ] Routes are thin - delegate to services
- [ ] Complete OpenAPI schemas
- [ ] Commit: `git commit -m "refactor(api): add HTTP layer with thin routes"`
