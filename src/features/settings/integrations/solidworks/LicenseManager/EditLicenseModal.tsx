import { useState } from 'react'
import { X, Loader2, Edit2 } from 'lucide-react'
import type { LicenseWithAssignment, SolidWorksLicenseUpdate } from './types'

interface EditLicenseModalProps {
  license: LicenseWithAssignment
  onClose: () => void
  onSave: (updates: SolidWorksLicenseUpdate) => Promise<{ success: boolean; error?: string }>
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
 * Gets the raw serial number without spaces.
 */
function getRawSerialNumber(formatted: string): string {
  return formatted.replace(/\s/g, '').toUpperCase()
}

export function EditLicenseModal({ license, onClose, onSave }: EditLicenseModalProps) {
  const [formData, setFormData] = useState({
    serial_number: formatSerialNumber(license.serial_number),
    nickname: license.nickname || '',
    license_type: license.license_type || 'standalone',
    product_name: license.product_name || '',
    seats: license.seats || 1
  })
  
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const handleSerialChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatSerialNumber(e.target.value)
    setFormData(prev => ({ ...prev, serial_number: formatted }))
  }
  
  const handleSerialPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text')
    const formatted = formatSerialNumber(pasted)
    setFormData(prev => ({ ...prev, serial_number: formatted }))
  }
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    
    // Validate serial number
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
    
    const updates: SolidWorksLicenseUpdate = {
      serial_number: serial,
      nickname: formData.nickname.trim() || null,
      license_type: formData.license_type as 'standalone' | 'network',
      product_name: formData.product_name || null,
      seats: formData.license_type === 'network' ? formData.seats : null
    }
    
    const result = await onSave(updates)
    
    setIsSaving(false)
    
    if (result.success) {
      onClose()
    } else {
      setError(result.error || 'Failed to update license')
    }
  }
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-plm-bg-secondary border border-plm-border rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-plm-border">
          <div className="flex items-center gap-3">
            <Edit2 size={20} className="text-plm-accent" />
            <h2 className="text-lg font-semibold text-plm-fg">Edit License</h2>
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
              Paste or type — automatically formatted with spaces
            </p>
          </div>
          
          {/* Nickname */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-plm-fg">
              Nickname
            </label>
            <input
              type="text"
              value={formData.nickname}
              onChange={(e) => setFormData(prev => ({ ...prev, nickname: e.target.value }))}
              placeholder="e.g., Design Team License 1"
              className="w-full px-3 py-2 bg-plm-bg border border-plm-border rounded-lg text-sm text-plm-fg placeholder-plm-fg-dim focus:outline-none focus:border-plm-accent"
            />
            <p className="text-xs text-plm-fg-dim">
              A friendly name to identify this license
            </p>
          </div>
          
          {/* License Type */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-plm-fg">
              License Type
            </label>
            <select
              value={formData.license_type}
              onChange={(e) => setFormData(prev => ({ ...prev, license_type: e.target.value as 'standalone' | 'network' }))}
              className="w-full px-3 py-2 bg-plm-bg border border-plm-border rounded-lg text-sm text-plm-fg focus:outline-none focus:border-plm-accent"
            >
              <option value="standalone">Standalone</option>
              <option value="network">Network</option>
            </select>
          </div>
          
          {/* Seats (only for network) */}
          {formData.license_type === 'network' && (
            <div className="space-y-1">
              <label className="text-sm font-medium text-plm-fg">
                Seats
              </label>
              <input
                type="number"
                min={1}
                value={formData.seats}
                onChange={(e) => setFormData(prev => ({ ...prev, seats: parseInt(e.target.value) || 1 }))}
                className="w-24 px-3 py-2 bg-plm-bg border border-plm-border rounded-lg text-sm text-plm-fg focus:outline-none focus:border-plm-accent"
              />
            </div>
          )}
          
          {/* Product Name */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-plm-fg">
              Product
            </label>
            <select
              value={formData.product_name}
              onChange={(e) => setFormData(prev => ({ ...prev, product_name: e.target.value }))}
              className="w-full px-3 py-2 bg-plm-bg border border-plm-border rounded-lg text-sm text-plm-fg focus:outline-none focus:border-plm-accent"
            >
              <option value="">Select a product...</option>
              {PRODUCT_OPTIONS.map((product) => (
                <option key={product} value={product}>{product}</option>
              ))}
            </select>
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
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}
