/**
 * WooCommerce REST API Client
 *
 * Provides resilient access to WooCommerce with circuit breaker protection.
 */

import { CircuitBreaker } from './CircuitBreaker';
import { AppError } from '../../core/errors/AppError';
import { ErrorCode } from '../../core/errors/ErrorCodes';

export interface WooCommerceClientConfig {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

export interface WooCommerceConnectionResult {
  success: boolean;
  storeName?: string;
  version?: string;
  error?: string;
}

interface WooCommerceSystemStatus {
  environment?: {
    site_url?: string;
    wc_version?: string;
    version?: string;
  };
  settings?: {
    store_name?: string;
  };
}

export class WooCommerceClient {
  private readonly circuitBreaker: CircuitBreaker;
  private readonly storeUrl: string;
  private readonly authHeader: string;

  constructor(config: WooCommerceClientConfig) {
    this.storeUrl = normalizeWooCommerceUrl(config.storeUrl);
    this.authHeader = `Basic ${Buffer.from(
      `${config.consumerKey}:${config.consumerSecret}`
    ).toString('base64')}`;

    this.circuitBreaker = new CircuitBreaker({
      threshold: 3,
      resetTimeout: 60000,
      name: 'WooCommerceClient',
    });
  }

  /**
   * Test connection to WooCommerce
   */
  async testConnection(): Promise<WooCommerceConnectionResult> {
    return this.circuitBreaker.execute(async () => {
      try {
        const systemStatus = await this.get<WooCommerceSystemStatus>(
          'system_status'
        );

        return {
          success: true,
          storeName:
            systemStatus.settings?.store_name ||
            systemStatus.environment?.site_url ||
            this.storeUrl,
          version:
            systemStatus.environment?.wc_version ||
            systemStatus.environment?.version ||
            'unknown',
        };
      } catch (error) {
        if (error instanceof AppError) {
          return { success: false, error: error.message };
        }
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Connection failed',
        };
      }
    });
  }

  /**
   * Make a GET request to WooCommerce REST API
   */
  async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.storeUrl}/wp-json/wc/v3/${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      this.handleHttpError(response.status);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Make a POST request to WooCommerce REST API
   */
  async post<T>(endpoint: string, data: unknown): Promise<T> {
    const response = await fetch(
      `${this.storeUrl}/wp-json/wc/v3/${endpoint}`,
      {
        method: 'POST',
        headers: {
          Authorization: this.authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!response.ok) {
      this.handleHttpError(response.status);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Make a PUT request to WooCommerce REST API
   */
  async put<T>(endpoint: string, data: unknown): Promise<T> {
    const response = await fetch(
      `${this.storeUrl}/wp-json/wc/v3/${endpoint}`,
      {
        method: 'PUT',
        headers: {
          Authorization: this.authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!response.ok) {
      this.handleHttpError(response.status);
    }

    return response.json() as Promise<T>;
  }

  private handleHttpError(status: number): never {
    if (status === 401) {
      throw new AppError(
        ErrorCode.WOOCOMMERCE_CONNECTION_FAILED,
        'Invalid consumer key or secret',
        401
      );
    }
    if (status === 404) {
      throw new AppError(
        ErrorCode.WOOCOMMERCE_CONNECTION_FAILED,
        'WooCommerce REST API not found. Make sure permalinks are enabled.',
        404
      );
    }
    throw new AppError(
      ErrorCode.WOOCOMMERCE_CONNECTION_FAILED,
      `HTTP ${status}`,
      502
    );
  }
}

/**
 * Normalize WooCommerce store URL - ensure https://, remove trailing slashes
 */
function normalizeWooCommerceUrl(url: string): string {
  let normalized = url.trim();
  normalized = normalized.replace(/\/+$/, '');
  if (!normalized.match(/^https?:\/\//i)) {
    normalized = 'https://' + normalized;
  }
  return normalized;
}
