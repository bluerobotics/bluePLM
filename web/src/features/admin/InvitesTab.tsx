import { useState, type FormEvent } from 'react'
import { useT } from '@web/i18n'
import { EmptyState } from '@web/shell/ui'
import { createInvite, deleteInvite } from './adminData'
import { checkInvite, isInviteExpired, isUserRole, normalizeEmail, toggleId, USER_ROLES, type UserRole } from './adminLogic'
import { Button, CheckboxList, ConfirmButton, failure, formatDate, inputClass, NoticeBar, useAction } from './adminUi'
import type { TabProps } from './useAdminData'

export function InvitesTab({ data, orgId, currentUserId, reload }: TabProps) {
  const t = useT()
  const { busy, notice, setNotice, run } = useAction()
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  // Permissions come from teams; the desktop invites as viewer for the same reason.
  const [role, setRole] = useState<UserRole>('viewer')
  const [teamIds, setTeamIds] = useState<string[]>([])
  const [vaultIds, setVaultIds] = useState<string[]>([])
  const { invites, users, vaults } = data.snapshot
  const teamName = new Map(data.teams.map((team) => [team.id, team.name]))
  const vaultName = new Map(vaults.map((vault) => [vault.id, vault.name]))

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const problem = checkInvite(email, users, invites)
    if (problem) {
      setNotice({ tone: 'error', text: t(`admin.invites.${problem}`) })
      return
    }
    const address = normalizeEmail(email)
    void run(async () => {
      const result = await createInvite({ orgId, email: address, fullName, role, teamIds, vaultIds, invitedBy: currentUserId })
      if (!result.ok) return failure(result)
      setEmail('')
      setFullName('')
      setTeamIds([])
      setVaultIds([])
      reload()
      return { tone: 'success', text: t('admin.invites.created', { email: address }) }
    })
  }

  const onRevoke = (id: string, address: string) => {
    void run(async () => {
      const result = await deleteInvite(id)
      if (!result.ok) return failure(result)
      reload()
      return { tone: 'success', text: t('admin.invites.revoked', { email: address }) }
    })
  }

  const now = new Date()

  return (
    <div>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-3 px-4 py-3">
        <p className="text-xs text-plm-fg-dim">{t('admin.invites.intro')}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex flex-1 flex-col gap-1 text-xs text-plm-fg-dim">
            {t('admin.invites.email')}
            <input
              type="email"
              required
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs text-plm-fg-dim">
            {t('admin.invites.fullName')}
            <input
              type="text"
              autoComplete="off"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-plm-fg-dim">
            {t('admin.invites.role')}
            <select
              value={role}
              onChange={(event) => {
                if (isUserRole(event.target.value)) setRole(event.target.value)
              }}
              className={inputClass}
            >
              {USER_ROLES.map((value) => (
                <option key={value} value={value}>
                  {t(`admin.roles.${value}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-xs text-plm-fg-dim">{t('admin.invites.teams')}</legend>
          <CheckboxList
            items={data.teams.map((team) => ({ id: team.id, label: team.name }))}
            selected={teamIds}
            onToggle={(id) => setTeamIds((ids) => toggleId(ids, id))}
            empty={t('admin.invites.noTeamsAvailable')}
          />
        </fieldset>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-xs text-plm-fg-dim">{t('admin.invites.vaults')}</legend>
          <CheckboxList
            items={vaults.map((vault) => ({ id: vault.id, label: vault.name }))}
            selected={vaultIds}
            onToggle={(id) => setVaultIds((ids) => toggleId(ids, id))}
            empty={t('admin.invites.noVaultsAvailable')}
          />
        </fieldset>
        <div>
          <Button type="submit" tone="primary" disabled={busy || !email.trim()}>
            {busy ? t('admin.saving') : t('admin.invites.submit')}
          </Button>
        </div>
      </form>

      <h2 className="border-t border-plm-border px-4 pb-1 pt-3 text-sm font-semibold text-plm-fg">
        {t('admin.invites.pending')}
      </h2>
      {invites.length === 0 ? (
        <EmptyState>{t('admin.invites.none')}</EmptyState>
      ) : (
        <ul className="divide-y divide-plm-border">
          {invites.map((invite) => {
            const expired = isInviteExpired(invite, now)
            const invited = formatDate(invite.invited_at)
            const expires = formatDate(invite.expires_at)
            const grants = [
              ...(invite.team_ids ?? []).map((id) => teamName.get(id)).filter((name): name is string => !!name),
              ...(invite.vault_ids ?? []).map((id) => vaultName.get(id)).filter((name): name is string => !!name),
            ]
            return (
              <li key={invite.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm text-plm-fg">{invite.email}</span>
                    {invite.full_name && <span className="text-xs text-plm-fg-dim">{invite.full_name}</span>}
                    {invite.role && isUserRole(invite.role) && (
                      <span className="rounded bg-plm-bg-lighter px-1.5 text-xs text-plm-fg-dim">
                        {t(`admin.roles.${invite.role}`)}
                      </span>
                    )}
                    {expired && <span className="text-xs text-plm-error">{t('admin.invites.expired')}</span>}
                  </div>
                  {grants.length > 0 && <div className="truncate text-xs text-plm-fg-muted">{grants.join(', ')}</div>}
                  <div className="text-xs text-plm-fg-muted">
                    {invited && t('admin.invites.invitedOn', { date: invited })}
                    {!expired && expires && ` · ${t('admin.invites.expiresOn', { date: expires })}`}
                  </div>
                </div>
                <ConfirmButton
                  label={t('admin.invites.revoke')}
                  question={invite.email}
                  disabled={busy}
                  onConfirm={() => onRevoke(invite.id, invite.email)}
                />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
