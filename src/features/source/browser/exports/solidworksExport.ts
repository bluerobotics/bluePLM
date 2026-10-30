/**
 * SOLIDWORKS exports (STEP, IGES, STL, PDF, DXF) of files in the vault.
 *
 * Shared by the context menu's Export submenus and the export shortcuts. Callers do not run
 * these directly: they go through `enqueueExport` (`exportQueue.ts`), so exports from both
 * entry points run one at a time against the SolidWorks service.
 */
import { getEffectiveExportSettings } from '@/features/settings/system/ExportSettings'
import { t } from '@/lib/i18n'
import { log } from '@/lib/logger'
import {
  resolveConfigurationTabs,
  resolveDescription,
  resolvePartNumber,
  resolveRevision,
  resolvedText,
} from '@/lib/metadata/overlay'
import { getSerializationSettings, combineBaseAndTab } from '@/lib/serialization'
import { usePDMStore, type LocalFile } from '@/stores/pdmStore'

export type ExportFormat = 'step' | 'iges' | 'stl' | 'pdf' | 'dxf'

/** The values the SolidWorks service actually substituted into the export filename */
interface ResolvedExportMetadata {
  partNumber?: string
  tabNumber?: string
  revision?: string
  description?: string
}

/**
 * Only the PDF export reports back what it resolved, and `result.data` is a union across
 * every export format, so read the field defensively rather than narrowing the union.
 */
function readResolvedMetadata(data: unknown): ResolvedExportMetadata | undefined {
  if (!data || typeof data !== 'object' || !('resolvedMetadata' in data)) return undefined
  const value = (data as { resolvedMetadata?: unknown }).resolvedMetadata
  if (!value || typeof value !== 'object') return undefined
  return value as ResolvedExportMetadata
}

/** Drawings export as PDF and DXF; parts and assemblies as STEP, IGES and STL. */
export function filesForFormat(format: ExportFormat, files: LocalFile[]): LocalFile[] {
  const wanted = format === 'pdf' || format === 'dxf' ? ['.slddrw'] : ['.sldprt', '.sldasm']
  return files.filter((f) => !f.isDirectory && wanted.includes(f.extension?.toLowerCase() || ''))
}

/** Item number with the configuration tab, as the serialization settings combine them */
async function fullItemNumberFor(baseNumber: string, tabNumber: string): Promise<string> {
  const organization = usePDMStore.getState().organization
  if (!tabNumber || !organization?.id) return baseNumber
  try {
    const serSettings = await getSerializationSettings(organization.id)
    if (serSettings?.tab_enabled) return combineBaseAndTab(baseNumber, tabNumber, serSettings)
  } catch (error) {
    log.debug('[Export]', 'Failed to get serialization settings', { error: error })
  }
  return baseNumber && tabNumber ? `${baseNumber}-${tabNumber}` : baseNumber
}

/**
 * Tab number for the default configuration.
 *
 * Left on truthiness deliberately: the fallback runs across configurations rather than
 * across the two states of one field, and the merged map carries no source per key. See
 * the same note in `ExportMetadataTableActions.tsx`.
 */
function defaultTabNumber(file: LocalFile): string {
  const configTabs = resolveConfigurationTabs(file)
  return configTabs['Default'] || configTabs['default'] || Object.values(configTabs)[0] || ''
}

/** Lets React paint the progress toast between exports */
function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Export `files` as `format`, next to each file or into `outputFolder`. `files` must already be
 * the ones that format applies to (`filesForFormat`).
 */
export async function exportFiles(
  format: ExportFormat,
  files: LocalFile[],
  outputFolder?: string,
): Promise<void> {
  const { addToast, addProgressToast, updateProgressToast, removeToast } = usePDMStore.getState()
  const fileCount = files.length
  const formatUpper = format.toUpperCase()

  if (fileCount === 0) {
    addToast('error', t('contextMenu.export.noFiles', { format: formatUpper }))
    return
  }

  const toastId = `export-${format}-${Date.now()}`
  addProgressToast(
    toastId,
    fileCount > 1
      ? t('contextMenu.export.progressMany', { format: formatUpper, count: fileCount })
      : t('contextMenu.export.progress', { format: formatUpper }),
    fileCount,
  )

  // Suppress the file watcher during export to prevent UI thrashing
  const filePaths = files.map((f) => f.path)
  usePDMStore.getState().addProcessingFolders(filePaths, 'export')

  try {
    let successCount = 0
    let failCount = 0

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      updateProgressToast(
        toastId,
        i,
        Math.round((i / fileCount) * 100),
        undefined,
        `${i}/${fileCount}`,
      )

      const baseNumber = resolvedText(resolvePartNumber(file))
      const description = resolvedText(resolveDescription(file))
      const revision = resolvedText(resolveRevision(file)).trim()
      const tabNumber = defaultTabNumber(file)
      const fullItemNumber = await fullItemNumberFor(baseNumber, tabNumber)

      const pdmMetadata = {
        partNumber: fullItemNumber,
        tabNumber,
        // For PDF exports (drawings): don't send PDM revision - let the drawing's own Revision property be authoritative
        // The PDM revision may come from the parent part, which is incorrect for drawings
        revision: format === 'pdf' ? '' : revision,
        description,
      }

      const exportSettings = getEffectiveExportSettings(usePDMStore.getState().organization)
      const filenamePattern = exportSettings.filename_pattern

      try {
        log.info('[Export]', `Exporting ${file.name} as ${formatUpper}`, {
          inputPath: file.path,
          outputFolder,
          filenamePattern,
          pdmMetadata,
        })

        let result
        switch (format) {
          case 'pdf':
            result = await window.electronAPI?.solidworks?.exportPdf(file.path, {
              outputPath: outputFolder,
              filenamePattern,
              pdmMetadata,
            })
            break
          case 'step':
            result = await window.electronAPI?.solidworks?.exportStep(file.path, {
              exportAllConfigs: true,
              filenamePattern,
              pdmMetadata,
              outputPath: outputFolder,
            })
            break
          case 'iges':
            result = await window.electronAPI?.solidworks?.exportIges(file.path, {
              exportAllConfigs: true,
              outputPath: outputFolder,
            })
            break
          case 'stl':
            result = await window.electronAPI?.solidworks?.exportStl?.(file.path, {
              exportAllConfigs: true,
              filenamePattern,
              pdmMetadata,
              resolution: exportSettings.stl_resolution,
              binaryFormat: exportSettings.stl_binary_format,
              customDeviation: exportSettings.stl_custom_deviation,
              customAngle: exportSettings.stl_custom_angle,
              outputPath: outputFolder,
            })
            break
          case 'dxf':
            result = await window.electronAPI?.solidworks?.exportDxf(file.path, outputFolder)
            break
        }

        if (result?.success) {
          successCount++
          // Copy metadata to exported files
          // Handle both response formats:
          // - STEP/IGES/STL: { exportedFiles: [...] }
          // - PDF/DXF: { outputFile: "..." }
          let exportedFiles: string[] = []
          if (result.data) {
            if ('exportedFiles' in result.data && Array.isArray(result.data.exportedFiles)) {
              exportedFiles = result.data.exportedFiles
            } else if ('outputFile' in result.data && typeof result.data.outputFile === 'string') {
              exportedFiles = [result.data.outputFile]
            }
          }
          log.info('[Export]', `SUCCESS: ${file.name} exported`, {
            inputPath: file.path,
            outputPaths: exportedFiles,
            format: formatUpper,
          })

          // The service resolves the filename from the source file's own properties and
          // only falls back to what we sent, so it may have used a different number than
          // fullItemNumber. Tag the export with what was actually used, otherwise the new
          // file's Item Number silently contradicts its own filename.
          const resolved = readResolvedMetadata(result.data)
          const resolvedItemNumber = resolved?.partNumber || fullItemNumber
          const resolvedDescription = resolved?.description || description

          if (resolved?.partNumber && resolved.partNumber !== fullItemNumber) {
            log.warn('[Export]', `Source file properties disagree with BluePLM`, {
              inputPath: file.path,
              pdmItemNumber: fullItemNumber,
              fileItemNumber: resolved.partNumber,
            })
            addToast(
              'warning',
              t('contextMenu.export.itemNumberMismatch', {
                name: file.name,
                fileNumber: resolved.partNumber,
                pdmNumber: fullItemNumber,
              }),
            )
          }

          for (const exportedPath of exportedFiles) {
            usePDMStore.getState().updatePendingMetadata(exportedPath, {
              part_number: resolvedItemNumber,
              description: resolvedDescription,
              revision: resolved?.revision || revision || '',
            })
          }
        } else {
          failCount++
          log.error('[Export]', `FAILED: ${file.name} export failed`, {
            inputPath: file.path,
            outputFolder,
            format: formatUpper,
            error: result?.error,
          })
        }
      } catch (error) {
        failCount++
        log.error('[Export]', `EXCEPTION: ${file.name} export threw error`, {
          inputPath: file.path,
          outputFolder,
          format: formatUpper,
          error: error,
        })
      }

      await yieldToUi()
    }

    removeToast(toastId)

    log.info('[Export]', `Export batch complete`, {
      format: formatUpper,
      total: fileCount,
      succeeded: successCount,
      failed: failCount,
      outputFolder,
    })

    if (successCount > 0 && failCount === 0) {
      addToast(
        'success',
        t('contextMenu.export.done', { count: successCount, format: formatUpper }),
      )
    } else if (successCount > 0 && failCount > 0) {
      addToast(
        'warning',
        t('contextMenu.export.partial', { succeeded: successCount, failed: failCount }),
      )
    } else {
      addToast('error', t('contextMenu.export.failed', { format: formatUpper }))
    }
  } catch (error) {
    removeToast(toastId)
    addToast('error', t('contextMenu.export.error', { error: String(error) }))
  } finally {
    // Clear processing state to re-enable the file watcher
    usePDMStore.getState().removeProcessingFolders(filePaths)
  }
}

interface DrawingReference {
  path: string
  fileName: string
  exists: boolean
  fileType: string
  configuration?: string
  configurations?: string[]
}

/**
 * Export STEP of the part or assembly each drawing references, named with the drawing's
 * metadata, next to each drawing or into `outputFolder`.
 */
export async function exportStepFromDrawings(
  drawings: LocalFile[],
  outputFolder?: string,
): Promise<void> {
  const { addToast, addProgressToast, updateProgressToast, removeToast } = usePDMStore.getState()

  if (drawings.length === 0) {
    addToast('error', t('contextMenu.export.noDrawings'))
    return
  }

  const toastId = `export-step-drawing-${Date.now()}`
  addProgressToast(
    toastId,
    drawings.length > 1
      ? t('contextMenu.export.progressFromDrawings', { count: drawings.length })
      : t('contextMenu.export.progressFromDrawing'),
    drawings.length,
  )

  const drawingPaths = drawings.map((f) => f.path)
  usePDMStore.getState().addProcessingFolders(drawingPaths, 'export')

  try {
    let successCount = 0
    let failCount = 0
    let totalExported = 0

    for (let i = 0; i < drawings.length; i++) {
      const drawing = drawings[i]
      updateProgressToast(
        toastId,
        i,
        Math.round((i / drawings.length) * 100),
        undefined,
        `${i}/${drawings.length}`,
      )

      const drawingRevision = resolvedText(resolveRevision(drawing)).trim()
      const drawingPartNumber = resolvedText(resolvePartNumber(drawing))
      const drawingDescription = resolvedText(resolveDescription(drawing))
      const drawingDir = drawing.path.replace(/[\\/][^\\/]+$/, '')

      let refs: DrawingReference[] = []
      let swNotRunning = false
      try {
        const refResult = await window.electronAPI?.solidworks?.getReferences(drawing.path)
        if (refResult?.success && refResult.data?.references) {
          refs = refResult.data.references as DrawingReference[]
        } else if (refResult?.error) {
          const errLower = refResult.error.toLowerCase()
          if (errLower.includes('not_running') || errLower.includes('not running')) {
            swNotRunning = true
          }
        }
      } catch (error) {
        log.error('[Export]', 'Failed to get references for drawing', {
          drawingPath: drawing.path,
          error: error,
        })
      }

      if (swNotRunning) {
        removeToast(toastId)
        addToast('warning', t('contextMenu.export.startSolidWorks'))
        return
      }

      const modelRefs = refs.filter((r) => {
        const ft = r.fileType?.toLowerCase()
        return ft === 'part' || ft === 'assembly'
      })

      if (modelRefs.length === 0) {
        failCount++
        log.warn('[Export]', 'No model references found for drawing', {
          drawingPath: drawing.path,
        })
        continue
      }

      const tabNumber = defaultTabNumber(drawing)
      const fullItemNumber = await fullItemNumberFor(drawingPartNumber, tabNumber)

      const exportSettings = getEffectiveExportSettings(usePDMStore.getState().organization)
      const filenamePattern = exportSettings.filename_pattern

      for (const ref of modelRefs) {
        if (!ref.exists) {
          log.warn('[Export]', 'Referenced model does not exist on disk, skipping', {
            refPath: ref.path,
            drawing: drawing.path,
          })
          continue
        }

        const configurations =
          ref.configurations && ref.configurations.length > 0
            ? ref.configurations
            : ref.configuration
              ? [ref.configuration]
              : undefined

        const pdmMetadata = {
          partNumber: fullItemNumber,
          tabNumber,
          revision: drawingRevision,
          description: drawingDescription,
        }

        try {
          log.info('[Export]', `Exporting STEP from drawing reference`, {
            drawing: drawing.path,
            modelPath: ref.path,
            configurations,
            pdmMetadata,
            outputFolder: outputFolder || drawingDir,
          })

          const result = await window.electronAPI?.solidworks?.exportStep(ref.path, {
            configurations,
            filenamePattern,
            pdmMetadata,
            pdmMetadataOverride: true,
            outputPath: outputFolder || drawingDir,
          })

          if (result?.success) {
            successCount++
            let exportedFiles = result.data?.exportedFiles || []
            totalExported += exportedFiles.length || 1

            // Fallback: if service didn't return file paths, construct them from the pattern
            if (exportedFiles.length === 0 && filenamePattern) {
              const destDir = outputFolder || drawingDir
              const evaluated = filenamePattern
                .replace(/\{partNumber\}/gi, pdmMetadata.partNumber || '')
                .replace(/\{rev(?:ision)?\}/gi, pdmMetadata.revision || '')
                .replace(/\{description\}/gi, pdmMetadata.description || '')
                .replace(/\{tab(?:Number)?\}/gi, pdmMetadata.tabNumber || '')
                .replace(/\{config(?:uration)?\}/gi, configurations?.[0] || '')
              if (evaluated) {
                exportedFiles = [`${destDir}\\${evaluated}.step`]
                log.info('[Export]', 'Constructed fallback export path from pattern', {
                  fallbackPath: exportedFiles[0],
                })
              }
            }

            log.info('[Export]', `SUCCESS: STEP exported from drawing reference`, {
              drawing: drawing.path,
              modelPath: ref.path,
              outputPaths: exportedFiles,
            })
            for (const exportedPath of exportedFiles) {
              usePDMStore.getState().updatePendingMetadata(exportedPath, {
                part_number: fullItemNumber,
                description: drawingDescription,
                revision: drawingRevision,
              })
            }
          } else {
            failCount++
            log.error('[Export]', `FAILED: STEP export from drawing reference`, {
              drawing: drawing.path,
              modelPath: ref.path,
              error: result?.error,
            })
          }
        } catch (error) {
          failCount++
          log.error('[Export]', `EXCEPTION: STEP export from drawing reference`, {
            drawing: drawing.path,
            modelPath: ref.path,
            error: error,
          })
        }
      }

      await yieldToUi()
    }

    removeToast(toastId)

    log.info('[Export]', 'Drawing STEP export batch complete', {
      drawings: drawings.length,
      succeeded: successCount,
      failed: failCount,
      totalExported,
      outputFolder,
    })

    if (successCount > 0 && failCount === 0) {
      addToast('success', t('contextMenu.export.doneFromDrawings', { count: totalExported }))
    } else if (successCount > 0 && failCount > 0) {
      addToast(
        'warning',
        t('contextMenu.export.partial', { succeeded: successCount, failed: failCount }),
      )
    } else {
      addToast('error', t('contextMenu.export.failedFromDrawings'))
    }
  } catch (error) {
    removeToast(toastId)
    addToast('error', t('contextMenu.export.error', { error: String(error) }))
  } finally {
    usePDMStore.getState().removeProcessingFolders(drawingPaths)
  }
}
