import { useState, useEffect } from 'react'
import { Monitor, RotateCcw, ChevronDown, UserCog, Shield, Wrench, Eye, X } from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'

interface DevicePreset {
  id: string
  name: string
  width: number
  height: number
}

const devicePresets: DevicePreset[] = [
  { id: 'iphone', name: 'iPhone 14', width: 390, height: 844 },
  { id: 'android', name: 'Android', width: 412, height: 915 },
  { id: 'ipad', name: 'iPad', width: 820, height: 1180 },
  { id: 'ipad-pro', name: 'iPad Pro', width: 1024, height: 1366 },
  { id: 'laptop', name: 'Laptop', width: 1366, height: 768 },
  { id: 'desktop', name: 'Desktop', width: 1920, height: 1080 },
]

const roleOptions = [
  { id: 'admin', label: 'Admin', icon: Shield, description: 'Full access to all features' },
  { id: 'engineer', label: 'Engineer', icon: Wrench, description: 'Can check out, edit, and manage files' },
  { id: 'viewer', label: 'Viewer', icon: Eye, description: 'Read-only access' },
] as const

export function DevToolsSettings() {
  const { user, addToast, impersonatedRole, setImpersonatedRole } = usePDMStore()
  const [currentSize, setCurrentSize] = useState<{ width: number; height: number } | null>(null)
  const [selectedPreset, setSelectedPreset] = useState<string>('')
  
  const actualRole = user?.role ?? 'viewer'
  const isAdmin = actualRole === 'admin'

  useEffect(() => {
    const fetchSize = async () => {
      const size = await window.electronAPI?.getWindowSize?.()
      if (size) setCurrentSize(size)
    }
    fetchSize()
  }, [])

  const handlePresetChange = async (presetId: string) => {
    if (!presetId) return
    const preset = devicePresets.find(p => p.id === presetId)
    if (!preset || !window.electronAPI?.setWindowSize) return

    const result = await window.electronAPI.setWindowSize(preset.width, preset.height)
    if (result.success) {
      setCurrentSize({ width: preset.width, height: preset.height })
      setSelectedPreset(presetId)
    } else {
      addToast('error', result.error || 'Failed to resize')
    }
  }

  const handleReset = async () => {
    const result = await window.electronAPI?.resetWindowSize?.()
    if (result?.success) {
      setCurrentSize(result.size || null)
      setSelectedPreset('')
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-xl font-semibold text-plm-fg mb-1">Developer Tools</h1>
        <p className="text-sm text-plm-fg-muted">Testing and development utilities</p>
      </section>

      {/* Role Impersonation - Admin only */}
      {isAdmin && (
        <section>
          <h2 className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium mb-3">
            Role Impersonation
          </h2>
          <div className="bg-plm-bg rounded-lg border border-plm-border p-4 space-y-4">
            <div className="flex items-start gap-3">
              <UserCog size={18} className="text-plm-fg-muted mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-plm-fg">
                  View the app as a different user role. This is a session-only setting and won't persist across restarts.
                </p>
                <p className="text-xs text-plm-fg-dim mt-1">
                  Your actual role: <span className="capitalize font-medium text-plm-fg-muted">{actualRole}</span>
                </p>
              </div>
            </div>
            
            {impersonatedRole && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <UserCog size={14} className="text-amber-400" />
                <span className="text-sm text-amber-300 flex-1">
                  Currently viewing as <span className="font-medium capitalize">{impersonatedRole}</span>
                </span>
                <button
                  onClick={() => setImpersonatedRole(null)}
                  className="text-amber-400 hover:text-amber-300 p-1 rounded hover:bg-amber-500/20 transition-colors"
                  title="Stop impersonating"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            
            <div className="flex flex-wrap gap-2">
              {roleOptions.map(role => {
                const Icon = role.icon
                const isActive = impersonatedRole === role.id
                const isSameAsActual = role.id === actualRole
                
                return (
                  <button
                    key={role.id}
                    onClick={() => setImpersonatedRole(isActive ? null : role.id)}
                    disabled={isSameAsActual && !impersonatedRole}
                    className={`
                      flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all
                      ${isActive 
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50' 
                        : isSameAsActual && !impersonatedRole
                          ? 'bg-plm-highlight/50 text-plm-fg-dim border border-plm-border cursor-not-allowed'
                          : 'bg-plm-highlight hover:bg-plm-highlight/80 text-plm-fg border border-transparent hover:border-plm-border'
                      }
                    `}
                    title={isSameAsActual && !impersonatedRole ? 'This is your current role' : role.description}
                  >
                    <Icon size={14} />
                    <span className="capitalize">{role.label}</span>
                    {isSameAsActual && <span className="text-xs text-plm-fg-dim">(current)</span>}
                  </button>
                )
              })}
            </div>
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium mb-3">
          Window Size
        </h2>
        <div className="bg-plm-bg rounded-lg border border-plm-border p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-plm-fg-muted">
              <Monitor size={16} />
              <span className="font-mono text-sm text-plm-fg">
                {currentSize ? `${currentSize.width}×${currentSize.height}` : '—'}
              </span>
            </div>
            
            <div className="relative flex-1 max-w-[200px]">
              <select
                value={selectedPreset}
                onChange={(e) => handlePresetChange(e.target.value)}
                className="w-full appearance-none bg-plm-input border border-plm-border rounded px-3 py-1.5 pr-8 text-sm text-plm-fg focus:outline-none focus:border-plm-accent cursor-pointer"
              >
                <option value="">Select preset...</option>
                {devicePresets.map(preset => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name} ({preset.width}×{preset.height})
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-plm-fg-muted pointer-events-none" />
            </div>

            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-plm-highlight hover:bg-plm-highlight/80 text-plm-fg rounded transition-colors"
            >
              <RotateCcw size={12} />
              Reset
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

