import { useState } from 'react'
import { X, Loader2, Key, Search, Clock, Check } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import type { AddLicenseFormData, OrgUser } from './types'

interface AddLicenseModalProps {
  users: OrgUser[]
  onClose: () => void
  onSave: (data: Omit<AddLicenseFormData, 'seats'> & { seats?: number }, assignToUserId?: string, isPending?: boolean) => Promise<{ success: boolean; error?: string }>
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
  'Other'
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
    notes: ''
  })
  
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [userSearchQuery, setUserSearchQuery] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Filter users by search query
  const filteredUsers = users.filter(user => {
    const query = userSearchQuery.toLowerCase()
    return (
      user.email.toLowerCase().includes(query) ||
      (user.full_name?.toLowerCase().includes(query) ?? false)
    )
  })
  
  const activeUsers = filteredUsers.filter(u => !u.is_pending)
  const pendingUsers = filteredUsers.filter(u => u.is_pending)
  const selectedUser = users.find(u => u.id === selectedUserId)
  
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
    
    const selectedUser = users.find(u => u.id === selectedUserId)
    const result = await onSave({
      serial_number: serial,
      nickname: formData.nickname.trim() || undefined,
      license_type: formData.license_type,
      product_name: formData.product_name || undefined,
      seats: formData.license_type === 'network' ? formData.seats : undefined,
      purchase_date: formData.purchase_date || undefined,
      expiry_date: formData.expiry_date || undefined,
      notes: formData.notes.trim() || undefined
    } as AddLicenseFormData, selectedUserId || undefined, selectedUser?.is_pending)
    
    setIsSaving(false)
    
    if (!result.success) {
      setError(result.error || 'Failed to add license')
    }
  }
  
  const updateField = <K extends keyof AddLicenseFormData>(field: K, value: AddLicenseFormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }
  
  const renderUserOption = (user: OrgUser) => {
    const isSelected = selectedUserId === user.id
    return (
      <button
        key={user.id}
        type="button"
        onClick={() => setSelectedUserId(isSelected ? '' : user.id)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-b border-plm-border/50 last:border-b-0 ${
          isSelected 
            ? 'bg-plm-accent/10' 
            : 'hover:bg-plm-bg'
        }`}
      >
        <div className={`w-7 h-7 rounded-full overflow-hidden flex-shrink-0 ${user.is_pending ? 'bg-yellow-500/20' : 'bg-plm-bg-secondary'}`}>
          {user.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={user.full_name || user.email}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className={`w-full h-full flex items-center justify-center text-xs font-medium ${user.is_pending ? 'text-yellow-400' : 'text-plm-fg'}`}>
              {getInitials(user.full_name || user.email)}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm text-plm-fg truncate">
              {user.full_name || user.email}
            </span>
            {user.is_pending && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded">
                <Clock size={10} />
                Pending
              </span>
            )}
          </div>
          {user.full_name && (
            <div className="text-xs text-plm-fg-muted truncate">{user.email}</div>
          )}
        </div>
        {isSelected && (
          <Check size={16} className="text-plm-accent flex-shrink-0" />
        )}
      </button>
    )
  }
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-plm-bg-secondary border border-plm-border rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-plm-border">
          <div className="flex items-center gap-3">
            <Key size={20} className="text-plm-accent" />
            <h2 className="text-lg font-semibold text-plm-fg">Add SOLIDWORKS License</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-plm-fg-muted hover:text-plm-fg rounded-lg hover:bg-plm-bg transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {/* Serial Number */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-plm-fg">
              Serial Number <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={formData.serial_number}
              onChange={handleSerialChange}
              onPaste={handleSerialPaste}
              placeholder="XXXX XXXX XXXX XXXX XXXX XXXX"
              className="w-full px-3 py-2 bg-plm-bg border border-plm-border rounded-lg text-sm text-plm-fg placeholder-plm-fg-dim focus:outline-none focus:border-plm-accent font-mono tracking-wider"
              required
            />
            <p className="text-xs text-plm-fg-dim">
              Paste or type your serial number — it will be formatted automatically
            </p>
          </div>
          
          {/* Nickname */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-plm-fg">Nickname</label>
            <input
              type="text"
              value={formData.nickname}
              onChange={(e) => updateField('nickname', e.target.value)}
              placeholder="e.g., Design Team License 1"
              className="w-full px-3 py-2 bg-plm-bg border border-plm-border rounded-lg text-sm text-plm-fg placeholder-plm-fg-dim focus:outline-none focus:border-plm-accent"
            />
          </div>
          
          {/* License Type and Product row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-plm-fg">License Type</label>
              <select
                value={formData.license_type}
                onChange={(e) => updateField('license_type', e.target.value as 'standalone' | 'network')}
                className="w-full px-3 py-2 bg-plm-bg border border-plm-border rounded-lg text-sm text-plm-fg focus:outline-none focus:border-plm-accent"
              >
                <option value="standalone">Standalone</option>
                <option value="network">Network</option>
              </select>
            </div>
            
            {formData.license_type === 'network' ? (
              <div className="space-y-1">
                <label className="text-sm font-medium text-plm-fg">Seats</label>
                <input
                  type="number"
                  min={1}
                  value={formData.seats}
                  onChange={(e) => updateField('seats', parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 bg-plm-bg border border-plm-border rounded-lg text-sm text-plm-fg focus:outline-none focus:border-plm-accent"
                />
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-sm font-medium text-plm-fg">Product</label>
                <select
                  value={formData.product_name}
                  onChange={(e) => updateField('product_name', e.target.value)}
                  className="w-full px-3 py-2 bg-plm-bg border border-plm-border rounded-lg text-sm text-plm-fg focus:outline-none focus:border-plm-accent"
                >
                  <option value="">Select...</option>
                  {PRODUCT_OPTIONS.map((product) => (
                    <option key={product} value={product}>{product}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          
          {/* Product for network (separate row) */}
          {formData.license_type === 'network' && (
            <div className="space-y-1">
              <label className="text-sm font-medium text-plm-fg">Product</label>
              <select
                value={formData.product_name}
                onChange={(e) => updateField('product_name', e.target.value)}
                className="w-full px-3 py-2 bg-plm-bg border border-plm-border rounded-lg text-sm text-plm-fg focus:outline-none focus:border-plm-accent"
              >
                <option value="">Select a product...</option>
                {PRODUCT_OPTIONS.map((product) => (
                  <option key={product} value={product}>{product}</option>
                ))}
              </select>
            </div>
          )}
          
          {/* Assign to User */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-plm-fg">Assign To (Optional)</label>
            
            {/* Search bar */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-plm-fg-muted" />
              <input
                type="text"
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                placeholder="Search users..."
                className="w-full pl-9 pr-3 py-2 bg-plm-bg border border-plm-border rounded-lg text-sm text-plm-fg placeholder-plm-fg-dim focus:outline-none focus:border-plm-accent"
              />
            </div>
            
            {/* Scrollable user list */}
            <div className="border border-plm-border rounded-lg bg-plm-bg overflow-hidden">
              <div className="max-h-40 overflow-y-auto">
                {users.length === 0 ? (
                  <div className="px-3 py-4 text-center text-sm text-plm-fg-muted">
                    No users in organization
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="px-3 py-4 text-center text-sm text-plm-fg-muted">
                    No users found matching "{userSearchQuery}"
                  </div>
                ) : (
                  <>
                    {/* Active users */}
                    {activeUsers.length > 0 && (
                      <>
                        {pendingUsers.length > 0 && (
                          <div className="px-3 py-1.5 text-xs font-medium text-plm-fg-muted uppercase tracking-wide bg-plm-bg-secondary border-b border-plm-border">
                            Active Members
                          </div>
                        )}
                        {activeUsers.map(renderUserOption)}
                      </>
                    )}
                    
                    {/* Pending users */}
                    {pendingUsers.length > 0 && (
                      <>
                        <div className="px-3 py-1.5 text-xs font-medium text-plm-fg-muted uppercase tracking-wide bg-plm-bg-secondary border-y border-plm-border flex items-center gap-1">
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
              <p className="text-xs text-plm-accent">
                Will assign to {selectedUser.full_name || selectedUser.email}
                {selectedUser.is_pending && ' when they sign up'}
              </p>
            )}
          </div>
          
          {/* Error message */}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}
        </form>
        
        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-plm-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-plm-fg-muted hover:text-plm-fg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-plm-accent text-white rounded-lg hover:bg-plm-accent/80 transition-colors disabled:opacity-50"
          >
            {isSaving && <Loader2 size={16} className="animate-spin" />}
            {selectedUserId ? 'Add & Assign License' : 'Add License'}
          </button>
        </div>
      </div>
    </div>
  )
}
