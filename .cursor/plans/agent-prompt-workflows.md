# Agent Prompt: WorkflowsView Refactoring

## Your Mission

You are refactoring `src/components/sidebar/WorkflowsView.tsx` from 6,846 lines and 85 useState calls down to ~1,200 lines and ~15 useState calls.

**Read the detailed plan at:** `.cursor/plans/workflowsview_refactor_8ed2ab05.plan.md`

---

## CRITICAL BOUNDARY RULES

### YOU MAY ONLY MODIFY THESE FILES:
- `src/components/sidebar/WorkflowsView.tsx`
- `src/components/sidebar/workflows/**` (all files in this folder)

### YOU MUST NOT TOUCH THESE FILES (another agent is working on them):
- `src/features/settings/organization/TeamMembersSettings.tsx` ❌
- `src/features/settings/organization/team-members/**` ❌
- `src/components/FileBrowser.tsx` ❌
- `src/features/file-browser/**` ❌
- Any store files (`src/stores/**`) ❌
- Any shared components (`src/components/shared/**`) ❌

If you need to modify anything outside your boundary, STOP and ask the user first.

---

## Current State

1. **3 hooks already exist but are NOT being imported:**
   - `src/components/sidebar/workflows/hooks/useCanvasInteraction.ts`
   - `src/components/sidebar/workflows/hooks/useSnapToGrid.ts`
   - `src/components/sidebar/workflows/hooks/useUndoRedo.ts`

2. **Types already extracted:** `src/components/sidebar/workflows/types.ts`

3. **Dialogs already extracted:**
   - `src/components/sidebar/workflows/dialogs/CreateWorkflowDialog.tsx`
   - `src/components/sidebar/workflows/dialogs/EditStateDialog.tsx`
   - `src/components/sidebar/workflows/dialogs/EditTransitionDialog.tsx`
   - `src/components/sidebar/workflows/dialogs/EditWorkflowDialog.tsx`

4. **Utility functions partially extracted:** `src/components/sidebar/workflows/utils/pathCalculations.ts`

---

## Execution Order

### Phase 1: Integrate Existing Hooks (do this first!)
1. Add imports from `./workflows/hooks`
2. Call each hook at the top of the component
3. Delete the redundant useState calls that the hooks replace
4. Run `npm run typecheck` after each hook integration

### Phase 2: Create New Hooks
Create these in `src/components/sidebar/workflows/hooks/`:
- `useWorkflowData.ts` - workflow/state/transition data (~6 useState)
- `useSelectionState.ts` - selection/hover state (~6 useState)
- `useTransitionCreation.ts` - transition creation (~4 useState)
- `useDraggingState.ts` - state dragging (~4 useState + refs)
- `useResizingState.ts` - state resizing (~2 useState)
- `useWaypointState.ts` - waypoint/curve state (~6 useState + refs)
- `useLabelState.ts` - label positions (~4 useState)
- `useEdgePositions.ts` - edge connections (~1 useState)
- `useContextMenuState.ts` - menus/toolbars (~3 useState)
- `useDialogState.ts` - dialog state (~8 useState)
- `useClipboard.ts` - copy/paste (~1 useState)

Update `hooks/index.ts` to export new hooks.

### Phase 3: Extract Canvas Components
Create `src/components/sidebar/workflows/canvas/`:
- `StateNode.tsx` (from `renderStateNode()` ~250 lines)
- `TransitionLine.tsx` (from `renderTransition()` ~400 lines)
- `CreatingTransition.tsx` (from `renderCreatingTransition()` ~100 lines)
- `TransitionHandles.tsx` (from `renderTransitionHandles()` ~150 lines)
- `CanvasToolbar.tsx` (~200 lines)
- `index.ts`

### Phase 4: Extract Remaining Utils
Move to `src/components/sidebar/workflows/utils/`:
- `colorUtils.ts` - `lightenColor()`
- Add to `pathCalculations.ts`:
  - `getNearestPointOnBoxEdge()`
  - `getPointFromEdgePosition()`
  - `getBezierMidpoint()`
  - `getControlPointFromMidpoint()`
  - `getPerpendicularDirection()`
  - `generateSplinePath()`
  - `getPointOnSpline()`
  - `findInsertionIndex()`
  - `getClosestPointOnBox()`

### Phase 5: Final Cleanup
- Run final `npm run typecheck`
- Verify canvas interactions work (zoom, pan, drag)
- Verify state/transition creation works
- Verify context menus and dialogs work

---

## Verification After Each Step
```bash
npm run typecheck
```
Must pass with no errors before proceeding to next step.

---

## Important Patterns

When integrating hooks, use this pattern:
```typescript
// Before (remove these):
const [canvasMode, setCanvasMode] = useState<CanvasMode>('select')
const [zoom, setZoom] = useState(1)
const [pan, setPan] = useState({ x: 0, y: 0 })
// ... many more useState calls

// After (add this):
import { useCanvasInteraction } from './workflows/hooks'
const {
  canvasMode, setCanvasMode, zoom, setZoom, pan, setPan,
  isDragging, dragStart, mousePos, canvasRef,
  startPan, handleMouseMove, endPan, handleWheel, zoomIn, zoomOut, resetZoom
} = useCanvasInteraction()
```

The hooks use the SAME variable names as the existing useState calls, so the rest of the code should work after removing the useState declarations.

---

## DO NOT:
- Refactor unrelated code
- "Improve" code that isn't part of the plan
- Touch any files outside your boundary
- Create new abstractions not in the plan
- Skip running typecheck between phases
