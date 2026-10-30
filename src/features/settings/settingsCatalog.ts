import {
  Box,
  Braces,
  Building2,
  ClipboardList,
  Cloud,
  Columns3,
  DatabaseBackup,
  Factory,
  FileOutput,
  Gauge,
  GitBranch,
  HardDrive,
  Hash,
  Info,
  Keyboard,
  KeyRound,
  LifeBuoy,
  MonitorSmartphone,
  Palette,
  PanelLeft,
  Plug,
  Puzzle,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Tags,
  User,
  Users,
  Webhook,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

import type { SettingsTab } from '@/types/settings'
import { SHORTCUT_ACTIONS } from '@/lib/keybindings/registry'
import { shortcutsStrings } from '@/lib/i18n/locales/shortcuts'

/**
 * How a page body is laid out in the settings modal: `default` is a readable column for forms,
 * `wide` uses the full width for tables and editors, `full` also drops the page scroller (the
 * page scrolls itself, like the log viewer).
 */
export type SettingsPageLayout = 'default' | 'wide' | 'full'

export interface SettingsNavigationItem {
  id: SettingsTab
  label: string
  icon: LucideIcon
  /** One sentence under the page title saying what the page is for. */
  description: string
  layout?: SettingsPageLayout
  /** Drawn in the error colour in the navigation (destructive pages). */
  danger?: boolean
  /** Hidden from the navigation for everyone but an admin. The panel gates itself as well. */
  adminOnly?: boolean
  /**
   * Needs the desktop app (the local machine, Electron, SOLIDWORKS). Hidden on BluePLM Web,
   * where `hasDesktop()` is false.
   */
  desktopOnly?: boolean
  /** Extra words the settings search should match this tab by. */
  keywords?: readonly string[]
}

export interface SettingsSection {
  category: string
  items: SettingsNavigationItem[]
}

// A function rather than a constant because the labels are translated at render time, and the
// language can change without the module being re-evaluated.
export const settingsSections = (): SettingsSection[] => [
  {
    category: 'Account',
    items: [
      {
        id: 'profile',
        label: 'Profile',
        icon: User,
        description: 'Your name, avatar and what you have been working on.',
        keywords: ['account', 'user'],
      },
      {
        id: 'appearance',
        label: 'Appearance',
        icon: Palette,
        description: 'Theme, language and how the interface is laid out.',
        keywords: ['theme', 'dark mode', 'language', 'tabs', 'look'],
      },
      {
        id: 'preferences',
        label: 'General',
        icon: SlidersHorizontal,
        description: 'Syncing, file handling, updates and privacy.',
        desktopOnly: true,
        keywords: ['preferences', 'options', 'sync', 'updates'],
      },
      {
        id: 'sessions',
        label: 'Devices',
        icon: MonitorSmartphone,
        description: 'The devices where you are signed in.',
        keywords: ['sessions', 'sign out', 'logout', 'machines'],
      },
      {
        id: 'keybindings',
        label: 'Keyboard shortcuts',
        icon: Keyboard,
        description: 'Keys for moving around and acting on files.',
        keywords: ['keybindings', 'shortcuts', 'hotkeys', 'keyboard'],
      },
      {
        id: 'modules',
        label: 'Sidebar',
        icon: PanelLeft,
        description: 'Which modules appear in the activity bar, and in what order.',
        keywords: ['modules', 'navigation', 'menu', 'activity bar'],
      },
    ],
  },
  {
    category: 'Organization',
    items: [
      {
        id: 'company-profile',
        label: 'Company',
        icon: Building2,
        description: 'Your company name, logo, addresses and contact details.',
        keywords: ['organization', 'logo', 'company profile'],
      },
      {
        id: 'team-members',
        label: 'Members and teams',
        icon: Users,
        description: 'People in your organization, their teams and their permissions.',
        layout: 'wide',
        keywords: ['users', 'people', 'invite'],
      },
      {
        id: 'module-access',
        label: 'Module access',
        icon: ShieldCheck,
        description: 'Which modules each team can open.',
        layout: 'wide',
        keywords: ['permissions', 'roles'],
      },
      {
        id: 'auth-providers',
        label: 'Sign-in methods',
        icon: KeyRound,
        description: 'How people in your organization sign in.',
        keywords: ['login', 'sso', 'auth'],
      },
      {
        id: 'security-monitoring',
        label: 'Security monitoring',
        icon: ShieldAlert,
        description: 'Alerts when deletions, sign-ins, joins or backups look unusual.',
        keywords: ['security', 'alerts', 'audit', 'backup alerts'],
      },
      {
        id: 'recovery-codes',
        label: 'Recovery codes',
        icon: LifeBuoy,
        description: 'Codes that restore admin access if every admin is locked out.',
        keywords: ['admin recovery'],
      },
      {
        id: 'backup',
        label: 'Backups',
        icon: DatabaseBackup,
        description: 'Scheduled backups of your vaults and database.',
        desktopOnly: true,
        keywords: ['restore', 'snapshot'],
      },
    ],
  },
  {
    category: 'Files and data',
    items: [
      {
        id: 'vaults',
        label: 'Vaults',
        icon: HardDrive,
        description: 'Create vaults, connect them on this computer and choose who can see them.',
        layout: 'wide',
        keywords: ['folders', 'storage'],
      },
      {
        id: 'metadata-columns',
        label: 'File metadata',
        icon: Columns3,
        description: 'The properties BluePLM tracks for files and shows as columns.',
        layout: 'wide',
        keywords: ['columns', 'properties'],
      },
      {
        id: 'file-workflows',
        label: 'File workflows',
        icon: GitBranch,
        description: 'Whether files move through workflow states, and how review stages behave.',
        keywords: ['workflow', 'review stage', 'approval'],
      },
      {
        id: 'item-designations',
        label: 'Item designations',
        icon: Tags,
        description: 'The kinds of item your part numbers describe.',
        keywords: ['part types'],
      },
      {
        id: 'serialization',
        label: 'Serialization',
        icon: Hash,
        description: 'How part and serial numbers are generated.',
        keywords: ['serial numbers', 'numbering'],
      },
      {
        id: 'export',
        label: 'Export',
        icon: FileOutput,
        description: 'File names and options for PDF, STEP, DXF and other exports.',
        keywords: ['pdf', 'step', 'dxf', 'export options'],
      },
      {
        id: 'rfq',
        label: 'RFQ',
        icon: ClipboardList,
        description: 'What goes on the requests for quote you send to suppliers.',
        keywords: ['quote', 'request for quote', 'rfq settings'],
      },
    ],
  },
  {
    category: 'Integrations',
    items: [
      {
        id: 'solidworks',
        label: 'SOLIDWORKS',
        icon: Box,
        description: 'The SOLIDWORKS service, licences and file metadata on this computer.',
        layout: 'wide',
        desktopOnly: true,
        keywords: ['cad', 'sw', 'solidworks'],
      },
      {
        id: 'google-drive',
        label: 'Google Drive',
        icon: Cloud,
        description: 'Connect Google Drive to browse and open Drive files in BluePLM.',
        keywords: ['gdrive'],
      },
      {
        id: 'odoo',
        label: 'Odoo ERP',
        icon: Factory,
        description: 'Sync suppliers and items with Odoo.',
        keywords: ['erp'],
      },
      {
        id: 'api',
        label: 'REST API',
        icon: Braces,
        description: 'The BluePLM API server and its access tokens.',
        keywords: ['tokens', 'api keys'],
      },
      {
        id: 'webhooks',
        label: 'Webhooks',
        icon: Webhook,
        description: 'Send events to other services when things change in BluePLM.',
        keywords: ['events', 'notifications'],
      },
      {
        id: 'extensions',
        label: 'Extensions',
        icon: Puzzle,
        description: 'Extensions installed for your organization.',
        layout: 'wide',
        desktopOnly: true,
        keywords: ['plugins', 'install', 'bpx', 'organization'],
      },
    ],
  },
  {
    category: 'This computer',
    items: [
      {
        id: 'supabase',
        label: 'Connection',
        icon: Plug,
        description: 'The BluePLM server this app is connected to.',
        desktopOnly: true,
        keywords: ['supabase', 'database', 'backend', 'server'],
      },
      {
        id: 'performance',
        label: 'Performance',
        icon: Gauge,
        description: 'Memory, CPU and how hard BluePLM works in the background.',
        desktopOnly: true,
        keywords: ['speed', 'memory', 'cpu'],
      },
      {
        id: 'logs',
        label: 'Logs',
        icon: ScrollText,
        description: 'What BluePLM has been doing, for troubleshooting.',
        layout: 'full',
        desktopOnly: true,
        keywords: ['debug', 'errors'],
      },
      {
        id: 'dev-tools',
        label: 'Developer',
        icon: Wrench,
        description: 'Tools for diagnosing problems and testing BluePLM.',
        desktopOnly: true,
        keywords: ['developer', 'debug', 'dev tools'],
      },
      {
        id: 'about',
        label: 'About',
        icon: Info,
        description: 'Version, updates and licences.',
        desktopOnly: true,
        keywords: ['version', 'update', 'license'],
      },
    ],
  },
]

/** The navigation entry for `tab`, or undefined for a tab the navigation does not list. */
export function findSettingsItem(tab: SettingsTab): SettingsNavigationItem | undefined {
  for (const section of settingsSections()) {
    const item = section.items.find((i) => i.id === tab)
    if (item) return item
  }
  return undefined
}

export interface SettingsCatalogEntry {
  /** The setting's label as rendered in English, so its panel can be scrolled to it. */
  label: string
  keywords?: readonly string[]
  /** The panel renders this setting only in the desktop app; search leaves it out on the web. */
  desktopOnly?: boolean
}

export type SettingsCatalog = Partial<Record<SettingsTab, readonly SettingsCatalogEntry[]>>

/**
 * The Keyboard shortcuts page's entries: its controls, then every registry action under the
 * English name the page shows (`shortcuts.action.*`), so search scrolls to the row.
 */
function shortcutCatalogEntries(): SettingsCatalogEntry[] {
  const page: SettingsCatalogEntry[] = [
    { label: shortcutsStrings.title, keywords: ['hotkeys', 'keys', 'shortcuts', 'bindings', 'keybindings'] },
    { label: shortcutsStrings.searchByKeys, keywords: ['record', 'press keys', 'what is bound'] },
    { label: shortcutsStrings.modifiedOnly, keywords: ['changed', 'custom'] },
    { label: shortcutsStrings.resetAll, keywords: ['reset', 'restore', 'defaults'] },
    { label: shortcutsStrings.import, keywords: ['import shortcuts', 'json'] },
    { label: shortcutsStrings.export, keywords: ['export shortcuts', 'json', 'backup'] },
    {
      label: 'Quick export folder',
      keywords: ['export location', 'default folder', 'output folder'],
      desktopOnly: true,
    },
  ]
  const actionLabels: Record<string, string> = shortcutsStrings.action
  const seen = new Set(page.map((entry) => entry.label))
  for (const action of SHORTCUT_ACTIONS) {
    const label = actionLabels[action.id]
    if (!label || seen.has(label)) continue
    seen.add(label)
    pushActionEntry(page, label, action.defaults, action.desktopOnly)
  }
  return page
}

function pushActionEntry(
  into: SettingsCatalogEntry[],
  label: string,
  defaults: readonly string[],
  desktopOnly: boolean | undefined,
): void {
  // The default keys as typed words ("ctrl k", "f5") find the action too.
  const keywords = defaults.map((combo) => combo.replace(/Mod/g, 'ctrl').replace(/\+/g, ' ').toLowerCase())
  into.push(desktopOnly ? { label, keywords, desktopOnly } : { label, keywords })
}

/**
 * The individual settings inside each tab, for the settings search. Keep a label in step with
 * its panel when the panel's text changes: a stale label still finds the tab, but the search
 * can no longer scroll to the setting.
 */
export const settingsCatalog: SettingsCatalog = {
  profile: [
    { label: 'Contribution History', keywords: ['activity', 'stats', 'contributions'] },
    { label: 'Recent Activity', keywords: ['history', 'log'] },
    { label: 'My ECOs', keywords: ['eco', 'engineering change', 'changes'] },
    { label: 'My RFQs', keywords: ['rfq', 'quotes', 'purchasing'] },
    { label: 'Emergency Admin Recovery', keywords: ['recovery', 'admin', 'lockout'] },
    { label: 'Recovery Code', keywords: ['code', 'admin access'] },
    { label: 'Delete account', keywords: ['remove', 'close account', 'delete my account'] },
  ],
  appearance: [
    { label: 'Theme', keywords: ['dark mode', 'colors', 'appearance'] },
    { label: 'Dark', keywords: ['theme', 'dark mode'] },
    { label: 'Deep Blue', keywords: ['theme'] },
    { label: 'Light', keywords: ['theme', 'light mode'] },
    { label: 'System', keywords: ['theme', 'os theme'] },
    { label: 'Display Language', keywords: ['language', 'locale', 'translation', 'i18n'] },
    { label: 'Browser-like Tabs', keywords: ['tabs', 'multiple views', 'interface'] },
  ],
  preferences: [
    { label: 'Application Updates', keywords: ['update', 'version', 'upgrade'], desktopOnly: true },
    { label: 'Check for Updates', keywords: ['update', 'upgrade'], desktopOnly: true },
    { label: 'Sync Settings', keywords: ['download', 'sync'], desktopOnly: true },
    { label: 'Auto-download cloud files', keywords: ['sync', 'download'], desktopOnly: true },
    { label: 'Auto-download file updates', keywords: ['sync', 'download', 'newer versions'], desktopOnly: true },
    { label: 'Skip large files', keywords: ['size limit', 'max size'], desktopOnly: true },
    { label: 'Excluded files', keywords: ['exclude', 'skip list'], desktopOnly: true },
    { label: 'Privacy', keywords: ['analytics', 'telemetry'], desktopOnly: true },
    { label: 'Usage Statistics', keywords: ['analytics', 'telemetry', 'error reports', 'crash'], desktopOnly: true },
    { label: 'Lowercase Extensions on Upload', keywords: ['lowercase', 'extension', 'case'], desktopOnly: true },
    {
      label: 'Ignore Patterns (Keep Local Only)',
      keywords: ['ignore', 'gitignore', 'exclude', 'local only'],
      desktopOnly: true,
    },
  ],
  sessions: [
    { label: 'Signed-in devices', keywords: ['sessions', 'devices', 'machines'] },
    { label: 'Sign out', keywords: ['logout', 'sign out this device'] },
  ],
  keybindings: shortcutCatalogEntries(),
  modules: [
    { label: 'Modules', keywords: ['features', 'enable', 'disable'] },
    { label: 'Sidebar Order', keywords: ['reorder', 'arrange'] },
    { label: 'Add Group', keywords: ['group', 'folder'] },
    { label: 'Add Divider', keywords: ['separator'] },
    { label: 'Extension modules', keywords: ['extensions', 'plugins'] },
    { label: 'Load Defaults', keywords: ['org defaults'] },
    { label: 'Reset', keywords: ['factory defaults'] },
    { label: 'Teams with Custom Module Defaults', keywords: ['teams', 'defaults'] },
    { label: 'Push to All Users', keywords: ['push', 'override', 'everyone'] },
  ],
  vaults: [
    { label: 'Add Vault', keywords: ['create vault', 'new vault'] },
    { label: 'Connect', keywords: ['link', 'local folder'] },
    { label: 'Disconnect', keywords: ['unlink'] },
    { label: 'Wipe Local', keywords: ['clear', 'remove local files'] },
    { label: 'Auto-Download Settings', keywords: ['sync', 'download'] },
    { label: 'Auto-download cloud files', keywords: ['sync', 'download'] },
    { label: 'Auto-download file updates', keywords: ['sync', 'newer versions'] },
    { label: 'Skip large files', keywords: ['size limit'] },
    { label: 'Auto-discard orphaned files', keywords: ['orphan', 'cleanup', 'deleted on server'] },
    { label: 'Re-align with Server', keywords: ['realign', 'alignment', 'repair', 'sync'] },
    { label: 'Check Alignment', keywords: ['realign', 'verify'] },
    { label: 'Upload Warnings', keywords: ['warning', 'upload'] },
    { label: 'Warn on large file uploads', keywords: ['size', 'threshold', 'warning'] },
  ],
  'team-members': [
    { label: 'Members', keywords: ['users', 'people', 'team'] },
    { label: 'Add User', keywords: ['invite', 'new user'] },
    { label: 'Add Team', keywords: ['create team', 'group'] },
    { label: 'Add Role', keywords: ['workflow role'] },
    { label: 'Add Title', keywords: ['job title'] },
    { label: 'Organization Code', keywords: ['invite code', 'join', 'share'] },
    { label: 'Email Domain Restriction', keywords: ['domain', 'whitelist', 'allowlist'] },
    { label: 'Allowed Domains', keywords: ['domain', 'email'] },
    { label: 'Users', keywords: ['members', 'people'] },
    { label: 'Teams', keywords: ['groups'] },
    { label: 'Roles', keywords: ['workflow roles'] },
    { label: 'Titles', keywords: ['job titles'] },
    { label: 'Default Team for New Users', keywords: ['default team', 'onboarding'] },
    { label: 'Manage Members', keywords: ['team members'] },
    { label: 'Permissions', keywords: ['access', 'rights'] },
    { label: 'Vault Access', keywords: ['vault permissions'] },
    { label: 'Reviewers', keywords: ['approvers', 'review'] },
    { label: 'View Net Permissions', keywords: ['effective permissions'] },
    { label: 'Simulate Permissions', keywords: ['impersonate', 'preview access'] },
  ],
  'module-access': [
    { label: 'Everyone', keywords: ['all users'] },
    { label: 'Teams', keywords: ['groups'] },
    { label: 'Individual people', keywords: ['users'] },
    { label: 'Allow everyone', keywords: ['unrestrict'] },
  ],
  'company-profile': [
    { label: 'Company Logo', keywords: ['logo', 'branding', 'image'] },
    { label: 'Upload Logo', keywords: ['logo'] },
    { label: 'Billing Addresses', keywords: ['address', 'invoice'] },
    { label: 'Shipping Addresses', keywords: ['address', 'delivery'] },
    { label: 'Add Address', keywords: ['address'] },
    { label: 'Contact Information', keywords: ['contact'] },
    { label: 'Phone', keywords: ['telephone'] },
    { label: 'Email', keywords: ['contact email'] },
    { label: 'Website', keywords: ['url'] },
  ],
  'auth-providers': [
    { label: 'Team Members', keywords: ['users'] },
    { label: 'Suppliers', keywords: ['vendors'] },
    { label: 'Google Account', keywords: ['google', 'oauth', 'sso'] },
    { label: 'Email & Password', keywords: ['password', 'email login'] },
    { label: 'Phone Number (SMS)', keywords: ['sms', 'phone', 'otp'] },
  ],
  serialization: [
    { label: 'Serial Number Settings', keywords: ['part number', 'numbering', 'serial'] },
    { label: 'Next Serial Number Preview', keywords: ['preview', 'next number'] },
    { label: 'Enable Auto-Serialization', keywords: ['auto number', 'automatic'] },
    { label: 'Auto-Apply File Types', keywords: ['file types', 'extensions'] },
    { label: 'Number Format', keywords: ['format', 'pattern'] },
    { label: 'Prefix', keywords: ['start'] },
    { label: 'Suffix', keywords: ['end'] },
    { label: 'Letter Prefix', keywords: ['letters'] },
    { label: 'Number Padding', keywords: ['digits', 'zeros'] },
    { label: 'Current Counter Value', keywords: ['counter', 'sequence'] },
    { label: 'Tab Numbers', keywords: ['tab', 'dash number', 'variant'] },
    { label: 'Tab Separator', keywords: ['dash', 'separator'] },
    { label: 'Tab Digits', keywords: ['digits'] },
    { label: 'Auto-pad with zeros', keywords: ['padding'] },
    { label: 'Tab required', keywords: ['required'] },
    { label: 'Allowed Characters', keywords: ['characters', 'letters', 'special'] },
    { label: 'Keepout Zones', keywords: ['reserved', 'skip range', 'exclude'] },
    { label: 'Example Patterns', keywords: ['examples'] },
  ],
  export: [
    { label: 'Export Settings', keywords: ['export', 'step', 'stl'] },
    { label: 'Filename Pattern', keywords: ['naming', 'template', 'file name'] },
    { label: 'Quick Presets', keywords: ['presets'] },
    { label: 'Available Tokens (click to insert)', keywords: ['tokens', 'variables'] },
    { label: 'Additional Options', keywords: ['options'] },
    {
      label: 'Include configuration name for single-config exports',
      keywords: ['configuration', 'config name'],
    },
    { label: 'Default Export Format', keywords: ['format', 'step', 'iges'] },
    { label: 'STL Export Options', keywords: ['stl', '3d print', 'mesh'] },
    { label: 'Resolution Quality', keywords: ['resolution', 'quality'] },
    { label: 'Deviation (mm)', keywords: ['tolerance'] },
    { label: 'Binary STL format', keywords: ['binary', 'ascii'] },
    { label: 'Quick Export', keywords: ['shortcut', 'keybinding'], desktopOnly: true },
    {
      label: 'Quick export folder',
      keywords: ['export location', 'default folder', 'output folder'],
      desktopOnly: true,
    },
    { label: 'Token Reference', keywords: ['tokens', 'help'] },
  ],
  rfq: [
    { label: 'RFQ Template Defaults', keywords: ['quote', 'template'] },
    { label: 'Payment Terms', keywords: ['net 30', 'payment'] },
    { label: 'Incoterms', keywords: ['shipping terms', 'fob'] },
    { label: 'Quote Valid (days)', keywords: ['validity', 'expiry'] },
    { label: 'RFQ Document Columns', keywords: ['columns', 'document'] },
    { label: 'Show company logo', keywords: ['logo'] },
    { label: 'Show revision column', keywords: ['revision'] },
    { label: 'Show material column', keywords: ['material'] },
    { label: 'Show finish column', keywords: ['finish'] },
    { label: 'Show notes column', keywords: ['notes'] },
    { label: 'Terms and Conditions', keywords: ['legal', 't&c'] },
    { label: 'Footer Text', keywords: ['footer'] },
  ],
  'security-monitoring': [
    { label: 'Monitor this organization', keywords: ['security', 'alerts'] },
    { label: 'Files permanently deleted', keywords: ['purge', 'threshold'] },
    { label: 'Stored file versions removed', keywords: ['storage', 'threshold'] },
    { label: 'Password reset or repeated sign-up requests', keywords: ['sign-in', 'auth'] },
    { label: 'Members who join through an email domain', keywords: ['domain', 'join'] },
    { label: 'Backup alerts', keywords: ['backup', 'overdue'] },
    { label: 'Daily summary', keywords: ['summary', 'digest'] },
  ],
  'file-workflows': [
    { label: 'Use file workflows', keywords: ['enable workflows', 'states'] },
    { label: 'When a review approves files in a review stage', keywords: ['hold', 'advance', 'approve'] },
    { label: 'When a package comes back partly approved', keywords: ['together', 'approved only', 'partial'] },
  ],
  'metadata-columns': [
    { label: 'Built-in Columns', keywords: ['columns', 'file browser'] },
    { label: 'Custom Columns', keywords: ['custom properties', 'metadata', 'fields'] },
    { label: 'Add Column', keywords: ['new column'] },
    { label: 'Internal Name', keywords: ['key'] },
    { label: 'Display Label', keywords: ['label', 'title'] },
    { label: 'Data Type', keywords: ['type'] },
    { label: 'Column Width (px)', keywords: ['width'] },
    { label: 'Default Value', keywords: ['default'] },
    { label: 'Dropdown Options', keywords: ['select', 'choices', 'options'] },
    { label: 'Visible by default', keywords: ['show', 'hidden'] },
    { label: 'Sortable', keywords: ['sort'] },
    { label: 'Required', keywords: ['mandatory'] },
    { label: 'Save as My Defaults', keywords: ['personal defaults'] },
    { label: 'Load My Defaults', keywords: ['personal defaults'] },
    { label: 'Reset to App Defaults', keywords: ['reset'] },
    { label: 'Save as Org Defaults', keywords: ['organization defaults'] },
    { label: 'Push to All Users', keywords: ['push', 'everyone'] },
  ],
  'item-designations': [{ label: 'Add designation', keywords: ['new designation', 'item type'] }],
  backup: [
    { label: 'Status', keywords: ['backup', 'restore', 'snapshot', 'backup & restore'] },
    { label: 'Last Backup', keywords: ['latest', 'recent'] },
    { label: 'Next Backup', keywords: ['schedule', 'upcoming'] },
    { label: 'Backup Configuration', keywords: ['s3', 'backblaze', 'storage'] },
    { label: 'Provider', keywords: ['s3', 'backblaze', 'b2'] },
    { label: 'Bucket Name', keywords: ['bucket'] },
    { label: 'S3 Endpoint', keywords: ['endpoint', 'url'] },
    { label: 'Region', keywords: ['aws region'] },
    { label: 'Encryption Password', keywords: ['encryption', 'restic', 'password'] },
    { label: 'Retention Policy', keywords: ['retention', 'keep', 'prune'] },
    { label: 'Enable scheduled backups', keywords: ['schedule', 'automatic', 'cron'] },
    { label: 'Backup time', keywords: ['schedule', 'timezone'] },
    { label: 'Backup Source', keywords: ['machine', 'designated'] },
    { label: 'Backup History', keywords: ['snapshots', 'history'] },
    { label: 'Restore Now', keywords: ['restore', 'rollback'] },
  ],
  solidworks: [
    { label: 'Service', keywords: ['solidworks service'] },
    { label: 'Licenses', keywords: ['license'] },
    { label: 'Templates', keywords: ['template'] },
    { label: 'Metadata Audit', keywords: ['audit', 'vault audit'] },
    { label: 'SolidWorks Service', keywords: ['service', 'background', 'sw'] },
    { label: 'Auto-start on app launch', keywords: ['startup', 'autostart'] },
    { label: 'Keep SolidWorks warm in background', keywords: ['warm', 'background', 'prelaunch'] },
    { label: 'Verbose service logging', keywords: ['debug', 'logs'] },
    { label: 'Vault Metadata Sync', keywords: ['properties', 'sync', 'metadata'] },
    { label: 'Document Manager API', keywords: ['dm api'] },
    { label: 'Full SolidWorks API', keywords: ['api'] },
    { label: 'Preview mode', keywords: ['thumbnail', 'preview', 'edrawings'] },
    { label: 'Embedded thumbnail', keywords: ['thumbnail'] },
    { label: 'eDrawings (external)', keywords: ['edrawings'] },
    { label: 'eDrawings 3D preview (Windows, optional)', keywords: ['3d', 'edrawings'] },
    { label: 'Temporary Lock Files (~$)', keywords: ['lock files', 'temp files'] },
    { label: 'Hide from file browser', keywords: ['hide'] },
    { label: 'Ignore from sync', keywords: ['ignore'] },
    { label: 'Part & Assembly Revisions', keywords: ['revision'] },
    { label: 'Allow file-level revisions on parts & assemblies', keywords: ['revision', 'parts'] },
    { label: 'Drawing Metadata', keywords: ['drawing', 'properties'] },
    { label: 'Lock drawing revision', keywords: ['revision', 'lock'] },
    { label: 'Lock drawing item number', keywords: ['item number', 'part number', 'lock'] },
    { label: 'Lock drawing description', keywords: ['description', 'lock'] },
    { label: 'SOLIDWORKS Version', keywords: ['version', 'year'] },
    { label: 'Version to connect to', keywords: ['version'] },
    { label: 'SolidWorks Installation Path', keywords: ['install', 'path', 'exe'] },
    { label: 'Template Folders', keywords: ['templates', 'folders'] },
    { label: 'Document Templates', keywords: ['templates', 'prtdot'] },
    { label: 'Sheet Formats', keywords: ['drawing format', 'title block'] },
    { label: 'BOM Templates', keywords: ['bom', 'bill of materials'] },
    { label: 'Custom Property Files', keywords: ['properties', 'property tab'] },
    { label: 'Prompt user to select document template', keywords: ['prompt', 'template'] },
    { label: 'Apply to SOLIDWORKS', keywords: ['apply'] },
    {
      label: 'Document Manager License (Organization-wide)',
      keywords: ['dm license', 'license key'],
    },
    { label: 'License Key', keywords: ['key'] },
    { label: 'SOLIDWORKS Licenses', keywords: ['seats', 'serial', 'license manager'] },
    { label: 'Vault Metadata Audit', keywords: ['audit', 'scan', 'integrity'] },
    { label: 'Run audit', keywords: ['scan'] },
    { label: 'Parts and assemblies carry their own revision', keywords: ['revision rule'] },
  ],
  'google-drive': [
    { label: 'Enable Google Drive', keywords: ['enable', 'gdrive'] },
    { label: 'Client ID', keywords: ['oauth', 'credentials'] },
    { label: 'Client Secret', keywords: ['oauth', 'secret'] },
    { label: 'Inspection template folder ID', keywords: ['inspection', 'template', 'folder'] },
  ],
  odoo: [
    { label: 'Odoo Connections', keywords: ['connection', 'instance'] },
    { label: 'New Connection', keywords: ['add connection'] },
    { label: 'Odoo URL', keywords: ['url', 'server'] },
    { label: 'Database', keywords: ['db'] },
    { label: 'Username (Email)', keywords: ['username', 'login'] },
    { label: 'API Key', keywords: ['key', 'token'] },
    { label: 'Test Connection', keywords: ['test'] },
    { label: 'Sync Suppliers Now', keywords: ['suppliers', 'vendors', 'sync'] },
    { label: 'Odoo API Documentation', keywords: ['docs', 'help'] },
  ],
  webhooks: [
    { label: 'Add Webhook', keywords: ['new webhook'] },
    { label: 'Payload URL *', keywords: ['url', 'endpoint'] },
    { label: 'Secret', keywords: ['signing', 'hmac'] },
    { label: 'Events *', keywords: ['triggers'] },
    { label: 'Trigger when action is by', keywords: ['filter', 'user'] },
    { label: 'Active', keywords: ['enabled'] },
    { label: 'Webhook Payload', keywords: ['payload', 'json', 'format'] },
  ],
  api: [
    { label: 'API Server URL', keywords: ['server', 'url'] },
    { label: 'Server Status', keywords: ['status', 'online'] },
    { label: 'Access Token', keywords: ['token', 'api key', 'bearer'] },
    { label: 'Quick Test', keywords: ['test', 'request'] },
    { label: 'Recent API Calls', keywords: ['requests', 'history'] },
    { label: 'Open API Documentation (Swagger)', keywords: ['swagger', 'openapi', 'docs'] },
  ],
  supabase: [
    {
      label: 'Connection Status',
      keywords: ['status', 'online', 'supabase connection', 'database', 'backend', 'server'],
    },
    { label: 'Schema Version', keywords: ['migration', 'schema', 'database version'] },
    { label: 'Supabase URL', keywords: ['url', 'project'] },
    { label: 'Anon Key', keywords: ['key', 'api key'] },
    { label: 'Database Statistics', keywords: ['stats', 'files', 'members'] },
    { label: 'Network Activity', keywords: ['traffic', 'activity'] },
    { label: 'Realtime', keywords: ['live', 'websocket'] },
    { label: 'Server Information', keywords: ['region', 'project url', 'slug'] },
  ],
  'recovery-codes': [
    { label: 'Admin Recovery Codes', keywords: ['recovery', 'emergency', 'admin'] },
    { label: 'Generate Recovery Code', keywords: ['create', 'new code'] },
    { label: 'Expires in', keywords: ['expiry', 'expiration'] },
    { label: 'Revoke Recovery Code', keywords: ['revoke', 'invalidate'] },
  ],
  performance: [
    { label: 'Sample Rate', keywords: ['interval', 'polling'] },
    { label: 'Retention Time', keywords: ['history', 'duration'] },
  ],
  logs: [
    { label: 'Storage', keywords: ['retention', 'disk', 'log files'] },
    { label: 'Max Files', keywords: ['retention', 'limit'] },
    { label: 'Max Age (Days)', keywords: ['retention', 'age'] },
    { label: 'Max Total Size (MB)', keywords: ['size', 'disk'] },
  ],
  'dev-tools': [
    { label: 'Window Size', keywords: ['resize', 'resolution'] },
    { label: 'Regression Test Runner', keywords: ['tests', 'regression'] },
    { label: 'Performance Timing Dashboard', keywords: ['timing', 'profiling'] },
    { label: 'File Operation Log', keywords: ['log'] },
    { label: 'BOM Reference Diagnostics', keywords: ['bom', 'references'] },
  ],
  about: [
    { label: 'Check for Updates', keywords: ['update', 'upgrade'] },
    { label: 'Version History', keywords: ['changelog', 'releases', 'release notes'] },
    { label: 'GitHub Repository', keywords: ['source', 'github', 'code'] },
    { label: 'Report Issues', keywords: ['bug', 'issue', 'feedback'] },
  ],
}

/** Whether a settings tab shows for this user on this host (admin-only and desktop-only gates). */
export function isSettingsTabAvailable(
  item: Pick<SettingsNavigationItem, 'adminOnly' | 'desktopOnly'>,
  isAdmin: boolean,
  desktop: boolean,
): boolean {
  return (!item.adminOnly || isAdmin) && (!item.desktopOnly || desktop)
}

/** True for a tab that only the desktop app shows (marked `desktopOnly` in settingsSections). */
export function isDesktopOnlySettingsTab(tab: SettingsTab): boolean {
  return settingsSections().some((s) => s.items.some((i) => i.id === tab && i.desktopOnly))
}

/** The search catalog for this host: on the web, desktop-only settings are left out. */
export function settingsCatalogFor(desktop: boolean): SettingsCatalog {
  if (desktop) return settingsCatalog
  const out: SettingsCatalog = {}
  for (const tab of Object.keys(settingsCatalog) as SettingsTab[]) {
    out[tab] = (settingsCatalog[tab] ?? []).filter((e) => !e.desktopOnly)
  }
  return out
}
