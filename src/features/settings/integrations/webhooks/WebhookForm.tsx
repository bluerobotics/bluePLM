import { Check, ChevronDown, ChevronRight, Copy, Eye, EyeOff, RefreshCw } from 'lucide-react'

import { Button, SegmentedControl, Switch, TextInput } from '@/components/core/ui'
import { SettingRow, SettingsGroup, SettingsSection } from '@/features/settings/components/ui'
import type { WebhookTriggerFilter } from '@/types/database'

import { EVENTS_BY_CATEGORY, USER_ROLES, generateSecret } from './webhookConstants'
import type { WebhooksState } from './useWebhooks'

const CHECKBOX_CLASS =
  'w-4 h-4 rounded border-ui-field-border bg-ui-field text-ui-accent focus:ring-ui-accent focus:ring-offset-0'

const TRIGGER_OPTIONS: { value: WebhookTriggerFilter; label: string }[] = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'roles', label: 'Specific Roles' },
  { value: 'users', label: 'Specific Users' },
]

/** Create or edit one webhook. */
export function WebhookForm({ webhooks }: { webhooks: WebhooksState }) {
  const {
    editingId,
    formData,
    setFormData,
    showSecret,
    setShowSecret,
    secretCopied,
    expandedCategories,
    setExpandedCategories,
    orgUsers,
    saving,
    handleSubmit,
    handleCopySecret,
    toggleEvent,
    toggleCategory,
    closeForm,
  } = webhooks

  return (
    <form onSubmit={handleSubmit}>
      <SettingsSection
        title={editingId ? 'Edit Webhook' : 'New Webhook'}
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={closeForm}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              type="submit"
              loading={saving}
              icon={<Check size={14} />}
            >
              {saving ? 'Saving...' : `${editingId ? 'Update' : 'Create'} Webhook`}
            </Button>
          </>
        }
      >
        <SettingsGroup>
          <SettingRow label="Name *" htmlFor="webhook-name" stacked>
            <TextInput
              id="webhook-name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Slack Notifications"
              autoFocus
            />
          </SettingRow>

          <SettingRow label="Description" htmlFor="webhook-description" stacked>
            <TextInput
              id="webhook-description"
              type="text"
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Optional description"
            />
          </SettingRow>

          <SettingRow label="Payload URL *" htmlFor="webhook-url" stacked>
            <TextInput
              id="webhook-url"
              type="url"
              value={formData.url}
              onChange={(e) => setFormData((prev) => ({ ...prev, url: e.target.value }))}
              placeholder="https://example.com/webhooks/blueplm"
              className="font-mono"
            />
          </SettingRow>

          {/* Secret (only for new webhooks) */}
          {!editingId && (
            <SettingRow
              label="Secret"
              htmlFor="webhook-secret"
              description="Used to sign payloads. Store this securely — you won't see it again."
              stacked
            >
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <TextInput
                    id="webhook-secret"
                    type={showSecret ? 'text' : 'password'}
                    value={formData.secret}
                    readOnly
                    className="pr-16 font-mono"
                  />
                  <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="p-1 text-ui-fg-secondary hover:text-ui-fg"
                      title={showSecret ? 'Hide' : 'Show'}
                    >
                      {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button
                      type="button"
                      onClick={handleCopySecret}
                      className={`p-1 ${secretCopied ? 'text-ui-success' : 'text-ui-fg-secondary hover:text-ui-fg'}`}
                      title="Copy"
                    >
                      {secretCopied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
                <Button
                  onClick={() => setFormData((prev) => ({ ...prev, secret: generateSecret() }))}
                  icon={<RefreshCw size={14} />}
                >
                  Regenerate
                </Button>
              </div>
            </SettingRow>
          )}

          <SettingRow label="Events *" stacked>
            <div className="divide-y divide-ui-divider">
              {Object.entries(EVENTS_BY_CATEGORY).map(([category, events]) => {
                const allSelected = events.every((e) => formData.events.includes(e.value))
                const someSelected = events.some((e) => formData.events.includes(e.value))

                return (
                  <div key={category}>
                    <div className="flex items-center justify-between py-2">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedCategories((prev) => ({
                            ...prev,
                            [category]: !prev[category],
                          }))
                        }
                        className="flex flex-1 items-center gap-2 text-left"
                      >
                        {expandedCategories[category] ? (
                          <ChevronDown size={14} className="text-ui-fg-secondary" />
                        ) : (
                          <ChevronRight size={14} className="text-ui-fg-secondary" />
                        )}
                        <span className="text-[14px] text-ui-fg">{category}</span>
                        {someSelected && (
                          <span className="text-[13px] text-ui-fg-secondary">
                            ({events.filter((e) => formData.events.includes(e.value)).length}/
                            {events.length})
                          </span>
                        )}
                      </button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleCategory(category, events)}
                      >
                        {allSelected ? 'Deselect All' : 'Select All'}
                      </Button>
                    </div>
                    {expandedCategories[category] && (
                      <div className="space-y-0.5 pb-2 pl-5">
                        {events.map((event) => (
                          <label
                            key={event.value}
                            className="flex cursor-pointer items-center gap-2 py-1.5"
                          >
                            <input
                              type="checkbox"
                              checked={formData.events.includes(event.value)}
                              onChange={() => toggleEvent(event.value)}
                              className={CHECKBOX_CLASS}
                            />
                            <span className="text-[14px] text-ui-fg">{event.label}</span>
                            <code className="ml-auto font-mono text-[13px] text-ui-fg-secondary">
                              {event.value}
                            </code>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </SettingRow>

          {/* Trigger Filter - WHO triggers this webhook */}
          <SettingRow
            label="Trigger when action is by"
            stacked={formData.trigger_filter !== 'everyone'}
          >
            <div className="space-y-3">
              <SegmentedControl
                value={formData.trigger_filter}
                options={TRIGGER_OPTIONS}
                onChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    trigger_filter: value,
                    // Reset selections when changing filter type
                    trigger_roles: value === 'roles' ? prev.trigger_roles : [],
                    trigger_user_ids: value === 'users' ? prev.trigger_user_ids : [],
                  }))
                }
                aria-label="Trigger when action is by"
              />

              {formData.trigger_filter === 'roles' && (
                <div className="space-y-2">
                  <p className="text-[14px] text-ui-fg-secondary">
                    Select which roles trigger this webhook:
                  </p>
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {USER_ROLES.map((role) => (
                      <label
                        key={role.value}
                        className="flex cursor-pointer items-center gap-2 text-[14px] text-ui-fg"
                      >
                        <input
                          type="checkbox"
                          checked={formData.trigger_roles.includes(role.value)}
                          onChange={() => {
                            setFormData((prev) => ({
                              ...prev,
                              trigger_roles: prev.trigger_roles.includes(role.value)
                                ? prev.trigger_roles.filter((r) => r !== role.value)
                                : [...prev.trigger_roles, role.value],
                            }))
                          }}
                          className={CHECKBOX_CLASS}
                        />
                        {role.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {formData.trigger_filter === 'users' && (
                <div className="space-y-2">
                  <p className="text-[14px] text-ui-fg-secondary">
                    Select which users trigger this webhook:
                  </p>
                  <div className="max-h-48 divide-y divide-ui-divider overflow-y-auto">
                    {orgUsers.map((orgUser) => (
                      <label
                        key={orgUser.id}
                        className="flex cursor-pointer items-center gap-3 py-2"
                      >
                        <input
                          type="checkbox"
                          checked={formData.trigger_user_ids.includes(orgUser.id)}
                          onChange={() => {
                            setFormData((prev) => ({
                              ...prev,
                              trigger_user_ids: prev.trigger_user_ids.includes(orgUser.id)
                                ? prev.trigger_user_ids.filter((id) => id !== orgUser.id)
                                : [...prev.trigger_user_ids, orgUser.id],
                            }))
                          }}
                          className={CHECKBOX_CLASS}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[14px] text-ui-fg">
                            {orgUser.full_name || orgUser.email}
                          </div>
                          {orgUser.full_name && (
                            <div className="truncate text-[13px] text-ui-fg-secondary">
                              {orgUser.email}
                            </div>
                          )}
                        </div>
                        <span className="text-[13px] capitalize text-ui-fg-secondary">
                          {orgUser.role}
                        </span>
                      </label>
                    ))}
                    {orgUsers.length === 0 && (
                      <p className="py-2 text-center text-[14px] text-ui-fg-secondary">
                        No users found
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </SettingRow>

          <SettingRow label="Active" htmlFor="webhook-active">
            <Switch
              id="webhook-active"
              checked={formData.is_active}
              onChange={(checked) => setFormData((prev) => ({ ...prev, is_active: checked }))}
            />
          </SettingRow>
        </SettingsGroup>
      </SettingsSection>
    </form>
  )
}
