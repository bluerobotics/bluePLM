import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { Copy, Save, Star, X } from 'lucide-react'

import { Button, Switch, TextInput } from '@/components/core/ui'

import type { AddressForm, OrgAddress } from './types'

interface AddressFormDialogProps {
  editing: boolean
  form: AddressForm
  setForm: Dispatch<SetStateAction<AddressForm>>
  copySources: OrgAddress[]
  saving: boolean
  onCopyFrom: (address: OrgAddress) => void
  onSave: () => void
  onClose: () => void
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] text-plm-fg-muted">{label}</span>
      {children}
    </label>
  )
}

/** Add or edit one billing or shipping address. */
export function AddressFormDialog({
  editing,
  form,
  setForm,
  copySources,
  saving,
  onCopyFrom,
  onSave,
  onClose,
}: AddressFormDialogProps) {
  const set = <K extends keyof AddressForm>(key: K, value: AddressForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-plm-border bg-plm-bg-elevated">
        <div className="flex items-center justify-between border-b border-plm-border px-4 py-3">
          <h3 className="text-[14px] font-semibold text-plm-fg">
            {editing
              ? 'Edit Address'
              : `New ${form.address_type === 'billing' ? 'Billing' : 'Shipping'} Address`}
          </h3>
          <Button
            variant="ghost"
            size="sm"
            className="!px-1.5"
            icon={<X size={16} />}
            onClick={onClose}
            aria-label="Close"
          />
        </div>

        <div className="space-y-3 p-4">
          {copySources.length > 0 && (
            <div className="rounded-lg border border-plm-border bg-plm-bg-light/60 p-3">
              <div className="mb-2 flex items-center gap-2 text-[12px] text-plm-fg-muted">
                <Copy size={13} />
                Copy from {form.address_type === 'billing' ? 'shipping' : 'billing'} address
              </div>
              <div className="flex flex-wrap gap-1.5">
                {copySources.map((addr) => (
                  <Button
                    key={addr.id}
                    size="sm"
                    icon={addr.is_default ? <Star size={11} className="text-plm-accent" /> : undefined}
                    onClick={() => onCopyFrom(addr)}
                  >
                    {addr.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <Field label="Label *">
            <TextInput
              value={form.label}
              onChange={(e) => set('label', e.target.value)}
              placeholder="e.g., Main Office, Warehouse, HQ"
            />
          </Field>

          <Field label="Company Name">
            <TextInput
              value={form.company_name || ''}
              onChange={(e) => set('company_name', e.target.value)}
              placeholder="Acme Corporation"
            />
          </Field>

          {form.address_type === 'billing' && (
            <Field label="Contact Name">
              <TextInput
                value={form.contact_name || ''}
                onChange={(e) => set('contact_name', e.target.value)}
                placeholder="John Smith"
              />
            </Field>
          )}

          {form.address_type === 'shipping' && (
            <Field label="Attention To">
              <TextInput
                value={form.attention_to || ''}
                onChange={(e) => set('attention_to', e.target.value)}
                placeholder="e.g., Receiving Dept, John Smith"
              />
            </Field>
          )}

          <Field label="Address Line 1 *">
            <TextInput
              value={form.address_line1}
              onChange={(e) => set('address_line1', e.target.value)}
              placeholder="123 Main Street"
            />
          </Field>

          <Field label="Address Line 2">
            <TextInput
              value={form.address_line2 || ''}
              onChange={(e) => set('address_line2', e.target.value)}
              placeholder="Suite 100"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="City *">
              <TextInput
                value={form.city}
                onChange={(e) => set('city', e.target.value)}
                placeholder="San Francisco"
              />
            </Field>
            <Field label="State/Province">
              <TextInput
                value={form.state || ''}
                onChange={(e) => set('state', e.target.value)}
                placeholder="CA"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Postal Code">
              <TextInput
                value={form.postal_code || ''}
                onChange={(e) => set('postal_code', e.target.value)}
                placeholder="94102"
              />
            </Field>
            <Field label="Country">
              <TextInput
                value={form.country}
                onChange={(e) => set('country', e.target.value)}
                placeholder="USA"
              />
            </Field>
          </div>

          <Field label="Phone">
            <TextInput
              value={form.phone || ''}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="+1 (555) 123-4567"
            />
          </Field>

          <div className="flex items-center justify-between gap-4 pt-1">
            <span id="address-default-label" className="text-[13px] text-plm-fg">
              Set as default {form.address_type} address
            </span>
            <Switch
              checked={form.is_default}
              onChange={(checked) => set('is_default', checked)}
              aria-labelledby="address-default-label"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-plm-border px-4 py-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} icon={<Save size={14} />} onClick={onSave}>
            {editing ? 'Update Address' : 'Add Address'}
          </Button>
        </div>
      </div>
    </div>
  )
}
