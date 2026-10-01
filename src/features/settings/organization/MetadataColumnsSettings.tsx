import { useState, useEffect } from 'react'
import { log } from '@/lib/logger'
import {
  Plus,
  Trash2,
  Pencil,
  X,
  Loader2,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  Send,
} from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'
import { useTranslation } from '@/lib/i18n'
import { activeBackendSupports } from '@/lib/backendAdapter'
import type { FileMetadataColumn, MetadataColumnType } from '@/types/database'
import {
  createMetadataColumn,
  deleteMetadataColumn,
  getMetadataColumns,
  updateMetadataColumn,
} from '@/lib/metadataColumns'

interface EditingColumn {
  id?: string
  name: string
  label: string
  data_type: MetadataColumnType
  select_options: string[]
  width: number
  visible: boolean
  sortable: boolean
  required: boolean
  default_value: string
}

const DEFAULT_COLUMN: EditingColumn = {
  name: '',
  label: '',
  data_type: 'text',
  select_options: [],
  width: 120,
  visible: true,
  sortable: true,
  required: false,
  default_value: '',
}

export function MetadataColumnsSettings() {
  const { t } = useTranslation()
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
  } = usePDMStore()

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
  const typeLabels: Record<MetadataColumnType, string> = {
    text: t('settingsPages.metadata.typeText'),
    number: t('settingsPages.metadata.typeNumber'),
    date: t('settingsPages.metadata.typeDate'),
    boolean: t('settingsPages.metadata.typeBoolean'),
    select: t('settingsPages.metadata.typeSelect'),
  }

  const handleSaveUserDefaults = async () => {
    setIsSavingUserDefaults(true)
    const result = await saveUserColumnDefaults()
    setIsSavingUserDefaults(false)

    if (result.success) {
      addToast('success', t('settingsPages.metadata.personalDefaultsSaved'))
    } else {
      addToast('error', result.error || t('settingsPages.metadata.defaultsSaveFailed'))
    }
  }

  const handleLoadUserDefaults = async () => {
    setIsLoadingUserDefaults(true)
    const result = await loadUserColumnDefaults()
    setIsLoadingUserDefaults(false)

    if (result.success) {
      addToast('success', t('settingsPages.metadata.personalDefaultsLoaded'))
    } else {
      addToast('error', result.error || t('settingsPages.metadata.defaultsLoadFailed'))
    }
  }

  const handleSaveOrgDefaults = async () => {
    setIsSavingDefaults(true)
    const result = await saveOrgColumnDefaults()
    setIsSavingDefaults(false)

    if (result.success) {
      addToast('success', t('settingsPages.metadata.organizationDefaultsSaved'))
    } else {
      addToast('error', result.error || t('settingsPages.metadata.defaultsSaveFailed'))
    }
  }

  const handleLoadOrgDefaults = async () => {
    setIsLoadingDefaults(true)
    const result = await loadOrgColumnDefaults()
    setIsLoadingDefaults(false)

    if (result.success) {
      addToast('success', t('settingsPages.metadata.organizationDefaultsLoaded'))
    } else {
      addToast('error', result.error || t('settingsPages.metadata.defaultsLoadFailed'))
    }
  }

  const handleResetToDefaults = () => {
    resetColumnsToDefaults()
    addToast('info', t('settingsPages.metadata.applicationDefaultsRestored'))
  }

  // Handle force-push to all users
  const handlePushToAllUsers = async () => {
    setShowPushConfirm(false)
    setIsPushing(true)
    const result = await forceOrgColumnDefaults()
    setIsPushing(false)

    if (result.success) {
      addToast('success', t('settingsPages.metadata.layoutPushed'))
    } else {
      addToast('error', result.error || t('settingsPages.metadata.layoutPushFailed'))
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
      setColumns(await getMetadataColumns(organization.id))
    } catch (error) {
      log.error('[MetadataColumns]', 'Failed to load metadata columns', { error: error })
      addToast('error', t('settingsPages.metadata.loadFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveColumn = async () => {
    if (!editingColumn || !organization || !user) return

    // Validate
    if (!editingColumn.name.trim()) {
      addToast('error', t('settingsPages.metadata.nameRequired'))
      return
    }
    if (!editingColumn.label.trim()) {
      addToast('error', t('settingsPages.metadata.labelRequired'))
      return
    }

    // Validate name format (only lowercase letters, numbers, underscores)
    const nameRegex = /^[a-z][a-z0-9_]*$/
    if (!nameRegex.test(editingColumn.name)) {
      addToast('error', t('settingsPages.metadata.invalidName'))
      return
    }

    setIsSaving(true)

    try {
      if (editingColumn.id) {
        // Update existing column
        await updateMetadataColumn(editingColumn.id, {
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
        addToast('success', t('settingsPages.metadata.columnUpdated'))
      } else {
        // Create new column
        const maxSortOrder = columns.length > 0 ? Math.max(...columns.map((c) => c.sort_order)) : -1

        await createMetadataColumn({
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
        addToast('success', t('settingsPages.metadata.columnCreated'))
      }

      await loadColumns()
      setEditingColumn(null)
      setIsCreating(false)
    } catch (error: unknown) {
      log.error('[MetadataColumns]', 'Failed to save column', { error: error })
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      if (errorMessage.includes('duplicate key')) {
        addToast('error', t('settingsPages.metadata.duplicateName'))
      } else {
        addToast('error', t('settingsPages.metadata.columnSaveFailed'))
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteColumn = async () => {
    if (!deletingColumn) return

    setIsDeleting(true)
    try {
      await deleteMetadataColumn(deletingColumn.id)

      addToast(
        'success',
        t('settingsPages.metadata.columnDeleted', { label: deletingColumn.label }),
      )
      await loadColumns()
      setDeletingColumn(null)
    } catch (error) {
      log.error('[MetadataColumns]', 'Failed to delete column', { error: error })
      addToast('error', t('settingsPages.metadata.columnDeleteFailed'))
    } finally {
      setIsDeleting(false)
    }
  }

  const handleToggleVisibility = async (column: FileMetadataColumn) => {
    try {
      await updateMetadataColumn(column.id, {
        visible: !column.visible,
        updated_at: new Date().toISOString(),
      })

      setColumns(columns.map((c) => (c.id === column.id ? { ...c, visible: !c.visible } : c)))
    } catch (error) {
      log.error('[MetadataColumns]', 'Failed to toggle visibility', { error: error })
      addToast('error', t('settingsPages.metadata.columnUpdateFailed'))
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
        updateMetadataColumn(column.id, { sort_order: otherColumn.sort_order }),
        updateMetadataColumn(otherColumn.id, { sort_order: column.sort_order }),
      ])

      await loadColumns()
    } catch (error) {
      log.error('[MetadataColumns]', 'Failed to reorder columns', { error: error })
      addToast('error', t('settingsPages.metadata.reorderFailed'))
    }
  }

  const addSelectOption = () => {
    if (!newOption.trim() || !editingColumn) return

    if (editingColumn.select_options.includes(newOption.trim())) {
      addToast('error', t('settingsPages.metadata.optionExists'))
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
  const supportsColumnDefaults = activeBackendSupports('metadata-column-defaults')

  return (
    <div className="space-y-6">
      {/* Built-in Columns Section */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium">
            {t('settingsPages.metadata.builtInColumns')}
          </h3>
          <p className="text-sm text-plm-fg-dim mt-1">
            {t('settingsPages.metadata.standardColumns')}{' '}
            {isAdmin
              ? t('settingsPages.metadata.adminBuiltInHelp')
              : t('settingsPages.metadata.memberBuiltInHelp')}
          </p>
        </div>

        {/* Table header */}
        <div className="grid grid-cols-[1fr_80px_60px] gap-2 px-3 py-1.5 text-xs text-plm-fg-muted uppercase tracking-wide border-b border-plm-border">
          <span>{t('settingsPages.metadata.column')}</span>
          <span className="text-center">{t('settingsPages.metadata.width')}</span>
          <span className="text-center">{t('settingsPages.metadata.visible')}</span>
        </div>

        {/* Column rows */}
        <div className="space-y-0.5">
          {builtinColumns.map((column) => (
            <div
              key={column.id}
              className={`grid grid-cols-[1fr_80px_60px] gap-2 px-3 py-2 rounded hover:bg-plm-highlight/50 transition-colors items-center ${!column.visible ? 'opacity-50' : ''}`}
            >
              <span className="text-sm text-plm-fg">{column.label}</span>

              {/* Width input (admin only) */}
              {isAdmin ? (
                <input
                  type="number"
                  value={column.width}
                  onChange={(e) =>
                    setColumnWidth(column.id, Math.max(40, parseInt(e.target.value) || 40))
                  }
                  className="w-full bg-plm-bg border border-plm-border rounded px-2 py-1 text-xs text-center focus:border-plm-accent focus:outline-none"
                  min={40}
                  max={500}
                />
              ) : (
                <span className="text-xs text-plm-fg-muted text-center">{column.width}px</span>
              )}

              {/* Visibility toggle */}
              <div className="flex justify-center">
                <button
                  onClick={() => toggleColumnVisibility(column.id)}
                  className="p-1 hover:bg-plm-highlight rounded transition-colors"
                  title={
                    column.visible
                      ? t('settingsPages.metadata.hideColumn')
                      : t('settingsPages.metadata.showColumn')
                  }
                >
                  {column.visible ? (
                    <Eye size={14} className="text-plm-accent" />
                  ) : (
                    <EyeOff size={14} className="text-plm-fg-muted" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-plm-border" />

      {/* Custom Columns Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium">
              {t('settingsPages.metadata.customColumns')}
            </h3>
            <p className="text-sm text-plm-fg-dim mt-1">
              {isAdmin
                ? t('settingsPages.metadata.adminCustomHelp')
                : t('settingsPages.metadata.memberCustomHelp')}
            </p>
          </div>
          {isAdmin && !isCreating && !editingColumn && organization && (
            <button
              onClick={() => {
                setEditingColumn({ ...DEFAULT_COLUMN })
                setIsCreating(true)
              }}
              className="btn btn-primary btn-sm flex items-center gap-1"
            >
              <Plus size={14} />
              {t('settingsPages.metadata.addColumn')}
            </button>
          )}
        </div>

        {/* Create/Edit Form (admin only) */}
        {isAdmin && editingColumn && (
          <div className="p-4 bg-plm-bg rounded-lg border border-plm-accent space-y-4">
            <h3 className="font-medium text-plm-fg">
              {isCreating
                ? t('settingsPages.metadata.newColumn')
                : t('settingsPages.metadata.editColumn')}
            </h3>

            <div className="grid grid-cols-2 gap-4">
              {/* Name */}
              <div className="space-y-1">
                <label className="text-sm text-plm-fg-muted">
                  {t('settingsPages.metadata.internalName')}
                </label>
                <input
                  type="text"
                  value={editingColumn.name}
                  onChange={(e) =>
                    setEditingColumn({
                      ...editingColumn,
                      name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                    })
                  }
                  placeholder={t('settingsPages.metadata.internalNamePlaceholder')}
                  className="w-full bg-plm-bg-light border border-plm-border rounded-lg px-3 py-2 text-base focus:border-plm-accent focus:outline-none font-mono"
                  disabled={!isCreating}
                />
                <p className="text-xs text-plm-fg-dim">
                  {t('settingsPages.metadata.internalNameHelp')}
                </p>
              </div>

              {/* Label */}
              <div className="space-y-1">
                <label className="text-sm text-plm-fg-muted">
                  {t('settingsPages.metadata.displayLabel')}
                </label>
                <input
                  type="text"
                  value={editingColumn.label}
                  onChange={(e) =>
                    setEditingColumn({
                      ...editingColumn,
                      label: e.target.value,
                    })
                  }
                  placeholder={t('settingsPages.metadata.displayLabelPlaceholder')}
                  className="w-full bg-plm-bg-light border border-plm-border rounded-lg px-3 py-2 text-base focus:border-plm-accent focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {/* Data Type */}
              <div className="space-y-1">
                <label className="text-sm text-plm-fg-muted">
                  {t('settingsPages.metadata.dataType')}
                </label>
                <select
                  value={editingColumn.data_type}
                  onChange={(e) =>
                    setEditingColumn({
                      ...editingColumn,
                      data_type: e.target.value as MetadataColumnType,
                      select_options:
                        e.target.value === 'select' ? editingColumn.select_options : [],
                    })
                  }
                  className="w-full bg-plm-bg-light border border-plm-border rounded-lg px-3 py-2 text-base focus:border-plm-accent focus:outline-none"
                >
                  {Object.entries(typeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Width */}
              <div className="space-y-1">
                <label className="text-sm text-plm-fg-muted">
                  {t('settingsPages.metadata.columnWidth')}
                </label>
                <input
                  type="number"
                  value={editingColumn.width}
                  onChange={(e) =>
                    setEditingColumn({
                      ...editingColumn,
                      width: Math.max(50, parseInt(e.target.value) || 120),
                    })
                  }
                  min={50}
                  max={500}
                  className="w-full bg-plm-bg-light border border-plm-border rounded-lg px-3 py-2 text-base focus:border-plm-accent focus:outline-none"
                />
              </div>

              {/* Default Value */}
              <div className="space-y-1">
                <label className="text-sm text-plm-fg-muted">
                  {t('settingsPages.metadata.defaultValue')}
                </label>
                <input
                  type="text"
                  value={editingColumn.default_value}
                  onChange={(e) =>
                    setEditingColumn({
                      ...editingColumn,
                      default_value: e.target.value,
                    })
                  }
                  placeholder={t('settingsPages.metadata.optional')}
                  className="w-full bg-plm-bg-light border border-plm-border rounded-lg px-3 py-2 text-base focus:border-plm-accent focus:outline-none"
                />
              </div>
            </div>

            {/* Select Options (only for select type) */}
            {editingColumn.data_type === 'select' && (
              <div className="space-y-2">
                <label className="text-sm text-plm-fg-muted">
                  {t('settingsPages.metadata.dropdownOptions')}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newOption}
                    onChange={(e) => setNewOption(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addSelectOption()
                      }
                    }}
                    placeholder={t('settingsPages.metadata.addOptionPlaceholder')}
                    className="flex-1 bg-plm-bg-light border border-plm-border rounded-lg px-3 py-2 text-base focus:border-plm-accent focus:outline-none"
                  />
                  <button
                    onClick={addSelectOption}
                    disabled={!newOption.trim()}
                    className="btn btn-primary btn-sm"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                {editingColumn.select_options.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {editingColumn.select_options.map((option) => (
                      <span
                        key={option}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-plm-bg-light border border-plm-border rounded text-sm"
                      >
                        {option}
                        <button
                          onClick={() => removeSelectOption(option)}
                          className="p-0.5 hover:text-plm-error"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Toggles */}
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingColumn.visible}
                  onChange={(e) =>
                    setEditingColumn({
                      ...editingColumn,
                      visible: e.target.checked,
                    })
                  }
                  className="w-4 h-4 rounded border-plm-border text-plm-accent focus:ring-plm-accent"
                />
                <span className="text-base text-plm-fg">
                  {t('settingsPages.metadata.visibleByDefault')}
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingColumn.sortable}
                  onChange={(e) =>
                    setEditingColumn({
                      ...editingColumn,
                      sortable: e.target.checked,
                    })
                  }
                  className="w-4 h-4 rounded border-plm-border text-plm-accent focus:ring-plm-accent"
                />
                <span className="text-base text-plm-fg">
                  {t('settingsPages.metadata.sortable')}
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingColumn.required}
                  onChange={(e) =>
                    setEditingColumn({
                      ...editingColumn,
                      required: e.target.checked,
                    })
                  }
                  className="w-4 h-4 rounded border-plm-border text-plm-accent focus:ring-plm-accent"
                />
                <span className="text-base text-plm-fg">
                  {t('settingsPages.metadata.required')}
                </span>
              </label>
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end pt-2 border-t border-plm-border">
              <button
                onClick={() => {
                  setEditingColumn(null)
                  setIsCreating(false)
                }}
                className="btn btn-ghost btn-sm"
              >
                {t('settingsPages.metadata.cancel')}
              </button>
              <button
                onClick={handleSaveColumn}
                disabled={isSaving || !editingColumn.name.trim() || !editingColumn.label.trim()}
                className="btn btn-primary btn-sm"
              >
                {isSaving ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    {t('settingsPages.metadata.saving')}
                  </>
                ) : isCreating ? (
                  t('settingsPages.metadata.createColumn')
                ) : (
                  t('settingsPages.metadata.saveChanges')
                )}
              </button>
            </div>
          </div>
        )}

        {/* Custom Columns List */}
        {!organization ? (
          <div className="text-center py-6 text-plm-fg-muted text-sm border border-dashed border-plm-border rounded-lg">
            {t('settingsPages.metadata.connectOrganization')}
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="animate-spin text-plm-fg-muted" size={20} />
          </div>
        ) : columns.length === 0 && !isCreating ? (
          <div className="text-center py-6 text-plm-fg-muted text-sm border border-dashed border-plm-border rounded-lg">
            <p>{t('settingsPages.metadata.noCustomColumns')}</p>
            {isAdmin && (
              <p className="text-xs mt-1 text-plm-fg-dim">
                {t('settingsPages.metadata.noCustomColumnsHelp')}
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="grid grid-cols-[1fr_80px_80px_60px_auto] gap-2 px-3 py-1.5 text-xs text-plm-fg-muted uppercase tracking-wide border-b border-plm-border">
              <span>{t('settingsPages.metadata.column')}</span>
              <span className="text-center">{t('settingsPages.metadata.type')}</span>
              <span className="text-center">{t('settingsPages.metadata.width')}</span>
              <span className="text-center">{t('settingsPages.metadata.visible')}</span>
              {isAdmin && (
                <span className="text-center w-20">{t('settingsPages.metadata.actions')}</span>
              )}
            </div>

            {/* Column rows */}
            <div className="space-y-0.5">
              {columns.map((column, index) => (
                <div
                  key={column.id}
                  className={`grid grid-cols-[1fr_80px_80px_60px_auto] gap-2 px-3 py-2 rounded hover:bg-plm-highlight/50 transition-colors items-center group ${!column.visible ? 'opacity-50' : ''}`}
                >
                  {/* Name with reorder buttons (admin) */}
                  <div className="flex items-center gap-2">
                    {isAdmin && (
                      <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleMoveColumn(column, 'up')}
                          disabled={index === 0}
                          className="p-0 text-plm-fg-muted hover:text-plm-fg disabled:opacity-30"
                        >
                          <ChevronUp size={12} />
                        </button>
                        <button
                          onClick={() => handleMoveColumn(column, 'down')}
                          disabled={index === columns.length - 1}
                          className="p-0 text-plm-fg-muted hover:text-plm-fg disabled:opacity-30"
                        >
                          <ChevronDown size={12} />
                        </button>
                      </div>
                    )}
                    <span className="text-sm text-plm-fg">{column.label}</span>
                    {column.required && (
                      <span className="text-[10px] px-1 py-0.5 bg-plm-warning/20 text-plm-warning rounded">
                        {t('settingsPages.metadata.requiredShort')}
                      </span>
                    )}
                  </div>

                  {/* Type */}
                  <span className="text-xs text-plm-fg-muted text-center">
                    {typeLabels[column.data_type]}
                  </span>

                  {/* Width */}
                  <span className="text-xs text-plm-fg-muted text-center">{column.width}px</span>

                  {/* Visibility toggle */}
                  <div className="flex justify-center">
                    <button
                      onClick={() => handleToggleVisibility(column)}
                      className="p-1 hover:bg-plm-highlight rounded transition-colors"
                      title={
                        column.visible
                          ? t('settingsPages.metadata.hideColumn')
                          : t('settingsPages.metadata.showColumn')
                      }
                    >
                      {column.visible ? (
                        <Eye size={14} className="text-plm-accent" />
                      ) : (
                        <EyeOff size={14} className="text-plm-fg-muted" />
                      )}
                    </button>
                  </div>

                  {/* Actions (admin only) */}
                  {isAdmin && (
                    <div className="flex items-center justify-center gap-1 w-20">
                      <button
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
                        className="p-1 hover:bg-plm-highlight rounded transition-colors"
                        title={t('settingsPages.metadata.editColumn')}
                      >
                        <Pencil size={12} className="text-plm-fg-muted" />
                      </button>
                      <button
                        onClick={() => setDeletingColumn(column)}
                        className="p-1 hover:bg-plm-error/20 rounded transition-colors"
                        title={t('settingsPages.metadata.deleteColumn')}
                      >
                        <Trash2 size={12} className="text-plm-error" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Actions & Info */}
      {supportsColumnDefaults && (
        <div className="p-4 bg-plm-bg rounded border border-plm-border space-y-3">
          {/* Personal defaults - available to all users */}
          {user && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleSaveUserDefaults}
                disabled={isSavingUserDefaults}
                className="btn btn-primary btn-sm"
              >
                {isSavingUserDefaults
                  ? t('settingsPages.metadata.saving')
                  : t('settingsPages.metadata.saveMyDefaults')}
              </button>
              <button
                onClick={handleLoadUserDefaults}
                disabled={isLoadingUserDefaults}
                className="btn btn-ghost btn-sm"
              >
                {isLoadingUserDefaults
                  ? t('settingsPages.metadata.loading')
                  : t('settingsPages.metadata.loadMyDefaults')}
              </button>
              <button
                onClick={handleResetToDefaults}
                className="btn btn-ghost btn-sm text-plm-fg-muted"
              >
                {t('settingsPages.metadata.resetAppDefaults')}
              </button>
            </div>
          )}

          {/* Org defaults - admin only for save/push, all users can load */}
          {organization && (
            <div className="flex flex-wrap gap-2">
              {isAdmin && (
                <button
                  onClick={handleSaveOrgDefaults}
                  disabled={isSavingDefaults}
                  className="btn btn-sm bg-plm-accent/20 text-plm-accent hover:bg-plm-accent/30 border border-plm-accent/30"
                >
                  {isSavingDefaults
                    ? t('settingsPages.metadata.saving')
                    : t('settingsPages.metadata.saveOrgDefaults')}
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => setShowPushConfirm(true)}
                  disabled={isPushing}
                  className="btn btn-sm bg-plm-warning/20 text-plm-warning hover:bg-plm-warning/30 border border-plm-warning/30 flex items-center gap-1.5"
                >
                  {isPushing ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      {t('settingsPages.metadata.pushing')}
                    </>
                  ) : (
                    <>
                      <Send size={14} />
                      {t('settingsPages.metadata.pushAllUsers')}
                    </>
                  )}
                </button>
              )}
              <button
                onClick={handleLoadOrgDefaults}
                disabled={isLoadingDefaults}
                className="btn btn-ghost btn-sm"
              >
                {isLoadingDefaults
                  ? t('settingsPages.metadata.loading')
                  : t('settingsPages.metadata.loadOrgDefaults')}
              </button>
            </div>
          )}

          <p className="text-xs text-plm-fg-dim">
            {t('settingsPages.metadata.personalDefaultsHelp')}
            {isAdmin && ` ${t('settingsPages.metadata.organizationDefaultsHelp')}`}
          </p>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deletingColumn && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
          onClick={() => setDeletingColumn(null)}
        >
          <div
            className="bg-plm-bg-light border border-plm-border rounded-xl p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-plm-error/20 rounded-full">
                <AlertTriangle size={20} className="text-plm-error" />
              </div>
              <h3 className="text-lg font-medium text-plm-fg">
                {t('settingsPages.metadata.deleteColumn')}
              </h3>
            </div>
            <p className="text-base text-plm-fg-muted mb-4">
              {t('settingsPages.metadata.deleteConfirm', { label: deletingColumn.label })}
            </p>
            <p className="text-sm text-plm-fg-dim mb-4">{t('settingsPages.metadata.deleteHelp')}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeletingColumn(null)} className="btn btn-ghost">
                {t('settingsPages.metadata.cancel')}
              </button>
              <button
                onClick={handleDeleteColumn}
                disabled={isDeleting}
                className="btn bg-plm-error text-white hover:bg-plm-error/90 disabled:opacity-50"
              >
                {isDeleting
                  ? t('settingsPages.metadata.deleting')
                  : t('settingsPages.metadata.deleteColumn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Push to All Users Confirmation Dialog */}
      {showPushConfirm && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
          onClick={() => setShowPushConfirm(false)}
        >
          <div
            className="bg-plm-bg-light border border-plm-border rounded-xl p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-plm-warning/20 rounded-full">
                <Send size={20} className="text-plm-warning" />
              </div>
              <h3 className="text-lg font-medium text-plm-fg">
                {t('settingsPages.metadata.pushAllUsers')}
              </h3>
            </div>
            <p className="text-base text-plm-fg-muted mb-4">
              {t('settingsPages.metadata.pushConfirm')}
            </p>
            <p className="text-sm text-plm-fg-dim mb-4">{t('settingsPages.metadata.pushHelp')}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowPushConfirm(false)} className="btn btn-ghost">
                {t('settingsPages.metadata.cancel')}
              </button>
              <button
                onClick={handlePushToAllUsers}
                className="btn bg-plm-warning text-white hover:bg-plm-warning/90"
              >
                {t('settingsPages.metadata.pushAllUsers')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
