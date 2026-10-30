import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Globe, Loader2, Lock, Save, Users, X } from 'lucide-react'

import { Badge, Button, Callout } from '@/components/core/ui'
import { log } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import { usePDMStore } from '@/stores/pdmStore'
import { MODULE_GROUPS, MODULES, type ModuleGroupId, type ModuleId } from '@/types/modules'

import { SettingsGroup, SettingsPage, SettingsSection } from '../components/ui'

interface OrgTeam {
  id: string
  name: string
  color: string
}

interface OrgMember {
  id: string
  full_name: string | null
  email: string
}

/** Allowlist for one module. Both lists empty means the module is unrestricted. */
interface ModuleAllowlist {
  teamIds: string[]
  userIds: string[]
}

interface AccessRow {
  module_id: string
  team_id: string | null
  user_id: string | null
}

const EMPTY_ALLOWLIST: ModuleAllowlist = { teamIds: [], userIds: [] }

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id))
}

/**
 * Admin page for restricting sidebar modules to specific teams and users.
 *
 * Restriction is opt-in: a module with an empty allowlist stays visible to the
 * whole organization. Adding the first team or user is what turns the module
 * private, which is why the UI leads with "Everyone" rather than an unchecked
 * list of teams.
 */
export function ModuleAccessSettings() {
  const organization = usePDMStore((s) => s.organization)
  const getEffectiveRole = usePDMStore((s) => s.getEffectiveRole)
  const addToast = usePDMStore((s) => s.addToast)
  const loadModuleAccess = usePDMStore((s) => s.loadModuleAccess)

  const isAdmin = getEffectiveRole() === 'admin'

  const [teams, setTeams] = useState<OrgTeam[]>([])
  const [members, setMembers] = useState<OrgMember[]>([])
  const [saved, setSaved] = useState<Record<string, ModuleAllowlist>>({})
  const [drafts, setDrafts] = useState<Record<string, ModuleAllowlist>>({})
  const [loading, setLoading] = useState(false)
  const [savingModuleId, setSavingModuleId] = useState<string | null>(null)
  const [expandedModuleId, setExpandedModuleId] = useState<ModuleId | null>(null)

  const load = useCallback(async () => {
    if (!organization?.id || !isAdmin) return

    setLoading(true)
    try {
      const [teamsResult, membersResult, accessResult] = await Promise.all([
        supabase
          .from('team')
          .select('id, name, color')
          .eq('org_id', organization.id)
          .order('name'),
        supabase
          .from('app_user')
          .select('id, full_name, email')
          .eq('org_id', organization.id)
          .order('full_name'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.rpc as any)('module_access_get_config'), // TODO: type this
      ])

      if (teamsResult.error) throw teamsResult.error
      if (membersResult.error) throw membersResult.error
      if (accessResult.error) throw accessResult.error

      setTeams((teamsResult.data || []) as OrgTeam[])
      setMembers((membersResult.data || []) as OrgMember[])

      const byModule: Record<string, ModuleAllowlist> = {}
      for (const row of (accessResult.data || []) as AccessRow[]) {
        const entry = byModule[row.module_id] || { teamIds: [], userIds: [] }
        if (row.team_id) entry.teamIds.push(row.team_id)
        if (row.user_id) entry.userIds.push(row.user_id)
        byModule[row.module_id] = entry
      }
      setSaved(byModule)
      setDrafts(byModule)
    } catch (error) {
      log.error('[ModuleAccessSettings]', 'Failed to load module access', { error })
      addToast('error', 'Failed to load module access')
    } finally {
      setLoading(false)
    }
  }, [organization?.id, isAdmin, addToast])

  useEffect(() => {
    load()
  }, [load])

  // Only modules that actually reach the sidebar are worth restricting
  const modulesByGroup = useMemo(() => {
    const grouped = new Map<ModuleGroupId, typeof MODULES>()
    for (const module of MODULES) {
      if (module.required) continue
      grouped.set(module.group, [...(grouped.get(module.group) || []), module])
    }
    return grouped
  }, [])

  const getDraft = (moduleId: ModuleId): ModuleAllowlist => drafts[moduleId] || EMPTY_ALLOWLIST
  const getSaved = (moduleId: ModuleId): ModuleAllowlist => saved[moduleId] || EMPTY_ALLOWLIST

  const isDirty = (moduleId: ModuleId): boolean => {
    const draft = getDraft(moduleId)
    const current = getSaved(moduleId)
    return !sameIds(draft.teamIds, current.teamIds) || !sameIds(draft.userIds, current.userIds)
  }

  const toggleSubject = (moduleId: ModuleId, key: 'teamIds' | 'userIds', id: string) => {
    setDrafts((previous) => {
      const draft = previous[moduleId] || EMPTY_ALLOWLIST
      const ids = draft[key].includes(id)
        ? draft[key].filter((existing) => existing !== id)
        : [...draft[key], id]
      return { ...previous, [moduleId]: { ...draft, [key]: ids } }
    })
  }

  const clearRestriction = (moduleId: ModuleId) => {
    setDrafts((previous) => ({ ...previous, [moduleId]: { teamIds: [], userIds: [] } }))
  }

  const handleSave = async (moduleId: ModuleId) => {
    const draft = getDraft(moduleId)
    setSavingModuleId(moduleId)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('module_access_set', {
        // TODO: type this
        p_module_id: moduleId,
        p_team_ids: draft.teamIds,
        p_user_ids: draft.userIds,
      })
      if (error) throw error
      if (data && data.success === false) throw new Error(data.error || 'Failed to save')

      setSaved((previous) => ({ ...previous, [moduleId]: draft }))
      // The admin editing this may themselves be affected once they leave the
      // Administrators team, and impersonation reads the same store value.
      await loadModuleAccess()
      addToast('success', 'Module access updated')
    } catch (error) {
      log.error('[ModuleAccessSettings]', 'Failed to save module access', { error })
      addToast('error', error instanceof Error ? error.message : 'Failed to save module access')
    } finally {
      setSavingModuleId(null)
    }
  }

  if (!isAdmin) {
    return (
      <Callout tone="warning">Only organization admins can configure module access.</Callout>
    )
  }

  const chipClass = (selected: boolean) =>
    `inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-[13px] transition-colors ${
      selected
        ? 'border-ui-accent/60 bg-ui-accent/15 text-ui-fg'
        : 'border-ui-divider text-ui-fg-secondary hover:bg-ui-hover/50 hover:text-ui-fg'
    }`

  return (
    <SettingsPage>
      <Callout>
        Restrict a module to specific teams or people. Modules with no restriction stay visible to
        everyone in the organization. Admins always keep access.
      </Callout>

      {loading ? (
        <div className="flex h-32 items-center justify-center text-ui-fg-secondary">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : (
        MODULE_GROUPS.map((group) => {
          const groupModules = modulesByGroup.get(group.id)
          if (!groupModules || groupModules.length === 0) return null

          return (
            <SettingsSection key={group.id} title={group.name}>
              <SettingsGroup>
                {groupModules.map((module) => {
                  const draft = getDraft(module.id)
                  const current = getSaved(module.id)
                  const isRestricted = current.teamIds.length > 0 || current.userIds.length > 0
                  const isExpanded = expandedModuleId === module.id
                  const dirty = isDirty(module.id)

                  return (
                    <div key={module.id}>
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() => setExpandedModuleId(isExpanded ? null : module.id)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-ui-hover/40"
                      >
                        {isExpanded ? (
                          <ChevronDown size={14} className="flex-shrink-0 text-ui-fg-secondary" />
                        ) : (
                          <ChevronRight size={14} className="flex-shrink-0 text-ui-fg-secondary" />
                        )}

                        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ui-fg">
                          {module.name}
                        </span>

                        {isRestricted ? (
                          <Badge tone="warning" icon={<Lock size={10} />}>
                            {current.teamIds.length > 0 &&
                              `${current.teamIds.length} team${current.teamIds.length === 1 ? '' : 's'}`}
                            {current.teamIds.length > 0 && current.userIds.length > 0 && ' + '}
                            {current.userIds.length > 0 &&
                              `${current.userIds.length} ${current.userIds.length === 1 ? 'person' : 'people'}`}
                          </Badge>
                        ) : (
                          <Badge icon={<Globe size={10} />}>Everyone</Badge>
                        )}
                      </button>

                      {isExpanded && (
                        <div className="space-y-4 border-t border-ui-divider bg-ui-bg/40 px-4 py-3 pl-11">
                          <div>
                            <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-ui-fg-secondary">
                              <Users size={12} />
                              Teams
                            </div>
                            {teams.length === 0 ? (
                              <p className="text-[13px] text-ui-fg-secondary">No teams yet.</p>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {teams.map((team) => {
                                  const selected = draft.teamIds.includes(team.id)
                                  return (
                                    <button
                                      key={team.id}
                                      type="button"
                                      aria-pressed={selected}
                                      onClick={() => toggleSubject(module.id, 'teamIds', team.id)}
                                      className={chipClass(selected)}
                                    >
                                      <span
                                        className="h-2 w-2 rounded-full"
                                        style={{ backgroundColor: team.color }}
                                      />
                                      {team.name}
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                          </div>

                          <div>
                            <div className="mb-1.5 text-[13px] font-medium text-ui-fg-secondary">
                              Individual people
                            </div>
                            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                              {members.map((member) => {
                                const selected = draft.userIds.includes(member.id)
                                return (
                                  <button
                                    key={member.id}
                                    type="button"
                                    aria-pressed={selected}
                                    onClick={() => toggleSubject(module.id, 'userIds', member.id)}
                                    className={chipClass(selected)}
                                  >
                                    {member.full_name || member.email}
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              variant="primary"
                              size="sm"
                              icon={<Save size={14} />}
                              loading={savingModuleId === module.id}
                              onClick={() => handleSave(module.id)}
                              disabled={!dirty}
                            >
                              Save
                            </Button>

                            {(draft.teamIds.length > 0 || draft.userIds.length > 0) && (
                              <Button
                                size="sm"
                                icon={<X size={14} />}
                                onClick={() => clearRestriction(module.id)}
                                title="Remove the restriction so everyone can see this module"
                              >
                                Allow everyone
                              </Button>
                            )}

                            <p className="text-[13px] text-ui-fg-secondary">
                              {draft.teamIds.length === 0 && draft.userIds.length === 0
                                ? 'Visible to the whole organization.'
                                : 'Everyone else sees this module greyed out in their sidebar settings.'}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </SettingsGroup>
            </SettingsSection>
          )
        })
      )}
    </SettingsPage>
  )
}
