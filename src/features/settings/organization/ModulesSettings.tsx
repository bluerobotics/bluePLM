import { useState, useEffect } from 'react'
import * as LucideIcons from 'lucide-react'
import {
  RotateCcw,
  Save,
  Download,
  Loader2,
  Users,
  ExternalLink
} from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'
import { supabase } from '@/lib/supabase'
import { ModulesEditor } from './ModulesEditor'

// Team type for module defaults display
interface TeamWithModules {
  id: string
  name: string
  color: string
  icon: string
  module_defaults: Record<string, unknown> | null
  member_count: number
}

export function ModulesSettings() {
  const { 
    moduleConfig, 
    setModuleConfig,
    resetModulesToDefaults,
    loadOrgModuleDefaults,
    saveOrgModuleDefaults,
    getEffectiveRole,
    organization,
    setActiveView
  } = usePDMStore()
  
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [saveResult, setSaveResult] = useState<'success' | 'error' | null>(null)
  
  // Teams with module defaults
  const [teamsWithModules, setTeamsWithModules] = useState<TeamWithModules[]>([])
  const [_teamsLoading, setTeamsLoading] = useState(false)
  
  const isAdmin = getEffectiveRole() === 'admin'
  
  // Load teams with module defaults
  useEffect(() => {
    if (organization?.id) {
      loadTeamsWithModules()
    }
  }, [organization?.id])
  
  const loadTeamsWithModules = async () => {
    if (!organization?.id) return
    
    setTeamsLoading(true)
    try {
      const { data, error } = await supabase
        .from('teams')
        .select(`
          id,
          name,
          color,
          icon,
          module_defaults,
          team_members(count)
        `)
        .eq('org_id', organization.id)
        .not('module_defaults', 'is', null)
        .order('name')
      
      if (error) throw error
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const teamsWithCounts = (data || []).map((team: any) => ({
        ...team,
        member_count: team.team_members?.[0]?.count || 0
      }))
      
      setTeamsWithModules(teamsWithCounts)
    } catch (err) {
      console.error('Failed to load teams with modules:', err)
    } finally {
      setTeamsLoading(false)
    }
  }
  
  const handleSaveOrgDefaults = async () => {
    setIsSaving(true)
    setSaveResult(null)
    try {
      const result = await saveOrgModuleDefaults()
      setSaveResult(result.success ? 'success' : 'error')
      setTimeout(() => setSaveResult(null), 3000)
    } finally {
      setIsSaving(false)
    }
  }
  
  const handleLoadOrgDefaults = async () => {
    setIsLoading(true)
    try {
      await loadOrgModuleDefaults()
    } finally {
      setIsLoading(false)
    }
  }
  
  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-plm-fg">Modules</h1>
          <p className="text-sm text-plm-fg-muted mt-1">
            Enable, disable, and reorder sidebar modules
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={handleSaveOrgDefaults}
              disabled={isSaving}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                saveResult === 'success'
                  ? 'bg-plm-success/20 text-plm-success border border-plm-success/30'
                  : saveResult === 'error'
                  ? 'bg-plm-error/20 text-plm-error border border-plm-error/30'
                  : 'bg-plm-accent text-white hover:bg-plm-accent/80'
              }`}
              title="Save as organization defaults for new members"
            >
              {isSaving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              {saveResult === 'success' ? 'Saved!' : saveResult === 'error' ? 'Failed' : 'Save Defaults'}
            </button>
          )}
          <button
            onClick={handleLoadOrgDefaults}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-plm-border text-plm-fg-muted hover:text-plm-fg hover:bg-plm-highlight transition-colors disabled:opacity-50"
            title="Load organization defaults"
          >
            {isLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            Load Defaults
          </button>
          <button
            onClick={resetModulesToDefaults}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-plm-border text-plm-fg-muted hover:text-plm-fg hover:bg-plm-highlight transition-colors"
            title="Reset to factory defaults"
          >
            <RotateCcw size={14} />
            Reset
          </button>
        </div>
      </div>
      
      {/* Main Module Editor */}
      <ModulesEditor 
        config={moduleConfig}
        onConfigChange={setModuleConfig}
      />
      
      {/* Teams with Module Defaults */}
      {teamsWithModules.length > 0 && (
        <section className="pb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium flex items-center gap-2">
              <Users size={14} />
              Teams with Custom Module Defaults
            </h2>
            <button
              onClick={() => setActiveView('settings')}
              className="text-xs text-plm-accent hover:text-plm-accent/80 flex items-center gap-1"
            >
              Manage in Teams Settings
              <ExternalLink size={10} />
            </button>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {teamsWithModules.map(team => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const IconComponent = (LucideIcons as any)[team.icon] || Users
              const defaults = team.module_defaults as { enabled_modules?: Record<string, boolean> } | null
              const enabledCount = defaults?.enabled_modules 
                ? Object.values(defaults.enabled_modules).filter(Boolean).length 
                : 0
              
              return (
                <div
                  key={team.id}
                  className="flex items-center gap-3 p-3 bg-plm-bg rounded-lg border border-plm-border hover:border-plm-accent/30 transition-colors"
                >
                  <div
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: `${team.color}20`, color: team.color }}
                  >
                    <IconComponent size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-plm-fg truncate">{team.name}</div>
                    <div className="text-xs text-plm-fg-muted">
                      {enabledCount} modules • {team.member_count} member{team.member_count !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-green-500" title="Has custom module defaults" />
                </div>
              )
            })}
          </div>
          
          <p className="text-xs text-plm-fg-dim mt-3">
            Team members inherit these module defaults instead of organization defaults.
          </p>
        </section>
      )}
    </div>
  )
}
