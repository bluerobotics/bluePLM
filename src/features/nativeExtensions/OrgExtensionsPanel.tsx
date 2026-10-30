/**
 * Settings > Extensions: organization-installed native extensions.
 *
 * Admins install a .bpx for the whole organization: main validates the package
 * and computes its SHA-256 (extensions:native-inspect), the renderer uploads it
 * to the org-extensions bucket and upserts org_installed_extensions with that
 * hash. Every desktop and the API then run only bytes that match it. SQL files a
 * package ships are shown for the admin to apply in the Supabase SQL editor;
 * nothing here runs SQL.
 */
import { useState } from 'react'
import { Check, Copy, Power, PowerOff, RefreshCw, Trash2, Upload } from 'lucide-react'

import { usePDMStore } from '@/stores/pdmStore'
import { t } from '@/lib/i18n'
import { log } from '@/lib/logger'
import { copyToClipboard } from '@/lib/clipboard'
import {
  installOrgNativeExtension,
  setOrgNativeExtensionEnabled,
  uninstallOrgNativeExtension,
} from '@/lib/nativeExtensions/orgExtensions'
import { reloadNativeExtensions } from '@/lib/nativeExtensions/runtime'
import type { NativeExtensionManifest, OrgNativeExtensionRow } from '@/types/nativeExtensions'
import { Badge, Button, Callout } from '@/components/core/ui'
import { SettingsGroup, SettingsSection } from '@/features/settings/components/ui'

interface PendingInstall {
  manifest: NativeExtensionManifest
  sha256: string
  size: number
  sqlFiles: Array<{ name: string; content: string }>
  data: Uint8Array
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function SqlFiles({ files }: { files: Array<{ name: string; content: string }> }) {
  const [copied, setCopied] = useState<string | null>(null)
  if (files.length === 0) return null
  return (
    <Callout tone="warning" title={t('nativeExtensions.sqlTitle')} className="mt-3">
      <p>{t('nativeExtensions.sqlBody')}</p>
      <ul className="mt-2 space-y-1">
        {files.map((file) => (
          <li key={file.name} className="flex items-center gap-2">
            <code className="font-mono text-[13px] text-ui-fg">{file.name}</code>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                const result = await copyToClipboard(file.content)
                if (result.success) setCopied(file.name)
              }}
              icon={copied === file.name ? <Check size={12} /> : <Copy size={12} />}
            >
              {copied === file.name ? t('nativeExtensions.copied') : t('nativeExtensions.copy')}
            </Button>
          </li>
        ))}
      </ul>
    </Callout>
  )
}

export function OrgExtensionsPanel() {
  const isAdmin = usePDMStore((s) => s.getEffectiveRole() === 'admin')
  const orgId = usePDMStore((s) => s.organization?.id ?? null)
  const userId = usePDMStore((s) => s.user?.id ?? null)
  const rows = usePDMStore((s) => s.orgNativeExtensionRows)
  const states = usePDMStore((s) => s.nativeExtensions)
  const addToast = usePDMStore((s) => s.addToast)

  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingInstall | null>(null)
  const [installedSql, setInstalledSql] = useState<PendingInstall['sqlFiles']>([])
  const [confirmUninstall, setConfirmUninstall] = useState<string | null>(null)

  const available = !!window.electronAPI?.extensions?.nativeInspect

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key)
    setError(null)
    try {
      await action()
    } catch (e) {
      const message = messageOf(e)
      log.error('[NativeExt]', 'Organization extension action failed', { key, error: message })
      setError(message)
    } finally {
      setBusy(null)
    }
  }

  const reload = async () => {
    if (orgId) await reloadNativeExtensions(orgId)
  }

  const pickPackage = () =>
    run('pick', async () => {
      const api = window.electronAPI
      if (!api) return
      const result = await api.extensions.nativeInspect()
      if (!result.success) {
        if (!result.canceled) throw new Error(result.error ?? 'Invalid package')
        return
      }
      setInstalledSql([])
      setPending({
        manifest: result.manifest,
        sha256: result.sha256,
        size: result.size,
        sqlFiles: result.sqlFiles,
        data: result.data,
      })
    })

  const confirmInstall = () =>
    run('install', async () => {
      if (!pending || !orgId) return
      await installOrgNativeExtension({
        orgId,
        userId,
        manifest: pending.manifest,
        sha256: pending.sha256,
        data: pending.data,
      })
      addToast(
        'success',
        t('nativeExtensions.installed', {
          name: pending.manifest.name,
          version: pending.manifest.version,
        }),
      )
      setInstalledSql(pending.sqlFiles)
      setPending(null)
      await reload()
    })

  const toggle = (row: OrgNativeExtensionRow) =>
    run(`toggle:${row.extensionId}`, async () => {
      if (!orgId) return
      await setOrgNativeExtensionEnabled(orgId, row.extensionId, !row.enabled)
      await reload()
    })

  const uninstall = (row: OrgNativeExtensionRow) =>
    run(`uninstall:${row.extensionId}`, async () => {
      setConfirmUninstall(null)
      await uninstallOrgNativeExtension(row)
      await reload()
    })

  const statusText = (row: OrgNativeExtensionRow): string => {
    const state = states[row.extensionId]
    if (!row.enabled) return t('nativeExtensions.statusDisabled')
    switch (state?.status) {
      case 'active':
        return t('nativeExtensions.statusActive')
      case 'loading':
        return t('nativeExtensions.statusLoading')
      case 'error':
        return t('nativeExtensions.statusError')
      default:
        return t('nativeExtensions.statusNotLoaded')
    }
  }

  return (
    <SettingsSection
      title={t('nativeExtensions.sectionTitle')}
      description={t('nativeExtensions.sectionDescription')}
      actions={
        <>
          <Button
            variant="ghost"
            size="sm"
            disabled={!orgId || busy !== null}
            onClick={() => run('reload', reload)}
            icon={<RefreshCw size={14} className={busy === 'reload' ? 'animate-spin' : ''} />}
          >
            {t('nativeExtensions.reload')}
          </Button>
          {isAdmin && available && (
            <Button
              variant="primary"
              size="sm"
              disabled={!orgId || busy !== null}
              loading={busy === 'pick'}
              onClick={pickPackage}
              icon={<Upload size={14} />}
            >
              {t('nativeExtensions.installButton')}
            </Button>
          )}
        </>
      }
    >
      {error && <Callout className="mt-3" tone="error">{t('nativeExtensions.error', { message: error })}</Callout>}

      {pending && (
        <Callout
          className="mt-3"
          tone="info"
          title={t('nativeExtensions.confirmInstallTitle', {
            name: pending.manifest.name,
            version: pending.manifest.version,
          })}
        >
          <p>{t('nativeExtensions.confirmInstallBody')}</p>
          <p className="mt-1 break-all font-mono text-[13px] text-ui-fg-secondary">
            {pending.manifest.id} · SHA-256 {pending.sha256}
          </p>
          <SqlFiles files={pending.sqlFiles} />
          <div className="mt-3 flex gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={busy !== null}
              loading={busy === 'install'}
              onClick={confirmInstall}
            >
              {t('nativeExtensions.confirm')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPending(null)}>
              {t('nativeExtensions.cancel')}
            </Button>
          </div>
        </Callout>
      )}

      <SqlFiles files={installedSql} />

      <SettingsGroup>
        {rows.length === 0 && (
          <div className="py-4 text-[14px] text-ui-fg-secondary">
            {t('nativeExtensions.none')}
          </div>
        )}
        {rows.map((row) => {
          const state = states[row.extensionId]
          const name = typeof row.manifest.name === 'string' ? row.manifest.name : row.extensionId
          return (
            <div key={row.extensionId} className="flex items-start gap-3 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[14px] text-ui-fg">
                  {name}
                  <span className="text-ui-fg-secondary">{row.version}</span>
                  <Badge
                    tone={
                      row.enabled ? (state?.status === 'error' ? 'error' : 'success') : 'neutral'
                    }
                  >
                    {statusText(row)}
                  </Badge>
                </div>
                <div className="mt-1 text-[14px] text-ui-fg-secondary">{row.extensionId}</div>
                {row.enabled && state?.status === 'error' && state.error && (
                  <p className="mt-1 break-words text-[13px] text-ui-danger">{state.error}</p>
                )}
              </div>
              {isAdmin && (
                <div className="flex flex-shrink-0 items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => toggle(row)}
                    icon={row.enabled ? <PowerOff size={14} /> : <Power size={14} />}
                  >
                    {row.enabled ? t('nativeExtensions.disable') : t('nativeExtensions.enable')}
                  </Button>
                  {confirmUninstall === row.extensionId ? (
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => uninstall(row)}
                      icon={<Trash2 size={14} />}
                    >
                      {t('nativeExtensions.confirmUninstall', { name })}
                    </Button>
                  ) : (
                    <Button
                      variant="danger-subtle"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => setConfirmUninstall(row.extensionId)}
                      icon={<Trash2 size={14} />}
                    >
                      {t('nativeExtensions.uninstall')}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </SettingsGroup>
    </SettingsSection>
  )
}
