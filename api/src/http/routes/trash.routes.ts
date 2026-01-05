/**
 * Trash Routes
 *
 * List and restore deleted files.
 */

import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { UuidParams } from '../schemas';

const trashRoutes: FastifyPluginAsync = async (fastify) => {
  // List deleted files
  fastify.get(
    '/trash',
    {
      schema: {
        description: 'List deleted files',
        tags: ['Trash'],
        security: [{ bearerAuth: [] }],
        querystring: Type.Object({
          vault_id: Type.Optional(Type.String({ format: 'uuid' })),
        }),
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { vault_id } = request.query as { vault_id?: string };

      let query = request.supabase!
        .from('files')
        .select(
          `
        id, file_path, file_name, extension, deleted_at, deleted_by,
        deleted_by_user:users!deleted_by(email, full_name)
      `
        )
        .eq('org_id', request.user!.org_id)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (vault_id) query = query.eq('vault_id', vault_id);

      const { data, error } = await query;
      if (error) throw error;

      return { files: data };
    }
  );

  // Restore file from trash
  fastify.post<{ Params: { id: string } }>(
    '/trash/:id/restore',
    {
      schema: {
        description: 'Restore file from trash',
        tags: ['Trash'],
        security: [{ bearerAuth: [] }],
        params: UuidParams,
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { id } = request.params;
      const result = await request.container!.fileService.restore(id);
      if (!result.ok) throw result.error;
      return { success: true, file: result.value };
    }
  );
};

export default trashRoutes;
