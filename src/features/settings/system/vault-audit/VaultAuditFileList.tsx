/**
 * The findings list, drawn like the file browser: a heading row per file, its values underneath.
 *
 * Presentational: it renders rows and reports clicks. Which rows may be ticked, what a tick means
 * and what happens when the button is pressed are all decided in `VaultAuditFindings`, because
 * they depend on which of the two writers covers the row and this component should not have an
 * opinion about that.
 *
 * ## Why grouped, and why values wrap
 *
 * The flat table repeated the path on every value and split the width nine ways, so descriptions
 * were cut to a few words and a file with six findings read as six unrelated rows. The file now
 * appears once, with its icon and folder, and each value row gives BluePLM's value and the file's
 * value half the width each. Values wrap over as many lines as they need and are never cut; the
 * span that differs is highlighted inside the whole value (`compareForDisplay` in `full` mode).
 *
 * ## It lists every row, and draws only the ones in view
 *
 * A category can hold thousands of values and an administrator has to be able to see and select
 * all of them, so the rows live in a bounded scroll area and only the ones inside it (plus a
 * little overscan) are in the DOM. Row heights differ - a wrapped description, a conflict row with
 * two buttons, a file heading - so each drawn row is measured.
 *
 * ## Ticks
 *
 * A file heading's box ticks or clears every selectable value of that file; the header box ticks
 * or clears every selectable row the filter lets through - the whole list, not the viewport. A row
 * with no checkbox says why in its resolution column.
 */

import { useEffect, useMemo, useRef, type MouseEvent } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  File as FileGlyph,
  Lock,
} from 'lucide-react'

import { FileIcon } from '@/components/shared'
import { t } from '@/lib/i18n'
import type { VaultAuditFinding } from '@/types/vaultAudit'

import type { VaultAuditActionKind } from './vaultAuditActions'
import type { VaultAuditFileAvailability } from './vaultAuditFileState'
import type { VaultAuditFileGroup, VaultAuditListItem } from './vaultAuditGroups'
import { compareForDisplay, isTrivialDifference, type ValueSegments } from './valueDifference'
import {
  blockedReasonLabel,
  differenceLabel,
  fieldLabel,
  resolutionDirection,
  resolutionHint,
  resolutionLabel,
  unattributedReasonLabel,
} from './vaultAuditLabels'
import type { VaultAuditFindingRow } from './vaultAuditRows'
import type { FindingSort, FindingSortKey } from './vaultAuditSort'
import { useRevealInFileBrowser, type RevealInFileBrowser } from './useRevealInFileBrowser'

export type { ConflictOption, VaultAuditFindingRow } from './vaultAuditRows'

/** Same template for the column header and every value row, so the columns line up. */
const VALUE_GRID =
  'grid grid-cols-[2.25rem_minmax(8rem,12rem)_minmax(0,1fr)_1.75rem_minmax(0,1fr)_minmax(9rem,13rem)]'

const ESTIMATED_FILE_ROW_PX = 44
const ESTIMATED_VALUE_ROW_PX = 48
const OVERSCAN_ROWS = 12

interface VaultAuditFileListProps {
  items: VaultAuditListItem[]
  sort: FindingSort
  /** Changes whenever the list underneath is a different list, so the view returns to the top. */
  scrollResetKey: string
  disabled: boolean
  /** Header checkbox state, over the rows the filter lets through. */
  allSelected: boolean
  someSelected: boolean
  canSelectAny: boolean
  onSort: (key: FindingSortKey) => void
  onToggleAll: () => void
  onToggle: (row: VaultAuditFindingRow, shiftKey: boolean) => void
  onToggleFile: (group: VaultAuditFileGroup) => void
  onToggleCollapsed: (fileId: string) => void
  onChooseConflict: (
    row: VaultAuditFindingRow,
    direction: Exclude<VaultAuditActionKind, 'fill-empty'>,
  ) => void
}

/** A checkbox whose third state is set on the element, since `indeterminate` has no attribute. */
function TriStateBox({
  checked,
  indeterminate,
  disabled,
  label,
  onClick,
}: {
  checked: boolean
  indeterminate: boolean
  disabled: boolean
  label: string
  onClick: (event: MouseEvent<HTMLInputElement>) => void
}) {
  return (
    <input
      ref={(element) => {
        if (element) element.indeterminate = indeterminate
      }}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={() => undefined}
      onClick={onClick}
      className="accent-ui-accent"
      aria-label={label}
      title={label}
    />
  )
}

function ValueCell({ value, segments }: { value: string | null; segments: ValueSegments | null }) {
  if (value === null) {
    return <span className="text-ui-fg-secondary/50">{t('vaultAudit.findings.empty')}</span>
  }

  const text = 'whitespace-pre-wrap break-words text-ui-fg'
  if (!segments) return <span className={text}>{value}</span>

  return (
    <span className={text}>
      {segments.head}
      {/* One value being a prefix of the other leaves nothing to highlight, and an unmarked cell
          would read as no difference at all. The marker stands in for the missing span. */}
      {segments.middle === '' ? (
        <mark className="inline-block w-1 h-3 align-middle bg-ui-warning/50 rounded-sm" />
      ) : (
        <mark className="bg-ui-warning/25 text-ui-fg rounded-sm px-0.5">{segments.middle}</mark>
      )}
      {segments.tail}
    </span>
  )
}

/**
 * Naming the colleague where the row knows the name.
 *
 * "Someone else has it" tells the reader the row is blocked and nothing about what to do next;
 * a name is what turns it into a message they can act on.
 */
function heldByLabel(availability: VaultAuditFileAvailability | null): string {
  const holder = availability?.state === 'held-by-other' ? availability.holder : null
  return holder
    ? t('vaultAudit.blocked.heldBy', { user: holder })
    : t('vaultAudit.blocked.heldByAnotherUser')
}

function DirectionCell({ finding }: { finding: VaultAuditFinding }) {
  const direction = resolutionDirection(finding.resolution)
  if (!direction) return null

  const Icon = direction === 'file-to-vault' ? ArrowLeft : ArrowRight
  return (
    <span
      className="flex justify-center pt-0.5 text-ui-accent"
      title={resolutionHint(finding.resolution)}
    >
      <Icon size={13} />
    </span>
  )
}

function SortButton({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string
  sortKey: FindingSortKey
  sort: FindingSort
  onSort: (key: FindingSortKey) => void
}) {
  const active = sort.key === sortKey
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      title={t('vaultAudit.findings.sortBy', { column: label })}
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`inline-flex items-center gap-0.5 hover:text-ui-fg transition-colors ${
        active ? 'text-ui-fg' : ''
      }`}
    >
      {label}
      {active && (sort.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
    </button>
  )
}

function ConflictButton({
  label,
  hint,
  selected,
  disabled,
  onClick,
}: {
  label: string
  hint: string
  selected: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      title={hint}
      className={`px-2 py-0.5 rounded border transition-colors disabled:opacity-40 ${
        selected
          ? 'border-ui-accent bg-ui-accent/20 text-ui-accent'
          : 'border-ui-divider text-ui-fg-secondary hover:text-ui-fg hover:bg-ui-field'
      }`}
    >
      {label}
    </button>
  )
}

function splitPath(relativePath: string): { folder: string; name: string } {
  const split = Math.max(relativePath.lastIndexOf('\\'), relativePath.lastIndexOf('/'))
  return {
    folder: split === -1 ? '' : relativePath.slice(0, split),
    name: relativePath.slice(split + 1),
  }
}

interface FileRowViewProps {
  group: VaultAuditFileGroup
  collapsed: boolean
  disabled: boolean
  /** Built once for the list: the index behind it covers every loaded file. */
  browser: RevealInFileBrowser
  onToggleFile: VaultAuditFileListProps['onToggleFile']
  onToggleCollapsed: VaultAuditFileListProps['onToggleCollapsed']
}

function FileRowView({
  group,
  collapsed,
  disabled,
  browser,
  onToggleFile,
  onToggleCollapsed,
}: FileRowViewProps) {
  const { resolveFile, reveal } = browser
  const file = resolveFile(group.relativePath)
  const { folder, name } = splitPath(group.relativePath)
  const availability = group.rows[0]?.availability ?? null
  const heldByOther = availability?.state === 'held-by-other'
  const allSettled = group.settledCount === group.rows.length
  const Chevron = collapsed ? ChevronRight : ChevronDown

  return (
    <div
      role="row"
      className="flex items-center gap-2 pl-1 pr-2 py-1.5 border-t border-ui-divider bg-ui-field/70 hover:bg-ui-field"
    >
      <button
        type="button"
        onClick={() => onToggleCollapsed(group.fileId)}
        aria-expanded={!collapsed}
        title={
          collapsed ? t('vaultAudit.findings.expandFile') : t('vaultAudit.findings.collapseFile')
        }
        className="p-0.5 rounded text-ui-fg-secondary hover:text-ui-fg"
      >
        <Chevron size={14} />
      </button>

      <span className="w-4 flex justify-center flex-shrink-0">
        {group.selectableCount > 0 ? (
          <TriStateBox
            checked={group.selectedCount === group.selectableCount}
            indeterminate={group.selectedCount > 0 && group.selectedCount < group.selectableCount}
            disabled={disabled}
            label={t('vaultAudit.findings.selectFile')}
            onClick={() => onToggleFile(group)}
          />
        ) : allSettled ? (
          <Check
            size={13}
            className="text-ui-success"
            aria-label={t('vaultAudit.findings.settled')}
          />
        ) : null}
      </span>

      <span className="flex-shrink-0 flex items-center">
        {file ? (
          <FileIcon file={file} size={22} />
        ) : (
          <FileGlyph size={20} className="text-ui-fg-secondary" />
        )}
      </span>

      <button
        type="button"
        onClick={() => onToggleCollapsed(group.fileId)}
        onDoubleClick={() => reveal(group.relativePath)}
        title={group.relativePath}
        className="min-w-0 flex-1 text-left"
      >
        <span className="block truncate text-[13px] text-ui-fg font-medium">{name}</span>
        {folder && <span className="block truncate text-[12px] text-ui-fg-secondary">{folder}</span>}
      </button>

      {heldByOther && (
        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[12px] text-ui-warning bg-ui-warning/10 flex-shrink-0">
          <Lock size={10} />
          {heldByLabel(availability)}
        </span>
      )}

      <span className="px-1.5 py-0.5 rounded-full text-[12px] text-ui-fg-secondary bg-ui-bg border border-ui-divider flex-shrink-0">
        {t('vaultAudit.category.values', { count: group.rows.length })}
      </span>

      <button
        type="button"
        onClick={() => reveal(group.relativePath)}
        disabled={!file}
        title={file ? t('vaultAudit.findings.reveal') : t('vaultAudit.findings.revealUnavailable')}
        className="p-1 rounded text-ui-fg-secondary hover:text-ui-fg hover:bg-ui-bg transition-colors disabled:opacity-40 disabled:hover:bg-transparent flex-shrink-0"
      >
        <ExternalLink size={13} />
      </button>
    </div>
  )
}

interface ValueRowViewProps {
  row: VaultAuditFindingRow
  disabled: boolean
  onToggle: VaultAuditFileListProps['onToggle']
  onChooseConflict: VaultAuditFileListProps['onChooseConflict']
}

function ValueRowView({ row, disabled, onToggle, onChooseConflict }: ValueRowViewProps) {
  const { finding } = row
  const isConflict = finding.resolution === 'choose-a-side'

  // The string diff is the one per-row cost worth deferring, and it is why this runs here.
  const comparison = useMemo(
    () => compareForDisplay(finding.databaseValue, finding.fileValue, 'full'),
    [finding.databaseValue, finding.fileValue],
  )
  const trivialNote =
    comparison && isTrivialDifference(comparison.kind) ? differenceLabel(comparison.kind) : null

  return (
    <div
      role="row"
      className={`${VALUE_GRID} items-start text-[12px] border-t border-ui-divider/40 transition-colors ${
        row.selected && !row.settled ? 'bg-ui-hover/40' : 'hover:bg-ui-field/40'
      } ${row.settled ? 'opacity-70' : ''}`}
    >
      <div role="cell" className="pl-7 pr-1 py-2">
        {row.settled ? (
          <Check
            size={12}
            className="text-ui-success"
            aria-label={t('vaultAudit.findings.settled')}
          />
        ) : row.selectable ? (
          <input
            type="checkbox"
            checked={row.selected}
            disabled={disabled}
            onChange={() => undefined}
            onClick={(event) => onToggle(row, event.shiftKey)}
            className="accent-ui-accent"
            aria-label={resolutionLabel(finding.resolution)}
          />
        ) : null}
      </div>
      <div role="cell" className="pl-4 pr-2 py-2 min-w-0">
        <span className="block text-ui-fg break-words">{fieldLabel(finding.field)}</span>
        <span className="block text-ui-fg-secondary break-words">
          {finding.configuration ?? t('vaultAudit.findings.fileScope')}
        </span>
        {finding.unattributedReason && (
          <span className="block text-ui-fg-secondary/70">
            {unattributedReasonLabel(finding.unattributedReason)}
          </span>
        )}
      </div>
      <div role="cell" className="px-2 py-2 min-w-0">
        <ValueCell value={finding.databaseValue} segments={comparison?.database ?? null} />
      </div>
      <div role="cell" className="py-2">
        <DirectionCell finding={finding} />
      </div>
      <div role="cell" className="px-2 py-2 min-w-0">
        <ValueCell value={finding.fileValue} segments={comparison?.file ?? null} />
      </div>
      <div role="cell" className="px-2 py-2 min-w-0 text-ui-fg-secondary">
        <span title={resolutionHint(finding.resolution)}>
          {resolutionLabel(finding.resolution)}
        </span>
        {isConflict && row.conflict && (
          <div className="mt-1 flex flex-wrap gap-1">
            {finding.field !== 'revision' && (
              <ConflictButton
                label={t('vaultAudit.conflict.useBluePlm')}
                hint={
                  row.conflict.useBluePlm.reason ?? t('vaultAudit.resolution.pushVaultValueHint')
                }
                selected={row.conflict.useBluePlm.selected}
                disabled={
                  disabled || row.conflict.useBluePlm.settled || !row.conflict.useBluePlm.available
                }
                onClick={() => onChooseConflict(row, 'write-to-file')}
              />
            )}
            <ConflictButton
              label={t('vaultAudit.conflict.useFile')}
              hint={row.conflict.useFile.reason ?? t('vaultAudit.resolution.adoptFileValueHint')}
              selected={row.conflict.useFile.selected}
              disabled={disabled || row.conflict.useFile.settled || !row.conflict.useFile.available}
              onClick={() => onChooseConflict(row, 'write-to-vault')}
            />
          </div>
        )}
        {!row.action.available && (
          <span className="block text-ui-fg-secondary/70">
            {row.action.reason === 'held-by-another-user'
              ? heldByLabel(row.availability)
              : blockedReasonLabel(row.action.reason)}
          </span>
        )}
        {trivialNote && <span className="block text-ui-warning/80">{trivialNote}</span>}
      </div>
    </div>
  )
}

export function VaultAuditFileList({
  items,
  sort,
  scrollResetKey,
  disabled,
  allSelected,
  someSelected,
  canSelectAny,
  onSort,
  onToggleAll,
  onToggle,
  onToggleFile,
  onToggleCollapsed,
  onChooseConflict,
}: VaultAuditFileListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const browser = useRevealInFileBrowser()

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) =>
      items[index]?.kind === 'file' ? ESTIMATED_FILE_ROW_PX : ESTIMATED_VALUE_ROW_PX,
    overscan: OVERSCAN_ROWS,
    // Keyed by item, so a sort or a filter does not hand one row's measured height to another.
    getItemKey: (index) => items[index]?.key ?? index,
  })

  // A different list starts at its top. Staying at row nine hundred of a list that now has twelve
  // rows reads as an empty table.
  useEffect(() => {
    virtualizer.scrollToOffset(0)
    // The virtualizer instance is stable; the key is the only thing that should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollResetKey])

  return (
    <div
      role="table"
      className="flex flex-col h-full min-h-0 border border-ui-divider rounded-md bg-ui-bg overflow-hidden"
    >
      <div
        role="row"
        className={`${VALUE_GRID} items-center py-1.5 text-[13px] font-medium bg-ui-field text-ui-fg-secondary border-b border-ui-divider flex-shrink-0`}
      >
        <div role="columnheader" className="pl-2">
          <TriStateBox
            checked={allSelected}
            indeterminate={someSelected}
            disabled={disabled || !canSelectAny}
            label={t('vaultAudit.findings.selectAllRows')}
            onClick={onToggleAll}
          />
        </div>
        <div role="columnheader" className="pl-4 pr-2 flex flex-wrap gap-x-2">
          <SortButton
            label={t('vaultAudit.findings.columnFile')}
            sortKey="file"
            sort={sort}
            onSort={onSort}
          />
          <SortButton
            label={t('vaultAudit.findings.columnField')}
            sortKey="field"
            sort={sort}
            onSort={onSort}
          />
          <SortButton
            label={t('vaultAudit.findings.columnConfiguration')}
            sortKey="configuration"
            sort={sort}
            onSort={onSort}
          />
        </div>
        <div role="columnheader" className="px-2">
          {t('vaultAudit.findings.columnDatabase')}
        </div>
        <div role="columnheader" />
        <div role="columnheader" className="px-2">
          {t('vaultAudit.findings.columnFile2')}
        </div>
        <div role="columnheader" className="px-2">
          <SortButton
            label={t('vaultAudit.findings.columnResolution')}
            sortKey="resolution"
            sort={sort}
            onSort={onSort}
          />
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const item = items[virtualRow.index]
            if (!item) return null

            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className="absolute left-0 top-0 w-full"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                {item.kind === 'file' ? (
                  <FileRowView
                    group={item.group}
                    collapsed={item.collapsed}
                    disabled={disabled}
                    browser={browser}
                    onToggleFile={onToggleFile}
                    onToggleCollapsed={onToggleCollapsed}
                  />
                ) : (
                  <ValueRowView
                    row={item.row}
                    disabled={disabled}
                    onToggle={onToggle}
                    onChooseConflict={onChooseConflict}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
