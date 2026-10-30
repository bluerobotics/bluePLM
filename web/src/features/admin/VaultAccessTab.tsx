import { useState } from 'react'
import { useT } from '@web/i18n'
import { EmptyState } from '@web/shell/ui'
import { setTeamVaults, setUserVaults } from './adminData'
import { diffIds, displayName, grantedVaultIds, toggleId, vaultsViaTeams } from './adminLogic'
import { Button, failure, inputClass, NoticeBar, useAction } from './adminUi'
import type { TabProps } from './useAdminData'

type Mode = 'user' | 'team'

export function VaultAccessTab(props: TabProps) {
  const t = useT()
  const { data } = props
  const [mode, setMode] = useState<Mode>('user')
  const [subjectId, setSubjectId] = useState('')
  const action = useAction()

  const subjects =
    mode === 'user'
      ? data.users.map((user) => ({ id: user.id, label: displayName(user) }))
      : data.teams.map((team) => ({ id: team.id, label: team.name }))

  return (
    <div>
      <NoticeBar notice={action.notice} onClose={() => action.setNotice(null)} />
      <div className="flex flex-col gap-3 px-4 py-3">
        <p className="max-w-2xl text-xs text-plm-fg-dim">{t('admin.vaults.intro')}</p>
        <div className="flex flex-wrap items-center gap-2">
          {(['user', 'team'] as const).map((value) => (
            <Button
              key={value}
              tone={mode === value ? 'primary' : 'default'}
              aria-pressed={mode === value}
              onClick={() => {
                setMode(value)
                setSubjectId('')
              }}
            >
              {t(value === 'user' ? 'admin.vaults.byUser' : 'admin.vaults.byTeam')}
            </Button>
          ))}
          <select
            value={subjectId}
            onChange={(event) => setSubjectId(event.target.value)}
            aria-label={t(mode === 'user' ? 'admin.vaults.chooseUser' : 'admin.vaults.chooseTeam')}
            className={`${inputClass} min-w-0 max-w-full`}
          >
            <option value="">{t(mode === 'user' ? 'admin.vaults.chooseUser' : 'admin.vaults.chooseTeam')}</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {data.snapshot.vaults.length === 0 ? (
        <EmptyState>{t('admin.vaults.none')}</EmptyState>
      ) : !subjectId ? (
        <EmptyState>{t('admin.vaults.pick')}</EmptyState>
      ) : (
        <AccessEditor key={`${mode}:${subjectId}`} {...props} mode={mode} subjectId={subjectId} action={action} />
      )}
    </div>
  )
}

function AccessEditor({
  data,
  currentUserId,
  reload,
  mode,
  subjectId,
  action,
}: TabProps & { mode: Mode; subjectId: string; action: ReturnType<typeof useAction> }) {
  const t = useT()
  const { vaults, userAccess, teamAccess } = data.snapshot
  const current =
    mode === 'user' ? grantedVaultIds(userAccess, 'user_id', subjectId) : grantedVaultIds(teamAccess, 'team_id', subjectId)
  const [selected, setSelected] = useState<string[]>(current)
  const user = mode === 'user' ? data.users.find((candidate) => candidate.id === subjectId) : undefined
  const team = mode === 'team' ? data.teams.find((candidate) => candidate.id === subjectId) : undefined
  const viaTeams = user ? vaultsViaTeams(user.teams, teamAccess) : new Map<string, string[]>()
  const changed = (() => {
    const { add, remove } = diffIds(current, selected)
    return add.length + remove.length > 0
  })()

  const onSave = () => {
    void action.run(async () => {
      const result =
        mode === 'user'
          ? await setUserVaults(subjectId, current, selected, currentUserId)
          : await setTeamVaults(subjectId, current, selected, currentUserId)
      if (!result.ok) return failure(result)
      reload()
      return mode === 'user'
        ? { tone: 'success', text: t('admin.vaults.savedUser', { name: user ? displayName(user) : '' }) }
        : { tone: 'success', text: t('admin.vaults.savedTeam', { name: team?.name ?? '' }) }
    })
  }

  return (
    <div className="flex flex-col gap-2 border-t border-plm-border px-4 py-3">
      {user?.isAdmin && <p className="text-xs text-plm-warning">{t('admin.vaults.adminAll')}</p>}
      <ul className="flex flex-col gap-1">
        {vaults.map((vault) => {
          const teams = viaTeams.get(vault.id)
          return (
            <li key={vault.id}>
              <label className="flex flex-wrap items-center gap-2 text-sm text-plm-fg">
                <input
                  type="checkbox"
                  checked={selected.includes(vault.id)}
                  disabled={action.busy}
                  onChange={() => setSelected((ids) => toggleId(ids, vault.id))}
                />
                {vault.name}
                {teams && (
                  <span className="text-xs text-plm-fg-muted">{t('admin.vaults.viaTeams', { teams: teams.join(', ') })}</span>
                )}
              </label>
            </li>
          )
        })}
      </ul>
      <div>
        <Button tone="primary" disabled={action.busy || !changed} onClick={onSave}>
          {action.busy ? t('admin.saving') : t('admin.vaults.save')}
        </Button>
      </div>
    </div>
  )
}
