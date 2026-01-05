import { FastifyInstance, FastifyError } from 'fastify';
import fp from 'fastify-plugin';

async function errorHandlerPlugin(fastify: FastifyInstance) {
  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    // Handle Fastify validation errors
    if (error.validation) {
      request.log.warn({ err: error }, 'Validation error');
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: error.validation,
      });
    }

    // Handle rate limit errors
    if (error.statusCode === 429) {
      return reply.status(429).send({
        error: 'RATE_LIMIT_EXCEEDED',
        message: error.message || 'Too many requests',
      });
    }

    // Log unexpected errors
    request.log.error({ err: error }, 'Unhandled error');

    // Don't expose internal errors in production
    const isDev = process.env.NODE_ENV !== 'production';
    return reply.status(error.statusCode || 500).send({
      error: 'INTERNAL_ERROR',
      message: isDev ? error.message : 'Internal server error',
      ...(isDev && { stack: error.stack }),
    });
  });
}

export default fp(errorHandlerPlugin, {
  name: 'error-handler',
});
