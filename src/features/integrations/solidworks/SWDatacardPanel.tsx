import { useState, useEffect, useCallback, useRef } from 'react'
import { usePDMStore, LocalFile } from '@/stores/pdmStore'
import { 
  getNextSerialNumber, 
  getSerializationSettings, 
  parsePartNumber, 
  combineBaseAndTab,
  autoPadTab,
  SerializationSettings 
} from '@/lib/serialization'
import {
  FileBox,
  Layers,
  FilePen,
  Loader2,
  RefreshCw,
  ExternalLink,
  Package,
  FileOutput,
  Download,
  ChevronDown,
  ChevronRight,
  Sparkles,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Save
} from 'lucide-react'

// Configuration data type
interface ConfigurationData {
  name: string
  isActive?: boolean
  description?: string
  parentConfiguration?: string | null  // Parent config name for derived configurations
  properties: Record<string, string>
}

// Build a tree structure from flat config list
interface ConfigTreeNode extends ConfigurationData {
  children: ConfigTreeNode[]
  depth: number
}

function buildConfigTree(configs: ConfigurationData[]): ConfigTreeNode[] {
  const nodeMap = new Map<string, ConfigTreeNode>()
  const roots: ConfigTreeNode[] = []
  
  // Create nodes for all configs
  configs.forEach(config => {
    nodeMap.set(config.name, { ...config, children: [], depth: 0 })
  })
  
  // Build tree structure
  configs.forEach(config => {
    const node = nodeMap.get(config.name)!
    if (config.parentConfiguration && nodeMap.has(config.parentConfiguration)) {
      const parent = nodeMap.get(config.parentConfiguration)!
      node.depth = parent.depth + 1
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  })
  
  // Flatten tree for rendering (depth-first)
  function flattenTree(nodes: ConfigTreeNode[]): ConfigTreeNode[] {
    const result: ConfigTreeNode[] = []
    nodes.forEach(node => {
      result.push(node)
      result.push(...flattenTree(node.children))
    })
    return result
  }
  
  return flattenTree(roots)
}

// SolidWorks service hook
function useSolidWorksService() {
  const [status, setStatus] = useState<{ running: boolean; version?: string; directAccessEnabled?: boolean }>({ running: false })
  const [isStarting, setIsStarting] = useState(false)
  const { addToast, organization } = usePDMStore()
  
  const dmLicenseKey = organization?.settings?.solidworks_dm_license_key

  const checkStatus = useCallback(async () => {
    try {
      const result = await window.electronAPI?.solidworks?.getServiceStatus()
      if (result?.success && result.data) {
        setStatus(result.data)
      }
    } catch {
      setStatus({ running: false })
    }
  }, [])

  const startService = useCallback(async () => {
    setIsStarting(true)
    try {
      const result = await window.electronAPI?.solidworks?.startService(dmLicenseKey || undefined)
      if (result?.success) {
        const directAccessEnabled = (result.data as any)?.fastModeEnabled
        setStatus({ 
          running: true, 
          version: (result.data as any)?.version,
          directAccessEnabled
        })
        addToast('success', `SolidWorks service started`)
      } else {
        addToast('error', result?.error || 'Failed to start SolidWorks service')
      }
    } catch (err) {
      addToast('error', `Failed to start service: ${err}`)
    } finally {
      setIsStarting(false)
    }
  }, [addToast, dmLicenseKey])

  useEffect(() => {
    checkStatus()
    const interval = setInterval(checkStatus, 5000)
    return () => clearInterval(interval)
  }, [checkStatus])

  return { status, isStarting, startService, checkStatus }
}

// File type icon
function SWFileIcon({ fileType, size = 16 }: { fileType: string; size?: number }) {
  switch (fileType) {
    case 'Part':
      return <FileBox size={size} className="text-cyan-400" />
    case 'Assembly':
      return <Layers size={size} className="text-amber-400" />
    case 'Drawing':
      return <FilePen size={size} className="text-violet-400" />
    default:
      return <FileBox size={size} className="text-plm-fg-muted" />
  }
}

// Configuration tree item (vertical with indentation for derived configs)
function ConfigTreeItem({ 
  config, 
  isSelected, 
  onClick,
  depth = 0
}: { 
  config: ConfigTreeNode
  isSelected: boolean
  onClick: () => void
  depth?: number
}) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full px-2 py-1 rounded text-xs font-medium text-left transition-all flex items-center gap-1.5
        ${isSelected 
          ? 'bg-cyan-500/20 text-cyan-300' 
          : 'text-plm-fg-muted hover:text-plm-fg hover:bg-plm-bg-light/30'
        }
      `}
      style={{ paddingLeft: `${8 + depth * 12}px` }}
    >
      {depth > 0 && (
        <span className="text-plm-fg-dim/50">└</span>
      )}
      <span className="truncate flex-1">{config.name}</span>
      {config.isActive && (
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" title="Active in SolidWorks" />
      )}
    </button>
  )
}

// Editable property field with inline editing
function PropertyField({ 
  label, 
  value, 
  onChange,
  onGenerateSerial,
  isGenerating,
  placeholder = '—',
  editable = true,
  note
}: { 
  label: string
  value: string
  onChange?: (value: string) => void
  onGenerateSerial?: () => void
  isGenerating?: boolean
  placeholder?: string
  editable?: boolean
  note?: string  // Small note shown after the input (e.g., "(for ConfigName)")
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-xs text-plm-fg-muted w-20 flex-shrink-0 text-right">
        {label}
      </label>
      <div className="flex-1 flex items-center gap-1">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          disabled={!editable}
          className={`
            flex-1 px-2.5 py-1.5 text-sm rounded border transition-colors
            ${editable 
              ? 'bg-plm-bg border-plm-border/50 focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/20 text-plm-fg' 
              : 'bg-plm-bg-light/30 border-transparent text-plm-fg-muted cursor-not-allowed'
            }
            placeholder:text-plm-fg-dim/50 placeholder:italic
          `}
        />
        {onGenerateSerial && editable && (
          <button
            onClick={onGenerateSerial}
            disabled={isGenerating}
            className="p-1.5 rounded border border-plm-border/50 hover:border-cyan-400/50 hover:bg-cyan-400/10 text-plm-fg-muted hover:text-cyan-400 transition-colors disabled:opacity-50"
            title="Generate serial number"
          >
            {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          </button>
        )}
        {note && (
          <span className="text-xs text-plm-fg-dim italic flex-shrink-0">{note}</span>
        )}
      </div>
    </div>
  )
}

// Read-only property display
function PropertyDisplay({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-plm-fg-muted w-24 text-right flex-shrink-0">{label}</span>
      <span className={value ? 'text-plm-fg' : 'text-plm-fg-dim italic'}>{value || '—'}</span>
    </div>
  )
}

// Export button component
function ExportButton({ 
  format, 
  icon, 
  onClick, 
  disabled, 
  isExporting 
}: { 
  format: string
  icon: React.ReactNode
  onClick: () => void
  disabled: boolean
  isExporting: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium 
        bg-plm-bg border border-plm-border/50 
        hover:border-plm-border hover:bg-plm-bg-light 
        disabled:opacity-40 disabled:cursor-not-allowed
        transition-colors"
    >
      {isExporting ? <Loader2 size={12} className="animate-spin" /> : icon}
      {format}
    </button>
  )
}

// Resizable divider component
function ResizableDivider({ 
  onDrag 
}: { 
  onDrag: (deltaX: number) => void 
}) {
  const [isDragging, setIsDragging] = useState(false)
  const startXRef = useRef(0)
  
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    startXRef.current = e.clientX
    
    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startXRef.current
      startXRef.current = e.clientX
      onDrag(deltaX)
    }
    
    const handleMouseUp = () => {
      setIsDragging(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }
  
  return (
    <div
      onMouseDown={handleMouseDown}
      className={`
        w-1 flex-shrink-0 cursor-col-resize group relative
        ${isDragging ? 'bg-cyan-400/50' : 'hover:bg-cyan-400/30'}
        transition-colors
      `}
    >
      <div className={`
        absolute inset-y-0 -left-1 -right-1
        ${isDragging ? '' : 'group-hover:bg-cyan-400/10'}
      `} />
    </div>
  )
}

// Main combined preview + properties panel
export function SWDatacardPanel({ file }: { file: LocalFile }) {
  const [preview, setPreview] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewZoom, setPreviewZoom] = useState(100)
  const [configurations, setConfigurations] = useState<ConfigurationData[]>([])
  const [activeConfigIndex, setActiveConfigIndex] = useState(0)
  const [configsLoading, setConfigsLoading] = useState(false)
  const [showAllProps, setShowAllProps] = useState(false)
  const [isExporting, setIsExporting] = useState<string | null>(null)
  const [isGeneratingSerial, setIsGeneratingSerial] = useState(false)
  const [isSavingToFile, setIsSavingToFile] = useState(false)
  
  // Resizable panel widths
  const [previewWidth, setPreviewWidth] = useState(180)
  const [configWidth, setConfigWidth] = useState(200) // Twice as wide as before
  
  // Clamp widths to reasonable bounds
  const handlePreviewResize = (deltaX: number) => {
    setPreviewWidth(prev => Math.max(120, Math.min(300, prev + deltaX)))
  }
  
  const handleConfigResize = (deltaX: number) => {
    setConfigWidth(prev => Math.max(120, Math.min(350, prev + deltaX)))
  }
  
  // Editable fields state - initialized from pdmData/pendingMetadata
  // Base number is SHARED across all configurations (file-level)
  const [baseNumber, setBaseNumber] = useState('')
  // Tab number for single-config files (file-level)
  const [tabNumber, setTabNumber] = useState('')
  // Per-configuration tab numbers (config name -> tab string) - base is shared
  const [configTabNumbers, setConfigTabNumbers] = useState<Record<string, string>>({})
  // Description for single-config files or drawings (file-level)
  const [description, setDescription] = useState('')
  // Per-configuration descriptions (config name -> description string)
  const [configDescriptions, setConfigDescriptions] = useState<Record<string, string>>({})
  const [revision, setRevision] = useState('')
  
  // Serialization settings (for tab support)
  const [serializationSettings, setSerializationSettings] = useState<SerializationSettings | null>(null)
  
  const { status } = useSolidWorksService()
  const { addToast, organization, user, updatePendingMetadata } = usePDMStore()
  
  const ext = file.extension?.toLowerCase() || ''
  const fileType = ext === '.sldprt' ? 'Part' : ext === '.sldasm' ? 'Assembly' : 'Drawing'
  const isPartOrAsm = ['.sldprt', '.sldasm'].includes(ext)
  const isDrawing = ext === '.slddrw'
  
  const activeConfig = configurations[activeConfigIndex] || null
  
  // Check if file is editable (synced and checked out by current user)
  const isEditable = file.pdmData?.id && file.pdmData.checked_out_by === user?.id
  
  // Whether tab numbering is enabled
  const tabEnabled = serializationSettings?.tab_enabled ?? false
  
  // Whether to show per-config fields (multi-config part/assembly)
  // Both tab numbers and descriptions are per-config for parts/assemblies with multiple configs
  // Note: Tab input fields are only shown when tabEnabled is true (handled in JSX)
  const hasMultipleConfigs = isPartOrAsm && configurations.length > 1

  // Load serialization settings
  useEffect(() => {
    if (!organization?.id) return
    
    getSerializationSettings(organization.id).then(settings => {
      setSerializationSettings(settings)
    })
  }, [organization?.id])

  // Initialize editable fields from pdmData/pendingMetadata when file changes
  useEffect(() => {
    // Get values with pendingMetadata taking priority over pdmData
    const pn = file.pendingMetadata?.part_number !== undefined 
      ? (file.pendingMetadata.part_number || '') 
      : (file.pdmData?.part_number || '')
    const desc = file.pendingMetadata?.description !== undefined 
      ? (file.pendingMetadata.description || '') 
      : (file.pdmData?.description || '')
    const rev = file.pendingMetadata?.revision !== undefined 
      ? file.pendingMetadata.revision 
      : (file.pdmData?.revision || '')
    
    // Parse item number into base and tab if settings available
    if (serializationSettings && pn) {
      const parsed = parsePartNumber(pn, serializationSettings)
      if (parsed) {
        setBaseNumber(parsed.base)
        setTabNumber(parsed.tab)
      } else {
        setBaseNumber(pn)
        setTabNumber('')
      }
    } else {
      setBaseNumber(pn)
      setTabNumber('')
    }
    
    setDescription(desc)
    setRevision(rev)
    
    // Initialize per-config tab numbers from custom_properties._config_tabs
    // Format: { "ConfigName": "001", "ConfigName2": "002" }
    const configTabs = file.pendingMetadata?.config_tabs || 
      (file.pdmData?.custom_properties as Record<string, unknown> | undefined)?._config_tabs as Record<string, string> | undefined
    
    if (configTabs) {
      setConfigTabNumbers(configTabs)
    } else {
      setConfigTabNumbers({})
    }
    
    // Initialize per-config descriptions from custom_properties._config_descriptions
    // Format: { "ConfigName": "Description for config 1", "ConfigName2": "Description for config 2" }
    // Note: PDM description = default config description (they are synced)
    const configDescs = file.pendingMetadata?.config_descriptions || 
      (file.pdmData?.custom_properties as Record<string, unknown> | undefined)?._config_descriptions as Record<string, string> | undefined
    
    if (configDescs) {
      setConfigDescriptions(configDescs)
    } else {
      // If no per-config descriptions saved yet, initialize default config from file-level description
      // This ensures PDM description = default config description
      setConfigDescriptions({})
    }
  }, [file.path, file.pdmData?.part_number, file.pdmData?.description, file.pdmData?.revision, 
      file.pendingMetadata?.part_number, file.pendingMetadata?.description, file.pendingMetadata?.revision,
      file.pdmData?.custom_properties, file.pendingMetadata?.config_tabs, file.pendingMetadata?.config_descriptions,
      serializationSettings])
  
  // Sync default config description with file-level description
  // When configs load, if default config has no description, use the file-level one
  useEffect(() => {
    if (!hasMultipleConfigs || configurations.length === 0) return
    
    // Find default config name
    const defaultConfig = configurations.find(c => 
      c.name.toLowerCase() === 'default' || c.name.toLowerCase() === 'default configuration'
    ) || configurations[0]
    
    if (!defaultConfig) return
    
    // If default config has no description set, initialize from file-level description
    if (!configDescriptions[defaultConfig.name] && description) {
      setConfigDescriptions(prev => ({
        ...prev,
        [defaultConfig.name]: description
      }))
    }
  }, [configurations, hasMultipleConfigs, description, configDescriptions])

  // Reset zoom when file changes
  useEffect(() => {
    setPreviewZoom(100)
  }, [file?.path])

  // Save base number (shared across all configs for multi-config files)
  // For multi-config: saves just the base to part_number
  // For single-config with tab: saves base+tab to part_number
  const handleBaseNumberChange = (value: string) => {
    setBaseNumber(value)
    if (!isEditable) return
    
    if (hasMultipleConfigs) {
      // Multi-config: store just the base in part_number
      // The full part number (base + tab) is computed per-config
      updatePendingMetadata(file.path, { part_number: value || null })
    } else if (tabEnabled && serializationSettings) {
      // Single-config with tab enabled: combine base + tab
      const combined = combineBaseAndTab(value, tabNumber, serializationSettings)
      updatePendingMetadata(file.path, { part_number: combined || null })
    } else {
      // No tab: just the base
      updatePendingMetadata(file.path, { part_number: value || null })
    }
  }
  
  // Handle tab change for single-config files
  // Allows letters (e.g., "XXX" for "all tabs") or numbers
  const handleTabNumberChange = (value: string) => {
    const upperValue = value.toUpperCase()
    setTabNumber(upperValue)
    if (isEditable && tabEnabled && serializationSettings && !hasMultipleConfigs) {
      const combined = combineBaseAndTab(baseNumber, upperValue, serializationSettings)
      updatePendingMetadata(file.path, { part_number: combined || null })
    }
  }
  
  // Auto-pad tab number on blur (single-config)
  const handleTabNumberBlur = () => {
    if (!serializationSettings || !tabNumber) return
    const padded = autoPadTab(tabNumber, serializationSettings)
    if (padded !== tabNumber) {
      setTabNumber(padded)
      if (isEditable && tabEnabled && !hasMultipleConfigs) {
        const combined = combineBaseAndTab(baseNumber, padded, serializationSettings)
        updatePendingMetadata(file.path, { part_number: combined || null })
      }
    }
  }
  
  // Handle per-config tab change (multi-config files)
  // The base is shared, only the tab varies per configuration
  // Allows letters (e.g., "XXX" for "all tabs") or numbers
  const handleConfigTabChange = (configName: string, value: string) => {
    const upperValue = value.toUpperCase()
    setConfigTabNumbers(prev => ({
      ...prev,
      [configName]: upperValue
    }))
    if (isEditable) {
      // Save to config_tabs in pending metadata
      const existingTabs = file.pendingMetadata?.config_tabs || configTabNumbers
      updatePendingMetadata(file.path, { 
        config_tabs: {
          ...existingTabs,
          [configName]: upperValue
        }
      })
    }
  }
  
  // Auto-pad config tab number on blur (multi-config)
  const handleConfigTabBlur = (configName: string) => {
    if (!serializationSettings) return
    const currentTab = configTabNumbers[configName] || ''
    if (!currentTab) return
    const padded = autoPadTab(currentTab, serializationSettings)
    if (padded !== currentTab) {
      setConfigTabNumbers(prev => ({
        ...prev,
        [configName]: padded
      }))
      if (isEditable) {
        const existingTabs = file.pendingMetadata?.config_tabs || configTabNumbers
        updatePendingMetadata(file.path, { 
          config_tabs: {
            ...existingTabs,
            [configName]: padded
          }
        })
      }
    }
  }
  
  // Handle description change for single-config files or drawings (file-level)
  const handleDescriptionChange = (value: string) => {
    setDescription(value)
    if (isEditable) {
      updatePendingMetadata(file.path, { description: value || null })
    }
  }
  
  // Get the default configuration name (first config, or one named "Default")
  const getDefaultConfigName = () => {
    if (configurations.length === 0) return null
    // Look for one explicitly named "Default"
    const defaultConfig = configurations.find(c => 
      c.name.toLowerCase() === 'default' || c.name.toLowerCase() === 'default configuration'
    )
    // Otherwise use the first config
    return defaultConfig?.name || configurations[0]?.name || null
  }
  
  // Handle per-config description change (for multi-config parts/assemblies)
  // If editing the default config, also update the file-level description (PDM style)
  const handleConfigDescriptionChange = (configName: string, value: string) => {
    setConfigDescriptions(prev => ({
      ...prev,
      [configName]: value
    }))
    
    const defaultConfigName = getDefaultConfigName()
    const isDefaultConfig = configName === defaultConfigName
    
    if (isEditable) {
      const existingDescs = file.pendingMetadata?.config_descriptions || configDescriptions
      
      // If this is the default config, also update the file-level description
      // This keeps PDM description = default config description
      if (isDefaultConfig) {
        setDescription(value)
        updatePendingMetadata(file.path, { 
          description: value || null,
          config_descriptions: {
            ...existingDescs,
            [configName]: value
          }
        })
      } else {
        updatePendingMetadata(file.path, { 
          config_descriptions: {
            ...existingDescs,
            [configName]: value
          }
        })
      }
    }
  }
  
  const handleRevisionChange = (value: string) => {
    setRevision(value)
    if (isEditable) {
      updatePendingMetadata(file.path, { revision: value.toUpperCase() })
    }
  }
  
  // Save properties to SolidWorks file
  // This writes the current metadata values directly into the SW file's custom properties
  // Only writes CHANGED configs (those in pending metadata) using batch API for efficiency
  const handleSaveToFile = async () => {
    if (!status.running) {
      addToast('error', 'SolidWorks service not running')
      return
    }
    
    setIsSavingToFile(true)
    try {
      if (hasMultipleConfigs) {
        // Multi-config: only write configs that have pending changes
        // Build a batch of config -> properties for changed configs only
        const pendingTabs = file.pendingMetadata?.config_tabs || {}
        const pendingDescs = file.pendingMetadata?.config_descriptions || {}
        
        // Find configs with pending changes
        const changedConfigs = new Set([
          ...Object.keys(pendingTabs),
          ...Object.keys(pendingDescs)
        ])
        
        // If base number or revision changed, we need to update all configs that have tabs set
        // (since their full number = base + tab)
        const baseOrRevChanged = file.pendingMetadata?.part_number !== undefined || 
                                  file.pendingMetadata?.revision !== undefined
        if (baseOrRevChanged) {
          // Add all configs that have tabs (existing or pending)
          Object.keys(configTabNumbers).forEach(configName => changedConfigs.add(configName))
        }
        
        if (changedConfigs.size === 0) {
          addToast('info', 'No pending changes to save')
          setIsSavingToFile(false)
          return
        }
        
        // Build batch payload - only for changed configs
        const configProperties: Record<string, Record<string, string>> = {}
        
        for (const configName of changedConfigs) {
          const configTab = configTabNumbers[configName] || ''
          const configDesc = configDescriptions[configName] || ''
          
          // Build full part number for this config (base + tab)
          const fullPartNumber = tabEnabled && serializationSettings && configTab
            ? combineBaseAndTab(baseNumber, configTab, serializationSettings)
            : baseNumber
          
          const props: Record<string, string> = {}
          if (fullPartNumber) props['Number'] = fullPartNumber
          if (configDesc) props['Description'] = configDesc
          if (revision) props['Revision'] = revision
          
          if (Object.keys(props).length > 0) {
            configProperties[configName] = props
          }
        }
        
        if (Object.keys(configProperties).length === 0) {
          addToast('info', 'No properties to save')
          setIsSavingToFile(false)
          return
        }
        
        // Single batch call to write all changed configs
        console.log('[SWDatacard] Batch saving configs:', Object.keys(configProperties))
        const result = await window.electronAPI?.solidworks?.setPropertiesBatch(file.path, configProperties)
        
        if (result?.success) {
          const count = result.data?.configurationsProcessed || Object.keys(configProperties).length
          addToast('success', `Saved properties to ${count} configuration${count > 1 ? 's' : ''}`)
        } else {
          console.error('Failed to batch save:', result?.error)
          addToast('error', result?.error || 'Failed to save properties')
        }
      } else {
        // Single config or drawing: write file-level properties
        const fullPartNumber = tabEnabled && serializationSettings && tabNumber
          ? combineBaseAndTab(baseNumber, tabNumber, serializationSettings)
          : baseNumber
        
        const props: Record<string, string> = {}
        if (fullPartNumber) props['Number'] = fullPartNumber
        if (description) props['Description'] = description
        if (revision) props['Revision'] = revision
        
        if (Object.keys(props).length > 0) {
          // Write to active config (or file-level for drawings)
          const configName = activeConfig?.name
          const result = await window.electronAPI?.solidworks?.setProperties(file.path, props, configName)
          if (result?.success) {
            addToast('success', `Saved ${result.data?.propertiesSet || 0} properties to file`)
          } else {
            console.error('Failed to save props:', result?.error)
            addToast('error', result?.error || 'Failed to save properties')
          }
        } else {
          addToast('info', 'No properties to save')
        }
      }
    } catch (err) {
      console.error('Failed to save to file:', err)
      addToast('error', 'Failed to save properties to file')
    } finally {
      setIsSavingToFile(false)
    }
  }
  
  // Load configurations and their properties
  useEffect(() => {
    const loadConfigurations = async () => {
      if (!file?.path) return
      
      setConfigsLoading(true)
      try {
        const result = await window.electronAPI?.solidworks?.getConfigurations(file.path)
        if (result?.success && result.data?.configurations) {
          const configs = result.data.configurations as ConfigurationData[]
          // Debug: log parent configurations to verify hierarchy data
          console.log('[SWDatacard] Configurations loaded:', configs.map(c => ({ 
            name: c.name, 
            parent: c.parentConfiguration 
          })))
          setConfigurations(configs)
          
          // Find and select the active config
          const activeIdx = configs.findIndex(c => c.isActive)
          setActiveConfigIndex(activeIdx >= 0 ? activeIdx : 0)
        } else {
          // Fallback - create a default configuration
          setConfigurations([{ name: 'Default', isActive: true, properties: {} }])
        }
      } catch (err) {
        console.error('Failed to load configurations:', err)
        setConfigurations([{ name: 'Default', isActive: true, properties: {} }])
      } finally {
        setConfigsLoading(false)
      }
    }
    
    if (status.running) {
      loadConfigurations()
    } else {
      // Mock configs for preview
      setConfigurations([
        { name: 'Default', isActive: true, properties: {} },
      ])
    }
  }, [file?.path, status.running])

  // Load additional properties for active configuration
  // Also auto-populate description/tab from file if not already set in PDM
  useEffect(() => {
    const loadProperties = async () => {
      if (!file?.path || !activeConfig?.name || !status.running) return
      
      try {
        const result = await window.electronAPI?.solidworks?.getProperties(file.path, activeConfig.name)
        
        if (result?.success && result.data) {
          const fileProps = result.data.fileProperties || {}
          const configProps = result.data.configurationProperties?.[activeConfig.name] || {}
          const mergedProps = { ...fileProps, ...configProps }
          
          setConfigurations(prev => prev.map((c, i) => 
            i === activeConfigIndex 
              ? { ...c, properties: mergedProps }
              : c
          ))
          
          // Auto-populate per-config description from file if not already set
          // Only do this for multi-config files and if user hasn't edited yet
          if (hasMultipleConfigs && !file.pendingMetadata?.config_descriptions?.[activeConfig.name]) {
            const fileDesc = findPropertyValue(mergedProps, ['Description', 'DESCRIPTION', 'Desc'])
            if (fileDesc && !configDescriptions[activeConfig.name]) {
              setConfigDescriptions(prev => ({
                ...prev,
                [activeConfig.name]: fileDesc
              }))
            }
          }
          
          // Auto-populate per-config tab number from file if not already set
          if (hasMultipleConfigs && tabEnabled && serializationSettings && 
              !file.pendingMetadata?.config_tabs?.[activeConfig.name]) {
            const fileNumber = findPropertyValue(mergedProps, ['Number', 'Part Number', 'PartNumber', 'Item Number'])
            if (fileNumber && !configTabNumbers[activeConfig.name]) {
              // Parse the number to extract just the tab portion
              const parsed = parsePartNumber(fileNumber, serializationSettings)
              if (parsed?.tab) {
                setConfigTabNumbers(prev => ({
                  ...prev,
                  [activeConfig.name]: parsed.tab
                }))
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to load properties:', err)
      }
    }
    
    loadProperties()
  }, [file?.path, activeConfig?.name, activeConfigIndex, status.running, hasMultipleConfigs, tabEnabled, serializationSettings])
  
  // Helper to find a property value by multiple possible names
  const findPropertyValue = (props: Record<string, string>, keys: string[]): string | null => {
    for (const key of keys) {
      const value = props[key]
      if (value && value.trim() && !value.startsWith('$')) {
        return value.trim()
      }
    }
    // Case-insensitive fallback
    for (const [key, value] of Object.entries(props)) {
      if (value?.startsWith?.('$')) continue
      const lowerKey = key.toLowerCase()
      for (const searchKey of keys) {
        if (lowerKey === searchKey.toLowerCase() || lowerKey.includes(searchKey.toLowerCase())) {
          if (value && value.trim()) return value.trim()
        }
      }
    }
    return null
  }

  // Load preview - Priority: OLE preview -> SW service -> OS thumbnail
  useEffect(() => {
    const loadPreview = async () => {
      if (!file?.path) return
      
      setPreviewLoading(true)
      setPreview(null)
      
      try {
        // 1. Try OLE preview extraction first (high quality, embedded in file)
        const oleResult = await window.electronAPI?.extractSolidWorksPreview?.(file.path)
        if (oleResult?.success && oleResult.data) {
          setPreview(oleResult.data)
          setPreviewLoading(false)
          return
        }
        
        // 2. If SW service is running, get high-quality preview from it
        if (status.running) {
          const previewResult = await window.electronAPI?.solidworks?.getPreview(file.path, activeConfig?.name)
          if (previewResult?.success && previewResult.data?.imageData) {
            const mimeType = previewResult.data.mimeType || 'image/png'
            setPreview(`data:${mimeType};base64,${previewResult.data.imageData}`)
            setPreviewLoading(false)
            return
          }
        }
        
        // 3. Fall back to OS thumbnail (lower quality but always available)
        const thumbResult = await window.electronAPI?.extractSolidWorksThumbnail(file.path)
        if (thumbResult?.success && thumbResult.data) {
          setPreview(thumbResult.data)
        }
      } catch (err) {
        console.error('Failed to load preview:', err)
      } finally {
        setPreviewLoading(false)
      }
    }
    
    loadPreview()
  }, [file?.path, activeConfig?.name, status.running])

  // Handle mouse wheel zoom on preview
  const handlePreviewWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -10 : 10
    setPreviewZoom(prev => Math.max(50, Math.min(300, prev + delta)))
  }

  // Refresh preview
  const refreshPreview = async () => {
    setPreviewLoading(true)
    setPreview(null)
    try {
      const oleResult = await window.electronAPI?.extractSolidWorksPreview?.(file.path)
      if (oleResult?.success && oleResult.data) {
        setPreview(oleResult.data)
        return
      }
      
      if (status.running) {
        const previewResult = await window.electronAPI?.solidworks?.getPreview(file.path, activeConfig?.name)
        if (previewResult?.success && previewResult.data?.imageData) {
          const mimeType = previewResult.data.mimeType || 'image/png'
          setPreview(`data:${mimeType};base64,${previewResult.data.imageData}`)
          return
        }
      }
      
      const thumbResult = await window.electronAPI?.extractSolidWorksThumbnail(file.path)
      if (thumbResult?.success && thumbResult.data) {
        setPreview(thumbResult.data)
      }
    } catch {
      // Silent fail
    } finally {
      setPreviewLoading(false)
    }
  }

  // Open in eDrawings
  const handleOpenInEDrawings = async () => {
    if (!file?.path) return
    try {
      await window.electronAPI?.openInEDrawings(file.path)
    } catch {
      addToast('error', 'Failed to open in eDrawings')
    }
  }

  // Generate serial number (generates base number, shared across all configs)
  const handleGenerateSerial = async () => {
    if (!organization?.id) return
    
    setIsGeneratingSerial(true)
    try {
      const serial = await getNextSerialNumber(organization.id)
      if (serial) {
        // The generated serial is the base number
        // Parse it to extract just the base portion (without any existing tab)
        let base = serial
        if (serializationSettings) {
          const parsed = parsePartNumber(serial, serializationSettings)
          if (parsed) {
            base = parsed.base
          }
        }
        
        setBaseNumber(base)
        
        if (hasMultipleConfigs) {
          // Multi-config: just save the base, tabs are per-config
          updatePendingMetadata(file.path, { part_number: base || null })
        } else if (tabEnabled && serializationSettings) {
          // Single-config with tab: combine base + existing tab
          const combined = combineBaseAndTab(base, tabNumber, serializationSettings)
          updatePendingMetadata(file.path, { part_number: combined || null })
        } else {
          // No tab: just the base
          updatePendingMetadata(file.path, { part_number: base || null })
        }
        
        addToast('success', `Generated: ${base}`)
      } else {
        addToast('error', 'Serialization disabled or failed')
      }
    } catch (err) {
      addToast('error', `Failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsGeneratingSerial(false)
    }
  }

  // Handle export
  const handleExport = async (format: 'step' | 'iges' | 'stl' | 'pdf' | 'dxf') => {
    if (!status.running) return

    setIsExporting(format)
    try {
      let result
      const configName = activeConfig?.name

      switch (format) {
        case 'pdf':
          result = await window.electronAPI?.solidworks?.exportPdf(file.path)
          break
        case 'step':
          result = await window.electronAPI?.solidworks?.exportStep(file.path, { 
            configurations: configName ? [configName] : undefined
          })
          break
        case 'iges':
          result = await window.electronAPI?.solidworks?.exportIges(file.path, {
            configurations: configName ? [configName] : undefined
          })
          break
        case 'stl':
          result = await window.electronAPI?.solidworks?.exportStl?.(file.path, {
            configurations: configName ? [configName] : undefined
          })
          break
        case 'dxf':
          result = await window.electronAPI?.solidworks?.exportDxf(file.path)
          break
      }

      if (result?.success) {
        addToast('success', `Exported to ${format.toUpperCase()}`)
      } else {
        addToast('error', result?.error || `Failed to export ${format.toUpperCase()}`)
      }
    } catch (err) {
      addToast('error', `Export failed: ${err}`)
    } finally {
      setIsExporting(null)
    }
  }

  // Get property value by key with aliases
  const getPropertyValue = useCallback((key: string, aliases?: string[]): string | null => {
    const props = activeConfig?.properties || {}
    if (props[key]) return props[key]
    if (aliases) {
      for (const alias of aliases) {
        if (props[alias]) return props[alias]
        const found = Object.entries(props).find(([k]) => k.toLowerCase() === alias.toLowerCase())
        if (found) return found[1]
      }
    }
    return null
  }, [activeConfig?.properties])

  // Filter and sort properties for display
  const displayProperties = Object.entries(activeConfig?.properties || {})
    .filter(([key, value]) => value && !key.startsWith('$') && !key.startsWith('SW-'))
    .sort(([a], [b]) => a.localeCompare(b))

  // Status indicator message
  const getStatusMessage = () => {
    if (!file.pdmData?.id) return 'Sync to cloud to edit'
    if (!isEditable) return 'Check out to edit'
    return null
  }

  return (
    <div className="sw-datacard-panel h-full flex flex-col gap-4">
      {/* Header: Workflow state */}
      {file.pdmData?.workflow_state && (
        <div className="flex-shrink-0">
          <span 
            className="px-2 py-0.5 rounded text-[10px] font-medium"
            style={{ 
              backgroundColor: file.pdmData.workflow_state.color + '20',
              color: file.pdmData.workflow_state.color
            }}
          >
            {file.pdmData.workflow_state.label || file.pdmData.workflow_state.name}
          </span>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left: Preview */}
        <div className="flex-shrink-0 flex flex-col gap-2" style={{ width: previewWidth }}>
          <div 
            className="flex-1 relative rounded-lg overflow-hidden bg-gradient-to-br from-slate-900/50 via-slate-800/50 to-slate-900/50"
            onWheel={handlePreviewWheel}
          >
            {/* Preview content */}
            <div className="absolute inset-0 flex items-center justify-center p-3">
              {previewLoading ? (
                <Loader2 className="animate-spin text-cyan-400" size={28} />
              ) : preview ? (
                <img 
                  src={preview} 
                  alt={file.name}
                  className="max-w-full max-h-full object-contain transition-transform duration-150"
                  style={{ 
                    transform: `scale(${previewZoom / 100})`,
                    filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.4))'
                  }}
                  draggable={false}
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-plm-fg-muted">
                  <SWFileIcon fileType={fileType} size={40} />
                  <span className="text-[10px]">No preview</span>
                </div>
              )}
            </div>
            
            {/* Zoom controls - bottom */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-full px-2 py-1">
              <button
                onClick={() => setPreviewZoom(prev => Math.max(50, prev - 25))}
                className="p-0.5 hover:text-cyan-400 text-plm-fg-muted transition-colors"
              >
                <ZoomOut size={12} />
              </button>
              <span className="text-[10px] text-plm-fg-muted w-8 text-center">{previewZoom}%</span>
              <button
                onClick={() => setPreviewZoom(prev => Math.min(300, prev + 25))}
                className="p-0.5 hover:text-cyan-400 text-plm-fg-muted transition-colors"
              >
                <ZoomIn size={12} />
              </button>
              <button
                onClick={() => setPreviewZoom(100)}
                className="p-0.5 hover:text-cyan-400 text-plm-fg-muted transition-colors border-l border-white/20 ml-1 pl-1"
              >
                <RotateCcw size={10} />
              </button>
            </div>
            
            {/* Refresh button - top right */}
            <button
              onClick={refreshPreview}
              disabled={previewLoading}
              className="absolute top-2 right-2 p-1 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded text-plm-fg-muted hover:text-white transition-all"
            >
              <RefreshCw size={12} className={previewLoading ? 'animate-spin' : ''} />
            </button>
          </div>
          
          {/* Preview actions */}
          <button
            onClick={handleOpenInEDrawings}
            className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs text-plm-fg-muted hover:text-cyan-400 bg-plm-bg border border-plm-border/50 hover:border-cyan-400/50 transition-colors"
          >
            <ExternalLink size={12} />
            Open in eDrawings
          </button>
        </div>

        {/* Resizable divider after preview */}
        <div className="px-1">
          <ResizableDivider onDrag={handlePreviewResize} />
        </div>

        {/* Configuration pane (between preview and properties) */}
        {configurations.length > 1 && (
          <>
          <div className="flex-shrink-0 flex flex-col bg-plm-bg-light/10 rounded-lg border border-plm-border/30 overflow-hidden" style={{ width: configWidth }}>
            <div className="px-2 py-1.5 border-b border-plm-border/30 bg-plm-bg-light/20">
              <span className="text-[10px] uppercase tracking-wider text-plm-fg-muted font-medium">
                Configurations ({configurations.length})
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-1">
              {configsLoading ? (
                <div className="flex items-center justify-center gap-2 text-plm-fg-muted text-xs py-4">
                  <Loader2 size={12} className="animate-spin" />
                </div>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {buildConfigTree(configurations).map((config) => (
                    <ConfigTreeItem
                      key={config.name}
                      config={config}
                      isSelected={configurations.findIndex(c => c.name === config.name) === activeConfigIndex}
                      onClick={() => setActiveConfigIndex(configurations.findIndex(c => c.name === config.name))}
                      depth={config.depth}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* Resizable divider after config pane */}
          <div className="px-1">
            <ResizableDivider onDrag={handleConfigResize} />
          </div>
          </>
        )}

        {/* Center: Properties */}
        <div className="flex-1 flex flex-col min-w-0 gap-3 max-w-md pl-2">
          {/* Editable PDM properties */}
          <div className="space-y-2.5 flex-shrink-0">
            {getStatusMessage() && (
              <div className="text-[10px] text-plm-fg-muted italic mb-2 text-center">
                {getStatusMessage()}
              </div>
            )}
            
            {tabEnabled ? (
              /* Inline Base # + Tab # layout for all SolidWorks files with tab enabled */
              <>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-plm-fg-muted w-20 flex-shrink-0 text-right">
                    Item #
                  </label>
                  <div className="flex-1 flex items-center gap-1">
                    <input
                      type="text"
                      value={baseNumber}
                      onChange={(e) => handleBaseNumberChange(e.target.value)}
                      placeholder="Base..."
                      disabled={!isEditable}
                      className={`
                        flex-1 px-2.5 py-1.5 text-sm rounded border transition-colors
                        ${isEditable 
                          ? 'bg-plm-bg border-plm-border/50 focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/20 text-plm-fg' 
                          : 'bg-plm-bg-light/30 border-transparent text-plm-fg-muted cursor-not-allowed'
                        }
                        placeholder:text-plm-fg-dim/50 placeholder:italic
                      `}
                    />
                    <span className="text-plm-fg-muted text-sm">{serializationSettings?.tab_separator || '-'}</span>
                    <input
                      type="text"
                      value={hasMultipleConfigs ? (configTabNumbers[activeConfig?.name || ''] || '') : tabNumber}
                      onChange={(e) => hasMultipleConfigs && activeConfig 
                        ? handleConfigTabChange(activeConfig.name, e.target.value)
                        : handleTabNumberChange(e.target.value)
                      }
                      onBlur={() => hasMultipleConfigs && activeConfig
                        ? handleConfigTabBlur(activeConfig.name)
                        : handleTabNumberBlur()
                      }
                      placeholder="Tab"
                      disabled={!isEditable}
                      className={`
                        w-16 px-2 py-1.5 text-sm rounded border transition-colors text-center
                        ${isEditable 
                          ? 'bg-plm-bg border-plm-border/50 focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/20 text-plm-fg' 
                          : 'bg-plm-bg-light/30 border-transparent text-plm-fg-muted cursor-not-allowed'
                        }
                        placeholder:text-plm-fg-dim/50 placeholder:italic
                      `}
                    />
                    {isEditable && (
                      <button
                        onClick={handleGenerateSerial}
                        disabled={isGeneratingSerial}
                        className="p-1.5 rounded border border-plm-border/50 hover:border-cyan-400/50 hover:bg-cyan-400/10 text-plm-fg-muted hover:text-cyan-400 transition-colors disabled:opacity-50"
                        title="Generate base number"
                      >
                        {isGeneratingSerial ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              /* Single Item # field when tab is disabled (single config) */
              <PropertyField
                label="Item #"
                value={baseNumber}
                onChange={handleBaseNumberChange}
                onGenerateSerial={handleGenerateSerial}
                isGenerating={isGeneratingSerial}
                placeholder="Enter or generate..."
                editable={!!isEditable}
              />
            )}
            
            {/* Description - per-config for multi-config parts/assemblies */}
            <PropertyField
              label="Description"
              value={hasMultipleConfigs ? (configDescriptions[activeConfig?.name || ''] || '') : description}
              onChange={(v) => hasMultipleConfigs && activeConfig 
                ? handleConfigDescriptionChange(activeConfig.name, v)
                : handleDescriptionChange(v)
              }
              placeholder="Enter description..."
              editable={!!isEditable}
            />
            
            <PropertyField
              label="Revision"
              value={revision}
              onChange={handleRevisionChange}
              placeholder="A"
              editable={!!isEditable}
            />
            
            {/* Save to File button - writes properties back to SW file */}
            {isEditable && status.running && (
              <div className="flex items-center gap-3 pt-2">
                <div className="w-20 flex-shrink-0" /> {/* Spacer to align with fields */}
                <button
                  onClick={handleSaveToFile}
                  disabled={isSavingToFile}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded bg-cyan-600 hover:bg-cyan-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Save properties to SolidWorks file"
                >
                  {isSavingToFile ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Save size={14} />
                  )}
                  Save to File
                </button>
              </div>
            )}
            
            {/* Material from SW properties (read-only) */}
            <div className="flex items-center gap-3">
              <label className="text-xs text-plm-fg-muted w-20 flex-shrink-0 text-right">Material</label>
              <span className={`text-sm ${getPropertyValue('Material', ['MATERIAL', 'Mat']) ? 'text-plm-fg' : 'text-plm-fg-dim italic'}`}>
                {getPropertyValue('Material', ['MATERIAL', 'Mat']) || '—'}
              </span>
            </div>
          </div>
          
          {/* All SolidWorks Properties - collapsible */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <button
              onClick={() => setShowAllProps(!showAllProps)}
              className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs text-plm-fg-muted hover:text-plm-fg hover:bg-plm-bg-light/30 transition-colors rounded"
            >
              {showAllProps ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span className="uppercase tracking-wider">SolidWorks Properties</span>
              <span className="text-plm-fg-dim">({displayProperties.length})</span>
            </button>
            
            {showAllProps && (
              <div className="px-2 py-2 space-y-1.5">
                {displayProperties.length > 0 ? (
                  displayProperties.map(([key, value]) => (
                    <PropertyDisplay key={key} label={key} value={value} />
                  ))
                ) : (
                  <div className="text-xs text-plm-fg-dim italic text-center py-3">
                    {status.running ? 'No custom properties found' : 'Start service to load properties'}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Export actions */}
        <div className="w-24 flex-shrink-0 flex flex-col gap-2 p-2 rounded-lg bg-plm-bg/20">
          <div className="text-[10px] uppercase tracking-wider text-plm-fg-muted">Export</div>
          
          {isPartOrAsm && (
            <>
              <ExportButton
                format="STEP"
                icon={<Package size={12} />}
                onClick={() => handleExport('step')}
                disabled={!!isExporting || !status.running}
                isExporting={isExporting === 'step'}
              />
              <ExportButton
                format="IGES"
                icon={<Package size={12} />}
                onClick={() => handleExport('iges')}
                disabled={!!isExporting || !status.running}
                isExporting={isExporting === 'iges'}
              />
              <ExportButton
                format="STL"
                icon={<Package size={12} />}
                onClick={() => handleExport('stl')}
                disabled={!!isExporting || !status.running}
                isExporting={isExporting === 'stl'}
              />
            </>
          )}
          
          {isDrawing && (
            <>
              <ExportButton
                format="PDF"
                icon={<FileOutput size={12} />}
                onClick={() => handleExport('pdf')}
                disabled={!!isExporting || !status.running}
                isExporting={isExporting === 'pdf'}
              />
              <ExportButton
                format="DXF"
                icon={<Download size={12} />}
                onClick={() => handleExport('dxf')}
                disabled={!!isExporting || !status.running}
                isExporting={isExporting === 'dxf'}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default SWDatacardPanel
