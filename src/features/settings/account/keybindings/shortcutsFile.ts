import { saveBlobAs } from '@/lib/browserDownload'
import {
  exportShortcuts,
  parseShortcutsImport,
  type ShortcutOverrides,
} from '@/lib/keybindings'
import type { ToastType } from '@/stores/types'

type Translate = (key: string, params?: Record<string, string | number>) => string
type Toast = (type: ToastType, message: string) => void

const FILE_NAME = 'blueplm-shortcuts.json'

/** Saves the user's changed shortcuts as JSON: a save dialog on desktop, a download on the web. */
export async function exportShortcutsFile(
  overrides: ShortcutOverrides,
  t: Translate,
  toast: Toast,
): Promise<void> {
  const json = exportShortcuts(overrides)
  const api = window.electronAPI
  if (!api) {
    saveBlobAs(FILE_NAME, new Blob([json], { type: 'application/json' }))
    toast('success', t('shortcuts.exportedWeb'))
    return
  }
  try {
    const result = await api.saveTextFileWithDialog(FILE_NAME, json, [
      { name: 'JSON', extensions: ['json'] },
    ])
    if (result?.success && result.path) toast('success', t('shortcuts.exported', { path: result.path }))
    else if (!result?.canceled) {
      toast('error', t('shortcuts.exportFailed', { error: result?.error ?? '' }))
    }
  } catch (error) {
    toast('error', t('shortcuts.exportFailed', { error: String(error) }))
  }
}

/** Reads a shortcuts file; returns the overrides to apply, or null after telling the user why not. */
export async function importShortcutsFile(
  file: File,
  t: Translate,
  toast: Toast,
): Promise<ShortcutOverrides | null> {
  const parsed = parseShortcutsImport(await file.text())
  if (!parsed.ok) {
    toast(
      'error',
      t(parsed.error === 'invalidJson' ? 'shortcuts.importInvalidJson' : 'shortcuts.importNotShortcuts'),
    )
    return null
  }
  toast(
    'success',
    parsed.skipped > 0 ? t('shortcuts.importedSkipped', { count: parsed.skipped }) : t('shortcuts.imported'),
  )
  return parsed.overrides
}
