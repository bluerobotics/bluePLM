/**
 * Integrations Routes Index
 */

import { FastifyPluginAsync } from 'fastify';
import odooRoutes from './odoo.routes';
import woocommerceRoutes from './woocommerce.routes';

const integrationRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(odooRoutes);
  await fastify.register(woocommerceRoutes);
};

export default integrationRoutes;
