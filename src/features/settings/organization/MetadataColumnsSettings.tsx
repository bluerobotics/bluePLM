import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, Loader2, Pencil, Plus, Send, Trash2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { Badge, Button, Switch, TextInput } from '@/components/core/ui'
import { log } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import { usePDMStore } from '@/stores/pdmStore'
import type { FileMetadataColumn } from '@/types/database'

import { SettingRow, SettingsGroup, SettingsPage, SettingsSection } from '../components/ui'
import { MetadataColumnDialogs } from './MetadataColumnDialogs'
import {
  DEFAULT_COLUMN,
  MetadataColumnEditor,
  TYPE_LABELS,
  type EditingColumn,
} from './MetadataColumnEditor'

// Supabase v2 type inference incomplete for metadata column operations
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any // TODO: type this

const TABLE_HEAD = 'px-4 py-2 text-[12px] font-medium text-plm-fg-muted'

export function MetadataColumnsSettings() {
  const {
    user,
    organization,
    addToast,
    columns: builtinColumns,
    toggleColumnVisibility,
    setColumnWidth,
    saveOrgColumnDefaults,
    loadOrgColumnDefaults,
    forceOrgColumnDefaults,
    saveUserColumnDefaults,
    loadUserColumnDefaults,
    resetColumnsToDefaults,
    getEffectiveRole,
  } = usePDMStore(
    useShallow((s) => ({
      user: s.user,
      organization: s.organization,
      addToast: s.addToast,
      columns: s.columns,
      toggleColumnVisibility: s.toggleColumnVisibility,
      setColumnWidth: s.setColumnWidth,
      saveOrgColumnDefaults: s.saveOrgColumnDefaults,
      loadOrgColumnDefaults: s.loadOrgColumnDefaults,
      forceOrgColumnDefaults: s.forceOrgColumnDefaults,
      saveUserColumnDefaults: s.saveUserColumnDefaults,
      loadUserColumnDefaults: s.loadUserColumnDefaults,
      resetColumnsToDefaults: s.resetColumnsToDefaults,
      getEffectiveRole: s.getEffectiveRole,
    })),
  )

  const [columns, setColumns] = useState<FileMetadataColumn[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isSavingDefaults, setIsSavingDefaults] = useState(false)
  const [isSavingUserDefaults, setIsSavingUserDefaults] = useState(false)
  const [isLoadingDefaults, setIsLoadingDefaults] = useState(false)
  const [isLoadingUserDefaults, setIsLoadingUserDefaults] = useState(false)
  const [isPushing, setIsPushing] = useState(false)
  const [showPushConfirm, setShowPushConfirm] = useState(false)

  // Editing state
  const [editingColumn, setEditingColumn] = useState<EditingColumn | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [deletingColumn, setDeletingColumn] = useState<FileMetadataColumn | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Select options editing
  const [newOption, setNewOption] = useState('')

  const handleSaveUserDefaults = async () => {
    setIsSavingUserDefaults(true)
    const result = await saveUserColumnDefaults()
    setIsSavingUserDefaults(false)

    if (result.success) {
      addToast('success', 'Saved as your personal defaults')
    } else {
      addToast('error', result.error || 'Failed to save defaults')
    }
  }

  const handleLoadUserDefaults = async () => {
    setIsLoadingUserDefaults(true)
    const result = await loadUserColumnDefaults()
    setIsLoadingUserDefaults(false)

    if (result.success) {
      addToast('success', 'Loaded your personal defaults')
    } else {
      addToast('error', result.error || 'Failed to load defaults')
    }
  }

  const handleSaveOrgDefaults = async () => {
    setIsSavingDefaults(true)
    const result = await saveOrgColumnDefaults()
    setIsSavingDefaults(false)

    if (result.success) {
      addToast('success', 'Saved as organization defaults')
    } else {
      addToast('error', result.error || 'Failed to save defaults')
    }
  }

  const handleLoadOrgDefaults = async () => {
    setIsLoadingDefaults(true)
    const result = await loadOrgColumnDefaults()
    setIsLoadingDefaults(false)

    if (result.success) {
      addToast('success', 'Loaded organization defaults')
    } else {
      addToast('error', result.error || 'Failed to load defaults')
    }
  }

  const handleResetToDefaults = () => {
    resetColumnsToDefaults()
    addToast('info', 'Reset to application defaults')
  }

  // Handle force-push to all users
  const handlePushToAllUsers = async () => {
    setShowPushConfirm(false)
    setIsPushing(true)
    const result = await forceOrgColumnDefaults()
    setIsPushing(false)

    if (result.success) {
      addToast('success', 'Column layout pushed to all users')
    } else {
      addToast('error', result.error || 'Failed to push column layout')
    }
  }

  // Load columns
  useEffect(() => {
    if (organization) {
      loadColumns()
    }
  }, [organization])

  const loadColumns = async () => {
    if (!organization) return

    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('file_metadata_columns')
        .select('*')
        .eq('org_id', organization.id)
        .order('sort_order')

      if (error) {
        log.error('[MetadataColumns]', 'Failed to load metadata columns', { error })
        addToast('error', 'Failed to load metadata columns')
      } else {
        setColumns(data || [])
      }
    } catch (error) {
      log.error('[MetadataColumns]', 'Failed to load metadata columns', { error: error })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveColumn = async () => {
    if (!editingColumn || !organization || !user) return

    // Validate
    if (!editingColumn.name.trim()) {
      addToast('error', 'Column name is required')
      return
    }
    if (!editingColumn.label.trim()) {
      addToast('error', 'Column label is required')
      return
    }

    // Validate name format (only lowercase letters, numbers, underscores)
    const nameRegex = /^[a-z][a-z0-9_]*$/
    if (!nameRegex.test(editingColumn.name)) {
      addToast(
        'error',
        'Name must start with a letter and contain only lowercase letters, numbers, and underscores',
      )
      return
    }

    setIsSaving(true)

    try {
      if (editingColumn.id) {
        // Update existing column
        const { error } = await db
          .from('file_metadata_columns')
          .update({
            name: editingColumn.name.toLowerCase(),
            label: editingColumn.label,
            data_type: editingColumn.data_type,
            select_options: editingColumn.select_options,
            width: editingColumn.width,
            visible: editingColumn.visible,
            sortable: editingColumn.sortable,
            required: editingColumn.required,
            default_value: editingColumn.default_value || null,
            updated_at: new Date().toISOString(),
            updated_by: user.id,
          })
          .eq('id', editingColumn.id)

        if (error) throw error
        addToast('success', 'Column updated')
      } else {
        // Create new column
        const maxSortOrder = columns.length > 0 ? Math.max(...columns.map((c) => c.sort_order)) : -1

        const { error } = await db.from('file_metadata_columns').insert({
          org_id: organization.id,
          name: editingColumn.name.toLowerCase(),
          label: editingColumn.label,
          data_type: editingColumn.data_type,
          select_options: editingColumn.select_options,
          width: editingColumn.width,
          visible: editingColumn.visible,
          sortable: editingColumn.sortable,
          required: editingColumn.required,
          default_value: editingColumn.default_value || null,
          sort_order: maxSortOrder + 1,
          created_by: user.id,
        })

        if (error) throw error
        addToast('success', 'Column created')
      }

      await loadColumns()
      setEditingColumn(null)
      setIsCreating(false)
    } catch (error: unknown) {
      log.error('[MetadataColumns]', 'Failed to save column', { error: error })
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      if (errorMessage.includes('duplicate key')) {
        addToast('error', 'A column with this name already exists')
      } else {
        addToast('error', 'Failed to save column')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteColumn = async () => {
    if (!deletingColumn) return

    setIsDeleting(true)
    try {
      const { error } = await supabase
        .from('file_metadata_columns')
        .delete()
        .eq('id', deletingColumn.id)

      if (error) throw error

      addToast('success', `Column "${deletingColumn.label}" deleted`)
      await loadColumns()
      setDeletingColumn(null)
    } catch (error) {
      log.error('[MetadataColumns]', 'Failed to delete column', { error: error })
      addToast('error', 'Failed to delete column')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleToggleVisibility = async (column: FileMetadataColumn) => {
    try {
      const { error } = await db
        .from('file_metadata_columns')
        .update({ visible: !column.visible, updated_at: new Date().toISOString() })
        .eq('id', column.id)

      if (error) throw error

      setColumns(columns.map((c) => (c.id === column.id ? { ...c, visible: !c.visible } : c)))
    } catch (error) {
      log.error('[MetadataColumns]', 'Failed to toggle visibility', { error: error })
      addToast('error', 'Failed to update column')
    }
  }

  const handleMoveColumn = async (column: FileMetadataColumn, direction: 'up' | 'down') => {
    const index = columns.findIndex((c) => c.id === column.id)
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === columns.length - 1) return

    const swapIndex = direction === 'up' ? index - 1 : index + 1
    const otherColumn = columns[swapIndex]

    try {
      // Swap sort orders
      await Promise.all([
        db
          .from('file_metadata_columns')
          .update({ sort_order: otherColumn.sort_order })
          .eq('id', column.id),
        db
          .from('file_metadata_columns')
          .update({ sort_order: column.sort_order })
          .eq('id', otherColumn.id),
      ])

      await loadColumns()
    } catch (error) {
      log.error('[MetadataColumns]', 'Failed to reorder columns', { error: error })
      addToast('error', 'Failed to reorder columns')
    }
  }

  const addSelectOption = () => {
    if (!newOption.trim() || !editingColumn) return

    if (editingColumn.select_options.includes(newOption.trim())) {
      addToast('error', 'This option already exists')
      return
    }

    setEditingColumn({
      ...editingColumn,
      select_options: [...editingColumn.select_options, newOption.trim()],
    })
    setNewOption('')
  }

  const removeSelectOption = (option: string) => {
    if (!editingColumn) return
    setEditingColumn({
      ...editingColumn,
      select_options: editingColumn.select_options.filter((o) => o !== option),
    })
  }

  const isAdmin = getEffectiveRole() === 'admin'

  return (
    <SettingsPage>
      <SettingsSection
        title="Built-in Columns"
        description={`Standard columns. ${
          isAdmin
            ? 'Set default width and visibility for your organization.'
            : 'Toggle visibility to show/hide.'
        }`}
      >
        <SettingsGroup>
          <div className={`grid grid-cols-[1fr_96px_64px] items-center gap-2 ${TABLE_HEAD}`}>
            <span>Column</span>
            <span className="text-center">Width</span>
            <span className="text-center">Visible</span>
          </div>
          {builtinColumns.map((column) => (
            <div
              key={column.id}
              className="grid grid-cols-[1fr_96px_64px] items-center gap-2 px-4 py-2"
            >
              <span
                className={`truncate text-[13px] ${column.visible ? 'text-plm-fg' : 'text-plm-fg-muted'}`}
              >
                {column.label}
              </span>
              {isAdmin ? (
                <TextInput
                  type="number"
                  size="sm"
                  value={column.width}
                  onChange={(e) =>
                    setColumnWidth(column.id, Math.max(40, parseInt(e.target.value) || 40))
                  }
                  className="text-center"
                  min={40}
                  max={500}
                  aria-label={`${column.label} width`}
                />
              ) : (
                <span className="text-center text-[12px] text-plm-fg-muted">{column.width}px</span>
              )}
              <div className="flex justify-center">
                <Switch
                  size="sm"
                  checked={column.visible}
                  onChange={() => toggleColumnVisibility(column.id)}
                  title={column.visible ? 'Hide column' : 'Show column'}
                  aria-label={column.visible ? 'Hide column' : 'Show column'}
                />
              </div>
            </div>
          ))}
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        title="Custom Columns"
        description={
          isAdmin
            ? 'Define custom properties that appear in the file browser.'
            : 'Custom properties defined by your organization admin.'
        }
        actions={
          isAdmin &&
          !isCreating &&
          !editingColumn &&
          organization && (
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => {
                setEditingColumn({ ...DEFAULT_COLUMN })
                setIsCreating(true)
              }}
            >
              Add Column
            </Button>
          )
        }
      >
        {isAdmin && editingColumn && (
          <MetadataColumnEditor
            column={editingColumn}
            onChange={setEditingColumn}
            isCreating={isCreating}
            isSaving={isSaving}
            newOption={newOption}
            onNewOptionChange={setNewOption}
            onAddOption={addSelectOption}
            onRemoveOption={removeSelectOption}
            onCancel={() => {
              setEditingColumn(null)
              setIsCreating(false)
            }}
            onSave={handleSaveColumn}
          />
        )}

        {!organization ? (
          <SettingsGroup>
            <p className="px-4 py-6 text-center text-[13px] text-plm-fg-muted">
              Connect to an organization to view custom columns
            </p>
          </SettingsGroup>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="animate-spin text-plm-fg-muted" size={20} />
          </div>
        ) : columns.length === 0 && !isCreating ? (
          <SettingsGroup>
            <div className="px-4 py-6 text-center">
              <p className="text-[13px] text-plm-fg-muted">No custom columns defined</p>
              {isAdmin && (
                <p className="mt-1 text-[12px] text-plm-fg-muted">
                  Click "Add Column" to create custom properties like Material, Weight, etc.
                </p>
              )}
            </div>
          </SettingsGroup>
        ) : columns.length > 0 ? (
          <SettingsGroup>
            <div
              className={`grid grid-cols-[1fr_80px_80px_64px_auto] items-center gap-2 ${TABLE_HEAD}`}
            >
              <span>Column</span>
              <span className="text-center">Type</span>
              <span className="text-center">Width</span>
              <span className="text-center">Visible</span>
              {isAdmin && <span className="w-16 text-center">Actions</span>}
            </div>
            {columns.map((column, index) => (
              <div
                key={column.id}
                className="group grid grid-cols-[1fr_80px_80px_64px_auto] items-center gap-2 px-4 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {isAdmin && (
                    <div className="flex flex-col opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => handleMoveColumn(column, 'up')}
                        disabled={index === 0}
                        className="text-plm-fg-muted hover:text-plm-fg disabled:opacity-30"
                        aria-label="Move up"
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveColumn(column, 'down')}
                        disabled={index === columns.length - 1}
                        className="text-plm-fg-muted hover:text-plm-fg disabled:opacity-30"
                        aria-label="Move down"
                      >
                        <ChevronDown size={12} />
                      </button>
                    </div>
                  )}
                  <span
                    className={`truncate text-[13px] ${column.visible ? 'text-plm-fg' : 'text-plm-fg-muted'}`}
                  >
                    {column.label}
                  </span>
                  {column.required && <Badge tone="warning">Required</Badge>}
                </div>
                <span className="text-center text-[12px] text-plm-fg-muted">
                  {TYPE_LABELS[column.data_type]}
                </span>
                <span className="text-center text-[12px] text-plm-fg-muted">{column.width}px</span>
                <div className="flex justify-center">
                  <Switch
                    size="sm"
                    checked={column.visible}
                    onChange={() => handleToggleVisibility(column)}
                    title={column.visible ? 'Hide column' : 'Show column'}
                    aria-label={column.visible ? 'Hide column' : 'Show column'}
                  />
                </div>
                {isAdmin && (
                  <div className="flex w-16 items-center justify-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Pencil size={13} />}
                      onClick={() => {
                        setEditingColumn({
                          id: column.id,
                          name: column.name,
                          label: column.label,
                          data_type: column.data_type,
                          select_options: column.select_options || [],
                          width: column.width,
                          visible: column.visible,
                          sortable: column.sortable,
                          required: column.required,
                          default_value: column.default_value || '',
                        })
                        setIsCreating(false)
                      }}
                      className="!px-1.5"
                      title="Edit column"
                      aria-label="Edit column"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 size={13} />}
                      onClick={() => setDeletingColumn(column)}
                      className="!px-1.5 !text-plm-error"
                      title="Delete column"
                      aria-label="Delete column"
                    />
                  </div>
                )}
              </div>
            ))}
          </SettingsGroup>
        ) : null}
      </SettingsSection>

      <SettingsSection title="Column layout">
        <SettingsGroup>
          {user && (
            <SettingRow
              label="Your layout"
              description='"Save as My Defaults" saves your column layout to the cloud so it syncs across devices.'
            >
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveUserDefaults}
                disabled={isSavingUserDefaults}
              >
                {isSavingUserDefaults ? 'Saving...' : 'Save as My Defaults'}
              </Button>
              <Button size="sm" onClick={handleLoadUserDefaults} disabled={isLoadingUserDefaults}>
                {isLoadingUserDefaults ? 'Loading...' : 'Load My Defaults'}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleResetToDefaults}>
                Reset to App Defaults
              </Button>
            </SettingRow>
          )}
          {organization && (
            <SettingRow
              label="Organization layout"
              description={
                isAdmin
                  ? '"Save as Org Defaults" sets the starting configuration for new team members. "Push to All Users" overrides every user\'s current column layout.'
                  : undefined
              }
            >
              {isAdmin && (
                <Button size="sm" onClick={handleSaveOrgDefaults} disabled={isSavingDefaults}>
                  {isSavingDefaults ? 'Saving...' : 'Save as Org Defaults'}
                </Button>
              )}
              {isAdmin && (
                <Button
                  variant="danger-subtle"
                  size="sm"
                  icon={<Send size={14} />}
                  loading={isPushing}
                  onClick={() => setShowPushConfirm(true)}
                >
                  {isPushing ? 'Pushing...' : 'Push to All Users'}
                </Button>
              )}
              <Button size="sm" onClick={handleLoadOrgDefaults} disabled={isLoadingDefaults}>
                {isLoadingDefaults ? 'Loading...' : 'Load Org Defaults'}
              </Button>
            </SettingRow>
          )}
        </SettingsGroup>
      </SettingsSection>

      <MetadataColumnDialogs
        deletingColumn={deletingColumn}
        isDeleting={isDeleting}
        onCancelDelete={() => setDeletingColumn(null)}
        onConfirmDelete={handleDeleteColumn}
        showPushConfirm={showPushConfirm}
        onCancelPush={() => setShowPushConfirm(false)}
        onConfirmPush={handlePushToAllUsers}
      />
    </SettingsPage>
  )
}
