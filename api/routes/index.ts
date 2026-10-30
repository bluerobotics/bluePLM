/**
 * Routes Index
 *
 * Central registration of all API routes.
 *
 * 5.0 (API 4.0.0) removed the REST duplicates of what the app does through Supabase RPCs
 * (`/files/*`, `/vaults`, `/trash`, `/parts`, `/bom`, `/suppliers`, `/activity`, `/checkouts`,
 * `/auth/login|refresh|me`) and the sandbox extension system (`/extensions/*`, `/admin/extensions`).
 * A future public API is a thin layer over the same RPCs the app calls, so it cannot drift.
 */

import { FastifyPluginAsync } from 'fastify'
import healthRoutes from './health.js'
import authRoutes from './auth.js'
import integrationRoutes from './integrations/index.js'
import webhookRoutes from './webhooks.js'
import { getNativeExtensionRuntime, nativeExtensionRoutes } from '../src/native-extensions/index.js'

const routes: FastifyPluginAsync = async (fastify) => {
  // Health & Info (no prefix)
  await fastify.register(healthRoutes)

  // Auth routes (invite only)
  await fastify.register(authRoutes)

  // Integration routes (Odoo)
  await fastify.register(integrationRoutes)

  // Webhook routes
  await fastify.register(webhookRoutes)

  // Native extension routes (/ext/<id>/...) and POST /admin/extensions/reload
  await fastify.register(nativeExtensionRoutes, {
    runtime: getNativeExtensionRuntime(),
    autoLoad: true,
  })
}

export default routes
