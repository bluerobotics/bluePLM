import { Globe, Image as ImageIcon, Loader2, Save, Trash2, Upload } from 'lucide-react'

import { Button, TextInput } from '@/components/core/ui'

import { SettingRow, SettingsGroup, SettingsPage, SettingsSection } from '../components/ui'
import { AddressFormDialog } from './company-profile/AddressFormDialog'
import { AddressList } from './company-profile/AddressList'
import { DeleteAddressDialog } from './company-profile/DeleteAddressDialog'
import { useCompanyProfile } from './company-profile/useCompanyProfile'

export function CompanyProfileSettings() {
  const p = useCompanyProfile()
  const { profile } = p

  if (!p.organization) {
    return <div className="py-12 text-center text-ui-fg-secondary">No organization connected</div>
  }

  if (!p.isAdmin) {
    return (
      <div className="py-12 text-center text-ui-fg-secondary">
        Only administrators can manage company profile
      </div>
    )
  }

  if (p.loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-ui-fg-secondary" size={20} />
      </div>
    )
  }

  return (
    <SettingsPage>
      <SettingsSection title="Company Logo">
        <SettingsGroup>
          <SettingRow
            label={
              <span className="flex items-center gap-4">
                {profile.logo_url ? (
                  <img
                    src={profile.logo_url}
                    alt="Company logo"
                    className="h-12 max-w-48 rounded border border-ui-divider bg-ui-bg object-contain p-1.5"
                  />
                ) : (
                  <span className="flex h-12 w-24 items-center justify-center rounded border border-dashed border-ui-divider text-ui-fg-secondary">
                    <ImageIcon size={18} />
                  </span>
                )}
                <span className="text-[13px] font-normal text-ui-fg-secondary">
                  PNG, JPG, or SVG. Max 2MB. Appears on RFQ documents.
                </span>
              </span>
            }
          >
            {profile.logo_url && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 size={14} />}
                onClick={p.handleRemoveLogo}
              >
                Remove
              </Button>
            )}
            <label
              className={`inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-ui-divider bg-ui-field px-2.5 text-[13px] font-medium text-ui-fg transition-colors hover:border-ui-field-border hover:bg-ui-hover ${
                p.uploadingLogo ? 'pointer-events-none opacity-50' : ''
              }`}
            >
              {p.uploadingLogo ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Upload size={12} />
              )}
              {profile.logo_url ? 'Replace Logo' : 'Upload Logo'}
              <input
                type="file"
                accept="image/*"
                onChange={p.handleLogoUpload}
                disabled={p.uploadingLogo}
                className="hidden"
              />
            </label>
          </SettingRow>
        </SettingsGroup>
      </SettingsSection>

      <AddressList
        title="Billing Addresses"
        emptyText="No billing addresses yet."
        addresses={p.billingAddresses}
        loading={p.loadingAddresses}
        deletingAddressId={p.deletingAddressId}
        onAdd={() => p.openNewAddressModal('billing')}
        onEdit={p.openEditAddressModal}
        onDelete={p.handleDeleteAddress}
        onSetDefault={p.handleSetDefault}
      />

      <AddressList
        title="Shipping Addresses"
        emptyText="No shipping addresses yet."
        addresses={p.shippingAddresses}
        loading={p.loadingAddresses}
        deletingAddressId={p.deletingAddressId}
        onAdd={() => p.openNewAddressModal('shipping')}
        onEdit={p.openEditAddressModal}
        onDelete={p.handleDeleteAddress}
        onSetDefault={p.handleSetDefault}
      />

      <SettingsSection
        title="Contact Information"
        actions={
          <Button
            variant="primary"
            size="sm"
            loading={p.saving}
            icon={<Save size={14} />}
            onClick={p.handleSave}
          >
            Save Contact Info
          </Button>
        }
      >
        <SettingsGroup>
          <SettingRow label="Phone" htmlFor="company-phone">
            <TextInput
              id="company-phone"
              className="w-72"
              value={profile.phone || ''}
              onChange={(e) => p.updateField('phone', e.target.value)}
              placeholder="+1 (555) 123-4567"
            />
          </SettingRow>
          <SettingRow label="Email" htmlFor="company-email">
            <TextInput
              id="company-email"
              type="email"
              className="w-72"
              value={profile.contact_email || ''}
              onChange={(e) => p.updateField('contact_email', e.target.value)}
              placeholder="purchasing@company.com"
            />
          </SettingRow>
          <SettingRow label="Website" htmlFor="company-website">
            <div className="relative w-72">
              <Globe
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ui-fg-secondary"
              />
              <TextInput
                id="company-website"
                type="url"
                className="pl-8"
                value={profile.website || ''}
                onChange={(e) => p.updateField('website', e.target.value)}
                placeholder="https://www.company.com"
              />
            </div>
          </SettingRow>
        </SettingsGroup>
      </SettingsSection>

      {p.showAddressModal && (
        <AddressFormDialog
          editing={!!p.editingAddress}
          form={p.addressForm}
          setForm={p.setAddressForm}
          copySources={p.getSourceAddressesForCopy()}
          saving={p.savingAddress}
          onCopyFrom={p.handleCopyFromAddress}
          onSave={p.handleSaveAddress}
          onClose={() => p.setShowAddressModal(false)}
        />
      )}

      {p.deleteConfirmAddress && (
        <DeleteAddressDialog
          address={p.deleteConfirmAddress}
          deleting={p.deletingAddressId === p.deleteConfirmAddress.id}
          onConfirm={p.confirmDeleteAddress}
          onCancel={() => p.setDeleteConfirmAddress(null)}
        />
      )}
    </SettingsPage>
  )
}
