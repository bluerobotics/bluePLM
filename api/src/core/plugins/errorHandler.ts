import { FastifyInstance, FastifyError } from 'fastify'
import fp from 'fastify-plugin'
import { ErrorCode } from '../../../utils/errors.js'

async function errorHandlerPlugin(fastify: FastifyInstance) {
  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.validation) {
      request.log.warn({ err: error }, 'Validation error')
      return reply.status(400).send({
        error: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        details: error.validation,
      })
    }

    if (error.statusCode === 429) {
      return reply.status(429).send({
        error: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: error.message || 'Too many requests',
      })
    }

    request.log.error({ err: error }, 'Unhandled error')

    const isDev = process.env.NODE_ENV !== 'production'
    return reply.status(error.statusCode || 500).send({
      error: ErrorCode.INTERNAL_ERROR,
      message: isDev ? error.message : 'Internal server error',
      ...(isDev && { stack: error.stack }),
    })
  })
}

export default fp(errorHandlerPlugin, {
  name: 'error-handler',
})
