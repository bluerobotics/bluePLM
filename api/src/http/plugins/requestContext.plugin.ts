/**
 * Request Context Plugin
 *
 * Adds request ID and timing to all requests.
 */

import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { randomUUID } from 'crypto';

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
    startTime: number;
  }
}

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest('requestId', '');
  fastify.decorateRequest('startTime', 0);

  fastify.addHook('onRequest', async (request) => {
    request.requestId = (request.headers['x-request-id'] as string) || randomUUID();
    request.startTime = Date.now();

    // Add to log context
    request.log = request.log.child({ requestId: request.requestId });
  });

  fastify.addHook('onSend', async (request, reply) => {
    reply.header('X-Request-ID', request.requestId);
    reply.header('X-Response-Time', `${Date.now() - request.startTime}ms`);
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const duration = Date.now() - request.startTime;
    request.log.info(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        durationMs: duration,
      },
      'Request completed'
    );
  });
};

export default fp(plugin, { name: 'request-context' });
