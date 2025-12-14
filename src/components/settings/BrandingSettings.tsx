// @ts-nocheck - Supabase type inference issues with new columns
import { useState, useEffect } from 'react'
import { 
  Building2, 
  Upload, 
  Loader2, 
  Check, 
  MapPin,
  Phone,
  Globe,
  Mail,
  FileText,
  Save,
  Image as ImageIcon,
  X
} from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'
import { supabase } from '@/lib/supabase'

interface OrgBranding {
  logo_url: string | null
  logo_storage_path: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string | null
  phone: string | null
  website: string | null
  contact_email: string | null
  rfq_settings: {
    default_payment_terms: string
    default_incoterms: string
    default_valid_days: number
    show_company_logo: boolean
    show_revision_column: boolean
    show_material_column: boolean
    show_finish_column: boolean
    show_notes_column: boolean
    terms_and_conditions: string
    footer_text: string
  } | null
}

const DEFAULT_RFQ_SETTINGS = {
  default_payment_terms: 'Net 30',
  default_incoterms: 'FOB',
  default_valid_days: 30,
  show_company_logo: true,
  show_revision_column: true,
  show_material_column: true,
  show_finish_column: true,
  show_notes_column: true,
  terms_and_conditions: '',
  footer_text: ''
}

export function BrandingSettings() {
  const { organization, user, addToast } = usePDMStore()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  
  const [branding, setBranding] = useState<OrgBranding>({
    logo_url: null,
    logo_storage_path: null,
    address_line1: null,
    address_line2: null,
    city: null,
    state: null,
    postal_code: null,
    country: 'USA',
    phone: null,
    website: null,
    contact_email: null,
    rfq_settings: DEFAULT_RFQ_SETTINGS
  })

  // Load current branding
  useEffect(() => {
    if (!organization?.id) return

    const loadBranding = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('organizations')
          .select('logo_url, logo_storage_path, address_line1, address_line2, city, state, postal_code, country, phone, website, contact_email, rfq_settings')
          .eq('id', organization.id)
          .single()

        if (error) throw error
        
        setBranding({
          logo_url: data?.logo_url || null,
          logo_storage_path: data?.logo_storage_path || null,
          address_line1: data?.address_line1 || null,
          address_line2: data?.address_line2 || null,
          city: data?.city || null,
          state: data?.state || null,
          postal_code: data?.postal_code || null,
          country: data?.country || 'USA',
          phone: data?.phone || null,
          website: data?.website || null,
          contact_email: data?.contact_email || null,
          rfq_settings: data?.rfq_settings || DEFAULT_RFQ_SETTINGS
        })
      } catch (err) {
        console.error('Failed to load branding:', err)
      } finally {
        setLoading(false)
      }
    }

    loadBranding()
  }, [organization?.id])

  // Handle logo upload
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !organization?.id) return

    // Validate file
    if (!file.type.startsWith('image/')) {
      addToast('error', 'Please select an image file')
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      addToast('error', 'Image must be less than 2MB')
      return
    }

    setUploadingLogo(true)
    try {
      // Upload to storage
      const filePath = `${organization.id}/logo.${file.name.split('.').pop()}`
      const { error: uploadError } = await supabase.storage
        .from('org-assets')
        .upload(filePath, file, { upsert: true })

      if (uploadError) throw uploadError

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('org-assets')
        .getPublicUrl(filePath)

      // Update organization
      const { error: updateError } = await supabase
        .from('organizations')
        .update({
          logo_url: urlData.publicUrl,
          logo_storage_path: filePath
        })
        .eq('id', organization.id)

      if (updateError) throw updateError

      setBranding(prev => ({
        ...prev,
        logo_url: urlData.publicUrl,
        logo_storage_path: filePath
      }))

      addToast('success', 'Logo uploaded successfully')
    } catch (err) {
      console.error('Failed to upload logo:', err)
      addToast('error', 'Failed to upload logo')
    } finally {
      setUploadingLogo(false)
    }
  }

  // Remove logo
  const handleRemoveLogo = async () => {
    if (!organization?.id) return

    try {
      // Delete from storage if exists
      if (branding.logo_storage_path) {
        await supabase.storage
          .from('org-assets')
          .remove([branding.logo_storage_path])
      }

      // Update organization
      const { error } = await supabase
        .from('organizations')
        .update({
          logo_url: null,
          logo_storage_path: null
        })
        .eq('id', organization.id)

      if (error) throw error

      setBranding(prev => ({
        ...prev,
        logo_url: null,
        logo_storage_path: null
      }))

      addToast('success', 'Logo removed')
    } catch (err) {
      console.error('Failed to remove logo:', err)
      addToast('error', 'Failed to remove logo')
    }
  }

  // Save all settings
  const handleSave = async () => {
    if (!organization?.id) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('organizations')
        .update({
          address_line1: branding.address_line1 || null,
          address_line2: branding.address_line2 || null,
          city: branding.city || null,
          state: branding.state || null,
          postal_code: branding.postal_code || null,
          country: branding.country || 'USA',
          phone: branding.phone || null,
          website: branding.website || null,
          contact_email: branding.contact_email || null,
          rfq_settings: branding.rfq_settings
        })
        .eq('id', organization.id)

      if (error) throw error
      addToast('success', 'Settings saved')
    } catch (err) {
      console.error('Failed to save settings:', err)
      addToast('error', 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  // Update a single field
  const updateField = (field: keyof OrgBranding, value: string | null) => {
    setBranding(prev => ({ ...prev, [field]: value }))
  }

  // Update RFQ settings
  const updateRfqSetting = (key: string, value: string | number | boolean) => {
    setBranding(prev => ({
      ...prev,
      rfq_settings: {
        ...(prev.rfq_settings || DEFAULT_RFQ_SETTINGS),
        [key]: value
      }
    }))
  }

  if (!organization) {
    return (
      <div className="text-center py-12 text-pdm-fg-muted">
        No organization connected
      </div>
    )
  }

  if (user?.role !== 'admin') {
    return (
      <div className="text-center py-12 text-pdm-fg-muted">
        Only administrators can manage branding settings
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-pdm-accent" size={24} />
      </div>
    )
  }

  const rfqSettings = branding.rfq_settings || DEFAULT_RFQ_SETTINGS

  return (
    <div className="space-y-6">
      {/* Company Logo */}
      <div className="p-4 bg-pdm-bg rounded-lg border border-pdm-border">
        <div className="flex items-center gap-2 mb-4">
          <ImageIcon size={20} className="text-pdm-accent" />
          <h3 className="text-base font-medium text-pdm-fg">Company Logo</h3>
        </div>

        <div className="flex items-start gap-4">
          {branding.logo_url ? (
            <div className="relative">
              <img 
                src={branding.logo_url} 
                alt="Company logo" 
                className="h-16 max-w-48 object-contain rounded border border-pdm-border bg-white p-2"
              />
              <button
                onClick={handleRemoveLogo}
                className="absolute -top-2 -right-2 p-1 bg-pdm-error rounded-full text-white hover:bg-pdm-error/80"
                title="Remove logo"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <div className="h-16 w-32 bg-pdm-highlight rounded border border-dashed border-pdm-border flex items-center justify-center text-pdm-fg-muted">
              <ImageIcon size={24} />
            </div>
          )}

          <div className="flex-1">
            <label className="btn btn-ghost btn-sm flex items-center gap-2 cursor-pointer">
              {uploadingLogo ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Upload size={14} />
              )}
              {branding.logo_url ? 'Replace Logo' : 'Upload Logo'}
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                disabled={uploadingLogo}
                className="hidden"
              />
            </label>
            <p className="text-xs text-pdm-fg-muted mt-1">
              PNG, JPG, or SVG. Max 2MB. Appears on RFQ documents.
            </p>
          </div>
        </div>
      </div>

      {/* Company Address */}
      <div className="p-4 bg-pdm-bg rounded-lg border border-pdm-border">
        <div className="flex items-center gap-2 mb-4">
          <MapPin size={20} className="text-pdm-accent" />
          <h3 className="text-base font-medium text-pdm-fg">Company Address</h3>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-sm text-pdm-fg-muted block mb-1">Address Line 1</label>
            <input
              type="text"
              value={branding.address_line1 || ''}
              onChange={(e) => updateField('address_line1', e.target.value)}
              placeholder="123 Main Street"
              className="w-full px-3 py-2 bg-pdm-input border border-pdm-border rounded text-sm text-pdm-fg placeholder:text-pdm-fg-muted/50 focus:outline-none focus:border-pdm-accent"
            />
          </div>
          <div className="col-span-2">
            <label className="text-sm text-pdm-fg-muted block mb-1">Address Line 2</label>
            <input
              type="text"
              value={branding.address_line2 || ''}
              onChange={(e) => updateField('address_line2', e.target.value)}
              placeholder="Suite 100"
              className="w-full px-3 py-2 bg-pdm-input border border-pdm-border rounded text-sm text-pdm-fg placeholder:text-pdm-fg-muted/50 focus:outline-none focus:border-pdm-accent"
            />
          </div>
          <div>
            <label className="text-sm text-pdm-fg-muted block mb-1">City</label>
            <input
              type="text"
              value={branding.city || ''}
              onChange={(e) => updateField('city', e.target.value)}
              placeholder="San Francisco"
              className="w-full px-3 py-2 bg-pdm-input border border-pdm-border rounded text-sm text-pdm-fg placeholder:text-pdm-fg-muted/50 focus:outline-none focus:border-pdm-accent"
            />
          </div>
          <div>
            <label className="text-sm text-pdm-fg-muted block mb-1">State/Province</label>
            <input
              type="text"
              value={branding.state || ''}
              onChange={(e) => updateField('state', e.target.value)}
              placeholder="CA"
              className="w-full px-3 py-2 bg-pdm-input border border-pdm-border rounded text-sm text-pdm-fg placeholder:text-pdm-fg-muted/50 focus:outline-none focus:border-pdm-accent"
            />
          </div>
          <div>
            <label className="text-sm text-pdm-fg-muted block mb-1">Postal Code</label>
            <input
              type="text"
              value={branding.postal_code || ''}
              onChange={(e) => updateField('postal_code', e.target.value)}
              placeholder="94102"
              className="w-full px-3 py-2 bg-pdm-input border border-pdm-border rounded text-sm text-pdm-fg placeholder:text-pdm-fg-muted/50 focus:outline-none focus:border-pdm-accent"
            />
          </div>
          <div>
            <label className="text-sm text-pdm-fg-muted block mb-1">Country</label>
            <input
              type="text"
              value={branding.country || ''}
              onChange={(e) => updateField('country', e.target.value)}
              placeholder="USA"
              className="w-full px-3 py-2 bg-pdm-input border border-pdm-border rounded text-sm text-pdm-fg placeholder:text-pdm-fg-muted/50 focus:outline-none focus:border-pdm-accent"
            />
          </div>
        </div>
      </div>

      {/* Contact Information */}
      <div className="p-4 bg-pdm-bg rounded-lg border border-pdm-border">
        <div className="flex items-center gap-2 mb-4">
          <Phone size={20} className="text-pdm-accent" />
          <h3 className="text-base font-medium text-pdm-fg">Contact Information</h3>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-pdm-fg-muted block mb-1">Phone</label>
            <input
              type="text"
              value={branding.phone || ''}
              onChange={(e) => updateField('phone', e.target.value)}
              placeholder="+1 (555) 123-4567"
              className="w-full px-3 py-2 bg-pdm-input border border-pdm-border rounded text-sm text-pdm-fg placeholder:text-pdm-fg-muted/50 focus:outline-none focus:border-pdm-accent"
            />
          </div>
          <div>
            <label className="text-sm text-pdm-fg-muted block mb-1">Email</label>
            <input
              type="email"
              value={branding.contact_email || ''}
              onChange={(e) => updateField('contact_email', e.target.value)}
              placeholder="purchasing@company.com"
              className="w-full px-3 py-2 bg-pdm-input border border-pdm-border rounded text-sm text-pdm-fg placeholder:text-pdm-fg-muted/50 focus:outline-none focus:border-pdm-accent"
            />
          </div>
          <div className="col-span-2">
            <label className="text-sm text-pdm-fg-muted block mb-1">Website</label>
            <input
              type="url"
              value={branding.website || ''}
              onChange={(e) => updateField('website', e.target.value)}
              placeholder="https://www.company.com"
              className="w-full px-3 py-2 bg-pdm-input border border-pdm-border rounded text-sm text-pdm-fg placeholder:text-pdm-fg-muted/50 focus:outline-none focus:border-pdm-accent"
            />
          </div>
        </div>
      </div>

      {/* RFQ Template Settings */}
      <div className="p-4 bg-pdm-bg rounded-lg border border-pdm-border">
        <div className="flex items-center gap-2 mb-4">
          <FileText size={20} className="text-pdm-accent" />
          <h3 className="text-base font-medium text-pdm-fg">RFQ Template Settings</h3>
        </div>

        <div className="space-y-4">
          {/* Default values */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm text-pdm-fg-muted block mb-1">Payment Terms</label>
              <input
                type="text"
                value={rfqSettings.default_payment_terms}
                onChange={(e) => updateRfqSetting('default_payment_terms', e.target.value)}
                placeholder="Net 30"
                className="w-full px-3 py-2 bg-pdm-input border border-pdm-border rounded text-sm text-pdm-fg placeholder:text-pdm-fg-muted/50 focus:outline-none focus:border-pdm-accent"
              />
            </div>
            <div>
              <label className="text-sm text-pdm-fg-muted block mb-1">Incoterms</label>
              <input
                type="text"
                value={rfqSettings.default_incoterms}
                onChange={(e) => updateRfqSetting('default_incoterms', e.target.value)}
                placeholder="FOB"
                className="w-full px-3 py-2 bg-pdm-input border border-pdm-border rounded text-sm text-pdm-fg placeholder:text-pdm-fg-muted/50 focus:outline-none focus:border-pdm-accent"
              />
            </div>
            <div>
              <label className="text-sm text-pdm-fg-muted block mb-1">Quote Valid (days)</label>
              <input
                type="number"
                value={rfqSettings.default_valid_days}
                onChange={(e) => updateRfqSetting('default_valid_days', parseInt(e.target.value) || 30)}
                min="1"
                className="w-full px-3 py-2 bg-pdm-input border border-pdm-border rounded text-sm text-pdm-fg focus:outline-none focus:border-pdm-accent"
              />
            </div>
          </div>

          {/* Column visibility */}
          <div>
            <label className="text-sm text-pdm-fg-muted block mb-2">RFQ Document Columns</label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rfqSettings.show_company_logo}
                  onChange={(e) => updateRfqSetting('show_company_logo', e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-pdm-fg">Show company logo</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rfqSettings.show_revision_column}
                  onChange={(e) => updateRfqSetting('show_revision_column', e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-pdm-fg">Show revision column</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rfqSettings.show_material_column}
                  onChange={(e) => updateRfqSetting('show_material_column', e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-pdm-fg">Show material column</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rfqSettings.show_finish_column}
                  onChange={(e) => updateRfqSetting('show_finish_column', e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-pdm-fg">Show finish column</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rfqSettings.show_notes_column}
                  onChange={(e) => updateRfqSetting('show_notes_column', e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-pdm-fg">Show notes column</span>
              </label>
            </div>
          </div>

          {/* Terms and conditions */}
          <div>
            <label className="text-sm text-pdm-fg-muted block mb-1">Terms and Conditions</label>
            <textarea
              value={rfqSettings.terms_and_conditions}
              onChange={(e) => updateRfqSetting('terms_and_conditions', e.target.value)}
              rows={4}
              placeholder="Enter standard terms and conditions for RFQ documents..."
              className="w-full px-3 py-2 bg-pdm-input border border-pdm-border rounded text-sm text-pdm-fg placeholder:text-pdm-fg-muted/50 focus:outline-none focus:border-pdm-accent resize-none"
            />
          </div>

          {/* Footer text */}
          <div>
            <label className="text-sm text-pdm-fg-muted block mb-1">Footer Text</label>
            <input
              type="text"
              value={rfqSettings.footer_text}
              onChange={(e) => updateRfqSetting('footer_text', e.target.value)}
              placeholder="Custom footer text for RFQ documents"
              className="w-full px-3 py-2 bg-pdm-input border border-pdm-border rounded text-sm text-pdm-fg placeholder:text-pdm-fg-muted/50 focus:outline-none focus:border-pdm-accent"
            />
          </div>
        </div>
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary flex items-center gap-2"
        >
          {saving ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Save size={16} />
          )}
          Save Settings
        </button>
      </div>
    </div>
  )
}

