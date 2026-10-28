import { useState, useEffect, useCallback, useRef, useMemo } from 'react'

import { t } from '@/lib/i18n'
import { usePDMStore, LocalFile } from '@/stores/pdmStore'
import {
  getInspectionRows,
  getInspectionRowsForVersion,
  saveInspectionRows,
  getInspectionMethods,
  addInspectionMethod,
  updateInspectionMethod,
  deleteInspectionMethod,
  emptyRowValues,
  toRowInput,
  getFileVersions,
  type InspectionRowInput,
  type InspectionRowValues,
  type InspectionMethodOption,
} from '@/lib/supabase'
import { log } from '@/lib/logger'
import { resolveFileMetadata, resolvedText } from '@/lib/metadata/overlay'
import {
  getInspectionTemplates,
  generateInspectionSheet,
  isGoogleDriveConnected,
  type InspectionTemplateFile,
} from '@/features/integrations/google-drive/lib/sheetTemplates'
import {
  Plus,
  Trash2,
  Loader2,
  ClipboardList,
  Lock,
  Database,
  FileSpreadsheet,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  Settings2,
  ScanSearch,
  CircleDot,
} from 'lucide-react'

import { useSolidWorksService } from '../SolidWorksPanel'
import { uploadInspectionPreview } from './uploadPreview'
import { COLUMNS, DEFAULT_INSPECTION_METHODS } from './inspectionColumns'
import { compareRows, matchesFilter, sortByBalloonAsc, type SortDir } from './inspectionTableUtils'
import { InspectionCell } from './InspectionCell'
import { ColumnFilter } from './ColumnFilter'
import { MethodManagerModal } from './MethodManagerModal'
import { useDrawingCharacteristics } from './useDrawingCharacteristics'
import { ExtractPreviewDialog } from './ExtractPreviewDialog'
import { BalloonConfirmDialog } from './BalloonConfirmDialog'

interface InspectionTabProps {
  file: LocalFile
}

const AUTOSAVE_DELAY_MS = 1000

const CURRENT_VERSION = 'current'

interface VersionOption {
  id: string
  version: number
}

export function InspectionTab({ file }: InspectionTabProps) {
  const user = usePDMStore((s) => s.user)
  const organization = usePDMStore((s) => s.organization)
  const addToast = usePDMStore((s) => s.addToast)

  const fileId = file.pdmData?.id
  const orgId = file.pdmData?.org_id ?? organization?.id
  const isCheckedOutByMe = !!user?.id && file.pdmData?.checked_out_by === user.id

  const [rows, setRows] = useState<InspectionRowInput[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [notInstalled, setNotInstalled] = useState(false)
  const [versions, setVersions] = useState<VersionOption[]>([])
  const [selectedVersion, setSelectedVersion] = useState<string>(CURRENT_VERSION)
  const [sortKey, setSortKey] = useState<keyof InspectionRowValues>('balloon_number')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [filters, setFilters] = useState<Partial<Record<keyof InspectionRowValues, string>>>({})
  const [orgMethods, setOrgMethods] = useState<InspectionMethodOption[]>([])
  const [methodModalOpen, setMethodModalOpen] = useState(false)
  // Google Sheet template generation (FAIR / incoming material review)
  const [templates, setTemplates] = useState<InspectionTemplateFile[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const templateMenuRef = useRef<HTMLDivElement | null>(null)
  const { status: swStatus } = useSolidWorksService()

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirtyRef = useRef(false)
  // The file whose live rows are on screen; null while loading or when a version snapshot is
  // shown. `persist` writes only to this file, so rows never land on another file or version.
  const loadedForRef = useRef<string | null>(null)
  // Saves run one at a time: `saveInspectionRows` deletes then upserts, so an autosave of older
  // rows still in flight could otherwise delete rows a later save just added.
  const saveChainRef = useRef<Promise<unknown>>(Promise.resolve())

  const viewingCurrent = selectedVersion === CURRENT_VERSION
  const editable = viewingCurrent && isCheckedOutByMe
  const isDrawing = (file.extension?.toLowerCase() ?? '') === '.slddrw'

  // Org-configured Drive folder holding inspection sheet templates. When set, the
  // "Generate template" dropdown is available on drawings.
  const templateFolderId =
    (organization as { google_drive_inspection_template_folder_id?: string } | null)
      ?.google_drive_inspection_template_folder_id ?? ''
  const canGenerateTemplate = isDrawing && !!templateFolderId

  // Load version list for the history selector
  useEffect(() => {
    if (!fileId) return
    let cancelled = false
    getFileVersions(fileId)
      .then(({ versions: data, error }) => {
        if (cancelled) return
        if (error) {
          log.warn('[InspectionTab]', 'Failed to load versions', { error: error.message })
          return
        }
        const opts = (data ?? []).map((v) => ({ id: v.id as string, version: v.version as number }))
        setVersions(opts)
      })
      .catch((error) =>
        log.warn('[InspectionTab]', 'Versions load exception', { error: String(error) }),
      )
    return () => {
      cancelled = true
    }
  }, [fileId])

  // Reset to current view whenever the selected file changes
  useEffect(() => {
    setSelectedVersion(CURRENT_VERSION)
  }, [fileId])

  // Load the org's custom inspection methods (merged with defaults in the Method dropdown)
  useEffect(() => {
    if (!orgId) return
    let cancelled = false
    getInspectionMethods(orgId)
      .then((result) => {
        if (cancelled) return
        if (result.success && result.methods) setOrgMethods(result.methods)
      })
      .catch((error) =>
        log.warn('[InspectionTab]', 'Methods load exception', { error: String(error) }),
      )
    return () => {
      cancelled = true
    }
  }, [orgId])

  // Load rows for the active view (current live rows, or a version snapshot)
  useEffect(() => {
    if (!fileId) return
    let cancelled = false
    setIsLoading(true)
    loadedForRef.current = null

    const loader = viewingCurrent
      ? getInspectionRows(fileId)
      : getInspectionRowsForVersion(selectedVersion)

    loader
      .then((result) => {
        if (cancelled) return
        if (!result.success) {
          if (result.notInstalled) {
            // Schema module not applied yet — surface a friendly state, not an error toast
            setNotInstalled(true)
            setRows([])
            return
          }
          addToast('error', result.error || t('common.error'))
          setRows([])
          return
        }
        setNotInstalled(false)
        const mapped = (result.rows ?? []).map((r) => toRowInput(r))
        const sorted = sortByBalloonAsc(mapped)
        setRows(sorted)
        dirtyRef.current = false
        loadedForRef.current = viewingCurrent ? fileId : null
      })
      .catch((error) => {
        if (cancelled) return
        log.error('[InspectionTab]', 'Load failed', { error: String(error) })
        setRows([])
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [fileId, selectedVersion, viewingCurrent, addToast])

  const persist = useCallback(
    (rowsToSave: InspectionRowInput[]): Promise<boolean> => {
      // Only the live rows of the file they were loaded for, while it is checked out by me.
      // Decided now, not when the queued save runs: a file switch's cleanup flushes through
      // here, and the next load resets `loadedForRef` before the chained save gets its turn.
      const allowed = viewingCurrent && isCheckedOutByMe && loadedForRef.current === fileId
      const loadedFor = loadedForRef.current
      const save = async (): Promise<boolean> => {
        if (!fileId || !orgId || !user?.id) return false
        if (!allowed) {
          log.warn('[InspectionTab]', 'Save refused: rows are not the editable live table', {
            fileId,
            loadedFor,
          })
          return false
        }
        setIsSaving(true)
        try {
          const ordered = rowsToSave.map((row, index) => ({ ...row, sort_order: index }))
          const result = await saveInspectionRows(fileId, orgId, user.id, ordered)
          if (!result.success) {
            addToast('error', result.error || t('common.error'))
            return false
          }
          dirtyRef.current = false
          return true
        } catch (error) {
          log.error('[InspectionTab]', 'Save failed', { error: String(error) })
          addToast('error', t('common.error'))
          return false
        } finally {
          setIsSaving(false)
        }
      }
      const run = saveChainRef.current.then(save)
      saveChainRef.current = run.catch(() => undefined)
      return run
    },
    [fileId, orgId, user?.id, viewingCurrent, isCheckedOutByMe, addToast],
  )

  // Debounced autosave when edits are pending
  const scheduleSave = useCallback(
    (nextRows: InspectionRowInput[]) => {
      dirtyRef.current = true
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        void persist(nextRows)
      }, AUTOSAVE_DELAY_MS)
    },
    [persist],
  )

  // Latest rows for the drawing flows, which read the table after awaiting the service.
  const rowsRef = useRef<InspectionRowInput[]>(rows)
  useEffect(() => {
    rowsRef.current = rows
  }, [rows])
  const getRows = useCallback(() => rowsRef.current, [])

  // Write a debounced edit now, so the drawing flows plan against what is saved.
  const flushPendingSave = useCallback(async (): Promise<boolean> => {
    if (!dirtyRef.current) return true
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = null
    return persist(rowsRef.current)
  }, [persist])

  // Extraction replaced the table: show the merged rows and save them.
  const commitMergedRows = useCallback(
    async (next: InspectionRowInput[]): Promise<boolean> => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = null
      rowsRef.current = next
      setRows(next)
      return persist(next)
    },
    [persist],
  )

  // Leaving a file or version writes its pending edit first, while `persist` still belongs to it.
  useEffect(() => {
    return () => {
      if (!dirtyRef.current) return
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = null
      void persist(rowsRef.current)
    }
  }, [fileId, selectedVersion, persist])

  const drawing = useDrawingCharacteristics({
    file,
    fileId,
    version: selectedVersion,
    enabled: editable && isDrawing,
    serviceRunning: swStatus.running,
    serviceVersion: swStatus.version,
    getRows,
    flushPendingSave,
    commitMergedRows,
  })

  // Flush pending save on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  const updateRows = useCallback(
    (updater: (prev: InspectionRowInput[]) => InspectionRowInput[]) => {
      setRows((prev) => {
        const next = updater(prev)
        scheduleSave(next)
        return next
      })
    },
    [scheduleSave],
  )

  const handleCellChange = useCallback(
    (rowId: string, key: keyof InspectionRowValues, value: string | number | boolean | null) => {
      updateRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, [key]: value } : r)))
    },
    [updateRows],
  )

  const handleAddRow = useCallback(() => {
    updateRows((prev) => [
      ...prev,
      { ...emptyRowValues(prev.length), id: crypto.randomUUID() },
    ])
  }, [updateRows])

  const handleDeleteRow = useCallback(
    (rowId: string) => {
      updateRows((prev) => prev.filter((r) => r.id !== rowId))
    },
    [updateRows],
  )

  // Clicking a header toggles direction on the active column, or sorts a new column ascending.
  const handleSort = useCallback((key: keyof InspectionRowValues) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        return prevKey
      }
      setSortDir('asc')
      return key
    })
  }, [])

  const handleFilterChange = useCallback((key: keyof InspectionRowValues, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }, [])

  // Built-in + org-defined methods, de-duplicated (case-insensitive) and sorted for the dropdown.
  const methodOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const name of [...DEFAULT_INSPECTION_METHODS, ...orgMethods.map((m) => m.name)]) {
      const key = name.trim().toLowerCase()
      if (key && !seen.has(key)) seen.set(key, name.trim())
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [orgMethods])

  // Save a new org-level method; returns whether it succeeded (used by the manager modal).
  const handleAddMethod = useCallback(
    async (name: string): Promise<boolean> => {
      const trimmed = name.trim()
      if (!trimmed || !orgId || !user?.id) return false
      const result = await addInspectionMethod(orgId, user.id, trimmed)
      if (!result.success || !result.method) {
        addToast('error', result.error || t('common.error'))
        return false
      }
      const added = result.method
      setOrgMethods((prev) =>
        prev.some((m) => m.id === added.id) ? prev : [...prev, added],
      )
      return true
    },
    [orgId, user?.id, addToast],
  )

  const handleRenameMethod = useCallback(
    async (id: string, name: string): Promise<boolean> => {
      const trimmed = name.trim()
      if (!trimmed || !orgId) return false
      const result = await updateInspectionMethod(orgId, id, trimmed)
      if (!result.success) {
        addToast('error', result.error || t('common.error'))
        return false
      }
      setOrgMethods((prev) => prev.map((m) => (m.id === id ? { ...m, name: trimmed } : m)))
      return true
    },
    [orgId, addToast],
  )

  const handleRemoveMethod = useCallback(
    async (id: string): Promise<boolean> => {
      if (!orgId) return false
      const result = await deleteInspectionMethod(orgId, id)
      if (!result.success) {
        addToast('error', result.error || t('common.error'))
        return false
      }
      setOrgMethods((prev) => prev.filter((m) => m.id !== id))
      return true
    },
    [orgId, addToast],
  )

  // Display view = base rows filtered per-column, then sorted by the active column.
  const displayRows = useMemo(() => {
    const sortCol = COLUMNS.find((c) => c.key === sortKey)
    const sortType = sortCol?.type ?? 'text'
    const filtered = rows.filter((row) =>
      COLUMNS.every((col) => matchesFilter(row, col.key, filters[col.key] ?? '', col.type)),
    )
    return [...filtered].sort((a, b) => compareRows(a, b, sortKey, sortDir, sortType))
  }, [rows, filters, sortKey, sortDir])

  // Close the template dropdown on outside click
  useEffect(() => {
    if (!templateMenuOpen) return
    const handleClick = (event: MouseEvent) => {
      if (templateMenuRef.current && !templateMenuRef.current.contains(event.target as Node)) {
        setTemplateMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [templateMenuOpen])

  // Load the template list from the org's Drive folder when the dropdown opens
  const loadTemplates = useCallback(async () => {
    if (!templateFolderId) return
    if (!isGoogleDriveConnected()) {
      addToast('info', t('source.inspection.templateConnectDrive'))
      return
    }
    setTemplatesLoading(true)
    try {
      const result = await getInspectionTemplates(templateFolderId)
      if (!result.success) {
        if (result.error === 'NOT_CONNECTED') {
          addToast('info', t('source.inspection.templateConnectDrive'))
        } else {
          addToast('error', t('source.inspection.templateListFailed'))
        }
        setTemplates([])
        return
      }
      setTemplates(result.templates ?? [])
    } finally {
      setTemplatesLoading(false)
    }
  }, [templateFolderId, addToast])

  const handleTemplateMenuToggle = useCallback(() => {
    setTemplateMenuOpen((open) => {
      const next = !open
      if (next) void loadTemplates()
      return next
    })
  }, [loadTemplates])

  const handleGenerateTemplate = useCallback(
    async (template: InspectionTemplateFile) => {
      setTemplateMenuOpen(false)
      if (!templateFolderId) return

      setIsGenerating(true)
      try {
        // The sheet is generated from what is on screen right now - the rows below are the
        // user's uncommitted table edits - so its identifying fields follow the same overlay.
        // A report titled with the number the user has just replaced is the drawing-export bug
        // in a different deliverable.
        const identity = resolveFileMetadata(file)
        const brNumber = resolvedText(identity.partNumber)
        const revision = resolvedText(identity.revision)
        const description = resolvedText(identity.description)
        const partName = description || file.pdmData?.file_name || file.name
        const drawingName = file.pdmData?.file_name ?? file.name

        // Best-effort part preview (skipped silently when unavailable)
        let previewUrl: string | null = null
        if (fileId && orgId) {
          previewUrl = await uploadInspectionPreview(file.path, fileId, orgId)
        }

        // Formatted rows in the currently displayed order, keyed by field for {{COL:field}} tokens
        const formattedRows = displayRows.map((row) => {
          const record: Record<string, string> = {}
          for (const col of COLUMNS) {
            const value = row[col.key]
            record[col.key] = value === null || value === undefined ? '' : String(value)
          }
          return record
        })
        const columnLabels: Record<string, string> = {}
        for (const col of COLUMNS) columnLabels[col.key] = col.label

        const namePrefix = brNumber || partName
        const reportName = `${namePrefix}${revision ? ` Rev ${revision}` : ''} - ${template.name}`

        const result = await generateInspectionSheet({
          templateId: template.id,
          destinationFolderId: templateFolderId,
          reportName,
          scalarTokens: {
            BR_NUMBER: brNumber,
            PART_NAME: partName,
            DESCRIPTION: description,
            REVISION: revision,
            DATE: new Date().toLocaleDateString(),
            DRAWING_NAME: drawingName,
          },
          previewImageUrl: previewUrl,
          rows: formattedRows,
          columnLabels,
        })

        if (!result.success || !result.spreadsheetUrl) {
          if (result.error === 'NOT_CONNECTED') {
            addToast('info', t('source.inspection.templateConnectDrive'))
          } else {
            addToast('error', t('source.inspection.templateFailed'))
          }
          return
        }

        window.open(result.spreadsheetUrl, '_blank')
        addToast('success', t('source.inspection.templateSuccess'))
      } catch (error) {
        log.error('[InspectionTab]', 'Generate template failed', { error: String(error) })
        addToast('error', t('source.inspection.templateFailed'))
      } finally {
        setIsGenerating(false)
      }
    },
    [templateFolderId, file, fileId, orgId, displayRows, addToast],
  )

  if (!fileId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-plm-fg/60 p-6 text-center">
        <ClipboardList size={28} className="mb-2 opacity-60" />
        <div className="text-sm">{t('source.inspection.notSynced')}</div>
      </div>
    )
  }

  if (notInstalled) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-plm-fg/60 p-6 text-center gap-2">
        <Database size={28} className="opacity-60" />
        <div className="text-sm font-medium text-plm-fg/80">
          {t('source.inspection.notInstalledTitle')}
        </div>
        <div className="text-xs max-w-sm leading-relaxed">
          {t('source.inspection.notInstalledBody')}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-plm-border shrink-0">
        <div className="flex items-center gap-2 text-sm font-medium text-plm-fg">
          <ClipboardList size={15} />
          {t('source.inspection.title')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-plm-fg/70">
          <span>{t('source.inspection.version')}</span>
          <select
            value={selectedVersion}
            onChange={(e) => setSelectedVersion(e.target.value)}
            className="bg-plm-bg border border-plm-border rounded px-1.5 py-0.5 text-xs"
          >
            <option value={CURRENT_VERSION}>{t('source.inspection.current')}</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.version}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1" />

        {isSaving && (
          <span className="flex items-center gap-1 text-xs text-plm-fg/60">
            <Loader2 size={12} className="animate-spin" />
            {t('source.inspection.saving')}
          </span>
        )}

        {viewingCurrent && !isCheckedOutByMe && (
          <span className="flex items-center gap-1 text-xs text-plm-fg/60">
            <Lock size={12} />
            {t('source.inspection.readOnlyCheckout')}
          </span>
        )}

        {editable && isDrawing && (
          <button
            type="button"
            onClick={() => void drawing.handleExtract()}
            disabled={drawing.busy}
            className="btn btn-secondary btn-sm gap-1"
            title={t('source.inspection.extractTitle')}
          >
            {drawing.isExtracting ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <ScanSearch size={12} />
            )}
            {drawing.isExtracting
              ? t('source.inspection.extracting')
              : t('source.inspection.extractFromDrawing')}
          </button>
        )}

        {editable && isDrawing && rows.length > 0 && (
          <button
            type="button"
            onClick={() => void drawing.handleBalloon()}
            disabled={drawing.busy}
            className="btn btn-secondary btn-sm gap-1"
            title={t('source.inspection.balloonTitle')}
          >
            {drawing.isBallooning ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <CircleDot size={12} />
            )}
            {drawing.isBallooning
              ? t('source.inspection.ballooning')
              : t('source.inspection.balloonDrawing')}
          </button>
        )}

        {canGenerateTemplate && (
          <div className="relative" ref={templateMenuRef}>
            <button
              type="button"
              onClick={handleTemplateMenuToggle}
              disabled={isGenerating}
              className="btn btn-secondary btn-sm gap-1"
              title={t('source.inspection.generateTemplate')}
            >
              {isGenerating ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <FileSpreadsheet size={12} />
              )}
              {isGenerating
                ? t('source.inspection.generating')
                : t('source.inspection.generateTemplate')}
              <ChevronDown size={12} />
            </button>

            {templateMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-20 min-w-56 max-h-72 overflow-auto rounded-md border border-plm-border bg-plm-bg shadow-lg py-1">
                {templatesLoading ? (
                  <div className="flex items-center gap-2 px-3 py-2 text-xs text-plm-fg/60">
                    <Loader2 size={12} className="animate-spin" />
                    {t('source.inspection.templateLoading')}
                  </div>
                ) : templates.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-plm-fg/60">
                    {t('source.inspection.templateNone')}
                  </div>
                ) : (
                  templates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => void handleGenerateTemplate(template)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-plm-fg hover:bg-plm-bg/40"
                    >
                      <FileSpreadsheet size={12} className="flex-shrink-0 text-plm-fg/60" />
                      <span className="truncate">{template.name}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {editable && (
          <button
            type="button"
            onClick={() => setMethodModalOpen(true)}
            className="btn btn-secondary btn-sm gap-1"
            title={t('source.inspection.manageMethods')}
          >
            <Settings2 size={12} />
            {t('source.inspection.methods')}
          </button>
        )}

        {editable && (
          <button
            type="button"
            onClick={handleAddRow}
            className="btn btn-secondary btn-sm gap-1"
          >
            <Plus size={12} />
            {t('source.inspection.addRow')}
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-plm-fg/60">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-plm-fg/60 text-center px-6">
            <div className="text-sm">{t('source.inspection.empty')}</div>
            {editable && (
              <div className="flex items-center gap-2 mt-3">
                {isDrawing && (
                  <button
                    type="button"
                    onClick={() => void drawing.handleExtract()}
                    disabled={drawing.busy}
                    className="btn btn-secondary btn-sm gap-1"
                  >
                    {drawing.isExtracting ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <ScanSearch size={12} />
                    )}
                    {drawing.isExtracting
                      ? t('source.inspection.extracting')
                      : t('source.inspection.extractFromDrawing')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAddRow}
                  className="btn btn-secondary btn-sm gap-1"
                >
                  <Plus size={12} />
                  {t('source.inspection.addRow')}
                </button>
              </div>
            )}
          </div>
        ) : (
          <table className="text-xs border-collapse w-max min-w-full">
            <thead className="sticky top-0 bg-plm-bg z-10">
              <tr className="border-b border-plm-border">
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={`px-2 py-1.5 text-left font-medium text-plm-fg/70 ${col.width}`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSort(col.key)}
                      className="flex items-center gap-1 hover:text-plm-fg w-full text-left"
                      title={t('source.inspection.sortBy')}
                    >
                      <span className="truncate">{col.label}</span>
                      {sortKey === col.key ? (
                        sortDir === 'asc' ? (
                          <ArrowUp size={11} className="shrink-0" />
                        ) : (
                          <ArrowDown size={11} className="shrink-0" />
                        )
                      ) : (
                        <ChevronsUpDown size={11} className="shrink-0 opacity-30" />
                      )}
                    </button>
                  </th>
                ))}
                {editable && <th className="px-2 py-1.5 w-12" />}
              </tr>
              <tr className="border-b border-plm-border">
                {COLUMNS.map((col) => (
                  <th key={col.key} className="px-1 py-1 align-top">
                    <ColumnFilter
                      col={col}
                      value={filters[col.key] ?? ''}
                      onChange={(value) => handleFilterChange(col.key, value)}
                    />
                  </th>
                ))}
                {editable && <th className="px-1 py-1" />}
              </tr>
            </thead>
            <tbody>
              {displayRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={COLUMNS.length + (editable ? 1 : 0)}
                    className="px-2 py-6 text-center text-plm-fg/50"
                  >
                    {t('source.inspection.noMatches')}
                  </td>
                </tr>
              ) : (
                displayRows.map((row) => (
                <tr key={row.id} className="border-b border-plm-border/50 hover:bg-plm-bg/40">
                  {COLUMNS.map((col) => (
                    <td key={col.key} className="px-1 py-0.5">
                      <InspectionCell
                        col={col}
                        value={row[col.key]}
                        editable={editable && col.key !== 'balloon_number' && !col.readOnly}
                        onChange={(value) => handleCellChange(row.id, col.key, value)}
                        methodOptions={methodOptions}
                        onManageMethods={() => setMethodModalOpen(true)}
                      />
                    </td>
                  ))}
                  {editable && (
                    <td className="px-1 py-0.5">
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(row.id)}
                        className="p-1 rounded hover:bg-plm-error/20 text-plm-error"
                        title={t('source.inspection.deleteRow')}
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  )}
                </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {drawing.pendingExtract && (
        <ExtractPreviewDialog
          pending={drawing.pendingExtract}
          onToggleRemove={drawing.toggleRemove}
          onConfirm={() => void drawing.confirmExtract()}
          onCancel={drawing.cancelExtract}
        />
      )}

      {drawing.pendingBalloons && (
        <BalloonConfirmDialog
          plan={drawing.pendingBalloons}
          onConfirm={() => void drawing.confirmBalloon()}
          onCancel={drawing.cancelBalloon}
        />
      )}

      {methodModalOpen && (
        <MethodManagerModal
          methods={orgMethods}
          builtInMethods={DEFAULT_INSPECTION_METHODS}
          onAdd={handleAddMethod}
          onRename={handleRenameMethod}
          onRemove={handleRemoveMethod}
          onClose={() => setMethodModalOpen(false)}
        />
      )}
    </div>
  )
}
