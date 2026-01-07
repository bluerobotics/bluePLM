/**
 * useConfigHandlers - SolidWorks configuration management hook
 * 
 * Provides handlers for managing SolidWorks file configurations including:
 * - Loading and displaying configurations in a tree structure
 * - Tab number and description editing with pending changes
 * - Multi-select configuration row handling
 * - Exporting configurations to STEP/IGES/STL formats
 * - Saving pending metadata changes back to SW files
 * 
 * Key exports:
 * - handleConfigTabChange, handleConfigDescriptionChange
 * - handleConfigRowClick, handleConfigContextMenu
 * - handleExportConfigs, saveConfigsToSWFile
 * - canHaveConfigs, hasPendingConfigChanges
 * 
 * @example
 * const {
 *   canHaveConfigs,
 *   toggleFileConfigExpansion,
 *   handleExportConfigs
 * } = useConfigHandlers({
 *   files, expandedConfigFiles, fileConfigurations, ...
 * })
 */
import { useCallback } from 'react'
import type { LocalFile } from '@/stores/pdmStore'
import { usePDMStore } from '@/stores/pdmStore'
import type { ConfigWithDepth } from '../types'
import type { ConfigContextMenuState } from './useContextMenuState'
import type { Organization } from '@/stores/types'
import { getEffectiveExportSettings } from '@/features/settings/system'
import { buildConfigTreeFlat } from '../utils/configTree'
import { getSerializationSettings, combineBaseAndTab } from '@/lib/serialization'

export interface ConfigHandlersDeps {
  // Files state (still passed - could also read from store but kept for consistency)
  files: LocalFile[]
  
  // Config state is now read directly from usePDMStore
  // Only refs and local state that can't be in store are passed
  lastClickedConfigRef: React.MutableRefObject<string | null>
  justSavedConfigs: React.MutableRefObject<Set<string>>
  
  // Config context menu state (local UI state)
  configContextMenu: ConfigContextMenuState | null
  setConfigContextMenu: (state: ConfigContextMenuState | null) => void
  
  // Exporting state (local UI state)
  setIsExportingConfigs: (exporting: boolean) => void
  setSavingConfigsToSW: (saving: Set<string> | ((prev: Set<string>) => Set<string>)) => void
  
  // File selection (uses store action)
  setSelectedFiles: (paths: string[]) => void
  
  // Organization
  organization: Organization | null
  
  // Toast
  addToast: (type: 'success' | 'error' | 'info' | 'warning', message: string) => void
}

export interface UseConfigHandlersReturn {
  handleConfigTabChange: (filePath: string, configName: string, value: string) => void
  handleConfigDescriptionChange: (filePath: string, configName: string, value: string) => void
  handleConfigRowClick: (e: React.MouseEvent, filePath: string, configName: string, configs: ConfigWithDepth[]) => void
  handleConfigContextMenu: (e: React.MouseEvent, filePath: string, configName: string) => void
  handleExportConfigs: (format: 'step' | 'iges' | 'stl') => Promise<void>
  canHaveConfigs: (file: LocalFile) => boolean
  saveConfigsToSWFile: (file: LocalFile) => Promise<void>
  hasPendingConfigChanges: (file: LocalFile) => boolean
  getSelectedConfigsForFile: (filePath: string) => string[]
  toggleFileConfigExpansion: (file: LocalFile) => Promise<void>
}

/**
 * Hook for managing configuration (SolidWorks config) related handlers.
 */
export function useConfigHandlers(deps: ConfigHandlersDeps): UseConfigHandlersReturn {
  const {
    files,
    lastClickedConfigRef,
    justSavedConfigs,
    configContextMenu,
    setConfigContextMenu,
    setIsExportingConfigs,
    setSavingConfigsToSW,
    setSelectedFiles,
    organization,
    addToast,
  } = deps
  
  // Config state from Zustand store (following the pattern of expandedFolders/selectedFiles)
  const expandedConfigFiles = usePDMStore(s => s.expandedConfigFiles)
  const selectedConfigs = usePDMStore(s => s.selectedConfigs)
  const fileConfigurations = usePDMStore(s => s.fileConfigurations)
  const setExpandedConfigFiles = usePDMStore(s => s.setExpandedConfigFiles)
  const setSelectedConfigs = usePDMStore(s => s.setSelectedConfigs)
  const setFileConfigurations = usePDMStore(s => s.setFileConfigurations)
  const addLoadingConfig = usePDMStore(s => s.addLoadingConfig)
  const removeLoadingConfig = usePDMStore(s => s.removeLoadingConfig)

  // Update config tab number
  const handleConfigTabChange = useCallback((filePath: string, configName: string, value: string) => {
    const file = files.find(f => f.path === filePath)
    if (!file) return
    
    // Update config in store
    const configs = fileConfigurations.get(filePath)
    if (configs) {
      const updated = configs.map(c => c.name === configName ? { ...c, tabNumber: value.toUpperCase() } : c)
      setFileConfigurations(filePath, updated)
    }
    
    // Update pending metadata
    const existingTabs = file.pendingMetadata?.config_tabs || {}
    usePDMStore.getState().updatePendingMetadata(filePath, {
      config_tabs: { ...existingTabs, [configName]: value.toUpperCase() }
    })
  }, [files, fileConfigurations, setFileConfigurations])

  // Update config description
  const handleConfigDescriptionChange = useCallback((filePath: string, configName: string, value: string) => {
    const file = files.find(f => f.path === filePath)
    if (!file) return
    
    // Update config in store
    const configs = fileConfigurations.get(filePath)
    if (configs) {
      const updated = configs.map(c => c.name === configName ? { ...c, description: value } : c)
      setFileConfigurations(filePath, updated)
    }
    
    // Update pending metadata
    const existingDescs = file.pendingMetadata?.config_descriptions || {}
    usePDMStore.getState().updatePendingMetadata(filePath, {
      config_descriptions: { ...existingDescs, [configName]: value }
    })
  }, [files, fileConfigurations, setFileConfigurations])

  // Check if file can have configurations (sldprt or sldasm)
  const canHaveConfigs = useCallback((file: LocalFile): boolean => {
    if (file.isDirectory) return false
    if (!file.extension) return false
    const ext = file.extension.toLowerCase()
    return ext === '.sldprt' || ext === '.sldasm'
  }, [])

  // Check if file has pending config changes
  const hasPendingConfigChanges = useCallback((file: LocalFile): boolean => {
    const pendingTabs = file.pendingMetadata?.config_tabs
    const pendingDescs = file.pendingMetadata?.config_descriptions
    return !!(pendingTabs && Object.keys(pendingTabs).length > 0) || 
           !!(pendingDescs && Object.keys(pendingDescs).length > 0)
  }, [])

  // Get selected configs for the given file (for export operations)
  const getSelectedConfigsForFile = useCallback((filePath: string): string[] => {
    return [...selectedConfigs]
      .filter(key => key.startsWith(filePath + '::'))
      .map(key => key.split('::')[1])
  }, [selectedConfigs])

  // Save config metadata to SolidWorks file
  const saveConfigsToSWFile = useCallback(async (file: LocalFile) => {
    const configs = fileConfigurations.get(file.path)
    if (!configs || configs.length === 0) return
    
    setSavingConfigsToSW(prev => new Set(prev).add(file.path))
    
    try {
      const baseNumber = file.pendingMetadata?.part_number || file.pdmData?.part_number || ''
      let successCount = 0
      let failedCount = 0
      
      // Only save configs that have PENDING changes (not all configs with data)
      const pendingTabs = file.pendingMetadata?.config_tabs || {}
      const pendingDescs = file.pendingMetadata?.config_descriptions || {}
      const changedConfigNames = new Set([...Object.keys(pendingTabs), ...Object.keys(pendingDescs)])
      
      if (changedConfigNames.size === 0) {
        addToast('info', 'No metadata changes to save')
        return
      }
      
      // Filter to only configs that have pending changes
      const configsToSave = configs.filter(c => changedConfigNames.has(c.name))
      
      console.log(`[ConfigHandlers] Saving ${configsToSave.length} changed config(s) to SW file:`, file.name)
      
      for (const config of configsToSave) {
        const props: Record<string, string> = {}
        
        // Only include properties that were actually changed
        const tabChanged = pendingTabs[config.name] !== undefined
        const descChanged = pendingDescs[config.name] !== undefined
        
        // Build full part number (base + tab)
        if (tabChanged && config.tabNumber) {
          if (baseNumber) {
            props['Number'] = `${baseNumber}-${config.tabNumber}`
          } else {
            props['Number'] = config.tabNumber
          }
          props['Tab Number'] = config.tabNumber
        }
        
        if (descChanged && config.description) {
          props['Description'] = config.description
        }
        
        if (Object.keys(props).length === 0) continue
        
        console.log(`[ConfigHandlers] Writing to config ${config.name}:`, props)
        
        try {
          const result = await window.electronAPI?.solidworks?.setProperties(file.path, props, config.name)
          console.log(`[ConfigHandlers] setProperties result for ${config.name}:`, result)
          
          if (result?.success) {
            successCount++
          } else {
            failedCount++
            console.error(`[ConfigHandlers] Failed to write to config ${config.name}:`, result?.error || 'Unknown error')
          }
        } catch (err) {
          failedCount++
          console.error(`[ConfigHandlers] Exception writing to config ${config.name}:`, err)
        }
      }
      
      console.log(`[ConfigHandlers] Save complete: ${successCount} success, ${failedCount} failed`)
      
      if (successCount > 0) {
        if (failedCount > 0) {
          addToast('warning', `Saved ${successCount} config(s), ${failedCount} failed`)
        } else {
          addToast('success', `Saved metadata for ${successCount} configuration${successCount > 1 ? 's' : ''}`)
        }
        
        // Mark that we just saved - prevents accidental reload from clearing our changes
        justSavedConfigs.current.add(file.path)
        setTimeout(() => {
          justSavedConfigs.current.delete(file.path)
        }, 5000) // Clear after 5 seconds
        
        // Clear the pending config metadata since we've written it to the file
        usePDMStore.getState().clearPendingConfigMetadata(file.path)
      } else {
        addToast('error', 'Failed to save metadata - check if file is open in SolidWorks')
      }
    } catch (err) {
      console.error('[ConfigHandlers] Failed to save configs to SW:', err)
      addToast('error', 'Failed to save to SolidWorks file')
    } finally {
      setSavingConfigsToSW(prev => {
        const next = new Set(prev)
        next.delete(file.path)
        return next
      })
    }
  }, [fileConfigurations, setSavingConfigsToSW, justSavedConfigs, addToast])

  // Handle config row click with multi-select support (Ctrl/Cmd + Shift)
  const handleConfigRowClick = useCallback((e: React.MouseEvent, filePath: string, configName: string, configs: ConfigWithDepth[]) => {
    e.stopPropagation()
    const configKey = `${filePath}::${configName}`
    
    if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd click: toggle individual selection
      setSelectedConfigs((() => {
        const next = new Set(selectedConfigs)
        // Filter to only configs from the same file
        const sameFileConfigs = new Set([...next].filter(k => k.startsWith(filePath + '::')))
        if (sameFileConfigs.has(configKey)) {
          next.delete(configKey)
        } else {
          next.add(configKey)
        }
        return next
      })())
      lastClickedConfigRef.current = configKey
    } else if (e.shiftKey && lastClickedConfigRef.current?.startsWith(filePath + '::')) {
      // Shift click: range selection (same file only)
      const lastConfigName = lastClickedConfigRef.current.split('::')[1]
      const startIdx = configs.findIndex(c => c.name === lastConfigName)
      const endIdx = configs.findIndex(c => c.name === configName)
      
      if (startIdx >= 0 && endIdx >= 0) {
        const minIdx = Math.min(startIdx, endIdx)
        const maxIdx = Math.max(startIdx, endIdx)
        const rangeConfigs = configs.slice(minIdx, maxIdx + 1).map(c => `${filePath}::${c.name}`)
        
        const next = new Set(selectedConfigs)
        // Add all configs in range
        rangeConfigs.forEach(key => next.add(key))
        setSelectedConfigs(next)
      }
    } else {
      // Normal click: select just this config
      setSelectedConfigs(new Set([configKey]))
      lastClickedConfigRef.current = configKey
    }
    
    // Also select the parent file
    setSelectedFiles([filePath])
  }, [selectedConfigs, setSelectedConfigs, lastClickedConfigRef, setSelectedFiles])

  // Handle config row right-click (context menu)
  const handleConfigContextMenu = useCallback((e: React.MouseEvent, filePath: string, configName: string) => {
    e.preventDefault()
    e.stopPropagation()
    
    const configKey = `${filePath}::${configName}`
    
    // If right-clicked config is not in selection, select it alone
    if (!selectedConfigs.has(configKey)) {
      setSelectedConfigs(new Set([configKey]))
      lastClickedConfigRef.current = configKey
    }
    
    setConfigContextMenu({ x: e.clientX, y: e.clientY, filePath, configName })
    setSelectedFiles([filePath])
  }, [selectedConfigs, setSelectedConfigs, lastClickedConfigRef, setConfigContextMenu, setSelectedFiles])

  // Export configurations
  const handleExportConfigs = useCallback(async (format: 'step' | 'iges' | 'stl') => {
    if (!configContextMenu) return
    
    const filePath = configContextMenu.filePath
    const configsToExport = getSelectedConfigsForFile(filePath)
    
    if (configsToExport.length === 0) {
      configsToExport.push(configContextMenu.configName)
    }
    
    // Get the file's PDM data for fallback metadata
    const file = files.find(f => f.path === filePath)
    
    // Get tab number from the first selected configuration
    const configs = fileConfigurations.get(filePath) || []
    const firstConfigName = configsToExport[0]
    const firstConfig = configs.find(c => c.name === firstConfigName)
    
    // Tab number priority: pendingMetadata > config data from store
    const pendingTabNumber = file?.pendingMetadata?.config_tabs?.[firstConfigName] || ''
    const configTabNumber = firstConfig?.tabNumber || ''
    const tabNumber = pendingTabNumber || configTabNumber
    
    // Get config-specific description: pending metadata > config store > file-level fallback
    const pendingConfigDesc = file?.pendingMetadata?.config_descriptions?.[firstConfigName] || ''
    const configDescription = pendingConfigDesc || firstConfig?.description || ''
    const finalDescription = configDescription || file?.pdmData?.description || file?.pendingMetadata?.description || ''
    
    // Build full item number for configuration using serialization settings
    const baseNumber = file?.pdmData?.part_number || file?.pendingMetadata?.part_number || ''
    let fullItemNumber = baseNumber
    
    if (tabNumber && organization?.id) {
      try {
        const serSettings = await getSerializationSettings(organization.id)
        if (serSettings?.tab_enabled) {
          fullItemNumber = combineBaseAndTab(baseNumber, tabNumber, serSettings)
        } else if (baseNumber && tabNumber) {
          // Fallback: simple concatenation with dash if tabs not formally enabled
          fullItemNumber = `${baseNumber}-${tabNumber}`
        }
      } catch (err) {
        console.warn('[Export] Failed to get serialization settings, using simple concatenation:', err)
        if (baseNumber && tabNumber) {
          fullItemNumber = `${baseNumber}-${tabNumber}`
        }
      }
    }
    
    // Debug logging
    console.log('[Export] BluePLM metadata for export:')
    console.log('[Export]   File path:', filePath)
    console.log('[Export]   Config name:', firstConfigName)
    console.log('[Export]   PDM part_number:', file?.pdmData?.part_number)
    console.log('[Export]   Pending part_number:', file?.pendingMetadata?.part_number)
    console.log('[Export]   Base number:', baseNumber)
    console.log('[Export]   Tab number:', tabNumber)
    console.log('[Export]   Full item number:', fullItemNumber)
    console.log('[Export]   PDM revision:', file?.pdmData?.revision)
    console.log('[Export]   Config description from store:', firstConfig?.description)
    console.log('[Export]   Pending config description:', pendingConfigDesc)
    console.log('[Export]   Final description:', finalDescription)
    
    const pdmMetadata = {
      partNumber: fullItemNumber,  // Full config-specific item number (base + tab)
      tabNumber: tabNumber,
      revision: file?.pdmData?.revision || '',
      description: finalDescription  // Config-specific description
    }
    
    console.log('[Export] Final pdmMetadata being sent:', pdmMetadata)
    
    // Get filename pattern from effective export settings (user preference > org default > app default)
    const exportSettings = getEffectiveExportSettings(organization)
    const filenamePattern = exportSettings.filename_pattern
    
    // Close context menu immediately
    setConfigContextMenu(null)
    setIsExportingConfigs(true)
    
    // Show progress toast (will remain visible until export completes)
    const fileName = filePath.split(/[\\/]/).pop() || filePath
    const configLabel = configsToExport.length === 1 ? configsToExport[0] : `${configsToExport.length} configs`
    addToast('info', `Exporting ${format.toUpperCase()}: ${fileName} (${configLabel})...`)
    
    try {
      let result
      switch (format) {
        case 'step':
          result = await window.electronAPI?.solidworks?.exportStep(filePath, { 
            configurations: configsToExport,
            filenamePattern,
            pdmMetadata  // Pass PDM data as fallback for file properties
          })
          break
        case 'iges':
          result = await window.electronAPI?.solidworks?.exportIges(filePath, { 
            configurations: configsToExport 
          })
          break
        case 'stl':
          result = await window.electronAPI?.solidworks?.exportStl?.(filePath, { 
            configurations: configsToExport 
          })
          break
      }
      
      if (result?.success) {
        const count = result.data && 'exportedFiles' in result.data ? result.data.exportedFiles?.length : configsToExport.length
        const exportedFiles = result.data && 'exportedFiles' in result.data ? result.data.exportedFiles : []
        
        // Copy the configuration's metadata to each exported STEP file
        if (exportedFiles && exportedFiles.length > 0) {
          for (const exportedPath of exportedFiles) {
            usePDMStore.getState().updatePendingMetadata(exportedPath, {
              part_number: fullItemNumber,
              description: finalDescription,
              revision: file?.pdmData?.revision || 'A'
            })
          }
        }
        
        // Show success with first exported filename if available
        if (exportedFiles && exportedFiles.length > 0) {
          const firstFile = exportedFiles[0].split(/[\\/]/).pop()
          addToast('success', `Exported ${count} ${format.toUpperCase()} file${count > 1 ? 's' : ''}: ${firstFile}${count > 1 ? ' ...' : ''}`)
        } else {
          addToast('success', `Exported ${count} ${format.toUpperCase()} file${count > 1 ? 's' : ''}`)
        }
      } else {
        addToast('error', result?.error || `Failed to export ${format.toUpperCase()}`)
      }
    } catch (err) {
      addToast('error', `Export failed: ${err}`)
    } finally {
      setIsExportingConfigs(false)
    }
  }, [files, configContextMenu, getSelectedConfigsForFile, organization, setIsExportingConfigs, setConfigContextMenu, addToast])

  // Toggle file configuration expansion (expand/collapse config rows for a file)
  const toggleFileConfigExpansion = useCallback(async (file: LocalFile) => {
    const newExpanded = new Set(expandedConfigFiles)
    
    if (newExpanded.has(file.path)) {
      // Collapse - also clear any selected configs for this file
      newExpanded.delete(file.path)
      setExpandedConfigFiles(newExpanded)
      // Clear selected configs for this file
      const newSelected = new Set([...selectedConfigs].filter(key => !key.startsWith(file.path + '::')))
      setSelectedConfigs(newSelected)
    } else {
      // Expand - load configurations if not already loaded
      newExpanded.add(file.path)
      setExpandedConfigFiles(newExpanded)
      
      if (!fileConfigurations.has(file.path)) {
        addLoadingConfig(file.path)
        try {
          const result = await window.electronAPI?.solidworks?.getConfigurations(file.path)
          if (result?.success && result.data?.configurations) {
            const configs = result.data.configurations as Array<{
              name: string
              isActive?: boolean
              parentConfiguration?: string | null
              properties?: Record<string, string>
            }>
            
            // Load pending metadata for tab numbers and descriptions
            const pendingTabs = file.pendingMetadata?.config_tabs || 
              (file.pdmData?.custom_properties as Record<string, unknown> | undefined)?._config_tabs as Record<string, string> | undefined || {}
            const pendingDescs = file.pendingMetadata?.config_descriptions || 
              (file.pdmData?.custom_properties as Record<string, unknown> | undefined)?._config_descriptions as Record<string, string> | undefined || {}
            
            // Also fetch properties from each config from the SW file
            const configsWithData = await Promise.all(configs.map(async (c) => {
              let tabNumber = pendingTabs[c.name] || ''
              let description = pendingDescs[c.name] || ''
              
              // If no pending data, try to load from file properties
              if (!tabNumber || !description) {
                try {
                  const propsResult = await window.electronAPI?.solidworks?.getProperties(file.path, c.name)
                  if (propsResult?.success && propsResult.data) {
                    const configProps = propsResult.data.configurationProperties?.[c.name] || {}
                    const fileProps = propsResult.data.fileProperties || {}
                    const mergedProps = { ...fileProps, ...configProps }
                    
                    // Try to extract description from file
                    if (!description) {
                      description = mergedProps['Description'] || mergedProps['DESCRIPTION'] || mergedProps['description'] || ''
                    }
                    
                    // Try to extract tab number from file (parse from Number property)
                    if (!tabNumber) {
                      const numProp = mergedProps['Number'] || mergedProps['Part Number'] || mergedProps['PartNumber'] || ''
                      // Extract tab from end of number (e.g., "BR-101010-XXX" -> "XXX")
                      const parts = numProp.split('-')
                      if (parts.length >= 2) {
                        const lastPart = parts[parts.length - 1]
                        // Check if it looks like a tab number (not the main number)
                        if (lastPart && lastPart.length <= 4) {
                          tabNumber = lastPart
                        }
                      }
                    }
                  }
                } catch (err) {
                  console.error(`Failed to load properties for config ${c.name}:`, err)
                }
              }
              
              return {
                name: c.name,
                isActive: c.isActive,
                parentConfiguration: c.parentConfiguration,
                tabNumber,
                description,
                depth: 0  // Will be set by buildConfigTreeFlat
              }
            }))
            
            // Build tree structure with depth
            const flatTree = buildConfigTreeFlat(configsWithData)
            setFileConfigurations(file.path, flatTree)
          }
        } catch (err) {
          console.error('Failed to load configurations:', err)
        } finally {
          removeLoadingConfig(file.path)
        }
      }
    }
  }, [expandedConfigFiles, selectedConfigs, fileConfigurations, setExpandedConfigFiles, setSelectedConfigs, setFileConfigurations, addLoadingConfig, removeLoadingConfig])

  return {
    handleConfigTabChange,
    handleConfigDescriptionChange,
    handleConfigRowClick,
    handleConfigContextMenu,
    handleExportConfigs,
    canHaveConfigs,
    saveConfigsToSWFile,
    hasPendingConfigChanges,
    getSelectedConfigsForFile,
    toggleFileConfigExpansion,
  }
}
