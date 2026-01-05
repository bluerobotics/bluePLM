/**
 * Routes Index
 * 
 * Central registration of all API routes.
 */

import { FastifyPluginAsync } from 'fastify'
import healthRoutes from './health.js'
import authRoutes from './auth.js'
import vaultRoutes from './vaults.js'
import fileRoutes from './files.js'
import trashRoutes from './trash.js'
import activityRoutes from './activity.js'
import partsRoutes from './parts.js'
import supplierRoutes from './suppliers.js'
import integrationRoutes from './integrations/index.js'
import webhookRoutes from './webhooks.js'

const routes: FastifyPluginAsync = async (fastify) => {
  // Health & Info (no prefix)
  await fastify.register(healthRoutes)
  
  // Auth routes
  await fastify.register(authRoutes)
  
  // Vault routes
  await fastify.register(vaultRoutes)
  
  // File routes (includes checkout/checkin, download, versions, metadata)
  await fastify.register(fileRoutes)
  
  // Trash routes
  await fastify.register(trashRoutes)
  
  // Activity routes (includes checkouts list)
  await fastify.register(activityRoutes)
  
  // Parts & BOM routes
  await fastify.register(partsRoutes)
  
  // Supplier routes (includes part-supplier linking and costing)
  await fastify.register(supplierRoutes)
  
  // Integration routes (Odoo, WooCommerce)
  await fastify.register(integrationRoutes)
  
  // Webhook routes
  await fastify.register(webhookRoutes)
}

export default routes
