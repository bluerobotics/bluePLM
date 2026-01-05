/**
 * Auth Routes
 *
 * Authentication endpoints - thin controllers delegating to AuthService.
 */

import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { UserSchema } from '../schemas';
import { createAuthOnlyContainer } from '../../infrastructure/container';

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Get current user info
  fastify.get(
    '/auth/me',
    {
      schema: {
        description: 'Get current user info',
        tags: ['Auth'],
        security: [{ bearerAuth: [] }],
        response: {
          200: Type.Object({
            user: UserSchema,
            org_id: Type.String(),
          }),
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request) => ({
      user: request.user,
      org_id: request.user!.org_id,
    })
  );

  // Login with email and password
  fastify.post(
    '/auth/login',
    {
      schema: {
        description: 'Login with email and password',
        tags: ['Auth'],
        body: Type.Object({
          email: Type.String({ format: 'email' }),
          password: Type.String({ minLength: 1 }),
        }),
        response: {
          200: Type.Object({
            access_token: Type.String(),
            refresh_token: Type.String(),
            expires_at: Type.Integer(),
            user: UserSchema,
          }),
        },
      },
    },
    async (request) => {
      const { email, password } = request.body as { email: string; password: string };

      const { authService } = createAuthOnlyContainer();
      const result = await authService.login(email, password);
      if (!result.ok) throw result.error;

      return {
        access_token: result.value.accessToken,
        refresh_token: result.value.refreshToken,
        expires_at: result.value.expiresAt,
        user: {
          id: result.value.user.id,
          email: result.value.user.email,
          role: result.value.user.role,
          org_id: result.value.user.orgId,
          full_name: result.value.user.fullName,
        },
      };
    }
  );

  // Refresh access token
  fastify.post(
    '/auth/refresh',
    {
      schema: {
        description: 'Refresh access token',
        tags: ['Auth'],
        body: Type.Object({
          refresh_token: Type.String(),
        }),
        response: {
          200: Type.Object({
            access_token: Type.String(),
            refresh_token: Type.String(),
            expires_at: Type.Integer(),
          }),
        },
      },
    },
    async (request) => {
      const { refresh_token } = request.body as { refresh_token: string };

      const { authService } = createAuthOnlyContainer();
      const result = await authService.refresh(refresh_token);
      if (!result.ok) throw result.error;

      return {
        access_token: result.value.accessToken,
        refresh_token: result.value.refreshToken,
        expires_at: result.value.expiresAt,
      };
    }
  );

  // Invite user by email (admin only)
  fastify.post(
    '/auth/invite',
    {
      schema: {
        description: 'Invite a user by email. Requires admin role.',
        tags: ['Auth'],
        security: [{ bearerAuth: [] }],
        body: Type.Object({
          email: Type.String({ format: 'email' }),
          full_name: Type.Optional(Type.String()),
          team_ids: Type.Optional(Type.Array(Type.String({ format: 'uuid' }))),
          vault_ids: Type.Optional(Type.Array(Type.String({ format: 'uuid' }))),
          workflow_role_ids: Type.Optional(Type.Array(Type.String({ format: 'uuid' }))),
          notes: Type.Optional(Type.String()),
          resend: Type.Optional(Type.Boolean()),
        }),
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            message: Type.String(),
            pending_member_id: Type.String(),
            org_code: Type.Optional(Type.String()),
            existing_user: Type.Optional(Type.Boolean()),
          }),
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const user = request.user!;
      const body = request.body as {
        email: string;
        full_name?: string;
        team_ids?: string[];
        vault_ids?: string[];
        workflow_role_ids?: string[];
        notes?: string;
        resend?: boolean;
      };

      const result = await request.container!.authService.invite(
        {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          orgId: user.org_id,
        },
        {
          email: body.email,
          fullName: body.full_name,
          teamIds: body.team_ids,
          vaultIds: body.vault_ids,
          workflowRoleIds: body.workflow_role_ids,
          notes: body.notes,
          resend: body.resend,
        }
      );
      if (!result.ok) throw result.error;

      return {
        success: result.value.success,
        message: result.value.message,
        pending_member_id: result.value.pendingMemberId,
        org_code: result.value.orgCode,
        existing_user: result.value.existingUser,
      };
    }
  );
};

export default authRoutes;
