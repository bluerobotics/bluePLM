// src/features/settings/organization/realign/RealignDialog.tsx
import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  EyeOff,
  FolderX,
  HardDrive,
  Loader2,
  Lock,
  Move,
  Pencil,
  RefreshCw,
  X,
} from 'lucide-react'

import { Button } from '@/components/core/ui'
import { t } from '@/lib/i18n'
import { log } from '@/lib/logger'
import { usePDMStore } from '@/stores/pdmStore'
// `analyzeAlignment` and `applyAlignment` are owned by sibling agents building this feature in
// parallel (see `.cursor/plans/realign-with-server-agents.plan.md`). This dialog imports them by
// their frozen contract in `src/types/realign.ts`; it does not create, edit, or stub them here.
import { analyzeAlignment } from '@/lib/realign/analyzeAlignment'
import { applyAlignment } from '@/lib/realign/applyAlignment'
import type {
  AlignmentBucket,
  AlignmentBucketId,
  AlignmentItem,
  AlignmentOutcome,
  AlignmentPlan,
  AlignmentStepId,
  PendingMoveAction,
} from '@/types/realign'

import { PendingMovesDecisionList } from './PendingMovesDecisionList'
import {
  bucketKeyFragment,
  computeSampleDisplay,
  defaultAlignmentPlan,
  defaultPendingMoveActions,
  groupBucketsByDisposition,
  hasAnyRepairSelected,
  mergePendingMoveActions,
  otherHeldCount,
  pluralSuffix,
  REPAIRABLE_BUCKET_TO_PLAN_KEY,
  setAllPendingMoveActions,
} from './RealignDialog.utils'

interface RealignDialogProps {
  isOpen: boolean
  onClose: () => void
}

const REPAIRABLE_ICON: Record<AlignmentBucketId, React.ReactNode> = {
  pending_move: <Move size={16} />,
  orphaned: <FolderX size={16} />,
  outdated: <RefreshCw size={16} />,
  cloud_only: <Cloud size={16} />,
  local_only: <HardDrive size={16} />,
  modified: <Pencil size={16} />,
  ghost: <AlertTriangle size={16} />,
  ignored: <EyeOff size={16} />,
  blocked_checkout: <Lock size={16} />,
}

/** Buckets whose bucket-specific "go do it" action leaves the dialog rather than acting inline. */
const NEEDS_DECISION_ACTION_BUCKETS: readonly AlignmentBucketId[] = ['local_only', 'modified']

export function RealignDialog({ isOpen, onClose }: RealignDialogProps) {
  const files = usePDMStore((state) => state.files)
  const serverFiles = usePDMStore((state) => state.serverFiles)
  const activeVaultId = usePDMStore((state) => state.activeVaultId)
  const userId = usePDMStore((state) => state.user?.id)
  const addToast = usePDMStore((state) => state.addToast)
  const isOperationRunning = usePDMStore((state) => state.isOperationRunning)
  const operationQueueLength = usePDMStore((state) => state.operationQueue.length)
  // `resolvePendingMoves` calls `adopt-server-paths`, which opens its own full-screen
  // confirmation (`ctx.confirm()` / `CommandConfirmContainer`) before it writes anything. While
  // that is open, this dialog's own "Run" button is still showing its bare spinner - visually
  // indistinguishable from ordinary work in progress - unless it is told to say otherwise. See
  // the reconcile-hang incident report.
  const pendingCommandConfirm = usePDMStore((state) => state.pendingCommandConfirm)

  const [plan, setPlan] = useState<AlignmentPlan>(defaultAlignmentPlan)
  const [pendingMoveActions, setPendingMoveActions] = useState<Record<string, PendingMoveAction>>(
    {},
  )
  const [isRunning, setIsRunning] = useState(false)
  const [outcome, setOutcome] = useState<AlignmentOutcome | null>(null)
  const [isInformationalExpanded, setIsInformationalExpanded] = useState(false)

  // `analyzeAlignment` is pure and synchronous, so recomputing it on every render is cheap —
  // that is what lets the dialog show the vault's new state right after `applyAlignment` runs,
  // with no scan spinner and no separate refresh step.
  const report = useMemo(
    () =>
      analyzeAlignment({
        files,
        serverFileCount: serverFiles.length,
        vaultId: activeVaultId ?? '',
        currentUserId: userId ?? '',
      }),
    [files, serverFiles, activeVaultId, userId],
  )

  // Every open is a fresh review: reset the plan and drop any result left over from last time.
  // Deliberately keyed on `isOpen` alone - `report.pendingMoveItems` is read for its value at the
  // moment the dialog opens, not watched. The effect below keeps the map in sync with later
  // changes to `report.pendingMoveItems` while the dialog stays open, which is the split that
  // makes "fresh review" mean "reset on open" rather than "reset whenever the report recomputes."
  useEffect(() => {
    if (!isOpen) return
    setPlan(defaultAlignmentPlan())
    setPendingMoveActions(defaultPendingMoveActions(report.pendingMoveItems))
    setOutcome(null)
    setIsInformationalExpanded(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    setPendingMoveActions((prev) => mergePendingMoveActions(prev, report.pendingMoveItems))
  }, [isOpen, report.pendingMoveItems])

  if (!isOpen) return null

  const groups = groupBucketsByDisposition(report.buckets)
  const canRun = !isRunning && hasAnyRepairSelected(plan)

  const handleClose = () => {
    if (isRunning) return
    onClose()
  }

  const toggleRepairable = (bucketId: AlignmentBucketId) => {
    const planKey = REPAIRABLE_BUCKET_TO_PLAN_KEY[bucketId]
    if (!planKey) return
    setPlan((prev) => ({ ...prev, [planKey]: !prev[planKey] }))
  }

  const toggleSyncIndex = () => {
    setPlan((prev) => ({ ...prev, rebuildSyncIndex: !prev.rebuildSyncIndex }))
  }

  const handleGoDecide = (bucketId: AlignmentBucketId) => {
    addToast('info', t(`realign.${bucketKeyFragment(bucketId)}.actionToast`))
    onClose()
  }

  const handleRun = async () => {
    setIsRunning(true)
    setOutcome(null)
    try {
      const result = await applyAlignment(
        { ...plan, pendingMoveActions },
        {
          vaultId: activeVaultId,
          files,
          serverFileCount: serverFiles.length,
          isOperationRunning,
          operationQueueLength,
          // `discard-orphaned` and `get-latest` do update `files` directly, so the `report`
          // `useMemo` above does pick up their results on its own. But `adopt-server-paths`
          // (resolvePendingMoves) only patches the row it renamed — it does not remove the
          // separate `moved_away` stub row that already sits at the destination path, so
          // without a real reload the dialog (and the file browser) would show both the
          // fixed file and a stale stub at the same path until something else reloads.
          // Every other caller of `adopt-server-paths` (`ResolveMovedFilesDialog`, the
          // `FileTree` context menu, the terminal command) passes a real `onRefresh` that
          // ultimately calls `useLoadFiles`'s `refreshCurrentFolder` for exactly this reason.
          // This dialog has no such reference this deep under Settings, so it goes through
          // the store bridge `requestFilesReload` instead — see its doc comment in
          // `stores/types.ts`. `applyAlignment` calls this once, after every step, matching
          // the "single refresh at the end" requirement.
          onRefresh: () => usePDMStore.getState().requestFilesReload(),
        },
      )
      setOutcome(result)
    } catch (error) {
      log.error('[RealignDialog]', 'applyAlignment threw unexpectedly', { error })
      addToast('error', t('realign.outcome.abortUnexpectedError'))
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center"
      onClick={handleClose}
    >
      <div
        className="bg-plm-bg-light border border-plm-border rounded-lg shadow-2xl w-[760px] max-h-[85vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-plm-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-plm-info/20 flex items-center justify-center">
              <RefreshCw size={20} className="text-plm-info" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-plm-fg">{t('realign.dialog.title')}</h3>
              <p className="text-sm text-plm-fg-muted">{t('realign.dialog.subtitle')}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isRunning}
            className="text-plm-fg-muted hover:text-plm-fg disabled:opacity-50"
            aria-label={t('common.close')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-5">
          <Headline report={report} />

          <RepairableGroup
            buckets={groups.repairable}
            plan={plan}
            isRunning={isRunning}
            pendingMoveItems={report.pendingMoveItems}
            pendingMoveActions={pendingMoveActions}
            onToggle={toggleRepairable}
            onToggleSyncIndex={toggleSyncIndex}
            onPendingMoveAction={(fileId, action) =>
              setPendingMoveActions((prev) => ({ ...prev, [fileId]: action }))
            }
            onSetAllPendingMoves={(action) =>
              setPendingMoveActions(setAllPendingMoveActions(report.pendingMoveItems, action))
            }
          />

          <NeedsDecisionGroup
            buckets={groups.needs_decision}
            onGoDecide={handleGoDecide}
            isRunning={isRunning}
          />

          <InformationalGroup
            buckets={groups.informational}
            isExpanded={isInformationalExpanded}
            onToggleExpanded={() => setIsInformationalExpanded((prev) => !prev)}
          />

          {outcome && <OutcomeSummary outcome={outcome} />}
        </div>

        <div className="p-4 border-t border-plm-border flex items-center justify-end gap-2">
          {isRunning && pendingCommandConfirm && (
            <span className="text-xs text-plm-fg-muted mr-auto">
              {t('realign.dialog.waitingForConfirmation')}
            </span>
          )}
          <Button variant="ghost" onClick={handleClose} disabled={isRunning}>
            {t('common.close')}
          </Button>
          <Button
            variant="primary"
            onClick={handleRun}
            disabled={!canRun}
            icon={isRunning ? <Loader2 size={14} className="animate-spin" /> : undefined}
          >
            {t('realign.runButton')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Headline({ report }: { report: ReturnType<typeof analyzeAlignment> }) {
  return (
    <div>
      <div
        className={`flex items-center gap-2 text-sm font-medium ${
          report.isAligned ? 'text-plm-success' : 'text-plm-warning'
        }`}
      >
        {report.isAligned ? <Check size={16} /> : <AlertTriangle size={16} />}
        <span>
          {t(report.isAligned ? 'realign.headline.aligned' : 'realign.headline.notAligned')}
        </span>
      </div>
      <div className="flex flex-wrap gap-4 mt-2 text-xs text-plm-fg-muted">
        <span>
          {t(`realign.orientation.local${pluralSuffix(report.localFileCount)}`, {
            count: report.localFileCount,
          })}
        </span>
        <span>
          {t(`realign.orientation.server${pluralSuffix(report.serverFileCount)}`, {
            count: report.serverFileCount,
          })}
        </span>
        <span>
          {t(`realign.orientation.inSync${pluralSuffix(report.inSyncCount)}`, {
            count: report.inSyncCount,
          })}
        </span>
      </div>
    </div>
  )
}

interface RepairableGroupProps {
  buckets: AlignmentBucket[]
  plan: AlignmentPlan
  isRunning: boolean
  pendingMoveItems: AlignmentItem[]
  pendingMoveActions: Record<string, PendingMoveAction>
  onToggle: (bucketId: AlignmentBucketId) => void
  onToggleSyncIndex: () => void
  onPendingMoveAction: (fileId: string, action: PendingMoveAction) => void
  onSetAllPendingMoves: (action: PendingMoveAction) => void
}

function RepairableGroup({
  buckets,
  plan,
  isRunning,
  pendingMoveItems,
  pendingMoveActions,
  onToggle,
  onToggleSyncIndex,
  onPendingMoveAction,
  onSetAllPendingMoves,
}: RepairableGroupProps) {
  return (
    <div>
      <div className="text-xs text-plm-fg-muted uppercase tracking-wide mb-2">
        {t('realign.group.repairable')}
      </div>
      <div className="space-y-2">
        {buckets.map((bucket) => {
          const planKey = REPAIRABLE_BUCKET_TO_PLAN_KEY[bucket.id]
          const fragment = bucketKeyFragment(bucket.id)
          const checked = planKey ? plan[planKey] : false
          const isPendingMove = bucket.id === 'pending_move'

          return (
            <div key={bucket.id} className="p-3 rounded border border-plm-border bg-plm-bg">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(bucket.id)}
                  disabled={isRunning}
                  className="mt-0.5 accent-plm-accent"
                />
                <span className="text-plm-accent mt-0.5">{REPAIRABLE_ICON[bucket.id]}</span>
                <div className="flex-1">
                  <div className="text-sm text-plm-fg">
                    {t(`realign.${fragment}.label${pluralSuffix(bucket.count)}`, {
                      count: bucket.count,
                    })}
                  </div>
                  <div className="text-xs text-plm-fg-muted mt-0.5">
                    {t(`realign.${fragment}.description`)}
                  </div>
                </div>
              </label>
              {isPendingMove && pendingMoveItems.length > 0 && (
                <PendingMovesDecisionList
                  items={pendingMoveItems}
                  actions={pendingMoveActions}
                  disabled={isRunning || !checked}
                  onActionChange={onPendingMoveAction}
                  onSetAll={onSetAllPendingMoves}
                />
              )}
            </div>
          )
        })}

        {/* Not tied to a bucket count: rebuilding the sync index is housekeeping that runs
            alongside whichever repairs above are selected, so it gets its own row rather than
            being folded into one of the counted buckets. */}
        <label className="flex items-start gap-3 p-3 rounded border border-plm-border bg-plm-bg cursor-pointer">
          <input
            type="checkbox"
            checked={plan.rebuildSyncIndex}
            onChange={onToggleSyncIndex}
            disabled={isRunning}
            className="mt-0.5 accent-plm-accent"
          />
          <span className="text-plm-accent mt-0.5">
            <RefreshCw size={16} />
          </span>
          <div className="flex-1">
            <div className="text-sm text-plm-fg">{t('realign.syncIndex.label')}</div>
            <div className="text-xs text-plm-fg-muted mt-0.5">
              {t('realign.syncIndex.description')}
            </div>
          </div>
        </label>
      </div>
    </div>
  )
}

interface NeedsDecisionGroupProps {
  buckets: AlignmentBucket[]
  onGoDecide: (bucketId: AlignmentBucketId) => void
  isRunning: boolean
}

function NeedsDecisionGroup({ buckets, onGoDecide, isRunning }: NeedsDecisionGroupProps) {
  const visibleBuckets = buckets.filter((bucket) => bucket.count > 0)

  return (
    <div>
      <div className="text-xs text-plm-fg-muted uppercase tracking-wide mb-2">
        {t('realign.group.needsDecision')}
      </div>
      <p className="text-xs text-plm-fg-muted mb-2">{t('realign.group.needsDecisionNote')}</p>

      {visibleBuckets.length === 0 ? (
        <p className="text-xs text-plm-fg-muted">{t('realign.group.needsDecisionEmpty')}</p>
      ) : (
        <div className="space-y-2">
          {visibleBuckets.map((bucket) => {
            const fragment = bucketKeyFragment(bucket.id)
            const { shown, moreCount } = computeSampleDisplay(bucket)

            return (
              <div key={bucket.id} className="p-3 rounded border border-plm-border bg-plm-bg">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="text-sm text-plm-fg">
                      {t(`realign.${fragment}.label${pluralSuffix(bucket.count)}`, {
                        count: bucket.count,
                      })}
                    </div>
                    <div className="text-xs text-plm-fg-muted mt-0.5">
                      {t(`realign.${fragment}.description`)}
                    </div>
                  </div>
                  {NEEDS_DECISION_ACTION_BUCKETS.includes(bucket.id) && (
                    <Button size="sm" onClick={() => onGoDecide(bucket.id)} disabled={isRunning}>
                      {t(`realign.${fragment}.actionButton`)}
                    </Button>
                  )}
                </div>

                {shown.length > 0 && (
                  <div className="mt-2 bg-plm-bg-secondary rounded border border-plm-border p-2 font-mono text-xs">
                    {shown.map((item) => (
                      <div key={item.id} className="truncate text-plm-fg-dim py-0.5">
                        {item.relativePath}
                      </div>
                    ))}
                    {moreCount > 0 && (
                      <div className="text-plm-fg-muted pt-1">
                        {t('realign.moreFiles', { count: moreCount })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface InformationalGroupProps {
  buckets: AlignmentBucket[]
  isExpanded: boolean
  onToggleExpanded: () => void
}

function InformationalGroup({ buckets, isExpanded, onToggleExpanded }: InformationalGroupProps) {
  const totalCount = buckets.reduce((sum, bucket) => sum + bucket.count, 0)

  return (
    <div>
      <button
        onClick={onToggleExpanded}
        className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-plm-fg-muted hover:text-plm-fg"
      >
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>
          {t('realign.group.informational')} ({totalCount})
        </span>
      </button>

      {isExpanded && (
        <div className="space-y-2">
          {buckets.map((bucket) => {
            const fragment = bucketKeyFragment(bucket.id)
            return (
              <div key={bucket.id} className="p-3 rounded border border-plm-border bg-plm-bg">
                <div className="text-sm text-plm-fg">
                  {t(`realign.${fragment}.label${pluralSuffix(bucket.count)}`, {
                    count: bucket.count,
                  })}
                </div>
                <div className="text-xs text-plm-fg-muted mt-0.5">
                  {t(`realign.${fragment}.whyNote`)}
                </div>
                {bucket.id === 'blocked_checkout' && (
                  <div className="text-xs text-plm-fg-muted mt-1 space-y-0.5">
                    {/* A self-held checkout (only reachable via an `outdated` row - see
                        `resolveGuardedBucket`) is not "someone else's work in progress", so it
                        gets its own line rather than being folded into the count above. */}
                    {bucket.selfHeldCount > 0 && (
                      <div>
                        {t(
                          `realign.blockedCheckout.selfHeld${pluralSuffix(bucket.selfHeldCount)}`,
                          {
                            count: bucket.selfHeldCount,
                          },
                        )}
                      </div>
                    )}
                    {otherHeldCount(bucket) > 0 && (
                      <div>
                        {t(
                          `realign.blockedCheckout.otherHeld${pluralSuffix(otherHeldCount(bucket))}`,
                          {
                            count: otherHeldCount(bucket),
                          },
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const STEP_ORDER: readonly AlignmentStepId[] = [
  'resolvePendingMoves',
  'recycleOrphans',
  'pullOutdated',
  'rebuildSyncIndex',
]

/** `abortReason` values are kebab-case; translation keys are camelCase, one nesting level deep. */
const ABORT_REASON_KEY: Record<NonNullable<AlignmentOutcome['abortReason']>, string> = {
  'no-vault': 'abortNoVault',
  offline: 'abortOffline',
  'operation-in-flight': 'abortOperationInFlight',
  cancelled: 'abortCancelled',
  'unexpected-error': 'abortUnexpectedError',
}

function OutcomeSummary({ outcome }: { outcome: AlignmentOutcome }) {
  return (
    <div className="border-t border-plm-border pt-3">
      <div className="text-xs text-plm-fg-muted uppercase tracking-wide mb-2">
        {t('realign.outcome.heading')}
      </div>

      {outcome.aborted ? (
        <div className="rounded border border-plm-warning/40 bg-plm-warning/10 p-3 text-sm text-plm-fg flex items-start gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5 text-plm-warning" />
          <span>
            {t('realign.outcome.abortedHeading')}{' '}
            {outcome.abortReason && t(`realign.outcome.${ABORT_REASON_KEY[outcome.abortReason]}`)}
          </span>
        </div>
      ) : (
        <div className="space-y-1.5">
          {STEP_ORDER.map((stepId) => {
            const stepResult = outcome.steps.find((step) => step.step === stepId)
            if (!stepResult) return null

            return (
              <div key={stepId} className="flex items-center justify-between text-sm">
                <span className="text-plm-fg-muted">{t(`realign.outcome.step_${stepId}`)}</span>
                <span className="text-plm-fg">{describeStepOutcome(stepResult)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function describeStepOutcome(step: {
  outcome: 'ok' | 'partial' | 'failed' | 'nothing-to-do' | 'refused'
  attempted: number
  succeeded: number
  failed: number
}): string {
  switch (step.outcome) {
    case 'ok':
      return t(`realign.outcome.ok${pluralSuffix(step.succeeded)}`, { count: step.succeeded })
    case 'partial':
      return t('realign.outcome.partial', {
        succeeded: step.succeeded,
        attempted: step.attempted,
        failed: step.failed,
      })
    case 'failed':
      return t('realign.outcome.failedResult')
    case 'nothing-to-do':
      return t('realign.outcome.nothingToDo')
    case 'refused':
      return t('realign.outcome.refused')
    default:
      return t('realign.outcome.failedResult')
  }
}
