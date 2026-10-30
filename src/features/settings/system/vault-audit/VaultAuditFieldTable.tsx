import { t } from '@/lib/i18n'
import type { FieldTally } from '@/lib/metadata/divergence'

import { fieldLabel } from './vaultAuditLabels'

interface VaultAuditFieldTableProps {
  tallies: FieldTally[]
}

/** The scanner's per-field breakdown, for working out which field is carrying the damage. */
export function VaultAuditFieldTable({ tallies }: VaultAuditFieldTableProps) {
  if (tallies.length === 0) return null

  return (
    <section className="space-y-2">
      <h3 className="text-[14px] font-semibold text-ui-fg">{t('vaultAudit.fields.heading')}</h3>

      <div className="overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="border-b border-ui-divider text-ui-fg-secondary">
            <tr>
              <th className="text-left font-normal px-2 py-2.5 first:pl-0 last:pr-0">
                {t('vaultAudit.fields.columnField')}
              </th>
              <th className="text-right font-normal px-2 py-2.5 first:pl-0 last:pr-0">
                {t('vaultAudit.fields.columnCompared')}
              </th>
              <th className="text-right font-normal px-2 py-2.5 first:pl-0 last:pr-0">
                {t('vaultAudit.fields.columnAgrees')}
              </th>
              <th className="text-right font-normal px-2 py-2.5 first:pl-0 last:pr-0">
                {t('vaultAudit.fields.columnFileEmpty')}
              </th>
              <th className="text-right font-normal px-2 py-2.5 first:pl-0 last:pr-0">
                {t('vaultAudit.fields.columnDatabaseEmpty')}
              </th>
              <th className="text-right font-normal px-2 py-2.5 first:pl-0 last:pr-0">
                {t('vaultAudit.fields.columnDiffer')}
              </th>
            </tr>
          </thead>
          <tbody>
            {tallies.map((tally) => (
              <tr key={`${tally.scope}:${tally.field}`} className="border-t border-ui-divider">
                <td className="px-2 py-2.5 first:pl-0 last:pr-0 text-ui-fg">
                  {fieldLabel(tally.field)}
                  <span className="text-ui-fg-secondary ml-1.5">
                    {tally.scope === 'file'
                      ? t('divergence.scope.file')
                      : t('divergence.scope.configuration')}
                  </span>
                </td>
                <td className="px-2 py-2.5 first:pl-0 last:pr-0 text-right text-ui-fg-secondary">
                  {tally.compared}
                </td>
                <td className="px-2 py-2.5 first:pl-0 last:pr-0 text-right text-ui-fg-secondary">
                  {tally.agrees}
                </td>
                <td className="px-2 py-2.5 first:pl-0 last:pr-0 text-right text-ui-fg-secondary">
                  {tally.fileEmpty}
                </td>
                <td className="px-2 py-2.5 first:pl-0 last:pr-0 text-right text-ui-fg-secondary">
                  {tally.databaseEmpty}
                </td>
                <td
                  className={`px-2 py-2.5 first:pl-0 last:pr-0 text-right ${
                    tally.bothSetDiffer > 0 ? 'text-ui-warning' : 'text-ui-fg-secondary'
                  }`}
                >
                  {tally.bothSetDiffer}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
