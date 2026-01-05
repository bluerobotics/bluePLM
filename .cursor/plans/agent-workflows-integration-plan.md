# WorkflowsView Integration Plan

## Your Mission

Complete the WorkflowsView refactoring. The previous agent extracted **18 hooks** and **8 canvas components** but **failed to integrate them**. The current `WorkflowsView.tsx` is a 720-line **stub** with a placeholder saying "Full canvas rendering requires complete migration from original file."

**Your job:** Wire the extracted hooks and components together so the workflow editor actually works.

---

## Critical Boundary Rules

### ✅ YOU MAY ONLY MODIFY:
- `src/components/sidebar/workflows/WorkflowsView.tsx`
- `src/components/sidebar/workflows/**` (any file in this folder)

### ❌ DO NOT TOUCH:
- `src/stores/**`, `src/features/**`, `src/components/shared/**`

---

## Current State Analysis

### ✅ What Was Successfully Extracted

| Category | Files | Status |
|----------|-------|--------|
| **Hooks (18)** | `hooks/index.ts` exports all | Created, NOT integrated |
| **Canvas Components (8)** | `canvas/index.ts` exports all | Created, NOT integrated |
| **Dialogs (4)** | `dialogs/index.ts` | ✅ Working, imported |
| **Utils** | `utils/index.ts` | ✅ Working, imported |
| **Types** | `types.ts` | ✅ Complete |
| **Constants** | `constants.ts` | ✅ Working, imported |
| **Toolbar** | `WorkflowToolbar.tsx` | Created, partially integrated |
| **WorkflowsList** | `WorkflowsList.tsx` | ✅ Working, imported |

### ❌ Critical Problem: Main Component is a Stub

The current `WorkflowsView.tsx` at ~720 lines is **incomplete**:

```typescript
// Line 562-580 shows the placeholder:
<div className="absolute inset-0 flex items-center justify-center text-plm-fg-muted">
  <div className="text-center">
    <GitBranch size={48} className="mx-auto mb-2 opacity-50" />
    <p className="text-sm">
      {states.length === 0 
        ? 'No states defined. Click "State" to add your first state.'
        : `${states.length} states, ${transitions.length} transitions`
      }
    </p>
    <p className="text-xs text-plm-fg-muted mt-2">
      Note: Full canvas rendering requires complete migration from original file
    </p>
  </div>
</div>
```

### Hooks: Created but NOT Used

The following hooks exist but are not imported in WorkflowsView.tsx:

| Hook | Purpose | Lines Saved |
|------|---------|-------------|
| `useWorkflowCRUD` | CRUD for states/transitions/gates | ~250 |
| `useWorkflowIO` | Import/export workflows | ~180 |
| `useClipboardOperations` | Cut/copy/paste | ~200 |
| `useFloatingToolbarActions` | Toolbar button handlers | ~200 |
| `useCanvasInteraction` | Pan/zoom/mode | ~150 |
| `useSnapToGrid` | Snap-to-grid logic | ~80 |
| `useUndoRedo` | Undo/redo stack | ~100 |
| `useSelectionState` | Selected state/transition | ~60 |
| `useTransitionCreation` | Creating transitions | ~80 |
| `useDraggingState` | Dragging states | ~100 |
| `useResizingState` | Resizing states | ~80 |
| `useWaypointState` | Waypoint management | ~120 |
| `useLabelState` | Label positions | ~80 |
| `useEdgePositions` | Edge connection points | ~60 |
| `useContextMenuState` | Context menus | ~60 |
| `useDialogState` | Dialog visibility | ~80 |
| `useWorkflowData` | Data loading | ~150 |

### Canvas Components: Created but NOT Rendered

| Component | Purpose | Lines |
|-----------|---------|-------|
| `StateNode.tsx` | Renders workflow state nodes | 481 |
| `TransitionLine.tsx` | Renders transition lines | 497 |
| `TransitionHandles.tsx` | Renders draggable handles | 445 |
| `CreatingTransition.tsx` | Line while creating transition | ~80 |
| `FloatingToolbar.tsx` | State/transition toolbar | ~300 |
| `WorkflowContextMenu.tsx` | Right-click menu | ~200 |
| `TickSlider.tsx` | Slider component | ~50 |

---

## What The Canvas Should Look Like

The original 6,846-line file had an SVG canvas that rendered:

1. **Grid background** (when snap-to-grid enabled)
2. **Arrow marker definitions** (SVG defs for arrowheads)
3. **Transitions** (TransitionLine for each transition)
4. **Transition handles** (when selected - TransitionHandles)
5. **State nodes** (StateNode for each state)
6. **Creating transition line** (when dragging to create)
7. **Alignment guides** (snap lines when dragging)
8. **Floating toolbar** (on state/transition select)
9. **Context menus** (on right-click)

---

## Integration Architecture

### Target Component Structure

```tsx
export function WorkflowsView() {
  // 1. Store access
  const { organization, user, addToast, getEffectiveRole } = usePDMStore()
  
  // 2. Use extracted hooks (replace ~60 useState calls)
  const { workflows, states, transitions, gates, ... } = useWorkflowData(...)
  const { selectedStateId, selectedTransitionId, ... } = useSelectionState()
  const { canvasMode, zoom, pan, ... } = useCanvasInteraction()
  const { addState, deleteState, ... } = useWorkflowCRUD(...)
  const { exportWorkflow, importWorkflow, ... } = useWorkflowIO(...)
  const { handleCopy, handlePaste, ... } = useClipboardOperations(...)
  const { floatingToolbar, contextMenu, ... } = useContextMenuState()
  // ... more hooks
  
  // 3. Canvas ref
  const canvasRef = useRef<HTMLDivElement>(null)
  
  // 4. Computed values
  const isAdmin = getEffectiveRole() === 'admin'
  
  // 5. Event handlers (mouse down, move, up, wheel, keyboard)
  const handleCanvasMouseDown = useCallback((e) => { ... }, [...])
  const handleCanvasMouseMove = useCallback((e) => { ... }, [...])
  const handleCanvasMouseUp = useCallback((e) => { ... }, [...])
  
  // 6. Render
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Workflows list sidebar */}
      <div className="flex h-full">
        <WorkflowsList ... />
        
        {/* Main canvas area */}
        <div className="flex-1 flex flex-col">
          {selectedWorkflow && (
            <>
              <WorkflowToolbar ... />
              
              {/* SVG Canvas */}
              <div 
                ref={canvasRef}
                className="flex-1 relative overflow-hidden bg-plm-bg"
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onWheel={handleCanvasWheel}
              >
                <svg width="100%" height="100%">
                  {/* Defs for arrowheads */}
                  <defs>...</defs>
                  
                  {/* Transformable group */}
                  <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                    {/* Grid */}
                    {snapSettings.snapToGrid && <GridPattern ... />}
                    
                    {/* Transitions */}
                    {transitions.map(t => (
                      <TransitionLine key={t.id} ... />
                    ))}
                    
                    {/* Transition handles */}
                    <TransitionHandles ... />
                    
                    {/* States */}
                    {states.map(s => (
                      <StateNode key={s.id} ... />
                    ))}
                    
                    {/* Creating transition line */}
                    {isCreatingTransition && (
                      <CreatingTransition ... />
                    )}
                    
                    {/* Alignment guides */}
                    {alignmentGuides.vertical && ...}
                    {alignmentGuides.horizontal && ...}
                  </g>
                </svg>
                
                {/* Floating toolbar (HTML overlay) */}
                {floatingToolbar && (
                  <FloatingToolbar ... />
                )}
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* Context menus */}
      {contextMenu && <WorkflowContextMenu ... />}
      
      {/* Dialogs */}
      {showCreateWorkflow && <CreateWorkflowDialog ... />}
      {showEditWorkflow && <EditWorkflowDialog ... />}
      {showEditState && <EditStateDialog ... />}
      {showEditTransition && <EditTransitionDialog ... />}
    </div>
  )
}
```

---

## Remaining Work

### Phase 1: Hook Integration (~2 hours)
1. Import all hooks from `./hooks`
2. Call hooks and destructure return values
3. Remove redundant useState calls
4. Update function signatures to use hook values
5. Run typecheck

### Phase 2: Canvas Component Integration (~3 hours)
1. Import canvas components from `./canvas`
2. Add SVG canvas structure
3. Add arrow marker definitions
4. Render TransitionLine for each transition
5. Render StateNode for each state
6. Render TransitionHandles when transition selected
7. Add CreatingTransition for drag-to-connect
8. Run typecheck

### Phase 3: Event Handler Integration (~2 hours)
1. Add canvas mouse event handlers (mousedown, mousemove, mouseup)
2. Add wheel handler for zoom
3. Add keyboard handler (Escape, Delete, Ctrl+C/V/X/Z)
4. Connect to hook callbacks
5. Run typecheck

### Phase 4: UI Overlay Integration (~1 hour)
1. Add FloatingToolbar rendering with position transforms
2. Add WorkflowContextMenu rendering
3. Connect toolbar actions to useFloatingToolbarActions
4. Run typecheck

### Phase 5: Testing & Polish (~1 hour)
1. Test state node drag/drop
2. Test transition creation
3. Test selection/deselection
4. Test zoom/pan
5. Test context menus
6. Test dialogs
7. Verify no regressions

---

## Success Criteria

- [ ] WorkflowsView.tsx < 800 lines
- [ ] All 18 hooks imported and used
- [ ] All 8 canvas components rendering
- [ ] Canvas interactions work (drag, zoom, pan)
- [ ] State CRUD works (add, edit, delete, move, resize)
- [ ] Transition CRUD works (add, edit, delete, reconnect)
- [ ] Copy/paste works
- [ ] Import/export works
- [ ] Undo/redo works
- [ ] `npm run typecheck` passes
- [ ] Visual regression test passes

---

## Files to Modify

| File | Action |
|------|--------|
| `WorkflowsView.tsx` | **MAJOR REWRITE** - integrate hooks & components |
| `WorkflowToolbar.tsx` | May need prop interface updates |

## Files to Reference (Read-Only)

| File | Purpose |
|------|---------|
| `hooks/*.ts` | All hook implementations |
| `canvas/*.tsx` | All canvas component implementations |
| `types.ts` | Type definitions |
| `constants.ts` | Constants |
| `utils/*.ts` | Utility functions |

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Mouse handlers have 50+ state dependencies | Pass minimal props, use refs where needed |
| Event timing issues (clicks vs drags) | Preserve timing refs (hasDraggedRef, etc.) |
| SVG rendering performance | Use memoization for expensive renders |
| Type errors | Run typecheck after each phase |
| Visual regressions | Manual testing after each phase |

---

## Estimated Time: 8-10 hours

This is a significant integration task. The hooks and components are well-written; the challenge is wiring them together correctly in the main component.

---

## How to Proceed

### Step 1: Understand What Exists
```bash
# Read the hooks barrel export
cat src/components/sidebar/workflows/hooks/index.ts

# Read the canvas components barrel export  
cat src/components/sidebar/workflows/canvas/index.ts

# Read the current stub (look for the placeholder around line 560-580)
cat src/components/sidebar/workflows/WorkflowsView.tsx
```

### Step 2: Hook Integration
Replace the ~50 useState calls (lines 102-205) with hook calls:

```typescript
// Import hooks
import { 
  useWorkflowData, useSelectionState, useCanvasInteraction,
  useWorkflowCRUD, useWorkflowIO, useClipboardOperations,
  useDraggingState, useResizingState, useTransitionCreation,
  useWaypointState, useLabelState, useEdgePositions,
  useContextMenuState, useDialogState, useFloatingToolbarActions,
  useSnapToGrid, useUndoRedo
} from './hooks'

// Call hooks and use their return values instead of useState
```

### Step 3: Canvas Rendering
Replace the placeholder div with an SVG canvas:

```tsx
import { StateNode, TransitionLine, TransitionHandles, CreatingTransition, FloatingToolbar } from './canvas'

// In render, replace placeholder with:
<svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
  <defs>{/* Arrow markers */}</defs>
  <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
    {transitions.map(t => <TransitionLine key={t.id} {...props} />)}
    <TransitionHandles {...props} />
    {states.map(s => <StateNode key={s.id} {...props} />)}
    {isCreatingTransition && <CreatingTransition {...props} />}
  </g>
</svg>
```

### Step 4: Event Handlers
Add to the canvas container div:
- `onMouseDown`, `onMouseMove`, `onMouseUp` for drag/pan/select
- `onWheel` for zoom
- `onKeyDown` for keyboard shortcuts (Delete, Escape, Ctrl+C/V/Z)

### Step 5: Verify
```bash
npm run typecheck
```

Then manually test: zoom, pan, drag states, create transitions, select items, context menus, dialogs.

---

## Key Files Reference

| File | What It Contains |
|------|------------------|
| `hooks/useWorkflowCRUD.ts` | addState, deleteState, createTransition, etc. |
| `hooks/useWorkflowIO.ts` | exportWorkflow, importWorkflow |
| `hooks/useCanvasInteraction.ts` | pan, zoom, canvasMode |
| `canvas/StateNode.tsx` | Renders workflow state boxes (481 lines) |
| `canvas/TransitionLine.tsx` | Renders transition arrows (497 lines) |
| `canvas/TransitionHandles.tsx` | Draggable endpoint/waypoint handles |
| `canvas/FloatingToolbar.tsx` | Toolbar on selection |
| `types.ts` | All TypeScript interfaces |
| `constants.ts` | DEFAULT_STATE_WIDTH, etc. |

---

## Important: Preserve These Refs

These prevent click/drag conflicts - don't remove them:
```typescript
const hasDraggedRef = useRef(false)
const justCompletedTransitionRef = useRef(false)
const transitionCompletedAtRef = useRef<number>(0)
const waypointHasDraggedRef = useRef(false)
```

---

## Coordinate Conversion

Screen → Canvas: `(e.clientX - rect.left - pan.x) / zoom`
