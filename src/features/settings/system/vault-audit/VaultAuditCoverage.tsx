import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

import { t } from '@/lib/i18n'
import type { VaultAuditCoverage as Coverage } from '@/types/vaultAudit'

interface VaultAuditCoverageProps {
  coverage: Coverage
}

/** Files listed before the "show all" toggle. Enough to see the shape of the problem. */
const INITIAL_ROWS = 10

/**
 * How the per-configuration records line up with the files they describe.
 *
 * Two columns, kept apart on purpose. Undescribed configurations are values the record has stopped
 * carrying. Stale entries are keys for configurations that have gone, which is clutter. Merging
 * them - or worse, comparing entry counts against configuration counts - reports a file carrying
 * eleven leftover keys as having lost eleven values, when it has lost nothing.
 */
export function VaultAuditCoverage({ coverage }: VaultAuditCoverageProps) {
  const [showAll, setShowAll] = useState(false)

  const rows = showAll ? coverage.files : coverage.files.slice(0, INITIAL_ROWS)
  const aligned =
    coverage.filesWithUndescribedConfigurations === 0 && coverage.filesWithStaleKeys === 0

  return (
    <section className="space-y-2">
      <h3 className="text-[14px] font-semibold text-ui-fg">{t('vaultAudit.coverage.heading')}</h3>
      <p className="text-[13px] text-ui-fg-secondary">{t('vaultAudit.coverage.description')}</p>

      {aligned ? (
        <p className="text-[13px] text-ui-success">{t('vaultAudit.coverage.allAligned')}</p>
      ) : (
        <ul className="text-[13px] text-ui-fg-secondary space-y-1">
          {coverage.filesWithUndescribedConfigurations > 0 && (
            <li className="text-ui-fg">
              {t('vaultAudit.coverage.undescribed', {
                files: coverage.filesWithUndescribedConfigurations,
              })}{' '}
              ·{' '}
              {t('vaultAudit.coverage.undescribedEntries', {
                count: coverage.undescribedConfigurationCount,
              })}
            </li>
          )}
          {coverage.filesWithEmptiedRecord > 0 && (
            <li>{t('vaultAudit.coverage.emptied', { count: coverage.filesWithEmptiedRecord })}</li>
          )}
          {coverage.filesWithStaleKeys > 0 && (
            <li>
              {t('vaultAudit.coverage.stale', {
                files: coverage.filesWithStaleKeys,
                count: coverage.staleKeyCount,
              })}
            </li>
          )}
          {coverage.filesWithNoRecord > 0 && (
            <li>{t('vaultAudit.coverage.noRecord', { count: coverage.filesWithNoRecord })}</li>
          )}
        </ul>
      )}

      {coverage.filesWithStaleKeys > 0 && (
        <p className="text-[13px] text-ui-fg-secondary">{t('vaultAudit.coverage.staleNote')}</p>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="border-b border-ui-divider text-ui-fg-secondary">
              <tr>
                <th className="text-left font-normal px-2 py-2.5 first:pl-0 last:pr-0">
                  {t('vaultAudit.coverage.columnFile')}
                </th>
                <th className="text-right font-normal px-2 py-2.5 first:pl-0 last:pr-0 w-28">
                  {t('vaultAudit.coverage.columnConfigurations')}
                </th>
                <th className="text-right font-normal px-2 py-2.5 first:pl-0 last:pr-0 w-28">
                  {t('vaultAudit.coverage.columnUndescribed')}
                </th>
                <th className="text-right font-normal px-2 py-2.5 first:pl-0 last:pr-0 w-28">
                  {t('vaultAudit.coverage.columnStale')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((file) => (
                <tr key={file.fileId} className="border-t border-ui-divider">
                  <td className="px-2 py-2.5 first:pl-0 last:pr-0 text-ui-fg font-mono truncate max-w-0">
                    <span title={file.relativePath}>{file.relativePath}</span>
                    {file.recordEmptied && (
                      <span className="ml-2 text-ui-danger">
                        {t('vaultAudit.coverage.recordEmptied')}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 first:pl-0 last:pr-0 text-right text-ui-fg-secondary">
                    {file.configurationCount}
                  </td>
                  <td
                    className={`px-2 py-2.5 first:pl-0 last:pr-0 text-right ${
                      file.undescribedConfigurations.length > 0
                        ? 'text-ui-danger'
                        : 'text-ui-fg-secondary'
                    }`}
                  >
                    {file.undescribedConfigurations.length}
                  </td>
                  <td className="px-2 py-2.5 first:pl-0 last:pr-0 text-right text-ui-fg-secondary">
                    {file.staleKeys.length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {coverage.files.length > INITIAL_ROWS && (
            <button
              onClick={() => setShowAll((current) => !current)}
              className="flex w-full items-center gap-1 border-t border-ui-divider py-2.5 text-[13px] text-ui-fg-secondary transition-colors hover:text-ui-fg"
            >
              {showAll ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {showAll
                ? t('vaultAudit.coverage.showFewer')
                : t('vaultAudit.coverage.showAll', { total: coverage.files.length })}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
