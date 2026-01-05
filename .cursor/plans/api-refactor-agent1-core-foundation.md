# Phase 1: Core Foundation (Continued)

## Status

**Completed:**
- ✅ Zod dependency added
- ✅ Environment validation (`api/src/config/env.ts`)
- ✅ Error codes enum (`api/src/core/errors/ErrorCodes.ts`)
- ✅ AppError base class (`api/src/core/errors/AppError.ts`)
- ✅ HTTP error classes (`api/src/core/errors/HttpErrors.ts`)
- ✅ Result type utility (`api/src/core/result.ts`)
- ✅ Core entities: User, File, Vault, Webhook (`api/src/core/types/entities.ts`)
- ✅ Repository interfaces (`api/src/core/types/repositories.ts`)
- ✅ All barrel exports

**Remaining:**
- ❌ Centralized error handler plugin
- ❌ Request context plugin
- ❌ Supplier and PartSupplier entities
- ❌ Supabase client factory (optional, can stay in existing config.ts)

---

## Remaining Tasks

### 1. Add Supplier Entity Types

Add to `api/src/core/types/entities.ts`:

```typescript
// Add after the Webhook interface

export interface Supplier {
  id: string;
  orgId: string;
  name: string;
  code: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string;
  paymentTerms: string | null;
  defaultLeadTimeDays: number | null;
  minOrderValue: number | null;
  currency: string;
  shippingAccount: string | null;
  isActive: boolean;
  isApproved: boolean;
  notes: string | null;
  erpId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PriceBreak {
  qty: number;
  price: number;
}

export interface PartSupplier {
  id: string;
  orgId: string;
  fileId: string;
  supplierId: string;
  supplierPartNumber: string | null;
  supplierDescription: string | null;
  supplierUrl: string | null;
  unitPrice: number | null;
  currency: string;
  priceUnit: string;
  priceBreaks: PriceBreak[];
  minOrderQty: number;
  orderMultiple: number;
  leadTimeDays: number | null;
  isPreferred: boolean;
  isActive: boolean;
  isQualified: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

### 2. Create Centralized Error Handler Plugin

Create `api/src/core/plugins/errorHandler.ts`:

```typescript
import { FastifyInstance, FastifyError } from 'fastify';
import fp from 'fastify-plugin';
import { AppError } from '../errors/AppError';
import { ErrorCode } from '../errors/ErrorCodes';

async function errorHandlerPlugin(fastify: FastifyInstance) {
  fastify.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    // Handle our custom AppError
    if (error instanceof AppError) {
      request.log.warn({ err: error, code: error.code }, error.message);
      return reply.status(error.statusCode).send(error.toJSON());
    }

    // Handle Fastify validation errors
    if (error.validation) {
      request.log.warn({ err: error }, 'Validation error');
      return reply.status(400).send({
        error: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        details: error.validation,
      });
    }

    // Handle rate limit errors
    if (error.statusCode === 429) {
      return reply.status(429).send({
        error: 'RATE_LIMIT_EXCEEDED',
        message: error.message || 'Too many requests',
      });
    }

    // Log unexpected errors
    request.log.error({ err: error }, 'Unhandled error');

    // Don't expose internal errors in production
    const isDev = process.env.NODE_ENV !== 'production';
    return reply.status(error.statusCode || 500).send({
      error: ErrorCode.INTERNAL_ERROR,
      message: isDev ? error.message : 'Internal server error',
      ...(isDev && { stack: error.stack }),
    });
  });
}

export default fp(errorHandlerPlugin, {
  name: 'error-handler',
});
```

### 3. Create Request Context Plugin

Create `api/src/core/plugins/requestContext.ts`:

```typescript
import { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { randomUUID } from 'crypto';

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
    startTime: number;
  }
}

async function requestContextPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest('requestId', '');
  fastify.decorateRequest('startTime', 0);

  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    // Use existing request id header or generate one
    request.requestId = (request.headers['x-request-id'] as string) || randomUUID();
    request.startTime = Date.now();

    // Add to log context
    request.log = request.log.child({ requestId: request.requestId });
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const duration = Date.now() - request.startTime;
    request.log.info(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        durationMs: duration,
      },
      'Request completed'
    );
  });
}

export default fp(requestContextPlugin, {
  name: 'request-context',
});
```

### 4. Create Plugins Barrel Export

Create `api/src/core/plugins/index.ts`:

```typescript
export { default as errorHandlerPlugin } from './errorHandler';
export { default as requestContextPlugin } from './requestContext';
```

### 5. Update Core Barrel Export

Update `api/src/core/index.ts`:

```typescript
export * from './errors';
export * from './types';
export * from './result';
export * from './plugins';
```

### 6. Add fastify-plugin Dependency

```bash
cd api
npm install fastify-plugin
```

---

## Updated Directory Structure

After completion, the structure should be:

```
api/src/
├── config/
│   ├── index.ts              ✅
│   └── env.ts                ✅
│
└── core/
    ├── index.ts              ✅ (update to include plugins)
    ├── result.ts             ✅
    ├── errors/
    │   ├── index.ts          ✅
    │   ├── AppError.ts       ✅
    │   ├── HttpErrors.ts     ✅
    │   └── ErrorCodes.ts     ✅
    ├── plugins/
    │   ├── index.ts          ❌ NEW
    │   ├── errorHandler.ts   ❌ NEW
    │   └── requestContext.ts ❌ NEW
    └── types/
        ├── index.ts          ✅
        ├── entities.ts       ✅ (add Supplier, PartSupplier)
        └── repositories.ts   ✅
```

---

## Completion Criteria

- [ ] Supplier and PartSupplier entities added
- [ ] `fastify-plugin` added to dependencies
- [ ] Error handler plugin created and exported
- [ ] Request context plugin created and exported
- [ ] All barrel exports updated
- [ ] No TypeScript errors: `npx tsc --noEmit`
- [ ] Commit: `git commit -m "refactor(api): add error handler and request context plugins"`
