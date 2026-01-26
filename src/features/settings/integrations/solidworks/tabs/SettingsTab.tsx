import { Image, ExternalLink, FolderOpen, Info, EyeOff, FileX, FileInput, Hash, FileText } from 'lucide-react'
import { useSolidWorksSettings } from '../hooks'

export function SettingsTab() {
  const {
    cadPreviewMode,
    setCadPreviewMode,
    solidworksPath,
    setSolidworksPath,
    hideSolidworksTempFiles,
    setHideSolidworksTempFiles,
    ignoreSolidworksTempFiles,
    setIgnoreSolidworksTempFiles,
    lockDrawingRevision,
    setLockDrawingRevision,
    lockDrawingItemNumber,
    setLockDrawingItemNumber,
    lockDrawingDescription,
    setLockDrawingDescription,
  } = useSolidWorksSettings()

  return (
    <div className="space-y-6">
      {/* Preview Mode */}
      <div className="space-y-3">
        <label className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium">
          Preview Mode
        </label>
        <div className="space-y-2">
          <button
            onClick={() => setCadPreviewMode('thumbnail')}
            className={`w-full flex items-center gap-4 p-4 rounded-lg border transition-colors ${
              cadPreviewMode === 'thumbnail'
                ? 'bg-plm-accent/10 border-plm-accent text-plm-fg'
                : 'bg-plm-bg border-plm-border text-plm-fg-muted hover:border-plm-fg-muted'
            }`}
          >
            <Image size={24} className={cadPreviewMode === 'thumbnail' ? 'text-plm-accent' : ''} />
            <div className="text-left">
              <div className="text-base font-medium">Embedded Thumbnail</div>
              <div className="text-sm opacity-70">
                Extract and show preview image from SolidWorks file
              </div>
            </div>
          </button>

          <button
            onClick={() => setCadPreviewMode('edrawings')}
            className={`w-full flex items-center gap-4 p-4 rounded-lg border transition-colors ${
              cadPreviewMode === 'edrawings'
                ? 'bg-plm-accent/10 border-plm-accent text-plm-fg'
                : 'bg-plm-bg border-plm-border text-plm-fg-muted hover:border-plm-fg-muted'
            }`}
          >
            <ExternalLink size={24} className={cadPreviewMode === 'edrawings' ? 'text-plm-accent' : ''} />
            <div className="text-left">
              <div className="text-base font-medium">eDrawings (External)</div>
              <div className="text-sm opacity-70">
                Open files in external eDrawings application
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Temp Files (~$) */}
      <div className="space-y-3">
        <label className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium">
          Temporary Lock Files (~$)
        </label>
        <div className="p-4 bg-plm-bg rounded-lg border border-plm-border space-y-4">
          <div className="flex items-start gap-2 text-sm text-plm-fg-muted">
            <Info size={16} className="mt-0.5 flex-shrink-0" />
            <span>
              SolidWorks creates temporary <code className="px-1.5 py-0.5 bg-plm-bg-secondary rounded">~$filename.sldprt</code> lock files when files are open.
              These indicate a file is being edited and are automatically deleted when closed.
            </span>
          </div>
          
          {/* Hide toggle */}
          <div className="flex items-center justify-between pt-2 border-t border-plm-border">
            <div className="flex items-center gap-3">
              <EyeOff size={18} className="text-plm-fg-muted" />
              <div>
                <div className="text-sm text-plm-fg">Hide from file browser</div>
                <div className="text-xs text-plm-fg-muted">
                  Don't show ~$ temp files in the file list
                </div>
              </div>
            </div>
            <button
              onClick={() => setHideSolidworksTempFiles(!hideSolidworksTempFiles)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                hideSolidworksTempFiles ? 'bg-plm-accent' : 'bg-plm-bg-secondary'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  hideSolidworksTempFiles ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          
          {/* Ignore toggle */}
          <div className="flex items-center justify-between pt-2 border-t border-plm-border">
            <div className="flex items-center gap-3">
              <FileX size={18} className="text-plm-fg-muted" />
              <div>
                <div className="text-sm text-plm-fg">Ignore from sync</div>
                <div className="text-xs text-plm-fg-muted">
                  Skip ~$ files during check-in and sync operations
                </div>
              </div>
            </div>
            <button
              onClick={() => setIgnoreSolidworksTempFiles(!ignoreSolidworksTempFiles)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                ignoreSolidworksTempFiles ? 'bg-plm-accent' : 'bg-plm-bg-secondary'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  ignoreSolidworksTempFiles ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Drawing Metadata Lockouts */}
      <div className="space-y-3">
        <label className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium">
          Drawing Metadata
        </label>
        <div className="p-4 bg-plm-bg rounded-lg border border-plm-border space-y-4">
          <div className="flex items-start gap-2 text-sm text-plm-fg-muted">
            <Info size={16} className="mt-0.5 flex-shrink-0" />
            <span>
              Drawing files (.slddrw) typically inherit their metadata from the model they reference. 
              When locked, these fields are read-only and show a <FileInput size={12} className="inline mx-0.5" /> indicator.
            </span>
          </div>
          
          {/* Lock Revision toggle */}
          <div className="flex items-center justify-between pt-2 border-t border-plm-border">
            <div className="flex items-center gap-3">
              <FileInput size={18} className="text-plm-fg-muted" />
              <div>
                <div className="text-sm text-plm-fg">Lock drawing revision</div>
                <div className="text-xs text-plm-fg-muted">
                  Revision comes from the drawing's revision table
                </div>
              </div>
            </div>
            <button
              onClick={() => setLockDrawingRevision(!lockDrawingRevision)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                lockDrawingRevision ? 'bg-plm-accent' : 'bg-plm-bg-secondary'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  lockDrawingRevision ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          
          {/* Lock Item Number toggle */}
          <div className="flex items-center justify-between pt-2 border-t border-plm-border">
            <div className="flex items-center gap-3">
              <Hash size={18} className="text-plm-fg-muted" />
              <div>
                <div className="text-sm text-plm-fg">Lock drawing item number</div>
                <div className="text-xs text-plm-fg-muted">
                  Item number inherited from referenced model
                </div>
              </div>
            </div>
            <button
              onClick={() => setLockDrawingItemNumber(!lockDrawingItemNumber)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                lockDrawingItemNumber ? 'bg-plm-accent' : 'bg-plm-bg-secondary'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  lockDrawingItemNumber ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          
          {/* Lock Description toggle */}
          <div className="flex items-center justify-between pt-2 border-t border-plm-border">
            <div className="flex items-center gap-3">
              <FileText size={18} className="text-plm-fg-muted" />
              <div>
                <div className="text-sm text-plm-fg">Lock drawing description</div>
                <div className="text-xs text-plm-fg-muted">
                  Description inherited from referenced model
                </div>
              </div>
            </div>
            <button
              onClick={() => setLockDrawingDescription(!lockDrawingDescription)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                lockDrawingDescription ? 'bg-plm-accent' : 'bg-plm-bg-secondary'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  lockDrawingDescription ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Installation Path */}
      <div className="space-y-3">
        <label className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium">
          SolidWorks Installation Path
        </label>
        <div className="p-4 bg-plm-bg rounded-lg border border-plm-border space-y-3">
          <div className="flex items-start gap-3">
            <FolderOpen size={20} className="text-plm-fg-muted mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0 flex gap-2">
              <input
                type="text"
                value={solidworksPath || ''}
                onChange={(e) => setSolidworksPath(e.target.value || null)}
                placeholder="C:\Program Files\SOLIDWORKS Corp\SOLIDWORKS"
                className="flex-1 bg-plm-bg-secondary border border-plm-border rounded-lg px-3 py-2 text-base font-mono text-plm-fg placeholder:text-plm-fg-dim focus:border-plm-accent focus:outline-none"
              />
              <button
                onClick={async () => {
                  const result = await window.electronAPI?.selectFolder()
                  if (result?.success && result.folderPath) {
                    setSolidworksPath(result.folderPath)
                  }
                }}
                className="px-3 py-2 bg-plm-bg-secondary border border-plm-border rounded-lg text-sm text-plm-fg hover:border-plm-accent transition-colors flex-shrink-0"
              >
                Browse
              </button>
            </div>
          </div>
          <div className="flex items-start gap-2 text-sm text-plm-fg-muted">
            <Info size={16} className="mt-0.5 flex-shrink-0" />
            <span>Only needed if SolidWorks is installed in a non-default location.</span>
          </div>
        </div>
      </div>
    </div>
  )
}
