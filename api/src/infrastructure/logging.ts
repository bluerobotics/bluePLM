/**
 * Logging Configuration
 *
 * Provides Pino logger configuration for the API server.
 */

import type { FastifyLoggerOptions } from 'fastify';
import type { LoggerOptions as PinoLoggerOptions } from 'pino';
import type { env as envType } from '../config/env';

type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

export interface LoggerConfig {
  level: LogLevel;
  prettyPrint: boolean;
}

/**
 * Get default logger configuration based on environment
 */
export function getLoggerConfig(env: typeof envType): LoggerConfig {
  const isDev = env.NODE_ENV === 'development';
  return {
    level: isDev ? 'debug' : 'info',
    prettyPrint: isDev,
  };
}

/**
 * Create Fastify logger options
 */
export function createLoggerOptions(
  env: typeof envType
): FastifyLoggerOptions & PinoLoggerOptions {
  const config = getLoggerConfig(env);

  if (config.prettyPrint) {
    return {
      level: config.level,
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
          colorize: true,
        },
      },
    };
  }

  // Production: structured JSON logs
  return {
    level: config.level,
    formatters: {
      level: (label: string) => ({ level: label }),
    },
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
  };
}
