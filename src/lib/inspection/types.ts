/**
 * Wire types of the two native-inspection service commands: `extractDrawingCharacteristics`
 * (reads a drawing's dimensions, GTOLs and surface finish symbols through the plain SOLIDWORKS
 * API) and `applyInspectionBalloons` (writes BluePLM's numbered balloons on
 * the `BluePLM Inspection` layer). The shapes are the service's JSON exactly; the field lists are
 * pinned against `solidworks-service/wire-manifest.json` by `solidworksWire.contract.test.ts`.
 */

export type ExtractedCharacteristicKind = 'dimension' | 'holeCallout' | 'gtol' | 'surfaceFinish'

/** One inspectable value read from a drawing annotation. */
export interface ExtractedCharacteristic {
  /**
   * Stable key, unique within the drawing: `<baseKey>` or `<baseKey>#<n>` when one annotation
   * holds several values (hole callout, chamfer, multi-frame GTOL). It survives close / reopen /
   * rebuild and view or sheet renames, so rows keep their balloon numbers.
   */
  sourceKey: string
  /** Key of the owning annotation (SHA-1 hex prefix of its persist reference). */
  baseKey: string
  /** Base64 persist reference of the annotation's dimension / GTOL / SF symbol object. */
  persistRef: string
  /** Diagnostic only (`Drawing View3/RD2`); changes when a view or feature is renamed. */
  annotationName: string
  sheet: string
  /** Null for annotations placed on the sheet itself. */
  view: string | null
  kind: ExtractedCharacteristicKind
  /** e.g. `Linear`, `Diameter`, `Radius`, `Angular`, `Chamfer`, or the GTOL symbol name. */
  subType: string | null
  /** Formatted in drawing units with the dimension's own precision; symbols as Unicode. */
  nominal: string
  /** `mm`, `in`, `°` or null. */
  unit: string | null
  /** Signed, e.g. `+0.10`. */
  plusTolerance: string | null
  /** Signed, e.g. `-0.05`. */
  minusTolerance: string | null
  upperLimit: string | null
  lowerLimit: string | null
  /** `None`, `Bilateral`, `Symmetric`, `Limit`, `Basic`, `Min`, `Max`, `Fit`, ... */
  toleranceType: string | null
  /** Driven / parenthesised dimension. The merge planner skips these unless asked. */
  isReference: boolean
  zone: string | null
  /** Annotation position in sheet coordinates, metres. */
  x: number
  y: number
}

export interface ExtractedDrawingSheet {
  name: string
  widthM: number
  heightM: number
}

/** `data` of a successful `extractDrawingCharacteristics`. */
export interface ExtractedDrawingCharacteristics {
  /** Drawing length units, as the values are expressed. */
  units: 'mm' | 'in' | 'other'
  /** In sheet order. */
  sheets: ExtractedDrawingSheet[]
  /** In sheet order, then annotation order. */
  characteristics: ExtractedCharacteristic[]
  /**
   * Annotations found but not read. A row keyed to one of them is not "gone from the drawing":
   * the planner keeps it and never offers it for removal.
   */
  skipped: ExtractedSkippedAnnotation[]
  /** Sheets the service could not read completely; their rows are not ticked for removal. */
  incompleteSheets: string[]
}

export interface ExtractedSkippedAnnotation {
  sourceKey: string
  /** Base key of the annotation, or null when it has no persist reference. */
  baseKey: string | null
  sheet: string
  reason: string
}

/** One balloon to place. `persistRef` lets the service resolve the annotation directly. */
export interface InspectionBalloonRequest {
  sourceKey: string
  label: string
  persistRef?: string
}

/** `data` of a successful `applyInspectionBalloons`. */
export interface AppliedInspectionBalloons {
  placed: number
  /** Source keys not found in the drawing. */
  missing: string[]
  /** BluePLM balloons deleted from the layer before placing the new set. */
  removedPrevious: number
  /** Balloons placed at a position the user had moved them to by hand (service 1.25.0). */
  keptPositions: number
  saved: boolean
}

/** Error codes the two commands can return besides the generic service ones. */
export const INSPECTION_BALLOON_ERROR_CODES = {
  readOnly: 'DM_FILE_READ_ONLY',
  openInSolidWorks: 'FILE_OPEN_IN_SOLIDWORKS',
  unsavedChanges: 'DOC_HAS_UNSAVED_CHANGES',
  notADrawing: 'NOT_A_DRAWING',
  modifiedNotSaved: 'DOC_MODIFIED_NOT_SAVED',
} as const

/** The layer `applyInspectionBalloons` owns; extraction skips annotations on it. */
export const INSPECTION_BALLOON_LAYER = 'BluePLM Inspection'
