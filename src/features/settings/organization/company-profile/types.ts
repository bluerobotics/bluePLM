export interface CompanyProfile {
  logo_url: string | null
  logo_storage_path: string | null
  phone: string | null
  website: string | null
  contact_email: string | null
}

export interface OrgAddress {
  id: string
  org_id: string
  address_type: 'billing' | 'shipping'
  label: string
  is_default: boolean
  company_name: string | null
  contact_name: string | null
  address_line1: string
  address_line2: string | null
  city: string
  state: string | null
  postal_code: string | null
  country: string
  attention_to: string | null
  phone: string | null
}

export const emptyAddress: Omit<OrgAddress, 'id' | 'org_id'> = {
  address_type: 'billing',
  label: '',
  is_default: false,
  company_name: null,
  contact_name: null,
  address_line1: '',
  address_line2: null,
  city: '',
  state: null,
  postal_code: null,
  country: 'USA',
  attention_to: null,
  phone: null,
}

export type AddressForm = Omit<OrgAddress, 'id' | 'org_id'>
