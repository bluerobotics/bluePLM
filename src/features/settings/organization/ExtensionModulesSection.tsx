import { Lock } from 'lucide-react'

import { Badge, Select, Switch } from '@/components/core/ui'
import { getModuleIcon } from '@/components/layout/ActivityBar/utils'
import { SettingsGroup, SettingsSection } from '@/features/settings/components/ui'
import { t } from '@/lib/i18n'
import { usePDMStore } from '@/stores/pdmStore'
import { MODULES, type ModuleConfig, type ModuleId } from '@/types/modules'
import type { ExtensionWorkspace } from '@/types/nativeExtensions'

import {
  getExtensionModulePlacement,
  isExtensionModuleEnabled,
  setExtensionModuleEnabled,
  setExtensionModulePlacement,
  type ExtensionModulePlacement,
} from './extensionModules'

function encodePlacement(placement: ExtensionModulePlacement): string {
  return typeof placement === 'string' ? placement : `after:${placement.after}`
}

function decodePlacement(value: string): ExtensionModulePlacement {
  if (value === 'default' || value === 'top') return value
  return { after: value.slice('after:'.length) }
}

/** Entries of the saved order a workspace can follow, with display names. */
function placementAnchors(
  config: ModuleConfig,
  workspaces: readonly ExtensionWorkspace[],
  self: string,
): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = []
  for (const id of config.moduleOrder as readonly string[]) {
    if (id === self) continue
    const name =
      MODULES.find((m) => m.id === id)?.name ?? workspaces.find((w) => w.id === id)?.title
    if (name) out.push({ id, name })
  }
  return out
}

interface ExtensionModulesSectionProps {
  config: ModuleConfig
  onConfigChange: (config: ModuleConfig) => void
  deniedModuleIds?: ReadonlySet<ModuleId>
}

/**
 * Visibility and position of native extension workspaces, below the core
 * sidebar order in every module editor (your own modules, the organization
 * defaults and team defaults). Lists the workspaces loaded in this window. A
 * workspace is placed by its group until a position is chosen here, which
 * saves it in the module order (see placeExtensionModules).
 */
export function ExtensionModulesSection({
  config,
  onConfigChange,
  deniedModuleIds,
}: ExtensionModulesSectionProps) {
  const workspaces = usePDMStore((s) => s.extensionWorkspaces)
  if (workspaces.length === 0) return null

  return (
    <SettingsSection
      title={t('nativeExtensions.modulesTitle')}
      description={t('nativeExtensions.modulesDescription')}
    >
      <SettingsGroup>
        {workspaces.map((ws) => {
          const denied = (deniedModuleIds as ReadonlySet<string> | undefined)?.has(ws.id) ?? false
          const enabled = isExtensionModuleEnabled(config, ws.id)
          const placement = getExtensionModulePlacement(config, ws.id)
          const anchors = placementAnchors(config, workspaces, ws.id)
          if (typeof placement !== 'string' && !anchors.some((a) => a.id === placement.after)) {
            anchors.push({ id: placement.after, name: placement.after })
          }
          return (
            <div key={ws.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-plm-fg-muted">{getModuleIcon(ws.icon, 16)}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-plm-fg">{ws.title}</div>
                <div className="truncate text-[12px] text-plm-fg-muted">
                  {t('nativeExtensions.moduleFrom', { extension: ws.extensionId })}
                </div>
              </div>
              {denied && (
                <span title={t('nativeExtensions.moduleRestricted')}>
                  <Badge icon={<Lock size={10} />}>
                    <span className="sr-only">{t('nativeExtensions.moduleRestricted')}</span>
                  </Badge>
                </span>
              )}
              <Select
                size="sm"
                value={encodePlacement(placement)}
                onChange={(e) =>
                  onConfigChange(
                    setExtensionModulePlacement(config, ws.id, decodePlacement(e.target.value)),
                  )
                }
                aria-label={t('nativeExtensions.modulePosition', { workspace: ws.title })}
                title={t('nativeExtensions.modulePosition', { workspace: ws.title })}
                className="max-w-[11rem]"
              >
                <option value="default">{t('nativeExtensions.modulePositionDefault')}</option>
                <option value="top">{t('nativeExtensions.modulePositionTop')}</option>
                {anchors.map((a) => (
                  <option key={a.id} value={`after:${a.id}`}>
                    {t('nativeExtensions.modulePositionAfter', { module: a.name })}
                  </option>
                ))}
              </Select>
              <Switch
                checked={enabled}
                aria-label={ws.title}
                disabled={denied}
                onChange={() => onConfigChange(setExtensionModuleEnabled(config, ws.id, !enabled))}
                title={denied ? t('nativeExtensions.moduleRestricted') : undefined}
              />
            </div>
          )
        })}
      </SettingsGroup>
    </SettingsSection>
  )
}
