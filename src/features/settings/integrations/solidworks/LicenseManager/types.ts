import type { Database } from '@/types/supabase'

// Database row types
export type SolidWorksLicense = Database['public']['Tables']['solidworks_licenses']['Row']
export type SolidWorksLicenseInsert = Database['public']['Tables']['solidworks_licenses']['Insert']
export type SolidWorksLicenseUpdate = Database['public']['Tables']['solidworks_licenses']['Update']

export type SolidWorksLicenseAssignment = Database['public']['Tables']['solidworks_license_assignments']['Row']
export type SolidWorksLicenseAssignmentInsert = Database['public']['Tables']['solidworks_license_assignments']['Insert']

export type SolidWorksLicenseType = Database['public']['Enums']['solidworks_license_type']

// Pending assignment info (for users who haven't signed up yet)
export interface PendingAssignment {
  pending_member_id: string
  email: string
  full_name: string | null
}

// Extended license with assignment info for display
export interface LicenseWithAssignment extends SolidWorksLicense {
  assignment?: SolidWorksLicenseAssignment & {
    user?: {
      id: string
      email: string
      full_name: string | null
      avatar_url: string | null
    }
  }
  pendingAssignment?: PendingAssignment
}

// License status for UI badges
export type LicenseStatus = 'unassigned' | 'assigned' | 'active'

// User for assignment dropdown (includes both active users and pending invites)
export interface OrgUser {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  is_pending: boolean
}

// Form data for adding a license
export interface AddLicenseFormData {
  serial_number: string
  nickname: string
  license_type: SolidWorksLicenseType
  product_name: string
  seats: number
  purchase_date: string
  expiry_date: string
  notes: string
}
