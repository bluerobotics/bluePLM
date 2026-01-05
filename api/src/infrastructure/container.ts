/**
 * Dependency Injection Container
 *
 * Factory for creating services with their dependencies wired up.
 * This provides a simple, type-safe approach to dependency injection.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClient, createSupabaseAdminClient } from './supabase';
import { env } from '../config/env';

// Repositories
import {
  FileRepository,
  VaultRepository,
  WebhookRepository,
  UserRepository,
  ActivityRepository,
} from './database/repositories';

// Services
import { FileService } from '../services/FileService';
import { VaultService } from '../services/VaultService';
import { WebhookService, type Logger } from '../services/WebhookService';
import { ActivityService } from '../services/ActivityService';
import { AuthService, type AuthConfig } from '../services/AuthService';
import { SupplierService } from '../services/SupplierService';

/**
 * Container holding all instantiated services for a request
 */
export interface Container {
  // Supabase clients
  supabase: SupabaseClient;
  adminSupabase: SupabaseClient | null;

  // Repositories
  fileRepository: FileRepository;
  vaultRepository: VaultRepository;
  webhookRepository: WebhookRepository;
  userRepository: UserRepository;
  activityRepository: ActivityRepository;

  // Services
  fileService: FileService;
  vaultService: VaultService;
  webhookService: WebhookService;
  activityService: ActivityService;
  authService: AuthService;
  supplierService: SupplierService;
}

// Default logger using console (can be replaced with pino in actual usage)
const defaultLogger: Logger = {
  warn: (obj, message) => console.warn(message, obj),
  error: (obj, message) => console.error(message, obj),
};

/**
 * Create auth config from environment
 */
function getAuthConfig(): AuthConfig {
  return {
    supabaseUrl: env.SUPABASE_URL,
    supabaseKey: env.SUPABASE_KEY,
    supabaseServiceKey: env.SUPABASE_SERVICE_KEY,
  };
}

/**
 * Container creation options
 */
export interface ContainerOptions {
  /** User's JWT access token (optional for anonymous access) */
  accessToken?: string;
  /** Organization ID for repository scoping */
  orgId: string;
  /** Logger instance (defaults to console) */
  logger?: Logger;
}

/**
 * Create a container for a request
 *
 * @param options - Container creation options
 * @returns Container with all services configured for the request context
 */
export function createContainer(options: ContainerOptions): Container {
  const { accessToken, orgId, logger = defaultLogger } = options;

  // Create Supabase client with user's token for RLS (if provided)
  const supabase = accessToken
    ? createSupabaseClient(accessToken)
    : createSupabaseClient();

  // Try to create admin client (may not be configured)
  let adminSupabase: SupabaseClient | null = null;
  try {
    adminSupabase = createSupabaseAdminClient();
  } catch {
    // Service key not configured - some operations will be unavailable
  }

  // Create repositories scoped to the organization
  const fileRepository = new FileRepository(supabase, orgId);
  const vaultRepository = new VaultRepository(supabase, orgId);
  const webhookRepository = new WebhookRepository(supabase, orgId);
  const userRepository = new UserRepository(supabase, orgId);
  const activityRepository = new ActivityRepository(supabase, orgId);

  // Create services with their dependencies
  const vaultService = new VaultService(vaultRepository);
  const webhookService = new WebhookService(webhookRepository, logger);
  const activityService = new ActivityService(supabase);
  const supplierService = new SupplierService(supabase);
  const fileService = new FileService(fileRepository, webhookService, activityService);
  const authService = new AuthService(getAuthConfig());

  return {
    supabase,
    adminSupabase,
    fileRepository,
    vaultRepository,
    webhookRepository,
    userRepository,
    activityRepository,
    fileService,
    vaultService,
    webhookService,
    activityService,
    authService,
    supplierService,
  };
}

/**
 * Create a lightweight container for auth-only operations (no orgId required)
 *
 * @param logger - Optional logger (defaults to console)
 * @returns Container with only auth service available
 */
export function createAuthOnlyContainer(): Pick<Container, 'authService'> {
  const authService = new AuthService(getAuthConfig());
  return { authService };
}
