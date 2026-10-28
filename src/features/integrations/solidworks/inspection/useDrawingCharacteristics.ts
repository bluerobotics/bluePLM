import { useState, useCallback, useEffect, useRef } from 'react'

import { t } from '@/lib/i18n'
import { log } from '@/lib/logger'
import { usePDMStore, type LocalFile } from '@/stores/pdmStore'
import { getHighestUsedBalloonNumber, type InspectionRowInput } from '@/lib/supabase'
import { hasLocalContent } from '@/lib/fileOperations/assemblyResolver'
import {
  checkSwServiceFeature,
  SW_SERVICE_VERSION_NATIVE_INSPECTION,
} from '@/lib/swServiceVersion'
import {
  applyCharacteristicMerge,
  planCharacteristicMerge,
  type CharacteristicMergePlan,
} from '@/lib/inspection/characteristicMerge'
import type { ExtractedDrawingCharacteristics } from '@/lib/inspection/types'

import {
  buildExtractPreview,
  defaultRemoveIds,
  inspectionErrorKey,
  planBalloonRequests,
  type BalloonRequestPlan,
  type ExtractPreview,
} from './drawingCharacteristicsFlow'

interface UseDrawingCharacteristicsOptions {
  file: LocalFile
  fileId: string | undefined
  /** The version shown (`current` or a version id). */
  version: string
  /** Current view, checked out by me, a drawing. */
  enabled: boolean
  serviceRunning: boolean
  /** Version the running service reports, when known. */
  serviceVersion: string | undefined
  /** The table as it is now. */
  getRows: () => InspectionRowInput[]
  /** Write pending table edits now; false when the save failed. */
  flushPendingSave: () => Promise<boolean>
  /** Replace the table with the merged rows and persist them; false when the save failed. */
  commitMergedRows: (next: InspectionRowInput[]) => Promise<boolean>
}

/** File and version a flow started on. A flow whose scope no longer matches stops silently. */
interface FlowScope {
  fileId: string
  version: string
  filePath: string
}

export interface PendingExtract {
  scope: FlowScope
  plan: CharacteristicMergePlan
  preview: ExtractPreview
  removeIds: Set<string>
}

interface PendingBalloons {
  scope: FlowScope
  plan: BalloonRequestPlan
}

/**
 * The "Extract from drawing" and "Balloon drawing" flows of the Inspection tab. Extraction reads
 * the drawing through the plain SOLIDWORKS API, plans the merge and holds
 * it for the preview dialog. Ballooning re-extracts so each row's persist reference is current,
 * holds the request for the confirm dialog, then writes and saves the drawing.
 */
export function useDrawingCharacteristics({
  file,
  fileId,
  version,
  enabled,
  serviceRunning,
  serviceVersion,
  getRows,
  flushPendingSave,
  commitMergedRows,
}: UseDrawingCharacteristicsOptions) {
  const addToast = usePDMStore((s) => s.addToast)
  const [isExtracting, setIsExtracting] = useState(false)
  const [isBallooning, setIsBallooning] = useState(false)
  const [pendingExtract, setPendingExtract] = useState<PendingExtract | null>(null)
  const [pendingBalloonState, setPendingBalloons] = useState<PendingBalloons | null>(null)

  const busy = isExtracting || isBallooning

  // The tab is not keyed by file: the same instance shows the next file or version. Flows read
  // this after every await and stop when the user has moved on.
  const liveRef = useRef({ fileId, version, enabled })
  useEffect(() => {
    liveRef.current = { fileId, version, enabled }
  }, [fileId, version, enabled])
  const isCurrent = useCallback(
    (scope: FlowScope) =>
      liveRef.current.fileId === scope.fileId && liveRef.current.version === scope.version,
    [],
  )

  // A preview or confirm prepared for another file or version is dropped.
  useEffect(() => {
    setPendingExtract(null)
    setPendingBalloons(null)
  }, [fileId, version])

  /** Shared preconditions; toasts the reason and returns false when the flow cannot run. */
  const checkReady = useCallback((): boolean => {
    if (!enabled || !fileId) return false
    if (!serviceRunning) {
      addToast('info', t('source.inspection.extractServiceOffline'))
      return false
    }
    // Both commands arrived in one service release; an older service fails on the first call.
    const feature = checkSwServiceFeature(serviceVersion ?? null, SW_SERVICE_VERSION_NATIVE_INSPECTION)
    if (feature.status === 'incompatible') {
      addToast(
        'error',
        t('source.inspection.serviceTooOld', {
          version: serviceVersion ?? '?',
          required: SW_SERVICE_VERSION_NATIVE_INSPECTION,
        }),
      )
      return false
    }
    if (!hasLocalContent(file)) {
      addToast('info', t('source.inspection.notLocal'))
      return false
    }
    return true
  }, [enabled, fileId, serviceRunning, serviceVersion, file, addToast])

  /** Read the drawing; toasts the failure and returns null (silently when the scope moved on). */
  const extract = useCallback(
    async (scope: FlowScope): Promise<ExtractedDrawingCharacteristics | null> => {
      const result = await window.electronAPI?.solidworks?.extractDrawingCharacteristics(
        scope.filePath,
      )
      if (!isCurrent(scope)) return null
      if (!result?.success || !result.data) {
        const key = inspectionErrorKey(result?.errorCode)
        addToast('error', key ? t(key) : result?.error || t('source.inspection.extractFailed'))
        return null
      }
      if (result.data.skipped.length > 0) {
        log.info('[InspectionTab]', 'Extraction skipped annotations', {
          skipped: result.data.skipped,
        })
      }
      return result.data
    },
    [isCurrent, addToast],
  )

  const handleExtract = useCallback(async () => {
    if (busy || !checkReady() || !fileId) return
    const scope: FlowScope = { fileId, version, filePath: file.path }
    setIsExtracting(true)
    try {
      if (!(await flushPendingSave()) || !isCurrent(scope)) return
      const data = await extract(scope)
      if (!data) return
      if (data.characteristics.length === 0) {
        addToast('info', t('source.inspection.extractNone'))
        return
      }
      const highest = await getHighestUsedBalloonNumber(scope.fileId)
      if (!isCurrent(scope)) return
      if (!highest.success) {
        addToast('error', highest.error || t('source.inspection.extractFailed'))
        return
      }
      const plan = planCharacteristicMerge({
        rows: getRows(),
        extracted: data.characteristics,
        sheets: data.sheets,
        highestUsedNumber: highest.highest ?? 0,
        skipped: data.skipped,
        newId: () => crypto.randomUUID(),
      })
      const incompleteSheets = data.incompleteSheets ?? []
      const preview = buildExtractPreview(plan, incompleteSheets)
      if (preview.isNoOp) {
        addToast('info', t('source.inspection.extractUpToDate'))
        return
      }
      setPendingExtract({
        scope,
        plan,
        preview,
        removeIds: defaultRemoveIds(plan, incompleteSheets),
      })
    } catch (error) {
      log.error('[InspectionTab]', 'Extract from drawing failed', { error: String(error) })
      addToast('error', t('source.inspection.extractFailed'))
    } finally {
      setIsExtracting(false)
    }
  }, [
    busy,
    checkReady,
    fileId,
    version,
    file.path,
    flushPendingSave,
    isCurrent,
    extract,
    getRows,
    addToast,
  ])

  const toggleRemove = useCallback((rowId: string) => {
    setPendingExtract((prev) => {
      if (!prev) return prev
      const removeIds = new Set(prev.removeIds)
      if (removeIds.has(rowId)) removeIds.delete(rowId)
      else removeIds.add(rowId)
      return { ...prev, removeIds }
    })
  }, [])

  const cancelExtract = useCallback(() => setPendingExtract(null), [])

  const confirmExtract = useCallback(async () => {
    const pending = pendingExtract
    if (!pending) return
    setPendingExtract(null)
    if (!isCurrent(pending.scope) || !liveRef.current.enabled) return
    setIsExtracting(true)
    try {
      const next = applyCharacteristicMerge(getRows(), pending.plan, pending.removeIds)
      const removed = pending.plan.missing.filter((r) => pending.removeIds.has(r.id)).length
      if (!(await commitMergedRows(next))) return
      addToast(
        'success',
        t('source.inspection.extractApplied', {
          added: pending.preview.counts.added,
          updated: pending.preview.counts.updated + pending.preview.counts.adopted,
          removed,
        }),
      )
    } finally {
      setIsExtracting(false)
    }
  }, [pendingExtract, isCurrent, getRows, commitMergedRows, addToast])

  const handleBalloon = useCallback(async () => {
    if (busy || !checkReady() || !fileId) return
    const scope: FlowScope = { fileId, version, filePath: file.path }
    setIsBallooning(true)
    try {
      if (!(await flushPendingSave()) || !isCurrent(scope)) return
      const keyed = getRows().filter((r) => r.source_key && r.balloon_number)
      if (keyed.length === 0) {
        addToast('info', t('source.inspection.balloonNothing'))
        return
      }
      // Rows do not store the persist reference: read it from a fresh extraction.
      const data = await extract(scope)
      if (!data) return
      const plan = planBalloonRequests(getRows(), data.characteristics)
      if (plan.balloons.length === 0) {
        addToast('warning', t('source.inspection.balloonAllStale'))
        return
      }
      setPendingBalloons({ scope, plan })
    } catch (error) {
      log.error('[InspectionTab]', 'Balloon preparation failed', { error: String(error) })
      addToast('error', t('source.inspection.balloonFailed'))
    } finally {
      setIsBallooning(false)
    }
  }, [
    busy,
    checkReady,
    fileId,
    version,
    file.path,
    flushPendingSave,
    isCurrent,
    getRows,
    extract,
    addToast,
  ])

  const cancelBalloon = useCallback(() => setPendingBalloons(null), [])

  const confirmBalloon = useCallback(async () => {
    const pending = pendingBalloonState
    if (!pending) return
    setPendingBalloons(null)
    if (!isCurrent(pending.scope) || !liveRef.current.enabled) return
    setIsBallooning(true)
    try {
      const result = await window.electronAPI?.solidworks?.applyInspectionBalloons(
        pending.scope.filePath,
        pending.plan.balloons,
      )
      if (!result?.success || !result.data) {
        const key = inspectionErrorKey(result?.errorCode)
        if (key) {
          addToast('error', t(key))
        } else if (result?.data && !result.data.saved) {
          // The balloons went in but the save failed; the service attaches its report.
          log.warn('[InspectionTab]', 'Balloons placed but the drawing was not saved', {
            error: result.error,
            data: result.data,
          })
          addToast(
            'error',
            t('source.inspection.balloonNotSaved', { placed: result.data.placed }),
          )
        } else {
          addToast('error', result?.error || t('source.inspection.balloonFailed'))
        }
        return
      }
      const { placed, missing, removedPrevious, saved, keptPositions } = result.data
      log.info('[InspectionTab]', 'Balloons applied', {
        placed,
        missing,
        removedPrevious,
        keptPositions,
        saved,
      })
      if (!saved) {
        addToast('warning', t('source.inspection.balloonNotSaved', { placed }))
      } else {
        const kept =
          keptPositions > 0
            ? ` ${t('source.inspection.balloonKeptPositions', { count: keptPositions })}`
            : ''
        addToast(
          'success',
          `${t('source.inspection.balloonApplied', { placed, removedPrevious })}${kept}`,
        )
      }
      if (missing.length > 0) {
        addToast('warning', t('source.inspection.balloonMissing', { count: missing.length }))
      }
    } catch (error) {
      log.error('[InspectionTab]', 'Balloon drawing failed', { error: String(error) })
      addToast('error', t('source.inspection.balloonFailed'))
    } finally {
      setIsBallooning(false)
    }
  }, [pendingBalloonState, isCurrent, addToast])

  return {
    isExtracting,
    isBallooning,
    busy,
    pendingExtract,
    pendingBalloons: pendingBalloonState?.plan ?? null,
    handleExtract,
    toggleRemove,
    cancelExtract,
    confirmExtract,
    handleBalloon,
    cancelBalloon,
    confirmBalloon,
  }
}
