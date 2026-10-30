import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { useT } from '@web/i18n'
import { EmptyState } from '@web/shell/ui'
import { ADMINISTRATORS_TEAM_NAME } from '@/lib/isAdminUser'
import { addTeamMember, createTeam, deleteTeam, removeTeamMember, updateTeam } from './adminData'
import { checkTeamName, displayName, refuseAdminChange, type AdminTeam, type OrgUser } from './adminLogic'
import { Button, ConfirmButton, failure, inputClass, NoticeBar, useAction } from './adminUi'
import type { TabProps } from './useAdminData'

export function TeamsTab({ data, orgId, currentUserId, reload }: TabProps) {
  const t = useT()
  const action = useAction()
  const { busy, notice, setNotice, run } = action
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const onCreate = (event: FormEvent) => {
    event.preventDefault()
    const problem = checkTeamName(name, data.teams)
    if (problem) {
      setNotice({ tone: 'error', text: t(`admin.teams.name${capitalize(problem)}`) })
      return
    }
    const teamName = name.trim()
    void run(async () => {
      const result = await createTeam(orgId, teamName, description, currentUserId)
      if (!result.ok) {
        return result.code === '23505' ? { tone: 'error', text: t('admin.teams.nameDuplicate') } : failure(result)
      }
      setName('')
      setDescription('')
      reload()
      return { tone: 'success', text: t('admin.teams.created', { name: teamName }) }
    })
  }

  return (
    <div>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <form onSubmit={onCreate} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-end">
        <label className="flex flex-col gap-1 text-xs text-plm-fg-dim">
          {t('admin.teams.name')}
          <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs text-plm-fg-dim">
          {t('admin.teams.description')}
          <input value={description} onChange={(event) => setDescription(event.target.value)} className={inputClass} />
        </label>
        <Button type="submit" tone="primary" disabled={busy || !name.trim()}>
          {t('admin.teams.submitCreate')}
        </Button>
      </form>
      {data.teams.length === 0 ? (
        <EmptyState>{t('admin.teams.none')}</EmptyState>
      ) : (
        <ul className="divide-y divide-plm-border border-t border-plm-border">
          {data.teams.map((team) => (
            <TeamRow
              key={team.id}
              team={team}
              open={openId === team.id}
              onToggle={() => setOpenId((id) => (id === team.id ? null : team.id))}
              data={data}
              orgId={orgId}
              currentUserId={currentUserId}
              reload={reload}
              action={action}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function TeamRow({
  team,
  open,
  onToggle,
  data,
  currentUserId,
  reload,
  action,
}: TabProps & { team: AdminTeam; open: boolean; onToggle: () => void; action: ReturnType<typeof useAction> }) {
  const t = useT()
  const { busy, setNotice, run } = action
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(team.name)
  const [description, setDescription] = useState(team.description ?? '')
  const [newMember, setNewMember] = useState('')
  const userById = new Map(data.users.map((user) => [user.id, user]))
  const members = team.memberIds.map((id) => userById.get(id)).filter((user): user is OrgUser => !!user)
  const candidates = data.users.filter((user) => !team.memberIds.includes(user.id))
  const isAdminTeam = team.name === ADMINISTRATORS_TEAM_NAME

  const onSave = () => {
    const problem = checkTeamName(name, data.teams, team.id)
    if (problem) {
      setNotice({ tone: 'error', text: t(`admin.teams.name${capitalize(problem)}`) })
      return
    }
    const teamName = name.trim()
    void run(async () => {
      const result = await updateTeam(team.id, teamName, description, currentUserId)
      if (!result.ok) {
        return result.code === '23505' ? { tone: 'error', text: t('admin.teams.nameDuplicate') } : failure(result)
      }
      setEditing(false)
      reload()
      return { tone: 'success', text: t('admin.teams.updated', { name: teamName }) }
    })
  }

  const onDelete = () => {
    void run(async () => {
      const result = await deleteTeam(team.id)
      if (!result.ok) return failure(result)
      reload()
      return { tone: 'success', text: t('admin.teams.deleted', { name: team.name }) }
    })
  }

  const onAdd = () => {
    const user = userById.get(newMember)
    if (!user) return
    void run(async () => {
      const result = await addTeamMember(team.id, user.id, currentUserId)
      if (!result.ok) return failure(result)
      setNewMember('')
      reload()
      return { tone: 'success', text: t('admin.teams.memberAdded', { name: displayName(user), team: team.name }) }
    })
  }

  const onRemove = (user: OrgUser) => {
    const refusal = refuseAdminChange(data.users, { kind: 'leaveTeam', userId: user.id, teamId: team.id }, currentUserId)
    if (refusal) {
      setNotice({ tone: 'error', text: t(`admin.refused.${refusal}`) })
      return
    }
    void run(async () => {
      const result = await removeTeamMember(team.id, user.id)
      if (!result.ok) return failure(result)
      reload()
      return { tone: 'success', text: t('admin.teams.memberRemoved', { name: displayName(user), team: team.name }) }
    })
  }

  return (
    <li className="px-4 py-3">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-2 text-left">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: team.color }} aria-hidden />
        <span className="min-w-0 truncate text-sm font-medium text-plm-fg">{team.name}</span>
        {team.protected && (
          <span className="rounded border border-plm-warning px-1.5 text-xs text-plm-warning">{t('admin.teams.required')}</span>
        )}
        <span className="ml-auto shrink-0 text-xs text-plm-fg-muted">{t('admin.teams.members', { count: members.length })}</span>
      </button>
      {team.description && !open && <p className="mt-1 truncate pl-4 text-xs text-plm-fg-dim">{team.description}</p>}
      {open && (
        <div className="mt-3 flex flex-col gap-3 pl-4">
          {isAdminTeam && <p className="text-xs text-plm-fg-dim">{t('admin.teams.adminTeamNote')}</p>}
          {team.protected ? (
            <p className="text-xs text-plm-fg-muted">{t('admin.refused.systemTeam')}</p>
          ) : editing ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="flex flex-col gap-1 text-xs text-plm-fg-dim">
                {t('admin.teams.name')}
                <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-xs text-plm-fg-dim">
                {t('admin.teams.description')}
                <input value={description} onChange={(event) => setDescription(event.target.value)} className={inputClass} />
              </label>
              <div className="flex gap-2">
                <Button tone="primary" disabled={busy} onClick={onSave}>
                  {t('admin.teams.save')}
                </Button>
                <Button
                  onClick={() => {
                    setEditing(false)
                    setName(team.name)
                    setDescription(team.description ?? '')
                  }}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {team.description && <p className="w-full text-xs text-plm-fg-dim">{team.description}</p>}
              <Button disabled={busy} onClick={() => setEditing(true)}>
                {t('admin.teams.rename')}
              </Button>
              <ConfirmButton
                label={t('admin.teams.delete')}
                question={t('admin.teams.deleteConfirm', { name: team.name })}
                disabled={busy}
                onConfirm={onDelete}
              />
            </div>
          )}

          {members.length === 0 ? (
            <p className="text-xs text-plm-fg-muted">{t('admin.teams.noMembers')}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {members.map((user) => {
                const refusal = refuseAdminChange(
                  data.users,
                  { kind: 'leaveTeam', userId: user.id, teamId: team.id },
                  currentUserId,
                )
                const label = t('admin.teams.removeMember', { name: displayName(user), team: team.name })
                return (
                  <li key={user.id} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-plm-fg">
                      {displayName(user)} <span className="text-xs text-plm-fg-muted">{user.email}</span>
                    </span>
                    <Button
                      disabled={busy || refusal !== null}
                      title={refusal ? t(`admin.refused.${refusal}`) : label}
                      aria-label={label}
                      onClick={() => onRemove(user)}
                    >
                      <X size={14} />
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}

          {candidates.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={newMember}
                onChange={(event) => setNewMember(event.target.value)}
                aria-label={t('admin.teams.addMember')}
                className={`${inputClass} min-w-0 max-w-full`}
              >
                <option value="">{t('admin.teams.choose')}</option>
                {candidates.map((user) => (
                  <option key={user.id} value={user.id}>
                    {displayName(user)}
                  </option>
                ))}
              </select>
              <Button disabled={busy || !newMember} onClick={onAdd}>
                {t('admin.teams.add')}
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}
