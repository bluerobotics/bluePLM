import { useState } from 'react'
import * as LucideIcons from 'lucide-react'
import { Package } from 'lucide-react'

import { Button, TextInput } from '@/components/core/ui'
import { ColorSwatchRow } from '@/components/shared/ColorPicker'
import { IconGridPicker } from '@/components/shared/IconPicker'

/** Create or edit a custom sidebar group: its name, icon and colour. */
export function GroupEditorModal({
  group,
  onSave,
  onCancel,
}: {
  group: { id: string; name: string; icon: string; iconColor: string | null } | null
  onSave: (name: string, icon: string, iconColor: string | null) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(group?.name || '')
  const [icon, setIcon] = useState(group?.icon || 'Folder')
  const [iconColor, setIconColor] = useState<string | null>(group?.iconColor || null)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <div className="bg-plm-bg border border-plm-border rounded-lg shadow-xl w-[400px] max-h-[80vh] overflow-hidden">
        <div className="p-4 border-b border-plm-border">
          <h3 className="text-lg font-semibold text-plm-fg">
            {group ? 'Edit Group' : 'Add Group'}
          </h3>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
          {/* Name input */}
          <div>
            <label className="mb-1 block text-[12px] font-medium text-plm-fg-muted">Name</label>
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Group name"
              autoFocus
            />
          </div>

          {/* Icon picker */}
          <div>
            <label className="mb-1 block text-[12px] font-medium text-plm-fg-muted">Icon</label>
            <IconGridPicker value={icon} onChange={setIcon} maxHeight="160px" columns={8} />
          </div>

          {/* Color picker */}
          <div>
            <label className="mb-1 block text-[12px] font-medium text-plm-fg-muted">Color (optional)</label>
            <ColorSwatchRow color={iconColor} onChange={setIconColor} showReset size="lg" />
          </div>

          {/* Preview */}
          <div>
            <label className="mb-1 block text-[12px] font-medium text-plm-fg-muted">Preview</label>
            <div className="flex items-center gap-3 p-3 bg-plm-bg-secondary rounded border border-plm-border">
              <div style={{ color: iconColor || 'var(--plm-accent)' }}>
                {(() => {
                  // Dynamic Lucide icon lookup requires any cast
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const IconComponent = (LucideIcons as any)[icon] // TODO: type this
                  return IconComponent ? <IconComponent size={22} /> : <Package size={22} />
                })()}
              </div>
              <span className="text-plm-fg">{name || 'Group Name'}</span>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-plm-border flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => onSave(name, icon, iconColor)}
            disabled={!name.trim()}
          >
            {group ? 'Save' : 'Create'}
          </Button>
        </div>
      </div>
    </div>
  )
}
