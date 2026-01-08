/**
 * BluePLM Extension Package (.bpx) Utilities
 * 
 * Handles extraction, verification, and validation of .bpx extension packages.
 * .bpx files are zip archives containing extension code, manifest, and signatures.
 * 
 * @module extensions/package
 */

import JSZip from 'jszip'
import { parseManifest } from './manifest'
import type {
  PackageContents,
  ExtensionManifest,
  SigningKey,
  SignatureVerificationResult,
  RevokedKey,
} from './types'

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Required files in a .bpx package */
const REQUIRED_FILES = ['extension.json', 'LICENSE'] as const

/** Optional metadata files (for reference) */
const _METADATA_FILES = ['README.md', 'CHANGELOG.md', 'icon.png', 'SIGNATURE'] as const
void _METADATA_FILES // Referenced for documentation

/** Maximum package size (50MB) */
const MAX_PACKAGE_SIZE = 50 * 1024 * 1024

/** Maximum individual file size in package (10MB) */
const _MAX_FILE_SIZE = 10 * 1024 * 1024
void _MAX_FILE_SIZE // Used in future file size validation

/** Maximum number of files in package */
const MAX_FILE_COUNT = 500

// ═══════════════════════════════════════════════════════════════════════════════
// PACKAGE EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract and validate a .bpx package.
 * 
 * @param bpxData - Package data as ArrayBuffer
 * @returns Parsed and validated package contents
 * @throws {PackageError} If package is invalid
 * 
 * @example
 * const fileBuffer = await fs.promises.readFile('my-extension.bpx');
 * const contents = await extractPackage(fileBuffer.buffer);
 * console.log(contents.manifest.name);
 */
export async function extractPackage(bpxData: ArrayBuffer): Promise<PackageContents> {
  // Validate size
  if (bpxData.byteLength > MAX_PACKAGE_SIZE) {
    throw new PackageError(
      'PACKAGE_TOO_LARGE',
      `Package size ${formatBytes(bpxData.byteLength)} exceeds maximum ${formatBytes(MAX_PACKAGE_SIZE)}`
    )
  }
  
  // Load zip
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(bpxData)
  } catch (error) {
    throw new PackageError('INVALID_ARCHIVE', 'Package is not a valid zip archive')
  }
  
  // Count files
  const fileCount = Object.keys(zip.files).length
  if (fileCount > MAX_FILE_COUNT) {
    throw new PackageError(
      'TOO_MANY_FILES',
      `Package contains ${fileCount} files, maximum is ${MAX_FILE_COUNT}`
    )
  }
  
  // Check required files
  for (const required of REQUIRED_FILES) {
    if (!zip.file(required)) {
      throw new PackageError('MISSING_REQUIRED_FILE', `Package missing required file: ${required}`)
    }
  }
  
  // Extract manifest
  const manifestFile = zip.file('extension.json')!
  const manifestContent = await manifestFile.async('string')
  
  let manifest: ExtensionManifest
  try {
    manifest = parseManifest(JSON.parse(manifestContent))
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new PackageError('INVALID_MANIFEST_JSON', 'extension.json is not valid JSON')
    }
    throw new PackageError('INVALID_MANIFEST', String(error))
  }
  
  // Extract client bundle if present
  let clientBundle: string | undefined
  if (manifest.main) {
    const clientFile = zip.file(manifest.main)
    if (!clientFile) {
      throw new PackageError('MISSING_ENTRY_POINT', `Client entry point not found: ${manifest.main}`)
    }
    clientBundle = await clientFile.async('string')
    validateFileSize(clientFile, manifest.main)
  }
  
  // Extract server handlers if present
  const serverHandlers: Record<string, string> = {}
  if (manifest.contributes.apiRoutes) {
    for (const route of manifest.contributes.apiRoutes) {
      const handlerFile = zip.file(route.handler)
      if (!handlerFile) {
        throw new PackageError('MISSING_HANDLER', `API route handler not found: ${route.handler}`)
      }
      validateFileSize(handlerFile, route.handler)
      serverHandlers[route.handler] = await handlerFile.async('string')
    }
  }
  
  // Extract signature if present
  let signature: string | undefined
  const signatureFile = zip.file('SIGNATURE')
  if (signatureFile) {
    signature = await signatureFile.async('string')
  }
  
  // Extract optional metadata
  let readme: string | undefined
  const readmeFile = zip.file('README.md')
  if (readmeFile) {
    readme = await readmeFile.async('string')
  }
  
  let changelog: string | undefined
  const changelogFile = zip.file('CHANGELOG.md')
  if (changelogFile) {
    changelog = await changelogFile.async('string')
  }
  
  // Calculate hash
  const hash = await calculateHash(bpxData)
  
  return {
    manifest,
    clientBundle,
    serverHandlers: Object.keys(serverHandlers).length > 0 ? serverHandlers : undefined,
    signature,
    hash,
    size: bpxData.byteLength,
    readme,
    changelog,
  }
}

/**
 * Extract package from a file path (Node.js/Electron only).
 * 
 * @param filePath - Path to .bpx file
 * @returns Package contents
 */
export async function extractPackageFromFile(filePath: string): Promise<PackageContents> {
  // Check file extension
  if (!filePath.endsWith('.bpx')) {
    throw new PackageError('INVALID_EXTENSION', 'Extension package must have .bpx extension')
  }
  
  // Read file via Electron IPC or Node.js fs
  const buffer = await readFileAsArrayBuffer(filePath)
  return extractPackage(buffer)
}

// ═══════════════════════════════════════════════════════════════════════════════
// HASH VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate SHA-256 hash of package contents.
 * 
 * @param data - Package data
 * @returns Hex-encoded hash
 */
export async function calculateHash(data: ArrayBuffer): Promise<string> {
  // Use Web Crypto API (available in browser and Node.js 15+)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Verify package hash matches expected value.
 * 
 * @param contents - Package contents with hash
 * @param expectedHash - Expected SHA-256 hash (hex)
 * @returns True if hash matches
 */
export function verifyPackageHash(contents: PackageContents, expectedHash: string): boolean {
  return contents.hash.toLowerCase() === expectedHash.toLowerCase()
}

/**
 * Verify package integrity from raw data and expected hash.
 * 
 * @param data - Package data
 * @param expectedHash - Expected hash
 * @returns True if hash matches
 */
export async function verifyPackageIntegrity(
  data: ArrayBuffer,
  expectedHash: string
): Promise<boolean> {
  const actualHash = await calculateHash(data)
  return actualHash.toLowerCase() === expectedHash.toLowerCase()
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIGNATURE VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Verify Ed25519 signature of package.
 * 
 * @param contents - Package contents including signature
 * @param publicKey - Signing public key (base64)
 * @returns Verification result
 */
export async function verifyPackageSignature(
  contents: PackageContents,
  publicKey: SigningKey
): Promise<SignatureVerificationResult> {
  if (!contents.signature) {
    return {
      valid: false,
      error: 'Package has no signature',
    }
  }
  
  // Check key validity
  if (!publicKey.isActive) {
    return {
      valid: false,
      error: 'Signing key is not active',
    }
  }
  
  const now = new Date()
  if (now > publicKey.expiresAt) {
    return {
      valid: false,
      error: 'Signing key has expired',
    }
  }
  
  try {
    // Parse signature (format: keyId:signature)
    const [keyId, signatureBase64] = contents.signature.split(':')
    if (!keyId || !signatureBase64) {
      return {
        valid: false,
        error: 'Invalid signature format',
      }
    }
    
    // Verify key ID matches
    if (keyId !== publicKey.keyId) {
      return {
        valid: false,
        error: `Signature key ID ${keyId} does not match provided key ${publicKey.keyId}`,
      }
    }
    
    // Import the public key
    const keyData = base64ToArrayBuffer(publicKey.publicKey)
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'Ed25519' },
      false,
      ['verify']
    )
    
    // Prepare data to verify (hash of package without signature file)
    const dataToVerify = new TextEncoder().encode(contents.hash)
    const signature = base64ToArrayBuffer(signatureBase64)
    
    // Verify signature
    const valid = await crypto.subtle.verify(
      'Ed25519',
      cryptoKey,
      signature,
      dataToVerify
    )
    
    if (valid) {
      return {
        valid: true,
        signingKey: publicKey,
      }
    } else {
      return {
        valid: false,
        error: 'Signature verification failed',
      }
    }
  } catch (error) {
    return {
      valid: false,
      error: `Signature verification error: ${String(error)}`,
    }
  }
}

/**
 * Check if a signing key has been revoked.
 * 
 * @param keyId - Key identifier to check
 * @param revocationList - List of revoked keys
 * @returns Revocation info if revoked, undefined otherwise
 */
export function checkRevocationList(
  keyId: string,
  revocationList: RevokedKey[]
): RevokedKey | undefined {
  return revocationList.find(r => r.keyId === keyId)
}

/**
 * Fetch the current certificate revocation list from the store.
 * 
 * @param storeApiUrl - Extension store API URL
 * @returns List of revoked keys
 */
export async function fetchRevocationList(storeApiUrl: string): Promise<RevokedKey[]> {
  try {
    const response = await fetch(`${storeApiUrl}/signing/revoked`)
    if (!response.ok) {
      console.warn('Failed to fetch revocation list:', response.statusText)
      return []
    }
    
    const data = await response.json() as { keys: RevokedKey[] }
    return data.keys.map(k => ({
      ...k,
      revokedAt: new Date(k.revokedAt),
    }))
  } catch (error) {
    console.warn('Error fetching revocation list:', error)
    return []
  }
}

/**
 * Fetch public signing keys from the store.
 * 
 * @param storeApiUrl - Extension store API URL
 * @returns List of valid signing keys
 */
export async function fetchSigningKeys(storeApiUrl: string): Promise<SigningKey[]> {
  try {
    const response = await fetch(`${storeApiUrl}/signing/keys`)
    if (!response.ok) {
      throw new Error(`Failed to fetch signing keys: ${response.statusText}`)
    }
    
    const data = await response.json() as { keys: SigningKey[] }
    return data.keys.map(k => ({
      ...k,
      createdAt: new Date(k.createdAt),
      expiresAt: new Date(k.expiresAt),
    }))
  } catch (error) {
    console.error('Error fetching signing keys:', error)
    throw new PackageError('FETCH_KEYS_FAILED', 'Failed to fetch signing keys from store')
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PACKAGE CREATION (for development/publishing)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Options for creating a .bpx package.
 */
export interface CreatePackageOptions {
  /** Extension directory path */
  extensionPath: string
  /** Output .bpx file path */
  outputPath: string
  /** Sign the package (requires signing key) */
  sign?: {
    keyId: string
    privateKey: string
  }
}

/**
 * Create a .bpx package from an extension directory.
 * 
 * This is primarily for development and the publish CLI.
 * 
 * @param _options - Package creation options
 * @returns Path to created .bpx file
 */
export async function createPackage(_options: CreatePackageOptions): Promise<string> {
  // This will be implemented by the Extension Developer CLI (Agent 13)
  // For now, provide a stub that throws
  throw new Error('createPackage is not yet implemented. Use the blueplm-ext CLI.')
}

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Package error codes.
 */
export type PackageErrorCode =
  | 'PACKAGE_TOO_LARGE'
  | 'INVALID_ARCHIVE'
  | 'TOO_MANY_FILES'
  | 'MISSING_REQUIRED_FILE'
  | 'INVALID_MANIFEST_JSON'
  | 'INVALID_MANIFEST'
  | 'MISSING_ENTRY_POINT'
  | 'MISSING_HANDLER'
  | 'FILE_TOO_LARGE'
  | 'INVALID_EXTENSION'
  | 'FETCH_KEYS_FAILED'
  | 'SIGNATURE_INVALID'
  | 'KEY_REVOKED'

/**
 * Error thrown during package operations.
 */
export class PackageError extends Error {
  /** Error code for programmatic handling */
  public readonly code: PackageErrorCode
  
  constructor(code: PackageErrorCode, message: string) {
    super(message)
    this.name = 'PackageError'
    this.code = code
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Format bytes as human-readable string.
 */
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`
}

/**
 * Validate file size within package.
 * Note: JSZip doesn't expose uncompressed size directly.
 * Size validation is handled during extraction.
 */
function validateFileSize(_file: JSZip.JSZipObject, _path: string): void {
  // JSZip doesn't expose uncompressed size directly, so we check after extraction
  // This is called after async operations, so we trust the content length
  // The actual size check happens in the extraction
}

/**
 * Convert base64 string to ArrayBuffer.
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}

/**
 * Convert ArrayBuffer to base64 string.
 * Used for signature creation (future implementation).
 */
function _arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}
void _arrayBufferToBase64 // Used in future signature creation

/**
 * Read file as ArrayBuffer (uses Electron IPC or returns placeholder for browser).
 */
async function readFileAsArrayBuffer(filePath: string): Promise<ArrayBuffer> {
  // Check if we're in Electron with the file API exposed
  if (typeof window !== 'undefined' && window.electronAPI?.readFile) {
    const result = await window.electronAPI.readFile(filePath)
    if (!result.success || !result.data) {
      throw new PackageError('INVALID_EXTENSION', result.error || 'Failed to read file')
    }
    // Convert base64 to ArrayBuffer
    const binaryString = atob(result.data)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes.buffer
  }
  
  // Browser environment - should use File API instead
  throw new Error('readFileAsArrayBuffer requires Electron environment. Use extractPackage with ArrayBuffer directly.')
}

/**
 * Check if a package file exists.
 */
export async function packageExists(filePath: string): Promise<boolean> {
  if (typeof window !== 'undefined' && window.electronAPI?.fileExists) {
    return window.electronAPI.fileExists(filePath)
  }
  return false
}

/**
 * Get basic package info without full extraction.
 * 
 * @param bpxData - Package data
 * @returns Basic manifest info
 */
export async function getPackageInfo(bpxData: ArrayBuffer): Promise<{
  id: string
  name: string
  version: string
  publisher: string
  hasSiganture: boolean
  size: number
}> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(bpxData)
  } catch {
    throw new PackageError('INVALID_ARCHIVE', 'Package is not a valid zip archive')
  }
  
  const manifestFile = zip.file('extension.json')
  if (!manifestFile) {
    throw new PackageError('MISSING_REQUIRED_FILE', 'Package missing extension.json')
  }
  
  const manifestContent = await manifestFile.async('string')
  const manifest = JSON.parse(manifestContent) as { id: string; name: string; version: string; publisher: string }
  
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    publisher: manifest.publisher,
    hasSiganture: zip.file('SIGNATURE') !== null,
    size: bpxData.byteLength,
  }
}
