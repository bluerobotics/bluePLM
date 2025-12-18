// Module system type definitions

// All available sidebar modules
export type ModuleId =
  // File Vault (PDM)
  | 'explorer'
  | 'pending'
  | 'search'
  | 'workflows'
  | 'history'
  | 'trash'
  // Developer Tools
  | 'terminal'
  // Change Management (PLM)
  | 'eco'
  | 'ecr'
  | 'gsd'
  | 'reviews'
  | 'deviations'
  // Product Lifecycle (PLM)
  | 'products'
  | 'process'
  | 'schedule'
  // Supply Chain
  | 'suppliers'
  | 'supplier-portal'
  // Integrations
  | 'google-drive'

// Module group identifiers
export type ModuleGroupId =
  | 'file-vault'
  | 'developer'
  | 'change-management'
  | 'product-lifecycle'
  | 'supply-chain'
  | 'integrations'

// Section divider configuration
export interface SectionDivider {
  id: string
  enabled: boolean
  // Position is the index in the module order where this divider appears AFTER
  // e.g., position 6 means the divider appears after the 7th module (index 6)
  position: number
}

// Individual module definition
export interface ModuleDefinition {
  id: ModuleId
  name: string
  group: ModuleGroupId
  icon: string  // Lucide icon name
  defaultEnabled: boolean
  // If true, this module cannot be disabled when its group is enabled
  required?: boolean
  // Module IDs that must be enabled for this module to work
  dependencies?: ModuleId[]
  // Parent module ID - if set, this module appears in a submenu when parent is hovered
  parentId?: ModuleId
}

// Module group definition
export interface ModuleGroupDefinition {
  id: ModuleGroupId
  name: string
  description: string
  // If true, disabling this group disables all modules in it
  isMasterToggle: boolean
  defaultEnabled: boolean
}

// User's module configuration (stored in pdmStore)
export interface ModuleConfig {
  enabledModules: Record<ModuleId, boolean>
  enabledGroups: Record<ModuleGroupId, boolean>
  moduleOrder: ModuleId[]  // Custom order of modules in sidebar
  dividers: SectionDivider[]
  // Custom parent-child relationships (overrides default parentId from ModuleDefinition)
  moduleParents: Record<ModuleId, ModuleId | null>
  // Custom icon colors per module (hex colors like "#ff0000" or null for default)
  moduleIconColors: Record<ModuleId, string | null>
}

// Org's module defaults (stored in database)
export interface OrgModuleDefaults {
  enabledModules: Record<ModuleId, boolean>
  enabledGroups: Record<ModuleGroupId, boolean>
  moduleOrder: ModuleId[]
  dividers: SectionDivider[]
  moduleParents: Record<ModuleId, ModuleId | null>
  moduleIconColors: Record<ModuleId, string | null>
}

// ============================================
// DEFAULT CONFIGURATION
// ============================================

export const MODULE_GROUPS: ModuleGroupDefinition[] = [
  {
    id: 'file-vault',
    name: 'File Vault',
    description: 'Core PDM file management features',
    isMasterToggle: true,
    defaultEnabled: true,
  },
  {
    id: 'developer',
    name: 'Developer Tools',
    description: 'Command line and developer utilities',
    isMasterToggle: true,
    defaultEnabled: true,
  },
  {
    id: 'change-management',
    name: 'Change Management',
    description: 'Engineering changes, issues, and approvals',
    isMasterToggle: true,
    defaultEnabled: true,
  },
  {
    id: 'product-lifecycle',
    name: 'Product Lifecycle',
    description: 'Product planning and process management',
    isMasterToggle: true,
    defaultEnabled: true,
  },
  {
    id: 'supply-chain',
    name: 'Supply Chain',
    description: 'Supplier management and portal',
    isMasterToggle: true,
    defaultEnabled: true,
  },
  {
    id: 'integrations',
    name: 'Integrations',
    description: 'External service connections',
    isMasterToggle: true,
    defaultEnabled: true,
  },
]

export const MODULES: ModuleDefinition[] = [
  // File Vault (PDM)
  {
    id: 'explorer',
    name: 'Explorer',
    group: 'file-vault',
    icon: 'FolderTree',
    defaultEnabled: true,
  },
  {
    id: 'pending',
    name: 'Pending Changes',
    group: 'file-vault',
    icon: 'ArrowDownUp',
    defaultEnabled: true,
    dependencies: ['explorer'],
  },
  {
    id: 'search',
    name: 'Search',
    group: 'file-vault',
    icon: 'Search',
    defaultEnabled: true,
    dependencies: ['explorer'],
  },
  {
    id: 'workflows',
    name: 'File Workflows',
    group: 'file-vault',
    icon: 'GitBranch',
    defaultEnabled: true,
    dependencies: ['explorer'],
  },
  {
    id: 'history',
    name: 'History',
    group: 'file-vault',
    icon: 'History',
    defaultEnabled: true,
    dependencies: ['explorer'],
  },
  {
    id: 'trash',
    name: 'Trash',
    group: 'file-vault',
    icon: 'Trash2',
    defaultEnabled: true,
    dependencies: ['explorer'],
  },
  // Developer Tools
  {
    id: 'terminal',
    name: 'Terminal',
    group: 'developer',
    icon: 'Terminal',
    defaultEnabled: false,  // Off by default
  },
  // Change Management (PLM)
  {
    id: 'eco',
    name: 'ECOs',
    group: 'change-management',
    icon: 'ClipboardList',
    defaultEnabled: true,
  },
  {
    id: 'gsd',
    name: 'GSD Summary',
    group: 'change-management',
    icon: 'Telescope',
    defaultEnabled: true,
  },
  {
    id: 'ecr',
    name: 'ECR / Issues',
    group: 'change-management',
    icon: 'AlertCircle',
    defaultEnabled: true,
  },
  {
    id: 'reviews',
    name: 'Reviews',
    group: 'change-management',
    icon: 'ClipboardCheck',
    defaultEnabled: true,
  },
  {
    id: 'deviations',
    name: 'Deviations',
    group: 'change-management',
    icon: 'FileWarning',
    defaultEnabled: true,
  },
  // Product Lifecycle (PLM)
  {
    id: 'products',
    name: 'Products',
    group: 'product-lifecycle',
    icon: 'Package',
    defaultEnabled: true,
  },
  {
    id: 'process',
    name: 'Process Editor',
    group: 'product-lifecycle',
    icon: 'Network',
    defaultEnabled: true,
  },
  {
    id: 'schedule',
    name: 'Schedule',
    group: 'product-lifecycle',
    icon: 'Calendar',
    defaultEnabled: true,
  },
  // Supply Chain
  {
    id: 'suppliers',
    name: 'Suppliers',
    group: 'supply-chain',
    icon: 'Building2',
    defaultEnabled: true,
  },
  {
    id: 'supplier-portal',
    name: 'Supplier Portal',
    group: 'supply-chain',
    icon: 'Globe',
    defaultEnabled: true,
  },
  // Integrations
  {
    id: 'google-drive',
    name: 'Google Drive',
    group: 'integrations',
    icon: 'GoogleDrive',  // Custom icon
    defaultEnabled: false,  // Off by default
  },
]

// Default section dividers (matches current ActivityBar layout)
// Position is the index after which the divider appears (0-indexed)
export const DEFAULT_DIVIDERS: SectionDivider[] = [
  { id: 'divider-1', enabled: true, position: 5 },  // After trash (index 5) - between PDM and PLM
]

// Default module order (matches current ActivityBar layout)
export const DEFAULT_MODULE_ORDER: ModuleId[] = [
  // File Vault (PDM core)
  'explorer',
  'pending',
  'search',
  'workflows',
  'history',
  'trash',
  // ECOs group (all indented)
  'gsd',        // indented
  'eco',        // indented (eco history)
  'reviews',    // indented
  'deviations', // indented
  'process',    // indented
  'schedule',   // indented
  // Standalone
  'google-drive',
  'products',
  'ecr',
  // Suppliers
  'suppliers',
  'supplier-portal',  // indented
  // Tools (above Settings)
  'terminal',
]

// Helper to get default enabled modules
export function getDefaultEnabledModules(): Record<ModuleId, boolean> {
  const result: Record<string, boolean> = {}
  for (const mod of MODULES) {
    result[mod.id] = mod.defaultEnabled
  }
  return result as Record<ModuleId, boolean>
}

// Helper to get default enabled groups
export function getDefaultEnabledGroups(): Record<ModuleGroupId, boolean> {
  const result: Record<string, boolean> = {}
  for (const group of MODULE_GROUPS) {
    result[group.id] = group.defaultEnabled
  }
  return result as Record<ModuleGroupId, boolean>
}

// Helper to get default module parents from module definitions
export function getDefaultModuleParents(): Record<ModuleId, ModuleId | null> {
  const result: Record<string, ModuleId | null> = {}
  for (const mod of MODULES) {
    result[mod.id] = mod.parentId || null
  }
  return result as Record<ModuleId, ModuleId | null>
}

// Helper to get default icon colors (all null = use theme default)
export function getDefaultModuleIconColors(): Record<ModuleId, string | null> {
  const result: Record<string, string | null> = {}
  for (const mod of MODULES) {
    result[mod.id] = null
  }
  return result as Record<ModuleId, string | null>
}

// Helper to get default module config
export function getDefaultModuleConfig(): ModuleConfig {
  return {
    enabledModules: getDefaultEnabledModules(),
    enabledGroups: getDefaultEnabledGroups(),
    moduleOrder: [...DEFAULT_MODULE_ORDER],
    dividers: [...DEFAULT_DIVIDERS],
    moduleParents: getDefaultModuleParents(),
    moduleIconColors: getDefaultModuleIconColors(),
  }
}

// Helper to check if a module should be visible
export function isModuleVisible(
  moduleId: ModuleId,
  config: ModuleConfig
): boolean {
  const module = MODULES.find(m => m.id === moduleId)
  if (!module) return false
  
  // Check if group is enabled (for master toggle groups)
  const group = MODULE_GROUPS.find(g => g.id === module.group)
  if (group?.isMasterToggle && !config.enabledGroups[module.group]) {
    return false
  }
  
  // Check if module itself is enabled
  if (!config.enabledModules[moduleId]) {
    return false
  }
  
  // Check dependencies
  if (module.dependencies) {
    for (const dep of module.dependencies) {
      if (!config.enabledModules[dep]) {
        return false
      }
    }
  }
  
  return true
}

// Helper to check if a module can be toggled (not required)
export function canToggleModule(
  moduleId: ModuleId,
  config: ModuleConfig
): boolean {
  const module = MODULES.find(m => m.id === moduleId)
  if (!module) return false
  
  // Required modules can't be toggled when their group is enabled
  if (module.required) {
    const group = MODULE_GROUPS.find(g => g.id === module.group)
    if (group?.isMasterToggle && config.enabledGroups[module.group]) {
      return false
    }
  }
  
  return true
}

// Get modules for a specific group
export function getModulesForGroup(groupId: ModuleGroupId): ModuleDefinition[] {
  return MODULES.filter(m => m.group === groupId)
}

// Get a module definition by ID
export function getModuleById(moduleId: ModuleId): ModuleDefinition | undefined {
  return MODULES.find(m => m.id === moduleId)
}

// Get a group definition by ID
export function getGroupById(groupId: ModuleGroupId): ModuleGroupDefinition | undefined {
  return MODULE_GROUPS.find(g => g.id === groupId)
}

// Get child modules of a parent module (using config's moduleParents if provided)
export function getChildModules(parentId: ModuleId, config?: ModuleConfig): ModuleDefinition[] {
  if (config) {
    return MODULES.filter(m => config.moduleParents[m.id] === parentId)
  }
  return MODULES.filter(m => m.parentId === parentId)
}

// Check if a module has children (using config's moduleParents if provided)
export function hasChildModules(moduleId: ModuleId, config?: ModuleConfig): boolean {
  if (config) {
    return MODULES.some(m => config.moduleParents[m.id] === moduleId)
  }
  return MODULES.some(m => m.parentId === moduleId)
}

// Get only top-level modules (no parent, using config's moduleParents if provided)
export function getTopLevelModules(config?: ModuleConfig): ModuleDefinition[] {
  if (config) {
    return MODULES.filter(m => !config.moduleParents[m.id])
  }
  return MODULES.filter(m => !m.parentId)
}

// Get the parent of a module (using config's moduleParents)
export function getModuleParent(moduleId: ModuleId, config: ModuleConfig): ModuleId | null {
  return config.moduleParents[moduleId] || null
}

// Type for combined order list items
export type OrderListItem = 
  | { type: 'module'; id: ModuleId }
  | { type: 'divider'; id: string }

// Build a combined order list with modules and dividers interleaved
export function buildCombinedOrderList(
  moduleOrder: ModuleId[],
  dividers: SectionDivider[]
): OrderListItem[] {
  const result: OrderListItem[] = []
  const sortedDividers = [...dividers].sort((a, b) => a.position - b.position)
  
  let dividerIdx = 0
  for (let i = 0; i < moduleOrder.length; i++) {
    result.push({ type: 'module', id: moduleOrder[i] })
    
    // Add any dividers that come after this position
    while (dividerIdx < sortedDividers.length && sortedDividers[dividerIdx].position === i) {
      result.push({ type: 'divider', id: sortedDividers[dividerIdx].id })
      dividerIdx++
    }
  }
  
  // Add any remaining dividers at the end
  while (dividerIdx < sortedDividers.length) {
    result.push({ type: 'divider', id: sortedDividers[dividerIdx].id })
    dividerIdx++
  }
  
  return result
}

// Extract module order and divider positions from a combined list
export function extractFromCombinedList(
  combinedList: OrderListItem[],
  existingDividers: SectionDivider[]
): { moduleOrder: ModuleId[]; dividers: SectionDivider[] } {
  const moduleOrder: ModuleId[] = []
  const dividers: SectionDivider[] = []
  
  let moduleIndex = -1
  for (const item of combinedList) {
    if (item.type === 'module') {
      moduleIndex++
      moduleOrder.push(item.id)
    } else {
      // Find existing divider to preserve enabled state
      const existing = existingDividers.find(d => d.id === item.id)
      dividers.push({
        id: item.id,
        enabled: existing?.enabled ?? true,
        position: moduleIndex  // Position is after the last module
      })
    }
  }
  
  return { moduleOrder, dividers }
}

