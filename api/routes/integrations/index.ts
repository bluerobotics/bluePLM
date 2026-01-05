/**
 * Integrations Routes Index
 */

import { FastifyPluginAsync } from 'fastify'
import odooRoutes from './odoo.js'
import woocommerceRoutes from './woocommerce.js'

const integrationRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(odooRoutes)
  await fastify.register(woocommerceRoutes)
}

export default integrationRoutes
