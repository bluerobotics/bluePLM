/**
 * Vault Audit - an administrator's view of the read-only divergence scan.
 *
 * The scan has existed as `npm run scan:divergence` since it was written, which put the one person
 * who most needs its answer behind a terminal. This is the same scan, the same classification and
 * the same artifact, presented so that "do BluePLM and my files still agree?" can be answered from
 * the application.
 *
 * ## What writes, and what does not
 *
 * The scan reads. Nothing in it opens a vault file for writing, and the documents are the only
 * surviving copy of what the configuration-map wipe destroyed, so that is not going to change.
 *
 * The writes live inside `VaultAuditFindings`, one category at a time, and only over what the
 * administrator has ticked. There used to be a separate repair section at the bottom of this page;
 * it was a second list of the same values with checkboxes the findings table did not have, and
 * nothing on screen explained how the two related. Choosing what is wrong and fixing it are one
 * task and are now in one place.
 *
 * Neither writer is made safe by anything in this file. The database one is bounded by a
 * `computed || existing` merge inside a `SECURITY DEFINER` function that gates on organization
 * membership and admin role; the document one is the Sync Metadata command, which refuses any file
 * that is not local-only or checked out by the caller. The admin check here decides what is worth
 * rendering, and that is all it decides.
 */

import { useEffect, useRef, useState } from 'react'
import { ChevronRight, Trash2 } from 'lucide-react'

import { Button, Callout } from '@/components/core/ui'
import { SwServiceVersionNotice } from '@/components/shared'
import { t } from '@/lib/i18n'
import { SW_SERVICE_VERSION_DOCUMENT_MANAGER_READ } from '@/lib/swServiceVersion'
import type { VaultAuditCategoryKind } from '@/types/vaultAudit'

import { useVaultAudit } from './useVaultAudit'
import { VaultAuditCategories } from './VaultAuditCategories'
import { VaultAuditCoverage } from './VaultAuditCoverage'
import { VaultAuditFieldTable } from './VaultAuditFieldTable'
import { VaultAuditFindings } from './VaultAuditFindings'
import { VaultAuditOverview } from './VaultAuditOverview'
import { VaultAuditProgress } from './VaultAuditProgress'
import { VaultAuditRevisionRule } from './VaultAuditRevisionRule'
import { VaultAuditScopeForm } from './VaultAuditScopeForm'
import { SettingsSection } from '../../components/ui'
import { categoryDescription, categoryLabel } from './vaultAuditLabels'
import { hasEvidence } from './vaultAuditView'

export function VaultAuditSettings() {
  const audit = useVaultAudit()
  const [selectedCategory, setSelectedCategory] = useState<VaultAuditCategoryKind | null>(null)
  const findingsRef = useRef<HTMLDivElement>(null)

  // A fresh result opens on its worst non-empty category, so the list is there without a click.
  // A category that emptied (after a re-run, or the revision rule) gives way the same way.
  const categories = audit.view?.categories
  useEffect(() => {
    if (!categories) return
    setSelectedCategory((current) => {
      const stillThere = categories.some(
        (category) => category.kind === current && category.valueCount > 0,
      )
      if (stillThere) return current
      return categories.find((category) => category.valueCount > 0)?.kind ?? null
    })
  }, [categories])

  // On a short window the list starts below the fold; bring it up when a category is chosen.
  const handleSelectCategory = (kind: VaultAuditCategoryKind) => {
    setSelectedCategory(kind)
    requestAnimationFrame(() =>
      findingsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
    )
  }

  return (
    <SettingsSection title={t('vaultAudit.title')} description={t('vaultAudit.description')}>
      {!audit.isAdmin ? (
        <Callout>{t('vaultAudit.adminOnly')}</Callout>
      ) : (
        <div className="space-y-6">
          <p className="text-[13px] text-ui-fg-secondary">{t('vaultAudit.readOnlyNote')}</p>

          {audit.serviceCheck && (
            <SwServiceVersionNotice
              check={audit.serviceCheck}
              requirement={
                audit.serviceTooOld
                  ? t('vaultAudit.serviceTooOld', {
                      version: SW_SERVICE_VERSION_DOCUMENT_MANAGER_READ,
                    })
                  : undefined
              }
            />
          )}

          <VaultAuditScopeForm
            scope={audit.scope}
            onScopeChange={audit.setScope}
            isRunning={audit.isRunning}
            canScan={audit.canScan}
            blocked={audit.serviceTooOld}
            cancelRequested={audit.cancelRequested}
            hasResult={audit.view !== null}
            onStart={audit.start}
            onCancel={audit.cancel}
          />

          {audit.isRunning && <VaultAuditProgress progress={audit.progress} />}

          {audit.runState === 'failed' && audit.error && (
            <Callout tone="error">{audit.error}</Callout>
          )}

          {audit.view && (
            <div className="space-y-6 pt-4 border-t border-ui-divider">
              <VaultAuditOverview view={audit.view} artifactPath={audit.artifactPath} />

              {/*
                Every section below is a count over files that were read, and every one of them
                reads as an all-clear at zero - "no findings", "every record describes exactly the
                configurations its file has", in green. A run that compared nothing earns none of
                those statements, so it gets the overview's explanation on its own.
              */}
              {hasEvidence(audit.view) && (
                <>
                  {/*
                    The list is the page: categories in a rail on the left, the files of the chosen
                    one filling the rest. The revision rule sits in the rail because it changes the
                    counts there, and reading a total before the rule that produced it is the wrong
                    order.
                  */}
                  <div className="flex flex-col lg:flex-row gap-4 items-start">
                    <aside className="w-full lg:w-64 flex-shrink-0 space-y-3 lg:sticky lg:top-0">
                      <VaultAuditCategories
                        categories={audit.view.categories}
                        selected={selectedCategory}
                        onSelect={handleSelectCategory}
                      />
                      <VaultAuditRevisionRule
                        expectRevisionOnModels={audit.expectRevisionOnModels}
                        hiddenCount={audit.view.revisionOnModelsHidden}
                        onChange={audit.setExpectRevisionOnModels}
                      />
                    </aside>

                    <div ref={findingsRef} className="flex-1 min-w-0 w-full space-y-2 scroll-mt-4">
                      {/* No category is chosen only when all six are empty, which the overview
                          has already said in words. */}
                      {selectedCategory && (
                        <>
                          <div>
                            <h4 className="text-[14px] font-semibold text-ui-fg">
                              {categoryLabel(selectedCategory)}
                            </h4>
                            <p className="text-[13px] text-ui-fg-secondary">
                              {categoryDescription(selectedCategory)}
                            </p>
                          </div>
                          <VaultAuditFindings
                            findings={audit.view.findings}
                            kind={selectedCategory}
                          />
                        </>
                      )}
                    </div>
                  </div>

                  {/* Context for the numbers, not something to act on, so it stays folded. */}
                  <details className="group rounded-lg border border-ui-divider bg-ui-field/60">
                    <summary className="flex cursor-pointer select-none list-none items-center gap-1.5 px-4 py-2.5 text-[14px] text-ui-fg-secondary hover:text-ui-fg">
                      <ChevronRight
                        size={14}
                        className="transition-transform group-open:rotate-90"
                      />
                      {t('vaultAudit.details.heading')}
                    </summary>
                    <div className="space-y-6 px-4 pb-4 pt-1">
                      <VaultAuditCoverage coverage={audit.view.coverage} />
                      <VaultAuditFieldTable tallies={audit.view.fieldTallies} />
                    </div>
                  </details>
                </>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-ui-divider">
                <p className="max-w-2xl text-[13px] text-ui-fg-secondary">
                  {t('vaultAudit.result.notStored')}
                </p>
                <Button
                  size="sm"
                  icon={<Trash2 size={12} />}
                  onClick={() => {
                    setSelectedCategory(null)
                    audit.clear()
                  }}
                  disabled={audit.isRunning}
                >
                  {t('vaultAudit.clear')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </SettingsSection>
  )
}
