import { useCallback, useEffect, useState } from 'react'
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'

import { Button, TextInput } from '@/components/core/ui'
import { t } from '@/lib/i18n'
import { log } from '@/lib/logger'
import { deleteItemDesignation, getItemDesignations, upsertItemDesignation } from '@/lib/supabase'
import { usePDMStore } from '@/stores/pdmStore'
import type { ItemDesignation } from '@/types/item'

import { SettingsGroup, SettingsPage, SettingsSection } from '../components/ui'

export function ItemDesignationsSettings() {
  const organization = usePDMStore((s) => s.organization)
  const getEffectiveRole = usePDMStore((s) => s.getEffectiveRole)
  const hasPermission = usePDMStore((s) => s.hasPermission)
  const addToast = usePDMStore((s) => s.addToast)

  const canManage =
    getEffectiveRole() === 'admin' || hasPermission('system:item-designations', 'edit')

  const [designations, setDesignations] = useState<ItemDesignation[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [nameInput, setNameInput] = useState('')

  const load = useCallback(async () => {
    if (!organization?.id) return
    setLoading(true)
    try {
      setDesignations(await getItemDesignations(organization.id))
    } finally {
      setLoading(false)
    }
  }, [organization?.id])

  useEffect(() => {
    load()
  }, [load])

  const resetForm = () => {
    setEditingId(null)
    setNameInput('')
  }

  const handleSave = async () => {
    if (!organization?.id) return
    const name = nameInput.trim()
    if (!name) return
    setSaving(true)
    try {
      await upsertItemDesignation(organization.id, name, editingId)
      await load()
      resetForm()
    } catch (error) {
      log.error('[ItemDesignationsSettings]', 'Failed to save designation', { error })
      addToast('error', error instanceof Error ? error.message : 'Failed to save designation')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!organization?.id) return
    if (!window.confirm(t('itemBrowser.deleteDesignationConfirm'))) return
    try {
      await deleteItemDesignation(organization.id, id)
      await load()
      if (editingId === id) resetForm()
    } catch (error) {
      log.error('[ItemDesignationsSettings]', 'Failed to delete designation', { error })
      addToast('error', error instanceof Error ? error.message : 'Failed to delete designation')
    }
  }

  return (
    <SettingsPage>
      <SettingsSection
        title="Designations"
        description={
          canManage ? (
            t('itemBrowser.designationsDescription')
          ) : (
            <>
              {t('itemBrowser.designationsDescription')} {t('itemBrowser.noPermission')}
            </>
          )
        }
      >
        <SettingsGroup>
          {loading ? (
            <div className="flex h-24 items-center text-ui-fg-secondary">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : designations.length === 0 ? (
            <p className="py-3.5 text-[14px] text-ui-fg-secondary">
              {t('itemBrowser.noDesignations')}
            </p>
          ) : (
            designations.map((designation) => (
              <div
                key={designation.id}
                className={`flex items-center justify-between gap-2 py-2.5 ${
                  editingId === designation.id ? 'bg-ui-hover' : ''
                }`}
              >
                <span className="truncate text-[14px] text-ui-fg">{designation.name}</span>
                {canManage && (
                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Pencil size={14} />}
                      onClick={() => {
                        setEditingId(designation.id)
                        setNameInput(designation.name)
                      }}
                      title={t('common.edit')}
                      aria-label={t('common.edit')}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 size={14} />}
                      onClick={() => handleDelete(designation.id)}
                      className="hover:!text-ui-danger"
                      title={t('common.delete')}
                      aria-label={t('common.delete')}
                    />
                  </div>
                )}
              </div>
            ))
          )}
          {canManage && (
            <div className="flex items-center gap-2 py-3.5">
              <TextInput
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave()
                }}
                placeholder={t('itemBrowser.designationName')}
                className="max-w-xs flex-1"
                aria-label={t('itemBrowser.designationName')}
              />
              <Button
                variant="primary"
                icon={<Plus size={14} />}
                loading={saving}
                onClick={handleSave}
                disabled={!nameInput.trim()}
              >
                {editingId ? t('common.save') : t('itemBrowser.addDesignation')}
              </Button>
              {editingId && (
                <Button variant="ghost" icon={<X size={14} />} onClick={resetForm}>
                  {t('common.cancel')}
                </Button>
              )}
            </div>
          )}
        </SettingsGroup>
      </SettingsSection>
    </SettingsPage>
  )
}
