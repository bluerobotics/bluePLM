import type { CadPreviewMode } from '@/types/cadPreviewMode'

interface CadPreviewAvailability {
  mode: CadPreviewMode
  solidWorks: boolean
  hasThumbnail: boolean
  eDrawingsInstalled: boolean
  embeddedAvailable?: boolean
}

export type CadPreviewVariant =
  | 'datacard'
  | 'embedded'
  | 'external'
  | 'missing-edrawings'
  | 'thumbnail'
  | 'external-fallback'
  | 'unavailable'

export function resolveCadPreviewVariant({
  mode,
  solidWorks,
  hasThumbnail,
  eDrawingsInstalled,
  embeddedAvailable = true,
}: CadPreviewAvailability): CadPreviewVariant {
  if (solidWorks) {
    return mode === 'edrawings-embedded' && embeddedAvailable ? 'embedded' : 'datacard'
  }
  if (mode === 'edrawings-embedded') {
    if (embeddedAvailable) return 'embedded'
    return eDrawingsInstalled ? 'external-fallback' : 'unavailable'
  }
  if (mode === 'edrawings') return eDrawingsInstalled ? 'external' : 'missing-edrawings'
  if (hasThumbnail) return 'thumbnail'
  return eDrawingsInstalled ? 'external-fallback' : 'unavailable'
}
