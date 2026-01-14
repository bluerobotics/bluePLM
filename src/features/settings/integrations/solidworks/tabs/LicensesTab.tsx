import { Check, Eye, EyeOff, Key, Loader2, X } from 'lucide-react'
import { useSolidWorksSettings } from '../hooks'
import { LicenseManagerSection } from '../LicenseManager'

export function LicensesTab() {
  const {
    organization,
    isAdmin,
    dmLicenseKeyInput,
    setDmLicenseKeyInput,
    isSavingLicenseKey,
    showLicenseKey,
    setShowLicenseKey,
    hasUnsavedLicenseKey,
    handleSaveLicenseKey,
    handleClearLicenseKey,
  } = useSolidWorksSettings()

  return (
    <div className="space-y-6">
      {/* Document Manager License */}
      <div className="space-y-3">
        <label className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium">
          Document Manager License (Organization-wide)
        </label>
        <div className="p-4 bg-plm-bg rounded-lg border border-plm-border space-y-3">
          {isAdmin ? (
            <>
              <p className="text-sm text-plm-fg-muted">
                Enter your organization's Document Manager API license key to enable direct file reading.
              </p>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-plm-fg-dim">License Key</label>
                  <button
                    type="button"
                    onClick={() => setShowLicenseKey(!showLicenseKey)}
                    className="text-xs text-plm-fg-muted hover:text-plm-fg flex items-center gap-1"
                  >
                    {showLicenseKey ? <EyeOff size={12} /> : <Eye size={12} />}
                    {showLicenseKey ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type={showLicenseKey ? 'text' : 'password'}
                    value={dmLicenseKeyInput}
                    onChange={(e) => setDmLicenseKeyInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && hasUnsavedLicenseKey) {
                        handleSaveLicenseKey()
                      }
                    }}
                    placeholder="COMPANYNAME:swdocmgr_general-...,swdocmgr_previews-...,swdocmgr_xml-..."
                    className="flex-1 px-3 py-2 bg-plm-bg-secondary border border-plm-border rounded-lg text-sm text-plm-fg placeholder-plm-fg-muted focus:outline-none focus:border-plm-accent font-mono"
                  />
                  <button
                    onClick={handleSaveLicenseKey}
                    disabled={!hasUnsavedLicenseKey || isSavingLicenseKey}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                      hasUnsavedLicenseKey
                        ? 'bg-plm-accent text-white hover:bg-plm-accent/80'
                        : 'bg-plm-bg-secondary text-plm-fg-dim cursor-not-allowed'
                    }`}
                  >
                    {isSavingLicenseKey ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Check size={14} />
                    )}
                    Save
                  </button>
                  {organization?.settings?.solidworks_dm_license_key && (
                    <button
                      onClick={handleClearLicenseKey}
                      disabled={isSavingLicenseKey}
                      className="px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30 disabled:opacity-50"
                      title="Clear license key"
                    >
                      <X size={14} />
                      Clear
                    </button>
                  )}
                </div>
                <p className="text-sm text-plm-fg-dim">
                  Free with SolidWorks subscription.{' '}
                  <a 
                    href="https://customerportal.solidworks.com/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-plm-accent hover:underline"
                    onClick={(e) => {
                      e.preventDefault()
                      window.electronAPI?.openFile('https://customerportal.solidworks.com/')
                    }}
                  >
                    Request key →
                  </a>
                </p>
                {organization?.settings?.solidworks_dm_license_key && !hasUnsavedLicenseKey && (
                  <div className="flex items-center gap-2 text-sm text-green-400">
                    <Check size={14} />
                    Direct file access enabled for all org users
                  </div>
                )}
                {hasUnsavedLicenseKey && (
                  <div className="text-sm text-yellow-400">
                    Unsaved changes
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <Key 
                  size={22} 
                  className={organization?.settings?.solidworks_dm_license_key ? 'text-green-400' : 'text-plm-fg-muted'} 
                />
                <span className="text-base text-plm-fg">
                  {organization?.settings?.solidworks_dm_license_key ? (
                    <span className="text-green-400 font-medium">Configured</span>
                  ) : (
                    <span className="text-plm-fg-muted">Not configured</span>
                  )}
                </span>
              </div>
              <div className="text-sm text-plm-fg-muted space-y-2">
                {organization?.settings?.solidworks_dm_license_key ? (
                  <p>Using fast Document Manager API for file reading.</p>
                ) : (
                  <p>Using SolidWorks API (slower, launches SW in background).</p>
                )}
                <p className="pt-1 text-plm-fg-dim">
                  Ask an organization admin to configure the license key.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* SOLIDWORKS Licenses (Organization-wide) */}
      <LicenseManagerSection />
    </div>
  )
}
