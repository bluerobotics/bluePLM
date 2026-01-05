/**
 * Container Plugin
 *
 * Instantiates DI container per-request for authenticated routes.
 */

import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { createContainer, Container } from '../../infrastructure/container';
// Import auth plugin to ensure its type augmentations are loaded
import './auth.plugin';

declare module 'fastify' {
  interface FastifyRequest {
    container: Container | null;
  }
}

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest('container', null);

  fastify.addHook('preHandler', async (request) => {
    // Only create container for authenticated requests
    if (request.user && request.user.org_id) {
      request.container = createContainer({
        orgId: request.user.org_id,
        accessToken: request.accessToken || undefined,
        logger: request.log,
      });
    }
  });
};

export default fp(plugin, {
  name: 'container',
  dependencies: ['auth'], // Must run after auth
});
