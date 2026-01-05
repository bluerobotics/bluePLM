import { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { randomUUID } from 'crypto';

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
    startTime: number;
  }
}

async function requestContextPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest('requestId', '');
  fastify.decorateRequest('startTime', 0);

  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    // Use existing request id header or generate one
    request.requestId = (request.headers['x-request-id'] as string) || randomUUID();
    request.startTime = Date.now();

    // Add to log context
    request.log = request.log.child({ requestId: request.requestId });
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
}

export default fp(requestContextPlugin, {
  name: 'request-context',
});
