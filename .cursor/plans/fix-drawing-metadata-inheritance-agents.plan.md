# Fix SOLIDWORKS Drawing Metadata Inheritance Multi-Agent Plan

## Objective

Resolve missing BR number/description/revision on SOLIDWORKS drawings by capturing drawing→model references, resolving PRP formulas from the referenced model, and syncing drawing metadata without overwriting drawings as the source of truth.

## Agent Overview

| Agent | Responsibility | Owns | Dependencies |
|-------|---------------|------|--------------|
| Agent 1 | TypeScript sync + references + logging | `src/lib/commands/handlers/*` | None |
| Agent 2 | SolidWorks service PRP resolution | `solidworks-service/BluePLM.SolidWorksService/DocumentManagerAPI.cs` | None |

## Shared Files

| File | Owner | Rule |
|------|-------|------|
| None | — | No shared file edits expected |

---

## Agent 1: TS Metadata + References

### Prompt

> Implement drawing metadata inheritance and reference extraction for BluePLM with enterprise-level code quality.
>
> **Scope:**
> - Add drawing support to reference extraction in [`src/lib/commands/handlers/sync.ts`](bluePLM/src/lib/commands/handlers/sync.ts), [`src/lib/commands/handlers/checkin.ts`](bluePLM/src/lib/commands/handlers/checkin.ts), and [`src/lib/commands/handlers/extractReferences.ts`](bluePLM/src/lib/commands/handlers/extractReferences.ts)
> - Update drawing metadata extraction in [`src/lib/commands/handlers/sync.ts`](bluePLM/src/lib/commands/handlers/sync.ts) to resolve PRP by reading the **first referenced model**
> - Add logging for: PRP detection, parent reference chosen, missing parent, and inheritance outcome
> - Ensure drawings remain source of truth (do not push DB values back into drawings)
> - Document backfill path via **Sync SW Metadata** for existing drawings
>
> **Boundaries:**
> - OWNS: `src/lib/commands/handlers/sync.ts`, `src/lib/commands/handlers/checkin.ts`, `src/lib/commands/handlers/extractReferences.ts`, `src/lib/commands/handlers/syncSwMetadata.ts`
> - Do NOT modify: `solidworks-service/*`, database schema files
>
> **Quality Requirements:**
> - Enterprise-level code quality and organization
> - Proper TypeScript types (no `any`)
> - Error handling and edge cases covered (missing parent, DM unavailable)
> - Clean, readable, documented code
>
> **Deliverables:**
> - Updated TS logic for drawing metadata and references
> - Logs that allow debugging inheritance behavior
> - Report in `AGENT1_REPORT.md`
>
> **When complete:** Run `npm run typecheck` and report results.

### Boundary

- **OWNS (exclusive write):** `src/lib/commands/handlers/sync.ts`, `src/lib/commands/handlers/checkin.ts`, `src/lib/commands/handlers/extractReferences.ts`, `src/lib/commands/handlers/syncSwMetadata.ts`
- **READS (no modify):** `solidworks-service/BluePLM.SolidWorksService/DocumentManagerAPI.cs`

### Tasks

- [ ] Add `.slddrw` to reference extraction paths (sync/check-in/extractReferences)
- [ ] Implement drawing metadata inheritance via first referenced model
- [ ] Add logging for PRP detection + parent resolution + missing parent
- [ ] Ensure Sync SW Metadata updates existing drawings without pushing DB → file

### Deliverables

- TS changes merged with clear logging and safe fallbacks

---

## Agent 2: SolidWorks Service PRP Resolution

### Prompt

> Implement drawing PRP resolution in the SolidWorks Document Manager service with enterprise-level code quality.
>
> **Scope:**
> - Update [`solidworks-service/BluePLM.SolidWorksService/DocumentManagerAPI.cs`](bluePLM/solidworks-service/BluePLM.SolidWorksService/DocumentManagerAPI.cs) to call `ReadDrawingReferencedModelProperties` when drawing properties are empty or PRP references are detected
> - Use the **first referenced model** for deterministic inheritance
> - Add concise diagnostic logging for the resolution path and missing parent
>
> **Boundaries:**
> - OWNS: `solidworks-service/BluePLM.SolidWorksService/DocumentManagerAPI.cs`
> - Do NOT modify: any TypeScript files
>
> **Quality Requirements:**
> - Enterprise-level code quality and organization
> - Error handling and edge cases covered
> - Clean, readable, documented code
>
> **Deliverables:**
> - Updated C# service with drawing PRP resolution
> - Report in `AGENT2_REPORT.md`

### Boundary

- **OWNS (exclusive write):** `solidworks-service/BluePLM.SolidWorksService/DocumentManagerAPI.cs`
- **READS (no modify):** `src/lib/commands/handlers/*`

### Tasks

- [ ] Detect PRP refs or empty drawing properties in `GetCustomProperties`
- [ ] Resolve via `ReadDrawingReferencedModelProperties` using first reference
- [ ] Log resolution path and missing parent scenarios

### Deliverables

- C# service enhancement for drawing property resolution

---

## Verification Checklist (Cross-Agent)

- [ ] Create new part, assign BR number, description, revision
- [ ] Check in part
- [ ] Create drawing from part in SOLIDWORKS
- [ ] Sync drawing to bluePLM
- [ ] Verify drawing shows BR number, description, revision in file browser
- [ ] Verify drawing shows metadata in details panel
- [ ] Check `file_references` table has drawing→part relationship
- [ ] Run Sync SW Metadata on an existing drawing and confirm DB updates
- [ ] Test missing parent model (drawing references unsynced file) and confirm logs + no overwrite