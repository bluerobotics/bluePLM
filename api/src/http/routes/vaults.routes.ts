/**
 * Vault Routes
 *
 * Vault listing and status endpoints.
 */

import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { UuidParams, VaultSchema, VaultStatusSchema } from '../schemas';

const vaultRoutes: FastifyPluginAsync = async (fastify) => {
  // List organization vaults
  fastify.get(
    '/vaults',
    {
      schema: {
        description: 'List organization vaults',
        tags: ['Vaults'],
        security: [{ bearerAuth: [] }],
        response: {
          200: Type.Object({
            vaults: Type.Array(VaultSchema),
          }),
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const result = await request.container!.vaultService.list();
      if (!result.ok) throw result.error;
      return { vaults: result.value };
    }
  );

  // Get vault by ID
  fastify.get<{ Params: { id: string } }>(
    '/vaults/:id',
    {
      schema: {
        description: 'Get vault by ID',
        tags: ['Vaults'],
        security: [{ bearerAuth: [] }],
        params: UuidParams,
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { id } = request.params;
      const result = await request.container!.vaultService.getById(id);
      if (!result.ok) throw result.error;
      return { vault: result.value };
    }
  );

  // Get vault status summary
  fastify.get<{ Params: { id: string } }>(
    '/vaults/:id/status',
    {
      schema: {
        description: 'Get vault status summary',
        tags: ['Vaults'],
        security: [{ bearerAuth: [] }],
        params: UuidParams,
        response: {
          200: Type.Object({
            status: VaultStatusSchema,
          }),
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { id } = request.params;

      const { data: files, error } = await request.supabase!
        .from('files')
        .select('state, checked_out_by')
        .eq('vault_id', id)
        .eq('org_id', request.user!.org_id)
        .is('deleted_at', null);

      if (error) throw error;

      const status = {
        total: files?.length || 0,
        checked_out: files?.filter((f) => f.checked_out_by).length || 0,
        checked_out_by_me: files?.filter((f) => f.checked_out_by === request.user!.id).length || 0,
        by_state: {} as Record<string, number>,
      };

      for (const file of files || []) {
        const state = file.state || 'not_tracked';
        status.by_state[state] = (status.by_state[state] || 0) + 1;
      }

      return { status };
    }
  );
};

export default vaultRoutes;
