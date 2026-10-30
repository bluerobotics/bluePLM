/**
 * One category's findings, and the button that resolves them.
 *
 * This used to be a read-only list with a separate repair panel underneath it, and the two were
 * different views of overlapping data: the panel had checkboxes the list did not, over a subset of
 * the same values, with nothing on screen explaining the relationship. Selecting a category and
 * acting on it are the same task, so they are now the same section, and the repair panel is what
 * this renders when the category selected is the one it always covered.
 *
 * ## What a tick means depends on the direction, and that is not smoothed over
 *
 * The database writer works per value; the document writer is the Sync Metadata command and works
 * per file. So in a `write-to-file` category, ticking any row of a file selects that whole file,
 * and every row belonging to it ticks with it. Rendering those rows as individually selectable
 * would promise a precision the command does not have.
 *
 * ## Rows that cannot be acted on are still rows
 *
 * A category is one resolution, but not every row in it has a writer - a recoverable value in a
 * column rather than in a reserved map has nowhere to go until something writes columns. Those
 * stay in the table with no checkbox and a line saying why, rather than being filtered out, so the
 * count on the category card and the count in the table agree.
 *
 * ## Every row is here, and "all" means all of them
 *
 * The list used to be cut at two hundred rows, and select-all, shift-click and the footer count
 * were all computed from the cut. A category of twelve hundred values could neither be read nor
 * selected in full. Rows are now built for the whole category and drawn lazily by the table;
 * "select all" covers every selectable row the filter lets through, so what the button writes is
 * still what the administrator could see by scrolling, and the selection summary says so.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronsDownUp, ChevronsUpDown, Search, X } from 'lucide-react'

import { Button, FIELD_CLASS } from '@/components/core/ui'
import { t } from '@/lib/i18n'
import type { VaultAuditCategoryKind, VaultAuditFinding } from '@/types/vaultAudit'

import { rangeBetween } from './repairSelection'
import { VaultAuditConflictActionBar } from './VaultAuditConflictActionBar'
import { useVaultAuditPush } from './useVaultAuditPush'
import { useVaultAuditConflict } from './useVaultAuditConflict'
import { useVaultAuditRepair } from './useVaultAuditRepair'
import { useVaultAuditFill } from './useVaultAuditFill'
import { VaultAuditActionBar } from './VaultAuditActionBar'
import { VaultAuditFillActionBar } from './VaultAuditFillActionBar'
import { VaultAuditFileList } from './VaultAuditFileList'
import { VaultAuditSelectionBar } from './VaultAuditSelectionBar'
import { categoryDirectionOf } from './vaultAuditActions'
import {
  flattenGroups,
  groupRowsByFile,
  rowsInDisplayOrder,
  type VaultAuditFileGroup,
} from './vaultAuditGroups'
import { buildFindingRows, type VaultAuditFindingRow } from './vaultAuditRows'
import {
  hiddenSelectedRows,
  selectionChangeFor,
  summarizeSelection,
  type SelectionMode,
} from './vaultAuditSelection'
import {
  DEFAULT_FINDING_SORT,
  nextSort,
  sortFindings,
  type FindingSort,
  type FindingSortKey,
} from './vaultAuditSort'

interface VaultAuditFindingsProps {
  findings: VaultAuditFinding[]
  kind: VaultAuditCategoryKind | null
}

/** How long typing pauses before the filter is applied, so a long list is not re-filtered per key. */
const FILTER_DEBOUNCE_MS = 150

function haystackOf(finding: VaultAuditFinding): string {
  return [
    finding.relativePath,
    finding.configuration ?? '',
    finding.databaseValue ?? '',
    finding.fileValue ?? '',
  ]
    .join(' ')
    .toLowerCase()
}

export function VaultAuditFindings({ findings, kind }: VaultAuditFindingsProps) {
  const [filterInput, setFilterInput] = useState('')
  const [filter, setFilter] = useState('')
  const [actionableOnly, setActionableOnly] = useState(false)
  const [sort, setSort] = useState<FindingSort>(DEFAULT_FINDING_SORT)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const anchorId = useRef<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setFilter(filterInput), FILTER_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [filterInput])

  // A different category is a different list: an anchor from the last one points at nothing.
  useEffect(() => {
    anchorId.current = null
    setCollapsed(new Set())
  }, [kind])

  const repair = useVaultAuditRepair()
  const push = useVaultAuditPush(findings)
  const conflict = useVaultAuditConflict(findings)
  const fill = useVaultAuditFill(findings, push.heldByOthers)
  const { blockedReasonFor, canAdoptFileValue } = conflict

  // The proposal decides what may be written into a reserved map, and it knows two things a
  // finding does not: whether the row already carries a key for that configuration, and whether
  // derived tabs are being offered. Reduced to a set of ids so the table can ask per row.
  const repairable = useMemo(
    () => new Set(repair.candidates.map((candidate) => candidate.id)),
    [repair.candidates],
  )

  const inCategory = useMemo(
    () => (kind ? findings.filter((finding) => finding.kind === kind) : []),
    [findings, kind],
  )

  // The direction, not the availability. A category whose every file is checked out to a colleague
  // still writes into files, and the action bar has to say so rather than going blank.
  const action = useMemo(() => categoryDirectionOf(inCategory), [inCategory])

  const sorted = useMemo(() => sortFindings(inCategory, sort), [inCategory, sort])

  // Lower-cased once per category, not once per keystroke per finding.
  const haystacks = useMemo(() => {
    const map = new Map<string, string>()
    for (const finding of inCategory) map.set(finding.id, haystackOf(finding))
    return map
  }, [inCategory])

  // Every row of the category, whether or not the filter lets it through. The hidden-selection
  // count needs the rows the filter removed.
  const allRows = useMemo<VaultAuditFindingRow[]>(
    () =>
      buildFindingRows(sorted, {
        repairable,
        heldByOthers: push.heldByOthers,
        unsavedEdits: fill.unsavedEdits,
        repairSelected: repair.selectedIds,
        repairSettled: repair.settledIds,
        pushSelected: push.selectedFileIds,
        pushWritten: push.writtenFileIds,
        fillSelected: fill.selectedIds,
        fillSettled: fill.settledIds,
        conflictSelected: conflict.selectedFindingIds,
        conflictSettled: conflict.settledFindingIds,
        availability: push.availability,
        canAdoptFileValue,
        blockedReasonFor,
      }),
    [
      sorted,
      repairable,
      push.heldByOthers,
      push.selectedFileIds,
      push.writtenFileIds,
      push.availability,
      fill.unsavedEdits,
      fill.selectedIds,
      fill.settledIds,
      repair.selectedIds,
      repair.settledIds,
      conflict.selectedFindingIds,
      conflict.settledFindingIds,
      canAdoptFileValue,
      blockedReasonFor,
    ],
  )

  const visibleRows = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (!needle && !actionableOnly) return allRows
    return allRows.filter((row) => {
      if (actionableOnly && !row.selectable) return false
      return !needle || (haystacks.get(row.id) ?? '').includes(needle)
    })
  }, [allRows, haystacks, filter, actionableOnly])

  const groups = useMemo(() => groupRowsByFile(visibleRows), [visibleRows])
  // The order rows are drawn in, file by file. A shift-click range follows this, not the sort.
  const displayRows = useMemo(() => rowsInDisplayOrder(groups), [groups])
  const items = useMemo(() => flattenGroups(groups, collapsed), [groups, collapsed])

  const summary = useMemo(() => summarizeSelection(allRows, visibleRows), [allRows, visibleRows])

  const busy = repair.applying || push.running || conflict.applying || fill.applying

  const applySelection = (targets: readonly VaultAuditFindingRow[], selected: boolean) => {
    const toVault = targets.filter(
      (row) => row.action.available && row.action.kind === 'write-to-vault',
    )
    const toFile = targets.filter(
      (row) => row.action.available && row.action.kind === 'write-to-file',
    )
    const toFill = targets.filter((row) => row.action.available && row.action.kind === 'fill-empty')

    if (toFill.length > 0) {
      fill.setMany(
        toFill.map((row) => row.selectionId),
        selected,
      )
    }
    if (toVault.length > 0) {
      repair.setMany(
        toVault.map((row) => row.selectionId),
        selected,
      )
    }
    if (toFile.length > 0) {
      push.setManyFiles(
        toFile.map((row) => row.selectionId),
        selected,
      )
    }
  }

  const applyBulk = (mode: SelectionMode) => {
    const change = selectionChangeFor(visibleRows, mode)
    if (change.deselect.length > 0) applySelection(change.deselect, false)
    if (change.select.length > 0) applySelection(change.select, true)
  }

  const clearHidden = () => applySelection(hiddenSelectedRows(allRows, visibleRows), false)

  const handleToggle = (row: VaultAuditFindingRow, shiftKey: boolean) => {
    const selected = !row.selected

    if (shiftKey) {
      // Over every row the filter lets through, in the order they are displayed - not over what
      // happens to be drawn, which is why a range can span hundreds of rows.
      const span = rangeBetween(
        displayRows.map((candidate) => candidate.id),
        anchorId.current,
        row.id,
      )
      if (span) {
        const spanIds = new Set(span)
        applySelection(
          displayRows.filter((candidate) => spanIds.has(candidate.id) && candidate.selectable),
          selected,
        )
        anchorId.current = row.id
        return
      }
    }

    applySelection([row], selected)
    anchorId.current = row.id
  }

  const handleSort = (key: FindingSortKey) => setSort((current) => nextSort(current, key))

  // A file's box ticks every value of it that can be ticked, or clears them when all already are.
  const handleToggleFile = (group: VaultAuditFileGroup) => {
    const targets = group.rows.filter((row) => row.selectable)
    applySelection(targets, group.selectedCount < group.selectableCount)
  }

  const handleToggleCollapsed = (fileId: string) =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(fileId)) next.delete(fileId)
      else next.add(fileId)
      return next
    })

  const allCollapsed = groups.length > 0 && groups.every((group) => collapsed.has(group.fileId))
  const toggleCollapseAll = () =>
    setCollapsed(allCollapsed ? new Set() : new Set(groups.map((group) => group.fileId)))

  const handleConflictChoice = (
    row: VaultAuditFindingRow,
    direction: 'write-to-file' | 'write-to-vault',
  ) => {
    if (!row.conflict) return

    if (direction === 'write-to-file') {
      if (row.finding.field === 'revision') return
      const selected = row.conflict.useBluePlm.selected
      const fileConflictIds = inCategory
        .filter(
          (finding) =>
            finding.resolution === 'choose-a-side' && finding.fileId === row.finding.fileId,
        )
        .map((finding) => finding.id)
      conflict.setMany(fileConflictIds, false)
      push.setManyFiles([row.finding.fileId], !selected)
      return
    }

    const selected = row.conflict.useFile.selected
    push.setManyFiles([row.finding.fileId], false)
    conflict.setMany([row.finding.id], !selected)
  }

  if (!kind) {
    return <p className="text-xs text-plm-fg-muted">{t('vaultAudit.findings.selectPrompt')}</p>
  }

  const unit =
    action === 'write-to-file'
      ? t('vaultAudit.findings.unitFiles')
      : t('vaultAudit.findings.unitValues')
  const filtering = filter.trim() !== '' || actionableOnly
  const actionableTotal = allRows.filter((row) => row.selectable).length

  return (
    <section className="flex flex-col gap-2 min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[14rem]">
          <Search
            size={13}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-plm-fg-muted pointer-events-none"
          />
          <input
            type="text"
            value={filterInput}
            placeholder={t('vaultAudit.findings.filterPlaceholder')}
            onChange={(event) => setFilterInput(event.target.value)}
            className={`${FIELD_CLASS} h-8 pl-7 pr-7`}
          />
          {filterInput && (
            <button
              type="button"
              onClick={() => {
                setFilterInput('')
                setFilter('')
              }}
              title={t('vaultAudit.findings.clearFilter')}
              aria-label={t('vaultAudit.findings.clearFilter')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-plm-fg-muted hover:text-plm-fg"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {actionableTotal > 0 && actionableTotal < allRows.length && (
          <label
            className="flex items-center gap-1.5 text-xs text-plm-fg-muted cursor-pointer"
            title={t('vaultAudit.findings.actionableOnlyHint')}
          >
            <input
              type="checkbox"
              checked={actionableOnly}
              onChange={(event) => setActionableOnly(event.target.checked)}
              className="accent-plm-accent"
            />
            {t('vaultAudit.findings.actionableOnly')}
          </label>
        )}

        {groups.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            icon={allCollapsed ? <ChevronsUpDown size={12} /> : <ChevronsDownUp size={12} />}
            onClick={toggleCollapseAll}
          >
            {allCollapsed
              ? t('vaultAudit.findings.expandAll')
              : t('vaultAudit.findings.collapseAll')}
          </Button>
        )}
      </div>

      {inCategory.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <VaultAuditSelectionBar
            summary={summary}
            unit={unit}
            disabled={busy}
            onSelectAll={() => applyBulk('select-all')}
            onClear={() => applyBulk('clear')}
            onInvert={() => applyBulk('invert')}
            onClearHidden={clearHidden}
          />
          <span className="text-xs text-plm-fg-muted">
            {filtering
              ? t('vaultAudit.findings.showing', {
                  shown: visibleRows.length,
                  total: allRows.length,
                })
              : t('vaultAudit.findings.total', { count: allRows.length })}
            {' · '}
            {t('vaultAudit.category.files', { count: groups.length })}
          </span>
        </div>
      )}

      {inCategory.length === 0 && (
        <p className="text-xs text-plm-fg-muted py-6 text-center">
          {t('vaultAudit.findings.none')}
        </p>
      )}

      {inCategory.length > 0 && visibleRows.length === 0 && (
        <p className="text-xs text-plm-fg-muted py-6 text-center">
          {t('vaultAudit.findings.noMatches')}
        </p>
      )}

      {visibleRows.length > 0 && (
        <>
          {/* Sized to the window, so once scrolled to, the list is most of what is on screen. */}
          <div className="h-[calc(100vh-17rem)] min-h-[24rem]">
            <VaultAuditFileList
              items={items}
              sort={sort}
              scrollResetKey={`${kind}|${filter}|${actionableOnly}|${sort.key}|${sort.direction}`}
              disabled={busy}
              allSelected={summary.allSelected}
              someSelected={summary.someSelected}
              canSelectAny={summary.selectableUnits > 0}
              onSort={handleSort}
              onToggleAll={() => applyBulk(summary.allSelected ? 'clear' : 'select-all')}
              onToggle={handleToggle}
              onToggleFile={handleToggleFile}
              onToggleCollapsed={handleToggleCollapsed}
              onChooseConflict={handleConflictChoice}
            />
          </div>

          <p className="text-[11px] text-plm-fg-muted">
            {t('vaultAudit.findings.directionNote')}
            {summary.selectableUnits > 1 && <> {t('vaultAudit.findings.rangeHint')}</>}
          </p>

          {/* Stays at the bottom of the scrolling settings area, so the button and the count of
              what it will write are in reach however far down the page the reader has gone. */}
          <div className="sticky bottom-0 z-20 -mx-1 px-1 pt-2 pb-1 bg-plm-bg border-t border-plm-border max-h-[40vh] overflow-y-auto">
            {kind === 'conflicting' ? (
              <VaultAuditConflictActionBar conflict={conflict} push={push} />
            ) : kind === 'empty-in-database' ? (
              <VaultAuditFillActionBar fill={fill} />
            ) : (
              <VaultAuditActionBar action={action} repair={repair} push={push} />
            )}
          </div>
        </>
      )}
    </section>
  )
}
