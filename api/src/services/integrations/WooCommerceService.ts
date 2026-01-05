/**
 * WooCommerce Integration Service
 *
 * Handles configuration, testing, and sync with WooCommerce.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Result } from '../../core/result';
import { ok, err } from '../../core/result';
import { ForbiddenError, NotFoundError, ValidationError } from '../../core/errors';
import type { AppError } from '../../core/errors/AppError';

export interface WooCommerceConfig {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
  syncSettings?: Record<string, unknown>;
  autoSync?: boolean;
}

export interface WooCommerceSettings {
  configured: boolean;
  settings?: {
    storeUrl: string;
    storeName?: string;
    wcVersion?: string;
    configId?: string;
    configName?: string;
  };
  isConnected?: boolean;
  lastSyncAt?: string;
  lastSyncStatus?: string;
  productsSynced?: number;
  autoSync?: boolean;
}

export interface WooCommerceConnectionResult {
  success: boolean;
  storeName?: string;
  version?: string;
  error?: string;
}

export interface WooCommerceSyncResult {
  success: boolean;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  message: string;
}

export interface SavedWooCommerceConfig {
  id: string;
  name: string;
  storeUrl: string;
  storeName?: string;
  color?: string;
  isActive: boolean;
  lastTestedAt?: string;
  lastTestSuccess?: boolean;
}

// WooCommerce API response types
interface WooCommerceSystemStatus {
  environment?: {
    site_url?: string;
    version?: string;
  };
}

// Utility function for WooCommerce URL normalization
function normalizeWooCommerceUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized;
  }
  // Remove trailing slash
  normalized = normalized.replace(/\/+$/, '');
  return normalized;
}

export class WooCommerceService {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Get WooCommerce integration settings for an organization
   */
  async getSettings(orgId: string): Promise<WooCommerceSettings> {
    const { data } = await this.supabase
      .from('organization_integrations')
      .select('*')
      .eq('org_id', orgId)
      .eq('integration_type', 'woocommerce')
      .single();

    if (!data) {
      return { configured: false };
    }

    return {
      configured: true,
      settings: {
        storeUrl: data.settings?.store_url,
        storeName: data.settings?.store_name,
        wcVersion: data.settings?.wc_version,
        configId: data.settings?.config_id,
        configName: data.settings?.config_name,
      },
      isConnected: data.is_connected,
      lastSyncAt: data.last_sync_at,
      lastSyncStatus: data.last_sync_status,
      productsSynced: data.last_sync_count,
      autoSync: data.auto_sync,
    };
  }

  /**
   * Configure WooCommerce integration
   */
  async configure(
    orgId: string,
    userId: string,
    userRole: string,
    config: WooCommerceConfig,
    skipTest: boolean = false
  ): Promise<Result<{ success: boolean; message: string; newConfig?: { id: string; name: string } }, AppError>> {
    if (userRole !== 'admin') {
      return err(new ForbiddenError('Only admins can configure integrations'));
    }

    const normalizedUrl = normalizeWooCommerceUrl(config.storeUrl);
    let isConnected = false;
    let connectionError: string | null = null;
    let storeName: string | null = null;
    let wcVersion: string | null = null;

    if (!skipTest) {
      const testResult = await this.testConnection(
        normalizedUrl,
        config.consumerKey,
        config.consumerSecret
      );
      isConnected = testResult.success;
      connectionError = testResult.error || null;
      storeName = testResult.storeName || null;
      wcVersion = testResult.version || null;
    }

    // Check for existing config
    const { data: existingConfigs } = await this.supabase
      .from('woocommerce_saved_configs')
      .select('id, store_url, consumer_key_encrypted')
      .eq('org_id', orgId)
      .eq('is_active', true);

    const matchingConfig = existingConfigs?.find(
      (c) => c.store_url === normalizedUrl && c.consumer_key_encrypted === config.consumerKey
    );

    let configId: string | null = matchingConfig?.id || null;
    let configName: string | null = null;

    if (!matchingConfig) {
      const baseName = storeName || normalizedUrl.replace(/^https?:\/\//, '').split('/')[0];
      const colors = ['#96588a', '#3b82f6', '#22c55e', '#f97316', '#ec4899'];

      const { data: newConfig } = await this.supabase
        .from('woocommerce_saved_configs')
        .insert({
          org_id: orgId,
          name: baseName,
          store_url: normalizedUrl,
          store_name: storeName,
          consumer_key_encrypted: config.consumerKey,
          consumer_secret_encrypted: config.consumerSecret,
          color: colors[(existingConfigs?.length || 0) % colors.length],
          sync_settings: config.syncSettings || {},
          is_active: true,
          wc_version: wcVersion,
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
        integration_type: 'woocommerce',
        settings: {
          store_url: normalizedUrl,
          store_name: storeName,
          wc_version: wcVersion,
          config_id: configId,
          config_name: configName,
          sync_settings: config.syncSettings,
        },
        credentials_encrypted: JSON.stringify({
          consumer_key: config.consumerKey,
          consumer_secret: config.consumerSecret,
        }),
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
        ? 'WooCommerce connected!'
        : `Saved but connection failed: ${connectionError}`,
      newConfig: configName ? { id: configId!, name: configName } : undefined,
    });
  }

  /**
   * Test WooCommerce connection
   */
  async testConnection(
    storeUrl: string,
    consumerKey: string,
    consumerSecret: string
  ): Promise<WooCommerceConnectionResult> {
    try {
      const normalizedUrl = normalizeWooCommerceUrl(storeUrl);

      // Create Basic Auth header
      const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

      // Test connection by fetching system status
      const response = await fetch(`${normalizedUrl}/wp-json/wc/v3/system_status`, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        if (response.status === 401) {
          return { success: false, error: 'Invalid API credentials' };
        }
        return { success: false, error: `HTTP ${response.status}` };
      }

      const data = await response.json() as WooCommerceSystemStatus;

      return {
        success: true,
        storeName: data.environment?.site_url || storeUrl,
        version: data.environment?.version || 'unknown',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  /**
   * Sync products to WooCommerce (placeholder for future implementation)
   */
  async syncProducts(
    orgId: string,
    _userId: string,
    userRole: string
  ): Promise<Result<WooCommerceSyncResult, AppError>> {
    if (userRole !== 'admin' && userRole !== 'engineer') {
      return err(new ForbiddenError('Only admins and engineers can sync'));
    }

    const { data: integration } = await this.supabase
      .from('organization_integrations')
      .select('*')
      .eq('org_id', orgId)
      .eq('integration_type', 'woocommerce')
      .single();

    if (!integration) {
      return err(new ValidationError('WooCommerce integration not configured'));
    }

    // Product sync not yet implemented
    return ok({
      success: true,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      message: 'Product sync not yet implemented - coming soon!',
    });
  }

  /**
   * Disconnect WooCommerce integration
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
      .eq('integration_type', 'woocommerce');

    return ok(undefined);
  }

  /**
   * List saved WooCommerce configurations
   */
  async listConfigs(orgId: string): Promise<SavedWooCommerceConfig[]> {
    const { data } = await this.supabase
      .from('woocommerce_saved_configs')
      .select(
        'id, name, description, store_url, store_name, color, is_active, last_tested_at, last_test_success, created_at'
      )
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('name');

    return (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      storeUrl: row.store_url,
      storeName: row.store_name,
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
      .from('woocommerce_saved_configs')
      .select('*')
      .eq('id', configId)
      .eq('org_id', orgId)
      .single();

    if (!config) {
      return err(new NotFoundError('Configuration', configId));
    }

    const testResult = await this.testConnection(
      config.store_url,
      config.consumer_key_encrypted,
      config.consumer_secret_encrypted
    );

    await this.supabase.from('organization_integrations').upsert(
      {
        org_id: orgId,
        integration_type: 'woocommerce',
        settings: {
          store_url: config.store_url,
          store_name: testResult.storeName || config.store_name,
          config_id: config.id,
          config_name: config.name,
        },
        credentials_encrypted: JSON.stringify({
          consumer_key: config.consumer_key_encrypted,
          consumer_secret: config.consumer_secret_encrypted,
        }),
        is_active: true,
        is_connected: testResult.success,
        last_connected_at: testResult.success ? new Date().toISOString() : null,
        last_error: testResult.error,
        updated_by: userId,
      },
      { onConflict: 'org_id,integration_type' }
    );

    await this.supabase
      .from('woocommerce_saved_configs')
      .update({
        last_tested_at: new Date().toISOString(),
        last_test_success: testResult.success,
        store_name: testResult.storeName || config.store_name,
        wc_version: testResult.version || config.wc_version,
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
