/**
 * WooCommerce Integration Routes
 *
 * Configuration, testing, and sync with WooCommerce.
 */

import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { WooCommerceService } from '../../../services/integrations/WooCommerceService';

const woocommerceRoutes: FastifyPluginAsync = async (fastify) => {
  // Get WooCommerce integration settings
  fastify.get(
    '/integrations/woocommerce',
    {
      schema: {
        description: 'Get WooCommerce integration settings',
        tags: ['Integrations'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const wooCommerceService = new WooCommerceService(request.supabase!);
      const settings = await wooCommerceService.getSettings(request.user!.org_id!);

      if (!settings.configured) {
        return { configured: false };
      }

      return {
        configured: true,
        settings: {
          store_url: settings.settings?.storeUrl,
          store_name: settings.settings?.storeName,
        },
        is_connected: settings.isConnected,
        wc_version: settings.settings?.wcVersion,
        last_sync_at: settings.lastSyncAt,
        last_sync_status: settings.lastSyncStatus,
        products_synced: settings.productsSynced,
        auto_sync: settings.autoSync,
      };
    }
  );

  // Configure WooCommerce integration
  fastify.post(
    '/integrations/woocommerce',
    {
      schema: {
        description: 'Configure WooCommerce integration',
        tags: ['Integrations'],
        security: [{ bearerAuth: [] }],
        body: Type.Object({
          store_url: Type.String(),
          consumer_key: Type.String(),
          consumer_secret: Type.String(),
          sync_settings: Type.Optional(Type.Object({})),
          auto_sync: Type.Optional(Type.Boolean()),
          skip_test: Type.Optional(Type.Boolean()),
        }),
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { store_url, consumer_key, consumer_secret, sync_settings, auto_sync, skip_test } =
        request.body as {
          store_url: string;
          consumer_key: string;
          consumer_secret: string;
          sync_settings?: Record<string, unknown>;
          auto_sync?: boolean;
          skip_test?: boolean;
        };

      const wooCommerceService = new WooCommerceService(request.supabase!);
      const result = await wooCommerceService.configure(
        request.user!.org_id!,
        request.user!.id,
        request.user!.role,
        {
          storeUrl: store_url,
          consumerKey: consumer_key,
          consumerSecret: consumer_secret,
          syncSettings: sync_settings,
          autoSync: auto_sync,
        },
        skip_test
      );

      if (!result.ok) throw result.error;
      return result.value;
    }
  );

  // Test WooCommerce connection
  fastify.post(
    '/integrations/woocommerce/test',
    {
      schema: {
        description: 'Test WooCommerce connection',
        tags: ['Integrations'],
        security: [{ bearerAuth: [] }],
        body: Type.Object({
          store_url: Type.String(),
          consumer_key: Type.String(),
          consumer_secret: Type.String(),
        }),
      },
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      const { store_url, consumer_key, consumer_secret } = request.body as {
        store_url: string;
        consumer_key: string;
        consumer_secret: string;
      };

      const wooCommerceService = new WooCommerceService(request.supabase!);
      const result = await wooCommerceService.testConnection(
        store_url,
        consumer_key,
        consumer_secret
      );

      if (!result.success) {
        return reply.code(400).send({ success: false, error: result.error });
      }

      return { success: true, store_name: result.storeName, version: result.version };
    }
  );

  // Sync products to WooCommerce
  fastify.post(
    '/integrations/woocommerce/sync/products',
    {
      schema: {
        description: 'Sync products to WooCommerce',
        tags: ['Integrations'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      const wooCommerceService = new WooCommerceService(request.supabase!);
      const result = await wooCommerceService.syncProducts(
        request.user!.org_id!,
        request.user!.id,
        request.user!.role
      );

      if (!result.ok) {
        return reply.code(400).send({ error: 'Not configured' });
      }

      return result.value;
    }
  );

  // Disconnect WooCommerce integration
  fastify.delete(
    '/integrations/woocommerce',
    {
      schema: {
        description: 'Disconnect WooCommerce integration',
        tags: ['Integrations'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const wooCommerceService = new WooCommerceService(request.supabase!);
      const result = await wooCommerceService.disconnect(
        request.user!.org_id!,
        request.user!.id,
        request.user!.role
      );

      if (!result.ok) throw result.error;
      return { success: true, message: 'WooCommerce integration disconnected' };
    }
  );

  // List saved WooCommerce configurations
  fastify.get(
    '/integrations/woocommerce/configs',
    {
      schema: {
        description: 'List saved WooCommerce configurations',
        tags: ['Integrations'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const wooCommerceService = new WooCommerceService(request.supabase!);
      const configs = await wooCommerceService.listConfigs(request.user!.org_id!);
      return { configs };
    }
  );

  // Activate a saved WooCommerce configuration
  fastify.post<{ Params: { id: string } }>(
    '/integrations/woocommerce/configs/:id/activate',
    {
      schema: {
        description: 'Activate a saved WooCommerce configuration',
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
      const wooCommerceService = new WooCommerceService(request.supabase!);
      const result = await wooCommerceService.activateConfig(
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

export default woocommerceRoutes;
