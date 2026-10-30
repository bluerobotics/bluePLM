import { Plus, X } from 'lucide-react'

import { Button, Select, Switch, TextInput } from '@/components/core/ui'
import type { MetadataColumnType } from '@/types/database'

import { SettingRow, SettingsGroup } from '../components/ui'

export const TYPE_LABELS: Record<MetadataColumnType, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  boolean: 'Yes/No',
  select: 'Dropdown',
}

export interface EditingColumn {
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

export const DEFAULT_COLUMN: EditingColumn = {
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

interface MetadataColumnEditorProps {
  column: EditingColumn
  onChange: (column: EditingColumn) => void
  isCreating: boolean
  isSaving: boolean
  newOption: string
  onNewOptionChange: (value: string) => void
  onAddOption: () => void
  onRemoveOption: (option: string) => void
  onCancel: () => void
  onSave: () => void
}

/** The create / edit form of one custom metadata column (admins only). */
export function MetadataColumnEditor({
  column,
  onChange,
  isCreating,
  isSaving,
  newOption,
  onNewOptionChange,
  onAddOption,
  onRemoveOption,
  onCancel,
  onSave,
}: MetadataColumnEditorProps) {
  return (
    <SettingsGroup className="!border-ui-accent/60">
      <div className="px-4 py-3 text-[14px] font-semibold text-ui-fg">
        {isCreating ? 'New Column' : 'Edit Column'}
      </div>

      <SettingRow
        label="Internal Name"
        htmlFor="metadata-column-name"
        description="Used in data storage. Lowercase letters, numbers, underscores only."
      >
        <TextInput
          id="metadata-column-name"
          value={column.name}
          onChange={(e) =>
            onChange({
              ...column,
              name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
            })
          }
          placeholder="e.g., material, weight"
          className="!w-64 font-mono"
          disabled={!isCreating}
        />
      </SettingRow>

      <SettingRow label="Display Label" htmlFor="metadata-column-label">
        <TextInput
          id="metadata-column-label"
          value={column.label}
          onChange={(e) => onChange({ ...column, label: e.target.value })}
          placeholder="e.g., Material, Weight (kg)"
          className="!w-64"
        />
      </SettingRow>

      <SettingRow label="Data Type" htmlFor="metadata-column-type">
        <Select
          id="metadata-column-type"
          value={column.data_type}
          onChange={(e) =>
            onChange({
              ...column,
              data_type: e.target.value as MetadataColumnType,
              select_options: e.target.value === 'select' ? column.select_options : [],
            })
          }
          className="w-64"
        >
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </SettingRow>

      <SettingRow label="Column Width (px)" htmlFor="metadata-column-width">
        <TextInput
          id="metadata-column-width"
          type="number"
          value={column.width}
          onChange={(e) =>
            onChange({ ...column, width: Math.max(50, parseInt(e.target.value) || 120) })
          }
          min={50}
          max={500}
          className="!w-24"
        />
      </SettingRow>

      <SettingRow label="Default Value" htmlFor="metadata-column-default">
        <TextInput
          id="metadata-column-default"
          value={column.default_value}
          onChange={(e) => onChange({ ...column, default_value: e.target.value })}
          placeholder="Optional"
          className="!w-64"
        />
      </SettingRow>

      {column.data_type === 'select' && (
        <SettingRow label="Dropdown Options" stacked>
          <div className="space-y-2">
            <div className="flex gap-2">
              <TextInput
                value={newOption}
                onChange={(e) => onNewOptionChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    onAddOption()
                  }
                }}
                placeholder="Add an option..."
                className="flex-1"
              />
              <Button
                variant="primary"
                icon={<Plus size={14} />}
                onClick={onAddOption}
                disabled={!newOption.trim()}
                aria-label="Add option"
              />
            </div>
            {column.select_options.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {column.select_options.map((option) => (
                  <span
                    key={option}
                    className="inline-flex items-center gap-1 rounded-md border border-ui-divider bg-ui-bg px-2 py-1 text-[13px] text-ui-fg"
                  >
                    {option}
                    <button
                      type="button"
                      onClick={() => onRemoveOption(option)}
                      className="rounded p-0.5 text-ui-fg-secondary hover:text-ui-danger"
                      aria-label={`Remove ${option}`}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </SettingRow>
      )}

      <SettingRow label="Visible by default">
        <Switch
          checked={column.visible}
          onChange={(visible) => onChange({ ...column, visible })}
          aria-label="Visible by default"
        />
      </SettingRow>
      <SettingRow label="Sortable">
        <Switch
          checked={column.sortable}
          onChange={(sortable) => onChange({ ...column, sortable })}
          aria-label="Sortable"
        />
      </SettingRow>
      <SettingRow label="Required">
        <Switch
          checked={column.required}
          onChange={(required) => onChange({ ...column, required })}
          aria-label="Required"
        />
      </SettingRow>

      <div className="flex justify-end gap-2 px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onSave}
          loading={isSaving}
          disabled={!column.name.trim() || !column.label.trim()}
        >
          {isSaving ? 'Saving...' : isCreating ? 'Create Column' : 'Save Changes'}
        </Button>
      </div>
    </SettingsGroup>
  )
}
