import { useState } from 'react'
import { Check, Copy, Plus, X } from 'lucide-react'

import { Button, Switch, TextInput } from '@/components/core/ui'
import { copyToClipboard } from '@/lib/clipboard'
import { useTranslation } from '@/lib/i18n'
import { joinLinkFor } from '@/lib/joinLink'
import { getCurrentConfig } from '@/lib/supabase'
import { generateOrgCode } from '@/lib/supabaseConfig'

import { SettingRow, SettingsGroup, SettingsSection } from '../../../components/ui'
import { useEmailDomainSettings } from '../hooks/useEmailDomainSettings'

interface OrganizationAccessSectionProps {
  orgSlug: string | undefined
  orgCode: string | null
  setOrgCode: (code: string | null) => void
  codeCopied: boolean
  setCodeCopied: (copied: boolean) => void
}

/** Admin-only: how new members join (organization code, web join link, email domains). */
export function OrganizationAccessSection({
  orgSlug,
  orgCode,
  setOrgCode,
  codeCopied,
  setCodeCopied,
}: OrganizationAccessSectionProps) {
  const { t } = useTranslation()
  const [joinLinkCopied, setJoinLinkCopied] = useState(false)
  const {
    emailDomains,
    enforceEmailDomain,
    newDomain,
    setNewDomain,
    savingDomains,
    handleAddDomain,
    handleRemoveDomain,
    handleToggleEnforcement,
  } = useEmailDomainSettings()

  const copyOrgCode = async () => {
    // Generate code if not already generated
    let code = orgCode
    if (!code) {
      const config = getCurrentConfig()
      if (config) {
        code = generateOrgCode(config, orgSlug)
        setOrgCode(code)
      }
    }
    if (code) {
      const result = await copyToClipboard(code)
      if (result.success) {
        setCodeCopied(true)
        setTimeout(() => setCodeCopied(false), 2000)
      }
    }
  }

  const copyJoinLink = async () => {
    const config = getCurrentConfig()
    const code = orgCode || (config ? generateOrgCode(config, orgSlug) : null)
    if (!code) return
    const result = await copyToClipboard(joinLinkFor(code))
    if (result.success) {
      setJoinLinkCopied(true)
      setTimeout(() => setJoinLinkCopied(false), 2000)
    }
  }

  const copiedIcon = (copied: boolean) =>
    copied ? <Check size={14} className="text-plm-success" /> : <Copy size={14} />

  return (
    <SettingsSection title="Joining">
      <SettingsGroup>
        <SettingRow label="Organization Code" description="Share to invite new members">
          <Button
            size="sm"
            onClick={copyOrgCode}
            title="Click to copy"
            icon={copiedIcon(codeCopied)}
            className="font-mono"
          >
            {orgCode ? `${orgCode.substring(0, 24)}...` : '...'}
          </Button>
        </SettingRow>

        {/* Web join link: opens blueplm.io connected to this organization (src/lib/joinLink.ts) */}
        <SettingRow label={t('setup.webJoinLink')} description={t('setup.webJoinLinkDesc')}>
          <Button
            size="sm"
            onClick={copyJoinLink}
            title={t('setup.copyWebJoinLink')}
            icon={copiedIcon(joinLinkCopied)}
            className="font-mono"
          >
            blueplm.io/join#…
          </Button>
        </SettingRow>

        <SettingRow
          label="Email Domain Restriction"
          htmlFor="enforce-email-domain"
          description={
            enforceEmailDomain
              ? emailDomains.length > 0
                ? `Only @${emailDomains.join(', @')}`
                : 'Enabled (no domains set)'
              : 'Anyone with the code can join'
          }
        >
          <Switch
            id="enforce-email-domain"
            checked={enforceEmailDomain}
            onChange={() => handleToggleEnforcement()}
          />
        </SettingRow>

        {enforceEmailDomain && (
          <SettingRow label="Allowed Domains" stacked>
            <div className="space-y-2.5">
              {emailDomains.length === 0 ? (
                <div className="text-[12px] text-plm-fg-muted">
                  No domains configured. Add one below.
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {emailDomains.map((domain, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 rounded-md border border-plm-border bg-plm-bg py-0.5 pl-2 pr-0.5 text-[12px] text-plm-fg"
                    >
                      @{domain}
                      <button
                        type="button"
                        onClick={() => handleRemoveDomain(idx, domain)}
                        className="rounded p-0.5 text-plm-fg-muted transition-colors hover:bg-plm-error/15 hover:text-plm-error"
                        title="Remove domain"
                        aria-label="Remove domain"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex max-w-md gap-2">
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-plm-fg-muted">
                    @
                  </span>
                  <TextInput
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value.toLowerCase().replace(/^@/, ''))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newDomain.trim()) {
                        e.preventDefault()
                        handleAddDomain()
                      }
                    }}
                    placeholder="example.com"
                    className="pl-6"
                  />
                </div>
                <Button
                  onClick={handleAddDomain}
                  disabled={!newDomain.trim()}
                  loading={savingDomains}
                  icon={<Plus size={14} />}
                >
                  Add
                </Button>
              </div>
            </div>
          </SettingRow>
        )}
      </SettingsGroup>
    </SettingsSection>
  )
}
