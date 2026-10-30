import { Loader2, Pencil, Plus, Star, Trash2 } from 'lucide-react'

import { Badge, Button } from '@/components/core/ui'

import { SettingsGroup, SettingsSection } from '../../components/ui'
import type { OrgAddress } from './types'

interface AddressListProps {
  title: string
  emptyText: string
  addresses: OrgAddress[]
  loading: boolean
  deletingAddressId: string | null
  onAdd: () => void
  onEdit: (address: OrgAddress) => void
  onDelete: (address: OrgAddress) => void
  onSetDefault: (address: OrgAddress) => void
}

/** One kind of address (billing or shipping): a section with a row per address. */
export function AddressList({
  title,
  emptyText,
  addresses,
  loading,
  deletingAddressId,
  onAdd,
  onEdit,
  onDelete,
  onSetDefault,
}: AddressListProps) {
  return (
    <SettingsSection
      title={title}
      actions={
        <Button size="sm" icon={<Plus size={14} />} onClick={onAdd}>
          Add Address
        </Button>
      }
    >
      <SettingsGroup>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="animate-spin text-ui-fg-secondary" size={16} />
          </div>
        ) : addresses.length === 0 ? (
          <div className="px-4 py-4 text-[13px] text-ui-fg-secondary">{emptyText}</div>
        ) : (
          addresses.map((address) => (
            <div key={address.id} className="group flex items-start gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-medium text-ui-fg">
                    {address.label}
                  </span>
                  {address.is_default && <Badge tone="accent">Default</Badge>}
                </div>
                <div className="mt-0.5 space-y-0.5 text-[13px] leading-relaxed text-ui-fg-secondary">
                  {address.company_name && <div>{address.company_name}</div>}
                  {address.contact_name && <div>{address.contact_name}</div>}
                  {address.attention_to && <div>ATTN: {address.attention_to}</div>}
                  <div>
                    {address.address_line1}
                    {address.address_line2 && `, ${address.address_line2}`}
                  </div>
                  <div>
                    {address.city}
                    {address.state && `, ${address.state}`}
                    {address.postal_code && ` ${address.postal_code}`}
                    {address.country !== 'USA' && ` · ${address.country}`}
                  </div>
                  {address.phone && <div>{address.phone}</div>}
                </div>
              </div>
              <div className="flex items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                {!address.is_default && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="!px-1.5"
                    icon={<Star size={14} />}
                    onClick={() => onSetDefault(address)}
                    title="Set as default"
                    aria-label="Set as default"
                  />
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="!px-1.5"
                  icon={<Pencil size={14} />}
                  onClick={() => onEdit(address)}
                  title="Edit"
                  aria-label="Edit"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="!px-1.5 hover:!text-ui-danger"
                  icon={
                    deletingAddressId === address.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )
                  }
                  onClick={() => onDelete(address)}
                  disabled={deletingAddressId === address.id}
                  title="Delete"
                  aria-label="Delete"
                />
              </div>
            </div>
          ))
        )}
      </SettingsGroup>
    </SettingsSection>
  )
}
