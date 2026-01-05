/**
 * Error Handler Plugin
 *
 * Centralized error handling for all routes.
 */

import { FastifyPluginAsync, FastifyError } from 'fastify';
import fp from 'fastify-plugin';
import { AppError } from '../../core/errors/AppError';
import { ErrorCode } from '../../core/errors/ErrorCodes';

declare module 'fastify' {
  interface FastifyReply {
    sendError(error: AppError): void;
  }
}

const plugin: FastifyPluginAsync = async (fastify) => {
  // Add sendError helper to reply
  fastify.decorateReply('sendError', function (error: AppError) {
    return this.code(error.statusCode).send(error.toJSON());
  });

  // Centralized error handler
  fastify.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    // Handle our custom AppError
    if (error instanceof AppError) {
      request.log.warn({ err: error, code: error.code }, error.message);
      return reply.code(error.statusCode).send(error.toJSON());
    }

    // Handle Fastify validation errors
    if ((error as FastifyError).validation) {
      request.log.warn({ err: error }, 'Validation error');
      return reply.code(400).send({
        error: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        details: (error as FastifyError).validation,
      });
    }

    // Handle rate limit errors
    if (error.statusCode === 429) {
      return reply.code(429).send({
        error: 'RATE_LIMIT_EXCEEDED',
        message: error.message || 'Too many requests',
      });
    }

    // Log unexpected errors
    request.log.error({ err: error }, 'Unhandled error');

    // Don't expose internal errors in production
    const isDev = process.env.NODE_ENV !== 'production';
    const statusCode = error.statusCode || 500;
    return reply.code(statusCode).send({
      error: statusCode >= 500 ? ErrorCode.INTERNAL_ERROR : 'ERROR',
      message: isDev ? error.message : 'Internal server error',
      ...(isDev && { stack: error.stack }),
    });
  });

  // Not found handler
  fastify.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      error: ErrorCode.NOT_FOUND,
      message: `Route ${request.method} ${request.url} not found`,
    });
  });
};

export default fp(plugin, { name: 'error-handler' });
