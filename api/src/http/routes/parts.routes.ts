/**
 * Parts & BOM Routes
 *
 * ERP integration endpoints for parts and bill of materials.
 */

import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { UuidParams, FileState } from '../schemas';
import { NotFoundError } from '../../core/errors';

const partsRoutes: FastifyPluginAsync = async (fastify) => {
  // List parts (files with part numbers)
  fastify.get(
    '/parts',
    {
      schema: {
        description: 'List parts (files with part numbers). Ideal for ERP integration.',
        tags: ['ERP'],
        security: [{ bearerAuth: [] }],
        querystring: Type.Object({
          vault_id: Type.Optional(Type.String({ format: 'uuid' })),
          state: Type.Optional(FileState),
          released_only: Type.Optional(Type.Boolean()),
          search: Type.Optional(Type.String()),
          limit: Type.Optional(Type.Integer({ default: 100 })),
          offset: Type.Optional(Type.Integer({ default: 0 })),
        }),
        response: {
          200: Type.Object({
            parts: Type.Array(
              Type.Object({
                id: Type.String(),
                part_number: Type.String(),
                file_name: Type.String(),
                file_path: Type.String(),
                description: Type.Union([Type.String(), Type.Null()]),
                revision: Type.String(),
                version: Type.Integer(),
                state: Type.String(),
                file_type: Type.String(),
              })
            ),
            count: Type.Integer(),
          }),
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { vault_id, state, released_only, search, limit = 100, offset = 0 } = request.query as {
        vault_id?: string;
        state?: string;
        released_only?: boolean;
        search?: string;
        limit?: number;
        offset?: number;
      };

      let query = request.supabase!
        .from('files')
        .select(
          'id, part_number, file_name, file_path, description, revision, version, state, file_type'
        )
        .eq('org_id', request.user!.org_id)
        .is('deleted_at', null)
        .not('part_number', 'is', null)
        .order('part_number')
        .range(offset, offset + limit - 1);

      if (vault_id) query = query.eq('vault_id', vault_id);
      if (state) query = query.eq('state', state);
      if (released_only) query = query.eq('state', 'released');
      if (search) query = query.ilike('part_number', `%${search}%`);

      const { data, error } = await query;
      if (error) throw error;

      return { parts: data, count: data?.length || 0 };
    }
  );

  // Get Bill of Materials for an assembly
  fastify.get<{ Params: { id: string } }>(
    '/bom/:id',
    {
      schema: {
        description: 'Get Bill of Materials for an assembly. Returns all child components.',
        tags: ['ERP'],
        security: [{ bearerAuth: [] }],
        params: UuidParams,
        querystring: Type.Object({
          recursive: Type.Optional(Type.Boolean({ default: false })),
          released_only: Type.Optional(Type.Boolean()),
        }),
        response: {
          200: Type.Object({
            assembly: Type.Object({
              id: Type.String(),
              part_number: Type.Union([Type.String(), Type.Null()]),
              file_name: Type.String(),
              revision: Type.String(),
              state: Type.String(),
            }),
            components: Type.Array(
              Type.Object({
                id: Type.String(),
                part_number: Type.Union([Type.String(), Type.Null()]),
                file_name: Type.String(),
                file_path: Type.String(),
                revision: Type.String(),
                state: Type.String(),
                quantity: Type.Integer(),
              })
            ),
            total_components: Type.Integer(),
          }),
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { id } = request.params;
      const { released_only } = request.query as { recursive?: boolean; released_only?: boolean };

      // Get the assembly
      const { data: assembly, error: assemblyError } = await request.supabase!
        .from('files')
        .select('id, part_number, file_name, file_path, revision, state, file_type')
        .eq('id', id)
        .eq('org_id', request.user!.org_id)
        .single();

      if (assemblyError) throw assemblyError;
      if (!assembly) throw new NotFoundError('Assembly', id);

      // Get child components from file_references
      const query = request.supabase!
        .from('file_references')
        .select(
          `
        quantity,
        child:files!child_file_id(
          id, part_number, file_name, file_path, revision, state, file_type
        )
      `
        )
        .eq('parent_file_id', id);

      const { data: refs, error: refsError } = await query;
      if (refsError) throw refsError;
      // Supabase v2 nested select type inference incomplete for component refs
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let components: any[] = (refs || [])
        .filter((r) => r.child)
        .map((r) => ({
          ...r.child,
          quantity: r.quantity || 1,
        }));

      if (released_only) {
        components = components.filter((c) => c.state === 'released');
      }

      return {
        assembly: {
          id: assembly.id,
          part_number: assembly.part_number,
          file_name: assembly.file_name,
          revision: assembly.revision,
          state: assembly.state,
        },
        components,
        total_components: components.length,
      };
    }
  );
};

export default partsRoutes;
