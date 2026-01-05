/**
 * WooCommerce Integration Helpers
 * 
 * Provides functions for testing WooCommerce connections and fetching product data.
 */

import type { WooCommerceConnectionResult } from '../types'

/**
 * Normalize WooCommerce store URL - ensure https:// prefix, remove trailing slashes
 */
export function normalizeWooCommerceUrl(url: string): string {
  let normalized = url.trim()
  // Remove trailing slashes
  normalized = normalized.replace(/\/+$/, '')
  // Add https:// if no protocol specified
  if (!normalized.match(/^https?:\/\//i)) {
    normalized = 'https://' + normalized
  }
  return normalized
}

/**
 * Test WooCommerce connection using REST API
 */
export async function testWooCommerceConnection(
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string
): Promise<WooCommerceConnectionResult> {
  const normalizedUrl = normalizeWooCommerceUrl(storeUrl)
  
  try {
    // WooCommerce REST API uses Basic Auth with consumer key:secret
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')
    
    // Test connection by fetching system status
    const response = await fetch(`${normalizedUrl}/wp-json/wc/v3/system_status`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(15000)
    })
    
    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: 'Invalid consumer key or secret' }
      }
      if (response.status === 404) {
        // Try alternative endpoint for older WC versions
        const altResponse = await fetch(`${normalizedUrl}/wp-json/wc/v3/`, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json'
          },
          signal: AbortSignal.timeout(10000)
        })
        
        if (altResponse.ok) {
          const altData = await altResponse.json() as { version?: string }
          return {
            success: true,
            store_name: normalizedUrl.replace(/^https?:\/\//, '').split('/')[0],
            version: altData.version || 'Unknown'
          }
        }
        return { success: false, error: 'WooCommerce REST API not found. Make sure permalinks are enabled.' }
      }
      const errorText = await response.text()
      return { success: false, error: `HTTP ${response.status}: ${errorText.substring(0, 200)}` }
    }
    
    const data = await response.json() as {
      environment?: { site_url?: string; wc_version?: string };
      settings?: { store_name?: string };
      version?: string;
    }
    
    // Extract store info from system status
    const environment = data.environment || {}
    const settings = data.settings || {}
    
    return {
      success: true,
      store_name: settings.store_name || environment.site_url || normalizedUrl,
      version: environment.wc_version || data.version || 'Unknown'
    }
  } catch (err) {
    if (err instanceof Error) {
      if (err.name === 'AbortError' || err.message.includes('timeout')) {
        return { success: false, error: 'Connection timeout - check if the store URL is correct' }
      }
      if (err.message.includes('fetch')) {
        return { success: false, error: 'Could not connect to store - check the URL' }
      }
    }
    return { success: false, error: String(err) }
  }
}
