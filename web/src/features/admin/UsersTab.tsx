import { useState } from 'react'
import { useT } from '@web/i18n'
import { EmptyState } from '@web/shell/ui'
import { changeRole, removeUser } from './adminData'
import { displayName, filterUsers, isUserRole, lastSeen, refuseAdminChange, USER_ROLES, type OrgUser } from './adminLogic'
import { ConfirmButton, failure, formatDate, inputClass, NoticeBar, useAction } from './adminUi'
import type { TabProps } from './useAdminData'

export function UsersTab({ data, orgId, currentUserId, reload }: TabProps) {
  const t = useT()
  const [query, setQuery] = useState('')
  const { busy, notice, setNotice, run } = useAction()
  const users = filterUsers(data.users, query)

  const onRole = (user: OrgUser, value: string) => {
    if (!isUserRole(value) || value === user.role) return
    const refusal = refuseAdminChange(data.users, { kind: 'role', userId: user.id, role: value }, currentUserId)
    if (refusal) {
      setNotice({ tone: 'error', text: t(`admin.refused.${refusal}`) })
      return
    }
    void run(async () => {
      const result = await changeRole(user.id, value, orgId)
      if (!result.ok) return failure(result)
      reload()
      return { tone: 'success', text: t('admin.users.roleChanged', { name: displayName(user), role: t(`admin.roles.${value}`) }) }
    })
  }

  const onRemove = (user: OrgUser) => {
    void run(async () => {
      const result = await removeUser(user.id, orgId)
      if (!result.ok) return failure(result)
      reload()
      return { tone: 'success', text: t('admin.users.removed', { name: displayName(user) }) }
    })
  }

  return (
    <div>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('admin.users.search')}
          aria-label={t('admin.users.search')}
          className={`${inputClass} w-full sm:w-72`}
        />
        <span className="text-xs text-plm-fg-muted">{t('admin.users.count', { count: data.users.length })}</span>
      </div>
      {users.length === 0 ? (
        <EmptyState>{t('admin.users.empty')}</EmptyState>
      ) : (
        <ul className="divide-y divide-plm-border border-t border-plm-border">
          {users.map((user) => {
            const isSelf = user.id === currentUserId
            const removeRefusal = refuseAdminChange(data.users, { kind: 'remove', userId: user.id }, currentUserId)
            const seen = formatDate(lastSeen(user))
            const adminByTeamOnly = user.isAdmin && user.role !== 'admin'
            return (
              <li key={user.id} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-plm-fg">{displayName(user)}</span>
                    {isSelf && <span className="text-xs text-plm-fg-muted">({t('admin.users.you')})</span>}
                    {user.isAdmin && (
                      <span
                        className="rounded border border-plm-warning px-1.5 text-xs text-plm-warning"
                        title={adminByTeamOnly ? t('admin.users.adminViaTeam') : undefined}
                      >
                        {t('admin.users.adminBadge')}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-plm-fg-dim">{user.email}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {user.teams.length === 0 ? (
                      <span className="text-xs text-plm-fg-muted">{t('admin.users.noTeams')}</span>
                    ) : (
                      user.teams.map((team) => (
                        <span key={team.id} className="rounded bg-plm-bg-lighter px-1.5 text-xs text-plm-fg-dim">
                          {team.name}
                        </span>
                      ))
                    )}
                  </div>
                  <div className="mt-1 text-xs text-plm-fg-muted">
                    {seen ? t('admin.users.lastSeen', { when: seen }) : t('admin.users.never')}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={isUserRole(user.role) ? user.role : ''}
                    disabled={busy}
                    onChange={(event) => onRole(user, event.target.value)}
                    aria-label={t('admin.users.changeRole', { name: displayName(user) })}
                    className={inputClass}
                  >
                    {USER_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {t(`admin.roles.${role}`)}
                      </option>
                    ))}
                  </select>
                  <ConfirmButton
                    label={t('admin.users.remove')}
                    question={t('admin.users.removeConfirm', { name: displayName(user) })}
                    disabled={busy || removeRefusal !== null}
                    title={removeRefusal ? t(`admin.refused.${removeRefusal}`) : undefined}
                    onConfirm={() => onRemove(user)}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
