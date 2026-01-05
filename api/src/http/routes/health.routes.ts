/**
 * Health Routes
 *
 * API info and health check endpoints.
 */

import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';

interface HealthRoutesOptions {
  apiVersion: string;
  host: string;
  port: number;
  supabaseUrl: string;
}

const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (fastify, opts) => {
  const { apiVersion, host, port, supabaseUrl } = opts;

  // API info and status
  fastify.get(
    '/',
    {
      schema: {
        description: 'API info and status',
        tags: ['Info'],
        response: {
          200: Type.Object({
            name: Type.String(),
            version: Type.String(),
            status: Type.String(),
            docs: Type.String(),
          }),
        },
      },
    },
    async () => ({
      name: 'BluePLM REST API',
      version: apiVersion,
      status: 'running',
      docs: `http://${host}:${port}/docs`,
    })
  );

  // Health check
  fastify.get(
    '/health',
    {
      schema: {
        description: 'Health check',
        tags: ['Info'],
        response: {
          200: Type.Object({
            status: Type.String(),
            timestamp: Type.String(),
            supabase: Type.String(),
            supabase_project: Type.Union([Type.String(), Type.Null()]),
            version: Type.String(),
            build: Type.Union([Type.String(), Type.Null()]),
          }),
        },
      },
    },
    async () => {
      // Extract project ID from Supabase URL for debugging
      const supabaseProject = supabaseUrl
        ? supabaseUrl.match(/https:\/\/([^.]+)\.supabase/)?.[1] || 'custom'
        : null;

      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        supabase: supabaseUrl ? 'configured' : 'not configured',
        supabase_project: supabaseProject,
        version: apiVersion,
        build:
          process.env.RAILWAY_GIT_COMMIT_SHA?.substring(0, 7) ||
          process.env.RENDER_GIT_COMMIT?.substring(0, 7) ||
          null,
      };
    }
  );
};

export default healthRoutes;
