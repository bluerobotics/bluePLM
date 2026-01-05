# Phase 5: Production Hardening

## Overview

Add external service resilience (circuit breakers), structured logging, health checks with dependencies, graceful shutdown, and testing infrastructure.

**Depends on:** Phase 1 (Core)  
**Directories:** `api/src/infrastructure/external/`, `api/src/infrastructure/logging/`, `api/tests/`

---

## Directory Structure to Create

```
api/src/infrastructure/
├── external/
│   ├── index.ts
│   ├── CircuitBreaker.ts
│   ├── OdooClient.ts
│   └── WooCommerceClient.ts
├── logging/
│   ├── index.ts
│   └── Logger.ts
└── storage/
    └── StorageService.ts

api/tests/
├── setup.ts
├── fixtures/
└── unit/
    └── services/
```

---

## Tasks

### 1. Add Test Dependencies

```bash
npm install -D vitest @vitest/coverage-v8
```

### 2. Circuit Breaker

Create `api/src/infrastructure/external/CircuitBreaker.ts`:

```typescript
type State = 'closed' | 'open' | 'half-open';

export class CircuitBreaker {
  private state: State = 'closed';
  private failures = 0;
  private lastFailure: number | null = null;

  constructor(
    private readonly threshold = 5,
    private readonly resetTimeout = 30000
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure! > this.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure() {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }
}
```

### 3. Odoo Client with Resilience

Create `api/src/infrastructure/external/OdooClient.ts`:

```typescript
import { CircuitBreaker } from './CircuitBreaker';
import { AppError } from '../../core/errors/AppError';
import { ErrorCode } from '../../core/errors/ErrorCodes';

export class OdooClient {
  private readonly circuitBreaker = new CircuitBreaker(3, 60000);

  constructor(
    private readonly url: string,
    private readonly database: string,
    private readonly username: string,
    private readonly apiKey: string
  ) {}

  async testConnection() {
    return this.circuitBreaker.execute(async () => {
      const version = await this.xmlRpc('common', 'version', []);
      const uid = await this.xmlRpc('common', 'authenticate', [
        this.database, this.username, this.apiKey, {}
      ]);

      if (!uid) {
        throw new AppError(ErrorCode.ODOO_CONNECTION_FAILED, 'Invalid credentials', 502);
      }

      return { uid, version: version?.server_version };
    });
  }

  async fetchSuppliers() {
    return this.circuitBreaker.execute(async () => {
      // Implementation
    });
  }

  private async xmlRpc(service: string, method: string, params: unknown[]) {
    const response = await fetch(`${this.url}/xmlrpc/2/${service}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: this.buildRequest(method, params),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return this.parseResponse(await response.text());
  }

  private buildRequest(method: string, params: unknown[]): string {
    // Move XML-RPC logic from existing utils/odoo.ts
  }

  private parseResponse(xml: string): unknown {
    // Move parsing logic from existing utils/odoo.ts
  }
}
```

### 4. Health Check with Dependencies

Update health route:

```typescript
fastify.get('/health', async () => {
  const dbCheck = await checkDatabase();
  const allHealthy = dbCheck.status === 'healthy';

  return {
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version: env.API_VERSION,
    checks: { database: dbCheck },
  };
});

async function checkDatabase() {
  try {
    const start = Date.now();
    await supabase.from('organizations').select('id').limit(1);
    return { status: 'healthy', latencyMs: Date.now() - start };
  } catch {
    return { status: 'unhealthy' };
  }
}
```

### 5. Graceful Shutdown

In `api/src/server.ts`:

```typescript
const shutdown = async (signal: string) => {
  fastify.log.info({ signal }, 'Shutdown signal received');
  await fastify.close();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

### 6. Test Setup

Create `api/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

Create `api/tests/setup.ts`:

```typescript
import { beforeAll, afterAll } from 'vitest';

beforeAll(async () => {
  // Setup
});

afterAll(async () => {
  // Cleanup
});
```

---

## Completion Criteria

- [ ] CircuitBreaker implemented
- [ ] OdooClient and WooCommerceClient use circuit breaker
- [ ] Health check tests database connectivity
- [ ] Graceful shutdown implemented
- [ ] Vitest configured
- [ ] `vitest` added to devDependencies
- [ ] Commit: `git commit -m "refactor(api): add production hardening"`
