/**
 * Odoo Integration Routes
 *
 * Configuration, testing, and sync with Odoo ERP.
 */

import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { OdooService } from '../../../services/integrations/OdooService';

const odooRoutes: FastifyPluginAsync = async (fastify) => {
  // Get Odoo integration settings
  fastify.get(
    '/integrations/odoo',
    {
      schema: {
        description: 'Get Odoo integration settings',
        tags: ['Integrations'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const odooService = new OdooService(request.supabase!);
      const settings = await odooService.getSettings(request.user!.org_id!);
      return settings;
    }
  );

  // Configure Odoo integration
  fastify.post(
    '/integrations/odoo',
    {
      schema: {
        description: 'Configure Odoo integration',
        tags: ['Integrations'],
        security: [{ bearerAuth: [] }],
        body: Type.Object({
          url: Type.String(),
          database: Type.String(),
          username: Type.String(),
          api_key: Type.String(),
          auto_sync: Type.Optional(Type.Boolean({ default: false })),
          skip_test: Type.Optional(Type.Boolean({ default: false })),
        }),
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { url, database, username, api_key, auto_sync, skip_test } = request.body as {
        url: string;
        database: string;
        username: string;
        api_key: string;
        auto_sync?: boolean;
        skip_test?: boolean;
      };

      const odooService = new OdooService(request.supabase!);
      const result = await odooService.configure(
        request.user!.org_id!,
        request.user!.id,
        request.user!.role,
        { url, database, username, apiKey: api_key, autoSync: auto_sync },
        skip_test
      );

      if (!result.ok) throw result.error;
      return result.value;
    }
  );

  // Test Odoo connection
  fastify.post(
    '/integrations/odoo/test',
    {
      schema: {
        description: 'Test Odoo connection',
        tags: ['Integrations'],
        security: [{ bearerAuth: [] }],
        body: Type.Object({
          url: Type.String(),
          database: Type.String(),
          username: Type.String(),
          api_key: Type.String(),
        }),
      },
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      const { url, database, username, api_key } = request.body as {
        url: string;
        database: string;
        username: string;
        api_key: string;
      };

      const odooService = new OdooService(request.supabase!);
      const result = await odooService.testConnection(url, database, username, api_key);

      if (!result.success) {
        return reply.code(400).send({ success: false, error: result.error });
      }

      return { success: true, user_name: result.userName, version: result.version };
    }
  );

  // Sync suppliers from Odoo
  fastify.post(
    '/integrations/odoo/sync/suppliers',
    {
      schema: {
        description: 'Sync suppliers from Odoo',
        tags: ['Integrations'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      const odooService = new OdooService(request.supabase!);
      const result = await odooService.syncSuppliers(
        request.user!.org_id!,
        request.user!.id,
        request.user!.role
      );

      if (!result.ok) {
        return reply.code(400).send({
          error: 'Sync failed',
          message: result.error.message,
        });
      }

      return result.value;
    }
  );

  // Disconnect Odoo integration
  fastify.delete(
    '/integrations/odoo',
    {
      schema: {
        description: 'Disconnect Odoo integration',
        tags: ['Integrations'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const odooService = new OdooService(request.supabase!);
      const result = await odooService.disconnect(
        request.user!.org_id!,
        request.user!.id,
        request.user!.role
      );

      if (!result.ok) throw result.error;
      return { success: true, message: 'Odoo integration disconnected' };
    }
  );

  // List saved Odoo configurations
  fastify.get(
    '/integrations/odoo/configs',
    {
      schema: {
        description: 'List saved Odoo configurations',
        tags: ['Integrations'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const odooService = new OdooService(request.supabase!);
      const configs = await odooService.listConfigs(request.user!.org_id!);
      return { configs };
    }
  );

  // Activate a saved Odoo configuration
  fastify.post<{ Params: { id: string } }>(
    '/integrations/odoo/configs/:id/activate',
    {
      schema: {
        description: 'Activate a saved Odoo configuration',
        tags: ['Integrations'],
        security: [{ bearerAuth: [] }],
        params: Type.Object({
          id: Type.String({ format: 'uuid' }),
        }),
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { id } = request.params;
      const odooService = new OdooService(request.supabase!);
      const result = await odooService.activateConfig(
        id,
        request.user!.org_id!,
        request.user!.id,
        request.user!.role
      );

      if (!result.ok) throw result.error;
      return result.value;
    }
  );
};

export default odooRoutes;
