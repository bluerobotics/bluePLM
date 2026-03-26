---
name: Code Style Audit
overview: A comprehensive audit of the bluePLM codebase identifying the most impactful consistency violations and industry best practice gaps, ranked by severity.
todos:
  - id: eslint-prettier
    content: Add ESLint (flat config) + Prettier with shared config, normalize codebase formatting
    status: completed
  - id: consolidate-types
    content: Consolidate duplicate type definitions (ECO, Supplier, OrgUser, LocalFileInfo) into canonical locations
    status: completed
  - id: api-error-format
    content: Standardize API error response format and extract shared sendError utility
    status: completed
  - id: zustand-selectors
    content: Replace whole-store usePDMStore() destructuring with selective selectors + useShallow
    status: completed
  - id: split-large-files
    content: Incrementally split oversized files (FilePane, useLoadFiles, DetailsPanel, stores/types.ts)
    status: completed
  - id: stale-docs
    content: Clean up stale WooCommerce references and outdated README version numbers
    status: completed
  - id: create-style-rule
    content: Create .cursor/rules/style.mdc (alwaysApply) with consolidated style/consistency rules
    status: completed
  - id: fix-react-rule
    content: Fix react.mdc "Default export" rule to say "Named export" to match codebase reality
    status: completed
  - id: reduce-any
    content: Address highest-impact any usages at Supabase/Electron boundaries
    status: completed
isProject: false
---

# Code Style and Consistency Audit

## Critical: No Automated Style Enforcement

The codebase has **no ESLint** and **no Prettier** configured. TypeScript strict mode is the only guardrail. This is the root cause of most consistency issues below -- without automated enforcement, style drift is inevitable.

- No `.eslintrc*` or `eslint.config.*`
- No `.prettierrc` or `prettier.config.*`
- No `eslint` or `prettier` in dependencies
- `.vscode/` is gitignored, so editor settings aren't shared
- Residual `// eslint-disable-next-line` comments exist in code (suggesting it was once configured or planned)

**Recommendation:** Add ESLint (flat config) + Prettier with a shared config. Run `prettier --write` once to normalize, then enforce via pre-commit hook or CI.

---

## High Severity

### 1. Duplicate Type Definitions (DRY violation)

The same domain entities are defined multiple times with overlapping but divergent shapes:

- `**ECO`**: defined as `Tables<'ecos'>` in [src/types/database.ts](src/types/database.ts), as `interface ECO` with extra fields in [src/stores/types.ts](src/stores/types.ts) (~~line 1060), and again as a minimal `interface ECO` in [src/features/source/context-menu/types.ts](src/features/source/context-menu/types.ts) (~~line 161)
- `**Supplier`**: `Tables<'suppliers'>` in `database.ts` vs `interface Supplier` in `stores/types.ts` (~line 1099)
- `**OrgUser`**: defined in at least 6 files with different shapes (`full_name` optional vs required, different field sets)
- `**LocalFileInfo**`: duplicated identically in [electron/preload.ts](electron/preload.ts) (~~line 34) and [electron/handlers/fs.ts](electron/handlers/fs.ts) (~~line 45)

**Recommendation:** Canonical types should live in `src/types/`. Feature code should use `Pick<>`, `Omit<>`, or `&` to narrow/extend rather than redefining.

### 2. Zustand Store Usage Inconsistency

The project rule ([.cursor/rules/zustand.mdc](.cursor/rules/zustand.mdc)) says to use selective selectors, never the whole store. In practice:

- **Good pattern** in `FilePane.tsx`: uses `useShallow` with granular selectors
- **Bad pattern** in many files: `const { a, b, c, ... } = usePDMStore()` (subscribes to entire store, causes excess re-renders)
  - `useAuth.ts` lines 40-50
  - `TrashView.tsx` line 30
  - `DetailsPanel.tsx` lines 122-140
  - `useLoadFiles.ts` lines 23-36
  - `IntegrationsView.tsx` lines 96, 496

**Recommendation:** Systematically replace whole-store destructuring with `usePDMStore(useShallow(s => ({ ... })))` or individual selectors.

### 3. `stores/types.ts` God File (~1876 lines)

This single file mixes:

- Slice interface contracts
- UI types
- Domain models (`ECO`, `Supplier`, `PartSupplier`)
- Re-exports

**Recommendation:** Extract domain models to `src/types/`, keep only slice interfaces in `stores/types.ts`.

### 4. API Error Response Format Inconsistency

Two conflicting error vocabularies:

- **Global error handler** (`api/src/core/plugins/errorHandler.ts`): uses `SCREAMING_SNAKE` codes (`VALIDATION_ERROR`, `RATE_LIMIT_EXCEEDED`, `INTERNAL_ERROR`)
- **Route-level responses**: uses human-readable strings (`'Not found'`, `'Unauthorized'`, `'Forbidden'`, `'Not Found'` -- note the casing inconsistency too)
- **Rate limiter** (`server.ts`): uses `'Too Many Requests'`

API consumers cannot reliably pattern-match on error codes.

**Recommendation:** Standardize on a single error enum/union (e.g., `SCREAMING_SNAKE` codes). Create a shared `sendErrorResponse(reply, code, statusCode, message?)` utility.

### 5. `sendError` Helper Duplicated 4x

Nearly identical helper copy-pasted across:

- `api/routes/auth.ts` (lines 16-18)
- `api/routes/files.ts` (lines 14-16)
- `api/routes/suppliers.ts` (lines 11-13)
- `api/routes/integrations/odoo.ts` (lines 10-13, slightly different signature)

**Recommendation:** Extract to a single shared utility in `api/src/` or `api/utils/`.

### 6. Very Large Files

Several files far exceed reasonable component/module size:


| File                                           | Lines |
| ---------------------------------------------- | ----- |
| `src/features/source/browser/FilePane.tsx`     | ~1900 |
| `src/stores/types.ts`                          | ~1876 |
| `src/hooks/useLoadFiles.ts`                    | ~1760 |
| `src/features/source/details/DetailsPanel.tsx` | ~1307 |
| `src/features/source/trash/TrashView.tsx`      | ~1227 |
| `src/app/App.tsx`                              | ~898  |


**Recommendation:** Incrementally extract subcomponents, sub-hooks, and type groupings. `FilePane.tsx` already has good internal structure that could be split into separate files.

---

## Medium Severity

### 7. Named vs Default Export Mismatch

The project rule in `.cursor/rules/react.mdc` says **"Default export, one component per file"**, but the vast majority of feature code uses **named exports** (`export function FooView`). Only a few files use `export default` (`App.tsx`, `ErrorBoundary.tsx`, some SolidWorks components).

**Recommendation:** Update the rule to match reality (named exports), or migrate code to match the rule. Named exports are generally the industry recommendation (better tree-shaking, refactor-friendly, explicit).

### 8. Scattered `any` Usage

Concentrated at boundary layers but still problematic:

- `useAuth.ts`: `(profile as any)`, `(org as any)`, `setOrganization(org as any)`
- `TrashView.tsx`: `fullFileData: any`
- `useRealtimeSubscriptions.ts`: `pdmData: any`
- `SolidWorksPanel.tsx`: `(result.data as any)`
- `api/routes/suppliers.ts`: multiple `any` in map/filter callbacks
- Various `lib/` files: `mutations.ts`, `backup.ts`, `fileOps.ts`

**Recommendation:** Address the highest-traffic ones first. For Supabase/Electron boundaries, create typed wrappers.

### 9. Semicolon Inconsistency in API

- `api/src/core/plugins/errorHandler.ts` and `api/src/config/env.ts` use semicolons
- Most route files omit semicolons

**Recommendation:** Prettier would fix this instantly. Standardize on one style.

### 10. Magic Numbers Not Centralized

- `useAuth.ts`: `90000` ms connection timeout
- `useRealtimeSubscriptions.ts`: `500` ms notification batch, `100` ms location flush
- `SolidWorksPanel.tsx`: `5000` ms poll interval
- `api/server.ts`: `104857600` body limit
- `api/utils/webhooks.ts`: `10000` ms abort timeout

**Recommendation:** Extract to named constants, either in a shared `constants/` file or co-located with their usage.

### 11. Stale Documentation / Comments

- `api/routes/index.ts` line 45: still references "WooCommerce" (removed)
- `supabase/modules/README.md`: still lists WooCommerce under `40-integrations.sql`
- `README.md`: lists Electron 34 while `package.json` has Electron 39

### 12. API Version Loading Duplicated

Both `api/server.ts` (lines 51-53) and `api/routes/health.ts` (lines 18-21) independently read `package.json` and parse the version.

**Recommendation:** Load once in server bootstrap, pass via Fastify decorator or config.

---

## Low Severity

### 13. Inline Styles Despite "Tailwind Only" Rule

Multiple components use `style={{ }}` for dynamic layout (depths, positioning, runtime sizes). Some is unavoidable for dynamic values, but the rule should acknowledge this exception or the code should use Tailwind's arbitrary value syntax (`pl-[16px]`).

### 14. Catch Variable Naming

`err` vs `error` vs `e` used interchangeably across the API layer. Minor but contributes to inconsistency.

### 15. Empty Hydration Callback

`pdmStore.ts` lines 229-233: `onRehydrateStorage` has an empty `if (error) {} else {}` block -- dead code.

### 16. Extension Subsystem Logging

Extension code (`sandbox.ts`, `loader.ts`, `runtime.ts`) uses `console.warn`/`console.error` instead of the Pino logger used by the main app, leading to inconsistent log format in production.

---

## New: Style Rules File

Create [.cursor/rules/style.mdc](.cursor/rules/style.mdc) with `alwaysApply: true` covering:

- **Exports**: Named exports for components/utilities; default only for Fastify plugins
- **TypeScript**: No `any`, canonical types in `src/types/`, `interface` for shapes / `type` for unions
- **Naming**: PascalCase files for components, camelCase for utils/hooks, UPPER_SNAKE for constants, always `error` in catch bindings
- **Numbers/Strings**: Named constants for magic numbers, `t()` for user-facing strings
- **API layer**: SCREAMING_SNAKE error codes, shared `sendError`, no semicolons
- **Imports**: External, then `@/` aliases, then relative (blank line between groups)
- **General**: ~400 line max per file, no `console.log` in prod, prefer Tailwind over inline styles

Also fix [.cursor/rules/react.mdc](.cursor/rules/react.mdc) line 41: change "Default export" to "Named export" to match actual codebase convention.

---

## Recommended Priority Order

1. **Create style.mdc + fix react.mdc** -- establishes the rules going forward
2. **Add ESLint + Prettier** -- prevents all future style drift, fixes semicolons/formatting instantly
3. **Consolidate duplicate types** -- reduces bugs from type drift
4. **Standardize API error responses** -- improves API contract reliability
5. **Extract `sendError` to shared utility** -- quick DRY win
6. **Fix Zustand whole-store subscriptions** -- improves runtime performance
7. **Split large files** -- improves maintainability (do incrementally)
8. **Update stale docs** -- quick cleanup
9. **Address `any` at boundaries** -- improves type safety over time

