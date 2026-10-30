/**
 * ModulesEditor - Reusable module configuration UI
 *
 * This component handles all the module editing UI:
 * - Drag and drop reordering
 * - Enable/disable modules
 * - Adding dividers
 * - Creating custom groups
 * - Setting module parents (sub-menus)
 * - Setting icon colors
 *
 * Used by:
 * - ModulesSettings (for personal/org module config)
 * - TeamModulesDialog (for team-specific module defaults)
 *
 * One row of the list is ModuleOrderListItem; the group dialog is GroupEditorModal.
 */

import { useMemo, useState } from 'react'
import { ChevronRight, Lock, Minus, Plus } from 'lucide-react'

import { Badge, Button, Callout } from '@/components/core/ui'
import { SettingsGroup, SettingsSection } from '@/features/settings/components/ui'
import {
  buildCombinedOrderList,
  getChildModules,
  type ModuleId,
  type ModuleConfig,
  type OrderListItem,
  type CustomGroup,
  type SectionDivider,
} from '@/types/modules'

import { ExtensionModulesSection } from './ExtensionModulesSection'
import { GroupEditorModal } from './GroupEditorModal'
import { ModuleOrderListItem } from './ModuleOrderListItem'

// Props for the ModulesEditor component
export interface ModulesEditorProps {
  config: ModuleConfig
  onConfigChange: (config: ModuleConfig) => void
  showDescription?: boolean
  /**
   * Modules an admin has restricted away from the current user. They stay
   * listed so the sidebar order still makes sense, but cannot be turned on.
   * Left unset when editing someone else's defaults (org or team), where the
   * current user's own restrictions are irrelevant.
   */
  deniedModuleIds?: ReadonlySet<ModuleId>
}

/**
 * Main ModulesEditor component
 */
export function ModulesEditor({
  config,
  onConfigChange,
  showDescription = true,
  deniedModuleIds,
}: ModulesEditorProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndicator, setDropIndicator] = useState<{
    index: number
    position: 'before' | 'after'
  } | null>(null)
  const [showGroupEditor, setShowGroupEditor] = useState(false)
  const [editingGroup, setEditingGroup] = useState<{
    id: string
    name: string
    icon: string
    iconColor: string | null
  } | null>(null)

  // Build combined list for display (including custom groups)
  const combinedList = useMemo(() => {
    return buildCombinedOrderList(config.moduleOrder, config.dividers, config.customGroups || [])
  }, [config.moduleOrder, config.dividers, config.customGroups])

  const handleDragStart = (index: number) => {
    setDragIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (dragIndex === null || index === dragIndex) {
      setDropIndicator(null)
      return
    }

    // Calculate if we're in the top or bottom half
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = e.clientY - rect.top
    const isTopHalf = y < rect.height / 2

    // Determine the insertion point (gap between items)
    let insertGap: number
    if (isTopHalf) {
      insertGap = index
    } else {
      insertGap = index + 1
    }

    // Check if this would result in no actual movement
    if (insertGap === dragIndex || insertGap === dragIndex + 1) {
      if (insertGap <= dragIndex && dragIndex > 0) {
        setDropIndicator({ index: dragIndex - 1, position: 'after' })
      } else if (insertGap > dragIndex && dragIndex < combinedList.length - 1) {
        setDropIndicator({ index: dragIndex, position: 'after' })
      } else {
        setDropIndicator(null)
      }
      return
    }

    if (insertGap === 0) {
      setDropIndicator({ index: 0, position: 'before' })
    } else {
      setDropIndicator({ index: insertGap - 1, position: 'after' })
    }
  }

  const handleDrop = () => {
    if (dragIndex !== null && dropIndicator !== null) {
      const newList = [...combinedList]
      const draggedItem = newList[dragIndex]

      let itemsToMove: OrderListItem[] = []
      let indicesToRemove: number[] = []

      if (draggedItem.type === 'group') {
        const childModuleIds = getChildModules(draggedItem.id, config).map((m) => m.id)

        itemsToMove.push(draggedItem)
        indicesToRemove.push(dragIndex)

        newList.forEach((item, idx) => {
          if (item.type === 'module' && childModuleIds.includes(item.id as ModuleId)) {
            itemsToMove.push(item)
            indicesToRemove.push(idx)
          }
        })

        indicesToRemove.sort((a, b) => b - a)
      } else {
        itemsToMove = [draggedItem]
        indicesToRemove = [dragIndex]
      }

      for (const idx of indicesToRemove) {
        newList.splice(idx, 1)
      }

      let insertIndex = dropIndicator.index
      if (dropIndicator.position === 'after') {
        insertIndex++
      }
      const removedBefore = indicesToRemove.filter((idx) => idx < insertIndex).length
      insertIndex -= removedBefore

      newList.splice(insertIndex, 0, ...itemsToMove)

      // Convert the new list back to moduleOrder, dividers, and update customGroups order
      const newModuleOrder: ModuleId[] = []
      const newDividers: SectionDivider[] = []
      const seenGroupIds = new Set<string>()

      newList.forEach((item) => {
        if (item.type === 'module') {
          newModuleOrder.push(item.id as ModuleId)
        } else if (item.type === 'divider') {
          // Find the original divider to preserve its enabled state
          const originalDivider = config.dividers.find((d) => d.id === item.id)
          newDividers.push({
            id: item.id,
            position: newModuleOrder.length - 1,
            enabled: originalDivider?.enabled ?? true,
          })
        } else if (item.type === 'group') {
          seenGroupIds.add(item.id)
          // Groups are ordered by their position in the combined list
        }
      })

      onConfigChange({
        ...config,
        moduleOrder: newModuleOrder,
        dividers: newDividers,
      })
    }
    setDragIndex(null)
    setDropIndicator(null)
  }

  const handleDragEnd = () => {
    setDragIndex(null)
    setDropIndicator(null)
  }

  const handleAddDivider = () => {
    const newDivider: SectionDivider = {
      id: `divider-${Date.now()}`,
      position: config.moduleOrder.length - 1,
      enabled: true,
    }
    onConfigChange({
      ...config,
      dividers: [...config.dividers, newDivider],
    })
  }

  const handleAddGroup = () => {
    setEditingGroup(null)
    setShowGroupEditor(true)
  }

  const handleEditGroup = (group: {
    id: string
    name: string
    icon: string
    iconColor: string | null
  }) => {
    setEditingGroup(group)
    setShowGroupEditor(true)
  }

  const handleSaveGroup = (name: string, icon: string, iconColor: string | null) => {
    if (editingGroup) {
      // Update existing group
      const newGroups = (config.customGroups || []).map((g) =>
        g.id === editingGroup.id ? { ...g, name, icon, iconColor } : g,
      )
      onConfigChange({
        ...config,
        customGroups: newGroups,
      })
    } else {
      // Add new group at the end
      const newGroup: CustomGroup = {
        id: `group-${Date.now()}`,
        name,
        icon,
        iconColor,
        enabled: true,
        position: config.moduleOrder.length,
      }
      onConfigChange({
        ...config,
        customGroups: [...(config.customGroups || []), newGroup],
      })
    }
    setShowGroupEditor(false)
    setEditingGroup(null)
  }

  return (
    <div className="space-y-6">
      <SettingsSection
        title="Sidebar Order"
        description={
          showDescription
            ? 'Drag to reorder. Toggle to enable/disable. Disabling a module hides its dependents.'
            : undefined
        }
        actions={
          <>
            <Button
              size="sm"
              icon={<Plus size={12} />}
              onClick={handleAddGroup}
              title="Add a custom group"
            >
              Add Group
            </Button>
            <Button
              size="sm"
              icon={<Plus size={12} />}
              onClick={handleAddDivider}
              title="Add a section divider"
            >
              Add Divider
            </Button>
          </>
        }
      >
        {/* overflow-visible: the colour and parent pickers open below their row */}
        <SettingsGroup className="!overflow-visible">
          {combinedList.map((item, index) => (
            <div
              key={
                item.type === 'module'
                  ? item.id
                  : item.type === 'group'
                    ? `group-${item.id}`
                    : `divider-${item.id}`
              }
              onDragEnd={handleDragEnd}
              onDragOver={(e) => {
                e.preventDefault()
                handleDragOver(e, index)
              }}
              onDragEnter={(e) => {
                e.preventDefault()
                handleDragOver(e, index)
              }}
              onDrop={(e) => {
                e.preventDefault()
                handleDrop()
              }}
            >
              <ModuleOrderListItem
                item={item}
                index={index}
                config={config}
                onConfigChange={onConfigChange}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                isDragging={dragIndex === index}
                dropIndicator={dropIndicator}
                onEditGroup={handleEditGroup}
                deniedModuleIds={deniedModuleIds}
              />
            </div>
          ))}
        </SettingsGroup>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-ui-fg-secondary">
          <div className="flex items-center gap-1.5">
            <Lock size={11} />
            <span>Required module</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Minus size={11} />
            <span>Section divider</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ChevronRight size={11} />
            <span>Has sub-items / Set parent</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge tone="warning">In Development</Badge>
            <span>Feature in progress</span>
          </div>
          {deniedModuleIds && deniedModuleIds.size > 0 && (
            <div className="flex items-center gap-1.5">
              <Badge icon={<Lock size={10} />}>No Access</Badge>
              <span>Restricted to other teams by an admin</span>
            </div>
          )}
        </div>

        <Callout title="Creating Sub-menus">
          Click the <ChevronRight size={11} className="inline" /> button on any module to set its
          parent. Child modules will appear as a fly-out submenu when hovering their parent in the
          sidebar.
        </Callout>
      </SettingsSection>

      {/* Native extension workspaces: visibility only (placed by their group) */}
      <ExtensionModulesSection
        config={config}
        onConfigChange={onConfigChange}
        deniedModuleIds={deniedModuleIds}
      />

      {/* Group Editor Modal */}
      {showGroupEditor && (
        <GroupEditorModal
          group={editingGroup}
          onSave={handleSaveGroup}
          onCancel={() => {
            setShowGroupEditor(false)
            setEditingGroup(null)
          }}
        />
      )}
    </div>
  )
}
