import { Check, Eye, EyeOff, X } from 'lucide-react'

import { Badge, Button, TextInput } from '@/components/core/ui'
import {
  SettingRow,
  SettingsGroup,
  SettingsPage,
  SettingsSection,
} from '@/features/settings/components/ui'

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

  const hasKey = Boolean(organization?.settings?.solidworks_dm_license_key)

  return (
    <SettingsPage>
      <SettingsSection
        title="Document Manager License (Organization-wide)"
        description={
          isAdmin
            ? "Enter your organization's Document Manager API license key to enable direct file reading."
            : undefined
        }
      >
        <SettingsGroup>
          {isAdmin ? (
            <SettingRow
              label="License Key"
              htmlFor="sw-dm-license-key"
              badge={
                hasUnsavedLicenseKey ? (
                  <Badge tone="warning">Unsaved changes</Badge>
                ) : hasKey ? (
                  <Badge tone="success" icon={<Check size={10} />}>
                    Direct file access enabled for all org users
                  </Badge>
                ) : undefined
              }
              description={
                <>
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
                </>
              }
              stacked
            >
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <TextInput
                    id="sw-dm-license-key"
                    type={showLicenseKey ? 'text' : 'password'}
                    value={dmLicenseKeyInput}
                    onChange={(e) => setDmLicenseKeyInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && hasUnsavedLicenseKey) {
                        handleSaveLicenseKey()
                      }
                    }}
                    placeholder="COMPANYNAME:swdocmgr_general-...,swdocmgr_previews-...,swdocmgr_xml-..."
                    className="pr-9 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLicenseKey(!showLicenseKey)}
                    title={showLicenseKey ? 'Hide' : 'Show'}
                    aria-label={showLicenseKey ? 'Hide' : 'Show'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-plm-fg-muted hover:text-plm-fg"
                  >
                    {showLicenseKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <Button
                  variant="primary"
                  onClick={handleSaveLicenseKey}
                  disabled={!hasUnsavedLicenseKey}
                  loading={isSavingLicenseKey}
                  icon={<Check size={14} />}
                >
                  Save
                </Button>
                {hasKey && (
                  <Button
                    variant="danger-subtle"
                    onClick={handleClearLicenseKey}
                    disabled={isSavingLicenseKey}
                    title="Clear license key"
                    icon={<X size={14} />}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </SettingRow>
          ) : (
            <SettingRow
              label="License Key"
              badge={
                hasKey ? <Badge tone="success">Configured</Badge> : <Badge>Not configured</Badge>
              }
              description={
                <>
                  {hasKey
                    ? 'Using fast Document Manager API for file reading.'
                    : 'Using SolidWorks API (slower, launches SW in background).'}
                  <span className="block">
                    Ask an organization admin to configure the license key.
                  </span>
                </>
              }
            />
          )}
        </SettingsGroup>
      </SettingsSection>

      {/* SOLIDWORKS Licenses (Organization-wide) */}
      <LicenseManagerSection />
    </SettingsPage>
  )
}
