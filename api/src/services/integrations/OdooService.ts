/**
 * Odoo Integration Service
 *
 * Handles configuration, testing, and sync with Odoo ERP.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Result } from '../../core/result';
import { ok, err } from '../../core/result';
import { ForbiddenError, NotFoundError, ValidationError } from '../../core/errors';
import type { AppError } from '../../core/errors/AppError';

export interface OdooConfig {
  url: string;
  database: string;
  username: string;
  apiKey: string;
  autoSync?: boolean;
}

export interface OdooSettings {
  configured: boolean;
  settings?: {
    url: string;
    database: string;
    username: string;
    configId?: string;
    configName?: string;
  };
  isConnected?: boolean;
  lastSyncAt?: string;
  lastSyncStatus?: string;
  lastSyncCount?: number;
  autoSync?: boolean;
}

export interface OdooConnectionResult {
  success: boolean;
  userName?: string;
  version?: string;
  error?: string;
}

export interface OdooSyncResult {
  success: boolean;
  created: number;
  updated: number;
  errors: number;
  message: string;
}

export interface SavedOdooConfig {
  id: string;
  name: string;
  url: string;
  database: string;
  username: string;
  color?: string;
  isActive: boolean;
  lastTestedAt?: string;
  lastTestSuccess?: boolean;
}

// Odoo JSON-RPC response types
interface OdooRpcResponse {
  error?: { message: string };
  result?: unknown;
}

// Utility functions for Odoo URL normalization
function normalizeOdooUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized;
  }
  // Remove trailing slash
  normalized = normalized.replace(/\/+$/, '');
  return normalized;
}

export class OdooService {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Get Odoo integration settings for an organization
   */
  async getSettings(orgId: string): Promise<OdooSettings> {
    const { data, error } = await this.supabase
      .from('organization_integrations')
      .select('*')
      .eq('org_id', orgId)
      .eq('integration_type', 'odoo')
      .single();

    if (error || !data) {
      return { configured: false };
    }

    return {
      configured: true,
      settings: {
        url: data.settings?.url,
        database: data.settings?.database,
        username: data.settings?.username,
        configId: data.settings?.config_id,
        configName: data.settings?.config_name,
      },
      isConnected: data.is_connected,
      lastSyncAt: data.last_sync_at,
      lastSyncStatus: data.last_sync_status,
      lastSyncCount: data.last_sync_count,
      autoSync: data.auto_sync,
    };
  }

  /**
   * Configure Odoo integration
   */
  async configure(
    orgId: string,
    userId: string,
    userRole: string,
    config: OdooConfig,
    skipTest: boolean = false
  ): Promise<Result<{ success: boolean; message: string; newConfig?: { id: string; name: string } }, AppError>> {
    if (userRole !== 'admin') {
      return err(new ForbiddenError('Only admins can configure integrations'));
    }

    const normalizedUrl = normalizeOdooUrl(config.url);
    let isConnected = false;
    let connectionError: string | null = null;

    if (!skipTest) {
      const testResult = await this.testConnection(
        normalizedUrl,
        config.database,
        config.username,
        config.apiKey
      );
      isConnected = testResult.success;
      connectionError = testResult.error || null;
    }

    // Check for existing config
    const { data: existingConfigs } = await this.supabase
      .from('odoo_saved_configs')
      .select('id, url, database, username, api_key_encrypted')
      .eq('org_id', orgId)
      .eq('is_active', true);

    const matchingConfig = existingConfigs?.find(
      (c) =>
        c.url === normalizedUrl &&
        c.database === config.database &&
        c.username === config.username &&
        c.api_key_encrypted === config.apiKey
    );

    let configId: string | null = matchingConfig?.id || null;
    let configName: string | null = null;

    if (!matchingConfig) {
      const baseName = normalizedUrl.replace(/^https?:\/\//, '').split('/')[0];
      const colors = ['#22c55e', '#3b82f6', '#8b5cf6', '#f97316', '#ec4899', '#06b6d4', '#eab308', '#ef4444'];

      const { data: newConfig } = await this.supabase
        .from('odoo_saved_configs')
        .insert({
          org_id: orgId,
          name: baseName,
          url: normalizedUrl,
          database: config.database,
          username: config.username,
          api_key_encrypted: config.apiKey,
          color: colors[(existingConfigs?.length || 0) % colors.length],
          is_active: true,
          last_tested_at: !skipTest ? new Date().toISOString() : null,
          last_test_success: !skipTest ? isConnected : null,
          created_by: userId,
          updated_by: userId,
        })
        .select('id, name')
        .single();

      if (newConfig) {
        configId = newConfig.id;
        configName = newConfig.name;
      }
    }

    const { error } = await this.supabase.from('organization_integrations').upsert(
      {
        org_id: orgId,
        integration_type: 'odoo',
        settings: {
          url: normalizedUrl,
          database: config.database,
          username: config.username,
          config_id: configId,
          config_name: configName,
        },
        credentials_encrypted: config.apiKey,
        is_active: true,
        is_connected: isConnected,
        last_connected_at: isConnected ? new Date().toISOString() : null,
        last_error: connectionError,
        auto_sync: config.autoSync || false,
        updated_by: userId,
      },
      { onConflict: 'org_id,integration_type' }
    );

    if (error) throw error;

    return ok({
      success: true,
      message: isConnected
        ? 'Odoo integration connected!'
        : `Saved but connection failed: ${connectionError}`,
      newConfig: configName ? { id: configId!, name: configName } : undefined,
    });
  }

  /**
   * Test Odoo connection
   */
  async testConnection(
    url: string,
    database: string,
    username: string,
    apiKey: string
  ): Promise<OdooConnectionResult> {
    try {
      const normalizedUrl = normalizeOdooUrl(url);

      // Try to authenticate using JSON-RPC
      const response = await fetch(`${normalizedUrl}/jsonrpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          params: {
            service: 'common',
            method: 'authenticate',
            args: [database, username, apiKey, {}],
          },
          id: 1,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }

      const result = await response.json() as OdooRpcResponse;

      if (result.error) {
        return { success: false, error: result.error.message || 'Authentication failed' };
      }

      if (!result.result) {
        return { success: false, error: 'Invalid credentials' };
      }

      // Get version info
      const versionResponse = await fetch(`${normalizedUrl}/jsonrpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          params: {
            service: 'common',
            method: 'version',
            args: [],
          },
          id: 2,
        }),
      });

      const versionResult = await versionResponse.json() as OdooRpcResponse;
      const version = (versionResult.result as { server_version?: string } | undefined)?.server_version || 'unknown';

      return { success: true, userName: username, version };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  /**
   * Sync suppliers from Odoo
   */
  async syncSuppliers(
    orgId: string,
    userId: string,
    userRole: string
  ): Promise<Result<OdooSyncResult, AppError>> {
    if (userRole !== 'admin' && userRole !== 'engineer') {
      return err(new ForbiddenError('Only admins and engineers can sync'));
    }

    const { data: integration } = await this.supabase
      .from('organization_integrations')
      .select('*')
      .eq('org_id', orgId)
      .eq('integration_type', 'odoo')
      .single();

    if (!integration) {
      return err(new ValidationError('Odoo integration not configured'));
    }

    // Fetch suppliers from Odoo
    const suppliersResult = await this.fetchOdooSuppliers(
      integration.settings.url,
      integration.settings.database,
      integration.settings.username,
      integration.credentials_encrypted
    );

    if (!suppliersResult.success) {
      await this.supabase
        .from('organization_integrations')
        .update({
          is_connected: false,
          last_sync_at: new Date().toISOString(),
          last_sync_status: 'error',
          last_error: suppliersResult.error,
        })
        .eq('id', integration.id);

      return err(new ValidationError(suppliersResult.error || 'Sync failed'));
    }

    const suppliers = suppliersResult.suppliers || [];
    let created = 0,
      updated = 0,
      errors = 0;

    for (const odooSupplier of suppliers) {
      try {
        const { data: existing } = await this.supabase
          .from('suppliers')
          .select('id')
          .eq('org_id', orgId)
          .eq('erp_id', String(odooSupplier.id))
          .single();

        const supplierData = {
          org_id: orgId,
          name: odooSupplier.name,
          code: odooSupplier.ref || null,
          contact_email: odooSupplier.email || null,
          contact_phone: odooSupplier.phone || odooSupplier.mobile || null,
          website: odooSupplier.website || null,
          address_line1: odooSupplier.street || null,
          city: odooSupplier.city || null,
          postal_code: odooSupplier.zip || null,
          country: odooSupplier.country_id?.[1] || 'USA',
          is_active: odooSupplier.active !== false,
          is_approved: true,
          erp_id: String(odooSupplier.id),
          erp_synced_at: new Date().toISOString(),
          updated_by: userId,
        };

        if (existing) {
          await this.supabase.from('suppliers').update(supplierData).eq('id', existing.id);
          updated++;
        } else {
          await this.supabase.from('suppliers').insert({ ...supplierData, created_by: userId });
          created++;
        }
      } catch {
        errors++;
      }
    }

    await this.supabase
      .from('organization_integrations')
      .update({
        is_connected: true,
        last_connected_at: new Date().toISOString(),
        last_error: null,
        last_sync_at: new Date().toISOString(),
        last_sync_status: errors > 0 ? 'partial' : 'success',
        last_sync_count: created + updated,
      })
      .eq('id', integration.id);

    return ok({
      success: true,
      created,
      updated,
      errors,
      message: `Synced ${created + updated} suppliers from Odoo`,
    });
  }

  /**
   * Fetch suppliers from Odoo via JSON-RPC
   */
  private async fetchOdooSuppliers(
    url: string,
    database: string,
    username: string,
    apiKey: string
  ): Promise<{ success: boolean; suppliers?: any[]; error?: string }> {
    try {
      // First authenticate
      const authResponse = await fetch(`${url}/jsonrpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          params: {
            service: 'common',
            method: 'authenticate',
            args: [database, username, apiKey, {}],
          },
          id: 1,
        }),
        signal: AbortSignal.timeout(10000),
      });

      const authResult = await authResponse.json() as OdooRpcResponse;
      const uid = authResult.result;

      if (!uid) {
        return { success: false, error: 'Authentication failed' };
      }

      // Fetch suppliers (partners where supplier = true)
      const suppliersResponse = await fetch(`${url}/jsonrpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          params: {
            service: 'object',
            method: 'execute_kw',
            args: [
              database,
              uid,
              apiKey,
              'res.partner',
              'search_read',
              [[['supplier_rank', '>', 0]]],
              {
                fields: [
                  'id',
                  'name',
                  'ref',
                  'email',
                  'phone',
                  'mobile',
                  'website',
                  'street',
                  'city',
                  'zip',
                  'country_id',
                  'active',
                ],
                limit: 1000,
              },
            ],
          },
          id: 2,
        }),
        signal: AbortSignal.timeout(30000),
      });

      const suppliersResult = await suppliersResponse.json() as OdooRpcResponse;

      if (suppliersResult.error) {
        return { success: false, error: suppliersResult.error.message };
      }

      return { success: true, suppliers: (suppliersResult.result as unknown[]) || [] };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch suppliers',
      };
    }
  }

  /**
   * Disconnect Odoo integration
   */
  async disconnect(
    orgId: string,
    userId: string,
    userRole: string
  ): Promise<Result<void, AppError>> {
    if (userRole !== 'admin') {
      return err(new ForbiddenError('Only admins can disconnect integrations'));
    }

    await this.supabase
      .from('organization_integrations')
      .update({
        is_active: false,
        is_connected: false,
        credentials_encrypted: null,
        updated_by: userId,
      })
      .eq('org_id', orgId)
      .eq('integration_type', 'odoo');

    return ok(undefined);
  }

  /**
   * List saved Odoo configurations
   */
  async listConfigs(orgId: string): Promise<SavedOdooConfig[]> {
    const { data } = await this.supabase
      .from('odoo_saved_configs')
      .select(
        'id, name, description, url, database, username, color, is_active, last_tested_at, last_test_success, created_at'
      )
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('name');

    return (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      url: row.url,
      database: row.database,
      username: row.username,
      color: row.color,
      isActive: row.is_active,
      lastTestedAt: row.last_tested_at,
      lastTestSuccess: row.last_test_success,
    }));
  }

  /**
   * Activate a saved configuration
   */
  async activateConfig(
    configId: string,
    orgId: string,
    userId: string,
    userRole: string
  ): Promise<Result<{ connected: boolean; configName: string; message: string }, AppError>> {
    if (userRole !== 'admin') {
      return err(new ForbiddenError('Only admins can activate configurations'));
    }

    const { data: config } = await this.supabase
      .from('odoo_saved_configs')
      .select('*')
      .eq('id', configId)
      .eq('org_id', orgId)
      .single();

    if (!config) {
      return err(new NotFoundError('Configuration', configId));
    }

    const testResult = await this.testConnection(
      config.url,
      config.database,
      config.username,
      config.api_key_encrypted
    );

    await this.supabase.from('organization_integrations').upsert(
      {
        org_id: orgId,
        integration_type: 'odoo',
        settings: {
          url: config.url,
          database: config.database,
          username: config.username,
          config_id: config.id,
          config_name: config.name,
        },
        credentials_encrypted: config.api_key_encrypted,
        is_active: true,
        is_connected: testResult.success,
        last_connected_at: testResult.success ? new Date().toISOString() : null,
        last_error: testResult.error,
        updated_by: userId,
      },
      { onConflict: 'org_id,integration_type' }
    );

    await this.supabase
      .from('odoo_saved_configs')
      .update({
        last_tested_at: new Date().toISOString(),
        last_test_success: testResult.success,
      })
      .eq('id', configId);

    return ok({
      connected: testResult.success,
      configName: config.name,
      message: testResult.success
        ? `Switched to "${config.name}" and connected!`
        : `Switched to "${config.name}" but connection failed`,
    });
  }
}
