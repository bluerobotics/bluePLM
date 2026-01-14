import { Check, ExternalLink, FolderOpen, Info, Loader2 } from 'lucide-react'
import { useSolidWorksSettings } from '../hooks'

export function TemplatesTab() {
  const {
    isAdmin,
    vaultPath,
    addToast,
    orgTemplates,
    templateDocuments,
    setTemplateDocuments,
    templateSheetFormats,
    setTemplateSheetFormats,
    templateBom,
    setTemplateBom,
    templateCustomProperty,
    setTemplateCustomProperty,
    promptForTemplate,
    setPromptForTemplate,
    isSavingTemplates,
    isPushingTemplates,
    isApplyingTemplates,
    installedSwVersions,
    hasUnsavedTemplates,
    handleSaveTemplates,
    handlePushTemplates,
    handleApplyTemplates,
  } = useSolidWorksSettings()

  const handleBrowseForFolder = async (setter: (value: string) => void) => {
    const result = await window.electronAPI?.selectFolder()
    if (result?.success && result.folderPath && vaultPath) {
      // Convert to relative path if within vault
      const normalizedVault = vaultPath.replace(/\\/g, '/').toLowerCase()
      const normalizedFolder = result.folderPath.replace(/\\/g, '/').toLowerCase()
      if (normalizedFolder.startsWith(normalizedVault)) {
        const relative = result.folderPath.substring(vaultPath.length + 1)
        setter(relative)
      } else {
        addToast('warning', 'Please select a folder within the vault')
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Template Folders Configuration */}
      <div className="space-y-3">
        <label className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium">
          Template Folders {isAdmin ? '(Organization-wide)' : ''}
        </label>
        <div className="p-4 bg-plm-bg rounded-lg border border-plm-border space-y-4">
          <div className="flex items-start gap-2 text-sm text-plm-fg-muted">
            <FolderOpen size={16} className="mt-0.5 flex-shrink-0" />
            <div>
              <p>
                Configure SOLIDWORKS template folder locations within the vault. 
                When applied, SOLIDWORKS will use these folders for new documents.
              </p>
              {installedSwVersions.length > 0 ? (
                <p className="text-plm-fg-dim mt-1">
                  Detected SOLIDWORKS versions: <span className="text-plm-fg">{installedSwVersions.join(', ')}</span>
                </p>
              ) : (
                <p className="text-yellow-400/80 mt-1">
                  No SOLIDWORKS 2020+ installations detected on this computer
                </p>
              )}
            </div>
          </div>
          
          {/* Document Templates */}
          <div className="space-y-1">
            <label className="text-sm text-plm-fg-dim">Document Templates</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={templateDocuments}
                onChange={(e) => setTemplateDocuments(e.target.value)}
                placeholder="_templates/Documents"
                disabled={!isAdmin}
                className="flex-1 bg-plm-bg-secondary border border-plm-border rounded-lg px-3 py-2 text-sm font-mono text-plm-fg placeholder:text-plm-fg-dim focus:border-plm-accent focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              />
              {isAdmin && (
                <button
                  onClick={() => handleBrowseForFolder(setTemplateDocuments)}
                  className="px-3 py-2 bg-plm-bg-secondary border border-plm-border rounded-lg text-sm text-plm-fg hover:border-plm-accent transition-colors"
                >
                  Browse
                </button>
              )}
            </div>
            <div className="text-xs text-plm-fg-dim">
              Part, assembly, and drawing templates for new documents
            </div>
          </div>
          
          {/* Sheet Formats */}
          <div className="space-y-1">
            <label className="text-sm text-plm-fg-dim">Sheet Formats</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={templateSheetFormats}
                onChange={(e) => setTemplateSheetFormats(e.target.value)}
                placeholder="_templates/SheetFormats"
                disabled={!isAdmin}
                className="flex-1 bg-plm-bg-secondary border border-plm-border rounded-lg px-3 py-2 text-sm font-mono text-plm-fg placeholder:text-plm-fg-dim focus:border-plm-accent focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              />
              {isAdmin && (
                <button
                  onClick={() => handleBrowseForFolder(setTemplateSheetFormats)}
                  className="px-3 py-2 bg-plm-bg-secondary border border-plm-border rounded-lg text-sm text-plm-fg hover:border-plm-accent transition-colors"
                >
                  Browse
                </button>
              )}
            </div>
            <div className="text-xs text-plm-fg-dim">
              Drawing title blocks, borders, and sheet formats
            </div>
          </div>
          
          {/* BOM Templates */}
          <div className="space-y-1">
            <label className="text-sm text-plm-fg-dim">BOM Templates</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={templateBom}
                onChange={(e) => setTemplateBom(e.target.value)}
                placeholder="_templates/BOM"
                disabled={!isAdmin}
                className="flex-1 bg-plm-bg-secondary border border-plm-border rounded-lg px-3 py-2 text-sm font-mono text-plm-fg placeholder:text-plm-fg-dim focus:border-plm-accent focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              />
              {isAdmin && (
                <button
                  onClick={() => handleBrowseForFolder(setTemplateBom)}
                  className="px-3 py-2 bg-plm-bg-secondary border border-plm-border rounded-lg text-sm text-plm-fg hover:border-plm-accent transition-colors"
                >
                  Browse
                </button>
              )}
            </div>
            <div className="text-xs text-plm-fg-dim">
              Bill of materials table templates
            </div>
          </div>
          
          {/* Custom Property Files */}
          <div className="space-y-1">
            <label className="text-sm text-plm-fg-dim">Custom Property Files</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={templateCustomProperty}
                onChange={(e) => setTemplateCustomProperty(e.target.value)}
                placeholder="_templates/CustomProperties"
                disabled={!isAdmin}
                className="flex-1 bg-plm-bg-secondary border border-plm-border rounded-lg px-3 py-2 text-sm font-mono text-plm-fg placeholder:text-plm-fg-dim focus:border-plm-accent focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              />
              {isAdmin && (
                <button
                  onClick={() => handleBrowseForFolder(setTemplateCustomProperty)}
                  className="px-3 py-2 bg-plm-bg-secondary border border-plm-border rounded-lg text-sm text-plm-fg hover:border-plm-accent transition-colors"
                >
                  Browse
                </button>
              )}
            </div>
            <div className="text-xs text-plm-fg-dim">
              Custom property tab builder templates
            </div>
          </div>
          
          {/* Prompt for Template Toggle */}
          <div className="flex items-center justify-between pt-3 border-t border-plm-border">
            <div>
              <div className="text-sm text-plm-fg">Prompt user to select document template</div>
              <div className="text-xs text-plm-fg-muted">
                When enabled, SOLIDWORKS will show the template picker dialog when creating new documents
              </div>
            </div>
            <button
              onClick={() => isAdmin && setPromptForTemplate(!promptForTemplate)}
              disabled={!isAdmin}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                promptForTemplate ? 'bg-plm-accent' : 'bg-plm-bg-secondary'
              } ${!isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  promptForTemplate ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          
          {/* Admin Actions */}
          {isAdmin && (
            <div className="flex items-center justify-between pt-3 border-t border-plm-border">
              <div className="flex items-center gap-2">
                {hasUnsavedTemplates && (
                  <span className="text-sm text-yellow-400">Unsaved changes</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveTemplates}
                  disabled={!hasUnsavedTemplates || isSavingTemplates}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    hasUnsavedTemplates
                      ? 'bg-plm-bg-secondary text-plm-fg border border-plm-border hover:border-plm-accent'
                      : 'bg-plm-bg-secondary text-plm-fg-dim cursor-not-allowed'
                  }`}
                >
                  {isSavingTemplates ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  Save Org Defaults
                </button>
                <button
                  onClick={handlePushTemplates}
                  disabled={isPushingTemplates || (!hasUnsavedTemplates && !orgTemplates?.documentTemplates && !orgTemplates?.sheetFormats && !orgTemplates?.bomTemplates && !orgTemplates?.customPropertyFolders)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-plm-accent text-white hover:bg-plm-accent/80 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPushingTemplates ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <ExternalLink size={14} />
                  )}
                  Push to All Users
                </button>
              </div>
            </div>
          )}
          
          {/* User Actions (Apply to local SOLIDWORKS) */}
          <div className="flex items-center justify-between pt-3 border-t border-plm-border">
            <div>
              <div className="text-sm text-plm-fg">Apply to SOLIDWORKS</div>
              <div className="text-xs text-plm-fg-muted">
                Set these folders in your local SOLIDWORKS installation
              </div>
            </div>
            <button
              onClick={handleApplyTemplates}
              disabled={isApplyingTemplates || (!templateDocuments && !templateSheetFormats && !templateBom && !templateCustomProperty && !promptForTemplate)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                !templateDocuments && !templateSheetFormats && !templateBom && !templateCustomProperty && !promptForTemplate
                  ? 'bg-plm-bg-secondary text-plm-fg-dim cursor-not-allowed'
                  : isApplyingTemplates
                    ? 'bg-green-500/50 text-white cursor-wait'
                    : 'bg-green-500/20 text-green-400 border border-green-500/50 hover:bg-green-500/30'
              }`}
            >
              {isApplyingTemplates ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
              {isApplyingTemplates ? 'Applying...' : 'Apply to SOLIDWORKS'}
            </button>
          </div>
          
          {/* Last pushed info */}
          {orgTemplates?.lastPushedAt && (
            <div className="text-xs text-plm-fg-dim pt-2 border-t border-plm-border">
              Last pushed: {new Date(orgTemplates.lastPushedAt).toLocaleString()}
            </div>
          )}
          
          {/* Warning if no vault selected */}
          {!vaultPath && (
            <div className="flex items-center gap-2 text-sm text-yellow-400 pt-2 border-t border-plm-border">
              <Info size={14} />
              Select a vault to apply template settings
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
