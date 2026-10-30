/**
 * `app.services` for a native extension.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Logger } from 'pino'
import { ErrorCode, sendError } from '../../utils/errors.js'
import {
  credentialSetupProblem,
  getCredential,
  openCredentialStore,
} from '../integrations/credentialStore.js'
import type { ExtensionServerServices } from './types.js'

/**
 * Resolve the org's `organization_integrations` row of type `integration` and
 * read its stored credential exactly as core's customer sync did. Returns
 * null when there is no row or no credential. Rethrows only the two
 * "credential store is not usable" errors; any other failure is logged and
 * answered as null (the extension then tells the user to re-enter the key).
 */
export function createGetIntegrationCredential(
  admin: SupabaseClient,
  log: Logger,
): ExtensionServerServices['getIntegrationCredential'] {
  return async (orgId, integration) => {
    const { data, error } = await admin
      .from('org_integration')
      .select('id')
      .eq('org_id', orgId)
      .eq('integration_type', integration)
      .maybeSingle()
    if (error) {
      log.error({ err: error.message, integration }, 'Integration lookup failed')
      return null
    }
    const id = (data as { id?: unknown } | null)?.id
    if (typeof id !== 'string') return null

    try {
      return await getCredential(openCredentialStore(), 'organization_integration', id)
    } catch (err) {
      if (credentialSetupProblem(err)) throw err
      log.error({ err, integration }, 'Integration credential could not be read')
      return null
    }
  }
}

export function createExtensionServices(admin: SupabaseClient, log: Logger): ExtensionServerServices {
  return {
    supabaseAdmin: admin,
    getIntegrationCredential: createGetIntegrationCredential(admin, log),
    log,
    sendError,
    ErrorCode,
  }
}
