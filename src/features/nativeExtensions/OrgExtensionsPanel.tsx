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
import { Check, Copy, Loader2, Power, PowerOff, Puzzle, RefreshCw, Trash2, Upload } from 'lucide-react'
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
    <div className="mt-3 rounded-lg border border-plm-warning/40 bg-plm-warning/10 p-3 text-sm">
      <p className="font-medium text-plm-fg">{t('nativeExtensions.sqlTitle')}</p>
      <p className="mt-1 text-xs text-plm-fg-muted">{t('nativeExtensions.sqlBody')}</p>
      <ul className="mt-2 space-y-1">
        {files.map((file) => (
          <li key={file.name} className="flex items-center gap-2">
            <code className="text-xs text-plm-fg">{file.name}</code>
            <button
              className="btn btn-ghost btn-sm flex items-center gap-1"
              onClick={async () => {
                const result = await copyToClipboard(file.content)
                if (result.success) setCopied(file.name)
              }}
            >
              {copied === file.name ? <Check size={12} /> : <Copy size={12} />}
              {copied === file.name ? t('nativeExtensions.copied') : t('nativeExtensions.copy')}
            </button>
          </li>
        ))}
      </ul>
    </div>
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
    <section className="mb-6 rounded-xl border border-plm-border bg-plm-bg-light p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-plm-fg flex items-center gap-2">
            <Puzzle size={18} className="text-plm-accent" />
            {t('nativeExtensions.sectionTitle')}
          </h2>
          <p className="mt-1 text-xs text-plm-fg-muted max-w-2xl">
            {t('nativeExtensions.sectionDescription')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            className="btn btn-ghost btn-sm flex items-center gap-1.5"
            disabled={!orgId || busy !== null}
            onClick={() => run('reload', reload)}
          >
            <RefreshCw size={14} className={busy === 'reload' ? 'animate-spin' : ''} />
            {t('nativeExtensions.reload')}
          </button>
          {isAdmin && available && (
            <button
              className="btn btn-primary btn-sm flex items-center gap-1.5"
              disabled={!orgId || busy !== null}
              onClick={pickPackage}
            >
              {busy === 'pick' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {t('nativeExtensions.installButton')}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-3 text-sm text-plm-error break-words">
          {t('nativeExtensions.error', { message: error })}
        </p>
      )}

      {pending && (
        <div className="mt-4 rounded-lg border border-plm-accent/40 bg-plm-accent/5 p-3">
          <p className="text-sm font-medium text-plm-fg">
            {t('nativeExtensions.confirmInstallTitle', {
              name: pending.manifest.name,
              version: pending.manifest.version,
            })}
          </p>
          <p className="mt-1 text-xs text-plm-fg-muted">{t('nativeExtensions.confirmInstallBody')}</p>
          <p className="mt-1 text-xs font-mono text-plm-fg-dim break-all">
            {pending.manifest.id} · SHA-256 {pending.sha256}
          </p>
          <SqlFiles files={pending.sqlFiles} />
          <div className="mt-3 flex gap-2">
            <button
              className="btn btn-primary btn-sm flex items-center gap-1.5"
              disabled={busy !== null}
              onClick={confirmInstall}
            >
              {busy === 'install' && <Loader2 size={14} className="animate-spin" />}
              {t('nativeExtensions.confirm')}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPending(null)}>
              {t('nativeExtensions.cancel')}
            </button>
          </div>
        </div>
      )}

      <SqlFiles files={installedSql} />

      <ul className="mt-4 divide-y divide-plm-border">
        {rows.length === 0 && (
          <li className="py-3 text-sm text-plm-fg-muted">{t('nativeExtensions.none')}</li>
        )}
        {rows.map((row) => {
          const state = states[row.extensionId]
          const name = typeof row.manifest.name === 'string' ? row.manifest.name : row.extensionId
          return (
            <li key={row.extensionId} className="py-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-plm-fg">
                  {name} <span className="text-plm-fg-muted">{row.version}</span>
                </p>
                <p className="text-xs text-plm-fg-muted">
                  {row.extensionId} · {statusText(row)}
                </p>
                {row.enabled && state?.status === 'error' && state.error && (
                  <p className="mt-1 text-xs text-plm-error break-words">{state.error}</p>
                )}
              </div>
              {isAdmin && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    className="btn btn-ghost btn-sm flex items-center gap-1"
                    disabled={busy !== null}
                    onClick={() => toggle(row)}
                  >
                    {row.enabled ? <PowerOff size={14} /> : <Power size={14} />}
                    {row.enabled ? t('nativeExtensions.disable') : t('nativeExtensions.enable')}
                  </button>
                  {confirmUninstall === row.extensionId ? (
                    <button
                      className="btn btn-danger btn-sm flex items-center gap-1"
                      disabled={busy !== null}
                      onClick={() => uninstall(row)}
                    >
                      <Trash2 size={14} />
                      {t('nativeExtensions.confirmUninstall', { name })}
                    </button>
                  ) : (
                    <button
                      className="btn btn-ghost btn-sm flex items-center gap-1 text-plm-error"
                      disabled={busy !== null}
                      onClick={() => setConfirmUninstall(row.extensionId)}
                    >
                      <Trash2 size={14} />
                      {t('nativeExtensions.uninstall')}
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
