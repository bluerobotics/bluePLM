import { useMemo, useRef, useState } from 'react'
import { Download, Keyboard, Search, Upload, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { Button, FIELD_CLASS, Switch } from '@/components/core/ui'
import { SettingsGroup, SettingsPage, SettingsSection } from '@/features/settings/components/ui'
import { QuickExportFolderRow } from '@/features/settings/system'
import { useTranslation } from '@/lib/i18n'
import {
  SHORTCUT_CATEGORIES,
  actionsBoundTo,
  allConflicts,
  availableShortcutActions,
  canonicalCombo,
  findConflicts,
  formatCombo,
  getShortcutPlatform,
  isModified,
  useResolvedBindings,
  withBindings,
  type ShortcutAction,
} from '@/lib/keybindings'
import { hasDesktop } from '@/lib/platform'
import { usePDMStore } from '@/stores/pdmStore'

import { HeldModifiers, Keycaps } from './keybindings/Keycaps'
import { ShortcutRow, type CaptureSlot, type PendingConflict } from './keybindings/ShortcutRow'
import { exportShortcutsFile, importShortcutsFile } from './keybindings/shortcutsFile'
import { useKeyCapture } from './keybindings/useKeyCapture'

interface Editing {
  actionId: string
  slot: CaptureSlot
}

/**
 * Settings > Keyboard shortcuts: every action of the shortcut registry (`src/lib/keybindings`),
 * grouped by category. Search by name or by pressing keys, rebind with a capture field, add
 * alternates, reset one or all, see and resolve conflicts, filter to modified ones, and move the
 * set between machines as JSON. Only the user's changes are stored (`shortcutOverrides`).
 */
export function KeybindingsSettings() {
  const { t } = useTranslation()
  const { overrides, setShortcutBindings, resetShortcut, resetAllShortcuts, replaceShortcutOverrides, addToast } =
    usePDMStore(
      useShallow((s) => ({
        overrides: s.shortcutOverrides,
        setShortcutBindings: s.setShortcutBindings,
        resetShortcut: s.resetShortcut,
        resetAllShortcuts: s.resetAllShortcuts,
        replaceShortcutOverrides: s.replaceShortcutOverrides,
        addToast: s.addToast,
      })),
    )
  const bindings = useResolvedBindings()
  const platform = getShortcutPlatform()
  const available = useMemo(() => availableShortcutActions(hasDesktop()), [])

  const [query, setQuery] = useState('')
  const [recording, setRecording] = useState(false)
  const [recordedCombo, setRecordedCombo] = useState<string | null>(null)
  const [modifiedOnly, setModifiedOnly] = useState(false)
  const [confirmResetAll, setConfirmResetAll] = useState(false)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [pending, setPending] = useState<(PendingConflict & { actionId: string }) | null>(null)
  const [notice, setNotice] = useState<{ actionId: string; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Search by keys: the search field records presses instead of text.
  const recordHeld = useKeyCapture(
    recording,
    (combo) => setRecordedCombo(combo),
    () => setRecording(false),
  )

  const conflicts = useMemo(() => allConflicts(bindings, available), [bindings, available])

  const visible = useMemo(() => {
    let list: readonly ShortcutAction[] = available
    if (modifiedOnly) list = list.filter((action) => isModified(action.id, overrides))
    if (recording || recordedCombo) {
      return recordedCombo ? actionsBoundTo(recordedCombo, bindings, list) : list
    }
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 0) return list
    const typedCombo = canonicalCombo(query.trim())
    return list.filter((action) => {
      const combos = bindings.get(action.id) ?? []
      if (typedCombo && actionsBoundTo(typedCombo, bindings, [action]).length > 0) return true
      const haystack = [
        t(`shortcuts.action.${action.id}`),
        t(`shortcuts.help.${action.id}`),
        t(`shortcuts.category.${action.category}`),
        ...combos.flatMap((combo) => [
          formatCombo(combo, 'other'),
          formatCombo(combo, 'mac'),
          combo.replace('Mod', 'Cmd'),
        ]),
      ]
        .join(' ')
        .toLowerCase()
      return words.every((word) => haystack.includes(word))
    })
  }, [available, modifiedOnly, overrides, recording, recordedCombo, query, bindings, t])

  const sections = SHORTCUT_CATEGORIES.map((category) => ({
    category,
    actions: visible.filter((action) => action.category === category),
  })).filter(
    // The quick export folder lives with the Export actions, so that section stays while unfiltered.
    (section) =>
      section.actions.length > 0 ||
      (section.category === 'export' && hasDesktop() && !modifiedOnly && !query && !recordedCombo && !recording),
  )

  // ── Editing ───────────────────────────────────────────────────────────
  const combosOf = (actionId: string) => [...(bindings.get(actionId) ?? [])]

  const save = (actionId: string, slot: CaptureSlot, combo: string) => {
    const next = combosOf(actionId)
    if (slot === 'new') next.push(combo)
    else next[slot] = combo
    setShortcutBindings(actionId, next)
  }

  const handleCaptured = (actionId: string, slot: CaptureSlot, combo: string) => {
    setEditing(null)
    setNotice(null)
    const current = combosOf(actionId)
    const existingIndex = current.indexOf(combo)
    if (existingIndex >= 0 && existingIndex !== slot) {
      setNotice({ actionId, text: t('shortcuts.keysAlreadyHere', { keys: formatCombo(combo, platform) }) })
      return
    }
    const found = findConflicts(actionId, combo, bindings, available)
    if (found.length > 0) {
      setPending({ actionId, slot, combo, conflicts: found })
      return
    }
    save(actionId, slot, combo)
  }

  const resolvePending = (choice: 'reassign' | 'keepBoth' | 'cancel') => {
    if (!pending) return
    if (choice === 'reassign') {
      // Take the keys away from every other action in one store write.
      let next = overrides
      for (const conflict of pending.conflicts) {
        const theirs = (bindings.get(conflict.actionId) ?? []).filter((c) => c !== conflict.combo)
        next = withBindings(next, conflict.actionId, theirs)
      }
      const mine = combosOf(pending.actionId)
      if (pending.slot === 'new') mine.push(pending.combo)
      else mine[pending.slot] = pending.combo
      replaceShortcutOverrides(withBindings(next, pending.actionId, mine))
    } else if (choice === 'keepBoth') {
      save(pending.actionId, pending.slot, pending.combo)
    }
    setPending(null)
  }

  const startCapture = (actionId: string, slot: CaptureSlot) => {
    setRecording(false)
    setPending(null)
    setNotice(null)
    setEditing({ actionId, slot })
  }

  const removeKey = (actionId: string, index: number) => {
    const next = combosOf(actionId)
    next.splice(index, 1)
    setShortcutBindings(actionId, next)
  }

  const handleResetAll = () => {
    resetAllShortcuts()
    setConfirmResetAll(false)
    setPending(null)
    addToast('info', t('shortcuts.resetAllDone'))
  }

  const toggleRecording = () => {
    setEditing(null)
    setRecordedCombo(null)
    setRecording((on) => !on)
  }

  // ── Render ────────────────────────────────────────────────────────────
  const searchField = recording || recordedCombo ? (
    <div
      className={`${FIELD_CLASS} flex h-7 items-center gap-2 px-2.5 ${recording ? 'border-ui-accent/70 ring-2 ring-ui-accent/25' : ''}`}
      aria-live="polite"
    >
      <Keyboard size={14} className="flex-shrink-0 text-ui-fg-secondary" aria-hidden />
      {recordedCombo ? (
        <Keycaps combo={recordedCombo} platform={platform} />
      ) : recordHeld.length > 0 ? (
        <HeldModifiers held={recordHeld} platform={platform} />
      ) : (
        <span className="truncate text-ui-fg-secondary">{t('shortcuts.searchByKeysHint')}</span>
      )}
      <button
        type="button"
        onClick={() => {
          setRecording(false)
          setRecordedCombo(null)
        }}
        aria-label={t('shortcuts.stopRecording')}
        title={t('shortcuts.stopRecording')}
        className="ml-auto rounded p-0.5 text-ui-fg-secondary hover:text-ui-fg"
      >
        <X size={14} />
      </button>
    </div>
  ) : (
    <div className="relative">
      <Search
        size={14}
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ui-fg-secondary"
        aria-hidden
      />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('shortcuts.searchPlaceholder')}
        aria-label={t('shortcuts.searchPlaceholder')}
        className={`${FIELD_CLASS} h-7 pl-8 pr-2.5`}
      />
    </div>
  )

  const emptyText = recordedCombo
    ? t('shortcuts.noMatchesKeys', { keys: formatCombo(recordedCombo, platform) })
    : modifiedOnly && !query
      ? t('shortcuts.noModified')
      : t('shortcuts.noMatches', { query })

  return (
    <SettingsPage>
      <SettingsSection
        title={t('shortcuts.title')}
        description={t('shortcuts.description')}
        actions={
          confirmResetAll ? (
            <>
              <span className="text-[13px] text-ui-fg-secondary">{t('shortcuts.resetAllConfirm')}</span>
              <Button size="sm" variant="danger-subtle" onClick={handleResetAll}>
                {t('shortcuts.resetAllYes')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmResetAll(false)}>
                {t('shortcuts.cancel')}
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" icon={<Upload size={14} />} onClick={() => fileInputRef.current?.click()}>
                {t('shortcuts.import')}
              </Button>
              <Button
                size="sm"
                icon={<Download size={14} />}
                onClick={() => exportShortcutsFile(overrides, t, addToast)}
              >
                {t('shortcuts.export')}
              </Button>
              <Button
                size="sm"
                onClick={() => setConfirmResetAll(true)}
                disabled={Object.keys(overrides).length === 0}
              >
                {t('shortcuts.resetAll')}
              </Button>
            </>
          )
        }
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            const imported = await importShortcutsFile(file, t, addToast)
            if (imported) {
              setPending(null)
              replaceShortcutOverrides(imported)
            }
          }}
        />
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-[220px] flex-1">{searchField}</div>
          <Button
            size="sm"
            variant={recording ? 'primary' : 'secondary'}
            icon={<Keyboard size={14} />}
            onClick={toggleRecording}
            aria-pressed={recording}
          >
            {t('shortcuts.searchByKeys')}
          </Button>
          <label className="flex items-center gap-2 text-[14px] text-ui-fg">
            <Switch checked={modifiedOnly} onChange={setModifiedOnly} size="sm" aria-label={t('shortcuts.modifiedOnly')} />
            <span>{t('shortcuts.modifiedOnly')}</span>
          </label>
        </div>
      </SettingsSection>

      {sections.length === 0 && (
        <p className="text-[14px] text-ui-fg-secondary">{emptyText}</p>
      )}

      {sections.map(({ category, actions }) => (
        <SettingsSection key={category} title={t(`shortcuts.category.${category}`)}>
          <SettingsGroup>
            {actions.map((action) => {
              const isEditing = editing?.actionId === action.id
              const isPending = pending?.actionId === action.id
              return (
                <ShortcutRow
                  key={action.id}
                  action={action}
                  combos={bindings.get(action.id) ?? []}
                  modified={isModified(action.id, overrides)}
                  existingConflicts={conflicts.get(action.id) ?? []}
                  platform={platform}
                  capturing={isEditing ? editing.slot : null}
                  pending={isPending ? pending : null}
                  notice={notice?.actionId === action.id ? notice.text : null}
                  onStartCapture={(slot) => startCapture(action.id, slot)}
                  onCaptured={(slot, combo) => handleCaptured(action.id, slot, combo)}
                  onCancelCapture={() => setEditing(null)}
                  onRemove={(index) => removeKey(action.id, index)}
                  onReset={() => resetShortcut(action.id)}
                  onResolvePending={resolvePending}
                />
              )
            })}
            {category === 'export' && <QuickExportFolderRow />}
          </SettingsGroup>
        </SettingsSection>
      ))}
    </SettingsPage>
  )
}
