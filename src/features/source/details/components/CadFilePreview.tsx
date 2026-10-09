import { Download, ExternalLink, Eye, FileBox, RotateCw, ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { SWDatacardPanel } from '@/features/integrations/solidworks'
import { useRetryableImage } from '@/hooks/useRetryableImage'
import { t } from '@/lib/i18n'
import { log } from '@/lib/logger'
import { buildThumbnailUrl } from '@/lib/thumbnailUrl'
import { usePDMStore, type LocalFile } from '@/stores/pdmStore'

import { resolveCadPreviewVariant } from './cadPreviewVariant'
import { EmbeddedCadPreview } from './EmbeddedCadPreview'
import { openCadFileInEDrawings } from './openCadFileInEDrawings'

interface CadFilePreviewProps {
  file: LocalFile
  solidWorks?: boolean
  embeddedAvailable?: boolean
}

export function CadFilePreview({
  file,
  solidWorks = false,
  embeddedAvailable = true,
}: CadFilePreviewProps) {
  const cadPreviewMode = usePDMStore((state) => state.cadPreviewMode)
  const addToast = usePDMStore((state) => state.addToast)
  const [cadZoom, setCadZoom] = useState(100)
  const [eDrawingsInstalled, setEDrawingsInstalled] = useState(false)

  useEffect(() => {
    setCadZoom(100)
  }, [file.path])

  useEffect(() => {
    const checkEDrawings = async () => {
      if (!window.electronAPI?.checkEDrawingsInstalled) return
      try {
        const result = await window.electronAPI.checkEDrawingsInstalled()
        setEDrawingsInstalled(result.installed)
      } catch (error) {
        log.error('[CadFilePreview]', 'Failed to check eDrawings', { error })
      }
    }
    void checkEDrawings()
  }, [])

  const cadPreviewUrl = useMemo(
    () =>
      solidWorks || cadPreviewMode === 'edrawings' ? null : buildThumbnailUrl(file, 'preview'),
    [cadPreviewMode, file, solidWorks],
  )
  const { src: cadThumbnail, onError: onCadPreviewError } = useRetryableImage(cadPreviewUrl)

  const openInEDrawings = async () => {
    await openCadFileInEDrawings(file.path, {
      openFile: window.electronAPI?.openInEDrawings,
      onFailure: (error) => {
        log.error('[CadFilePreview]', 'Failed to open in eDrawings', { error })
        addToast('error', t('solidworksSettings.openInEDrawingsFailed'))
      },
    })
  }

  const variant = resolveCadPreviewVariant({
    mode: cadPreviewMode,
    solidWorks,
    hasThumbnail: Boolean(cadThumbnail),
    eDrawingsInstalled,
    embeddedAvailable,
  })

  if (variant === 'datacard') return <SWDatacardPanel file={file} />
  if (variant === 'embedded') {
    return <EmbeddedCadPreview file={file} onOpenExternal={openInEDrawings} />
  }

  return (
    <div className="w-full h-full flex flex-col">
      {variant === 'external' ? (
        <div className="flex-1 flex flex-col items-center justify-center">
          <FileBox size={48} className="mb-4 text-plm-accent" />
          <div className="text-sm font-medium mb-2">{file.name}</div>
          <button onClick={openInEDrawings} className="btn btn-primary gap-2">
            <ExternalLink size={16} />
            {t('source.details.openInEDrawings')}
          </button>
          <div className="text-xs text-plm-fg-muted mt-4">
            {t('source.details.externalViewerNote')}
          </div>
        </div>
      ) : variant === 'missing-edrawings' ? (
        <MissingEDrawings messageKey="source.details.eDrawingsNotFound" />
      ) : variant === 'thumbnail' && cadThumbnail ? (
        <div className="flex-1 flex flex-col min-h-0">
          <div
            className="flex-1 min-h-0 flex items-center justify-center bg-gradient-to-b from-gray-800 to-gray-900 rounded overflow-auto relative"
            onWheel={(event) => {
              if (event.ctrlKey || event.metaKey) {
                event.preventDefault()
                const delta = event.deltaY > 0 ? -10 : 10
                setCadZoom((previous) => Math.max(25, Math.min(400, previous + delta)))
              }
            }}
          >
            <img
              src={cadThumbnail}
              alt={file.name}
              className="object-contain transition-transform duration-150"
              decoding="async"
              onError={onCadPreviewError}
              style={{
                width: cadZoom === 100 ? '100%' : 'auto',
                height: cadZoom === 100 ? '100%' : 'auto',
                maxWidth: cadZoom === 100 ? '100%' : 'none',
                maxHeight: cadZoom === 100 ? '100%' : 'none',
                transform: cadZoom !== 100 ? `scale(${cadZoom / 100})` : undefined,
                transformOrigin: 'center center',
              }}
            />
          </div>
          <div className="flex items-center justify-center gap-2 py-2 border-t border-plm-border">
            <button
              onClick={() => setCadZoom((previous) => Math.max(25, previous - 25))}
              className="btn btn-sm btn-ghost p-1"
              title={t('source.details.zoomOut')}
              disabled={cadZoom <= 25}
            >
              <ZoomOut size={16} />
            </button>
            <span className="text-xs text-plm-fg-muted w-12 text-center">{cadZoom}%</span>
            <button
              onClick={() => setCadZoom((previous) => Math.min(400, previous + 25))}
              className="btn btn-sm btn-ghost p-1"
              title={t('source.details.zoomIn')}
              disabled={cadZoom >= 400}
            >
              <ZoomIn size={16} />
            </button>
            <button
              onClick={() => setCadZoom(100)}
              className="btn btn-sm btn-ghost p-1 ml-2"
              title={t('source.details.resetToFit')}
              disabled={cadZoom === 100}
            >
              <RotateCw size={14} />
            </button>
            {eDrawingsInstalled && (
              <button
                onClick={openInEDrawings}
                className="btn btn-sm btn-secondary gap-1 ml-2"
                title={t('source.details.openInFullEDrawings')}
              >
                <ExternalLink size={12} />
                {t('source.details.eDrawingsLabel')}
              </button>
            )}
          </div>
        </div>
      ) : variant === 'external-fallback' ? (
        <div className="flex-1 flex flex-col items-center justify-center">
          <FileBox size={48} className="mb-4 text-plm-accent" />
          <div className="text-sm font-medium mb-2">{file.name}</div>
          <div className="text-xs text-plm-fg-muted mb-4">
            {t('source.details.noEmbeddedPreview')}
          </div>
          <button onClick={openInEDrawings} className="btn btn-primary gap-2">
            <ExternalLink size={16} />
            {t('source.details.openInEDrawings')}
          </button>
        </div>
      ) : (
        <MissingEDrawings messageKey="source.details.noPreviewAvailable" />
      )}
    </div>
  )
}

interface MissingEDrawingsProps {
  messageKey: string
}

function MissingEDrawings({ messageKey }: MissingEDrawingsProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      <Eye size={48} className="mb-4 text-plm-fg-muted opacity-50" />
      <div className="text-lg font-medium mb-2">{t(messageKey)}</div>
      <div className="text-sm text-plm-fg-muted mb-4 max-w-xs">
        {t('source.details.installEDrawings')}
      </div>
      <a
        href="https://www.solidworks.com/support/free-downloads"
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-primary gap-2"
        onClick={(event) => {
          event.preventDefault()
          window.electronAPI?.openFile('https://www.solidworks.com/support/free-downloads')
        }}
      >
        <Download size={16} />
        {t('source.details.downloadEDrawings')}
      </a>
    </div>
  )
}
