/**
 * Auth Service
 *
 * Handles user authentication, token refresh, and invitations.
 * Note: This service uses Supabase directly for auth operations.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Result } from '../core/result';
import { ok, err } from '../core/result';
import { UnauthorizedError, ForbiddenError, ConflictError, NotFoundError } from '../core/errors';
import type { AppError } from '../core/errors/AppError';
import type { User } from '../core/types/entities';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: User;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface InviteInput {
  email: string;
  fullName?: string;
  teamIds?: string[];
  vaultIds?: string[];
  workflowRoleIds?: string[];
  notes?: string;
  resend?: boolean;
}

export interface InviteResult {
  success: boolean;
  message: string;
  pendingMemberId: string;
  orgCode?: string;
  existingUser?: boolean;
}

export interface AuthConfig {
  supabaseUrl: string;
  supabaseKey: string;
  supabaseServiceKey?: string;
}

export class AuthService {
  private readonly supabaseUrl: string;
  private readonly supabaseKey: string;
  private readonly supabaseServiceKey?: string;

  constructor(config: AuthConfig) {
    this.supabaseUrl = config.supabaseUrl;
    this.supabaseKey = config.supabaseKey;
    this.supabaseServiceKey = config.supabaseServiceKey;
  }

  /**
   * Create a Supabase client for auth operations
   */
  private createClient(): SupabaseClient {
    return createClient(this.supabaseUrl, this.supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  /**
   * Create an admin Supabase client (requires service key)
   */
  private createAdminClient(): SupabaseClient | null {
    if (!this.supabaseServiceKey) return null;
    return createClient(this.supabaseUrl, this.supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  /**
   * Login with email and password
   */
  async login(email: string, password: string): Promise<Result<LoginResult, AppError>> {
    const supabase = this.createClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return err(new UnauthorizedError(error.message));
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('users')
      .select('id, email, role, org_id, full_name')
      .eq('id', data.user.id)
      .single();

    if (!profile) {
      return err(new UnauthorizedError('User profile not found'));
    }

    return ok({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at ?? 0,
      user: {
        id: profile.id,
        email: profile.email,
        fullName: profile.full_name,
        role: profile.role,
        orgId: profile.org_id,
      },
    });
  }

  /**
   * Refresh an access token
   */
  async refresh(refreshToken: string): Promise<Result<RefreshResult, AppError>> {
    const supabase = this.createClient();

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      return err(new UnauthorizedError('Token refresh failed'));
    }

    return ok({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at ?? 0,
    });
  }

  /**
   * Invite a user to the organization (admin only)
   */
  async invite(
    inviter: User,
    input: InviteInput
  ): Promise<Result<InviteResult, AppError>> {
    // Check admin permission
    if (inviter.role !== 'admin') {
      return err(new ForbiddenError('Admin role required'));
    }

    const adminClient = this.createAdminClient();
    if (!adminClient) {
      return err(new ForbiddenError('Service key not configured'));
    }

    const normalizedEmail = input.email.toLowerCase().trim();

    // Check if user already exists in auth.users
    const { data: existingAuthUsers } = await adminClient.auth.admin.listUsers();
    const existingAuthUser = existingAuthUsers?.users?.find(
      (u) => u.email?.toLowerCase() === normalizedEmail
    );

    // Check if user exists in our users table (fully registered)
    const { data: existingUsers } = await adminClient
      .from('users')
      .select('id, org_id')
      .ilike('email', normalizedEmail);

    const existingUser = existingUsers?.[0];

    if (existingUser) {
      if (existingUser.org_id === inviter.orgId) {
        return err(new ConflictError('User is already a member of your organization'));
      } else if (existingUser.org_id) {
        return err(new ConflictError('User belongs to a different organization'));
      }
    }

    // If user exists in auth but hasn't completed signup, delete and re-invite
    if (existingAuthUser && !existingUser) {
      await adminClient.auth.admin.deleteUser(existingAuthUser.id);
    }

    let pendingMemberId: string | null = null;

    // If resending, verify pending member exists for this org
    if (input.resend) {
      const { data: existingPending, error: checkError } = await adminClient
        .from('pending_org_members')
        .select('id')
        .eq('org_id', inviter.orgId)
        .eq('email', normalizedEmail)
        .single();

      if (checkError || !existingPending) {
        return err(new NotFoundError('Pending member', normalizedEmail));
      }
      pendingMemberId = existingPending.id;
    } else {
      // Delete any existing pending record for this email/org
      await adminClient
        .from('pending_org_members')
        .delete()
        .eq('org_id', inviter.orgId)
        .ilike('email', normalizedEmail);

      // Create pending org member record
      const { data: pendingMember, error: pendingError } = await adminClient
        .from('pending_org_members')
        .insert({
          org_id: inviter.orgId,
          email: normalizedEmail,
          full_name: input.fullName || null,
          role: 'viewer',
          team_ids: input.teamIds || [],
          vault_ids: input.vaultIds || [],
          workflow_role_ids: input.workflowRoleIds || [],
          notes: input.notes || null,
          created_by: inviter.id,
        })
        .select('id')
        .single();

      if (pendingError) {
        if (pendingError.code === '23505') {
          return err(new ConflictError('User with this email already exists or is pending'));
        }
        throw pendingError;
      }
      pendingMemberId = pendingMember.id;
    }

    // Get organization name and slug for invite email
    const { data: org } = await adminClient
      .from('organizations')
      .select('name, slug')
      .eq('id', inviter.orgId)
      .single();

    // Generate organization code for the invite
    const orgCodePayload = {
      v: 1,
      u: this.supabaseUrl,
      k: this.supabaseKey,
      s: org?.slug || '',
    };
    const orgCodeBase64 = Buffer.from(JSON.stringify(orgCodePayload)).toString('base64');
    const orgCodeChunks = orgCodeBase64.match(/.{1,4}/g) || [];
    const orgCode = 'PDM-' + orgCodeChunks.join('-');

    // If user already has an auth account, return org code for manual sharing
    if (existingAuthUser) {
      return ok({
        success: true,
        message: `${normalizedEmail} already has an account. Share this org code with them to rejoin:`,
        pendingMemberId: pendingMemberId!,
        orgCode,
        existingUser: true,
      });
    }

    // Send invite email using Supabase Auth (only for NEW users)
    const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      normalizedEmail,
      {
        data: {
          org_name: org?.name || 'your organization',
          invited_by: inviter.fullName || inviter.email,
          org_code: orgCode,
        },
        redirectTo: 'https://blueplm.io/downloads',
      }
    );

    if (inviteError) {
      return ok({
        success: true,
        message: `Invite created for ${normalizedEmail}. Email delivery failed but they can sign in manually.`,
        pendingMemberId: pendingMemberId!,
      });
    }

    return ok({
      success: true,
      message: input.resend
        ? `Invite email resent to ${normalizedEmail}`
        : `Invite email sent to ${normalizedEmail}`,
      pendingMemberId: pendingMemberId!,
    });
  }
}
