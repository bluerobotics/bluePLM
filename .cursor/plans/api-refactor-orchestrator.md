# API Enterprise Refactor - Orchestrator

## Overview

This plan coordinates the enterprise-grade refactorization of the BluePLM REST API. The work is divided into 5 phases that should be executed sequentially.

---

## Execution Order

| Phase | Plan File | Focus Area | Directories |
|-------|-----------|------------|-------------|
| 1 | `api-refactor-agent1-core-foundation.md` | Types, errors, config | `api/src/core/`, `api/src/config/` |
| 2 | `api-refactor-agent2-repositories.md` | Repository layer | `api/src/infrastructure/database/` |
| 3 | `api-refactor-agent3-services.md` | Service layer | `api/src/services/` |
| 4 | `api-refactor-agent4-http-layer.md` | Routes, schemas, plugins | `api/src/http/` |
| 5 | `api-refactor-agent5-production.md` | External clients, logging, tests | `api/src/infrastructure/external/`, `api/tests/` |

---

## Phase Dependencies

```
Phase 1 (Core)
    │
    ├──► Phase 2 (Repositories) ──► Phase 3 (Services) ──► Phase 4 (HTTP)
    │
    └──► Phase 5 (External/Production)
```

- **Phase 1 must complete first** - it creates interfaces that all other phases depend on
- **Phases 2 and 5 can run in parallel** after Phase 1
- **Phase 3 depends on Phase 2** (services use repositories)
- **Phase 4 depends on Phase 3** (routes use services)

---

## Quick Start

1. Read the Phase 1 plan: `api-refactor-agent1-core-foundation.md`
2. Execute Phase 1 tasks
3. Commit: `git commit -m "refactor(api): add core types, errors, and config"`
4. Proceed to Phase 2, etc.

---

## New Directory Structure

After all phases complete:

```
api/
├── src/
│   ├── app.ts                    # Application factory
│   ├── server.ts                 # Entry point (simplified)
│   ├── config/                   # Phase 1
│   │   ├── index.ts
│   │   ├── env.ts
│   │   └── supabase.ts
│   ├── core/                     # Phase 1
│   │   ├── errors/
│   │   ├── types/
│   │   └── result.ts
│   ├── infrastructure/
│   │   ├── database/             # Phase 2
│   │   │   ├── repositories/
│   │   │   └── mappers/
│   │   ├── external/             # Phase 5
│   │   │   ├── OdooClient.ts
│   │   │   └── WooCommerceClient.ts
│   │   ├── logging/              # Phase 5
│   │   └── storage/              # Phase 5
│   ├── services/                 # Phase 3
│   │   ├── FileService.ts
│   │   ├── VaultService.ts
│   │   └── ...
│   └── http/                     # Phase 4
│       ├── plugins/
│       ├── routes/
│       └── schemas/
├── tests/                        # Phase 5
│   ├── unit/
│   └── integration/
└── package.json                  # Add zod, vitest, @sinclair/typebox
```

---

## Commit Strategy

Make atomic commits after each major task:

```
refactor(api): add core types and interfaces (Phase 1)
refactor(api): add error classes and error codes (Phase 1)
refactor(api): add config validation with zod (Phase 1)
refactor(api): add base repository and mappers (Phase 2)
refactor(api): add file and vault repositories (Phase 2)
refactor(api): add webhook repository (database-backed) (Phase 2)
refactor(api): add file service with business logic (Phase 3)
refactor(api): add auth and webhook services (Phase 3)
refactor(api): add request context and error handler plugins (Phase 4)
refactor(api): migrate file routes to thin handlers (Phase 4)
refactor(api): add circuit breaker for external services (Phase 5)
refactor(api): add health checks and graceful shutdown (Phase 5)
```

---

## Success Criteria

- [ ] All new code in `api/src/` (not modifying legacy `api/` files until migration complete)
- [ ] No `console.log` in production code
- [ ] All services return `Result<T, E>` types
- [ ] Routes are thin controllers delegating to services
- [ ] Webhooks stored in database (not in-memory Map)
- [ ] Complete OpenAPI schemas for all endpoints
- [ ] Health check verifies database connectivity
