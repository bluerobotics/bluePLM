/**
 * WorkflowsView - Visual workflow editor for state machine management
 * 
 * This component provides a canvas-based editor for creating and editing
 * workflow state machines with drag-and-drop state nodes and transitions.
 * 
 * Refactored structure:
 * - Dialogs extracted to ./dialogs/
 * - Utility functions extracted to ./utils/
 * - Hooks extracted to ./hooks/
 * - Canvas components in ./canvas/
 * - Constants in ./constants.ts
 * - Types in ./types.ts
 */
import { useEffect, useRef } from 'react'
import { GitBranch } from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'
import { stateService, transitionService } from './services'

// Import extracted hooks
import {
  useWorkflowData,
  useSelectionState,
  useCanvasInteraction,
  useDraggingState,
  useTransitionCreation,
  useResizingState,
  useWaypointState,
  useLabelState,
  useEdgePositions,
  useContextMenuState,
  useDialogState,
  useSnapToGrid,
  useUndoRedo,
  useWorkflowCRUD,
  useWorkflowIO,
  useClipboardOperations,
  useFloatingToolbarActions,
  useCanvasHandlers,
  useCanvasEvents
} from './hooks'

// Import extracted dialogs
import { 
  CreateWorkflowDialog, 
  EditWorkflowDialog, 
  EditStateDialog, 
  EditTransitionDialog 
} from './dialogs'

// Import extracted canvas components
import {
  WorkflowCanvas,
  WorkflowContextMenu,
  WaypointContextMenu
} from './canvas'

// Import extracted components
import { WorkflowsList } from './WorkflowsList'
import { WorkflowToolbar } from './WorkflowToolbar'

export function WorkflowsView() {
  const { addToast } = usePDMStore()
  
  // ============================================
  // HOOKS INTEGRATION
  // ============================================
  
  // Selection state management
  const selectionState = useSelectionState()
  const {
    selectedStateId,
    selectedTransitionId,
    hoveredStateId,
    hoveredTransitionId,
    hoveredWaypoint,
    setHoveredStateId,
    setHoveredTransitionId,
    setHoveredWaypoint,
    selectState,
    selectTransition,
    clearSelection
  } = selectionState

  // Canvas interaction (pan, zoom, mouse tracking)
  const canvasInteraction = useCanvasInteraction()
  const {
    canvasMode,
    zoom,
    pan,
    mousePos,
    canvasRef,
    setCanvasMode,
    setZoom,
    setPan,
    handleWheel,
    centerOnContent
  } = canvasInteraction
  
  // Workflow data management
  const workflowData = useWorkflowData({
    onWorkflowSelect: (workflow, states) => {
      if (states.length > 0) {
        centerOnContent(states)
      }
      const zoomLevel = workflow.canvas_config?.zoom || 1
      setZoom(zoomLevel)
    },
    onSelectionClear: () => {
      clearSelection()
    }
  })
  const {
    workflows,
    selectedWorkflow,
    states,
    transitions,
    gates,
    isLoading,
    isAdmin,
    setStates,
    setTransitions,
    setGates,
    selectWorkflow,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow
  } = workflowData

  // Dialog state management
  const dialogState = useDialogState()
  const {
    showCreateWorkflow,
    showEditWorkflow,
    showEditState,
    showEditTransition,
    editingState,
    editingTransition,
    setShowCreateWorkflow,
    setShowEditWorkflow,
    setShowEditState,
    setShowEditTransition,
    setEditingState,
    setEditingTransition,
    openEditState,
    closeEditState,
    openEditTransition,
    closeEditTransition
  } = dialogState
  
  // Dragging state for nodes
  const draggingState = useDraggingState()
  const {
    draggingStateId,
    dragOffset,
    hasDraggedRef,
    dragStartPosRef,
    setDraggingStateId,
    startDragging,
    stopDragging,
    checkDragThreshold,
    markHasDragged
  } = draggingState

  // Transition creation state
  const transitionCreation = useTransitionCreation()
  const {
    isCreatingTransition,
    transitionStartId,
    isDraggingToCreateTransition,
    draggingTransitionEndpoint,
    justCompletedTransitionRef,
    transitionCompletedAtRef,
    setIsCreatingTransition,
    setTransitionStartId,
    setIsDraggingToCreateTransition,
    setDraggingTransitionEndpoint,
    cancelTransitionCreation
  } = transitionCreation
  
  // Resizing state
  const resizingState = useResizingState()
  const {
    resizingState: currentResizing,
    stateDimensions,
    startResizing,
    stopResizing,
    getDimensions,
    updateDimensions
  } = resizingState

  // Waypoint state
  const waypointState = useWaypointState()
  const {
    waypoints,
    draggingCurveControl,
    draggingWaypointIndex,
    draggingWaypointAxis,
    tempCurvePos,
    waypointHasDraggedRef,
    setWaypoints,
    setDraggingCurveControl,
    setDraggingWaypointIndex,
    setDraggingWaypointAxis,
    setTempCurvePos,
    addWaypoint,
    stopWaypointDrag
  } = waypointState
  
  // Label state
  const labelState = useLabelState()
  const {
    labelOffsets,
    pinnedLabelPositions,
    draggingLabel,
    tempLabelPos,
    setLabelOffsets,
    setPinnedLabelPositions,
    setDraggingLabel,
    setTempLabelPos,
    stopLabelDrag
  } = labelState

  // Edge positions
  const edgeState = useEdgePositions()
  const {
    edgePositions,
    setEdgePositions,
    updateEdgePosition
  } = edgeState
  
  // Context menu state
  const contextMenuState = useContextMenuState()
  const {
    contextMenu,
    waypointContextMenu,
    floatingToolbar,
    setContextMenu,
    setWaypointContextMenu,
    setFloatingToolbar,
    showStateToolbar,
    showTransitionToolbar,
    closeContextMenu,
    closeAll
  } = contextMenuState

  // Snap to grid
  const snapState = useSnapToGrid(states)
  const {
    snapSettings,
    showSnapSettings,
    alignmentGuides,
    setSnapSettings,
    setShowSnapSettings,
    setAlignmentGuides,
    clearAlignmentGuides,
    applySnapping
  } = snapState

  // Undo/redo
  const undoRedoState = useUndoRedo({
    isAdmin,
    addToast,
    setStates,
    setTransitions
  })
  const {
    clipboard,
    setClipboard,
    pushToUndo,
    handleUndo,
    handleRedo
  } = undoRedoState
  
  // CRUD operations
  const crudOperations = useWorkflowCRUD({
    selectedWorkflow,
    states,
    transitions,
    gates,
    isAdmin,
    setStates,
    setTransitions,
    setGates,
    setSelectedStateId: selectState,
    setSelectedTransitionId: selectTransition,
    setEditingState,
    setEditingTransition,
    setEditingGate: () => {},
    setShowEditState,
    setShowEditTransition,
    setShowEditGate: () => {},
    setFloatingToolbar,
    setIsCreatingTransition,
    setTransitionStartId,
    setIsDraggingToCreateTransition,
    setHoveredStateId,
    transitionStartId,
    justCompletedTransitionRef,
    transitionCompletedAtRef,
    setWaypoints,
    addToast,
    pushToUndo
  })
  const {
    addState,
    deleteState,
    updateStatePosition,
    startTransition,
    completeTransition,
    deleteTransition,
    cancelConnectMode,
    addTransitionGate
  } = crudOperations

  // Import/export
  const importInputRef = useRef<HTMLInputElement>(null)
  const ioOperations = useWorkflowIO({
    selectedWorkflow,
    states,
    transitions,
    isAdmin,
    setStates,
    setTransitions,
    setSelectedStateId: selectState,
    setSelectedTransitionId: selectTransition,
    addToast
  })
  const { exportWorkflow, importWorkflow } = ioOperations

  // Clipboard operations
  const clipboardOps = useClipboardOperations({
    selectedWorkflow,
    states,
    transitions,
    isAdmin,
    selectedStateId,
    selectedTransitionId,
    clipboard,
    setClipboard,
    setStates,
    setTransitions,
    setSelectedStateId: selectState,
    setSelectedTransitionId: selectTransition,
    setFloatingToolbar,
    addToast,
    pushToUndo
  })
  const { handleCopy, handleCut, handlePaste, handleDeleteSelected } = clipboardOps

  // Floating toolbar actions
  const toolbarActions = useFloatingToolbarActions({
    states,
    transitions,
    waypoints,
    floatingToolbar,
    setStates,
    setTransitions,
    setWaypoints,
    setFloatingToolbar,
    setEditingState,
    setEditingTransition,
    setShowEditState,
    setShowEditTransition,
    deleteState,
    deleteTransition,
    addTransitionGate,
    addToast
  })

  // Canvas mouse handlers
  const {
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp
  } = useCanvasHandlers({
    canvasRef,
    hasDraggedRef,
    dragStartPosRef,
    waypointHasDraggedRef,
    pan,
    zoom,
    canvasMode,
    draggingStateId,
    dragOffset,
    currentResizing,
    draggingTransitionEndpoint,
    waypoints,
    draggingCurveControl,
    draggingWaypointIndex,
    draggingWaypointAxis,
    tempCurvePos,
    draggingLabel,
    tempLabelPos,
    states,
    transitions,
    hoveredStateId,
    isDraggingToCreateTransition,
    setPan,
    setDraggingStateId,
    setFloatingToolbar,
    setAlignmentGuides,
    setStates,
    setTransitions,
    setHoveredStateId,
    setTempCurvePos,
    setTempLabelPos,
    setWaypoints,
    setPinnedLabelPositions,
    setDraggingTransitionEndpoint,
    checkDragThreshold,
    markHasDragged,
    applySnapping,
    getDimensions,
    updateDimensions,
    closeAll,
    clearAlignmentGuides,
    updateStatePosition,
    stopDragging,
    stopResizing,
    updateEdgePosition,
    stopWaypointDrag,
    stopLabelDrag,
    cancelTransitionCreation,
    clearSelection,
    addToast
  })

  // Canvas event handlers (click, context menu, keyboard shortcuts)
  const {
    handleCanvasClick,
    handleCanvasContextMenu,
    handleStateStartDrag,
    handleStateStartResize,
    handleStateShowToolbar,
    handleTransitionShowToolbar,
    handleAddWaypointToTransition
  } = useCanvasEvents({
    canvasRef,
    hasDraggedRef,
    pan,
    zoom,
    isCreatingTransition,
    contextMenu,
    floatingToolbar,
    isAdmin,
    states,
    transitions,
    waypoints,
    cancelTransitionCreation,
    setContextMenu,
    closeContextMenu,
    setFloatingToolbar,
    clearSelection,
    startDragging,
    startResizing,
    getDimensions,
    showStateToolbar,
    showTransitionToolbar,
    addWaypoint,
    handleCopy,
    handleCut,
    handlePaste,
    handleUndo,
    handleRedo,
    handleDeleteSelected
  })

  // ============================================
  // LOCAL STORAGE PERSISTENCE
  // ============================================
  
  const getStorageKey = (workflowId: string) => `workflow-visual-${workflowId}`
  
  // Load visual customizations from localStorage when workflow changes
  useEffect(() => {
    if (!selectedWorkflow?.id) return
    
    try {
      const stored = localStorage.getItem(getStorageKey(selectedWorkflow.id))
      if (stored) {
        const data = JSON.parse(stored)
        if (data.waypoints) setWaypoints(data.waypoints)
        if (data.labelOffsets) setLabelOffsets(data.labelOffsets)
        if (data.edgePositions) setEdgePositions(data.edgePositions)
        if (data.snapSettings) setSnapSettings(prev => ({ ...prev, ...data.snapSettings }))
      }
    } catch (e) {
      console.warn('Failed to load workflow visual data:', e)
    }
  }, [selectedWorkflow?.id])
  
  // Save visual customizations to localStorage when they change
  useEffect(() => {
    if (!selectedWorkflow?.id) return
    
    try {
      localStorage.setItem(getStorageKey(selectedWorkflow.id), JSON.stringify({
        waypoints,
        labelOffsets,
        edgePositions,
        snapSettings
      }))
    } catch (e) {
      console.warn('Failed to save workflow visual data:', e)
    }
  }, [selectedWorkflow?.id, waypoints, labelOffsets, edgePositions, snapSettings])

  // ============================================
  // RENDER
  // ============================================

  const canvasTransform = `translate(${pan.x}, ${pan.y}) scale(${zoom})`

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="flex h-full">
        <WorkflowsList
          workflows={workflows}
          selectedWorkflowId={selectedWorkflow?.id || null}
          isLoading={isLoading}
          isAdmin={isAdmin}
          onSelectWorkflow={selectWorkflow}
          onEditWorkflow={(workflow) => {
            workflowData.setSelectedWorkflow(workflow)
            setShowEditWorkflow(true)
          }}
          onCreateWorkflow={() => setShowCreateWorkflow(true)}
        />
        
        <div className="flex-1 flex flex-col">
          {selectedWorkflow && (
            <>
              <WorkflowToolbar
                workflows={workflows}
                selectedWorkflow={selectedWorkflow}
                states={states}
                isAdmin={isAdmin}
                canvasMode={canvasMode}
                zoom={zoom}
                isCreatingTransition={isCreatingTransition}
                snapSettings={snapSettings}
                showSnapSettings={showSnapSettings}
                canvasRef={canvasRef}
                importInputRef={importInputRef}
                selectWorkflow={selectWorkflow}
                setShowCreateWorkflow={setShowCreateWorkflow}
                setShowEditWorkflow={setShowEditWorkflow}
                setCanvasMode={setCanvasMode}
                cancelConnectMode={cancelConnectMode}
                setZoom={setZoom}
                setPan={setPan}
                setSnapSettings={setSnapSettings}
                setShowSnapSettings={setShowSnapSettings}
                exportWorkflow={exportWorkflow}
                importWorkflow={importWorkflow}
                addState={addState}
              />
              
              <WorkflowCanvas
                states={states}
                transitions={transitions}
                gates={gates}
                selectedStateId={selectedStateId}
                selectedTransitionId={selectedTransitionId}
                hoveredStateId={hoveredStateId}
                hoveredTransitionId={hoveredTransitionId}
                hoveredWaypoint={hoveredWaypoint}
                canvasMode={canvasMode}
                zoom={zoom}
                pan={pan}
                mousePos={mousePos}
                canvasRef={canvasRef}
                canvasTransform={canvasTransform}
                isAdmin={isAdmin}
                draggingStateId={draggingStateId}
                currentResizing={currentResizing}
                isCreatingTransition={isCreatingTransition}
                transitionStartId={transitionStartId}
                isDraggingToCreateTransition={isDraggingToCreateTransition}
                draggingTransitionEndpoint={draggingTransitionEndpoint}
                justCompletedTransitionRef={justCompletedTransitionRef}
                transitionCompletedAtRef={transitionCompletedAtRef}
                hasDraggedRef={hasDraggedRef}
                stateDimensions={stateDimensions}
                getDimensions={getDimensions}
                snapSettings={snapSettings}
                alignmentGuides={alignmentGuides}
                waypoints={waypoints}
                edgePositions={edgePositions}
                draggingCurveControl={draggingCurveControl}
                draggingWaypointIndex={draggingWaypointIndex}
                tempCurvePos={tempCurvePos}
                waypointHasDraggedRef={waypointHasDraggedRef}
                labelOffsets={labelOffsets}
                pinnedLabelPositions={pinnedLabelPositions}
                draggingLabel={draggingLabel}
                tempLabelPos={tempLabelPos}
                floatingToolbar={floatingToolbar}
                toolbarActions={toolbarActions}
                onCanvasMouseDown={handleCanvasMouseDown}
                onCanvasMouseMove={handleCanvasMouseMove}
                onCanvasMouseUp={handleCanvasMouseUp}
                onCanvasClick={handleCanvasClick}
                onCanvasContextMenu={handleCanvasContextMenu}
                onWheel={handleWheel}
                onSelectState={selectState}
                onSelectTransition={selectTransition}
                onStartDrag={handleStateStartDrag}
                onStartResize={handleStateStartResize}
                onCompleteTransition={completeTransition}
                onStartTransition={startTransition}
                onEditState={openEditState}
                onHoverState={setHoveredStateId}
                onShowStateToolbar={handleStateShowToolbar}
                onShowTransitionToolbar={handleTransitionShowToolbar}
                onAddWaypointToTransition={handleAddWaypointToTransition}
                setIsDraggingToCreateTransition={setIsDraggingToCreateTransition}
                setHoveredStateId={setHoveredStateId}
                setHoveredTransitionId={setHoveredTransitionId}
                setFloatingToolbar={setFloatingToolbar}
                setDraggingTransitionEndpoint={setDraggingTransitionEndpoint}
                setDraggingCurveControl={setDraggingCurveControl}
                setDraggingWaypointIndex={setDraggingWaypointIndex}
                setDraggingWaypointAxis={setDraggingWaypointAxis}
                setTempCurvePos={setTempCurvePos}
                setDraggingLabel={setDraggingLabel}
                setTempLabelPos={setTempLabelPos}
                setHoveredWaypoint={setHoveredWaypoint}
                setWaypoints={setWaypoints}
                setWaypointContextMenu={setWaypointContextMenu}
                setLabelOffsets={setLabelOffsets}
                setPinnedLabelPositions={setPinnedLabelPositions}
                addToast={addToast}
              />
            </>
          )}
          
          {!selectedWorkflow && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-plm-fg-muted">
                <GitBranch size={48} className="mx-auto mb-3 opacity-50" />
                <p className="text-sm">Select a workflow to edit</p>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Hidden file input for import */}
      <input
        ref={importInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            importWorkflow(file)
          }
          if (importInputRef.current) {
            importInputRef.current.value = ''
          }
        }}
      />
      
      {/* Context menu */}
      {contextMenu && (
        <WorkflowContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          type={contextMenu.type}
          isAdmin={isAdmin}
          targetState={contextMenu.type === 'state' ? states.find(s => s.id === contextMenu.targetId) : undefined}
          targetTransition={contextMenu.type === 'transition' ? transitions.find(t => t.id === contextMenu.targetId) : undefined}
          gates={contextMenu.type === 'transition' ? (gates[contextMenu.targetId] || []) : []}
          allStates={states}
          hasWaypoints={contextMenu.type === 'transition' && (waypoints[contextMenu.targetId]?.length || 0) > 0}
          onEdit={() => {
            if (contextMenu.type === 'state') {
              const state = states.find(s => s.id === contextMenu.targetId)
              if (state) openEditState(state)
            } else if (contextMenu.type === 'transition') {
              const transition = transitions.find(t => t.id === contextMenu.targetId)
              if (transition) openEditTransition(transition)
            }
            closeContextMenu()
          }}
          onDelete={() => {
            if (contextMenu.type === 'state') {
              deleteState(contextMenu.targetId)
            } else if (contextMenu.type === 'transition') {
              deleteTransition(contextMenu.targetId)
            }
            closeContextMenu()
          }}
          onAddGate={() => {
            if (contextMenu.type === 'transition') {
              addTransitionGate(contextMenu.targetId)
            }
            closeContextMenu()
          }}
          onResetWaypoints={() => {
            if (contextMenu.type === 'transition') {
              setWaypoints(prev => {
                const next = { ...prev }
                delete next[contextMenu.targetId]
                return next
              })
              addToast('info', 'Control points reset')
            }
            closeContextMenu()
          }}
          onAddState={contextMenu.type === 'canvas' ? addState : undefined}
          onClose={closeContextMenu}
        />
      )}
      
      {/* Waypoint context menu */}
      {waypointContextMenu && (
        <WaypointContextMenu
          menu={waypointContextMenu}
          transitions={transitions}
          onAddWaypoint={(transitionId, x, y, pathType) => {
            handleAddWaypointToTransition(transitionId, x, y, pathType, 'auto', 'auto')
          }}
          onRemoveWaypoint={(transitionId, waypointIndex) => {
            setWaypoints(prev => {
              const currentWaypoints = [...(prev[transitionId] || [])]
              currentWaypoints.splice(waypointIndex, 1)
              if (currentWaypoints.length === 0) {
                const next = { ...prev }
                delete next[transitionId]
                return next
              }
              return { ...prev, [transitionId]: currentWaypoints }
            })
          }}
          onResetWaypoints={(transitionId) => {
            setWaypoints(prev => {
              const next = { ...prev }
              delete next[transitionId]
              return next
            })
          }}
          onClose={() => setWaypointContextMenu(null)}
          addToast={addToast}
        />
      )}
      
      {/* Dialogs */}
      {showCreateWorkflow && (
        <CreateWorkflowDialog
          onClose={() => setShowCreateWorkflow(false)}
          onCreate={async (name, description) => {
            const success = await createWorkflow(name, description)
            if (success) {
              setShowCreateWorkflow(false)
            }
          }}
        />
      )}
      
      {showEditWorkflow && selectedWorkflow && (
        <EditWorkflowDialog
          workflow={selectedWorkflow}
          onClose={() => setShowEditWorkflow(false)}
          onSave={async (name, description) => {
            const success = await updateWorkflow(selectedWorkflow.id, { name, description })
            if (success) {
              setShowEditWorkflow(false)
            }
          }}
          onDelete={async () => {
            if (!window.confirm(`Delete "${selectedWorkflow.name}"?`)) return
            const success = await deleteWorkflow(selectedWorkflow.id)
            if (success) {
              setShowEditWorkflow(false)
            }
          }}
        />
      )}
      
      {showEditState && editingState && (
        <EditStateDialog
          state={editingState}
          onClose={closeEditState}
          onSave={async (updates) => {
            const { error } = await stateService.update(editingState.id, updates)
            
            if (error) {
              console.error('Failed to update state:', error)
              addToast('error', 'Failed to update state')
              return
            }
            
            setStates(prev => prev.map(s => 
              s.id === editingState.id ? { ...s, ...updates } : s
            ))
            closeEditState()
            addToast('success', 'State updated')
          }}
        />
      )}
      
      {showEditTransition && editingTransition && (
        <EditTransitionDialog
          transition={editingTransition}
          onClose={closeEditTransition}
          onSave={async (updates) => {
            const { error } = await transitionService.update(editingTransition.id, updates)
            
            if (error) {
              console.error('Failed to update transition:', error)
              addToast('error', 'Failed to update transition')
              return
            }
            
            setTransitions(prev => prev.map(t => 
              t.id === editingTransition.id ? { ...t, ...updates } : t
            ))
            closeEditTransition()
            addToast('success', 'Transition updated')
          }}
        />
      )}
    </div>
  )
}
