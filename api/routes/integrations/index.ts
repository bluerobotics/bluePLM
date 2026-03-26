/**
 * Integrations Routes Index
 */

import { FastifyPluginAsync } from 'fastify'
import odooRoutes from './odoo.js'

const integrationRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(odooRoutes)
}

export default integrationRoutes
