# Agent 5 Report: Review Request Enhancements

## Summary

Enhanced the review request system with team-based selection, workflow-triggered reviews, and context menu improvements.

## Changes Made

### 1. Schema Changes (version 51 → 52)

| File | Change |
|---|---|
| `supabase/modules/10-source-files.sql` | Added `triggers_review BOOLEAN DEFAULT FALSE` column to `workflow_states` table + idempotent migration |
| `supabase/core.sql` | Bumped schema version INSERT from 51 to 52 |
| `src/lib/schemaVersion.ts` | Bumped `EXPECTED_SCHEMA_VERSION` to 52, added version 52 description |
| `src/types/supabase.ts` | Added `triggers_review` to workflow_states Row/Insert/Update types |

### 2. New File: `src/lib/supabase/reviews.ts`

Review trigger and team helpers:

- **`checkReviewTrigger(workflowStateId)`** — Queries `workflow_states` to check if `triggers_review` is true for a given state ID
- **`getOrgTeamsWithMembers(orgId)`** — Fetches all teams in an org with full member details (id, email, full_name, avatar_url), used by the enhanced ReviewRequestModal
- **Types exported:** `TeamMember`, `TeamWithMembers`

Re-exported from `src/lib/supabase/index.ts`.

### 3. Enhanced ReviewRequestModal

**File:** `src/features/source/browser/components/Modals/ReviewRequestModal.tsx`

Fully rewritten with backward-compatible props + new `organizationId` prop:

- **Two selection tabs:** "Individuals" (original checkbox list) and "Teams" (team cards with expand/collapse)
- **Team selection:** Clicking a team selects all its members as reviewers; toggling off removes them
- **Mixed selection:** Users can select some teams AND some individuals freely
- **Deduplication:** If a user appears in multiple selected teams or is also individually selected, they only count once in the "X reviewers selected" summary
- **Expandable team cards:** Each team row has a chevron to expand/collapse and see individual members with checkmarks
- **Reviewer count summary:** Shows "X reviewers selected" badge next to the section label
- **Internal team fetching:** Modal fetches teams via `getOrgTeamsWithMembers(organizationId)` on mount when `organizationId` is provided
- **Graceful fallback:** When `organizationId` is not provided, the Teams tab is hidden and the modal works exactly as before (individuals only)

### 4. Workflow-Triggered Reviews

- **`transitionFileState`** (`src/lib/supabase/files/versions.ts`) — Now returns `triggersReview: boolean` in its result, read from the target workflow state's `triggers_review` flag
- **`handleBulkStateChange`** (`src/features/source/browser/FilePane.tsx`) — After successfully changing files to `in_review` state, automatically opens the ReviewRequestModal for the first file so the user can immediately assign reviewers

### 5. Context Menu Enhancements

**File:** `src/features/source/browser/components/ContextMenu/actions/CollaborationActions.tsx`

- **"Request Review"** — Still present, now opens the enhanced modal with team support (via `organizationId` prop in FilePane)
- **"View Reviews"** — New menu item added directly below "Request Review", navigates to the Reviews Dashboard sidebar view (`setActiveView('reviews')`)
- Menu item count utility updated (`countMenuItems.ts`) to include the new "View Reviews" item

### 6. FilePane Integration

**File:** `src/features/source/browser/FilePane.tsx`

- Passes `organizationId={organization?.id}` to `ReviewRequestModal`
- `handleBulkStateChange` enhanced with workflow-triggered review logic

## Files Modified

| File | Type |
|---|---|
| `supabase/modules/10-source-files.sql` | Schema |
| `supabase/core.sql` | Schema version |
| `src/lib/schemaVersion.ts` | Version tracking |
| `src/types/supabase.ts` | Generated types |
| `src/lib/supabase/reviews.ts` | **New** — Review helpers |
| `src/lib/supabase/index.ts` | Barrel exports |
| `src/lib/supabase/files/versions.ts` | `transitionFileState` return type |
| `src/features/source/browser/components/Modals/ReviewRequestModal.tsx` | Enhanced modal |
| `src/features/source/browser/components/ContextMenu/actions/CollaborationActions.tsx` | View Reviews item |
| `src/features/source/browser/components/ContextMenu/utils/countMenuItems.ts` | Item count |
| `src/features/source/browser/FilePane.tsx` | organizationId prop + review trigger |

## Files NOT Modified (per boundaries)

- `src/lib/supabase/annotations.ts` (Agent 1)
- `src/features/source/reviews/*` (Agent 3)
- `src/stores/pdmStore.ts` (Agent 4)
- Comment/notification sidebar components (Agent 4)

## Typecheck Result

```
npm run typecheck → 0 errors
```

## Quality Notes

- All TypeScript types are explicit (no `any` except where matching existing Supabase patterns)
- Error handling with loading states for both users and teams
- `memo` wrapper preserved on modal for render optimization
- Internal hooks (`useTeamSelection`) encapsulate team selection logic cleanly
- Backward compatible — existing callers without `organizationId` still work
