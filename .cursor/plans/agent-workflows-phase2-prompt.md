# Agent Prompt: Workflows Enterprise Refactor Phase 2

## Your Mission

Complete the workflow feature enterprise refactor. The previous agent created infrastructure (services, hooks, context) but **did not integrate it**. Your job is to wire everything together to achieve enterprise-quality code organization.

**Read the analysis:** `.cursor/plans/WORKFLOWS-ENTERPRISE-REFACTOR-PHASE2.md`

---

## CRITICAL BOUNDARY RULES

### ✅ YOU MAY ONLY MODIFY:
- `src/features/workflows/**` (all files in this feature)

### ❌ DO NOT TOUCH:
- `src/stores/**`
- `src/features/source/**`
- `src/features/settings/**`
- `src/components/**` (anything outside workflows)
- `src/lib/**`
- `supabase/**`
- Any other feature directories

---

## Current State Summary

| What Exists | Status | Action Needed |
|-------------|--------|---------------|
| 18 hooks in `hooks/` | ✅ Working | Keep |
| 3 services in `services/` | ✅ Working | Keep |
| WorkflowContext.tsx | ⚠️ Created but NOT used | Integrate |
| WorkflowsView.tsx (1,517 lines) | ❌ Too large | Reduce to <200 |
| FloatingToolbar.tsx (707 lines) | ❌ Too large | Split into 3 files |
| `canvas/` folder | ✅ Contains main components | Keep and extend |
| `components/Canvas/` folder | ⚠️ Duplicate, partial | Merge into `canvas/` |
| `utils/pathCalculations.ts` (600 lines) | ❌ Duplicate | Delete |
| Split utils (colors.ts, geometry.ts, etc.) | ✅ Working | Keep |

---

## Execution Plan (Follow This Order)

### Phase 1: Clean Up Duplicates (30 min)

1. **Delete** `utils/pathCalculations.ts`
   - The functionality is already in `colors.ts`, `geometry.ts`, `pathGeneration.ts`, `pathHelpers.ts`
   - Verify imports still work

2. **Move** helper components from `components/Canvas/` to `canvas/`:
   - Move `GridPattern.tsx` → `canvas/GridPattern.tsx`
   - Move `AlignmentGuides.tsx` → `canvas/AlignmentGuides.tsx`
   - Move `ArrowMarkers.tsx` → `canvas/ArrowMarkers.tsx`
   - Move `EmptyState.tsx` → `canvas/EmptyState.tsx`
   
3. **Delete** the now-empty `components/Canvas/` folder and its files:
   - Delete `components/Canvas/WorkflowCanvas.tsx` (will be rewritten)
   - Delete `components/Canvas/WaypointContextMenu.tsx` (duplicate of `canvas/` version)
   - Delete `components/Canvas/ContextMenus.tsx` (will be replaced)
   - Delete `components/Canvas/index.ts`
   
4. **Update** `canvas/index.ts` to export the moved components

5. **Run typecheck** to verify

### Phase 2: Split FloatingToolbar (1 hour)

The current `canvas/FloatingToolbar.tsx` (707 lines) handles both state and transition toolbars.

1. **Create** `canvas/toolbar/` folder

2. **Extract** state-specific toolbar:
   - Create `canvas/toolbar/StateToolbar.tsx` (~200 lines)
   - Move color picker, shape picker, fill opacity, border controls
   
3. **Extract** transition-specific toolbar:
   - Create `canvas/toolbar/TransitionToolbar.tsx` (~200 lines)
   - Move line style, path type, arrow head, thickness controls

4. **Refactor** `canvas/FloatingToolbar.tsx` to container (~100 lines):
   ```tsx
   export function FloatingToolbar({ type, ... }) {
     return type === 'state' 
       ? <StateToolbar {...props} />
       : <TransitionToolbar {...props} />
   }
   ```

5. **Create** `canvas/toolbar/index.ts` with barrel export

6. **Run typecheck**

### Phase 3: Integrate WorkflowContext (2 hours) - THE KEY CHANGE

The context exists at `context/WorkflowContext.tsx` but WorkflowsView.tsx doesn't use it.

**Current WorkflowsView.tsx structure (BAD):**
```tsx
export function WorkflowsView() {
  // 300+ lines of hook calls
  const selectionState = useSelectionState()
  const canvasInteraction = useCanvasInteraction()
  const workflowData = useWorkflowData({...})
  // ... 15 more hooks ...
  
  // 400+ lines of event handlers
  const handleCanvasMouseDown = useCallback(...
  const handleCanvasMouseMove = useCallback(...
  
  // 800+ lines of JSX with props passed everywhere
  return <div>...</div>
}
```

**Target structure (GOOD):**
```tsx
// WorkflowsView.tsx (~50 lines)
export function WorkflowsView() {
  const workflowData = useWorkflowData({...})
  
  return (
    <WorkflowProvider 
      workflows={workflowData.workflows}
      selectedWorkflow={workflowData.selectedWorkflow}
      states={workflowData.states}
      transitions={workflowData.transitions}
      gates={workflowData.gates}
      isLoading={workflowData.isLoading}
      isAdmin={workflowData.isAdmin}
      setStates={workflowData.setStates}
      setTransitions={workflowData.setTransitions}
      setGates={workflowData.setGates}
      setSelectedWorkflow={workflowData.setSelectedWorkflow}
    >
      <WorkflowEditor />
    </WorkflowProvider>
  )
}

// WorkflowEditor.tsx (~150 lines) - NEW FILE
function WorkflowEditor() {
  const ctx = useWorkflowContext()
  
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="flex h-full">
        <WorkflowsList />
        {ctx.selectedWorkflow ? (
          <WorkflowEditorMain />
        ) : (
          <EmptyState message="Select a workflow to edit" />
        )}
      </div>
      <WorkflowDialogs />
    </div>
  )
}

// WorkflowEditorMain.tsx (~200 lines) - NEW FILE
function WorkflowEditorMain() {
  const ctx = useWorkflowContext()
  const handlers = useCanvasHandlers() // NEW: extracted handlers
  
  return (
    <div className="flex-1 flex flex-col">
      <WorkflowToolbar />
      <WorkflowCanvas />
    </div>
  )
}
```

**Steps:**

1. **Modify** `WorkflowContext.tsx` to include hooks internally:
   - The context provider should call the hooks itself
   - Components just use `useWorkflowContext()` to get state

2. **Create** `WorkflowEditor.tsx`:
   - Uses context for state
   - Renders WorkflowsList, WorkflowEditorMain, WorkflowDialogs

3. **Create** `WorkflowEditorMain.tsx`:
   - Contains the canvas and toolbar
   - Uses context for all state

4. **Create** `hooks/useCanvasHandlers.ts`:
   - Extract all the handleCanvasMouseDown, handleCanvasMouseMove, etc. from WorkflowsView
   - Return the handlers object

5. **Refactor** `WorkflowsView.tsx`:
   - Remove all the hook calls (they're in Context now)
   - Remove all event handlers (they're in useCanvasHandlers)
   - Just render WorkflowProvider with WorkflowEditor

6. **Run typecheck**

### Phase 4: Update Canvas Components to Use Context (2 hours)

Currently, canvas components take 30-50 props. After context integration, they should take 1-3 props.

**Example - StateNode.tsx:**

Before (40+ props):
```tsx
function StateNode({
  state,
  isSelected,
  isTransitionStart,
  isDragging,
  isResizing,
  isSnapTarget,
  isHovered,
  isAdmin,
  canvasMode,
  isCreatingTransition,
  transitionStartId,
  isDraggingToCreateTransition,
  dimensions,
  pan,
  zoom,
  canvasRef,
  justCompletedTransitionRef,
  transitionCompletedAtRef,
  hasDraggedRef,
  onSelect,
  onStartDrag,
  onStartResize,
  onCompleteTransition,
  onStartTransition,
  onEdit,
  onHoverChange,
  onShowToolbar,
  onSetDraggingToCreateTransition,
  onSetHoveredStateId
}: StateNodeProps)
```

After (1 prop):
```tsx
function StateNode({ state }: { state: WorkflowState }) {
  const ctx = useWorkflowContext()
  
  // Derive state from context
  const isSelected = ctx.selectedStateId === state.id
  const isAdmin = ctx.isAdmin
  // ...
}
```

**Components to update:**
1. `canvas/StateNode.tsx`
2. `canvas/TransitionLine.tsx`
3. `canvas/TransitionHandles.tsx`
4. `canvas/CreatingTransition.tsx`
5. `canvas/FloatingToolbar.tsx`

For each:
1. Import `useWorkflowContext`
2. Replace props with context values
3. Simplify the props interface
4. Update parent components to pass fewer props

### Phase 5: Final Cleanup (30 min)

1. **Update** all `index.ts` barrel exports

2. **Delete** unused files:
   - `components/Sidebar/index.ts` (empty)
   - `components/Toolbar/index.ts` (empty)
   - `components/index.ts` (if empty)

3. **Fix** remaining 3 `as any` casts:
   - `canvas/StateNode.tsx:406-407` - Add gate types
   - `canvas/TransitionHandles.tsx:191` - Add elbow handles type

4. **Add** JSDoc comments to public APIs

5. **Run** final typecheck

---

## Verification Commands

After EVERY phase:
```powershell
cd c:\Users\emill\Documents\GitHub\bluePLM
npm run typecheck
```

Must pass before proceeding.

---

## Success Criteria

| Metric | Before | After | Status |
|--------|--------|-------|--------|
| WorkflowsView.tsx lines | 1,517 | <200 | |
| FloatingToolbar.tsx lines | 707 | <150 | |
| pathCalculations.ts | 600 | Deleted | |
| Canvas folders | 2 | 1 | |
| `as any` casts | 3 | 0 | |
| Context integrated | No | Yes | |
| Typecheck passes | Yes | Yes | |

---

## Key Files Reference

**Context:**
- `context/WorkflowContext.tsx` - The context provider (integrate this!)

**Hooks (keep these, they work):**
- `hooks/useWorkflowData.ts` - Data loading
- `hooks/useWorkflowCRUD.ts` - CRUD operations
- `hooks/useCanvasInteraction.ts` - Pan/zoom
- `hooks/useSelectionState.ts` - Selection
- (16 more hooks...)

**Services (keep these, they work):**
- `services/workflowService.ts`
- `services/stateService.ts`
- `services/transitionService.ts`

**Canvas components (update to use context):**
- `canvas/StateNode.tsx`
- `canvas/TransitionLine.tsx`
- `canvas/TransitionHandles.tsx`
- `canvas/FloatingToolbar.tsx`
- `canvas/CreatingTransition.tsx`

---

## DO NOT:

- ❌ Refactor unrelated code
- ❌ "Improve" features not in the plan
- ❌ Touch files outside `src/features/workflows/`
- ❌ Create new abstractions not mentioned
- ❌ Skip typecheck between phases
- ❌ Delete hooks/services (they work!)

## DO:

- ✅ Follow the phases in order
- ✅ Run typecheck after each phase
- ✅ Test canvas interactions after major changes
- ✅ Keep working code working
- ✅ Use the existing infrastructure (context, hooks, services)
