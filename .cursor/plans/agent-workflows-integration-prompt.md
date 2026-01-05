# Agent Prompt: WorkflowsView Integration

## Your Mission

You are completing the WorkflowsView refactoring. The previous agent **extracted hooks and components** but **failed to integrate them** into the main component. The current `WorkflowsView.tsx` is a 720-line **placeholder/stub** with no actual canvas rendering.

**Your job:** Wire everything together so the workflow editor actually works.

---

## 📖 READ FIRST

1. `.cursor/plans/agent-workflows-integration-plan.md` - Full analysis and architecture
2. `src/components/sidebar/workflows/hooks/index.ts` - See what hooks exist
3. `src/components/sidebar/workflows/canvas/index.ts` - See what components exist

---

## 🔒 CRITICAL BOUNDARY RULES

### YOU MAY ONLY MODIFY:
- `src/components/sidebar/workflows/WorkflowsView.tsx` ✅
- `src/components/sidebar/workflows/**` (any file in this folder) ✅

### YOU MUST NOT TOUCH:
- `src/features/settings/**` ❌
- `src/features/file-browser/**` ❌
- `src/stores/**` ❌
- `src/components/shared/**` ❌
- Any file outside `src/components/sidebar/workflows/` ❌

---

## 📁 Current File Structure

```
src/components/sidebar/workflows/
├── canvas/
│   ├── CreatingTransition.tsx    # Line while creating transition
│   ├── FloatingToolbar.tsx       # State/transition edit toolbar
│   ├── StateNode.tsx             # Renders workflow state node (481 lines)
│   ├── TransitionHandles.tsx     # Draggable handles (445 lines)
│   ├── TransitionLine.tsx        # Renders transition line (497 lines)
│   ├── TickSlider.tsx            # Slider component
│   ├── WorkflowContextMenu.tsx   # Right-click context menu
│   └── index.ts                  # Barrel export
├── dialogs/
│   ├── CreateWorkflowDialog.tsx  # ✅ Already integrated
│   ├── EditStateDialog.tsx       # ✅ Already integrated
│   ├── EditTransitionDialog.tsx  # ✅ Already integrated
│   ├── EditWorkflowDialog.tsx    # ✅ Already integrated
│   └── index.ts
├── hooks/
│   ├── useCanvasInteraction.ts   # Pan/zoom/mode state
│   ├── useClipboardOperations.ts # Cut/copy/paste
│   ├── useContextMenuState.ts    # Context menu visibility
│   ├── useDialogState.ts         # Dialog visibility
│   ├── useDraggingState.ts       # State dragging
│   ├── useEdgePositions.ts       # Edge connection points
│   ├── useFloatingToolbarActions.ts # Toolbar button handlers
│   ├── useLabelState.ts          # Label positions
│   ├── useResizingState.ts       # State resizing
│   ├── useSelectionState.ts      # Selected state/transition
│   ├── useSnapToGrid.ts          # Snap-to-grid logic
│   ├── useTransitionCreation.ts  # Creating transitions
│   ├── useUndoRedo.ts            # Undo/redo stack
│   ├── useWaypointState.ts       # Waypoint management
│   ├── useWorkflowCRUD.ts        # CRUD operations (386 lines)
│   ├── useWorkflowData.ts        # Data loading
│   ├── useWorkflowIO.ts          # Import/export (256 lines)
│   └── index.ts                  # Barrel export
├── utils/
│   ├── pathCalculations.ts       # Path/geometry utilities
│   └── index.ts
├── constants.ts                  # Constants (dimensions, etc.)
├── types.ts                      # Type definitions (302 lines)
├── WorkflowCard.tsx
├── WorkflowsList.tsx             # ✅ Already integrated
├── WorkflowToolbar.tsx           # Partially integrated
├── WorkflowsView.tsx             # ⚠️ THIS IS YOUR TARGET (incomplete)
└── index.ts
```

---

## 🎯 What You Need to Do

### Phase 1: Hook Integration

**Goal:** Replace ~50 useState calls with hook calls

1. Read `WorkflowsView.tsx` lines 102-205 - see all the useState calls
2. Read each hook in `hooks/` to understand what state it provides
3. Import hooks and call them
4. Remove the redundant useState calls
5. Update references to use hook-provided values

**Example transformation:**

```typescript
// BEFORE (remove these):
const [canvasMode, setCanvasMode] = useState<CanvasMode>('select')
const [zoom, setZoom] = useState(1)
const [pan, setPan] = useState({ x: 0, y: 0 })
const [isDragging, setIsDragging] = useState(false)

// AFTER (add this):
import { useCanvasInteraction } from './hooks'
const {
  canvasMode, setCanvasMode,
  zoom, setZoom,
  pan, setPan,
  isDragging, setIsDragging,
  // ... etc
} = useCanvasInteraction()
```

### Phase 2: Canvas Rendering

**Goal:** Add the SVG canvas with state nodes and transitions

The current component has a PLACEHOLDER where the canvas should be:

```tsx
// REPLACE THIS PLACEHOLDER:
<div className="absolute inset-0 flex items-center justify-center text-plm-fg-muted">
  <div className="text-center">
    <GitBranch size={48} className="mx-auto mb-2 opacity-50" />
    <p className="text-xs text-plm-fg-muted mt-2">
      Note: Full canvas rendering requires complete migration from original file
    </p>
  </div>
</div>
```

**With a proper SVG canvas:**

```tsx
import { StateNode, TransitionLine, TransitionHandles, CreatingTransition } from './canvas'

// In render:
<svg 
  width="100%" 
  height="100%" 
  style={{ position: 'absolute', inset: 0 }}
>
  {/* Arrow marker definitions */}
  <defs>
    {/* Selected arrow markers */}
    <marker id="arrowhead-selected" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#60a5fa" />
    </marker>
    {/* Add more markers as needed - see TransitionLine for marker IDs */}
    {transitions.map(t => (
      <React.Fragment key={`markers-${t.id}`}>
        <marker id={`arrowhead-${t.id}`} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill={t.line_color || '#6b7280'} />
        </marker>
        {/* Add hover markers, start markers, etc. */}
      </React.Fragment>
    ))}
  </defs>
  
  {/* Transformable group for pan/zoom */}
  <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
    {/* Grid pattern (when enabled) */}
    {snapSettings.snapToGrid && (
      <g className="pointer-events-none">
        {/* Grid lines - see constants.ts for grid size */}
      </g>
    )}
    
    {/* Render transitions first (below states) */}
    {transitions.map(transition => (
      <TransitionLine
        key={transition.id}
        transition={transition}
        states={states}
        gates={gates[transition.id] || []}
        isSelected={selectedTransitionId === transition.id}
        isDragging={draggingTransitionEndpoint?.transitionId === transition.id}
        draggingEndpoint={draggingTransitionEndpoint?.transitionId === transition.id ? draggingTransitionEndpoint.endpoint : null}
        hoveredTransitionId={hoveredTransitionId}
        hoveredStateId={hoveredStateId}
        isAdmin={isAdmin}
        stateDimensions={stateDimensions}
        DEFAULT_STATE_WIDTH={DEFAULT_STATE_WIDTH}
        DEFAULT_STATE_HEIGHT={DEFAULT_STATE_HEIGHT}
        edgePositions={edgePositions}
        waypoints={waypoints[transition.id] || []}
        labelOffset={labelOffsets[transition.id] || null}
        pinnedLabelPosition={pinnedLabelPositions[transition.id] || null}
        draggingCurveControl={draggingCurveControl}
        draggingWaypointIndex={draggingWaypointIndex}
        tempCurvePos={tempCurvePos}
        draggingLabel={draggingLabel}
        tempLabelPos={tempLabelPos}
        mousePos={mousePos}
        pan={pan}
        zoom={zoom}
        canvasRef={canvasRef}
        onSelect={() => { setSelectedTransitionId(transition.id); setSelectedStateId(null) }}
        onHoverChange={(hovered) => setHoveredTransitionId(hovered ? transition.id : null)}
        onShowToolbar={(x, y) => setFloatingToolbar({ canvasX: x, canvasY: y, type: 'transition', targetId: transition.id })}
        onAddWaypoint={/* ... */}
        onShowWaypointContextMenu={/* ... */}
        addToast={addToast}
      />
    ))}
    
    {/* Transition handles (when selected) */}
    <TransitionHandles
      transitions={transitions}
      states={states}
      isAdmin={isAdmin}
      selectedTransitionId={selectedTransitionId}
      edgePositions={edgePositions}
      waypoints={waypoints}
      labelOffsets={labelOffsets}
      pinnedLabelPositions={pinnedLabelPositions}
      draggingTransitionEndpoint={draggingTransitionEndpoint}
      draggingCurveControl={draggingCurveControl}
      draggingWaypointIndex={draggingWaypointIndex}
      draggingLabel={draggingLabel}
      tempCurvePos={tempCurvePos}
      tempLabelPos={tempLabelPos}
      hoveredWaypoint={hoveredWaypoint}
      waypointHasDraggedRef={waypointHasDraggedRef}
      /* ... setters ... */
      addToast={addToast}
    />
    
    {/* Render states */}
    {states.map(state => (
      <StateNode
        key={state.id}
        state={state}
        isSelected={selectedStateId === state.id}
        isTransitionStart={transitionStartId === state.id}
        isDragging={draggingStateId === state.id}
        isResizing={resizingState?.stateId === state.id}
        isSnapTarget={/* ... */}
        isHovered={hoverNodeId === state.id}
        isAdmin={isAdmin}
        canvasMode={canvasMode}
        isCreatingTransition={isCreatingTransition}
        transitionStartId={transitionStartId}
        isDraggingToCreateTransition={isDraggingToCreateTransition}
        dimensions={stateDimensions[state.id] || { width: DEFAULT_STATE_WIDTH, height: DEFAULT_STATE_HEIGHT }}
        pan={pan}
        zoom={zoom}
        canvasRef={canvasRef}
        justCompletedTransitionRef={justCompletedTransitionRef}
        transitionCompletedAtRef={transitionCompletedAtRef}
        hasDraggedRef={hasDraggedRef}
        onSelect={() => { setSelectedStateId(state.id); setSelectedTransitionId(null) }}
        onStartDrag={(e) => { /* start drag logic */ }}
        onStartResize={(handle, e) => { /* start resize logic */ }}
        onCompleteTransition={() => completeTransition(state.id)}
        onStartTransition={() => startTransition(state.id)}
        onEdit={() => { setEditingState(state); setShowEditState(true) }}
        onHoverChange={(hovered) => setHoverNodeId(hovered ? state.id : null)}
        onShowToolbar={() => setFloatingToolbar({ canvasX: state.position_x, canvasY: state.position_y - 50, type: 'state', targetId: state.id })}
        onSetDraggingToCreateTransition={setIsDraggingToCreateTransition}
        onSetHoveredStateId={setHoveredStateId}
      />
    ))}
    
    {/* Creating transition line (when dragging to create) */}
    {isCreatingTransition && transitionStartId && (
      <CreatingTransition
        startState={states.find(s => s.id === transitionStartId)!}
        mousePos={mousePos}
        hoveredStateId={hoveredStateId}
        states={states}
        stateDimensions={stateDimensions}
        DEFAULT_STATE_WIDTH={DEFAULT_STATE_WIDTH}
        DEFAULT_STATE_HEIGHT={DEFAULT_STATE_HEIGHT}
      />
    )}
    
    {/* Alignment guides */}
    {alignmentGuides.vertical !== null && (
      <line x1={alignmentGuides.vertical} y1={-10000} x2={alignmentGuides.vertical} y2={10000} stroke="#60a5fa" strokeWidth={1 / zoom} strokeDasharray="4,4" />
    )}
    {alignmentGuides.horizontal !== null && (
      <line x1={-10000} y1={alignmentGuides.horizontal} x2={10000} y2={alignmentGuides.horizontal} stroke="#60a5fa" strokeWidth={1 / zoom} strokeDasharray="4,4" />
    )}
  </g>
</svg>
```

### Phase 3: Event Handlers

**Goal:** Add mouse and keyboard event handlers

The canvas div needs event handlers:

```tsx
<div 
  ref={canvasRef}
  className="flex-1 relative overflow-hidden bg-plm-bg"
  style={{ cursor: getCursor() }}
  onMouseDown={handleCanvasMouseDown}
  onMouseMove={handleCanvasMouseMove}
  onMouseUp={handleCanvasMouseUp}
  onMouseLeave={handleCanvasMouseUp}
  onWheel={handleCanvasWheel}
  onContextMenu={handleCanvasContextMenu}
  tabIndex={0}
  onKeyDown={handleKeyDown}
>
```

You'll need to implement these handlers. They coordinate between:
- Pan mode (drag to pan)
- Select mode (click to select, drag to move states)
- Connect mode (click states to create transitions)
- Dragging states
- Resizing states
- Dragging transition endpoints
- Dragging waypoints
- Dragging labels

### Phase 4: Floating Toolbar & Context Menu

**Goal:** Render the floating toolbar and context menu overlays

```tsx
import { FloatingToolbar, WorkflowContextMenu } from './canvas'

// After the SVG, but still inside the canvas div:
{floatingToolbar && (
  <div
    style={{
      position: 'absolute',
      left: floatingToolbar.canvasX * zoom + pan.x,
      top: floatingToolbar.canvasY * zoom + pan.y - 60,
      transform: 'translateX(-50%)',
      zIndex: 50
    }}
  >
    <FloatingToolbar
      x={floatingToolbar.canvasX}
      y={floatingToolbar.canvasY}
      type={floatingToolbar.type}
      isAdmin={isAdmin}
      targetState={floatingToolbar.type === 'state' ? states.find(s => s.id === floatingToolbar.targetId) : undefined}
      targetTransition={floatingToolbar.type === 'transition' ? transitions.find(t => t.id === floatingToolbar.targetId) : undefined}
      onColorChange={handleColorChange}
      onLineStyleChange={handleLineStyleChange}
      // ... more handlers from useFloatingToolbarActions
      onClose={() => setFloatingToolbar(null)}
    />
  </div>
)}

// Outside the canvas div, for context menu:
{contextMenu && (
  <WorkflowContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    type={contextMenu.type}
    isAdmin={isAdmin}
    // ... props
    onClose={() => setContextMenu(null)}
  />
)}
```

---

## ⚠️ Important Notes

### Refs That Must Be Preserved

These refs manage timing to prevent click/drag conflicts:

```typescript
const hasDraggedRef = useRef(false)
const dragStartPosRef = useRef<{ x: number; y: number } | null>(null)
const justCompletedTransitionRef = useRef(false)
const transitionCompletedAtRef = useRef<number>(0)
const waypointHasDraggedRef = useRef(false)
const justFinishedWaypointDragRef = useRef(false)
const justFinishedLabelDragRef = useRef(false)
```

### Coordinate System

- Screen coordinates: `e.clientX`, `e.clientY`
- Canvas coordinates: `(e.clientX - rect.left - pan.x) / zoom`

### Hook Dependencies

Many hooks need data from other hooks. Call them in this order:
1. `useWorkflowData` (provides states, transitions, gates)
2. `useSelectionState` (provides selectedStateId, etc.)
3. `useCanvasInteraction` (provides pan, zoom, etc.)
4. Other hooks...
5. `useWorkflowCRUD` (needs states, transitions, setters)
6. `useFloatingToolbarActions` (needs CRUD operations)

---

## ✅ Verification After Each Phase

```bash
npm run typecheck
```

Must pass before proceeding to next phase.

After all phases, manually test:
- [ ] Can see workflow states on canvas
- [ ] Can zoom with scroll wheel
- [ ] Can pan by holding space + drag (or pan mode)
- [ ] Can select states by clicking
- [ ] Can drag states to move them
- [ ] Can create transitions by dragging between states
- [ ] Can select transitions by clicking
- [ ] Floating toolbar appears on selection
- [ ] Context menu appears on right-click
- [ ] Dialogs work (edit state, edit transition)
- [ ] Undo/redo works
- [ ] Copy/paste works
- [ ] Import/export works

---

## 🚀 START HERE

1. Read the current `WorkflowsView.tsx` to understand its current state
2. Read `hooks/index.ts` to see all available hooks
3. Read `canvas/index.ts` to see all available components
4. Start with Phase 1: Import and use hooks
5. Run `npm run typecheck` after each significant change

**Work methodically. Test frequently. Don't try to do everything at once.**
