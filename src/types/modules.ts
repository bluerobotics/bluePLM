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
  // System
  | 'settings'

// Module group identifiers
export type ModuleGroupId =
  | 'file-vault'
  | 'developer'
  | 'change-management'
  | 'product-lifecycle'
  | 'supply-chain'
  | 'integrations'
  | 'system'

// Section divider configuration
export interface SectionDivider {
  id: string
  enabled: boolean
  // Position is the index in the module order where this divider appears AFTER
  // e.g., position 6 means the divider appears after the 7th module (index 6)
  position: number
}

// Custom group configuration (user-created organizational folders)
export interface CustomGroup {
  id: string
  name: string
  icon: string  // Lucide icon name
  iconColor: string | null  // Custom color or null for default
  // Position in the sidebar order (index in combined order)
  position: number
  enabled: boolean
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

// Parent can be a module ID or a custom group ID
export type ParentId = ModuleId | string | null

// User's module configuration (stored in pdmStore)
export interface ModuleConfig {
  enabledModules: Record<ModuleId, boolean>
  enabledGroups: Record<ModuleGroupId, boolean>
  moduleOrder: ModuleId[]  // Custom order of modules in sidebar
  dividers: SectionDivider[]
  // Custom parent-child relationships (overrides default parentId from ModuleDefinition)
  // Parent can be a ModuleId or a custom group ID (prefixed with "group-")
  moduleParents: Record<ModuleId, ParentId>
  // Custom icon colors per module (hex colors like "#ff0000" or null for default)
  moduleIconColors: Record<ModuleId, string | null>
  // User-created custom groups for organizing modules
  customGroups: CustomGroup[]
}

// Org's module defaults (stored in database)
export interface OrgModuleDefaults {
  enabledModules: Record<ModuleId, boolean>
  enabledGroups: Record<ModuleGroupId, boolean>
  moduleOrder: ModuleId[]
  dividers: SectionDivider[]
  moduleParents: Record<ModuleId, ParentId>
  moduleIconColors: Record<ModuleId, string | null>
  customGroups: CustomGroup[]
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
  {
    id: 'system',
    name: 'System',
    description: 'Core application settings',
    isMasterToggle: false,  // Cannot disable system modules
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
  // System
  {
    id: 'settings',
    name: 'Settings',
    group: 'system',
    icon: 'Settings',
    defaultEnabled: true,
    required: true,  // Cannot be disabled
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
  // Tools
  'terminal',
  // System (always at bottom by default, but can be moved)
  'settings',
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
    customGroups: [],
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
  _config: ModuleConfig
): boolean {
  const module = MODULES.find(m => m.id === moduleId)
  if (!module) return false
  
  // Required modules can never be toggled
  if (module.required) {
    return false
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

// Get child modules of a parent (module or custom group)
export function getChildModules(parentId: string, config?: ModuleConfig): ModuleDefinition[] {
  if (config) {
    return MODULES.filter(m => config.moduleParents[m.id] === parentId)
  }
  return MODULES.filter(m => m.parentId === parentId)
}

// Check if a module or group has children
export function hasChildModules(parentId: string, config?: ModuleConfig): boolean {
  if (config) {
    return MODULES.some(m => config.moduleParents[m.id] === parentId)
  }
  return MODULES.some(m => m.parentId === parentId)
}

// Get only top-level modules (no parent, using config's moduleParents if provided)
export function getTopLevelModules(config?: ModuleConfig): ModuleDefinition[] {
  if (config) {
    return MODULES.filter(m => !config.moduleParents[m.id])
  }
  return MODULES.filter(m => !m.parentId)
}

// Get the parent of a module (using config's moduleParents)
export function getModuleParent(moduleId: ModuleId, config: ModuleConfig): ParentId {
  return config.moduleParents[moduleId] || null
}

// Check if an ID is a custom group ID
export function isCustomGroupId(id: string): boolean {
  return id.startsWith('group-')
}

// Get a custom group by ID
export function getCustomGroup(groupId: string, config: ModuleConfig): CustomGroup | undefined {
  return config.customGroups.find(g => g.id === groupId)
}

// Get visible custom groups (enabled and in order)
export function getVisibleCustomGroups(config: ModuleConfig): CustomGroup[] {
  return config.customGroups
    .filter(g => g.enabled)
    .sort((a, b) => a.position - b.position)
}

// Type for combined order list items
export type OrderListItem = 
  | { type: 'module'; id: ModuleId }
  | { type: 'divider'; id: string }
  | { type: 'group'; id: string }

// Build a combined order list with modules, dividers, and groups interleaved
export function buildCombinedOrderList(
  moduleOrder: ModuleId[],
  dividers: SectionDivider[],
  customGroups: CustomGroup[] = []
): OrderListItem[] {
  const result: OrderListItem[] = []
  const sortedDividers = [...dividers].sort((a, b) => a.position - b.position)
  const sortedGroups = [...customGroups].sort((a, b) => a.position - b.position)
  
  let dividerIdx = 0
  let groupIdx = 0
  
  for (let i = 0; i < moduleOrder.length; i++) {
    // Add any groups that come before this position
    while (groupIdx < sortedGroups.length && sortedGroups[groupIdx].position === i) {
      result.push({ type: 'group', id: sortedGroups[groupIdx].id })
      groupIdx++
    }
    
    result.push({ type: 'module', id: moduleOrder[i] })
    
    // Add any dividers that come after this position
    while (dividerIdx < sortedDividers.length && sortedDividers[dividerIdx].position === i) {
      result.push({ type: 'divider', id: sortedDividers[dividerIdx].id })
      dividerIdx++
    }
  }
  
  // Add any remaining groups at the end
  while (groupIdx < sortedGroups.length) {
    result.push({ type: 'group', id: sortedGroups[groupIdx].id })
    groupIdx++
  }
  
  // Add any remaining dividers at the end
  while (dividerIdx < sortedDividers.length) {
    result.push({ type: 'divider', id: sortedDividers[dividerIdx].id })
    dividerIdx++
  }
  
  return result
}

// Extract module order, divider positions, and group positions from a combined list
export function extractFromCombinedList(
  combinedList: OrderListItem[],
  existingDividers: SectionDivider[],
  existingGroups: CustomGroup[] = []
): { moduleOrder: ModuleId[]; dividers: SectionDivider[]; customGroups: CustomGroup[] } {
  const moduleOrder: ModuleId[] = []
  const dividers: SectionDivider[] = []
  const customGroups: CustomGroup[] = []
  
  let moduleIndex = -1
  for (const item of combinedList) {
    if (item.type === 'module') {
      moduleIndex++
      moduleOrder.push(item.id)
    } else if (item.type === 'divider') {
      // Find existing divider to preserve enabled state
      const existing = existingDividers.find(d => d.id === item.id)
      dividers.push({
        id: item.id,
        enabled: existing?.enabled ?? true,
        position: moduleIndex  // Position is after the last module
      })
    } else if (item.type === 'group') {
      // Find existing group to preserve all properties
      const existing = existingGroups.find(g => g.id === item.id)
      if (existing) {
        customGroups.push({
          ...existing,
          position: moduleIndex + 1  // Position before next module
        })
      }
    }
  }
  
  return { moduleOrder, dividers, customGroups }
}

