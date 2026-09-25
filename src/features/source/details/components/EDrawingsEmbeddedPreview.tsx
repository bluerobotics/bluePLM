import { ExternalLink, FileBox, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '@/lib/i18n'
import { log } from '@/lib/logger'

type PreviewState = 'loading' | 'ready' | 'unavailable' | 'error'

interface EDrawingsEmbeddedPreviewProps {
  fileName: string
  filePath: string
  onOpenExternal: () => void
}

/**
 * Optional Windows-only preview. The native process is explicitly created and
 * destroyed for this panel, so it can never adopt an eDrawings window opened by
 * the user outside BluePLM.
 */
export function EDrawingsEmbeddedPreview({
  fileName,
  filePath,
  onOpenExternal,
}: EDrawingsEmbeddedPreviewProps) {
  const { t } = useTranslation()
  const host = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<PreviewState>('loading')

  useEffect(() => {
    let disposed = false
    let observer: ResizeObserver | undefined

    const destroy = () => window.electronAPI?.destroyEDrawingsPreview().catch(() => undefined)
    const syncBounds = async () => {
      const rect = host.current?.getBoundingClientRect()
      if (!rect || rect.width < 1 || rect.height < 1) return
      const scale = window.devicePixelRatio || 1
      await window.electronAPI?.setEDrawingsBounds(
        rect.left * scale,
        rect.top * scale,
        rect.width * scale,
        rect.height * scale,
      )
    }

    const start = async () => {
      const api = window.electronAPI
      if (!api || !(await api.isEDrawingsNativeAvailable())) {
        if (!disposed) setState('unavailable')
        return
      }
      const created = await api.createEDrawingsPreview()
      const attached = created.success ? await api.attachEDrawingsPreview() : created
      // The Windows host embeds itself during process creation, so it needs
      // the final panel bounds before we start it rather than afterwards.
      if (attached.success) await syncBounds()
      const loaded = attached.success ? await api.loadEDrawingsFile(filePath) : attached
      if (disposed) return
      if (!loaded.success) {
        log.error('[EDrawingsPreview]', 'Failed to load embedded preview', {
          error: loaded.error,
          filePath,
        })
        setState('error')
        void destroy()
        return
      }
      await syncBounds()
      await api.showEDrawingsPreview()
      if (disposed) return
      observer = new ResizeObserver(() => void syncBounds())
      if (host.current) observer.observe(host.current)
      window.addEventListener('resize', syncBounds)
      setState('ready')
    }

    void start().catch((error) => {
      log.error('[EDrawingsPreview]', 'Failed to start embedded preview', {
        error: error instanceof Error ? error.message : String(error),
        filePath,
      })
      if (!disposed) setState('error')
      void destroy()
    })
    return () => {
      disposed = true
      observer?.disconnect()
      window.removeEventListener('resize', syncBounds)
      void destroy()
    }
  }, [filePath])

  return (
    <div ref={host} className="h-full flex-1 relative min-h-0 bg-plm-bg rounded overflow-hidden">
      {state === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-plm-fg-muted gap-3">
          <Loader2 className="animate-spin" size={28} />
          <span className="text-sm">{t('solidworksSettings.previewStarting')}</span>
        </div>
      )}
      {state !== 'loading' && state !== 'ready' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
          <FileBox size={42} className="mb-3 text-plm-accent" />
          <div className="text-sm font-medium">{fileName}</div>
          <p className="text-xs text-plm-fg-muted mt-2 max-w-sm">
            {state === 'unavailable'
              ? t('solidworksSettings.previewUnavailable')
              : t('solidworksSettings.previewStartFailed')}
          </p>
          <button onClick={onOpenExternal} className="btn btn-secondary gap-2 mt-4">
            <ExternalLink size={16} />
            {t('solidworksSettings.openInEDrawings')}
          </button>
        </div>
      )}
    </div>
  )
}
