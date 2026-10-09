import type { Organization } from '@/types/pdm'
import type { AuthProviders, IdentityProfile } from '@/types/backend'

export interface UserProfileResult {
  profile: IdentityProfile | null
  error: Error | null
}

export interface OrganizationLinkResult {
  org: Organization | null
  error: Error | string | null
}

/**
 * Identity and organization lookups used immediately after authentication.
 * Each method keeps the established data and error results unchanged.
 */
export interface IdentityPort {
  getUserProfile(userId: string, options?: { maxRetries?: number }): Promise<UserProfileResult>
  linkUserToOrganization(
    userId: string,
    userEmail: string,
    cachedOrgId?: string | null,
  ): Promise<OrganizationLinkResult>
  getOrgAuthProviders(orgSlug?: string): Promise<AuthProviders | null>
}
