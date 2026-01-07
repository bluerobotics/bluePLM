import { useState, useEffect, useRef } from 'react'
import { usePDMStore } from '@/stores/pdmStore'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { getBackupStatus } from '@/lib/backup'
import type { SettingsTab } from '@/types/settings'
import { logSettings } from '@/lib/userActionLogger'

type IntegrationStatus = 'online' | 'partial' | 'offline' | 'not-configured' | 'coming-soon'
type BackupStatusType = 'online' | 'partial' | 'offline' | 'not-configured'

interface SettingsNavigationProps {
  activeTab: SettingsTab
  onTabChange: (tab: SettingsTab) => void
}

interface SettingsSection {
  category: string
  items: { id: SettingsTab; label: string }[]
}

const settingsSections: SettingsSection[] = [
  {
    category: 'Account',
    items: [
      { id: 'profile', label: 'Profile' },
      { id: 'preferences', label: 'Preferences' },
      { id: 'keybindings', label: 'Keybindings' },
      { id: 'modules', label: 'Modules' },
      { id: 'delete-account', label: 'Delete Account' },
    ]
  },
  {
    category: 'Organization',
    items: [
      { id: 'vaults', label: 'Vaults' },
      { id: 'team-members', label: 'Members & Teams' },
      { id: 'company-profile', label: 'Company Profile' },
      { id: 'auth-providers', label: 'Sign-In Methods' },
      { id: 'serialization', label: 'Serialization' },
      { id: 'export', label: 'Export Options' },
      { id: 'metadata-columns', label: 'File Metadata' },
      { id: 'rfq', label: 'RFQ Settings' },
      { id: 'backup', label: 'Backups' },
      { id: 'recovery-codes', label: 'Recovery Codes' },
    ]
  },
  {
    category: 'Integrations',
    items: [
      { id: 'supabase', label: 'Supabase' },
      { id: 'solidworks', label: 'SolidWorks' },
      { id: 'google-drive', label: 'Google Drive' },
      { id: 'odoo', label: 'Odoo ERP' },
      { id: 'slack', label: 'Slack' },
      { id: 'woocommerce', label: 'WooCommerce' },
      { id: 'webhooks', label: 'Webhooks' },
      { id: 'api', label: 'REST API' },
    ]
  },
  {
    category: 'System',
    items: [
      { id: 'performance', label: 'Performance' },
      { id: 'logs', label: 'Logs' },
      { id: 'dev-tools', label: 'Dev Tools' },
      { id: 'about', label: 'About' },
    ]
  },
]

const integrationIds = ['supabase', 'solidworks', 'google-drive', 'odoo', 'slack', 'woocommerce', 'webhooks', 'api'] as const

function getApiUrl(organization: { settings?: { api_url?: string } } | null): string | null {
  return organization?.settings?.api_url || null
}

function StatusDot({ status }: { status: IntegrationStatus }) {
  const colors: Record<IntegrationStatus, string> = {
    'online': 'bg-plm-success',
    'partial': 'bg-yellow-500',
    'offline': 'bg-plm-error',
    'not-configured': 'bg-plm-fg-muted/40',
    'coming-soon': 'bg-plm-fg-muted/40',
  }
  
  const titles: Record<IntegrationStatus, string> = {
    'online': 'Connected',
    'partial': 'Partially connected',
    'offline': 'Offline',
    'not-configured': 'Not configured',
    'coming-soon': 'Coming soon',
  }
  
  return (
    <span 
      className={`w-2.5 h-2.5 rounded-full ${colors[status]} flex-shrink-0`}
      title={titles[status]}
    />
  )
}

function BackupStatusDot({ status }: { status: BackupStatusType }) {
  const colors: Record<BackupStatusType, string> = {
    'online': 'bg-plm-success',
    'partial': 'bg-yellow-500',
    'offline': 'bg-plm-error',
    'not-configured': 'bg-plm-fg-muted/40',
  }
  
  const titles: Record<BackupStatusType, string> = {
    'online': 'Backups working',
    'partial': 'Not configured',
    'offline': 'Backup failed',
    'not-configured': 'Not configured',
  }
  
  return (
    <span 
      className={`w-2.5 h-2.5 rounded-full ${colors[status]} flex-shrink-0`}
      title={titles[status]}
    />
  )
}

export function SettingsNavigation({ activeTab, onTabChange }: SettingsNavigationProps) {
  // Subscribe to store for re-renders when these change (used in useEffect deps)
  const { organization, solidworksPath, solidworksIntegrationEnabled } = usePDMStore()
  const [statuses, setStatuses] = useState<Record<string, IntegrationStatus>>({
    'supabase': 'not-configured',
    'solidworks': 'not-configured',
    'google-drive': 'not-configured',
    'odoo': 'not-configured',
    'slack': 'not-configured',
    'woocommerce': 'coming-soon',
    'webhooks': 'coming-soon',
    'api': 'not-configured',
  })
  const [backupStatus, setBackupStatus] = useState<BackupStatusType>('not-configured')
  
  // Refs to track the latest check ID and prevent stale async results from overwriting newer ones
  const integrationCheckIdRef = useRef(0)
  const backupCheckIdRef = useRef(0)
  
  useEffect(() => {
    checkIntegrationStatuses()
    checkBackupStatus()
    // Poll for status changes every 5 seconds (for SolidWorks service, etc.)
    const interval = setInterval(() => {
      checkIntegrationStatuses()
      checkBackupStatus()
    }, 5000)
    return () => clearInterval(interval)
  }, [organization?.id, solidworksPath, solidworksIntegrationEnabled])
  
  const checkIntegrationStatuses = async () => {
    // Increment check ID to track this specific check
    const checkId = ++integrationCheckIdRef.current
    
    // Get fresh state directly from store to avoid stale closure issues
    const currentState = usePDMStore.getState()
    const currentOrg = currentState.organization
    const currentSolidworksIntegrationEnabled = currentState.solidworksIntegrationEnabled
    const currentSolidworksPath = currentState.solidworksPath
    
    const apiUrl = getApiUrl(currentOrg)
    
    // Use local variables to avoid stale closure issues
    let supabaseStatus: IntegrationStatus = 'not-configured'
    let solidworksStatus: IntegrationStatus = 'not-configured'
    let googleDriveStatus: IntegrationStatus = 'not-configured'
    let apiStatus: IntegrationStatus = 'not-configured'
    let odooStatus: IntegrationStatus = 'not-configured'
    
    // Supabase - check if configured and connected
    if (isSupabaseConfigured()) {
      try {
        const { error } = await supabase.from('organizations').select('id').limit(1)
        if (error && (error.message.includes('Invalid API key') || error.code === 'PGRST301')) {
          supabaseStatus = 'offline'
        } else {
          supabaseStatus = 'online'
        }
      } catch {
        supabaseStatus = 'offline'
      }
    }
    
    // SolidWorks - check service status with tri-state logic:
    // Green: Both SW API and DM API are up
    // Yellow: SW API is down (no SW installed), but DM API is up
    // Red: DM API is down
    // Gray (not-configured): Integration is disabled
    if (!currentSolidworksIntegrationEnabled) {
      // Integration disabled - show as not configured (gray dot, no red warning)
      solidworksStatus = 'not-configured'
    } else {
      try {
        const swResult = await window.electronAPI?.solidworks?.getServiceStatus()
        if (swResult?.success && swResult.data?.running) {
          const data = swResult.data as any
          const swInstalled = data.installed ?? data.swInstalled
          const dmApiAvailable = data.documentManagerAvailable ?? data.fastModeEnabled
          
          if (dmApiAvailable) {
            if (swInstalled) {
              // Both APIs up → Green
              solidworksStatus = 'online'
            } else {
              // SW not installed but DM API up → Yellow
              solidworksStatus = 'partial'
            }
          } else {
            // DM API is down → Red
            solidworksStatus = 'offline'
          }
        } else if (currentSolidworksPath || currentOrg?.settings?.solidworks_dm_license_key) {
          // Service not running but configured
          solidworksStatus = 'offline'
        } else {
          solidworksStatus = 'not-configured'
        }
      } catch {
        solidworksStatus = (currentSolidworksPath || currentOrg?.settings?.solidworks_dm_license_key) ? 'offline' : 'not-configured'
      }
    }
    
    // Google Drive - check org settings
    if (currentOrg?.id) {
      try {
        const { data } = await (supabase.rpc as any)('get_google_drive_settings', {
          p_org_id: currentOrg.id
        })
        if (data && Array.isArray(data) && data.length > 0) {
          const settings = data[0] as { enabled?: boolean; client_id?: string }
          if (settings.enabled && settings.client_id) {
            googleDriveStatus = 'online'
          } else if (settings.client_id) {
            googleDriveStatus = 'offline'
          } else {
            googleDriveStatus = 'not-configured'
          }
        }
      } catch {
        // Keep as not-configured
      }
    }
    
    // API Server - check if online (only if URL is configured)
    if (!apiUrl) {
      apiStatus = 'not-configured'
      odooStatus = 'not-configured'
    } else {
      try {
        const response = await fetch(`${apiUrl}/health`, {
          signal: AbortSignal.timeout(2000)
        })
        if (response.ok) {
          apiStatus = 'online'
          
          // Odoo - check if connected (only if API is online AND we have a valid token)
          try {
            const { data: { session } } = await supabase.auth.getSession()
            const token = session?.access_token
            
            if (token) {
              const odooResponse = await fetch(`${apiUrl}/integrations/odoo`, {
                headers: {
                  'Authorization': `Bearer ${token}`
                },
                signal: AbortSignal.timeout(3000)
              })
              if (odooResponse.ok) {
                const odooData = await odooResponse.json()
                if (odooData.is_connected) {
                  odooStatus = 'online'
                } else if (odooData.configured) {
                  // Main integration says configured but not connected - check saved configs
                  // for last_test_success which is what the UI shows
                  try {
                    const configsResponse = await fetch(`${apiUrl}/integrations/odoo/configs`, {
                      headers: { 'Authorization': `Bearer ${token}` },
                      signal: AbortSignal.timeout(3000)
                    })
                    if (configsResponse.ok) {
                      const configsData = await configsResponse.json()
                      const hasSuccessfulConfig = configsData.configs?.some(
                        (c: { last_test_success: boolean | null }) => c.last_test_success === true
                      )
                      odooStatus = hasSuccessfulConfig ? 'online' : 'offline'
                    } else {
                      odooStatus = 'offline'
                    }
                  } catch {
                    odooStatus = 'offline'
                  }
                } else {
                  odooStatus = 'not-configured'
                }
              } else {
                // API returned error - could be 401/403
                console.warn('[SettingsNav] Odoo status check failed:', odooResponse.status)
                odooStatus = 'not-configured'
              }
            } else {
              // No token available - user not logged in
              odooStatus = 'not-configured'
            }
          } catch (err) {
            console.warn('[SettingsNav] Failed to check Odoo status:', err)
            odooStatus = 'not-configured'
          }
        } else {
          apiStatus = 'offline'
          odooStatus = 'offline'
        }
      } catch {
        apiStatus = 'offline'
        odooStatus = 'offline'
      }
    }
    
    // Only update state if this is still the latest check (prevents race conditions)
    if (checkId !== integrationCheckIdRef.current) {
      return
    }
    
    setStatuses({
      'supabase': supabaseStatus,
      'solidworks': solidworksStatus,
      'google-drive': googleDriveStatus,
      'odoo': odooStatus,
      'slack': 'coming-soon',
      'woocommerce': 'not-configured',
      'webhooks': 'not-configured',
      'api': apiStatus,
    })
  }
  
  const checkBackupStatus = async () => {
    // Increment check ID to track this specific check
    const checkId = ++backupCheckIdRef.current
    
    // Get fresh state directly from store
    const currentOrg = usePDMStore.getState().organization
    
    if (!currentOrg?.id) {
      // Only update if this is still the latest check
      if (checkId === backupCheckIdRef.current) {
        setBackupStatus('not-configured')
      }
      return
    }
    
    try {
      const status = await getBackupStatus(currentOrg.id)
      
      // Only update if this is still the latest check
      if (checkId !== backupCheckIdRef.current) {
        return
      }
      
      if (!status.isConfigured) {
        // Yellow dot: backups not configured
        setBackupStatus('partial')
      } else if (status.error) {
        // Red dot: backups configured but failed to load/connect
        setBackupStatus('offline')
      } else if (status.snapshots.length > 0) {
        // Green dot: configured and has successful backups
        setBackupStatus('online')
      } else {
        // Yellow dot: configured but no backups yet
        setBackupStatus('partial')
      }
    } catch (err) {
      console.warn('[SettingsNav] Failed to check backup status:', err)
      // Only update if this is still the latest check
      if (checkId === backupCheckIdRef.current) {
        setBackupStatus('not-configured')
      }
    }
  }
  
  const isIntegration = (id: SettingsTab): boolean => {
    return (integrationIds as readonly string[]).includes(id)
  }
  
  return (
    <div className="flex flex-col h-full bg-plm-sidebar">
      {/* Scrollable navigation */}
      <nav className="flex-1 overflow-y-auto hide-scrollbar" role="menu" aria-label="Settings navigation">
        <div className="flex flex-col py-1">
          {settingsSections.map((section, sectionIndex) => (
            <div key={section.category}>
              {/* Section */}
              <div className="mt-4 mb-1 mx-3">
                {/* Category header - uppercase mono, faded */}
                <div className="px-3 mb-1">
                  <span className="text-[13px] font-mono uppercase text-plm-fg-muted/45">
                    {section.category}
                  </span>
                </div>
                
                {/* Menu items - tighter spacing */}
                <div>
                  {section.items.map(item => (
                    <button
                      key={item.id}
                      role="menuitem"
                      onClick={() => {
                        logSettings(`Changed settings tab to ${item.label}`, { tabId: item.id })
                        onTabChange(item.id)
                      }}
                      className={`w-full flex items-center justify-between px-3 py-1 rounded-lg text-[13px] font-sans transition-colors outline-none focus-visible:ring-1 focus-visible:ring-plm-accent ${
                        activeTab === item.id
                          ? 'bg-plm-highlight text-plm-fg font-semibold'
                          : 'text-plm-fg-dim hover:text-plm-fg'
                      }`}
                    >
                      <span>{item.label}</span>
                      {isIntegration(item.id) && (
                        <StatusDot status={statuses[item.id] || 'not-configured'} />
                      )}
                      {item.id === 'backup' && (
                        <BackupStatusDot status={backupStatus} />
                      )}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Divider between sections (except after last) */}
              {sectionIndex < settingsSections.length - 1 && (
                <div className="h-px w-full bg-plm-border/50 mt-3" />
              )}
            </div>
          ))}
        </div>
      </nav>
    </div>
  )
}
