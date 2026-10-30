import { useState } from 'react'
import { X, Key, Search, Clock, Check } from 'lucide-react'

import { Button, TextInput, Select } from '@/components/core/ui'
import { getInitials } from '@/lib/utils'
import type { AddLicenseFormData, OrgUser } from './types'

interface AddLicenseModalProps {
  users: OrgUser[]
  onClose: () => void
  onSave: (
    data: Omit<AddLicenseFormData, 'seats'> & { seats?: number },
    assignToUserId?: string,
    isPending?: boolean,
  ) => Promise<{ success: boolean; error?: string }>
}

const PRODUCT_OPTIONS = [
  'SOLIDWORKS Standard',
  'SOLIDWORKS Professional',
  'SOLIDWORKS Premium',
  'SOLIDWORKS CAM Standard',
  'SOLIDWORKS CAM Professional',
  'SOLIDWORKS Simulation Standard',
  'SOLIDWORKS Simulation Professional',
  'SOLIDWORKS Flow Simulation',
  'SOLIDWORKS Plastics',
  'SOLIDWORKS Composer',
  'SOLIDWORKS Electrical',
  'SOLIDWORKS PDM Professional',
  'SOLIDWORKS PDM Standard',
  'Other',
]

/**
 * Formats a serial number with spaces every 4 characters.
 */
function formatSerialNumber(input: string): string {
  const clean = input.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  const parts: string[] = []
  for (let i = 0; i < clean.length; i += 4) {
    parts.push(clean.slice(i, i + 4))
  }
  return parts.join(' ')
}

/**
 * Gets the raw serial number without spaces (for storage).
 */
function getRawSerialNumber(formatted: string): string {
  return formatted.replace(/\s/g, '').toUpperCase()
}

export function AddLicenseModal({ users, onClose, onSave }: AddLicenseModalProps) {
  const [formData, setFormData] = useState<AddLicenseFormData>({
    serial_number: '',
    nickname: '',
    license_type: 'standalone',
    product_name: '',
    seats: 1,
    purchase_date: '',
    expiry_date: '',
    notes: '',
  })

  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [userSearchQuery, setUserSearchQuery] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filter users by search query
  const filteredUsers = users.filter((user) => {
    const query = userSearchQuery.toLowerCase()
    return (
      user.email.toLowerCase().includes(query) ||
      (user.full_name?.toLowerCase().includes(query) ?? false)
    )
  })

  const activeUsers = filteredUsers.filter((u) => !u.is_pending)
  const pendingUsers = filteredUsers.filter((u) => u.is_pending)
  const selectedUser = users.find((u) => u.id === selectedUserId)

  const handleSerialChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatSerialNumber(e.target.value)
    updateField('serial_number', formatted)
  }

  const handleSerialPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text')
    const formatted = formatSerialNumber(pasted)
    updateField('serial_number', formatted)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!formData.serial_number.trim()) {
      setError('Serial number is required')
      return
    }

    const serial = getRawSerialNumber(formData.serial_number)
    if (serial.length < 8) {
      setError('Serial number seems too short')
      return
    }

    setIsSaving(true)

    const selectedUser = users.find((u) => u.id === selectedUserId)
    const result = await onSave(
      {
        serial_number: serial,
        nickname: formData.nickname.trim() || undefined,
        license_type: formData.license_type,
        product_name: formData.product_name || undefined,
        seats: formData.license_type === 'network' ? formData.seats : undefined,
        purchase_date: formData.purchase_date || undefined,
        expiry_date: formData.expiry_date || undefined,
        notes: formData.notes.trim() || undefined,
      } as AddLicenseFormData,
      selectedUserId || undefined,
      selectedUser?.is_pending,
    )

    setIsSaving(false)

    if (!result.success) {
      setError(result.error || 'Failed to add license')
    }
  }

  const updateField = <K extends keyof AddLicenseFormData>(
    field: K,
    value: AddLicenseFormData[K],
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const renderUserOption = (user: OrgUser) => {
    const isSelected = selectedUserId === user.id
    return (
      <button
        key={user.id}
        type="button"
        onClick={() => setSelectedUserId(isSelected ? '' : user.id)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-b border-ui-divider/50 last:border-b-0 ${
          isSelected ? 'bg-ui-accent/10' : 'hover:bg-ui-bg'
        }`}
      >
        <div
          className={`w-7 h-7 rounded-full overflow-hidden flex-shrink-0 ${user.is_pending ? 'bg-ui-warning/20' : 'bg-ui-field'}`}
        >
          {user.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={user.full_name || user.email}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              className={`w-full h-full flex items-center justify-center text-[12px] font-medium ${user.is_pending ? 'text-ui-warning' : 'text-ui-fg'}`}
            >
              {getInitials(user.full_name || user.email)}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-ui-fg truncate">{user.full_name || user.email}</span>
            {user.is_pending && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 bg-ui-warning/20 text-ui-warning text-[12px] rounded">
                <Clock size={10} />
                Pending
              </span>
            )}
          </div>
          {user.full_name && <div className="text-[12px] text-ui-fg-secondary truncate">{user.email}</div>}
        </div>
        {isSelected && <Check size={16} className="text-ui-accent flex-shrink-0" />}
      </button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-ui-field border border-ui-divider rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ui-divider">
          <div className="flex items-center gap-3">
            <Key size={20} className="text-ui-fg-secondary" />
            <h2 className="text-lg font-semibold text-ui-fg">Add SOLIDWORKS License</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-ui-fg-secondary hover:text-ui-fg rounded-lg hover:bg-ui-bg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {/* Serial Number */}
          <div className="space-y-1">
            <label className="text-[13px] font-medium text-ui-fg">
              Serial Number <span className="text-ui-danger">*</span>
            </label>
            <TextInput
              type="text"
              value={formData.serial_number}
              onChange={handleSerialChange}
              onPaste={handleSerialPaste}
              placeholder="XXXX XXXX XXXX XXXX XXXX XXXX"
              className="font-mono"
              required
            />
            <p className="text-[13px] text-ui-fg-secondary">
              Paste or type your serial number — it will be formatted automatically
            </p>
          </div>

          {/* Nickname */}
          <div className="space-y-1">
            <label className="text-[13px] font-medium text-ui-fg">Nickname</label>
            <TextInput
              type="text"
              value={formData.nickname}
              onChange={(e) => updateField('nickname', e.target.value)}
              placeholder="e.g., Design Team License 1"
            />
          </div>

          {/* License Type and Product row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[13px] font-medium text-ui-fg">License Type</label>
              <Select
                value={formData.license_type}
                onChange={(e) =>
                  updateField('license_type', e.target.value as 'standalone' | 'network')
                }
                className="w-full"
              >
                <option value="standalone">Standalone</option>
                <option value="network">Network</option>
              </Select>
            </div>

            {formData.license_type === 'network' ? (
              <div className="space-y-1">
                <label className="text-[13px] font-medium text-ui-fg">Seats</label>
                <TextInput
                  type="number"
                  min={1}
                  value={formData.seats}
                  onChange={(e) => updateField('seats', parseInt(e.target.value) || 1)}
                />
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-[13px] font-medium text-ui-fg">Product</label>
                <Select
                  value={formData.product_name}
                  onChange={(e) => updateField('product_name', e.target.value)}
                className="w-full"
                >
                  <option value="">Select...</option>
                  {PRODUCT_OPTIONS.map((product) => (
                    <option key={product} value={product}>
                      {product}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>

          {/* Product for network (separate row) */}
          {formData.license_type === 'network' && (
            <div className="space-y-1">
              <label className="text-[13px] font-medium text-ui-fg">Product</label>
              <Select
                value={formData.product_name}
                onChange={(e) => updateField('product_name', e.target.value)}
                className="w-full"
              >
                <option value="">Select a product...</option>
                {PRODUCT_OPTIONS.map((product) => (
                  <option key={product} value={product}>
                    {product}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {/* Assign to User */}
          <div className="space-y-2">
            <label className="text-[13px] font-medium text-ui-fg">Assign To (Optional)</label>

            {/* Search bar */}
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ui-fg-secondary"
              />
              <TextInput
                type="text"
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                placeholder="Search users..."
                className="pl-9"
              />
            </div>

            {/* Scrollable user list */}
            <div className="border border-ui-divider rounded-lg bg-ui-bg overflow-hidden">
              <div className="max-h-40 overflow-y-auto">
                {users.length === 0 ? (
                  <div className="px-3 py-4 text-center text-[13px] text-ui-fg-secondary">
                    No users in organization
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="px-3 py-4 text-center text-[13px] text-ui-fg-secondary">
                    No users found matching "{userSearchQuery}"
                  </div>
                ) : (
                  <>
                    {/* Active users */}
                    {activeUsers.length > 0 && (
                      <>
                        {pendingUsers.length > 0 && (
                          <div className="px-3 py-1.5 text-[13px] text-ui-fg-secondary bg-ui-field border-b border-ui-divider">
                            Active Members
                          </div>
                        )}
                        {activeUsers.map(renderUserOption)}
                      </>
                    )}

                    {/* Pending users */}
                    {pendingUsers.length > 0 && (
                      <>
                        <div className="px-3 py-1.5 text-[13px] text-ui-fg-secondary bg-ui-field border-y border-ui-divider flex items-center gap-1">
                          <Clock size={10} />
                          Pending Invites
                        </div>
                        {pendingUsers.map(renderUserOption)}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {selectedUser && (
              <p className="text-[12px] text-ui-accent">
                Will assign to {selectedUser.full_name || selectedUser.email}
                {selectedUser.is_pending && ' when they sign up'}
              </p>
            )}
          </div>

          {/* Error message */}
          {error && (
            <div className="text-[14px] text-ui-danger">
              {error}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-ui-divider">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" onClick={handleSubmit} loading={isSaving}>
            {selectedUserId ? 'Add & Assign License' : 'Add License'}
          </Button>
        </div>
      </div>
    </div>
  )
}
