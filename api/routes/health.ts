/**
 * Health & Info Routes
 * 
 * Provides API status and health check endpoints.
 */

import { FastifyPluginAsync } from 'fastify'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { env } from '../src/config/env.js'
import { checkDatabaseHealth } from '../src/infrastructure/supabase.js'

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load version from package.json
const packageJsonPath = path.join(__dirname, '..', 'package.json')
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
const API_VERSION = packageJson.version || '0.0.0'

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  // API info and status
  fastify.get('/', {
    schema: {
      description: 'API info and status',
      tags: ['Info'],
      response: {
        200: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            version: { type: 'string' },
            status: { type: 'string' },
            docs: { type: 'string' }
          }
        }
      }
    }
  }, async () => ({
    name: 'BluePLM REST API',
    version: API_VERSION,
    status: 'running',
    docs: `http://${env.API_HOST}:${env.API_PORT}/docs`
  }))
  
  // Health check with database connectivity
  fastify.get('/health', {
    schema: {
      description: 'Health check with dependency status',
      tags: ['Info'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            version: { type: 'string' },
            build: { type: ['string', 'null'] },
            checks: {
              type: 'object',
              properties: {
                database: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    latencyMs: { type: ['number', 'null'] },
                    error: { type: ['string', 'null'] }
                  }
                }
              }
            }
          }
        }
      }
    }
  }, async () => {
    // Check database connectivity
    const dbCheck = await checkDatabaseHealth()
    
    // Determine overall status
    const allHealthy = dbCheck.status === 'healthy'
    
    return {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: API_VERSION,
      build: process.env.RAILWAY_GIT_COMMIT_SHA?.substring(0, 7) || 
             process.env.RENDER_GIT_COMMIT?.substring(0, 7) || null,
      checks: {
        database: {
          status: dbCheck.status,
          latencyMs: dbCheck.latencyMs ?? null,
          error: dbCheck.error ?? null
        }
      }
    }
  })
}

export default healthRoutes
