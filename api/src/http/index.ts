/**
 * HTTP Layer
 *
 * Fastify plugin that registers all HTTP routes, middleware, and plugins.
 */

import { FastifyPluginAsync } from 'fastify';
import {
  requestContextPlugin,
  errorHandlerPlugin,
  authPlugin,
  containerPlugin,
} from './plugins';
import routes, { RoutesOptions } from './routes';

export interface HttpLayerOptions extends RoutesOptions {
  supabaseKey: string;
}

/**
 * HTTP Layer Plugin
 *
 * Registers all HTTP middleware and routes:
 * - Request context (request ID, timing)
 * - Error handler (centralized error handling)
 * - Auth plugin (JWT authentication)
 * - All routes
 */
const httpLayer: FastifyPluginAsync<HttpLayerOptions> = async (fastify, opts) => {
  // Register request context plugin (adds request ID, timing)
  await fastify.register(requestContextPlugin);

  // Register error handler plugin (centralized error handling)
  await fastify.register(errorHandlerPlugin);

  // Register auth plugin (JWT authentication)
  await fastify.register(authPlugin, {
    supabaseUrl: opts.supabaseUrl,
    supabaseKey: opts.supabaseKey,
  });

  // Register container plugin (DI container per-request)
  await fastify.register(containerPlugin);

  // Register all routes
  await fastify.register(routes, opts);
};

export default httpLayer;

// Re-export plugins and schemas
export * from './plugins';
export * from './schemas';
