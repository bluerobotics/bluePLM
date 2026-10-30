import * as LucideIcons from 'lucide-react'
import {
  X,
  Shield,
  Check,
  Minus,
  Loader2,
  Search,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Save,
  RotateCcw,
  Users,
  Database,
  LayoutGrid,
  Wand2,
  AlertTriangle,
  Folder,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Button } from '@/components/core/ui'
import { DEFAULT_PRESETS, PERMISSION_ACTIONS, PERMISSION_ACTION_LABELS } from '@/types/permissions'
import type { PermissionPreset, Team } from '@/types/permissions'

import { usePermissionsEditor } from './usePermissionsEditor'

/** Lucide icons by name, for teams, presets, groups and resources that store an icon name. */
const ICONS = LucideIcons as unknown as Record<string, LucideIcon | undefined>

interface PermissionsEditorProps {
  team: Team
  onClose: () => void
  userId?: string
  isAdmin: boolean
}

export function PermissionsEditor({ team, onClose, userId, isAdmin }: PermissionsEditorProps) {
  const {
    allResources,
    resourceGroups,
    permissions,
    isLoading,
    isSaving,
    hasChanges,
    searchQuery,
    setSearchQuery,
    expandedGroups,
    showPresets,
    setShowPresets,
    vaults,
    selectedSourceFilesVaultId,
    setSelectedSourceFilesVaultId,
    sourceFilesPermsByVault,
    savePermissions,
    getResourcePermissions,
    toggleAction,
    toggleAllInGroup,
    setAllActions,
    applyPreset,
    resetToOriginal,
    clearAll,
    grantAll,
    toggleAllForAction,
    allHaveAction,
    someHaveAction,
    filterResources,
    getGroupStats,
    toggleGroup,
  } = usePermissionsEditor(team, userId, isAdmin)

  const IconComponent = ICONS[team.icon] || Users

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center overflow-hidden"
      onClick={onClose}
    >
      <div
        className="bg-ui-field border border-ui-divider rounded-xl w-full max-w-6xl h-[90vh] mx-4 flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-ui-divider flex items-center gap-4 flex-shrink-0">
          <div
            className="p-2.5 rounded-lg"
            style={{ backgroundColor: `${team.color}20`, color: team.color }}
          >
            <IconComponent size={22} />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-ui-fg flex items-center gap-2">
              {team.name}
              <span className="text-[13px] font-normal text-ui-fg-secondary">— Permissions</span>
            </h2>
            <p className="text-[13px] text-ui-fg-secondary">Configure what this team can access and do</p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {hasChanges && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetToOriginal}
                title="Reset changes"
              >
                <RotateCcw size={14} />
                Reset
              </Button>
            )}

            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPresets(!showPresets)}
              >
                <Wand2 size={14} />
                Presets
              </Button>
            )}

            <button
              onClick={savePermissions}
              disabled={!hasChanges || isSaving || !isAdmin}
              className={`btn btn-sm flex items-center gap-1.5 ${
                hasChanges ? 'btn-primary' : 'btn-ghost opacity-50'
              }`}
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save
            </button>

            <button
              onClick={onClose}
              className="p-2 text-ui-fg-secondary hover:text-ui-fg hover:bg-ui-hover rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Presets dropdown */}
        {showPresets && isAdmin && (
          <div className="border-b border-ui-divider p-4 bg-gradient-to-r from-ui-accent/5 to-transparent">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-[13px] font-medium text-ui-fg">
                <Sparkles size={16} className="text-ui-accent" />
                Quick Apply Preset
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={clearAll}
                  className="text-[12px] text-ui-fg-secondary hover:text-ui-fg px-2 py-1 rounded hover:bg-ui-hover"
                >
                  Clear All
                </button>
                <button
                  onClick={grantAll}
                  className="text-[12px] text-ui-accent hover:text-ui-accent/80 px-2 py-1 rounded hover:bg-ui-accent/10"
                >
                  Grant All
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_PRESETS.map((preset) => {
                const PresetIcon = ICONS[preset.icon] || Shield
                return (
                  <button
                    key={preset.name}
                    onClick={() => applyPreset(preset as PermissionPreset)}
                    className="flex items-center gap-2 px-3 py-2 bg-ui-bg border border-ui-divider rounded-lg hover:border-ui-accent/50 hover:bg-ui-hover transition-all group"
                  >
                    <div
                      className="p-1 rounded"
                      style={{ backgroundColor: `${preset.color}20`, color: preset.color }}
                    >
                      <PresetIcon size={14} />
                    </div>
                    <span className="text-[13px] text-ui-fg">{preset.name}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="p-3 border-b border-ui-divider flex items-center gap-3 flex-shrink-0 bg-ui-bg/50">
          <div className="relative flex-1 max-w-xs">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ui-fg-secondary"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search resources..."
              className="w-full pl-9 pr-3 py-1.5 text-[13px] bg-ui-bg border border-ui-divider rounded-lg text-ui-fg placeholder:text-ui-fg focus:outline-none focus:border-ui-accent"
            />
          </div>

          {/* Quick column toggles */}
          {isAdmin && (
            <div className="flex items-center gap-1">
              <span className="text-[12px] text-ui-fg-secondary mr-1">Toggle All:</span>
              {PERMISSION_ACTIONS.map((action) => {
                const allHave = allHaveAction(action)
                const someHave = someHaveAction(action)

                const checkedClass =
                  action === 'view'
                    ? 'bg-blue-500/35 text-blue-300 border-blue-400/70'
                    : action === 'create'
                      ? 'bg-green-500/35 text-green-300 border-green-400/70'
                      : action === 'edit'
                        ? 'bg-yellow-500/35 text-yellow-300 border-yellow-400/70'
                        : action === 'delete'
                          ? 'bg-red-500/35 text-red-300 border-red-400/70'
                          : 'bg-purple-500/35 text-purple-300 border-purple-400/70'

                const partialClass =
                  action === 'view'
                    ? 'bg-blue-500/15 text-blue-400/60 border-blue-400/40'
                    : action === 'create'
                      ? 'bg-green-500/15 text-green-400/60 border-green-400/40'
                      : action === 'edit'
                        ? 'bg-yellow-500/15 text-yellow-400/60 border-yellow-400/40'
                        : action === 'delete'
                          ? 'bg-red-500/15 text-red-400/60 border-red-400/40'
                          : 'bg-purple-500/15 text-purple-400/60 border-purple-400/40'

                const uncheckedClass =
                  action === 'view'
                    ? 'border-blue-500/20 bg-blue-500/5 text-blue-400/40 hover:border-blue-400/50 hover:bg-blue-500/15'
                    : action === 'create'
                      ? 'border-green-500/20 bg-green-500/5 text-green-400/40 hover:border-green-400/50 hover:bg-green-500/15'
                      : action === 'edit'
                        ? 'border-yellow-500/20 bg-yellow-500/5 text-yellow-400/40 hover:border-yellow-400/50 hover:bg-yellow-500/15'
                        : action === 'delete'
                          ? 'border-red-500/20 bg-red-500/5 text-red-400/40 hover:border-red-400/50 hover:bg-red-500/15'
                          : 'border-purple-500/20 bg-purple-500/5 text-purple-400/40 hover:border-purple-400/50 hover:bg-purple-500/15'

                return (
                  <button
                    key={action}
                    onClick={() => toggleAllForAction(action)}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all ${
                      allHave ? checkedClass : someHave ? partialClass : uncheckedClass
                    }`}
                    title={`${allHave ? 'Remove' : 'Grant'} ${PERMISSION_ACTION_LABELS[action]} for all resources`}
                  >
                    {allHave ? (
                      <Check size={12} />
                    ) : someHave ? (
                      <Minus size={12} />
                    ) : (
                      <span className="text-[9px] font-medium">
                        {action.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </button>
                )
              })}

              {/* Select All / Clear All button */}
              <div className="ml-2 flex items-center gap-1 border-l border-ui-divider pl-2">
                <button
                  onClick={grantAll}
                  className="px-2 py-1.5 text-[12px] rounded-lg border border-ui-accent/30 bg-ui-accent/10 text-ui-accent hover:bg-ui-accent/20 transition-colors flex items-center gap-1"
                  title="Grant all permissions to all resources"
                >
                  <Check size={12} />
                  All
                </button>
                <button
                  onClick={clearAll}
                  className="px-2 py-1.5 text-[12px] rounded-lg border border-ui-divider bg-ui-bg text-ui-fg-secondary hover:text-ui-fg hover:bg-ui-hover transition-colors flex items-center gap-1"
                  title="Clear all permissions"
                >
                  <X size={12} />
                  None
                </button>
              </div>
            </div>
          )}

          {/* Action legend */}
          <div className="flex items-center gap-4 ml-auto text-[12px] text-ui-fg-secondary">
            {PERMISSION_ACTIONS.map((action) => (
              <div key={action} className="flex items-center gap-1.5">
                <div
                  className={`w-2 h-2 rounded-full ${
                    action === 'view'
                      ? 'bg-blue-400'
                      : action === 'create'
                        ? 'bg-green-400'
                        : action === 'edit'
                          ? 'bg-yellow-400'
                          : action === 'delete'
                            ? 'bg-red-400'
                            : 'bg-purple-400'
                  }`}
                />
                {PERMISSION_ACTION_LABELS[action]}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-ui-fg-secondary" size={32} />
            </div>
          ) : (
            <div className="p-4 space-y-2">
              {resourceGroups.map((group) => {
                const filteredResources = filterResources(group.resources)
                if (filteredResources.length === 0) return null

                const isExpanded = expandedGroups.has(group.id)
                const stats = getGroupStats(group.id)
                const GroupIcon = ICONS[group.icon] || LayoutGrid

                return (
                  <div
                    key={group.id}
                    className="border border-ui-divider rounded-xl overflow-hidden bg-ui-bg/30"
                  >
                    {/* Group header */}
                    <div className="flex items-center gap-3 px-4 py-3 hover:bg-ui-hover/50 transition-colors">
                      {/* Icon - same width as child icons */}
                      <button
                        onClick={() => toggleGroup(group.id)}
                        className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center"
                        style={{ backgroundColor: `${group.color}15`, color: group.color }}
                      >
                        <GroupIcon size={16} />
                      </button>

                      {/* Text content - flex-1 like children */}
                      <button
                        onClick={() => toggleGroup(group.id)}
                        className="flex-1 min-w-0 text-left flex items-center gap-2"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-ui-fg">{group.name}</div>
                          <div className="text-[12px] text-ui-fg-secondary">
                            {group.id === 'source-files'
                              ? `${vaults.length} vault${vaults.length !== 1 ? 's' : ''} • ${stats.withPerms} of ${stats.total} configured`
                              : `${stats.withPerms} of ${stats.total} resources configured`}
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronDown size={18} className="text-ui-fg-secondary flex-shrink-0" />
                        ) : (
                          <ChevronRight size={18} className="text-ui-fg-secondary flex-shrink-0" />
                        )}
                      </button>

                      {/* Group-level quick toggles - aligned with child checkboxes */}
                      {isAdmin && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {PERMISSION_ACTIONS.map((action) => {
                            const allHave = group.resources.every((r) =>
                              getResourcePermissions(r).includes(action),
                            )
                            const someHave = group.resources.some((r) =>
                              getResourcePermissions(r).includes(action),
                            )

                            // Match the styling from child buttons
                            const checkedClass =
                              action === 'view'
                                ? 'bg-blue-500/35 text-blue-300 border-blue-400/70'
                                : action === 'create'
                                  ? 'bg-green-500/35 text-green-300 border-green-400/70'
                                  : action === 'edit'
                                    ? 'bg-yellow-500/35 text-yellow-300 border-yellow-400/70'
                                    : action === 'delete'
                                      ? 'bg-red-500/35 text-red-300 border-red-400/70'
                                      : 'bg-purple-500/35 text-purple-300 border-purple-400/70'

                            const partialClass =
                              action === 'view'
                                ? 'bg-blue-500/15 text-blue-400/60 border-blue-400/40'
                                : action === 'create'
                                  ? 'bg-green-500/15 text-green-400/60 border-green-400/40'
                                  : action === 'edit'
                                    ? 'bg-yellow-500/15 text-yellow-400/60 border-yellow-400/40'
                                    : action === 'delete'
                                      ? 'bg-red-500/15 text-red-400/60 border-red-400/40'
                                      : 'bg-purple-500/15 text-purple-400/60 border-purple-400/40'

                            const uncheckedClass =
                              action === 'view'
                                ? 'border-blue-500/20 bg-blue-500/5 text-blue-400/40 hover:border-blue-400/50 hover:bg-blue-500/15'
                                : action === 'create'
                                  ? 'border-green-500/20 bg-green-500/5 text-green-400/40 hover:border-green-400/50 hover:bg-green-500/15'
                                  : action === 'edit'
                                    ? 'border-yellow-500/20 bg-yellow-500/5 text-yellow-400/40 hover:border-yellow-400/50 hover:bg-yellow-500/15'
                                    : action === 'delete'
                                      ? 'border-red-500/20 bg-red-500/5 text-red-400/40 hover:border-red-400/50 hover:bg-red-500/15'
                                      : 'border-purple-500/20 bg-purple-500/5 text-purple-400/40 hover:border-purple-400/50 hover:bg-purple-500/15'

                            return (
                              <button
                                key={action}
                                onClick={() => toggleAllInGroup(group.id, action)}
                                className={`w-9 h-9 rounded-lg flex items-center justify-center border transition-all ${
                                  allHave ? checkedClass : someHave ? partialClass : uncheckedClass
                                }`}
                                title={`Toggle ${PERMISSION_ACTION_LABELS[action]} for all in ${group.name}`}
                              >
                                {allHave ? (
                                  <Check size={14} />
                                ) : someHave ? (
                                  <Minus size={14} />
                                ) : (
                                  <span className="text-[12px] font-medium">
                                    {action.charAt(0).toUpperCase()}
                                  </span>
                                )}
                              </button>
                            )
                          })}
                          {/* Spacer to align with child rows' quick actions */}
                          <div className="ml-2 w-[52px]" />
                        </div>
                      )}
                    </div>

                    {/* Group resources */}
                    {isExpanded && (
                      <div className="border-t border-ui-divider">
                        {/* Vault tabs for source-files group */}
                        {group.id === 'source-files' && vaults.length > 0 && (
                          <div className="px-4 py-2 border-b border-ui-divider bg-ui-bg/50 flex items-center gap-1 flex-wrap">
                            <span className="text-[12px] text-ui-fg-secondary mr-1">Vault:</span>
                            <button
                              onClick={() => setSelectedSourceFilesVaultId(null)}
                              className={`flex items-center gap-1.5 px-2 py-1 rounded text-[12px] transition-colors ${
                                selectedSourceFilesVaultId === null
                                  ? 'bg-ui-accent text-white'
                                  : 'bg-ui-field text-ui-fg-secondary hover:text-ui-fg hover:bg-ui-hover border border-ui-divider'
                              }`}
                            >
                              <Database size={11} />
                              All
                            </button>
                            {vaults.map((vault) => (
                              <button
                                key={vault.id}
                                onClick={() => setSelectedSourceFilesVaultId(vault.id)}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded text-[12px] transition-colors ${
                                  selectedSourceFilesVaultId === vault.id
                                    ? 'bg-ui-accent text-white'
                                    : 'bg-ui-field text-ui-fg-secondary hover:text-ui-fg hover:bg-ui-hover border border-ui-divider'
                                }`}
                              >
                                <Folder size={11} />
                                {vault.name}
                              </button>
                            ))}
                          </div>
                        )}

                        {filteredResources.map((resourceId, idx) => {
                          const resource = allResources.find((r) => r.id === resourceId)
                          if (!resource) return null

                          const ResourceIcon = ICONS[resource.icon] || Shield
                          const currentActions = getResourcePermissions(resourceId)

                          return (
                            <div
                              key={resourceId}
                              className={`flex items-center gap-3 px-4 py-2.5 hover:bg-ui-hover/30 transition-colors ${
                                idx !== filteredResources.length - 1
                                  ? 'border-b border-ui-divider/20'
                                  : ''
                              }`}
                            >
                              {/* Resource icon */}
                              <div className="w-8 h-8 rounded-lg bg-ui-field flex items-center justify-center text-ui-fg-secondary">
                                <ResourceIcon size={16} />
                              </div>

                              {/* Resource info */}
                              <div className="flex-1 min-w-0">
                                <div className="text-[13px] text-ui-fg font-medium truncate">
                                  {resource.name}
                                </div>
                                <div className="text-[12px] text-ui-fg-secondary truncate">
                                  {resource.description}
                                </div>
                              </div>

                              {/* Permission checkboxes */}
                              <div className="flex items-center gap-1">
                                {PERMISSION_ACTIONS.map((action) => {
                                  const isApplicable = resource.applicableActions.includes(action)
                                  const isGranted = currentActions.includes(action)

                                  if (!isApplicable) {
                                    return (
                                      <div
                                        key={action}
                                        className="w-9 h-9 rounded-lg flex items-center justify-center opacity-20"
                                        title={`${PERMISSION_ACTION_LABELS[action]} not applicable`}
                                      >
                                        <Minus size={12} className="text-ui-fg" />
                                      </div>
                                    )
                                  }

                                  // Brighter colors for checked state
                                  const colorClass =
                                    action === 'view'
                                      ? 'bg-blue-500/35 text-blue-300 border-blue-400/70'
                                      : action === 'create'
                                        ? 'bg-green-500/35 text-green-300 border-green-400/70'
                                        : action === 'edit'
                                          ? 'bg-yellow-500/35 text-yellow-300 border-yellow-400/70'
                                          : action === 'delete'
                                            ? 'bg-red-500/35 text-red-300 border-red-400/70'
                                            : 'bg-purple-500/35 text-purple-300 border-purple-400/70'

                                  // Dimmer colors for unchecked state
                                  const uncheckedColorClass =
                                    action === 'view'
                                      ? 'border-blue-500/20 bg-blue-500/5 text-blue-400/40 hover:border-blue-400/50 hover:bg-blue-500/15 hover:text-blue-400/70'
                                      : action === 'create'
                                        ? 'border-green-500/20 bg-green-500/5 text-green-400/40 hover:border-green-400/50 hover:bg-green-500/15 hover:text-green-400/70'
                                        : action === 'edit'
                                          ? 'border-yellow-500/20 bg-yellow-500/5 text-yellow-400/40 hover:border-yellow-400/50 hover:bg-yellow-500/15 hover:text-yellow-400/70'
                                          : action === 'delete'
                                            ? 'border-red-500/20 bg-red-500/5 text-red-400/40 hover:border-red-400/50 hover:bg-red-500/15 hover:text-red-400/70'
                                            : 'border-purple-500/20 bg-purple-500/5 text-purple-400/40 hover:border-purple-400/50 hover:bg-purple-500/15 hover:text-purple-400/70'

                                  // Get the first letter of the action for unchecked display
                                  const actionLetter = action.charAt(0).toUpperCase()

                                  return (
                                    <button
                                      key={action}
                                      onClick={() => toggleAction(resourceId, action)}
                                      disabled={!isAdmin}
                                      className={`w-9 h-9 rounded-lg flex items-center justify-center border transition-all ${
                                        isGranted ? colorClass : uncheckedColorClass
                                      } ${!isAdmin ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                                      title={`${isGranted ? 'Revoke' : 'Grant'} ${PERMISSION_ACTION_LABELS[action]}`}
                                    >
                                      {isGranted ? (
                                        <Check size={14} />
                                      ) : (
                                        <span className="text-[12px] font-medium">
                                          {actionLetter}
                                        </span>
                                      )}
                                    </button>
                                  )
                                })}

                                {/* Quick actions */}
                                {isAdmin && (
                                  <div className="ml-2 flex items-center gap-1 opacity-0 group-hover:opacity-100">
                                    <button
                                      onClick={() => setAllActions(resourceId, [])}
                                      className="p-1.5 text-ui-fg hover:text-ui-fg hover:bg-ui-hover rounded transition-colors"
                                      title="Clear all"
                                    >
                                      <X size={12} />
                                    </button>
                                    <button
                                      onClick={() =>
                                        setAllActions(resourceId, [...resource.applicableActions])
                                      }
                                      className="p-1.5 text-ui-fg hover:text-ui-accent hover:bg-ui-accent/10 rounded transition-colors"
                                      title="Grant all"
                                    >
                                      <Check size={12} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer with summary */}
        <div className="p-4 border-t border-ui-divider flex items-center justify-between bg-ui-bg/50 flex-shrink-0">
          <div className="flex items-center gap-4 text-[13px] text-ui-fg-secondary">
            <div className="flex items-center gap-1.5">
              <Shield size={14} />
              <span>
                {Object.entries(permissions).filter(([_, a]) => a.length > 0).length +
                  Object.values(sourceFilesPermsByVault).reduce(
                    (sum, vaultPerms) =>
                      sum + Object.values(vaultPerms).filter((a) => a.length > 0).length,
                    0,
                  )}{' '}
                resources configured
              </span>
            </div>
            {hasChanges && (
              <div className="flex items-center gap-1.5 text-ui-warning">
                <AlertTriangle size={14} />
                <span>Unsaved changes</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              {hasChanges ? 'Cancel' : 'Close'}
            </Button>
            {isAdmin && (
              <Button
                variant="primary"
                onClick={savePermissions}
                disabled={!hasChanges || isSaving}
              >
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save Permissions
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
