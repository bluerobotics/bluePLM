import { useState, useEffect } from 'react'
import type React from 'react'
import * as LucideIcons from 'lucide-react'
import { Users, X, Loader2, Trash2 } from 'lucide-react'
import { log } from '@/lib/logger'
import { usePDMStore } from '@/stores/pdmStore'
import { ModulesEditor } from '../../../ModulesEditor'
import type { ModuleConfig } from '@/types/modules'
import type { TeamModulesDialogProps } from '../../types'

export function TeamModulesDialog({
  team,
  onClose
}: TeamModulesDialogProps) {
  const { addToast, loadTeamModuleDefaults, saveTeamModuleDefaults, clearTeamModuleDefaults, moduleConfig } = usePDMStore()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  
  // Local state for the full module config
  const [localConfig, setLocalConfig] = useState<ModuleConfig | null>(null)
  
  const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number }>>)[team.icon] || Users
  
  // Load team defaults on mount
  useEffect(() => {
    loadDefaults()
  }, [team.id])
  
  const loadDefaults = async () => {
    setIsLoading(true)
    try {
      const result = await loadTeamModuleDefaults(team.id)
      if (result.success && result.defaults) {
        // Team has custom defaults - use them
        setLocalConfig({
          enabledModules: result.defaults.enabledModules || {},
          enabledGroups: result.defaults.enabledGroups || {},
          moduleOrder: result.defaults.moduleOrder || moduleConfig.moduleOrder,
          dividers: result.defaults.dividers || [],
          moduleParents: result.defaults.moduleParents || {},
          moduleIconColors: result.defaults.moduleIconColors || {},
          customGroups: result.defaults.customGroups || []
        } as ModuleConfig)
      } else {
        // No team defaults, initialize with current app config (including groups, parents, etc.)
        setLocalConfig({
          enabledModules: { ...moduleConfig.enabledModules },
          enabledGroups: { ...moduleConfig.enabledGroups },
          moduleOrder: [...moduleConfig.moduleOrder],
          dividers: [...(moduleConfig.dividers || [])],
          moduleParents: { ...moduleConfig.moduleParents },
          moduleIconColors: { ...moduleConfig.moduleIconColors },
          customGroups: [...(moduleConfig.customGroups || [])]
        } as ModuleConfig)
      }
    } catch (err) {
      log.error('[TeamModules]', 'Failed to load team defaults', { error: err })
      addToast('error', 'Failed to load team module defaults')
    } finally {
      setIsLoading(false)
    }
  }
  
  const handleConfigChange = (newConfig: ModuleConfig) => {
    setLocalConfig(newConfig)
    setHasChanges(true)
  }
  
  const handleSaveDefaults = async () => {
    if (!localConfig) return
    
    setIsSaving(true)
    try {
      const result = await saveTeamModuleDefaults(team.id, localConfig)
      if (result.success) {
        addToast('success', `Module defaults saved for ${team.name}`)
        setHasChanges(false)
        onClose()
      } else {
        addToast('error', result.error || 'Failed to save defaults')
      }
    } catch (err) {
      log.error('[TeamModules]', 'Failed to save team defaults', { error: err })
      addToast('error', 'Failed to save team module defaults')
    } finally {
      setIsSaving(false)
    }
  }
  
  const handleClearDefaults = async () => {
    setShowClearConfirm(false)
    setIsSaving(true)
    try {
      const result = await clearTeamModuleDefaults(team.id)
      if (result.success) {
        addToast('success', `Module defaults cleared for ${team.name}`)
        onClose()
      } else {
        addToast('error', result.error || 'Failed to clear defaults')
      }
    } catch (err) {
      log.error('[TeamModules]', 'Failed to clear team defaults', { error: err })
      addToast('error', 'Failed to clear team module defaults')
    } finally {
      setIsSaving(false)
    }
  }
  
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={onClose}>
      <div 
        className="bg-plm-bg-light border border-plm-border rounded-xl max-w-4xl w-full mx-4 max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-plm-border flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div 
              className="p-2 rounded-lg"
              style={{ backgroundColor: `${team.color}20`, color: team.color }}
            >
              <IconComponent size={20} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-plm-fg">{team.name} - Module Defaults</h3>
              <p className="text-sm text-plm-fg-muted">Configure sidebar modules for team members</p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm">
            <X size={18} />
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-plm-fg-muted" />
            </div>
          ) : localConfig ? (
            <div className="space-y-4">
              <p className="text-sm text-plm-fg-muted">
                Configure which modules are enabled and how they appear for members of this team. 
                Drag to reorder, create groups, and toggle modules on/off. 
                If a user is in multiple teams, they get a <strong>union</strong> of all enabled modules.
              </p>
              
              <ModulesEditor
                config={localConfig}
                onConfigChange={handleConfigChange}
                showDescription={false}
              />
            </div>
          ) : null}
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-plm-border flex items-center justify-between flex-shrink-0">
          <button
            onClick={() => setShowClearConfirm(true)}
            disabled={isSaving || !team.module_defaults}
            className="btn btn-ghost text-plm-error hover:bg-plm-error/10 disabled:opacity-50"
          >
            <Trash2 size={14} className="mr-1.5" />
            Clear Defaults
          </button>
          
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn btn-ghost" disabled={isSaving}>
              Cancel
            </button>
            <button
              onClick={handleSaveDefaults}
              disabled={isSaving || isLoading || !hasChanges}
              className="btn btn-primary"
            >
              {isSaving ? (
                <>
                  <Loader2 size={14} className="mr-1.5 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Defaults'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Clear Defaults Confirmation Dialog */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center" onClick={() => setShowClearConfirm(false)}>
          <div className="bg-plm-bg-light border border-plm-border rounded-xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-medium text-plm-fg mb-4">Clear Module Defaults</h3>
            <p className="text-base text-plm-fg-muted mb-4">
              Are you sure you want to clear module defaults for <strong>{team.name}</strong>? Team members will use organization or app defaults instead.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowClearConfirm(false)} className="btn btn-ghost">
                Cancel
              </button>
              <button
                onClick={handleClearDefaults}
                className="btn bg-plm-error text-white hover:bg-plm-error/90"
              >
                Clear Defaults
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
