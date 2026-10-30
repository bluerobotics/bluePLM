// Where a file's content lives in the `vault` storage bucket.
//
// Content is addressed by its SHA-256: `${orgId}/${hash.slice(0, 2)}/${hash}`, with an older flat
// layout `${orgId}/${hash}` still holding some objects (src/lib/storage.ts reads both). The hash
// is checked to be hex so a malformed row can never form a path outside the org's prefix.

export const VAULT_BUCKET = 'vault'
/** Signed download links live this long; the browser starts the download at once. */
export const SIGNED_URL_SECONDS = 60

const HASH_PATTERN = /^[0-9a-f]{16,128}$/i
const ORG_ID_PATTERN = /^[0-9a-f-]{36}$/i

/** Candidate object paths, sharded first, or [] when the org id or hash is not well formed. */
export function storagePathCandidates(orgId: string | null | undefined, hash: string | null | undefined): string[] {
  if (!orgId || !hash || !ORG_ID_PATTERN.test(orgId) || !HASH_PATTERN.test(hash)) return []
  return [`${orgId}/${hash.slice(0, 2)}/${hash}`, `${orgId}/${hash}`]
}

/**
 * The name the browser saves the download under. Path separators and control characters are
 * replaced so the name cannot point anywhere but the downloads folder, and bidi and zero-width
 * characters are dropped so a name like `invoice‮fdp.exe` cannot pose as a PDF.
 */
export function downloadFileName(fileName: string | null | undefined, fallback: string): string {
  const cleaned = (fileName ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[/\\\u0000-\u001f\u007f]/g, '_')
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, '')
    .trim()
  return cleaned || fallback
}
