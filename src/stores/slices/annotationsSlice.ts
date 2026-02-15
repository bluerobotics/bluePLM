/**
 * Annotations Slice - Zustand state for PDF comment/annotation UI.
 *
 * Manages the local state of annotations displayed alongside a PDF preview
 * in the DetailsPanel. This is session-only data (NOT persisted) because
 * annotations are fetched from Supabase when a file is selected and
 * discarded when the user navigates away.
 *
 * Threading model: top-level annotations have `parent_id === null`;
 * replies have `parent_id` pointing to the root comment.  The flat list
 * stored here is assembled into a tree by the UI components using the
 * same logic as `buildThreadTree` in `annotations.ts`.
 */
import { StateCreator } from 'zustand'
import type { PDMStoreState, AnnotationsSlice } from '../types'

export const createAnnotationsSlice: StateCreator<
  PDMStoreState,
  [['zustand/persist', unknown]],
  [],
  AnnotationsSlice
> = (set, _get) => ({
  // ═══════════════════════════════════════════════════════════════
  // Initial State
  // ═══════════════════════════════════════════════════════════════

  /** Threaded annotations for the currently viewed file */
  annotations: [],

  /** Whether annotations are being fetched from the server */
  annotationsLoading: false,

  /** The annotation (thread root) currently highlighted / scrolled to */
  activeAnnotationId: null,

  /** Which file's annotations are currently loaded (avoids stale data) */
  annotationFileId: null,

  /** Whether the new-comment input panel is visible */
  showCommentInput: false,

  /** Pending annotation data created by area/text selection before the user types a comment */
  pendingAnnotation: null,

  // ═══════════════════════════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════════════════════════

  setAnnotations: (annotations) => set({ annotations }),

  addAnnotation: (annotation) =>
    set((s) => ({ annotations: [...s.annotations, annotation] })),

  updateAnnotationInStore: (id, updates) =>
    set((s) => ({
      annotations: s.annotations.map((a) =>
        a.id === id ? { ...a, ...updates } : a,
      ),
    })),

  removeAnnotation: (id) =>
    set((s) => ({
      annotations: s.annotations.filter((a) => a.id !== id),
    })),

  setActiveAnnotationId: (id) => set({ activeAnnotationId: id }),

  setAnnotationFileId: (fileId) => set({ annotationFileId: fileId }),

  setShowCommentInput: (show) => set({ showCommentInput: show }),

  setPendingAnnotation: (data) => set({ pendingAnnotation: data }),

  clearAnnotations: () =>
    set({
      annotations: [],
      annotationsLoading: false,
      activeAnnotationId: null,
      annotationFileId: null,
      showCommentInput: false,
      pendingAnnotation: null,
    }),
})
