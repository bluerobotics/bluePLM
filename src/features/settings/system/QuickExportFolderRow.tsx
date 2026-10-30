import { FolderOpen, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { Button } from '@/components/core/ui'
import { useTranslation } from '@/lib/i18n'
import { usePDMStore } from '@/stores/pdmStore'

import { SettingRow } from '../components/ui'

/**
 * Where the PDF and STEP export shortcuts write on this computer. Stored per machine with the
 * other local preferences; empty exports next to each source file.
 */
export function QuickExportFolderRow() {
  const { t } = useTranslation()
  const { quickExportFolder, setQuickExportFolder } = usePDMStore(
    useShallow((s) => ({
      quickExportFolder: s.quickExportFolder,
      setQuickExportFolder: s.setQuickExportFolder,
    })),
  )

  const handleChoose = async () => {
    const result = await window.electronAPI?.selectFolder()
    if (result?.success && result.folderPath) setQuickExportFolder(result.folderPath)
  }

  return (
    <SettingRow
      label={t('contextMenu.quickExport.folderLabel')}
      description={
        <>
          <span className="block">{t('contextMenu.quickExport.folderDescription')}</span>
          <span
            className="block truncate font-mono text-ui-fg-secondary"
            title={quickExportFolder ?? ''}
          >
            {quickExportFolder ?? t('contextMenu.quickExport.nextToFiles')}
          </span>
        </>
      }
    >
      {quickExportFolder && (
        <Button
          variant="ghost"
          size="sm"
          icon={<X size={14} />}
          onClick={() => setQuickExportFolder(null)}
          title={t('contextMenu.quickExport.folderClear')}
          aria-label={t('contextMenu.quickExport.folderClear')}
        />
      )}
      <Button size="sm" icon={<FolderOpen size={14} />} onClick={handleChoose}>
        {t('contextMenu.quickExport.folderChoose')}
      </Button>
    </SettingRow>
  )
}
