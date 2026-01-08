/**
 * Extension-Scoped Storage
 * 
 * Provides key-value storage for extensions, isolated per org and extension.
 * Data is stored in the extension_storage table in the org's Supabase database.
 * 
 * @module extensions/storage
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ═══════════════════════════════════════════════════════════════════════════════
// STORAGE LIMITS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Storage limits per extension.
 */
export const STORAGE_LIMITS = {
  /** Maximum number of keys per extension */
  MAX_KEYS: 1000,
  /** Maximum key length in characters */
  MAX_KEY_LENGTH: 256,
  /** Maximum value size in bytes (100KB) */
  MAX_VALUE_SIZE: 100 * 1024
} as const

// ═══════════════════════════════════════════════════════════════════════════════
// EXTENSION STORAGE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extension-scoped key-value storage.
 * 
 * Provides CRUD operations for extension data, isolated per org and extension.
 * 
 * @example
 * ```typescript
 * const storage = new ExtensionStorage(supabase, orgId, extensionId);
 * 
 * // Store data
 * await storage.set('config', { theme: 'dark' });
 * 
 * // Retrieve data
 * const config = await storage.get<{ theme: string }>('config');
 * 
 * // List keys
 * const keys = await storage.list('config.');
 * 
 * // Delete data
 * await storage.delete('config');
 * ```
 */
export class ExtensionStorage {
  private supabase: SupabaseClient
  private orgId: string
  private extensionId: string

  constructor(
    supabase: SupabaseClient,
    orgId: string,
    extensionId: string
  ) {
    this.supabase = supabase
    this.orgId = orgId
    this.extensionId = extensionId
  }

  /**
   * Get a value by key.
   * 
   * @param key - Storage key
   * @returns Value or undefined if not found
   */
  async get<T>(key: string): Promise<T | undefined> {
    this.validateKey(key)

    const { data, error } = await this.supabase
      .from('extension_storage')
      .select('value')
      .eq('org_id', this.orgId)
      .eq('extension_id', this.extensionId)
      .eq('key', key)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return undefined
      }
      throw new StorageError(`Failed to get key ${key}: ${error.message}`)
    }

    return data?.value as T
  }

  /**
   * Set a value for a key.
   * 
   * @param key - Storage key
   * @param value - Value to store (must be JSON-serializable)
   */
  async set<T>(key: string, value: T): Promise<void> {
    this.validateKey(key)
    this.validateValue(value)

    // Check key count limit
    const count = await this.getKeyCount()
    const existing = await this.get(key)
    
    if (!existing && count >= STORAGE_LIMITS.MAX_KEYS) {
      throw new StorageError(
        `Storage limit exceeded: maximum ${STORAGE_LIMITS.MAX_KEYS} keys per extension`
      )
    }

    const { error } = await this.supabase
      .from('extension_storage')
      .upsert({
        org_id: this.orgId,
        extension_id: this.extensionId,
        key,
        value,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'org_id,extension_id,key'
      })

    if (error) {
      throw new StorageError(`Failed to set key ${key}: ${error.message}`)
    }
  }

  /**
   * Delete a key.
   * 
   * @param key - Storage key to delete
   */
  async delete(key: string): Promise<void> {
    this.validateKey(key)

    const { error } = await this.supabase
      .from('extension_storage')
      .delete()
      .eq('org_id', this.orgId)
      .eq('extension_id', this.extensionId)
      .eq('key', key)

    if (error) {
      throw new StorageError(`Failed to delete key ${key}: ${error.message}`)
    }
  }

  /**
   * List all keys, optionally filtered by prefix.
   * 
   * @param prefix - Optional key prefix to filter by
   * @returns Array of matching keys
   */
  async list(prefix?: string): Promise<string[]> {
    let query = this.supabase
      .from('extension_storage')
      .select('key')
      .eq('org_id', this.orgId)
      .eq('extension_id', this.extensionId)

    if (prefix) {
      query = query.like('key', `${prefix}%`)
    }

    const { data, error } = await query.order('key')

    if (error) {
      throw new StorageError(`Failed to list keys: ${error.message}`)
    }

    return data?.map(row => row.key) ?? []
  }

  /**
   * Get the number of keys stored.
   */
  async getKeyCount(): Promise<number> {
    const { count, error } = await this.supabase
      .from('extension_storage')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', this.orgId)
      .eq('extension_id', this.extensionId)

    if (error) {
      throw new StorageError(`Failed to get key count: ${error.message}`)
    }

    return count ?? 0
  }

  /**
   * Clear all storage for this extension.
   */
  async clear(): Promise<void> {
    const { error } = await this.supabase
      .from('extension_storage')
      .delete()
      .eq('org_id', this.orgId)
      .eq('extension_id', this.extensionId)

    if (error) {
      throw new StorageError(`Failed to clear storage: ${error.message}`)
    }
  }

  /**
   * Validate storage key.
   */
  private validateKey(key: string): void {
    if (!key || typeof key !== 'string') {
      throw new StorageError('Key must be a non-empty string')
    }

    if (key.length > STORAGE_LIMITS.MAX_KEY_LENGTH) {
      throw new StorageError(
        `Key too long: max ${STORAGE_LIMITS.MAX_KEY_LENGTH} characters`
      )
    }

    // Only allow alphanumeric, dots, dashes, underscores
    if (!/^[a-zA-Z0-9._-]+$/.test(key)) {
      throw new StorageError(
        'Key must only contain alphanumeric characters, dots, dashes, and underscores'
      )
    }
  }

  /**
   * Validate storage value.
   */
  private validateValue(value: unknown): void {
    const serialized = JSON.stringify(value)
    const size = new Blob([serialized]).size

    if (size > STORAGE_LIMITS.MAX_VALUE_SIZE) {
      throw new StorageError(
        `Value too large: ${size} bytes (max ${STORAGE_LIMITS.MAX_VALUE_SIZE} bytes)`
      )
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STORAGE ERROR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Storage operation error.
 */
export class StorageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StorageError'
  }
}
