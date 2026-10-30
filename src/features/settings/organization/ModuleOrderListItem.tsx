import { useEffect, useState } from 'react'
import * as LucideIcons from 'lucide-react'
import {
  AlertCircle,
  ArrowDownUp,
  Building2,
  Calendar,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FolderTree,
  GitBranch,
  Globe,
  GripVertical,
  History,
  Lock,
  Minus,
  Network,
  Package,
  Palette,
  Pencil,
  Search,
  Telescope,
  Terminal,
  Trash2,
  X,
} from 'lucide-react'

import { Badge, Button, Switch } from '@/components/core/ui'
import { ColorPicker } from '@/components/shared/ColorPicker'
import {
  MODULE_GROUPS,
  MODULES,
  canToggleModule,
  isModuleVisible,
  getChildModules,
  type ModuleId,
  type ModuleConfig,
  type OrderListItem,
} from '@/types/modules'

// Custom Google Drive icon to match ActivityBar
function GoogleDriveIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M8.24 2L1 14.19L4.24 19.83L11.47 7.64L8.24 2Z" fill="currentColor" />
      <path d="M15.76 2H8.24L15.47 14.19H22.99L15.76 2Z" fill="currentColor" fillOpacity="0.7" />
      <path d="M1 14.19L4.24 19.83H19.76L22.99 14.19H1Z" fill="currentColor" fillOpacity="0.4" />
    </svg>
  )
}

// Icon mapping for modules
const moduleIcons: Record<string, React.ReactNode> = {
  FolderTree: <FolderTree size={16} />,
  ArrowDownUp: <ArrowDownUp size={16} />,
  Search: <Search size={16} />,
  GitBranch: <GitBranch size={16} />,
  History: <History size={16} />,
  Trash2: <Trash2 size={16} />,
  Terminal: <Terminal size={16} />,
  ClipboardList: <ClipboardList size={16} />,
  Telescope: <Telescope size={16} />,
  AlertCircle: <AlertCircle size={16} />,
  ClipboardCheck: <ClipboardCheck size={16} />,
  Package: <Package size={16} />,
  Network: <Network size={16} />,
  Calendar: <Calendar size={16} />,
  Building2: <Building2 size={16} />,
  Globe: <Globe size={16} />,
  GoogleDrive: <GoogleDriveIcon size={16} />,
}

/** Where a dragged row will land: a line on the row's top or bottom edge. */
function DropLine({ edge }: { edge: 'top' | 'bottom' }) {
  return (
    <div
      className={`pointer-events-none absolute left-0 right-0 z-10 h-0.5 bg-ui-accent ${
        edge === 'top' ? 'top-0' : 'bottom-0'
      }`}
    />
  )
}

/** One row of the sidebar order in ModulesEditor: a module, a custom group or a divider. */
export function ModuleOrderListItem({
  item,
  index,
  config,
  onConfigChange,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragging,
  dropIndicator,
  onEditGroup,
  deniedModuleIds,
}: {
  item: OrderListItem
  index: number
  config: ModuleConfig
  onConfigChange: (config: ModuleConfig) => void
  onDragStart: (index: number) => void
  onDragOver: (e: React.DragEvent, index: number) => void
  onDrop: () => void
  onDragEnd: () => void
  isDragging: boolean
  dropIndicator: { index: number; position: 'before' | 'after' } | null
  onEditGroup: (group: { id: string; name: string; icon: string; iconColor: string | null }) => void
  deniedModuleIds?: ReadonlySet<ModuleId>
}) {
  const showDropBefore = dropIndicator?.index === index && dropIndicator.position === 'before'
  const showDropAfter = dropIndicator?.index === index && dropIndicator.position === 'after'
  const [showParentSelect, setShowParentSelect] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)

  // Helper functions for updating config
  const setModuleEnabled = (moduleId: ModuleId, enabled: boolean) => {
    onConfigChange({
      ...config,
      enabledModules: { ...config.enabledModules, [moduleId]: enabled },
    })
  }

  const removeDivider = (dividerId: string) => {
    onConfigChange({
      ...config,
      dividers: config.dividers.filter((d) => d.id !== dividerId),
    })
  }

  const setModuleParent = (moduleId: ModuleId, parentId: string | null) => {
    const newParents = { ...config.moduleParents }
    newParents[moduleId] = parentId
    onConfigChange({
      ...config,
      moduleParents: newParents,
    })
  }

  const setModuleIconColor = (moduleId: ModuleId, color: string | null) => {
    const newColors = { ...config.moduleIconColors }
    if (color === null) {
      delete newColors[moduleId]
    } else {
      newColors[moduleId] = color
    }
    onConfigChange({
      ...config,
      moduleIconColors: newColors,
    })
  }

  const removeCustomGroup = (groupId: string) => {
    // Remove the group
    const newGroups = (config.customGroups || []).filter((g) => g.id !== groupId)
    // Unparent any modules that were in this group (set to null, not delete)
    const newParents = { ...config.moduleParents }
    Object.keys(newParents).forEach((key) => {
      if (newParents[key as ModuleId] === groupId) {
        newParents[key as ModuleId] = null
      }
    })
    onConfigChange({
      ...config,
      customGroups: newGroups,
      moduleParents: newParents,
    })
  }

  const toggleCustomGroup = (groupId: string, enabled: boolean) => {
    const newGroups = (config.customGroups || []).map((g) =>
      g.id === groupId ? { ...g, enabled } : g,
    )

    // When toggling a group, also toggle all child modules to match
    let newEnabledModules = config.enabledModules
    const childModules = getChildModules(groupId, config)
    if (childModules.length > 0) {
      newEnabledModules = { ...config.enabledModules }
      childModules.forEach((child) => {
        newEnabledModules[child.id] = enabled
      })
    }

    onConfigChange({
      ...config,
      customGroups: newGroups,
      enabledModules: newEnabledModules,
    })
  }

  // Close dropdowns when clicking outside
  useEffect(() => {
    if (!showParentSelect && !showColorPicker) return

    const handleClickOutside = () => {
      setShowParentSelect(false)
      setShowColorPicker(false)
    }

    // Delay to prevent immediate close
    const timeout = setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
    }, 0)

    return () => {
      clearTimeout(timeout)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [showParentSelect, showColorPicker])

  // Common drag handlers with better reliability
  const handleDragEvents = {
    draggable: true,
    onDragStart: () => onDragStart(index),
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      onDragOver(e, index)
    },
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      onDragOver(e, index)
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      onDrop()
    },
    onDragEnd: onDragEnd,
  }

  if (item.type === 'divider') {
    return (
      <div className="relative">
        {showDropBefore && <DropLine edge="top" />}
        <div
          {...handleDragEvents}
          className={`flex cursor-move items-center gap-3 px-3 py-2 transition-colors ${
            isDragging ? 'bg-ui-accent/10 opacity-50' : ''
          }`}
        >
          <GripVertical size={14} className="text-ui-fg-secondary flex-shrink-0 pointer-events-none" />
          <div className="flex items-center gap-2 flex-1 pointer-events-none">
            <Minus size={16} className="text-ui-fg-secondary" />
            <span className="text-[13px] text-ui-fg-secondary">Divider</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon={<X size={14} />}
            onClick={(e) => {
              e.stopPropagation()
              removeDivider(item.id)
            }}
            title="Remove divider"
            aria-label="Remove divider"
          />
        </div>
        {showDropAfter && <DropLine edge="bottom" />}
      </div>
    )
  }

  // Group item
  if (item.type === 'group') {
    const group = config.customGroups?.find((g) => g.id === item.id)
    if (!group) return null
    // Dynamic Lucide icon lookup requires any cast (icon name is runtime string)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const IconComponent = (LucideIcons as any)[group.icon] // TODO: type this
    const childCount = getChildModules(group.id, config).length
    const isGroupEnabled = group.enabled !== false // Default to enabled if undefined

    return (
      <div className="relative">
        {showDropBefore && <DropLine edge="top" />}
        <div
          {...handleDragEvents}
          className={`flex cursor-move items-center gap-3 px-3 py-2 transition-colors ${
            isDragging ? 'bg-ui-accent/10 opacity-50' : isGroupEnabled ? '' : 'opacity-60'
          }`}
        >
          <GripVertical size={14} className="text-ui-fg-secondary flex-shrink-0 pointer-events-none" />
          <div
            className={`p-1.5 rounded-md pointer-events-none ${!isGroupEnabled ? 'opacity-50' : ''}`}
            style={{ color: group.iconColor || 'var(--plm-accent)' }}
          >
            {IconComponent ? <IconComponent size={16} /> : <Package size={16} />}
          </div>
          <div className="flex-1 min-w-0 pointer-events-none">
            <div className="flex items-center gap-2">
              <span
                className={`text-[14px] font-medium ${isGroupEnabled ? 'text-ui-fg' : 'text-ui-fg-secondary'}`}
              >
                {group.name}
              </span>
              <Badge tone="accent">Group</Badge>
              {childCount > 0 && (
                <span className="text-[13px] text-ui-fg-secondary">{childCount} items</span>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon={<Pencil size={14} />}
            onClick={(e) => {
              e.stopPropagation()
              onEditGroup(group)
            }}
            title="Edit group name and icon"
            aria-label="Edit group name and icon"
          />
          <Button
            variant="ghost"
            size="sm"
            icon={<X size={14} />}
            onClick={(e) => {
              e.stopPropagation()
              removeCustomGroup(group.id)
            }}
            title="Remove group"
            aria-label="Remove group"
          />
          {/* Toggle for group */}
          <Switch
            checked={isGroupEnabled}
            onChange={() => toggleCustomGroup(group.id, !isGroupEnabled)}
            title={isGroupEnabled ? 'Disable group' : 'Enable group'}
            aria-label={group.name}
          />
        </div>
        {showDropAfter && <DropLine edge="bottom" />}
      </div>
    )
  }

  // Module item
  const moduleId = item.id as ModuleId
  const module = MODULES.find((m) => m.id === moduleId)
  if (!module) return null

  const isDenied = deniedModuleIds?.has(moduleId) ?? false
  const isVisible = isModuleVisible(moduleId, config, deniedModuleIds)
  const canToggle = canToggleModule(moduleId, config) && !isDenied
  const isGroupEnabled = config.enabledGroups[module.group]
  const group = MODULE_GROUPS.find((g) => g.id === module.group)
  const isDisabledByGroup = group?.isMasterToggle && !isGroupEnabled

  const isEnabled = config.enabledModules[moduleId]

  // Get current parent and children count
  const currentParentId = config.moduleParents?.[moduleId] || null
  const currentParent = currentParentId ? MODULES.find((m) => m.id === currentParentId) : null
  const childCount = getChildModules(moduleId, config).length

  // Check if this module is locked to a system group (cannot be dragged away)
  const isLockedToGroup = currentParentId?.startsWith('group-') || false

  // Get custom icon color
  const customIconColor = config.moduleIconColors?.[moduleId] || null

  // Get available parents (all modules except self and descendants)
  const getDescendants = (id: ModuleId): ModuleId[] => {
    const children = getChildModules(id, config)
    return [id, ...children.flatMap((c) => getDescendants(c.id))]
  }
  const descendants = getDescendants(moduleId)
  const availableParents = MODULES.filter((m) => !descendants.includes(m.id))

  // Non-draggable events for locked modules
  const lockedDragEvents = {
    draggable: false,
  }

  return (
    <div className="relative">
      {showDropBefore && !isLockedToGroup && <DropLine edge="top" />}
      <div
        {...(isLockedToGroup ? lockedDragEvents : handleDragEvents)}
        className={`flex items-center gap-3 py-2 pr-3 transition-colors ${
          isLockedToGroup ? 'cursor-default' : 'cursor-move'
        } ${
          isDragging
            ? 'bg-ui-accent/10 opacity-50'
            : !module.implemented || isDenied
              ? 'opacity-50'
              : 'hover:bg-ui-hover/40'
        } ${currentParentId ? 'pl-9' : 'pl-3'}`}
      >
        {/* Only show drag handle if not locked to a group */}
        {isLockedToGroup ? (
          <div className="w-[14px] flex-shrink-0" />
        ) : (
          <GripVertical size={14} className="text-ui-fg-secondary flex-shrink-0 pointer-events-none" />
        )}

        {/* Icon with custom color support */}
        <div
          className={`pointer-events-none rounded-md p-1.5 ${
            !customIconColor &&
            (isEnabled && isVisible ? 'text-ui-accent' : 'text-ui-fg-secondary')
          }`}
          style={
            customIconColor
              ? {
                  color: customIconColor,
                  backgroundColor: `${customIconColor}15`,
                }
              : undefined
          }
        >
          {moduleIcons[module.icon] || <Package size={16} />}
        </div>

        <div className="flex-1 min-w-0 pointer-events-none">
          <div className="flex items-center gap-2">
            <span className={`text-[14px] ${isVisible ? 'text-ui-fg' : 'text-ui-fg-secondary'}`}>
              {module.name}
            </span>
            {!module.implemented && <Badge tone="warning">In Development</Badge>}
            {isDenied && (
              <Badge
                icon={<Lock size={10} />}
                title="An administrator has restricted this module to other teams"
              >
                No Access
              </Badge>
            )}
            {module.required && (
              <span title="Required when group enabled">
                <Lock size={10} className="text-ui-fg" />
              </span>
            )}
            {childCount > 0 && (
              <Badge
                tone="accent"
                icon={<ChevronRight size={10} />}
                title={`Has ${childCount} sub-item${childCount > 1 ? 's' : ''}`}
              >
                {childCount}
              </Badge>
            )}
            {/* Show dependencies inline */}
            {module.dependencies && module.dependencies.length > 0 && (
              <span className="text-[13px] text-ui-fg-secondary">
                (requires{' '}
                {module.dependencies
                  .map((depId, i) => {
                    const depModule = MODULES.find((m) => m.id === depId)
                    return (
                      (depModule?.name || depId) + (i < module.dependencies!.length - 1 ? ', ' : '')
                    )
                  })
                  .join('')}
                )
              </span>
            )}
          </div>
          {currentParent && (
            <div className="text-[13px] text-ui-fg-secondary">
              Sub-item of: {currentParent.name}
            </div>
          )}
        </div>

        {/* Color picker button */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowColorPicker(!showColorPicker)
              setShowParentSelect(false)
            }}
            className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
              customIconColor
                ? 'hover:bg-ui-hover'
                : 'text-ui-fg-secondary hover:bg-ui-hover hover:text-ui-fg'
            }`}
            title="Set icon color"
          >
            {customIconColor ? (
              <div
                className="w-3.5 h-3.5 rounded-full border border-white/30"
                style={{ backgroundColor: customIconColor }}
              />
            ) : (
              <Palette size={14} />
            )}
          </button>

          {/* Color picker dropdown */}
          {showColorPicker && (
            <ColorPicker
              color={customIconColor}
              onChange={(color) => setModuleIconColor(moduleId, color)}
              onClose={() => setShowColorPicker(false)}
              title="Icon Color"
            />
          )}
        </div>

        {/* Parent selector button */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowParentSelect(!showParentSelect)
              setShowColorPicker(false)
            }}
            className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
              currentParentId
                ? 'bg-ui-accent/10 text-ui-accent hover:bg-ui-accent/20'
                : 'text-ui-fg-secondary hover:bg-ui-hover hover:text-ui-fg'
            }`}
            title="Set parent module (create sub-group)"
          >
            <ChevronRight size={14} className={currentParentId ? 'rotate-90' : ''} />
          </button>

          {/* Parent selection dropdown */}
          {showParentSelect && (
            <div
              className="absolute right-0 top-full mt-1 w-48 bg-ui-bg border border-ui-divider rounded-lg shadow-xl z-50 py-1 max-h-60 overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-ui-divider px-3 py-1.5 text-[13px] font-medium text-ui-fg-secondary">
                Set Parent
              </div>
              <button
                onClick={() => {
                  setModuleParent(moduleId, null)
                  setShowParentSelect(false)
                }}
                className={`w-full px-3 py-2 text-left text-[13px] hover:bg-ui-hover transition-colors flex items-center gap-2 ${
                  !currentParentId ? 'text-ui-accent' : 'text-ui-fg'
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full ${!currentParentId ? 'bg-ui-accent' : 'bg-transparent border border-ui-divider'}`}
                />
                None (Top-level)
              </button>
              {/* Custom Groups section */}
              {(config.customGroups || []).length > 0 && (
                <>
                  <div className="border-y border-ui-divider bg-ui-field px-3 py-1 text-[12px] text-ui-fg-secondary">
                    Groups
                  </div>
                  {(config.customGroups || []).map((group) => {
                    // Dynamic Lucide icon lookup requires any cast
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const GroupIcon = (LucideIcons as any)[group.icon] // TODO: type this
                    return (
                      <button
                        key={group.id}
                        onClick={() => {
                          setModuleParent(moduleId, group.id)
                          setShowParentSelect(false)
                        }}
                        className={`w-full px-3 py-2 text-left text-[13px] hover:bg-ui-hover transition-colors flex items-center gap-2 ${
                          currentParentId === group.id ? 'text-ui-accent' : 'text-ui-fg'
                        }`}
                      >
                        <div
                          className={`w-2 h-2 rounded-full ${currentParentId === group.id ? 'bg-ui-accent' : 'bg-transparent border border-ui-divider'}`}
                        />
                        <span style={{ color: group.iconColor || 'var(--plm-accent)' }}>
                          {GroupIcon ? <GroupIcon size={12} /> : <Package size={12} />}
                        </span>
                        {group.name}
                      </button>
                    )
                  })}
                </>
              )}

              {/* Modules section */}
              {availableParents.length > 0 && (
                <>
                  <div className="border-y border-ui-divider bg-ui-field px-3 py-1 text-[12px] text-ui-fg-secondary">
                    Modules
                  </div>
                  {availableParents.map((parent) => (
                    <button
                      key={parent.id}
                      onClick={() => {
                        setModuleParent(moduleId, parent.id)
                        setShowParentSelect(false)
                      }}
                      className={`w-full px-3 py-2 text-left text-[13px] hover:bg-ui-hover transition-colors flex items-center gap-2 ${
                        currentParentId === parent.id ? 'text-ui-accent' : 'text-ui-fg'
                      }`}
                    >
                      <div
                        className={`w-2 h-2 rounded-full ${currentParentId === parent.id ? 'bg-ui-accent' : 'bg-transparent border border-ui-divider'}`}
                      />
                      <span className="text-ui-fg-secondary mr-1">
                        {moduleIcons[parent.icon] || <Package size={12} />}
                      </span>
                      {parent.name}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {isDisabledByGroup && <Badge>Group off</Badge>}

        <Switch
          checked={!!config.enabledModules[moduleId]}
          onChange={() => {
            if (canToggle && !isDisabledByGroup) {
              setModuleEnabled(moduleId, !config.enabledModules[moduleId])
            }
          }}
          disabled={!canToggle || isDisabledByGroup}
          aria-label={module.name}
          title={
            isDenied
              ? 'Restricted by your administrator'
              : !canToggle
                ? 'This module cannot be disabled'
                : isDisabledByGroup
                  ? 'Enable the group first'
                  : undefined
          }
        />
      </div>
      {showDropAfter && !isLockedToGroup && <DropLine edge="bottom" />}
    </div>
  )
}
