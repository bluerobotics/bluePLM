/**
 * Auth Plugin
 *
 * JWT authentication via Supabase.
 */

import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { SupabaseClient } from '@supabase/supabase-js';
import { UnauthorizedError, ForbiddenError } from '../../core/errors';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'engineer' | 'viewer';
  org_id: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
    supabase: SupabaseClient | null;
    accessToken: string | null;
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    createSupabaseClient: (token?: string) => SupabaseClient;
  }
}

interface AuthPluginOptions {
  supabaseUrl: string;
  supabaseKey: string;
}

const plugin: FastifyPluginAsync<AuthPluginOptions> = async (fastify, opts) => {
  const { supabaseUrl, supabaseKey } = opts;

  // Helper to create Supabase client
  const createSupabaseClient = (token?: string): SupabaseClient => {
    const { createClient } = require('@supabase/supabase-js');
    return createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: token
        ? {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        : undefined,
    });
  };

  // Decorate request with user, supabase client, and access token
  fastify.decorateRequest('user', null);
  fastify.decorateRequest('supabase', null);
  fastify.decorateRequest('accessToken', null);

  // Decorate instance with helper
  fastify.decorate('createSupabaseClient', createSupabaseClient);

  // Authentication preHandler
  fastify.decorate('authenticate', async function (
    request: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid Authorization header');
    }

    const token = authHeader.substring(7);

    if (!token || token === 'undefined' || token === 'null') {
      throw new UnauthorizedError('Invalid or missing access token');
    }

    const supabase = createSupabaseClient(token);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      throw new UnauthorizedError(error?.message || 'Token verification failed');
    }

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('id, email, role, org_id, full_name')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      throw new UnauthorizedError('User profile does not exist');
    }

    if (!profile.org_id) {
      throw new ForbiddenError('User is not a member of any organization');
    }

    // Set user on request
    request.user = profile as AuthUser;
    request.supabase = supabase;
    request.accessToken = token;

    request.log.info({ userId: profile.id }, 'User authenticated');
  });
};

export default fp(plugin, { name: 'auth' });
