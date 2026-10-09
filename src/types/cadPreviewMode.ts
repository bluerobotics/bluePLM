export const CAD_PREVIEW_MODES = ['thumbnail', 'edrawings', 'edrawings-embedded'] as const

export type CadPreviewMode = (typeof CAD_PREVIEW_MODES)[number]

export function isCadPreviewMode(value: unknown): value is CadPreviewMode {
  return typeof value === 'string' && CAD_PREVIEW_MODES.some((mode) => mode === value)
}
