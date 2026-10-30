import { t } from '@/lib/i18n'
import type { VaultAuditCategory, VaultAuditCategoryKind } from '@/types/vaultAudit'

import { categoryDescription, categoryLabel, TONE_TEXT } from './vaultAuditLabels'

interface VaultAuditCategoriesProps {
  categories: VaultAuditCategory[]
  selected: VaultAuditCategoryKind | null
  onSelect: (kind: VaultAuditCategoryKind) => void
}

/**
 * The six categories, worst first, as the rail beside the file list.
 *
 * All six are always shown, including the empty ones, because "no values are lost" is the answer
 * an administrator came for and an entry that disappears when it hits zero cannot give it.
 *
 * Each is titled by what resolving it consists of rather than by what the evidence is: "Copy the
 * file's value into BluePLM" is the fix, where "The file still has it" leaves the reader to work
 * out which way it runs. The evidence is the description, shown above the list for the selected
 * category and on hover for the rest.
 *
 * They used to be a grid of cards above the list, which pushed the list below the fold and made
 * choosing one look like it did nothing. As a rail they stay beside the list they filter.
 */
export function VaultAuditCategories({
  categories,
  selected,
  onSelect,
}: VaultAuditCategoriesProps) {
  return (
    <nav aria-label={t('vaultAudit.category.heading')} className="space-y-1">
      <h3 className="px-2 pb-1 text-[13px] font-medium text-ui-fg-secondary">
        {t('vaultAudit.category.heading')}
      </h3>

      {categories.map((category) => {
        const empty = category.valueCount === 0
        const isSelected = selected === category.kind

        return (
          <button
            key={category.kind}
            type="button"
            onClick={() => onSelect(category.kind)}
            disabled={empty}
            aria-pressed={isSelected}
            title={categoryDescription(category.kind)}
            className={`w-full text-left px-2.5 py-2 rounded-md border-l-2 transition-colors ${
              isSelected
                ? 'border-ui-accent bg-ui-hover'
                : 'border-transparent hover:bg-ui-field'
            } ${empty ? 'opacity-50 cursor-default hover:bg-transparent' : ''}`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className={`text-[13px] ${isSelected ? 'text-ui-fg' : 'text-ui-fg/90'}`}>
                {categoryLabel(category.kind)}
              </span>
              <span
                className={`text-[13px] font-mono tabular-nums flex-shrink-0 ${
                  empty ? 'text-ui-fg-secondary' : TONE_TEXT[category.tone]
                }`}
              >
                {category.valueCount}
              </span>
            </div>
            {!empty && (
              <span className="block text-[12px] text-ui-fg-secondary mt-0.5">
                {t('vaultAudit.category.files', { count: category.fileCount })}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
