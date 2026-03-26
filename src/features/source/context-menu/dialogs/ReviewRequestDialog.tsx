import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Send,
  File,
  Loader2,
  Users,
  Check,
  Calendar,
  UserCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import type { LocalFile } from '@/stores/pdmStore'
import type { OrgUser } from '../types'
import {
  getOrgUsers,
  createReviewRequest,
  getOrgTeamsWithMembers,
  resolveTeamReviewers,
  type TeamWithMembers,
} from '@/lib/supabase'
import { usePDMStore } from '@/stores/pdmStore'
import { log } from '@/lib/logger'

type SelectionTab = 'individuals' | 'teams'

interface ReviewRequestDialogProps {
  isOpen: boolean
  onClose: () => void
  file: LocalFile
  organizationId: string | undefined
  userId: string | undefined
  vaultId: string | null | undefined
  onSuccess: () => void
}

export function ReviewRequestDialog({
  isOpen,
  onClose,
  file,
  organizationId,
  userId,
  vaultId,
  onSuccess,
}: ReviewRequestDialogProps) {
  const { addToast } = usePDMStore()

  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([])
  const [teams, setTeams] = useState<TeamWithMembers[]>([])
  const [selectedReviewers, setSelectedReviewers] = useState<string[]>([])
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set())
  const [expandedTeamIds, setExpandedTeamIds] = useState<Set<string>>(new Set())
  const [reviewMessage, setReviewMessage] = useState('')
  const [reviewDueDate, setReviewDueDate] = useState('')
  const [reviewPriority, setReviewPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>(
    'normal',
  )
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [loadingTeams, setLoadingTeams] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState<SelectionTab>('teams')

  useEffect(() => {
    if (isOpen && organizationId) {
      setLoadingUsers(true)
      getOrgUsers(organizationId).then(({ users }) => {
        setOrgUsers(users.filter((u: { id: string }) => u.id !== userId))
        setLoadingUsers(false)
      })

      setLoadingTeams(true)
      getOrgTeamsWithMembers(organizationId)
        .then(({ teams: fetchedTeams, error }) => {
          if (error) log.error('[ReviewRequestDialog]', 'Failed to fetch teams', { error })
          setTeams(fetchedTeams)
        })
        .catch((err) => {
          log.error('[ReviewRequestDialog]', 'Error fetching teams', { error: err })
          setTeams([])
        })
        .finally(() => setLoadingTeams(false))
    }
  }, [isOpen, organizationId, userId])

  const handleToggleReviewer = useCallback((reviewerId: string) => {
    setSelectedReviewers((prev) =>
      prev.includes(reviewerId) ? prev.filter((id) => id !== reviewerId) : [...prev, reviewerId],
    )
  }, [])

  const toggleTeam = useCallback(
    (teamId: string) => {
      const team = teams.find((t) => t.id === teamId)
      if (!team) return

      const resolvedIds = resolveTeamReviewers(team)

      setSelectedTeamIds((prev) => {
        const next = new Set(prev)
        const isSelected = next.has(teamId)

        if (isSelected) {
          next.delete(teamId)
          for (const uid of resolvedIds) {
            const inOtherTeam = teams.some(
              (t) => t.id !== teamId && next.has(t.id) && resolveTeamReviewers(t).includes(uid),
            )
            if (!inOtherTeam) {
              setSelectedReviewers((sr) => sr.filter((id) => id !== uid))
            }
          }
        } else {
          next.add(teamId)
          setSelectedReviewers((sr) => {
            const set = new Set(sr)
            for (const uid of resolvedIds) set.add(uid)
            return Array.from(set)
          })
        }

        return next
      })
    },
    [teams],
  )

  const toggleExpand = useCallback((teamId: string) => {
    setExpandedTeamIds((prev) => {
      const next = new Set(prev)
      if (next.has(teamId)) next.delete(teamId)
      else next.add(teamId)
      return next
    })
  }, [])

  const lastSelectedTeamId = useMemo(() => {
    const ids = Array.from(selectedTeamIds)
    return ids.length === 1 ? ids[0] : ids.length > 0 ? ids[ids.length - 1] : undefined
  }, [selectedTeamIds])

  const uniqueReviewerCount = useMemo(() => new Set(selectedReviewers).size, [selectedReviewers])

  const handleSubmit = async () => {
    if (!userId || !organizationId || !vaultId) {
      addToast('error', 'Missing required information')
      return
    }

    if (selectedReviewers.length === 0) {
      addToast('warning', 'Please select at least one reviewer')
      return
    }

    if (!file.pdmData) {
      addToast('error', 'File must be synced to request a review')
      return
    }

    setIsSubmitting(true)

    const { error } = await createReviewRequest(
      organizationId,
      file.pdmData.id,
      vaultId,
      userId,
      selectedReviewers,
      file.pdmData.version || 1,
      undefined,
      reviewMessage || undefined,
      reviewDueDate || undefined,
      reviewPriority,
      lastSelectedTeamId,
    )

    if (error) {
      addToast('error', `Failed to create review request: ${error}`)
    } else {
      addToast(
        'success',
        `Review request sent to ${selectedReviewers.length} reviewer${selectedReviewers.length > 1 ? 's' : ''}`,
      )
      handleClose()
      onSuccess()
    }

    setIsSubmitting(false)
  }

  const handleClose = () => {
    setSelectedReviewers([])
    setSelectedTeamIds(new Set())
    setReviewMessage('')
    setReviewDueDate('')
    setReviewPriority('normal')
    onClose()
  }

  if (!isOpen) return null

  const teamsAvailable = organizationId !== undefined

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center"
      onClick={handleClose}
    >
      <div
        className="bg-plm-bg-light border border-plm-border rounded-lg p-6 max-w-md w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-plm-accent/20 flex items-center justify-center">
            <Send size={20} className="text-plm-accent" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-plm-fg">Request Review</h3>
            <p className="text-sm text-plm-fg-muted">{file.name}</p>
          </div>
        </div>

        {/* File info */}
        <div className="bg-plm-bg rounded border border-plm-border p-3 mb-4">
          <div className="flex items-center gap-2">
            <File size={16} className="text-plm-fg-muted" />
            <span className="text-plm-fg font-medium truncate">{file.name}</span>
            {file.pdmData?.version && (
              <span className="text-xs text-plm-fg-muted">v{file.pdmData.version}</span>
            )}
          </div>
        </div>

        {/* Selection tabs + content */}
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

        <div className="mb-4">
          {activeTab === 'individuals' ? (
            loadingUsers ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 size={20} className="animate-spin text-plm-accent" />
              </div>
            ) : orgUsers.length === 0 ? (
              <p className="text-sm text-plm-fg-muted p-2">No other users in your organization</p>
            ) : (
              <div className="max-h-48 overflow-y-auto border border-plm-border rounded bg-plm-bg">
                {orgUsers.map((orgUser) => (
                  <label
                    key={orgUser.id}
                    className="flex items-center gap-3 p-2 hover:bg-plm-highlight cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedReviewers.includes(orgUser.id)}
                      onChange={() => handleToggleReviewer(orgUser.id)}
                      className="w-4 h-4 rounded border-plm-border text-plm-accent"
                    />
                    {orgUser.avatar_url ? (
                      <img
                        src={orgUser.avatar_url}
                        alt=""
                        className="w-6 h-6 rounded-full"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-plm-accent/20 flex items-center justify-center">
                        <Users size={12} className="text-plm-accent" />
                      </div>
                    )}
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
          ) : loadingTeams ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 size={20} className="animate-spin text-plm-accent" />
            </div>
          ) : teams.length === 0 ? (
            <p className="text-sm text-plm-fg-muted p-2">No teams found in your organization</p>
          ) : (
            <div className="max-h-48 overflow-y-auto border border-plm-border rounded bg-plm-bg space-y-0.5">
              {teams.map((team) => {
                const isSelected = selectedTeamIds.has(team.id)
                const isExpanded = expandedTeamIds.has(team.id)
                const resolvedCount = resolveTeamReviewers(team).length
                const selectedMemberCount = team.members.filter((m) =>
                  selectedReviewers.includes(m.id),
                ).length

                return (
                  <div key={team.id} className="border-b border-plm-border/50 last:border-b-0">
                    <div className="flex items-center gap-2 p-2 hover:bg-plm-highlight">
                      <button
                        type="button"
                        className="p-0.5 text-plm-fg-muted hover:text-plm-fg"
                        onClick={() => toggleExpand(team.id)}
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleTeam(team.id)}
                        className="w-4 h-4 rounded border-plm-border text-plm-accent"
                      />
                      <div
                        className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: team.color + '33' }}
                      >
                        <Users size={12} style={{ color: team.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-plm-fg font-medium truncate">
                          {team.name}
                        </span>
                      </div>
                      <span className="text-xs text-plm-fg-muted flex-shrink-0">
                        {team.reviewerConfigs.length > 0
                          ? `${resolvedCount} reviewer${resolvedCount !== 1 ? 's' : ''}`
                          : `${team.members.length} member${team.members.length !== 1 ? 's' : ''}`}
                        {selectedMemberCount > 0 && ` · ${selectedMemberCount} selected`}
                      </span>
                      {isSelected && <Check size={14} className="text-plm-accent flex-shrink-0" />}
                    </div>
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
                              <span className="truncate">{member.full_name || member.email}</span>
                              {selectedReviewers.includes(member.id) && (
                                <Check
                                  size={12}
                                  className="text-plm-accent ml-auto flex-shrink-0"
                                />
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
          )}
        </div>

        {/* Due Date and Priority */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs text-plm-fg-muted uppercase tracking-wide mb-2">
              <Calendar size={12} className="inline mr-1" />
              Due Date (optional)
            </label>
            <input
              type="date"
              value={reviewDueDate}
              onChange={(e) => setReviewDueDate(e.target.value)}
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
              onChange={(e) =>
                setReviewPriority(e.target.value as 'low' | 'normal' | 'high' | 'urgent')
              }
              className="w-full px-3 py-2 text-sm bg-plm-bg border border-plm-border rounded focus:outline-none focus:border-plm-accent"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>

        {/* Message */}
        <div className="mb-4">
          <label className="block text-xs text-plm-fg-muted uppercase tracking-wide mb-2">
            Message (optional)
          </label>
          <textarea
            value={reviewMessage}
            onChange={(e) => setReviewMessage(e.target.value)}
            placeholder="Add a message for the reviewers..."
            className="w-full px-3 py-2 text-sm bg-plm-bg border border-plm-border rounded resize-none focus:outline-none focus:border-plm-accent"
            rows={2}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button onClick={handleClose} className="btn btn-ghost">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={selectedReviewers.length === 0 || isSubmitting}
            className="btn bg-plm-accent hover:bg-plm-accent/90 text-white disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Send Request {uniqueReviewerCount > 0 && `(${uniqueReviewerCount})`}
          </button>
        </div>
      </div>
    </div>
  )
}
