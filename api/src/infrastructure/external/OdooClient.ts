/**
 * Odoo XML-RPC/JSON-RPC Client
 *
 * Provides resilient access to Odoo ERP with circuit breaker protection.
 */

import { CircuitBreaker } from './CircuitBreaker';
import { AppError } from '../../core/errors/AppError';
import { ErrorCode } from '../../core/errors/ErrorCodes';

export interface OdooClientConfig {
  url: string;
  database: string;
  username: string;
  apiKey: string;
}

export interface OdooConnectionResult {
  success: boolean;
  uid?: number;
  userName?: string;
  version?: string;
  error?: string;
}

interface OdooRpcResponse {
  error?: { message: string; data?: unknown };
  result?: unknown;
}

export class OdooClient {
  private readonly circuitBreaker: CircuitBreaker;
  private readonly url: string;
  private readonly database: string;
  private readonly username: string;
  private readonly apiKey: string;

  constructor(config: OdooClientConfig) {
    this.url = normalizeOdooUrl(config.url);
    this.database = config.database;
    this.username = config.username;
    this.apiKey = config.apiKey;

    this.circuitBreaker = new CircuitBreaker({
      threshold: 3,
      resetTimeout: 60000,
      name: 'OdooClient',
    });
  }

  /**
   * Test connection to Odoo
   */
  async testConnection(): Promise<OdooConnectionResult> {
    return this.circuitBreaker.execute(async () => {
      const uid = await this.authenticate();
      if (!uid) {
        return { success: false, error: 'Invalid credentials' };
      }

      const version = await this.getVersion();
      return {
        success: true,
        uid: uid as number,
        userName: this.username,
        version,
      };
    });
  }

  /**
   * Authenticate with Odoo and get user ID
   */
  async authenticate(): Promise<number | false> {
    const result = await this.jsonRpc('common', 'authenticate', [
      this.database,
      this.username,
      this.apiKey,
      {},
    ]);
    return result as number | false;
  }

  /**
   * Get Odoo server version
   */
  async getVersion(): Promise<string> {
    const result = await this.jsonRpc('common', 'version', []);
    return (result as { server_version?: string })?.server_version || 'unknown';
  }

  /**
   * Search and read records
   */
  async searchRead<T>(
    uid: number,
    model: string,
    domain: unknown[][],
    options: { fields?: string[]; limit?: number; offset?: number } = {}
  ): Promise<T[]> {
    return this.circuitBreaker.execute(async () => {
      const result = await this.jsonRpc('object', 'execute_kw', [
        this.database,
        uid,
        this.apiKey,
        model,
        'search_read',
        [domain],
        {
          fields: options.fields,
          limit: options.limit ?? 100,
          offset: options.offset ?? 0,
        },
      ]);
      return (result as T[]) || [];
    });
  }

  /**
   * Fetch suppliers from Odoo
   */
  async fetchSuppliers(uid: number): Promise<OdooSupplier[]> {
    return this.searchRead<OdooSupplier>(
      uid,
      'res.partner',
      [['supplier_rank', '>', 0]],
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
          'street2',
          'city',
          'zip',
          'state_id',
          'country_id',
          'active',
        ],
        limit: 1000,
      }
    );
  }

  /**
   * Make a JSON-RPC call to Odoo
   */
  private async jsonRpc(
    service: string,
    method: string,
    params: unknown[]
  ): Promise<unknown> {
    const response = await fetch(`${this.url}/jsonrpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service,
          method,
          args: params,
        },
        id: Date.now(),
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new AppError(
        ErrorCode.ODOO_CONNECTION_FAILED,
        `HTTP ${response.status}`,
        502
      );
    }

    const data = (await response.json()) as OdooRpcResponse;

    if (data.error) {
      throw new AppError(
        ErrorCode.ODOO_CONNECTION_FAILED,
        data.error.message || 'Odoo RPC error',
        502
      );
    }

    return data.result;
  }
}

/**
 * Odoo supplier/partner record
 */
export interface OdooSupplier {
  id: number;
  name: string;
  ref: string | false;
  email: string | false;
  phone: string | false;
  mobile: string | false;
  website: string | false;
  street: string | false;
  street2: string | false;
  city: string | false;
  zip: string | false;
  state_id: [number, string] | false;
  country_id: [number, string] | false;
  active: boolean;
}

/**
 * Normalize Odoo URL - ensure https:// prefix, remove trailing slashes
 */
function normalizeOdooUrl(url: string): string {
  let normalized = url.trim();
  normalized = normalized.replace(/\/+$/, '');
  if (!normalized.match(/^https?:\/\//i)) {
    normalized = 'https://' + normalized;
  }
  return normalized;
}
