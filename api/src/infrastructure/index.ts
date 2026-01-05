/**
 * Infrastructure Layer
 *
 * Barrel export for all infrastructure components including
 * database access, external service clients, and cross-cutting concerns.
 */

// Database layer (repositories, mappers, base classes)
export * from './database';

// Supabase client factory
export * from './supabase';

// Logging configuration
export * from './logging';

// Dependency injection container
export * from './container';

// External service clients with circuit breaker resilience
export * from './external';
