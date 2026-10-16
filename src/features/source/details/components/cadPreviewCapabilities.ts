import type { LocalFile } from '@/stores/pdmStore'

const SOLIDWORKS_DATACARD_EXTENSIONS = new Set(['.sldprt', '.sldasm', '.slddrw'])

export function hasLocalCadPreviewContent(diffStatus: LocalFile['diffStatus']): boolean {
  return diffStatus !== 'cloud' && diffStatus !== 'moved_away'
}

export function supportsSolidWorksDatacard(extension: string | null | undefined): boolean {
  return SOLIDWORKS_DATACARD_EXTENSIONS.has(extension?.toLowerCase() ?? '')
}
