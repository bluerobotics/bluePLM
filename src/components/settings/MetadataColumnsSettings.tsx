import { useState, useEffect } from 'react'
import { 
  Columns3, 
  Plus, 
  Trash2, 
  Pencil, 
  GripVertical, 
  Check, 
  X, 
  Loader2,
  Eye,
  EyeOff,
  Type,
  Hash,
  Calendar,
  ToggleLeft,
  List,
  ChevronUp,
  ChevronDown,
  AlertTriangle
} from 'lucide-react'
import { usePDMStore } from '../../stores/pdmStore'
import { supabase } from '../../lib/supabase'
import type { FileMetadataColumn, MetadataColumnType } from '../../types/database'

// Type icons for visual display
const TYPE_ICONS: Record<MetadataColumnType, typeof Type> = {
  text: Type,
  number: Hash,
  date: Calendar,
  boolean: ToggleLeft,
  select: List
}

const TYPE_LABELS: Record<MetadataColumnType, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  boolean: 'Yes/No',
  select: 'Dropdown'
}

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
  default_value: ''
}

export function MetadataColumnsSettings() {
  const { user, organization, addToast } = usePDMStore()
  
  const [columns, setColumns] = useState<FileMetadataColumn[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  
  // Editing state
  const [editingColumn, setEditingColumn] = useState<EditingColumn | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [deletingColumn, setDeletingColumn] = useState<FileMetadataColumn | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  
  // Select options editing
  const [newOption, setNewOption] = useState('')

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
        console.error('Failed to load metadata columns:', error)
        addToast('error', 'Failed to load metadata columns')
      } else {
        setColumns(data || [])
      }
    } catch (err) {
      console.error('Failed to load metadata columns:', err)
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
      addToast('error', 'Name must start with a letter and contain only lowercase letters, numbers, and underscores')
      return
    }
    
    setIsSaving(true)
    
    try {
      if (editingColumn.id) {
        // Update existing column
        const { error } = await supabase
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
            updated_by: user.id
          })
          .eq('id', editingColumn.id)
        
        if (error) throw error
        addToast('success', 'Column updated')
      } else {
        // Create new column
        const maxSortOrder = columns.length > 0 
          ? Math.max(...columns.map(c => c.sort_order)) 
          : -1
        
        const { error } = await supabase
          .from('file_metadata_columns')
          .insert({
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
            created_by: user.id
          })
        
        if (error) throw error
        addToast('success', 'Column created')
      }
      
      await loadColumns()
      setEditingColumn(null)
      setIsCreating(false)
    } catch (err: unknown) {
      console.error('Failed to save column:', err)
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
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
    } catch (err) {
      console.error('Failed to delete column:', err)
      addToast('error', 'Failed to delete column')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleToggleVisibility = async (column: FileMetadataColumn) => {
    try {
      const { error } = await supabase
        .from('file_metadata_columns')
        .update({ visible: !column.visible, updated_at: new Date().toISOString() })
        .eq('id', column.id)
      
      if (error) throw error
      
      setColumns(columns.map(c => 
        c.id === column.id ? { ...c, visible: !c.visible } : c
      ))
    } catch (err) {
      console.error('Failed to toggle visibility:', err)
      addToast('error', 'Failed to update column')
    }
  }

  const handleMoveColumn = async (column: FileMetadataColumn, direction: 'up' | 'down') => {
    const index = columns.findIndex(c => c.id === column.id)
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === columns.length - 1) return
    
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    const otherColumn = columns[swapIndex]
    
    try {
      // Swap sort orders
      await Promise.all([
        supabase
          .from('file_metadata_columns')
          .update({ sort_order: otherColumn.sort_order })
          .eq('id', column.id),
        supabase
          .from('file_metadata_columns')
          .update({ sort_order: column.sort_order })
          .eq('id', otherColumn.id)
      ])
      
      await loadColumns()
    } catch (err) {
      console.error('Failed to reorder columns:', err)
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
      select_options: [...editingColumn.select_options, newOption.trim()]
    })
    setNewOption('')
  }

  const removeSelectOption = (option: string) => {
    if (!editingColumn) return
    setEditingColumn({
      ...editingColumn,
      select_options: editingColumn.select_options.filter(o => o !== option)
    })
  }

  if (!organization) {
    return (
      <div className="text-center py-12 text-pdm-fg-muted text-base">
        No organization connected
      </div>
    )
  }

  if (user?.role !== 'admin') {
    return (
      <div className="text-center py-12 text-pdm-fg-muted text-base">
        Only organization admins can manage metadata columns
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-pdm-fg-muted uppercase tracking-wide font-medium">
            <Columns3 size={16} />
            Custom Metadata Columns
          </div>
          <p className="text-base text-pdm-fg-muted mt-1">
            Define custom properties that appear as columns in the file browser
          </p>
        </div>
        {!isCreating && !editingColumn && (
          <button
            onClick={() => {
              setEditingColumn({ ...DEFAULT_COLUMN })
              setIsCreating(true)
            }}
            className="btn btn-primary btn-sm flex items-center gap-1"
          >
            <Plus size={14} />
            Add Column
          </button>
        )}
      </div>

      {/* Create/Edit Form */}
      {editingColumn && (
        <div className="p-4 bg-pdm-bg rounded-lg border border-pdm-accent space-y-4">
          <h3 className="font-medium text-pdm-fg">
            {isCreating ? 'New Column' : 'Edit Column'}
          </h3>
          
          <div className="grid grid-cols-2 gap-4">
            {/* Name */}
            <div className="space-y-1">
              <label className="text-sm text-pdm-fg-muted">Internal Name</label>
              <input
                type="text"
                value={editingColumn.name}
                onChange={(e) => setEditingColumn({
                  ...editingColumn,
                  name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')
                })}
                placeholder="e.g., material, weight"
                className="w-full bg-pdm-bg-light border border-pdm-border rounded-lg px-3 py-2 text-base focus:border-pdm-accent focus:outline-none font-mono"
                disabled={!isCreating}
              />
              <p className="text-xs text-pdm-fg-dim">
                Used in data storage. Lowercase letters, numbers, underscores only.
              </p>
            </div>
            
            {/* Label */}
            <div className="space-y-1">
              <label className="text-sm text-pdm-fg-muted">Display Label</label>
              <input
                type="text"
                value={editingColumn.label}
                onChange={(e) => setEditingColumn({
                  ...editingColumn,
                  label: e.target.value
                })}
                placeholder="e.g., Material, Weight (kg)"
                className="w-full bg-pdm-bg-light border border-pdm-border rounded-lg px-3 py-2 text-base focus:border-pdm-accent focus:outline-none"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            {/* Data Type */}
            <div className="space-y-1">
              <label className="text-sm text-pdm-fg-muted">Data Type</label>
              <select
                value={editingColumn.data_type}
                onChange={(e) => setEditingColumn({
                  ...editingColumn,
                  data_type: e.target.value as MetadataColumnType,
                  select_options: e.target.value === 'select' ? editingColumn.select_options : []
                })}
                className="w-full bg-pdm-bg-light border border-pdm-border rounded-lg px-3 py-2 text-base focus:border-pdm-accent focus:outline-none"
              >
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            
            {/* Width */}
            <div className="space-y-1">
              <label className="text-sm text-pdm-fg-muted">Column Width (px)</label>
              <input
                type="number"
                value={editingColumn.width}
                onChange={(e) => setEditingColumn({
                  ...editingColumn,
                  width: Math.max(50, parseInt(e.target.value) || 120)
                })}
                min={50}
                max={500}
                className="w-full bg-pdm-bg-light border border-pdm-border rounded-lg px-3 py-2 text-base focus:border-pdm-accent focus:outline-none"
              />
            </div>
            
            {/* Default Value */}
            <div className="space-y-1">
              <label className="text-sm text-pdm-fg-muted">Default Value</label>
              <input
                type="text"
                value={editingColumn.default_value}
                onChange={(e) => setEditingColumn({
                  ...editingColumn,
                  default_value: e.target.value
                })}
                placeholder="Optional"
                className="w-full bg-pdm-bg-light border border-pdm-border rounded-lg px-3 py-2 text-base focus:border-pdm-accent focus:outline-none"
              />
            </div>
          </div>
          
          {/* Select Options (only for select type) */}
          {editingColumn.data_type === 'select' && (
            <div className="space-y-2">
              <label className="text-sm text-pdm-fg-muted">Dropdown Options</label>
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
                  placeholder="Add an option..."
                  className="flex-1 bg-pdm-bg-light border border-pdm-border rounded-lg px-3 py-2 text-base focus:border-pdm-accent focus:outline-none"
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
                      className="inline-flex items-center gap-1 px-2 py-1 bg-pdm-bg-light border border-pdm-border rounded text-sm"
                    >
                      {option}
                      <button
                        onClick={() => removeSelectOption(option)}
                        className="p-0.5 hover:text-pdm-error"
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
                onChange={(e) => setEditingColumn({
                  ...editingColumn,
                  visible: e.target.checked
                })}
                className="w-4 h-4 rounded border-pdm-border text-pdm-accent focus:ring-pdm-accent"
              />
              <span className="text-base text-pdm-fg">Visible by default</span>
            </label>
            
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editingColumn.sortable}
                onChange={(e) => setEditingColumn({
                  ...editingColumn,
                  sortable: e.target.checked
                })}
                className="w-4 h-4 rounded border-pdm-border text-pdm-accent focus:ring-pdm-accent"
              />
              <span className="text-base text-pdm-fg">Sortable</span>
            </label>
            
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editingColumn.required}
                onChange={(e) => setEditingColumn({
                  ...editingColumn,
                  required: e.target.checked
                })}
                className="w-4 h-4 rounded border-pdm-border text-pdm-accent focus:ring-pdm-accent"
              />
              <span className="text-base text-pdm-fg">Required</span>
            </label>
          </div>
          
          {/* Actions */}
          <div className="flex gap-2 justify-end pt-2 border-t border-pdm-border">
            <button
              onClick={() => {
                setEditingColumn(null)
                setIsCreating(false)
              }}
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveColumn}
              disabled={isSaving || !editingColumn.name.trim() || !editingColumn.label.trim()}
              className="btn btn-primary btn-sm"
            >
              {isSaving ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Saving...
                </>
              ) : isCreating ? (
                'Create Column'
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Columns List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="animate-spin text-pdm-fg-muted" size={24} />
        </div>
      ) : columns.length === 0 && !isCreating ? (
        <div className="text-center py-8 text-pdm-fg-muted text-base border border-dashed border-pdm-border rounded-lg">
          <Columns3 size={32} className="mx-auto mb-2 opacity-50" />
          <p>No custom metadata columns defined</p>
          <p className="text-sm mt-1">Add columns to track custom properties like Material, Weight, Supplier, etc.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {columns.map((column, index) => {
            const TypeIcon = TYPE_ICONS[column.data_type]
            
            return (
              <div 
                key={column.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-pdm-bg border border-pdm-border hover:border-pdm-border-light transition-colors group"
              >
                {/* Drag handle */}
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => handleMoveColumn(column, 'up')}
                    disabled={index === 0}
                    className="p-0.5 text-pdm-fg-muted hover:text-pdm-fg disabled:opacity-30"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    onClick={() => handleMoveColumn(column, 'down')}
                    disabled={index === columns.length - 1}
                    className="p-0.5 text-pdm-fg-muted hover:text-pdm-fg disabled:opacity-30"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
                
                <GripVertical size={16} className="text-pdm-fg-dim flex-shrink-0" />
                
                {/* Type icon */}
                <div className={`p-1.5 rounded ${column.visible ? 'bg-pdm-accent/20 text-pdm-accent' : 'bg-pdm-fg-muted/20 text-pdm-fg-muted'}`}>
                  <TypeIcon size={16} />
                </div>
                
                {/* Column info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-base text-pdm-fg font-medium">{column.label}</span>
                    {!column.visible && (
                      <span className="text-xs px-1.5 py-0.5 bg-pdm-fg-muted/20 text-pdm-fg-muted rounded">
                        Hidden
                      </span>
                    )}
                    {column.required && (
                      <span className="text-xs px-1.5 py-0.5 bg-pdm-warning/20 text-pdm-warning rounded">
                        Required
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-pdm-fg-muted flex items-center gap-2">
                    <code className="font-mono text-xs bg-pdm-bg-light px-1 rounded">
                      {column.name}
                    </code>
                    <span>•</span>
                    <span>{TYPE_LABELS[column.data_type]}</span>
                    <span>•</span>
                    <span>{column.width}px</span>
                    {column.data_type === 'select' && column.select_options.length > 0 && (
                      <>
                        <span>•</span>
                        <span>{column.select_options.length} options</span>
                      </>
                    )}
                  </div>
                </div>
                
                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleToggleVisibility(column)}
                    className="p-1.5 hover:bg-pdm-highlight rounded transition-colors"
                    title={column.visible ? 'Hide column' : 'Show column'}
                  >
                    {column.visible ? (
                      <Eye size={14} className="text-pdm-fg-muted" />
                    ) : (
                      <EyeOff size={14} className="text-pdm-fg-muted" />
                    )}
                  </button>
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
                        default_value: column.default_value || ''
                      })
                      setIsCreating(false)
                    }}
                    className="p-1.5 hover:bg-pdm-highlight rounded transition-colors"
                    title="Edit column"
                  >
                    <Pencil size={14} className="text-pdm-fg-muted" />
                  </button>
                  <button
                    onClick={() => setDeletingColumn(column)}
                    className="p-1.5 hover:bg-pdm-error/20 rounded transition-colors"
                    title="Delete column"
                  >
                    <Trash2 size={14} className="text-pdm-error" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Info box */}
      <div className="p-3 bg-pdm-bg rounded-lg border border-pdm-border">
        <p className="text-sm text-pdm-fg-muted">
          <strong>How it works:</strong> Custom metadata columns appear in the file browser alongside 
          standard columns like Name, Version, and State. Values are stored in each file's custom properties 
          and can be edited in the Properties panel.
        </p>
      </div>

      {/* Delete Confirmation Dialog */}
      {deletingColumn && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={() => setDeletingColumn(null)}>
          <div className="bg-pdm-bg-light border border-pdm-border rounded-xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-pdm-error/20 rounded-full">
                <AlertTriangle size={20} className="text-pdm-error" />
              </div>
              <h3 className="text-lg font-medium text-pdm-fg">Delete Column</h3>
            </div>
            <p className="text-base text-pdm-fg-muted mb-4">
              Are you sure you want to delete the column <strong>"{deletingColumn.label}"</strong>?
            </p>
            <p className="text-sm text-pdm-fg-dim mb-4">
              This will remove the column from the file browser. Existing file metadata using this column 
              will remain in storage but won't be displayed.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeletingColumn(null)} className="btn btn-ghost">
                Cancel
              </button>
              <button
                onClick={handleDeleteColumn}
                disabled={isDeleting}
                className="btn bg-pdm-error text-white hover:bg-pdm-error/90 disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete Column'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

