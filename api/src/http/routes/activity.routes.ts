/**
 * Activity Routes
 *
 * Activity feed and checkout listing endpoints.
 */

import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';

const activityRoutes: FastifyPluginAsync = async (fastify) => {
  // Get recent activity
  fastify.get(
    '/activity',
    {
      schema: {
        description: 'Get recent activity',
        tags: ['Activity'],
        security: [{ bearerAuth: [] }],
        querystring: Type.Object({
          file_id: Type.Optional(Type.String({ format: 'uuid' })),
          limit: Type.Optional(Type.Integer({ default: 50 })),
        }),
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { file_id, limit = 50 } = request.query as { file_id?: string; limit?: number };
      const activity = await request.container!.activityService.getRecent(
        request.user!.org_id!,
        { fileId: file_id, limit }
      );
      return { activity };
    }
  );

  // List checked out files
  fastify.get(
    '/checkouts',
    {
      schema: {
        description: 'List checked out files',
        tags: ['Files'],
        security: [{ bearerAuth: [] }],
        querystring: Type.Object({
          mine_only: Type.Optional(Type.Boolean()),
        }),
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { mine_only } = request.query as { mine_only?: boolean };

      let query = request.supabase!
        .from('files')
        .select(
          `
        id, file_path, file_name, checked_out_at, lock_message,
        checked_out_user:users!checked_out_by(id, email, full_name)
      `
        )
        .eq('org_id', request.user!.org_id)
        .not('checked_out_by', 'is', null)
        .order('checked_out_at', { ascending: false });

      if (mine_only) {
        query = query.eq('checked_out_by', request.user!.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      return { checkouts: data };
    }
  );
};

export default activityRoutes;
