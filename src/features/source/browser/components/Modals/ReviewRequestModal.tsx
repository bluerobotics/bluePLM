import { memo, useState, useEffect, useMemo, useCallback } from 'react'
import {
  Send,
  File,
  Users,
  Check,
  Calendar,
  Loader2,
  ChevronDown,
  ChevronRight,
  UserCircle,
} from 'lucide-react'
import type { LocalFile } from '@/stores/pdmStore'
import { usePDMStore } from '@/stores/pdmStore'
import { getOrgTeamsWithMembers, type TeamWithMembers } from '@/lib/supabase'
import { log } from '@/lib/logger'

// ============================================
// Types
// ============================================

export interface OrgUser {
  id: string
  email: string
  full_name?: string | null
  avatar_url?: string | null
}

/** Selection tab mode */
type SelectionTab = 'individuals' | 'teams'

export interface ReviewRequestModalProps {
  file: LocalFile
  orgUsers: OrgUser[]
  loadingUsers: boolean
  selectedReviewers: string[]
  reviewDueDate: string
  reviewPriority: string
  reviewMessage: string
  isSubmitting: boolean
  /** Organization ID for fetching teams */
  organizationId?: string
  onToggleReviewer: (userId: string) => void
  onDueDateChange: (date: string) => void
  onPriorityChange: (priority: string) => void
  onMessageChange: (message: string) => void
  onSubmit: () => void
  onClose: () => void
}

// ============================================
// Internal team-selection state
// ============================================

/**
 * Hook managing team-level selection state within the modal.
 * Keeps a set of selected team IDs and derives which individual user IDs
 * are "team-selected", then merges with explicitly selected individuals
 * to produce a deduplicated reviewer list.
 */
function useTeamSelection(
  teams: TeamWithMembers[],
  selectedReviewers: string[],
  onToggleReviewer: (userId: string) => void
) {
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set())
  const [expandedTeamIds, setExpandedTeamIds] = useState<Set<string>>(new Set())

  /** User IDs that come from selected teams (deduplicated) */
  const teamSelectedUserIds = useMemo(() => {
    const ids = new Set<string>()
    for (const team of teams) {
      if (selectedTeamIds.has(team.id)) {
        for (const member of team.members) {
          ids.add(member.id)
        }
      }
    }
    return ids
  }, [teams, selectedTeamIds])

  /** Toggle an entire team – selects or deselects all its members */
  const toggleTeam = useCallback(
    (teamId: string) => {
      const team = teams.find((t) => t.id === teamId)
      if (!team) return

      setSelectedTeamIds((prev) => {
        const next = new Set(prev)
        const isSelected = next.has(teamId)

        if (isSelected) {
          next.delete(teamId)
          // Deselect members that are ONLY in this team and not individually selected
          for (const member of team.members) {
            // Only remove if no other selected team contains this member
            const inOtherSelectedTeam = teams.some(
              (t) => t.id !== teamId && next.has(t.id) && t.members.some((m) => m.id === member.id)
            )
            if (!inOtherSelectedTeam && selectedReviewers.includes(member.id)) {
              onToggleReviewer(member.id)
            }
          }
        } else {
          next.add(teamId)
          // Select all members of this team
          for (const member of team.members) {
            if (!selectedReviewers.includes(member.id)) {
              onToggleReviewer(member.id)
            }
          }
        }

        return next
      })
    },
    [teams, selectedReviewers, onToggleReviewer]
  )

  /** Toggle expand/collapse for a team card */
  const toggleExpand = useCallback((teamId: string) => {
    setExpandedTeamIds((prev) => {
      const next = new Set(prev)
      if (next.has(teamId)) next.delete(teamId)
      else next.add(teamId)
      return next
    })
  }, [])

  return {
    selectedTeamIds,
    expandedTeamIds,
    teamSelectedUserIds,
    toggleTeam,
    toggleExpand,
  }
}

// ============================================
// Component
// ============================================

/**
 * Modal for requesting file review from team members.
 *
 * Supports two selection modes via tabs:
 * - **Individuals**: the original user-checkbox list
 * - **Teams**: clickable team cards that select all members at once
 *
 * Selections are mixed and deduplicated – a user in multiple teams or
 * also individually selected only counts once.
 */
export const ReviewRequestModal = memo(function ReviewRequestModal({
  file,
  orgUsers,
  loadingUsers,
  selectedReviewers,
  reviewDueDate,
  reviewPriority,
  reviewMessage,
  isSubmitting,
  organizationId,
  onToggleReviewer,
  onDueDateChange,
  onPriorityChange,
  onMessageChange,
  onSubmit,
  onClose,
}: ReviewRequestModalProps) {
  // ── Store fallback for organizationId ────────────────────────────────
  const storeOrgId = usePDMStore(s => s.organization?.id)
  const resolvedOrgId = organizationId ?? storeOrgId

  // ── Local state ──────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<SelectionTab>('individuals')
  const [teams, setTeams] = useState<TeamWithMembers[]>([])
  const [loadingTeams, setLoadingTeams] = useState(false)

  // ── Fetch teams on mount ─────────────────────────────────────────────
  useEffect(() => {
    if (!resolvedOrgId) return

    let cancelled = false
    setLoadingTeams(true)

    getOrgTeamsWithMembers(resolvedOrgId).then(({ teams: fetchedTeams, error }) => {
      if (!cancelled) {
        if (error) {
          log.error('[ReviewRequestModal]', 'Failed to fetch teams', { error })
        }
        setTeams(fetchedTeams)
        setLoadingTeams(false)
      }
    }).catch((err) => {
      if (!cancelled) {
        log.error('[ReviewRequestModal]', 'Error fetching teams', { error: err })
        setTeams([])
        setLoadingTeams(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [resolvedOrgId])

  // ── Team selection helpers ───────────────────────────────────────────
  const {
    selectedTeamIds,
    expandedTeamIds,
    toggleTeam,
    toggleExpand,
  } = useTeamSelection(teams, selectedReviewers, onToggleReviewer)

  // ── Unique reviewer count (handles deduplication) ────────────────────
  const uniqueReviewerCount = useMemo(
    () => new Set(selectedReviewers).size,
    [selectedReviewers]
  )

  // ── Whether teams tab is available ───────────────────────────────────
  const teamsAvailable = resolvedOrgId !== undefined

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-plm-bg-light border border-plm-border rounded-lg p-6 max-w-md w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-plm-accent/20 flex items-center justify-center">
            <Send size={20} className="text-plm-accent" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-plm-fg">Request Review</h3>
            <p className="text-sm text-plm-fg-muted">{file.name}</p>
          </div>
        </div>

        {/* ── File info card ────────────────────────────────────────── */}
        <div className="bg-plm-bg rounded border border-plm-border p-3 mb-4">
          <div className="flex items-center gap-2">
            <File size={16} className="text-plm-fg-muted" />
            <span className="text-plm-fg font-medium truncate">{file.name}</span>
            {file.pdmData?.version && (
              <span className="text-xs text-plm-fg-muted">v{file.pdmData.version}</span>
            )}
          </div>
        </div>

        {/* ── Selection tabs ────────────────────────────────────────── */}
        <div className="mb-2">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs text-plm-fg-muted uppercase tracking-wide">
              Select Reviewers
            </label>
            {uniqueReviewerCount > 0 && (
              <span className="text-xs text-plm-accent font-medium">
                {uniqueReviewerCount} reviewer{uniqueReviewerCount !== 1 ? 's' : ''} selected
              </span>
            )}
          </div>

          {teamsAvailable && (
            <div className="flex border-b border-plm-border mb-3">
              <button
                type="button"
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'individuals'
                    ? 'text-plm-accent border-b-2 border-plm-accent -mb-px'
                    : 'text-plm-fg-muted hover:text-plm-fg'
                }`}
                onClick={() => setActiveTab('individuals')}
              >
                <UserCircle size={14} className="inline mr-1.5 -mt-0.5" />
                Individuals
              </button>
              <button
                type="button"
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'teams'
                    ? 'text-plm-accent border-b-2 border-plm-accent -mb-px'
                    : 'text-plm-fg-muted hover:text-plm-fg'
                }`}
                onClick={() => setActiveTab('teams')}
              >
                <Users size={14} className="inline mr-1.5 -mt-0.5" />
                Teams
              </button>
            </div>
          )}
        </div>

        {/* ── Tab content ───────────────────────────────────────────── */}
        <div className="mb-4">
          {activeTab === 'individuals' ? (
            <IndividualsPanel
              orgUsers={orgUsers}
              loadingUsers={loadingUsers}
              selectedReviewers={selectedReviewers}
              onToggleReviewer={onToggleReviewer}
            />
          ) : (
            <TeamsPanel
              teams={teams}
              loadingTeams={loadingTeams}
              selectedTeamIds={selectedTeamIds}
              expandedTeamIds={expandedTeamIds}
              selectedReviewers={selectedReviewers}
              onToggleTeam={toggleTeam}
              onToggleExpand={toggleExpand}
            />
          )}
        </div>

        {/* ── Due date + Priority ────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs text-plm-fg-muted uppercase tracking-wide mb-2">
              <Calendar size={12} className="inline mr-1" />
              Due Date (optional)
            </label>
            <input
              type="date"
              value={reviewDueDate}
              onChange={(e) => onDueDateChange(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2 text-sm bg-plm-bg border border-plm-border rounded focus:outline-none focus:border-plm-accent"
            />
          </div>
          <div>
            <label className="block text-xs text-plm-fg-muted uppercase tracking-wide mb-2">
              Priority
            </label>
            <select
              value={reviewPriority}
              onChange={(e) => onPriorityChange(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-plm-bg border border-plm-border rounded focus:outline-none focus:border-plm-accent"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>

        {/* ── Message ────────────────────────────────────────────────── */}
        <div className="mb-4">
          <label className="block text-xs text-plm-fg-muted uppercase tracking-wide mb-2">
            Message (optional)
          </label>
          <textarea
            value={reviewMessage}
            onChange={(e) => onMessageChange(e.target.value)}
            placeholder="Add a message for the reviewers..."
            className="w-full px-3 py-2 text-sm bg-plm-bg border border-plm-border rounded resize-none focus:outline-none focus:border-plm-accent"
            rows={2}
          />
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={selectedReviewers.length === 0 || isSubmitting}
            className="btn bg-plm-accent hover:bg-plm-accent/90 text-white disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Send Request{' '}
            {uniqueReviewerCount > 0 && `(${uniqueReviewerCount})`}
          </button>
        </div>
      </div>
    </div>
  )
})

// ============================================
// Individuals Panel
// ============================================

interface IndividualsPanelProps {
  orgUsers: OrgUser[]
  loadingUsers: boolean
  selectedReviewers: string[]
  onToggleReviewer: (userId: string) => void
}

function IndividualsPanel({
  orgUsers,
  loadingUsers,
  selectedReviewers,
  onToggleReviewer,
}: IndividualsPanelProps) {
  if (loadingUsers) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 size={20} className="animate-spin text-plm-accent" />
      </div>
    )
  }

  if (orgUsers.length === 0) {
    return <p className="text-sm text-plm-fg-muted p-2">No other users in your organization</p>
  }

  return (
    <div className="max-h-48 overflow-y-auto border border-plm-border rounded bg-plm-bg">
      {orgUsers.map((orgUser) => (
        <label
          key={orgUser.id}
          className="flex items-center gap-3 p-2 hover:bg-plm-highlight cursor-pointer"
        >
          <input
            type="checkbox"
            checked={selectedReviewers.includes(orgUser.id)}
            onChange={() => onToggleReviewer(orgUser.id)}
            className="w-4 h-4 rounded border-plm-border text-plm-accent"
          />
          <div className="w-6 h-6 rounded-full bg-plm-accent/20 flex items-center justify-center">
            <Users size={12} className="text-plm-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-plm-fg truncate">
              {orgUser.full_name || orgUser.email}
            </div>
            {orgUser.full_name && (
              <div className="text-xs text-plm-fg-muted truncate">{orgUser.email}</div>
            )}
          </div>
          {selectedReviewers.includes(orgUser.id) && (
            <Check size={16} className="text-plm-accent flex-shrink-0" />
          )}
        </label>
      ))}
    </div>
  )
}

// ============================================
// Teams Panel
// ============================================

interface TeamsPanelProps {
  teams: TeamWithMembers[]
  loadingTeams: boolean
  selectedTeamIds: Set<string>
  expandedTeamIds: Set<string>
  selectedReviewers: string[]
  onToggleTeam: (teamId: string) => void
  onToggleExpand: (teamId: string) => void
}

function TeamsPanel({
  teams,
  loadingTeams,
  selectedTeamIds,
  expandedTeamIds,
  selectedReviewers,
  onToggleTeam,
  onToggleExpand,
}: TeamsPanelProps) {
  if (loadingTeams) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 size={20} className="animate-spin text-plm-accent" />
      </div>
    )
  }

  if (teams.length === 0) {
    return <p className="text-sm text-plm-fg-muted p-2">No teams found in your organization</p>
  }

  return (
    <div className="max-h-48 overflow-y-auto border border-plm-border rounded bg-plm-bg space-y-0.5">
      {teams.map((team) => {
        const isSelected = selectedTeamIds.has(team.id)
        const isExpanded = expandedTeamIds.has(team.id)
        const memberCount = team.members.length
        // Count how many of this team's members are currently selected (for partial indicator)
        const selectedMemberCount = team.members.filter((m) =>
          selectedReviewers.includes(m.id)
        ).length

        return (
          <div key={team.id} className="border-b border-plm-border/50 last:border-b-0">
            {/* Team row */}
            <div className="flex items-center gap-2 p-2 hover:bg-plm-highlight">
              {/* Expand toggle */}
              <button
                type="button"
                className="p-0.5 text-plm-fg-muted hover:text-plm-fg"
                onClick={() => onToggleExpand(team.id)}
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>

              {/* Select team checkbox */}
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleTeam(team.id)}
                className="w-4 h-4 rounded border-plm-border text-plm-accent"
              />

              {/* Team color dot + name */}
              <div
                className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: team.color + '33' }}
              >
                <Users size={12} style={{ color: team.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm text-plm-fg font-medium truncate">{team.name}</span>
              </div>

              {/* Member count / selected */}
              <span className="text-xs text-plm-fg-muted flex-shrink-0">
                {selectedMemberCount > 0 && selectedMemberCount < memberCount
                  ? `${selectedMemberCount}/`
                  : ''}
                {memberCount} member{memberCount !== 1 ? 's' : ''}
              </span>

              {isSelected && <Check size={14} className="text-plm-accent flex-shrink-0" />}
            </div>

            {/* Expanded member list */}
            {isExpanded && (
              <div className="pl-10 pr-2 pb-1">
                {team.members.length === 0 ? (
                  <p className="text-xs text-plm-fg-muted py-1">No members</p>
                ) : (
                  team.members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-2 py-1 text-xs text-plm-fg-muted"
                    >
                      <div className="w-4 h-4 rounded-full bg-plm-accent/10 flex items-center justify-center">
                        <UserCircle size={10} className="text-plm-accent" />
                      </div>
                      <span className="truncate">
                        {member.full_name || member.email}
                      </span>
                      {selectedReviewers.includes(member.id) && (
                        <Check size={12} className="text-plm-accent ml-auto flex-shrink-0" />
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
