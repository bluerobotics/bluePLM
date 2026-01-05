/**
 * Routes Index
 *
 * Central registration of all API routes.
 */

import { FastifyPluginAsync } from 'fastify';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';
import vaultRoutes from './vaults.routes';
import fileRoutes from './files.routes';
import trashRoutes from './trash.routes';
import activityRoutes from './activity.routes';
import partsRoutes from './parts.routes';
import supplierRoutes from './suppliers.routes';
import integrationRoutes from './integrations';
import webhookRoutes from './webhooks.routes';

export interface RoutesOptions {
  apiVersion: string;
  host: string;
  port: number;
  supabaseUrl: string;
  signedUrlExpiry: number;
}

const routes: FastifyPluginAsync<RoutesOptions> = async (fastify, opts) => {
  // Health & Info (no prefix)
  await fastify.register(healthRoutes, {
    apiVersion: opts.apiVersion,
    host: opts.host,
    port: opts.port,
    supabaseUrl: opts.supabaseUrl,
  });

  // Auth routes
  await fastify.register(authRoutes);

  // Vault routes
  await fastify.register(vaultRoutes);

  // File routes (includes checkout/checkin, download, versions, metadata)
  await fastify.register(fileRoutes, {
    signedUrlExpiry: opts.signedUrlExpiry,
  });

  // Trash routes
  await fastify.register(trashRoutes);

  // Activity routes (includes checkouts list)
  await fastify.register(activityRoutes);

  // Parts & BOM routes
  await fastify.register(partsRoutes);

  // Supplier routes (includes part-supplier linking and costing)
  await fastify.register(supplierRoutes);

  // Integration routes (Odoo, WooCommerce)
  await fastify.register(integrationRoutes);

  // Webhook routes
  await fastify.register(webhookRoutes);
};

export default routes;
