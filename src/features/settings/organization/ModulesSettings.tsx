import { useState, useEffect } from 'react'
import * as LucideIcons from 'lucide-react'
import {
  AlertTriangle,
  Check,
  Download,
  ExternalLink,
  RotateCcw,
  Save,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { Badge, Button, Callout } from '@/components/core/ui'
import {
  SettingRow,
  SettingsGroup,
  SettingsPage,
  SettingsSection,
} from '@/features/settings/components/ui'
import { useDeniedModules } from '@/hooks/useDeniedModules'
import { log } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import { usePDMStore } from '@/stores/pdmStore'

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
    forceOrgModuleDefaults,
    getEffectiveRole,
    organization,
  } = usePDMStore(
    useShallow((s) => ({
      moduleConfig: s.moduleConfig,
      setModuleConfig: s.setModuleConfig,
      resetModulesToDefaults: s.resetModulesToDefaults,
      loadOrgModuleDefaults: s.loadOrgModuleDefaults,
      saveOrgModuleDefaults: s.saveOrgModuleDefaults,
      forceOrgModuleDefaults: s.forceOrgModuleDefaults,
      getEffectiveRole: s.getEffectiveRole,
      organization: s.organization,
    })),
  )

  const deniedModules = useDeniedModules()

  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [saveResult, setSaveResult] = useState<'success' | 'error' | null>(null)

  // Force push state
  const [showForceConfirm, setShowForceConfirm] = useState(false)
  const [isForcing, setIsForcing] = useState(false)
  const [forceResult, setForceResult] = useState<'success' | 'error' | null>(null)

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
        .from('team')
        .select(
          `
          id,
          name,
          color,
          icon,
          module_defaults,
          team_member(count)
        `,
        )
        .eq('org_id', organization.id)
        .not('module_defaults', 'is', null)
        .order('name')

      if (error) throw error
      // Supabase v2 nested select type inference incomplete for team counts
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const teamsWithCounts = (data || []).map((team: any) => ({
        ...team,
        member_count: team.team_member?.[0]?.count || 0,
      }))

      setTeamsWithModules(teamsWithCounts)
    } catch (error) {
      log.error('[ModulesSettings]', 'Failed to load teams with modules', { error: error })
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

  const handleForceOrgDefaults = async () => {
    setIsForcing(true)
    setForceResult(null)
    try {
      const result = await forceOrgModuleDefaults()
      setForceResult(result.success ? 'success' : 'error')
      if (result.success) {
        setShowForceConfirm(false)
        setTimeout(() => setForceResult(null), 3000)
      }
    } catch (error) {
      log.error('[ModulesSettings]', 'Failed to force org defaults', { error: error })
      setForceResult('error')
    } finally {
      setIsForcing(false)
    }
  }

  return (
    <SettingsPage>
      <SettingsSection
        title="Modules"
        description="Enable, disable, and reorder sidebar modules"
        actions={
          <>
            <Button
              size="sm"
              icon={<Download size={12} />}
              loading={isLoading}
              onClick={handleLoadOrgDefaults}
              title="Load organization defaults"
            >
              Load Defaults
            </Button>
            <Button
              size="sm"
              icon={<RotateCcw size={12} />}
              onClick={resetModulesToDefaults}
              title="Reset to factory defaults"
            >
              Reset
            </Button>
          </>
        }
      >
        {isAdmin && (
          <SettingsGroup>
            <SettingRow
              label="Organization defaults"
              badge={<Badge tone="accent">Admin</Badge>}
              description="Save this configuration as the default for new members, or push it to every member now."
            >
              <Button
                size="sm"
                icon={
                  forceResult === 'success' ? (
                    <Check size={12} className="text-ui-success" />
                  ) : (
                    <Upload size={12} />
                  )
                }
                loading={isForcing}
                onClick={() => setShowForceConfirm(true)}
                title="Push this configuration to all organization members, overriding their settings"
                className={forceResult === 'error' ? 'text-ui-danger' : ''}
              >
                {forceResult === 'success'
                  ? 'Pushed!'
                  : forceResult === 'error'
                    ? 'Failed'
                    : 'Push to All Users'}
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={saveResult === 'success' ? <Check size={12} /> : <Save size={12} />}
                loading={isSaving}
                onClick={handleSaveOrgDefaults}
                title="Save as organization defaults for new members"
              >
                {saveResult === 'success'
                  ? 'Saved!'
                  : saveResult === 'error'
                    ? 'Failed'
                    : 'Save Defaults'}
              </Button>
            </SettingRow>
          </SettingsGroup>
        )}
      </SettingsSection>

      {/* Main Module Editor */}
      <ModulesEditor
        config={moduleConfig}
        onConfigChange={setModuleConfig}
        deniedModuleIds={deniedModules}
      />

      {/* Teams with Module Defaults */}
      {teamsWithModules.length > 0 && (
        <SettingsSection
          title="Teams with Custom Module Defaults"
          description="Team members inherit these module defaults instead of organization defaults."
          actions={
            <Button
              variant="ghost"
              size="sm"
              icon={<ExternalLink size={12} />}
              onClick={() => usePDMStore.getState().setSettingsTab('team-members')}
            >
              Manage in Teams Settings
            </Button>
          }
        >
          <SettingsGroup>
            {teamsWithModules.map((team) => {
              // Dynamic Lucide icon lookup requires any cast (icon name is runtime string)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const IconComponent = (LucideIcons as any)[team.icon] || Users // TODO: type this
              const defaults = team.module_defaults as {
                enabled_modules?: Record<string, boolean>
              } | null
              const enabledCount = defaults?.enabled_modules
                ? Object.values(defaults.enabled_modules).filter(Boolean).length
                : 0

              return (
                <div key={team.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div
                    className="rounded-md p-1.5"
                    style={{ backgroundColor: `${team.color}20`, color: team.color }}
                  >
                    <IconComponent size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium text-ui-fg">{team.name}</div>
                    <div className="text-[13px] text-ui-fg-secondary">
                      {enabledCount} modules · {team.member_count} member
                      {team.member_count !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              )
            })}
          </SettingsGroup>
        </SettingsSection>
      )}

      {/* Force Push Confirmation Dialog */}
      {showForceConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="mx-4 w-full max-w-md overflow-hidden rounded-xl border border-ui-divider bg-ui-bg shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-ui-divider p-4">
              <div className="flex items-center gap-3">
                <AlertTriangle size={18} className="text-ui-warning" />
                <h3 className="text-[15px] font-semibold text-ui-fg">Push to All Users</h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={<X size={14} />}
                onClick={() => setShowForceConfirm(false)}
                aria-label="Close"
              />
            </div>

            {/* Content */}
            <div className="space-y-3 p-4 text-[14px]">
              <p className="text-ui-fg">
                This will <strong>override</strong> the sidebar configuration for{' '}
                <strong>all users</strong> in your organization.
              </p>

              <Callout tone="warning">
                <strong>Warning:</strong> Users who have customized their sidebar will have their
                changes overwritten. This action cannot be undone.
              </Callout>

              <p className="text-ui-fg-secondary">
                Users who are currently online will receive the update immediately. Others will see
                the changes when they next open BluePLM.
              </p>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-ui-divider bg-ui-field p-4">
              <Button variant="ghost" onClick={() => setShowForceConfirm(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                icon={<Upload size={14} />}
                loading={isForcing}
                onClick={handleForceOrgDefaults}
              >
                {isForcing ? 'Pushing...' : 'Push to All Users'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </SettingsPage>
  )
}
