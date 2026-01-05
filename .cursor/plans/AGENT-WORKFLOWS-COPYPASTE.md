# Copy-Paste Block for WorkflowsView Integration Agent

Copy everything below the line and paste it into a new Cursor Composer session:

---

```
You are completing the WorkflowsView refactoring for BluePLM. The previous agent extracted 18 hooks and 8 canvas components but FAILED TO INTEGRATE THEM. The current WorkflowsView.tsx is a ~720-line STUB with placeholder text "Note: Full canvas rendering requires complete migration from original file" - the actual canvas rendering is missing.

## YOUR MISSION
Wire together the extracted hooks and components so the workflow editor canvas actually renders and works.

## CRITICAL BOUNDARY - YOU MAY ONLY MODIFY:
- src/components/sidebar/workflows/WorkflowsView.tsx
- src/components/sidebar/workflows/** (any file in this folder)

DO NOT TOUCH: src/stores/**, src/features/**, src/components/shared/**

## READ THESE FILES FIRST:
1. .cursor/plans/agent-workflows-integration-plan.md (full analysis)
2. .cursor/plans/agent-workflows-integration-prompt.md (detailed instructions)
3. src/components/sidebar/workflows/hooks/index.ts (18 exported hooks)
4. src/components/sidebar/workflows/canvas/index.ts (8 exported components)
5. src/components/sidebar/workflows/WorkflowsView.tsx (current stub to fix)

## WHAT EXISTS (extracted but NOT integrated):
HOOKS (in hooks/):
- useWorkflowData, useWorkflowCRUD, useWorkflowIO (data & operations)
- useCanvasInteraction, useSnapToGrid (canvas state)
- useSelectionState, useDraggingState, useResizingState (selection/drag)
- useTransitionCreation, useWaypointState, useLabelState, useEdgePositions
- useUndoRedo, useClipboardOperations
- useFloatingToolbarActions, useContextMenuState, useDialogState

CANVAS COMPONENTS (in canvas/):
- StateNode.tsx (481 lines) - renders workflow state boxes
- TransitionLine.tsx (497 lines) - renders transition arrows
- TransitionHandles.tsx (445 lines) - draggable handles for transitions
- CreatingTransition.tsx - line shown while creating new transition
- FloatingToolbar.tsx - toolbar that appears when selecting state/transition
- WorkflowContextMenu.tsx - right-click context menu

## YOUR PHASES:
1. HOOK INTEGRATION: Import hooks, replace ~50 useState calls with hook returns
2. CANVAS RENDERING: Replace placeholder with SVG canvas rendering StateNode and TransitionLine
3. EVENT HANDLERS: Add mouse/keyboard handlers for pan, zoom, drag, connect
4. UI OVERLAYS: Add FloatingToolbar and WorkflowContextMenu rendering

## VERIFICATION:
Run `npm run typecheck` after each phase.

## KEY INSIGHT:
The hooks and components are already well-written and functional. Your job is INTEGRATION - wiring them together in WorkflowsView.tsx. Don't rewrite the hooks/components, just USE them.

Start by reading the current WorkflowsView.tsx to see the placeholder, then read the plan file for the full architecture.
```
